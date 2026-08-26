import {
  db,
  ensureSettings,
  nowIso,
  type SyncDevice,
  type SyncProvider,
} from '../db/schema';
import { serializeJsonl } from './apply';
import { getSyncAuth, getValidAccessToken, hasUsableSession } from './auth';
import { carrierFor } from './carrier';
import {
  defaultDeviceName,
  devicesFromChangePaths,
  parseBookConfig,
  parseRoster,
  upsertRoster,
  type DeviceRoster,
} from './identity';
import { hasRanchServer, pushToRanchServer } from './ranchServer';
import { applyRemoteFile } from './remoteApply';
import {
  buildSnapshot,
  clearHerdForReplace,
  localHerdIsEmpty,
  mergeSnapshot,
  parseSnapshot,
} from './snapshot';
import {
  CONFIG_PATH,
  DEVICES_PATH,
  SNAPSHOT_PATH,
  emitSyncEvent,
  type ChangeLine,
  type CloudCarrier,
  type CloudProvider,
  type SyncRunResult,
} from './types';

export type SyncStatus = {
  online: boolean;
  pendingCount: number;
  lastSyncedAt?: string;
  provider: SyncProvider;
  message: string;
  accountEmail?: string;
  conflictCount: number;
  needsAuth: boolean;
  connected: boolean;
  deviceCount: number;
  bookId?: string;
};

let inflight: Promise<SyncRunResult> | null = null;
let lastError: string | undefined;

function isCloudProvider(value: SyncProvider): value is CloudProvider {
  return value === 'google-drive' || value === 'dropbox';
}

function providerLabel(provider: SyncProvider): string {
  if (provider === 'google-drive') return 'Google Drive';
  if (provider === 'dropbox') return 'Dropbox';
  return 'cloud';
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const settings = await ensureSettings();
  const pendingCount = await db.outbox.filter((change) => !change.syncedAt).count();
  const conflictCount = await db.syncConflicts.count();
  const deviceCount = await db.syncDevices.count();
  const online = typeof navigator !== 'undefined' ? navigator.onLine : false;
  const auth = await getSyncAuth();
  const connected = await hasUsableSession();
  const ranchConfigured = hasRanchServer();
  const needsAuth = isCloudProvider(settings.syncProvider) && !connected && !ranchConfigured;
  const label = providerLabel(settings.syncProvider);
  const others = Math.max(0, deviceCount - 1);

  let message = 'Offline — changes saved on this device';
  if (!online) {
    message = 'Offline — changes saved on this device';
  } else if (lastError) {
    message = lastError;
  } else if (settings.syncProvider === 'none') {
    if (ranchConfigured && settings.lastSyncedAt) {
      message = `Online — ranch database last copied ${formatWhen(settings.lastSyncedAt)}`;
    } else if (ranchConfigured) {
      message = 'Online — ranch database configured';
    } else {
      message = 'Online — connect Drive, Dropbox, or a ranch API in Settings';
    }
  } else if (isCloudProvider(settings.syncProvider) && !connected) {
    message = ranchConfigured
      ? `Online — reconnect ${label}, or sync the ranch database`
      : `Online — reconnect ${label} in Settings`;
  } else if (pendingCount > 0) {
    message = `${pendingCount} change(s) waiting to sync to ${label}`;
  } else if (others > 0 && settings.lastSyncedAt) {
    message = `Online — shared book, ${others + 1} devices, last synced ${formatWhen(settings.lastSyncedAt)}`;
  } else if (settings.lastSyncedAt) {
    message = `Online — last synced ${formatWhen(settings.lastSyncedAt)}`;
  } else {
    message = `Online — connected to ${label}`;
  }

  return {
    online,
    pendingCount,
    lastSyncedAt: settings.lastSyncedAt,
    provider: settings.syncProvider,
    message,
    accountEmail: auth?.accountEmail,
    conflictCount,
    needsAuth,
    connected,
    deviceCount,
    bookId: settings.bookId,
  };
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function markOutboxSynced(ids: string[]): Promise<void> {
  const now = nowIso();
  await db.transaction('rw', db.outbox, db.settings, async () => {
    for (const id of ids) {
      await db.outbox.update(id, { syncedAt: now });
    }
    await db.settings.update(1, { lastSyncedAt: now });
  });
}

async function cacheRoster(roster: DeviceRoster, thisDeviceId: string): Promise<void> {
  const rows: SyncDevice[] = roster.devices.map((device) => ({
    ...device,
    isThisDevice: device.deviceId === thisDeviceId,
  }));
  await db.transaction('rw', db.syncDevices, async () => {
    await db.syncDevices.clear();
    if (rows.length > 0) await db.syncDevices.bulkPut(rows);
  });
}

async function ensureBook(
  carrier: CloudCarrier,
): Promise<{ bookId: string; joinedExisting: boolean }> {
  const settings = await ensureSettings();
  const seed = settings.bookId || settings.deviceId;
  const raw = await carrier.readText(CONFIG_PATH);
  const parsed = parseBookConfig(raw, seed);
  if (!parsed.existed || parsed.upgraded) {
    await carrier.writeText(
      CONFIG_PATH,
      JSON.stringify(parsed.config, null, 2),
      'overwrite',
    );
  }
  if (settings.bookId !== parsed.config.bookId) {
    await db.settings.update(1, { bookId: parsed.config.bookId });
  }
  return {
    bookId: parsed.config.bookId,
    joinedExisting: parsed.existed,
  };
}

async function publishRoster(
  carrier: CloudCarrier,
  bookId: string,
  changeKeys: string[],
): Promise<DeviceRoster> {
  const settings = await ensureSettings();
  const raw = await carrier.readText(DEVICES_PATH);
  const current = parseRoster(raw, bookId);
  const next = upsertRoster(current, bookId, {
    deviceId: settings.deviceId,
    deviceName:
      settings.deviceName?.trim() ||
      defaultDeviceName(settings.deviceKind, settings.operatorName),
    operatorName: settings.operatorName,
    kind: settings.deviceKind,
    lastSeenAt: nowIso(),
  });
  const withFolders = devicesFromChangePaths(changeKeys, next);
  await carrier.writeText(
    DEVICES_PATH,
    JSON.stringify(withFolders, null, 2),
    'overwrite',
  );
  await cacheRoster(withFolders, settings.deviceId);
  return withFolders;
}

async function pullRemote(carrier: CloudCarrier): Promise<{
  pulled: number;
  conflicts: number;
}> {
  let pulled = 0;
  let conflicts = 0;
  const raw = await carrier.readText(SNAPSHOT_PATH);
  const snapshot = raw ? parseSnapshot(raw) : null;
  if (snapshot) {
    const merged = await mergeSnapshot(snapshot);
    pulled += merged.applied;
    conflicts += merged.conflicts;
  }

  const files = (await carrier.list('changes'))
    .filter((file) => file.key.endsWith('.jsonl'))
    .sort((a, b) => a.key.localeCompare(b.key));

  for (const file of files) {
    const already = await db.syncApplied.get(`${carrier.provider}:${file.key}`);
    if (already) continue;
    const text = await carrier.readText(file.key);
    if (text == null) continue;
    const result = await applyRemoteFile(
      `${carrier.provider}:${file.key}`,
      text,
      carrier.provider,
    );
    pulled += result.applied;
    conflicts += result.conflicts;
  }
  return { pulled, conflicts };
}

async function pushLocal(
  carrier: CloudCarrier,
  deviceId: string,
): Promise<{ pushed: number; fileKey?: string }> {
  const pending = await db.outbox.filter((change) => !change.syncedAt).toArray();
  if (pending.length === 0) return { pushed: 0 };
  const settings = await ensureSettings();

  const lines: ChangeLine[] = pending.map((change) => ({
    v: 1,
    deviceId,
    deviceName: settings.deviceName,
    operatorName: settings.operatorName,
    entity: change.entity,
    entityId: change.entityId,
    op: change.op,
    updatedAt: change.updatedAt,
    payload: change.payload,
  }));

  const stamp = nowIso().replace(/[:.]/g, '-');
  const fileKey = `changes/${deviceId}/${stamp}.jsonl`;
  await carrier.writeText(fileKey, serializeJsonl(lines), 'add');
  await db.syncApplied.put({
    fileKey: `${carrier.provider}:${fileKey}`,
    appliedAt: nowIso(),
    provider: carrier.provider,
  });
  await markOutboxSynced(pending.map((change) => change.id));
  return { pushed: pending.length, fileKey };
}

async function maybeWriteSnapshot(
  carrier: CloudCarrier,
  didWork: boolean,
): Promise<void> {
  const existing = await carrier.readText(SNAPSHOT_PATH);
  if (!didWork && existing) return;
  if (!didWork && (await localHerdIsEmpty())) return;
  const snapshot = await buildSnapshot();
  await carrier.writeText(
    SNAPSHOT_PATH,
    JSON.stringify(snapshot),
    'overwrite',
  );
}

async function runSync(options: { replace?: boolean } = {}): Promise<SyncRunResult> {
  const settings = await ensureSettings();
  const ranchConfigured = hasRanchServer();
  const cloudProvider = isCloudProvider(settings.syncProvider)
    ? settings.syncProvider
    : null;
  if (!cloudProvider && !ranchConfigured) {
    return {
      ok: false,
      detail: 'Connect Google Drive, Dropbox, or a ranch API in Settings first.',
      pulled: 0,
      pushed: 0,
      conflicts: 0,
    };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      detail: 'No network — try again when you have service.',
      pulled: 0,
      pushed: 0,
      conflicts: 0,
    };
  }

  const parts: string[] = [];
  let pulled = { pulled: 0, conflicts: 0 };
  let pushed = { pushed: 0 };
  let cloudOk = false;

  if (cloudProvider) {
    const token = await getValidAccessToken();
    if (!token) {
      if (!ranchConfigured) {
        lastError = `Reconnect ${providerLabel(cloudProvider)} in Settings.`;
        emitSyncEvent();
        return {
          ok: false,
          detail: lastError,
          pulled: 0,
          pushed: 0,
          conflicts: 0,
        };
      }
      parts.push(`Reconnect ${providerLabel(cloudProvider)}`);
    } else {
      try {
        const carrier = carrierFor(cloudProvider);
        await carrier.ensureRoot();
        const book = await ensureBook(carrier);
        if (options.replace) await clearHerdForReplace();
        pulled = await pullRemote(carrier);
        pushed = options.replace
          ? { pushed: 0 }
          : await pushLocal(carrier, settings.deviceId);
        await maybeWriteSnapshot(
          carrier,
          pulled.pulled > 0 || pushed.pushed > 0 || options.replace === true,
        );
        const changeFiles = await carrier.list('changes');
        const roster = await publishRoster(
          carrier,
          book.bookId,
          changeFiles.map((file) => file.key),
        );
        cloudOk = true;
        if (book.joinedExisting && roster.devices.length > 1) {
          parts.push(`${roster.devices.length} devices on this book`);
        }
        if (pushed.pushed) parts.push(`sent ${pushed.pushed}`);
        if (pulled.pulled) parts.push(`received ${pulled.pulled}`);
        if (pulled.conflicts) parts.push(`${pulled.conflicts} overlap(s) logged`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Cloud sync failed.';
        if (!ranchConfigured) {
          lastError = message;
          emitSyncEvent();
          return {
            ok: false,
            detail: lastError,
            pulled: 0,
            pushed: 0,
            conflicts: 0,
          };
        }
        parts.push(message);
      }
    }
  }

  if (ranchConfigured) {
    const ranch = await pushToRanchServer();
    if (ranch.ok) parts.push('copied to ranch database');
    else if (!cloudOk) {
      lastError = ranch.detail;
      emitSyncEvent();
      return {
        ok: false,
        detail: ranch.detail,
        pulled: pulled.pulled,
        pushed: pushed.pushed,
        conflicts: pulled.conflicts,
      };
    } else {
      parts.push(`ranch API: ${ranch.detail}`);
    }
  }

  await db.settings.update(1, { lastSyncedAt: nowIso() });
  lastError = undefined;
  const label = cloudProvider
    ? providerLabel(cloudProvider)
    : 'ranch database';
  const detail =
    parts.length > 0
      ? `Synced with ${label} — ${parts.join(', ')}.`
      : `Herd is up to date on ${label}.`;
  emitSyncEvent();
  return {
    ok: true,
    detail,
    pulled: pulled.pulled,
    pushed: pushed.pushed,
    conflicts: pulled.conflicts,
  };
}

export async function syncNow(): Promise<SyncRunResult> {
  if (inflight) return inflight;
  inflight = runSync().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function replaceThisDeviceFromCloud(): Promise<SyncRunResult> {
  if (inflight) await inflight;
  inflight = runSync({ replace: true }).finally(() => {
    inflight = null;
  });
  return inflight;
}

export { exportHerdBackup } from './snapshot';

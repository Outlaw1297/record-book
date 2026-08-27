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
import { hasRanchServer, loadRanchDevices, pullFromRanchServer, pushToRanchServer } from './ranchServer';
import { applyRemoteFile } from './remoteApply';
import { formatWhen, noneProviderBanner } from './statusCopy';
import {
  buildSnapshot,
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
  ranchSyncedAt?: string;
  provider: SyncProvider;
  message: string;
  accountEmail?: string;
  conflictCount: number;
  needsAuth: boolean;
  connected: boolean;
  deviceCount: number;
  bookId?: string;
  retryable: boolean;
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
    message = noneProviderBanner({
      pendingCount,
      ranchConfigured,
      ranchSyncedAt: settings.ranchSyncedAt,
    });
  } else if (isCloudProvider(settings.syncProvider) && !connected) {
    message = ranchConfigured
      ? `Online — reconnect ${label}, or the ranch database still copies itself`
      : `Online — reconnect ${label} in Settings`;
  } else if (pendingCount > 0) {
    message = `${pendingCount} change(s) syncing to ${label}…`;
  } else if (others > 0 && settings.lastSyncedAt) {
    message = `Online — shared book, ${others + 1} devices, last synced ${formatWhen(settings.lastSyncedAt)}`;
  } else if (settings.lastSyncedAt) {
    message = `Online — last synced ${formatWhen(settings.lastSyncedAt)}`;
  } else {
    message = `Online — connected to ${label}. Syncs by itself.`;
  }

  return {
    online,
    pendingCount,
    lastSyncedAt: settings.lastSyncedAt,
    ranchSyncedAt: settings.ranchSyncedAt,
    provider: settings.syncProvider,
    message,
    accountEmail: auth?.accountEmail,
    conflictCount,
    needsAuth,
    connected,
    deviceCount,
    bookId: settings.bookId,
    retryable: Boolean(
      lastError ||
        needsAuth ||
        (ranchConfigured && pendingCount > 0 && !settings.ranchSyncedAt),
    ),
  };
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
  if (!ranchConfigured && !cloudProvider) {
    return {
      ok: false,
      detail: 'Ranch API is not set. Open Settings on ranch Wi-Fi.',
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
  let ranchOk = false;

  if (ranchConfigured) {
    const incoming = await pullFromRanchServer({ replace: options.replace });
    if (!incoming.ok) {
      lastError = incoming.detail;
      emitSyncEvent();
      return {
        ok: false,
        detail: incoming.detail,
        pulled: 0,
        pushed: 0,
        conflicts: 0,
      };
    }
    pulled = { pulled: incoming.applied, conflicts: incoming.conflicts };
    if (incoming.applied) parts.push(`received ${incoming.applied} from ranch`);
    if (incoming.conflicts) parts.push(`${incoming.conflicts} overlap(s) logged`);

    const ranch = await pushToRanchServer();
    if (!ranch.ok) {
      lastError = ranch.detail;
      emitSyncEvent();
      return {
        ok: false,
        detail: ranch.detail,
        pulled: pulled.pulled,
        pushed: 0,
        conflicts: pulled.conflicts,
      };
    }
    ranchOk = true;
    parts.push(ranch.detail);
    const now = nowIso();
    await db.settings.update(1, { ranchSyncedAt: now, lastSyncedAt: now });
    const pending = await db.outbox.filter((change) => !change.syncedAt).toArray();
    if (pending.length > 0) {
      await markOutboxSynced(pending.map((change) => change.id));
      pushed = { pushed: pending.length };
    }

    const devices = await loadRanchDevices();
    if (devices.length > 0) {
      await cacheRoster(
        {
          bookId: (await ensureSettings()).bookId || settings.deviceId,
          updatedAt: now,
          devices: devices.map((device) => ({
            deviceId: device.deviceId,
            deviceName: device.deviceName,
            operatorName: device.operatorName,
            kind: device.kind === 'desk' ? 'desk' : device.kind === 'phone' ? 'phone' : undefined,
            lastSeenAt: device.lastSeenAt,
          })),
        },
        settings.deviceId,
      );
    }
  }

  if (cloudProvider && !options.replace) {
    const token = await getValidAccessToken();
    if (token) {
      try {
        const carrier = carrierFor(cloudProvider);
        await carrier.ensureRoot();
        const book = await ensureBook(carrier);
        const remote = await pullRemote(carrier);
        pulled = {
          pulled: pulled.pulled + remote.pulled,
          conflicts: pulled.conflicts + remote.conflicts,
        };
        const sent = await pushLocal(carrier, settings.deviceId);
        pushed = { pushed: pushed.pushed + sent.pushed };
        await maybeWriteSnapshot(carrier, true);
        const changeFiles = await carrier.list('changes');
        const roster = await publishRoster(
          carrier,
          book.bookId,
          changeFiles.map((file) => file.key),
        );
        if (roster.devices.length > 1) {
          parts.push(`${roster.devices.length} devices on Drive/Dropbox`);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Cloud backup failed.';
        if (!ranchOk) {
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

  await db.settings.update(1, { lastSyncedAt: nowIso() });
  lastError = undefined;
  const detail =
    parts.length > 0
      ? `Synced with ranch database — ${parts.join(', ')}.`
      : 'Herd is up to date on the ranch database.';
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

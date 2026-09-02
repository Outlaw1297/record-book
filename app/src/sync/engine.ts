import {
  db,
  ensureSettings,
  nowIso,
  type SyncDevice,
  type SyncProvider,
} from '../db/schema';
import { serializeJsonl } from './apply';
import { getValidAccessToken, hasUsableSession, listCloudAuths } from './auth';
import { preferredCloudProvider } from './authStore';
import { carrierFor } from './carrier';
import { cloudSyncRole } from './cloudRole';
import {
  defaultDeviceName,
  devicesFromChangePaths,
  parseBookConfig,
  parseRoster,
  upsertRoster,
  type DeviceRoster,
} from './identity';
import {
  hasRanchServer,
  loadRanchDevices,
  pullFromRanchServer,
  pushToRanchServer,
  requestNasBackup,
} from './ranchServer';
import { applyRemoteFile } from './remoteApply';
import { formatWhen, isSyncOnline, noneProviderBanner, noSharedBookDetail } from './statusCopy';
import {
  clearSyncProgress,
  getSyncLogs,
  getSyncProgress,
  logSyncError,
  logSyncInfo,
  logSyncWarn,
  setSyncProgress,
} from './activity';
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
  ranchSyncedAt?: string;
  provider: SyncProvider;
  message: string;
  accountEmail?: string;
  conflictCount: number;
  needsAuth: boolean;
  connected: boolean;
  deviceCount: number;
  bookId?: string;
  canSync: boolean;
  retryable: boolean;
  error?: string;
  progress: ReturnType<typeof getSyncProgress>;
  logs: ReturnType<typeof getSyncLogs>;
};

let inflight: Promise<SyncRunResult> | null = null;
let lastError: string | undefined;

function isCloudProvider(value: SyncProvider): value is CloudProvider {
  return value === 'google-drive' || value === 'dropbox';
}

function providerLabel(provider: SyncProvider): string {
  if (provider === 'google-drive') return 'this ranch’s Google Drive';
  if (provider === 'dropbox') return 'this ranch’s Dropbox';
  return 'this ranch’s book';
}

function cloudLabels(providers: CloudProvider[]): string {
  if (providers.length === 2) return 'this ranch’s Google Drive and Dropbox';
  if (providers.length === 1) return providerLabel(providers[0]);
  return 'this ranch’s book';
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const settings = await ensureSettings();
  const pendingCount = await db.outbox.filter((change) => !change.syncedAt).count();
  const conflictCount = await db.syncConflicts.count();
  const deviceCount = await db.syncDevices.count();
  const auths = await listCloudAuths();
  const connected = await hasUsableSession();
  const ranchConfigured = hasRanchServer();
  const needsAuth = !connected && !ranchConfigured;
  const cloudProviders = auths.map((row) => row.provider);
  const label = cloudLabels(
    cloudProviders.length > 0
      ? cloudProviders
      : isCloudProvider(settings.syncProvider)
        ? [settings.syncProvider]
        : [],
  );
  const others = Math.max(0, deviceCount - 1);
  const online = isSyncOnline(
    typeof navigator !== 'undefined' ? navigator.onLine : false,
    ranchConfigured,
  );

  let message = 'Offline — changes saved on this device';
  if (!online) {
    message = 'Offline — changes saved on this device';
  } else if (lastError) {
    message = lastError;
  } else if (!connected && settings.syncProvider === 'none') {
    message = noneProviderBanner({
      pendingCount,
      ranchConfigured,
      ranchSyncedAt: settings.ranchSyncedAt,
    });
  } else if (isCloudProvider(settings.syncProvider) && !connected) {
    message = ranchConfigured
      ? `Online — ranch database copies itself. Reconnect ${label} in Settings to keep a spare copy.`
      : `Online — reconnect ${label} in Settings`;
  } else if (pendingCount > 0) {
    message = ranchConfigured
      ? connected
        ? `${pendingCount} change(s) copying to the ranch database, then a spare copy on ${label}…`
        : `${pendingCount} change(s) copying themselves to the ranch database…`
      : `${pendingCount} change(s) copying themselves to ${label}…`;
  } else if (others > 0 && settings.lastSyncedAt) {
    message = `Online — this ranch’s book, ${others + 1} devices, last synced ${formatWhen(settings.lastSyncedAt)}`;
  } else if (settings.lastSyncedAt) {
    message =
      ranchConfigured && connected
        ? `Online — ranch database last synced ${formatWhen(settings.lastSyncedAt)}. Spare copy on ${label}.`
        : `Online — last synced ${formatWhen(settings.lastSyncedAt)}. Copies by itself.`;
  } else {
    message = ranchConfigured
      ? connected
        ? `Online — this ranch’s database copies by itself. Spare copy on ${label}.`
        : 'Online — this ranch’s database copies by itself.'
      : `Online — connected to ${label}. Copies by itself.`;
  }

  return {
    online,
    pendingCount,
    lastSyncedAt: settings.lastSyncedAt,
    ranchSyncedAt: settings.ranchSyncedAt,
    provider: settings.syncProvider,
    message,
    accountEmail: auths
      .map((row) => row.accountEmail)
      .filter(Boolean)
      .join(' · ') || undefined,
    conflictCount,
    needsAuth,
    connected,
    deviceCount,
    bookId: settings.bookId,
    canSync: connected || ranchConfigured,
    retryable: Boolean(
      lastError ||
        needsAuth ||
        pendingCount > 0 ||
        connected ||
        ranchConfigured,
    ),
    error: lastError,
    progress: getSyncProgress(),
    logs: getSyncLogs(),
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

async function copySnapshotTo(provider: CloudProvider): Promise<void> {
  const carrier = carrierFor(provider);
  await carrier.ensureRoot();
  const book = await ensureBook(carrier);
  await maybeWriteSnapshot(carrier, true);
  const changeFiles = await carrier.list('changes');
  await publishRoster(
    carrier,
    book.bookId,
    changeFiles.map((file) => file.key),
  );
}

const CLOUD_PROVIDERS: CloudProvider[] = ['google-drive', 'dropbox'];

async function connectedCloudProviders(): Promise<CloudProvider[]> {
  const connected: CloudProvider[] = [];
  for (const provider of CLOUD_PROVIDERS) {
    if (await getValidAccessToken(provider)) connected.push(provider);
  }
  return connected;
}

async function runSync(options: { replace?: boolean } = {}): Promise<SyncRunResult> {
  logSyncInfo(options.replace ? 'Replace-from-cloud started' : 'Sync started');
  setSyncProgress({
    phase: 'sync',
    current: 0,
    total: 1,
    label: 'Copying this ranch’s book…',
  });
  try {
    return await runSyncBody(options);
  } finally {
    clearSyncProgress();
  }
}

async function runSyncBody(options: { replace?: boolean } = {}): Promise<SyncRunResult> {
  const settings = await ensureSettings();
  const ranchConfigured = hasRanchServer();
  const connectedClouds = await connectedCloudProviders();
  const preferred = preferredCloudProvider(settings.syncProvider, connectedClouds);
  if (!ranchConfigured && connectedClouds.length === 0) {
    const detail = noSharedBookDetail();
    logSyncError(detail);
    return {
      ok: false,
      detail,
      pulled: 0,
      pushed: 0,
      conflicts: 0,
    };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine && !ranchConfigured) {
    const detail = 'No network — try again when you have service.';
    logSyncError(detail);
    return {
      ok: false,
      detail,
      pulled: 0,
      pushed: 0,
      conflicts: 0,
    };
  }

  const parts: string[] = [];
  let pulled = { pulled: 0, conflicts: 0 };
  let pushed = { pushed: 0 };
  let ranchOk = false;
  const cloudLabel = cloudLabels(connectedClouds);

  if (ranchConfigured) {
    if (options.replace) await clearHerdForReplace();
    setSyncProgress({
      phase: 'sync',
      current: 0,
      total: 1,
      label: 'Reading ranch database…',
    });
    const incoming = await pullFromRanchServer();
    if (incoming.ok) {
      pulled = { pulled: incoming.applied, conflicts: incoming.conflicts };
      if (incoming.applied) parts.push(`received ${incoming.applied} from ranch`);
      if (incoming.conflicts) parts.push(`${incoming.conflicts} overlap(s) logged`);

      for (const provider of connectedClouds) {
        try {
          const carrier = carrierFor(provider);
          await carrier.ensureRoot();
          const remote = await pullRemote(carrier);
          pulled = {
            pulled: pulled.pulled + remote.pulled,
            conflicts: pulled.conflicts + remote.conflicts,
          };
          if (remote.pulled) {
            parts.push(`received ${remote.pulled} from ${providerLabel(provider)}`);
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : `Could not read ${providerLabel(provider)}.`;
          logSyncWarn(message);
          parts.push(message);
        }
      }

      const ranch = await pushToRanchServer();
      if (ranch.ok) {
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
        setSyncProgress({
          phase: 'backup',
          current: 1,
          total: 1,
          label: 'NAS spare copy to Dropbox or Drive…',
        });
        const nas = await requestNasBackup();
        if (!/no dropbox or google login stored/i.test(nas.detail)) {
          parts.push(nas.detail);
        }
      } else if (connectedClouds.length === 0) {
        lastError = ranch.detail;
        emitSyncEvent();
        return {
          ok: false,
          detail: ranch.detail,
          pulled: pulled.pulled,
          pushed: 0,
          conflicts: pulled.conflicts,
        };
      } else {
        parts.push(ranch.detail);
      }
    } else if (connectedClouds.length === 0) {
      lastError = incoming.detail;
      emitSyncEvent();
      return {
        ok: false,
        detail: incoming.detail,
        pulled: 0,
        pushed: 0,
        conflicts: 0,
      };
    } else {
      parts.push(incoming.detail);
    }
  }

  const cloudRole = cloudSyncRole(ranchOk, connectedClouds.length > 0);
  if (cloudRole !== 'off') {
    const bookProvider = preferred ?? connectedClouds[0];
    if (cloudRole === 'book' && bookProvider) {
      try {
        if (options.replace && !ranchConfigured) {
          await clearHerdForReplace();
        }
        const carrier = carrierFor(bookProvider);
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
          parts.push(`${roster.devices.length} devices on ${providerLabel(bookProvider)}`);
        }
        for (const extra of connectedClouds.filter((item) => item !== bookProvider)) {
          try {
            await copySnapshotTo(extra);
            parts.push(`spare copy on ${providerLabel(extra)}`);
          } catch (error) {
            parts.push(
              error instanceof Error ? error.message : `${providerLabel(extra)} spare copy failed.`,
            );
          }
        }
      } catch (error) {
        lastError =
          error instanceof Error ? error.message : `${cloudLabel} sync failed.`;
        logSyncError(lastError);
        emitSyncEvent();
        return {
          ok: false,
          detail: lastError,
          pulled: 0,
          pushed: 0,
          conflicts: 0,
        };
      }
    }
  }

  await db.settings.update(1, { lastSyncedAt: nowIso() });
  lastError = undefined;
  const detail = ranchOk
    ? parts.length > 0
      ? `Synced with ranch database — ${parts.join(', ')}.`
      : 'Herd is up to date on the ranch database.'
    : parts.length > 0
      ? `Synced with ${cloudLabel ?? 'cloud'} — ${parts.join(', ')}.`
      : `Herd is up to date on ${cloudLabel ?? 'cloud'}.`;
  emitSyncEvent();
  logSyncInfo(detail);
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

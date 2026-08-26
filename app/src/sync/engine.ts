import {
  db,
  ensureSettings,
  nowIso,
  type SyncProvider,
} from '../db/schema';
import { serializeJsonl } from './apply';
import { getSyncAuth, getValidAccessToken, hasUsableSession } from './auth';
import { carrierFor } from './carrier';
import { applyRemoteFile } from './remoteApply';
import {
  buildSnapshot,
  importSnapshot,
  localHerdIsEmpty,
  parseSnapshot,
} from './snapshot';
import {
  CONFIG_PATH,
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
  const online = typeof navigator !== 'undefined' ? navigator.onLine : false;
  const auth = await getSyncAuth();
  const connected = await hasUsableSession();
  const needsAuth = isCloudProvider(settings.syncProvider) && !connected;
  const label = providerLabel(settings.syncProvider);

  let message = 'Offline — changes saved on this device';
  if (!online) {
    message = 'Offline — changes saved on this device';
  } else if (lastError) {
    message = lastError;
  } else if (settings.syncProvider === 'none') {
    message = 'Online — connect Google Drive or Dropbox in Settings to sync';
  } else if (needsAuth) {
    message = `Online — reconnect ${label} in Settings`;
  } else if (pendingCount > 0) {
    message = `${pendingCount} change(s) waiting to sync to ${label}`;
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

async function pullRemote(carrier: CloudCarrier): Promise<{
  pulled: number;
  conflicts: number;
}> {
  if (await localHerdIsEmpty()) {
    const raw = await carrier.readText(SNAPSHOT_PATH);
    const snapshot = raw ? parseSnapshot(raw) : null;
    if (snapshot) await importSnapshot(snapshot);
  }

  const files = (await carrier.list('changes'))
    .filter((file) => file.key.endsWith('.jsonl'))
    .sort((a, b) => a.key.localeCompare(b.key));

  let pulled = 0;
  let conflicts = 0;
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

  const lines: ChangeLine[] = pending.map((change) => ({
    v: 1,
    deviceId,
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

async function ensureConfig(carrier: CloudCarrier): Promise<void> {
  const existing = await carrier.readText(CONFIG_PATH);
  if (existing) return;
  await carrier.writeText(
    CONFIG_PATH,
    JSON.stringify(
      {
        app: 'record-book',
        format: 1,
        createdAt: nowIso(),
      },
      null,
      2,
    ),
    'overwrite',
  );
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

async function runSync(): Promise<SyncRunResult> {
  const settings = await ensureSettings();
  if (!isCloudProvider(settings.syncProvider)) {
    return {
      ok: false,
      detail: 'Connect Google Drive or Dropbox in Settings first.',
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

  const token = await getValidAccessToken();
  if (!token) {
    lastError = `Reconnect ${providerLabel(settings.syncProvider)} in Settings.`;
    emitSyncEvent();
    return {
      ok: false,
      detail: lastError,
      pulled: 0,
      pushed: 0,
      conflicts: 0,
    };
  }

  try {
    const carrier = carrierFor(settings.syncProvider);
    await carrier.ensureRoot();
    await ensureConfig(carrier);
    const pulled = await pullRemote(carrier);
    const pushed = await pushLocal(carrier, settings.deviceId);
    await maybeWriteSnapshot(carrier, pulled.pulled > 0 || pushed.pushed > 0);
    await db.settings.update(1, { lastSyncedAt: nowIso() });
    lastError = undefined;
    const parts: string[] = [];
    if (pushed.pushed) parts.push(`sent ${pushed.pushed}`);
    if (pulled.pulled) parts.push(`received ${pulled.pulled}`);
    if (pulled.conflicts) parts.push(`${pulled.conflicts} overlap(s) logged`);
    const detail =
      parts.length > 0
        ? `Synced with ${providerLabel(settings.syncProvider)} — ${parts.join(', ')}.`
        : `Herd is up to date on ${providerLabel(settings.syncProvider)}.`;
    emitSyncEvent();
    return {
      ok: true,
      detail,
      pulled: pulled.pulled,
      pushed: pushed.pushed,
      conflicts: pulled.conflicts,
    };
  } catch (error) {
    lastError =
      error instanceof Error ? error.message : 'Sync failed. Try again.';
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

export async function syncNow(): Promise<SyncRunResult> {
  if (inflight) return inflight;
  inflight = runSync().finally(() => {
    inflight = null;
  });
  return inflight;
}

export { exportHerdBackup } from './snapshot';

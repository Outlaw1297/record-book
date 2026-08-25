import { db, ensureSettings, type SyncProvider } from './schema';

export type SyncStatus = {
  online: boolean;
  pendingCount: number;
  lastSyncedAt?: string;
  provider: SyncProvider;
  message: string;
};

/**
 * Cloud folder sync stub.
 * v1 keeps data fully offline in IndexedDB and tracks an outbox.
 * Drive/Dropbox adapters will upload outbox JSONL + snapshots later.
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  const settings = await ensureSettings();
  const pendingCount = await db.outbox.filter((c) => !c.syncedAt).count();
  const online = typeof navigator !== 'undefined' ? navigator.onLine : false;

  let message = 'Offline — changes saved on this device';
  if (online && settings.syncProvider === 'none') {
    message = 'Online — choose Google Drive or Dropbox in Settings to sync';
  } else if (online && pendingCount > 0) {
    message = `${pendingCount} change(s) waiting to sync`;
  } else if (online) {
    message = 'Online — herd is up to date on this device';
  }

  return {
    online,
    pendingCount,
    lastSyncedAt: settings.lastSyncedAt,
    provider: settings.syncProvider,
    message,
  };
}

export async function exportHerdBackup(): Promise<Blob> {
  const [
    animals,
    cowCalf,
    breeding,
    pastures,
    pastureAnimals,
    sales,
    settings,
  ] = await Promise.all([
    db.animals.toArray(),
    db.cowCalf.toArray(),
    db.breeding.toArray(),
    db.pastures.toArray(),
    db.pastureAnimals.toArray(),
    db.sales.toArray(),
    db.settings.toArray(),
  ]);

  const payload = {
    format: 'record-book-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    animals,
    cowCalf,
    breeding,
    pastures,
    pastureAnimals,
    sales,
    settings,
  };

  return new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
}

export async function markOutboxSynced(): Promise<void> {
  const pending = await db.outbox.filter((c) => !c.syncedAt).toArray();
  const now = new Date().toISOString();
  await db.transaction('rw', db.outbox, db.settings, async () => {
    for (const change of pending) {
      await db.outbox.update(change.id, { syncedAt: now });
    }
    await db.settings.update(1, { lastSyncedAt: now });
  });
}

/** Placeholder until OAuth adapters land — clears local outbox as "synced". */
export async function syncNow(): Promise<{ ok: boolean; detail: string }> {
  const settings = await ensureSettings();
  if (settings.syncProvider === 'none') {
    return {
      ok: false,
      detail: 'Pick Google Drive or Dropbox in Settings first.',
    };
  }
  if (!navigator.onLine) {
    return { ok: false, detail: 'No network — try again when you have service.' };
  }

  // Future: upload outbox to /RecordBook/changes/<deviceId>/…
  await markOutboxSynced();
  return {
    ok: true,
    detail: `Marked local outbox synced for ${settings.syncProvider} (adapter coming next).`,
  };
}

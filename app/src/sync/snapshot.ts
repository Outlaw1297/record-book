import { db, ensureSettings, nowIso } from '../db/schema';
import { applyRemoteChange, applySnapshotRows } from './remoteApply';
import { sanitizeSettingsForSync } from './settingsPayload';
import type { HerdSnapshot } from './types';

export async function buildSnapshot(): Promise<HerdSnapshot> {
  const [
    animals,
    cowCalf,
    breeding,
    pastures,
    pastureAnimals,
    sales,
    treatments,
    settings,
  ] = await Promise.all([
    db.animals.toArray(),
    db.cowCalf.toArray(),
    db.breeding.toArray(),
    db.pastures.toArray(),
    db.pastureAnimals.toArray(),
    db.sales.toArray(),
    db.treatments.toArray(),
    ensureSettings(),
  ]);

  return {
    format: 'record-book-snapshot',
    version: 1,
    exportedAt: nowIso(),
    animals,
    cowCalf,
    breeding,
    pastures,
    pastureAnimals,
    sales,
    treatments,
    settings: sanitizeSettingsForSync(settings),
  };
}

export async function exportHerdBackup(): Promise<Blob> {
  const snapshot = await buildSnapshot();
  const settings = await ensureSettings();
  const payload = {
    ...snapshot,
    format: 'record-book-backup',
    deviceId: settings.deviceId,
    lastSyncedAt: settings.lastSyncedAt,
  };
  return new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
}

export async function localHerdIsEmpty(): Promise<boolean> {
  const counts = await Promise.all([
    db.animals.count(),
    db.cowCalf.count(),
    db.breeding.count(),
    db.pastures.count(),
    db.pastureAnimals.count(),
    db.sales.count(),
    db.treatments.count(),
  ]);
  return counts.every((count) => count === 0);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export async function mergeSnapshot(
  snapshot: HerdSnapshot,
  onProgress?: (current: number, total: number, label: string) => void,
): Promise<{ applied: number; conflicts: number }> {
  let applied = 0;
  let conflicts = 0;
  const batches: Array<
    [
      | 'animals'
      | 'cowCalf'
      | 'breeding'
      | 'pastures'
      | 'pastureAnimals'
      | 'sales'
      | 'treatments',
      unknown[],
    ]
  > = [
    ['animals', asArray(snapshot.animals)],
    ['cowCalf', asArray(snapshot.cowCalf)],
    ['breeding', asArray(snapshot.breeding)],
    ['pastures', asArray(snapshot.pastures)],
    ['pastureAnimals', asArray(snapshot.pastureAnimals)],
    ['sales', asArray(snapshot.sales)],
    ['treatments', asArray(snapshot.treatments)],
  ];
  const total = Math.max(
    1,
    batches.reduce((sum, [, rows]) => sum + rows.length, 0) + (snapshot.settings ? 1 : 0),
  );
  let current = 0;
  for (const [entity, rows] of batches) {
    onProgress?.(current, total, `Saving ${entity} ${current} / ${total}`);
    const result = await applySnapshotRows(entity, rows);
    applied += result.applied;
    conflicts += result.conflicts;
    current += rows.length;
    onProgress?.(current, total, `Saving ${entity} ${current} / ${total}`);
  }
  if (snapshot.settings) {
    const result = await applyRemoteChange({
      v: 1,
      deviceId: 'snapshot',
      entity: 'settings',
      entityId: '1',
      op: 'upsert',
      updatedAt: snapshot.settings.updatedAt || snapshot.exportedAt,
      payload: snapshot.settings,
    });
    if (result === 'applied') applied += 1;
    if (result === 'conflict') conflicts += 1;
  }
  return { applied, conflicts };
}

export async function clearHerdForReplace(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.animals,
      db.cowCalf,
      db.breeding,
      db.pastures,
      db.pastureAnimals,
      db.sales,
      db.treatments,
      db.outbox,
      db.syncApplied,
      db.syncConflicts,
    ],
    async () => {
      await db.animals.clear();
      await db.cowCalf.clear();
      await db.breeding.clear();
      await db.pastures.clear();
      await db.pastureAnimals.clear();
      await db.sales.clear();
      await db.treatments.clear();
      await db.syncApplied.clear();
      await db.syncConflicts.clear();
      const pending = await db.outbox.filter((row) => !row.syncedAt).toArray();
      for (const row of pending) {
        await db.outbox.delete(row.id);
      }
    },
  );
}

export function parseSnapshot(text: string): HerdSnapshot | null {
  try {
    const parsed = JSON.parse(text) as HerdSnapshot;
    if (
      parsed?.format !== 'record-book-snapshot' &&
      (parsed as { format?: string })?.format !== 'record-book-backup'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

import { db, ensureSettings, nowIso } from '../db/schema';
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
    settings,
  ] = await Promise.all([
    db.animals.toArray(),
    db.cowCalf.toArray(),
    db.breeding.toArray(),
    db.pastures.toArray(),
    db.pastureAnimals.toArray(),
    db.sales.toArray(),
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
  ]);
  return counts.every((count) => count === 0);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export async function importSnapshot(snapshot: HerdSnapshot): Promise<void> {
  const settings = await ensureSettings();
  await db.transaction(
    'rw',
    [
      db.animals,
      db.cowCalf,
      db.breeding,
      db.pastures,
      db.pastureAnimals,
      db.sales,
      db.settings,
    ],
    async () => {
      await db.animals.bulkPut(asArray(snapshot.animals) as never[]);
      await db.cowCalf.bulkPut(asArray(snapshot.cowCalf) as never[]);
      await db.breeding.bulkPut(asArray(snapshot.breeding) as never[]);
      await db.pastures.bulkPut(asArray(snapshot.pastures) as never[]);
      await db.pastureAnimals.bulkPut(asArray(snapshot.pastureAnimals) as never[]);
      await db.sales.bulkPut(asArray(snapshot.sales) as never[]);
      await db.settings.put({
        ...settings,
        ...sanitizeSettingsForSync(snapshot.settings),
        id: 1,
        deviceId: settings.deviceId,
        syncProvider: settings.syncProvider,
        lastSyncedAt: settings.lastSyncedAt,
        onboardingComplete: settings.onboardingComplete,
      });
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

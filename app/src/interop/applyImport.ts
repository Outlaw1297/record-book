import {
  db,
  newId,
  nowIso,
  type Animal,
  type BreedingService,
  type CowCalfRecord,
  type ImportJob,
  type ImportTableName,
  type SaleRecord,
  type TreatmentRecord,
} from '../db/schema';
import { scheduleSync, pauseSyncScheduler, resumeSyncScheduler } from '../sync/scheduler';
import {
  clearSyncProgress,
  logSyncError,
  logSyncInfo,
  setSyncProgress,
} from '../sync/activity';
import { hasRanchServer, pushToRanchServer, requestNasBackup } from '../sync/ranchServer';
import type { ParsedHerd } from './parse';
import {
  IMPORT_TABLES,
  clearImportJob,
  getActiveImportJob,
  importJobDone,
  importJobTotal,
  loadStagedTable,
  saveImportProgress,
  stageImport,
} from './importJob';

export type ImportMode = 'merge' | 'replace';

export type ImportResult = {
  animals: number;
  cowCalf: number;
  breeding: number;
  treatments: number;
  sales: number;
};

export const IMPORT_BATCH = 400;

function fresherStamp(): string {
  return nowIso();
}

export function mergeIncomingAnimal(
  incoming: Animal,
  existing: Animal | undefined,
  mode: ImportMode,
  stamp: string,
): Animal {
  if (existing && mode === 'merge') {
    return {
      ...incoming,
      ...existing,
      ...Object.fromEntries(
        Object.entries(incoming).filter(([, value]) => value !== undefined && value !== ''),
      ),
      id: existing.id,
      herdId: existing.herdId,
      updatedAt: stamp,
      deletedAt: undefined,
    };
  }
  return {
    ...incoming,
    id: existing?.id ?? incoming.id ?? newId(),
    updatedAt: stamp,
    deletedAt: undefined,
  };
}

export function cowCalfKey(row: Pick<CowCalfRecord, 'year' | 'cowId' | 'calfId'>): string {
  return `${row.year}|${row.cowId.toLowerCase()}|${(row.calfId || '').toLowerCase()}`;
}

export function breedingKey(
  row: Pick<BreedingService, 'year' | 'cowId' | 'kind' | 'serviceDate'>,
): string {
  return `${row.year}|${row.cowId.toLowerCase()}|${row.kind}|${row.serviceDate || ''}`;
}

export function treatmentKey(
  row: Pick<TreatmentRecord, 'animalHerdId' | 'date' | 'product'>,
): string {
  return `${row.animalHerdId.toLowerCase()}|${row.date || ''}|${(row.product || '').toLowerCase()}`;
}

export function saleKey(row: Pick<SaleRecord, 'year' | 'calfId'>): string {
  return `${row.year}|${row.calfId.toLowerCase()}`;
}

function nextTable(name: ImportTableName): ImportTableName | undefined {
  const index = IMPORT_TABLES.indexOf(name);
  return IMPORT_TABLES[index + 1];
}

let inflight: Promise<ImportResult | null> | null = null;

export async function applyCowSenseImport(
  parsed: ParsedHerd,
  mode: ImportMode,
  meta: { fileName: string; fileSize: number } = { fileName: 'herd', fileSize: 0 },
): Promise<ImportResult> {
  logSyncInfo(
    `Staging ${meta.fileName} so this import can continue after a closed tab`,
  );
  await stageImport(parsed, mode, meta);
  const result = await continueImport();
  if (!result) {
    throw new Error('Import did not start.');
  }
  return result;
}

export async function continueImport(): Promise<ImportResult | null> {
  if (inflight) return inflight;
  inflight = continueImportBody().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function resumeImportIfNeeded(): Promise<ImportResult | null> {
  const job = await getActiveImportJob();
  if (!job) return null;
  logSyncInfo(
    `Resuming ${job.fileName} from ${job.phase}` +
      (job.phase === 'applying'
        ? ` · ${importJobDone(job)}/${importJobTotal(job)} saved on this device`
        : ' · copying to the ranch database'),
  );
  return continueImport();
}

async function continueImportBody(): Promise<ImportResult | null> {
  const job = await getActiveImportJob();
  if (!job) return null;
  pauseSyncScheduler();
  const unload = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = '';
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', unload);
  }
  try {
    if (job.phase === 'applying') {
      const finished = await applyStaged(job);
      if (!finished) return job.counts;
      const still = await getActiveImportJob();
      if (!still) return job.counts;
      await saveImportProgress({ phase: 'syncing' });
    }
    if (hasRanchServer()) {
      const ranch = await pushToRanchServer();
      if (!ranch.ok && !ranch.skipped) {
        logSyncError(
          'Herd is on this computer. Ranch copy will retry when you open Record Book.',
          ranch.detail,
        );
        return job.counts;
      }
      const nas = await requestNasBackup();
      if (nas.ok) logSyncInfo(nas.detail);
    } else {
      resumeSyncScheduler();
      scheduleSync(400);
    }
    await clearImportJob();
    logSyncInfo(
      `Imported ${job.counts.animals} animals, ${job.counts.cowCalf} calving, ${job.counts.breeding} breeding, ${job.counts.treatments} treatments, ${job.counts.sales} sales`,
    );
    return job.counts;
  } catch (error) {
    logSyncError(
      'Cow Sense import failed while saving this ranch’s book',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  } finally {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', unload);
    }
    clearSyncProgress();
    resumeSyncScheduler();
  }
}

async function applyStaged(start: ImportJob): Promise<boolean> {
  const stamp = fresherStamp();
  let job = { ...start };
  const total = importJobTotal(job) + (job.mode === 'replace' && !job.replaceCleared ? 1 : 0);

  const tick = (label: string, current: number, stepTotal: number) => {
    const done = importJobDone(job);
    setSyncProgress({
      phase: 'import',
      current: done,
      total: Math.max(total, 1),
      label: `${label} (${current}/${stepTotal})`,
    });
    if (current === 1 || current === stepTotal || current % IMPORT_BATCH === 0) {
      logSyncInfo(
        `${label} ${current}/${stepTotal} · ${done}/${Math.max(total, 1)} saved on this device`,
      );
    }
  };

  if (job.mode === 'replace' && !job.replaceCleared) {
    logSyncInfo('Replace herd: marking current animals gone (batched)');
    const existing = await db.animals.filter((row) => !row.deletedAt).toArray();
    for (let i = 0; i < existing.length; i += IMPORT_BATCH) {
      const chunk = existing.slice(i, i + IMPORT_BATCH).map((row) => ({
        ...row,
        updatedAt: stamp,
        deletedAt: stamp,
      }));
      await db.animals.bulkPut(chunk);
    }
    job = { ...job, replaceCleared: true };
    await saveImportProgress({ replaceCleared: true });
  }

  const animalMap = new Map<string, Animal>();
  for (const row of await db.animals.filter((row) => !row.deletedAt).toArray()) {
    animalMap.set(row.herdId.toLowerCase(), row);
  }

  const incomingAnimals = await loadStagedTable<Animal>('animals');
  if (job.applyTable === 'animals') {
    for (let i = job.applyIndex; i < incomingAnimals.length; i += IMPORT_BATCH) {
      const slice = incomingAnimals.slice(i, i + IMPORT_BATCH);
      const prepared = slice.map((incoming) => {
        const merged = mergeIncomingAnimal(
          incoming,
          animalMap.get(incoming.herdId.toLowerCase()),
          job.mode,
          stamp,
        );
        animalMap.set(merged.herdId.toLowerCase(), merged);
        return merged;
      });
      await db.animals.bulkPut(prepared);
      job = { ...job, applyIndex: i + slice.length };
      await saveImportProgress({ applyIndex: job.applyIndex });
      if (!(await getActiveImportJob())) return false;
      tick('Saving animals', job.applyIndex, incomingAnimals.length);
    }
    const next = nextTable('animals');
    job = { ...job, applyTable: next ?? 'cowCalf', applyIndex: 0 };
    await saveImportProgress({ applyTable: job.applyTable, applyIndex: 0 });
  }

  await ensureStubAnimals(animalMap, stamp);

  if (
    !(await applyKeyedTable<CowCalfRecord>({
      job,
      table: 'cowCalf',
      label: 'Saving calving',
      dexie: db.cowCalf,
      keyOf: cowCalfKey,
      existingRows: () => db.cowCalf.filter((row) => !row.deletedAt).toArray(),
      stamp,
      tick,
      onJob: (next) => {
        job = next;
      },
    }))
  ) {
    return false;
  }
  if (
    !(await applyKeyedTable<BreedingService>({
      job,
      table: 'breeding',
      label: 'Saving breeding',
      dexie: db.breeding,
      keyOf: breedingKey,
      existingRows: () => db.breeding.filter((row) => !row.deletedAt).toArray(),
      stamp,
      tick,
      onJob: (next) => {
        job = next;
      },
    }))
  ) {
    return false;
  }
  if (
    !(await applyKeyedTable<TreatmentRecord>({
      job,
      table: 'treatments',
      label: 'Saving treatments',
      dexie: db.treatments,
      keyOf: treatmentKey,
      existingRows: () => db.treatments.filter((row) => !row.deletedAt).toArray(),
      stamp,
      tick,
      onJob: (next) => {
        job = next;
      },
    }))
  ) {
    return false;
  }
  if (
    !(await applyKeyedTable<SaleRecord>({
      job,
      table: 'sales',
      label: 'Saving sales',
      dexie: db.sales,
      keyOf: saleKey,
      existingRows: () => db.sales.filter((row) => !row.deletedAt).toArray(),
      stamp,
      tick,
      onJob: (next) => {
        job = next;
      },
    }))
  ) {
    return false;
  }
  return true;
}

async function ensureStubAnimals(animalMap: Map<string, Animal>, stamp: string): Promise<void> {
  const cowCalf = await loadStagedTable<CowCalfRecord>('cowCalf');
  const breeding = await loadStagedTable<BreedingService>('breeding');
  const treatments = await loadStagedTable<TreatmentRecord>('treatments');
  const sales = await loadStagedTable<SaleRecord>('sales');
  const stubs: Animal[] = [];

  const ensure = (herdId: string | undefined, extras: Partial<Animal> = {}) => {
    const trimmed = herdId?.trim();
    if (!trimmed || trimmed === 'open') return;
    const key = trimmed.toLowerCase();
    const existing = animalMap.get(key);
    if (existing) {
      if (extras.sex && !existing.sex) existing.sex = extras.sex;
      if (extras.animalType && !existing.animalType) existing.animalType = extras.animalType;
      return;
    }
    const stub: Animal = {
      id: newId(),
      herdId: trimmed,
      sex: extras.sex || '',
      status: extras.status ?? 'active',
      animalType: extras.animalType,
      updatedAt: stamp,
    };
    animalMap.set(key, stub);
    stubs.push(stub);
  };

  for (const row of cowCalf) {
    ensure(row.cowId, { sex: 'F', animalType: 'Cow' });
    if (row.calfId) ensure(row.calfId, { sex: row.sex, animalType: 'Calf' });
    if (row.sireId) ensure(row.sireId, { sex: 'M', animalType: 'Bull' });
  }
  for (const row of breeding) {
    ensure(row.cowId);
    if (row.sireId) ensure(row.sireId, { sex: 'M' });
  }
  for (const row of treatments) ensure(row.animalHerdId);
  for (const row of sales) ensure(row.calfId, { sex: row.sex, status: 'sold' });

  if (stubs.length > 0) {
    await db.animals.bulkPut(stubs);
    logSyncInfo(`Added ${stubs.length} linked Visual IDs that were not on the animal list`);
  }
}

async function applyKeyedTable<T extends { id: string; updatedAt: string; deletedAt?: string }>(options: {
  job: ImportJob;
  table: ImportTableName;
  label: string;
  dexie: { bulkPut: (rows: T[]) => Promise<unknown> };
  keyOf: (row: T) => string;
  existingRows: () => Promise<T[]>;
  stamp: string;
  tick: (label: string, current: number, total: number) => void;
  onJob: (job: ImportJob) => void;
}): Promise<boolean> {
  let job = options.job;
  const order = IMPORT_TABLES.indexOf(job.applyTable);
  const target = IMPORT_TABLES.indexOf(options.table);
  if (order > target) return true;
  if (job.applyTable !== options.table) {
    job = { ...job, applyTable: options.table, applyIndex: 0 };
    await saveImportProgress({ applyTable: options.table, applyIndex: 0 });
    options.onJob(job);
  }

  const incoming = await loadStagedTable<T>(options.table);
  const existing = new Map<string, T>();
  for (const row of await options.existingRows()) {
    existing.set(options.keyOf(row), row);
  }

  for (let i = job.applyIndex; i < incoming.length; i += IMPORT_BATCH) {
    const slice = incoming.slice(i, i + IMPORT_BATCH);
    const prepared = slice.map((row) => {
      const prior = existing.get(options.keyOf(row));
      const record = {
        ...row,
        id: prior?.id ?? row.id,
        updatedAt: options.stamp,
        deletedAt: undefined,
      } as T;
      existing.set(options.keyOf(record), record);
      return record;
    });
    await options.dexie.bulkPut(prepared);
    job = { ...job, applyIndex: i + slice.length };
    await saveImportProgress({ applyIndex: job.applyIndex });
    if (!(await getActiveImportJob())) return false;
    options.onJob(job);
    options.tick(options.label, job.applyIndex, incoming.length);
  }

  const next = nextTable(options.table);
  if (next) {
    job = { ...job, applyTable: next, applyIndex: 0 };
    await saveImportProgress({ applyTable: next, applyIndex: 0 });
    options.onJob(job);
  }
  return true;
}

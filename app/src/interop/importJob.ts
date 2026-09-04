import {
  db,
  nowIso,
  type ImportJob,
  type ImportTableName,
} from '../db/schema';
import type { ParsedHerd } from './parse';

export const IMPORT_TABLES: ImportTableName[] = [
  'animals',
  'cowCalf',
  'breeding',
  'treatments',
  'sales',
];

export async function getActiveImportJob(): Promise<ImportJob | undefined> {
  const job = await db.importJobs.get('active');
  if (!job || job.phase === 'done') return undefined;
  return job;
}

export function importJobTotal(job: Pick<ImportJob, 'counts'>): number {
  return IMPORT_TABLES.reduce((sum, name) => sum + (job.counts[name] ?? 0), 0);
}

export function importJobDone(job: ImportJob): number {
  const order = IMPORT_TABLES;
  const at = order.indexOf(job.applyTable);
  let done = 0;
  for (let i = 0; i < at; i += 1) done += job.counts[order[i]] ?? 0;
  done += Math.min(job.applyIndex, job.counts[job.applyTable] ?? 0);
  return done;
}

export async function stageImport(
  parsed: ParsedHerd,
  mode: ImportJob['mode'],
  meta: { fileName: string; fileSize: number },
): Promise<ImportJob> {
  const now = nowIso();
  const job: ImportJob = {
    id: 'active',
    fileName: meta.fileName,
    fileSize: meta.fileSize,
    mode,
    phase: 'applying',
    applyTable: 'animals',
    applyIndex: 0,
    replaceCleared: false,
    counts: {
      animals: parsed.animals.length,
      cowCalf: parsed.cowCalf.length,
      breeding: parsed.breeding.length,
      treatments: parsed.treatments.length,
      sales: parsed.sales.length,
    },
    createdAt: now,
    updatedAt: now,
  };
  await db.transaction('rw', db.importJobs, db.importTables, async () => {
    await db.importJobs.put(job);
    await db.importTables.bulkPut([
      { name: 'animals', rows: parsed.animals },
      { name: 'cowCalf', rows: parsed.cowCalf },
      { name: 'breeding', rows: parsed.breeding },
      { name: 'treatments', rows: parsed.treatments },
      { name: 'sales', rows: parsed.sales },
    ]);
  });
  return job;
}

export async function saveImportProgress(
  patch: Partial<Omit<ImportJob, 'id'>>,
): Promise<void> {
  await db.importJobs.update('active', { ...patch, updatedAt: nowIso() });
}

export async function loadStagedTable<T>(name: ImportTableName): Promise<T[]> {
  const blob = await db.importTables.get(name);
  return Array.isArray(blob?.rows) ? (blob.rows as T[]) : [];
}

export async function clearImportJob(): Promise<void> {
  await db.transaction('rw', db.importJobs, db.importTables, async () => {
    await db.importJobs.delete('active');
    await db.importTables.clear();
  });
}

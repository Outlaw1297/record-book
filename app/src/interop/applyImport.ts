import {
  db,
  findAnimalByHerdId,
  newId,
  nowIso,
  queueChange,
  upsertAnimalByHerdId,
  type Animal,
  type BreedingService,
  type CowCalfRecord,
  type SaleRecord,
  type TreatmentRecord,
} from '../db/schema';
import { scheduleSync } from '../sync/scheduler';
import type { ParsedHerd } from './parse';

export type ImportMode = 'merge' | 'replace';

export type ImportResult = {
  animals: number;
  cowCalf: number;
  breeding: number;
  treatments: number;
  sales: number;
};

function fresherStamp(): string {
  return nowIso();
}

async function putAnimal(incoming: Animal, mode: ImportMode): Promise<boolean> {
  const existing = await findAnimalByHerdId(incoming.herdId);
  if (existing && mode === 'merge') {
    const merged: Animal = {
      ...incoming,
      ...existing,
      ...Object.fromEntries(
        Object.entries(incoming).filter(([, value]) => value !== undefined && value !== ''),
      ),
      id: existing.id,
      herdId: existing.herdId,
      updatedAt: fresherStamp(),
      deletedAt: undefined,
    };
    await db.animals.put(merged);
    await queueChange('animals', merged.id, 'upsert', merged);
    return true;
  }
  const record: Animal = {
    ...incoming,
    id: existing?.id ?? incoming.id ?? newId(),
    updatedAt: fresherStamp(),
    deletedAt: undefined,
  };
  await db.animals.put(record);
  await queueChange('animals', record.id, 'upsert', record);
  return true;
}

async function putCowCalf(incoming: CowCalfRecord): Promise<void> {
  const existing = await db.cowCalf
    .filter(
      (row) =>
        !row.deletedAt &&
        row.year === incoming.year &&
        row.cowId.toLowerCase() === incoming.cowId.toLowerCase() &&
        (row.calfId || '').toLowerCase() === (incoming.calfId || '').toLowerCase(),
    )
    .first();
  const record: CowCalfRecord = {
    ...incoming,
    id: existing?.id ?? incoming.id,
    updatedAt: fresherStamp(),
    deletedAt: undefined,
  };
  await db.cowCalf.put(record);
  await queueChange('cowCalf', record.id, 'upsert', record);
  await upsertAnimalByHerdId(record.cowId, { animalType: existing ? undefined : 'Cow', sex: 'F' });
  if (record.calfId) {
    const calf = await findAnimalByHerdId(record.calfId);
    await upsertAnimalByHerdId(record.calfId, {
      sex: record.sex || calf?.sex,
      yearBorn: record.year,
      damId: record.cowId,
      sireId: record.sireId,
      birthDate: record.calvingDate,
      birthWeight: record.birthWeight,
      calvingEase: record.calvingEase,
      ...(calf?.animalType ? {} : { animalType: 'Calf' }),
    });
  }
  if (record.sireId && record.sireId !== 'open') {
    await upsertAnimalByHerdId(record.sireId, { sex: 'M', animalType: 'Bull' });
  }
}

async function putBreeding(incoming: BreedingService): Promise<void> {
  const existing = await db.breeding
    .filter(
      (row) =>
        !row.deletedAt &&
        row.year === incoming.year &&
        row.cowId.toLowerCase() === incoming.cowId.toLowerCase() &&
        row.kind === incoming.kind &&
        (row.serviceDate || '') === (incoming.serviceDate || ''),
    )
    .first();
  const record: BreedingService = {
    ...incoming,
    id: existing?.id ?? incoming.id,
    updatedAt: fresherStamp(),
    deletedAt: undefined,
  };
  await db.breeding.put(record);
  await queueChange('breeding', record.id, 'upsert', record);
  await upsertAnimalByHerdId(record.cowId);
  if (record.sireId) await upsertAnimalByHerdId(record.sireId, { sex: 'M' });
}

async function putTreatment(incoming: TreatmentRecord): Promise<void> {
  const existing = await db.treatments
    .filter(
      (row) =>
        !row.deletedAt &&
        row.animalHerdId.toLowerCase() === incoming.animalHerdId.toLowerCase() &&
        (row.date || '') === (incoming.date || '') &&
        (row.product || '').toLowerCase() === (incoming.product || '').toLowerCase(),
    )
    .first();
  const record: TreatmentRecord = {
    ...incoming,
    id: existing?.id ?? incoming.id,
    updatedAt: fresherStamp(),
    deletedAt: undefined,
  };
  await db.treatments.put(record);
  await queueChange('treatments', record.id, 'upsert', record);
  await upsertAnimalByHerdId(record.animalHerdId);
}

async function putSale(incoming: SaleRecord): Promise<void> {
  const existing = await db.sales
    .filter(
      (row) =>
        !row.deletedAt &&
        row.year === incoming.year &&
        row.calfId.toLowerCase() === incoming.calfId.toLowerCase(),
    )
    .first();
  const record: SaleRecord = {
    ...incoming,
    id: existing?.id ?? incoming.id,
    updatedAt: fresherStamp(),
    deletedAt: undefined,
  };
  await db.sales.put(record);
  await queueChange('sales', record.id, 'upsert', record);
  await upsertAnimalByHerdId(record.calfId, { sex: record.sex, status: 'sold' });
}

export async function applyCowSenseImport(
  parsed: ParsedHerd,
  mode: ImportMode,
): Promise<ImportResult> {
  if (mode === 'replace') {
    const now = fresherStamp();
    const animals = await db.animals.filter((row) => !row.deletedAt).toArray();
    for (const row of animals) {
      const next = { ...row, updatedAt: now, deletedAt: now };
      await db.animals.put(next);
      await queueChange('animals', next.id, 'delete', next);
    }
  }
  let animals = 0;
  for (const animal of parsed.animals) {
    await putAnimal(animal, mode);
    animals += 1;
  }
  for (const row of parsed.cowCalf) await putCowCalf(row);
  for (const row of parsed.breeding) await putBreeding(row);
  for (const row of parsed.treatments) await putTreatment(row);
  for (const row of parsed.sales) await putSale(row);
  scheduleSync(parsed.animals.length > 200 ? 2000 : 400);
  return {
    animals,
    cowCalf: parsed.cowCalf.length,
    breeding: parsed.breeding.length,
    treatments: parsed.treatments.length,
    sales: parsed.sales.length,
  };
}

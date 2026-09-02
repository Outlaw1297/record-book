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
import {
  clearSyncProgress,
  logSyncError,
  logSyncInfo,
  setSyncProgress,
} from '../sync/activity';
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
  const existingCount =
    mode === 'replace'
      ? await db.animals.filter((row) => !row.deletedAt).count()
      : 0;
  const total =
    existingCount +
    parsed.animals.length +
    parsed.cowCalf.length +
    parsed.breeding.length +
    parsed.treatments.length +
    parsed.sales.length;
  let done = 0;

  function tick(label: string, forceLog = false, currentInStep?: number, stepTotal?: number) {
    done += 1;
    const show =
      forceLog ||
      done === 1 ||
      done === total ||
      done % 200 === 0;
    setSyncProgress({
      phase: 'import',
      current: done,
      total: Math.max(total, 1),
      label:
        currentInStep != null && stepTotal != null
          ? `${label} (${currentInStep}/${stepTotal})`
          : label,
    });
    if (show) {
      logSyncInfo(
        `${label}` +
          (currentInStep != null && stepTotal != null
            ? ` ${currentInStep}/${stepTotal}`
            : '') +
          ` · ${done}/${Math.max(total, 1)} saved on this device`,
      );
    }
  }

  try {
    logSyncInfo(
      `Import ${mode}: ${parsed.animals.length} animals, ${parsed.cowCalf.length} calving, ${parsed.breeding.length} breeding, ${parsed.treatments.length} treatments, ${parsed.sales.length} sales`,
    );
    if (mode === 'replace') {
      const now = fresherStamp();
      const animals = await db.animals.filter((row) => !row.deletedAt).toArray();
      logSyncInfo(`Replace herd: marking ${animals.length} animals gone`);
      for (let i = 0; i < animals.length; i += 1) {
        const row = animals[i];
        const next = { ...row, updatedAt: now, deletedAt: now };
        await db.animals.put(next);
        await queueChange('animals', next.id, 'delete', next);
        tick('Clearing this ranch’s animals', i === 0, i + 1, animals.length);
      }
    }
    let animals = 0;
    for (const animal of parsed.animals) {
      await putAnimal(animal, mode);
      animals += 1;
      tick('Saving animals', animals === 1, animals, parsed.animals.length);
    }
    let cowCalf = 0;
    for (const row of parsed.cowCalf) {
      await putCowCalf(row);
      cowCalf += 1;
      tick('Saving calving', cowCalf === 1, cowCalf, parsed.cowCalf.length);
    }
    let breeding = 0;
    for (const row of parsed.breeding) {
      await putBreeding(row);
      breeding += 1;
      tick('Saving breeding', breeding === 1, breeding, parsed.breeding.length);
    }
    let treatments = 0;
    for (const row of parsed.treatments) {
      await putTreatment(row);
      treatments += 1;
      tick('Saving treatments', treatments === 1, treatments, parsed.treatments.length);
    }
    let sales = 0;
    for (const row of parsed.sales) {
      await putSale(row);
      sales += 1;
      tick('Saving sales', sales === 1, sales, parsed.sales.length);
    }
    logSyncInfo(
      `Imported ${animals} animals, ${cowCalf} calving, ${breeding} breeding, ${treatments} treatments, ${sales} sales on this device`,
    );
    scheduleSync(parsed.animals.length > 200 ? 2000 : 400);
    return {
      animals,
      cowCalf,
      breeding,
      treatments,
      sales,
    };
  } catch (error) {
    logSyncError(
      'Cow Sense import failed while saving this ranch’s book',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  } finally {
    clearSyncProgress();
  }
}

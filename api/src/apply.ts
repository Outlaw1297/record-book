import { query } from './db.js';
import {
  animalFromDb,
  breedingFromDb,
  cowCalfFromDb,
  pastureAnimalFromDb,
  pastureFromDb,
  ranchFromDb,
  saleFromDb,
} from './maps.js';
import { asBool, asInt, asText, iso } from './util.js';

type Json = Record<string, unknown>;

function writeOutcome(rowCount: number | null): 'applied' | 'kept' {
  return (rowCount ?? 0) > 0 ? 'applied' : 'kept';
}

export async function upsertAnimal(payload: Json): Promise<'applied' | 'kept'> {
  const id = String(payload.id || '');
  if (!id) return 'kept';
  const updatedAt = iso(payload.updatedAt) || new Date().toISOString();
  const result = await query(
    `INSERT INTO animals (
       id, herd_id, tag_color, phenotype, name, sex, status, notes, year_born, updated_at, deleted_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO UPDATE SET
       herd_id = EXCLUDED.herd_id,
       tag_color = EXCLUDED.tag_color,
       phenotype = EXCLUDED.phenotype,
       name = EXCLUDED.name,
       sex = EXCLUDED.sex,
       status = EXCLUDED.status,
       notes = EXCLUDED.notes,
       year_born = EXCLUDED.year_born,
       updated_at = EXCLUDED.updated_at,
       deleted_at = EXCLUDED.deleted_at
     WHERE animals.updated_at <= EXCLUDED.updated_at`,
    [
      id,
      String(payload.herdId ?? ''),
      asText(payload.tagColor),
      asText(payload.phenotype),
      asText(payload.name),
      String(payload.sex ?? ''),
      String(payload.status ?? 'active'),
      asText(payload.notes),
      asInt(payload.yearBorn),
      updatedAt,
      iso(payload.deletedAt),
    ],
  );
  return writeOutcome(result.rowCount);
}

export async function upsertCowCalf(payload: Json): Promise<'applied' | 'kept'> {
  const id = String(payload.id || '');
  if (!id) return 'kept';
  const updatedAt = iso(payload.updatedAt) || new Date().toISOString();
  const result = await query(
    `INSERT INTO cow_calf (
       id, year, calf_id, cow_id, sire_id, sex, calving_date, birth_weight, birth_codes,
       calving_ease, remarks, open_without_calf, flagged, updated_at, deleted_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (id) DO UPDATE SET
       year = EXCLUDED.year,
       calf_id = EXCLUDED.calf_id,
       cow_id = EXCLUDED.cow_id,
       sire_id = EXCLUDED.sire_id,
       sex = EXCLUDED.sex,
       calving_date = EXCLUDED.calving_date,
       birth_weight = EXCLUDED.birth_weight,
       birth_codes = EXCLUDED.birth_codes,
       calving_ease = EXCLUDED.calving_ease,
       remarks = EXCLUDED.remarks,
       open_without_calf = EXCLUDED.open_without_calf,
       flagged = EXCLUDED.flagged,
       updated_at = EXCLUDED.updated_at,
       deleted_at = EXCLUDED.deleted_at
     WHERE cow_calf.updated_at <= EXCLUDED.updated_at`,
    [
      id,
      asInt(payload.year) ?? new Date().getFullYear(),
      asText(payload.calfId),
      String(payload.cowId ?? ''),
      asText(payload.sireId),
      String(payload.sex ?? ''),
      asText(payload.calvingDate),
      asText(payload.birthWeight),
      asText(payload.birthCodes),
      asText(payload.calvingEase),
      asText(payload.remarks),
      asBool(payload.openWithoutCalf),
      asBool(payload.flagged),
      updatedAt,
      iso(payload.deletedAt),
    ],
  );
  return writeOutcome(result.rowCount);
}

export async function upsertBreeding(payload: Json): Promise<'applied' | 'kept'> {
  const id = String(payload.id || '');
  if (!id) return 'kept';
  const updatedAt = iso(payload.updatedAt) || new Date().toISOString();
  const result = await query(
    `INSERT INTO breeding (
       id, year, cow_id, kind, sire_id, service_date, flagged, updated_at, deleted_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET
       year = EXCLUDED.year,
       cow_id = EXCLUDED.cow_id,
       kind = EXCLUDED.kind,
       sire_id = EXCLUDED.sire_id,
       service_date = EXCLUDED.service_date,
       flagged = EXCLUDED.flagged,
       updated_at = EXCLUDED.updated_at,
       deleted_at = EXCLUDED.deleted_at
     WHERE breeding.updated_at <= EXCLUDED.updated_at`,
    [
      id,
      asInt(payload.year) ?? new Date().getFullYear(),
      String(payload.cowId ?? ''),
      String(payload.kind ?? 'pasture'),
      asText(payload.sireId),
      asText(payload.serviceDate),
      asBool(payload.flagged),
      updatedAt,
      iso(payload.deletedAt),
    ],
  );
  return writeOutcome(result.rowCount);
}

export async function upsertPasture(payload: Json): Promise<'applied' | 'kept'> {
  const id = String(payload.id || '');
  if (!id) return 'kept';
  const updatedAt = iso(payload.updatedAt) || new Date().toISOString();
  const result = await query(
    `INSERT INTO pastures (
       id, year, pasture_name, bull_in_date, bull_out_date, notes, updated_at, deleted_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET
       year = EXCLUDED.year,
       pasture_name = EXCLUDED.pasture_name,
       bull_in_date = EXCLUDED.bull_in_date,
       bull_out_date = EXCLUDED.bull_out_date,
       notes = EXCLUDED.notes,
       updated_at = EXCLUDED.updated_at,
       deleted_at = EXCLUDED.deleted_at
     WHERE pastures.updated_at <= EXCLUDED.updated_at`,
    [
      id,
      asInt(payload.year) ?? new Date().getFullYear(),
      String(payload.pastureName ?? ''),
      asText(payload.bullInDate),
      asText(payload.bullOutDate),
      asText(payload.notes),
      updatedAt,
      iso(payload.deletedAt),
    ],
  );
  return writeOutcome(result.rowCount);
}

export async function upsertPastureAnimal(payload: Json): Promise<'applied' | 'kept'> {
  const id = String(payload.id || '');
  if (!id) return 'kept';
  const updatedAt = iso(payload.updatedAt) || new Date().toISOString();
  const result = await query(
    `INSERT INTO pasture_animals (
       id, exposure_id, animal_herd_id, role, note, metric, flagged, updated_at, deleted_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET
       exposure_id = EXCLUDED.exposure_id,
       animal_herd_id = EXCLUDED.animal_herd_id,
       role = EXCLUDED.role,
       note = EXCLUDED.note,
       metric = EXCLUDED.metric,
       flagged = EXCLUDED.flagged,
       updated_at = EXCLUDED.updated_at,
       deleted_at = EXCLUDED.deleted_at
     WHERE pasture_animals.updated_at <= EXCLUDED.updated_at`,
    [
      id,
      String(payload.exposureId ?? ''),
      String(payload.animalHerdId ?? ''),
      String(payload.role ?? 'cow'),
      asText(payload.note),
      asText(payload.metric),
      asBool(payload.flagged),
      updatedAt,
      iso(payload.deletedAt),
    ],
  );
  return writeOutcome(result.rowCount);
}

export async function upsertSale(payload: Json): Promise<'applied' | 'kept'> {
  const id = String(payload.id || '');
  if (!id) return 'kept';
  const updatedAt = iso(payload.updatedAt) || new Date().toISOString();
  const result = await query(
    `INSERT INTO sales (
       id, year, calf_id, sex, buyer, sale_date, price, notes, list_mark, flagged, updated_at, deleted_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (id) DO UPDATE SET
       year = EXCLUDED.year,
       calf_id = EXCLUDED.calf_id,
       sex = EXCLUDED.sex,
       buyer = EXCLUDED.buyer,
       sale_date = EXCLUDED.sale_date,
       price = EXCLUDED.price,
       notes = EXCLUDED.notes,
       list_mark = EXCLUDED.list_mark,
       flagged = EXCLUDED.flagged,
       updated_at = EXCLUDED.updated_at,
       deleted_at = EXCLUDED.deleted_at
     WHERE sales.updated_at <= EXCLUDED.updated_at`,
    [
      id,
      asInt(payload.year) ?? new Date().getFullYear(),
      String(payload.calfId ?? ''),
      String(payload.sex ?? ''),
      asText(payload.buyer),
      asText(payload.saleDate),
      asText(payload.price),
      asText(payload.notes),
      asText(payload.listMark),
      asBool(payload.flagged),
      updatedAt,
      iso(payload.deletedAt),
    ],
  );
  return writeOutcome(result.rowCount);
}

export async function upsertRanch(payload: Json): Promise<'applied' | 'kept'> {
  const updatedAt = iso(payload.updatedAt) || new Date().toISOString();
  const result = await query(
    `INSERT INTO ranch (id, ranch_name, current_year, updated_at)
     VALUES (1, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET
       ranch_name = EXCLUDED.ranch_name,
       current_year = EXCLUDED.current_year,
       updated_at = EXCLUDED.updated_at
     WHERE ranch.updated_at <= EXCLUDED.updated_at`,
    [
      String(payload.ranchName ?? 'Record Book'),
      asInt(payload.currentYear) ?? new Date().getFullYear(),
      updatedAt,
    ],
  );
  return writeOutcome(result.rowCount);
}

export async function upsertDevice(payload: Json): Promise<void> {
  const deviceId = String(payload.deviceId || '');
  if (!deviceId) return;
  await query(
    `INSERT INTO devices (device_id, device_name, operator_name, kind, last_seen_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (device_id) DO UPDATE SET
       device_name = EXCLUDED.device_name,
       operator_name = EXCLUDED.operator_name,
       kind = EXCLUDED.kind,
       last_seen_at = EXCLUDED.last_seen_at`,
    [
      deviceId,
      String(payload.deviceName ?? 'Device'),
      asText(payload.operatorName),
      asText(payload.kind),
      iso(payload.lastSeenAt) || new Date().toISOString(),
    ],
  );
}

export async function applyChange(change: Json): Promise<'applied' | 'kept' | 'skipped'> {
  const entity = String(change.entity || '');
  const op = String(change.op || 'upsert');
  const payload =
    change.payload && typeof change.payload === 'object'
      ? ({ ...(change.payload as Json), id: change.entityId, updatedAt: change.updatedAt } as Json)
      : ({ id: change.entityId, updatedAt: change.updatedAt } as Json);
  if (op === 'delete') payload.deletedAt = payload.deletedAt || change.updatedAt;
  switch (entity) {
    case 'animals':
      return upsertAnimal(payload);
    case 'cowCalf':
      return upsertCowCalf(payload);
    case 'breeding':
      return upsertBreeding(payload);
    case 'pastures':
      return upsertPasture(payload);
    case 'pastureAnimals':
      return upsertPastureAnimal(payload);
    case 'sales':
      return upsertSale(payload);
    case 'settings':
      return upsertRanch(payload);
    default:
      return 'skipped';
  }
}

function asArray(value: unknown): Json[] {
  return Array.isArray(value) ? (value as Json[]) : [];
}

export async function applySnapshot(snapshot: Json): Promise<{ applied: number; kept: number }> {
  let applied = 0;
  let kept = 0;
  const bump = async (result: 'applied' | 'kept') => {
    if (result === 'applied') applied += 1;
    else kept += 1;
  };
  if (snapshot.settings && typeof snapshot.settings === 'object') {
    await bump(await upsertRanch(snapshot.settings as Json));
  }
  for (const row of asArray(snapshot.animals)) await bump(await upsertAnimal(row));
  for (const row of asArray(snapshot.cowCalf)) await bump(await upsertCowCalf(row));
  for (const row of asArray(snapshot.breeding)) await bump(await upsertBreeding(row));
  for (const row of asArray(snapshot.pastures)) await bump(await upsertPasture(row));
  for (const row of asArray(snapshot.pastureAnimals)) await bump(await upsertPastureAnimal(row));
  for (const row of asArray(snapshot.sales)) await bump(await upsertSale(row));
  return { applied, kept };
}

export async function exportSnapshot() {
  const [
    ranch,
    animals,
    cowCalf,
    breeding,
    pastures,
    pastureAnimals,
    sales,
  ] = await Promise.all([
    query('SELECT * FROM ranch WHERE id = 1'),
    query('SELECT * FROM animals ORDER BY lower(herd_id)'),
    query('SELECT * FROM cow_calf ORDER BY year DESC, lower(cow_id)'),
    query('SELECT * FROM breeding ORDER BY year DESC, lower(cow_id)'),
    query('SELECT * FROM pastures ORDER BY year DESC, pasture_name'),
    query('SELECT * FROM pasture_animals ORDER BY exposure_id'),
    query('SELECT * FROM sales ORDER BY year DESC, lower(calf_id)'),
  ]);
  return {
    format: 'record-book-snapshot',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: ranch.rows[0] ? ranchFromDb(ranch.rows[0]) : undefined,
    animals: animals.rows.map(animalFromDb),
    cowCalf: cowCalf.rows.map(cowCalfFromDb),
    breeding: breeding.rows.map(breedingFromDb),
    pastures: pastures.rows.map(pastureFromDb),
    pastureAnimals: pastureAnimals.rows.map(pastureAnimalFromDb),
    sales: sales.rows.map(saleFromDb),
  };
}

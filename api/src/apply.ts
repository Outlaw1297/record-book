import { query, withTransaction } from './db.js';
import {
  animalFromDb,
  breedingFromDb,
  cowCalfFromDb,
  pastureAnimalFromDb,
  pastureFromDb,
  ranchFromDb,
  saleFromDb,
  treatmentFromDb,
} from './maps.js';
import { asBool, asInt, asText, iso, newer } from './util.js';

type Json = Record<string, unknown>;

const DATA_TABLES = [
  'animals',
  'cow_calf',
  'breeding',
  'pastures',
  'pasture_animals',
  'sales',
  'treatments',
] as const;

type DataTable = (typeof DATA_TABLES)[number];

function assertDataTable(table: string): DataTable {
  if (!(DATA_TABLES as readonly string[]).includes(table)) {
    throw new Error(`Invalid table ${table}`);
  }
  return table as DataTable;
}

async function currentUpdatedAt(table: DataTable | string, id: string): Promise<string | null> {
  const safe = assertDataTable(table);
  const result = await query<{ updated_at: Date }>(
    `SELECT updated_at FROM ${safe} WHERE id = $1`,
    [id],
  );
  const value = result.rows[0]?.updated_at;
  return value ? value.toISOString() : null;
}

export async function upsertAnimal(payload: Json): Promise<'applied' | 'kept'> {
  const id = String(payload.id || '');
  if (!id) return 'kept';
  const updatedAt = iso(payload.updatedAt) || new Date().toISOString();
  const local = await currentUpdatedAt('animals', id);
  if (local && !newer(updatedAt, local)) return 'kept';
  await query(
    `INSERT INTO animals (
       id, herd_id, tag_color, phenotype, name, sex, status, notes, year_born,
       animal_type, birth_date, location, group_name, electronic_id, registration,
       tattoo, tattoo_loc, brand, color, breed, horned, birth_type, calving_ease,
       service_type, disposition, body_condition, sire_id, dam_id, birth_weight,
       weaning_weight, weaning_date, yearling_weight, yearling_date, extra_json,
       updated_at, deleted_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
       $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36
     )
     ON CONFLICT (id) DO UPDATE SET
       herd_id = EXCLUDED.herd_id,
       tag_color = EXCLUDED.tag_color,
       phenotype = EXCLUDED.phenotype,
       name = EXCLUDED.name,
       sex = EXCLUDED.sex,
       status = EXCLUDED.status,
       notes = EXCLUDED.notes,
       year_born = EXCLUDED.year_born,
       animal_type = EXCLUDED.animal_type,
       birth_date = EXCLUDED.birth_date,
       location = EXCLUDED.location,
       group_name = EXCLUDED.group_name,
       electronic_id = EXCLUDED.electronic_id,
       registration = EXCLUDED.registration,
       tattoo = EXCLUDED.tattoo,
       tattoo_loc = EXCLUDED.tattoo_loc,
       brand = EXCLUDED.brand,
       color = EXCLUDED.color,
       breed = EXCLUDED.breed,
       horned = EXCLUDED.horned,
       birth_type = EXCLUDED.birth_type,
       calving_ease = EXCLUDED.calving_ease,
       service_type = EXCLUDED.service_type,
       disposition = EXCLUDED.disposition,
       body_condition = EXCLUDED.body_condition,
       sire_id = EXCLUDED.sire_id,
       dam_id = EXCLUDED.dam_id,
       birth_weight = EXCLUDED.birth_weight,
       weaning_weight = EXCLUDED.weaning_weight,
       weaning_date = EXCLUDED.weaning_date,
       yearling_weight = EXCLUDED.yearling_weight,
       yearling_date = EXCLUDED.yearling_date,
       extra_json = EXCLUDED.extra_json,
       updated_at = EXCLUDED.updated_at,
       deleted_at = EXCLUDED.deleted_at`,
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
      asText(payload.animalType),
      asText(payload.birthDate),
      asText(payload.location),
      asText(payload.groupName),
      asText(payload.electronicId),
      asText(payload.registration),
      asText(payload.tattoo),
      asText(payload.tattooLoc),
      asText(payload.brand),
      asText(payload.color),
      asText(payload.breed),
      asText(payload.horned),
      asText(payload.birthType),
      asText(payload.calvingEase),
      asText(payload.serviceType),
      asText(payload.disposition),
      asText(payload.bodyCondition),
      asText(payload.sireId),
      asText(payload.damId),
      asText(payload.birthWeight),
      asText(payload.weaningWeight),
      asText(payload.weaningDate),
      asText(payload.yearlingWeight),
      asText(payload.yearlingDate),
      asText(payload.extraJson),
      updatedAt,
      iso(payload.deletedAt),
    ],
  );
  return 'applied';
}

export async function upsertCowCalf(payload: Json): Promise<'applied' | 'kept'> {
  const id = String(payload.id || '');
  if (!id) return 'kept';
  const updatedAt = iso(payload.updatedAt) || new Date().toISOString();
  const local = await currentUpdatedAt('cow_calf', id);
  if (local && !newer(updatedAt, local)) return 'kept';
  await query(
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
       deleted_at = EXCLUDED.deleted_at`,
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
  return 'applied';
}

export async function upsertBreeding(payload: Json): Promise<'applied' | 'kept'> {
  const id = String(payload.id || '');
  if (!id) return 'kept';
  const updatedAt = iso(payload.updatedAt) || new Date().toISOString();
  const local = await currentUpdatedAt('breeding', id);
  if (local && !newer(updatedAt, local)) return 'kept';
  await query(
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
       deleted_at = EXCLUDED.deleted_at`,
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
  return 'applied';
}

export async function upsertPasture(payload: Json): Promise<'applied' | 'kept'> {
  const id = String(payload.id || '');
  if (!id) return 'kept';
  const updatedAt = iso(payload.updatedAt) || new Date().toISOString();
  const local = await currentUpdatedAt('pastures', id);
  if (local && !newer(updatedAt, local)) return 'kept';
  await query(
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
       deleted_at = EXCLUDED.deleted_at`,
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
  return 'applied';
}

export async function upsertPastureAnimal(payload: Json): Promise<'applied' | 'kept'> {
  const id = String(payload.id || '');
  if (!id) return 'kept';
  const updatedAt = iso(payload.updatedAt) || new Date().toISOString();
  const local = await currentUpdatedAt('pasture_animals', id);
  if (local && !newer(updatedAt, local)) return 'kept';
  await query(
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
       deleted_at = EXCLUDED.deleted_at`,
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
  return 'applied';
}

export async function upsertSale(payload: Json): Promise<'applied' | 'kept'> {
  const id = String(payload.id || '');
  if (!id) return 'kept';
  const updatedAt = iso(payload.updatedAt) || new Date().toISOString();
  const local = await currentUpdatedAt('sales', id);
  if (local && !newer(updatedAt, local)) return 'kept';
  await query(
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
       deleted_at = EXCLUDED.deleted_at`,
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
  return 'applied';
}

export async function upsertTreatment(payload: Json): Promise<'applied' | 'kept'> {
  const id = String(payload.id || '');
  if (!id) return 'kept';
  const updatedAt = iso(payload.updatedAt) || new Date().toISOString();
  const local = await currentUpdatedAt('treatments', id);
  if (local && !newer(updatedAt, local)) return 'kept';
  await query(
    `INSERT INTO treatments (
       id, animal_herd_id, date, product, dose, route, location, withdrawal, notes, updated_at, deleted_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO UPDATE SET
       animal_herd_id = EXCLUDED.animal_herd_id,
       date = EXCLUDED.date,
       product = EXCLUDED.product,
       dose = EXCLUDED.dose,
       route = EXCLUDED.route,
       location = EXCLUDED.location,
       withdrawal = EXCLUDED.withdrawal,
       notes = EXCLUDED.notes,
       updated_at = EXCLUDED.updated_at,
       deleted_at = EXCLUDED.deleted_at`,
    [
      id,
      String(payload.animalHerdId ?? ''),
      asText(payload.date),
      asText(payload.product),
      asText(payload.dose),
      asText(payload.route),
      asText(payload.location),
      asText(payload.withdrawal),
      asText(payload.notes),
      updatedAt,
      iso(payload.deletedAt),
    ],
  );
  return 'applied';
}

export async function upsertRanch(payload: Json): Promise<'applied' | 'kept'> {
  const updatedAt = iso(payload.updatedAt) || new Date().toISOString();
  const local = await query<{ updated_at: Date }>('SELECT updated_at FROM ranch WHERE id = 1');
  const current = local.rows[0]?.updated_at?.toISOString() ?? null;
  if (current && !newer(updatedAt, current)) return 'kept';
  await query(
    `INSERT INTO ranch (id, ranch_name, current_year, updated_at)
     VALUES (1, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET
       ranch_name = EXCLUDED.ranch_name,
       current_year = EXCLUDED.current_year,
       updated_at = EXCLUDED.updated_at`,
    [
      String(payload.ranchName ?? 'Record Book'),
      asInt(payload.currentYear) ?? new Date().getFullYear(),
      updatedAt,
    ],
  );
  return 'applied';
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
    case 'treatments':
      return upsertTreatment(payload);
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
  return withTransaction(async () => {
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
    for (const row of asArray(snapshot.treatments)) await bump(await upsertTreatment(row));
    return { applied, kept };
  });
}

const EXPORT_COLLECTIONS = {
  animals: { table: 'animals', fromDb: animalFromDb },
  cowCalf: { table: 'cow_calf', fromDb: cowCalfFromDb },
  breeding: { table: 'breeding', fromDb: breedingFromDb },
  pastures: { table: 'pastures', fromDb: pastureFromDb },
  pastureAnimals: { table: 'pasture_animals', fromDb: pastureAnimalFromDb },
  sales: { table: 'sales', fromDb: saleFromDb },
  treatments: { table: 'treatments', fromDb: treatmentFromDb },
} as const;

export type ExportCollectionKey = keyof typeof EXPORT_COLLECTIONS;

export function isExportCollectionKey(value: string): value is ExportCollectionKey {
  return Object.prototype.hasOwnProperty.call(EXPORT_COLLECTIONS, value);
}

export const EXPORT_PAGE_MAX = 2000;

export async function exportMeta() {
  const ranch = await query('SELECT * FROM ranch WHERE id = 1');
  const entries = await Promise.all(
    (Object.keys(EXPORT_COLLECTIONS) as ExportCollectionKey[]).map(async (key) => {
      const result = await query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${EXPORT_COLLECTIONS[key].table}`,
      );
      return [key, result.rows[0]?.n ?? 0] as const;
    }),
  );
  return {
    format: 'record-book-export-meta' as const,
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: ranch.rows[0] ? ranchFromDb(ranch.rows[0]) : undefined,
    counts: Object.fromEntries(entries) as Record<ExportCollectionKey, number>,
  };
}

export async function exportCollection(
  key: ExportCollectionKey,
  limit: number,
  offset: number,
) {
  const spec = EXPORT_COLLECTIONS[key];
  const safeLimit = Math.min(EXPORT_PAGE_MAX, Math.max(1, limit));
  const safeOffset = Math.max(0, offset);
  const [countResult, rowsResult] = await Promise.all([
    query<{ n: number }>(`SELECT count(*)::int AS n FROM ${spec.table}`),
    query(`SELECT * FROM ${spec.table} ORDER BY id LIMIT $1 OFFSET $2`, [
      safeLimit,
      safeOffset,
    ]),
  ]);
  return {
    table: key,
    total: countResult.rows[0]?.n ?? 0,
    offset: safeOffset,
    limit: safeLimit,
    rows: rowsResult.rows.map((row) => spec.fromDb(row)),
  };
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
    treatments,
  ] = await Promise.all([
    query('SELECT * FROM ranch WHERE id = 1'),
    query('SELECT * FROM animals ORDER BY id'),
    query('SELECT * FROM cow_calf ORDER BY id'),
    query('SELECT * FROM breeding ORDER BY id'),
    query('SELECT * FROM pastures ORDER BY id'),
    query('SELECT * FROM pasture_animals ORDER BY id'),
    query('SELECT * FROM sales ORDER BY id'),
    query('SELECT * FROM treatments ORDER BY id'),
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
    treatments: treatments.rows.map(treatmentFromDb),
  };
}

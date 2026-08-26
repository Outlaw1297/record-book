import { asBool, asInt, asText, iso } from './util.js';

type Row = Record<string, unknown>;

function stamp(row: Row): { updatedAt: string; deletedAt?: string } {
  const updatedAt = iso(row.updated_at || row.updatedAt) || new Date().toISOString();
  const deleted = iso(row.deleted_at || row.deletedAt);
  return deleted ? { updatedAt, deletedAt: deleted } : { updatedAt };
}

export function animalFromDb(row: Row) {
  return {
    id: String(row.id),
    herdId: String(row.herd_id ?? ''),
    tagColor: asText(row.tag_color),
    phenotype: asText(row.phenotype),
    name: asText(row.name),
    sex: String(row.sex ?? ''),
    status: String(row.status ?? 'active'),
    notes: asText(row.notes),
    yearBorn: asInt(row.year_born) ?? undefined,
    ...stamp(row),
  };
}

export function cowCalfFromDb(row: Row) {
  return {
    id: String(row.id),
    year: Number(row.year),
    calfId: asText(row.calf_id) ?? undefined,
    cowId: String(row.cow_id ?? ''),
    sireId: asText(row.sire_id) ?? undefined,
    sex: String(row.sex ?? ''),
    calvingDate: asText(row.calving_date) ?? undefined,
    birthWeight: asText(row.birth_weight) ?? undefined,
    birthCodes: asText(row.birth_codes) ?? undefined,
    calvingEase: asText(row.calving_ease) ?? undefined,
    remarks: asText(row.remarks) ?? undefined,
    openWithoutCalf: asBool(row.open_without_calf),
    flagged: asBool(row.flagged),
    ...stamp(row),
  };
}

export function breedingFromDb(row: Row) {
  return {
    id: String(row.id),
    year: Number(row.year),
    cowId: String(row.cow_id ?? ''),
    kind: String(row.kind ?? 'pasture'),
    sireId: asText(row.sire_id) ?? undefined,
    serviceDate: asText(row.service_date) ?? undefined,
    flagged: asBool(row.flagged),
    ...stamp(row),
  };
}

export function pastureFromDb(row: Row) {
  return {
    id: String(row.id),
    year: Number(row.year),
    pastureName: String(row.pasture_name ?? ''),
    bullInDate: asText(row.bull_in_date) ?? undefined,
    bullOutDate: asText(row.bull_out_date) ?? undefined,
    notes: asText(row.notes) ?? undefined,
    ...stamp(row),
  };
}

export function pastureAnimalFromDb(row: Row) {
  return {
    id: String(row.id),
    exposureId: String(row.exposure_id ?? ''),
    animalHerdId: String(row.animal_herd_id ?? ''),
    role: String(row.role ?? 'cow'),
    note: asText(row.note) ?? undefined,
    metric: asText(row.metric) ?? undefined,
    flagged: asBool(row.flagged),
    ...stamp(row),
  };
}

export function saleFromDb(row: Row) {
  return {
    id: String(row.id),
    year: Number(row.year),
    calfId: String(row.calf_id ?? ''),
    sex: String(row.sex ?? ''),
    buyer: asText(row.buyer) ?? undefined,
    saleDate: asText(row.sale_date) ?? undefined,
    price: asText(row.price) ?? undefined,
    notes: asText(row.notes) ?? undefined,
    listMark: asText(row.list_mark) ?? undefined,
    flagged: asBool(row.flagged),
    ...stamp(row),
  };
}

export function ranchFromDb(row: Row) {
  return {
    ranchName: String(row.ranch_name ?? 'Record Book'),
    currentYear: Number(row.current_year),
    updatedAt: iso(row.updated_at) || new Date().toISOString(),
  };
}

export function deviceFromDb(row: Row) {
  return {
    deviceId: String(row.device_id),
    deviceName: String(row.device_name ?? 'Device'),
    operatorName: asText(row.operator_name) ?? undefined,
    kind: asText(row.kind) ?? undefined,
    lastSeenAt: iso(row.last_seen_at) || new Date().toISOString(),
  };
}

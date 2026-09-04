import { Buffer } from 'buffer';
import MDBReader from 'mdb-reader';
import type { Animal, BreedingKind, BreedingService, CowCalfRecord, SaleRecord, TreatmentRecord } from '../db/schema';
import {
  normalizeDate,
  sexFromCowSense,
  statusFromCowSense,
  yearFromDate,
} from './fields';
import type { ParsedHerd } from './parse';

export type JetRow = Record<string, unknown>;

const STAMP = '1970-01-01T00:00:00.000Z';
const IDENTITY_TABLES = ['Animal_Identity', 'Animal Identity'];
const EXTRA_IDENTITY = [
  'GUID',
  'Sex',
  'Status',
  'DisposalType',
  'DisposalReason',
  'DisposalStage',
  'Origin',
  'Cost',
  'Breeder',
  'CurOwner',
  'TypeCode',
  'SexCode',
  'Season',
] as const;

function ensureBuffer(): void {
  const global = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
  if (!global.Buffer) global.Buffer = Buffer;
}

export function isJetDatabase(bytes: Uint8Array): boolean {
  const ascii = new TextDecoder('latin1').decode(bytes.slice(0, 32));
  return ascii.includes('Standard Jet DB') || ascii.startsWith('\x00\x01\x00\x00Standard');
}

export function cellText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'string') return value.split('\0').join('').trim();
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return '';
  return String(value).trim();
}

export function guidKey(value: unknown): string {
  return cellText(value).replace(/[{}]/g, '').trim().toUpperCase();
}

function stableId(kind: string, ...parts: string[]): string {
  return `cs:${kind}:${parts.map((part) => part.trim().toLowerCase()).join('|')}`;
}

function blank(value: string): string | undefined {
  return value || undefined;
}

function statusRank(status: string): number {
  const key = status.toLowerCase();
  if (key === 'active') return 0;
  if (key === 'reference') return 1;
  return 2;
}

function allocateHerdIds(identities: JetRow[]): Map<string, string> {
  const byGuid = new Map<string, string>();
  const used = new Set<string>();
  const rows = [...identities].sort((a, b) => {
    const rank = statusRank(cellText(a.Status)) - statusRank(cellText(b.Status));
    if (rank !== 0) return rank;
    return cellText(a.VisualTag).localeCompare(cellText(b.VisualTag));
  });
  for (const row of rows) {
    const guid = guidKey(row.GUID);
    if (!guid) continue;
    const tag = cellText(row.VisualTag);
    const name = cellText(row.Name);
    const year = yearFromDate(normalizeDate(cellText(row.BirthDate)));
    const candidates = [
      tag,
      tag && year ? `${tag}-${year}` : '',
      name && name.toLowerCase() !== tag.toLowerCase() ? name : '',
      tag ? `${tag}-${guid.slice(-6)}` : `CS-${guid.slice(-8)}`,
    ].filter(Boolean);
    let herdId = candidates[candidates.length - 1] as string;
    for (const candidate of candidates) {
      const key = candidate.toLowerCase();
      if (!used.has(key)) {
        herdId = candidate;
        break;
      }
    }
    used.add(herdId.toLowerCase());
    byGuid.set(guid, herdId);
  }
  return byGuid;
}

function extraJson(values: Record<string, string>): string | undefined {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value) clean[key] = value;
  }
  return Object.keys(clean).length ? JSON.stringify(clean) : undefined;
}

function breedingKind(value: string): BreedingKind {
  const key = value.toLowerCase();
  if (key.includes('ai') || key.includes('artificial')) return 'ai1';
  return 'pasture';
}

function latestMeasures(rows: JetRow[]): Map<string, Map<string, JetRow>> {
  const byGuid = new Map<string, Map<string, JetRow>>();
  for (const row of rows) {
    const guid = guidKey(row.LinkIdentity);
    const field = cellText(row.SourceField);
    if (!guid || !field) continue;
    const stamp = cellText(row.MeasureDate);
    const fields = byGuid.get(guid) ?? new Map<string, JetRow>();
    const previous = fields.get(field);
    if (!previous || cellText(previous.MeasureDate) <= stamp) fields.set(field, row);
    byGuid.set(guid, fields);
  }
  return byGuid;
}

function notesByGuid(rows: JetRow[]): Map<string, string> {
  const grouped = new Map<string, JetRow[]>();
  for (const row of rows) {
    const guid = guidKey(row.LinkIdentity);
    if (!guid || !cellText(row.NoteText)) continue;
    const list = grouped.get(guid) ?? [];
    list.push(row);
    grouped.set(guid, list);
  }
  const notes = new Map<string, string>();
  for (const [guid, list] of grouped) {
    list.sort((a, b) => cellText(a.NoteDate).localeCompare(cellText(b.NoteDate)));
    notes.set(
      guid,
      list
        .map((row) => {
          const date = normalizeDate(cellText(row.NoteDate));
          const text = cellText(row.NoteText);
          return date ? `${date}: ${text}` : text;
        })
        .join('\n'),
    );
  }
  return notes;
}

function traitsByGuid(rows: JetRow[]): Map<string, JetRow> {
  const map = new Map<string, JetRow>();
  for (const row of rows) {
    const guid = guidKey(row.LinkIdentity);
    if (guid) map.set(guid, row);
  }
  return map;
}

function measureValue(row: JetRow | undefined): string {
  if (!row) return '';
  return cellText(row.MeasureValue) || cellText(row.MeasureValueTxt);
}

function animalsFromDamBirth(animals: Animal[]): CowCalfRecord[] {
  const rows: CowCalfRecord[] = [];
  for (const animal of animals) {
    if (!animal.damId || !animal.birthDate) continue;
    const year = animal.yearBorn ?? yearFromDate(animal.birthDate) ?? new Date().getFullYear();
    rows.push({
      id: stableId('calving', String(year), animal.damId, animal.herdId),
      year,
      cowId: animal.damId,
      calfId: animal.herdId,
      sireId: animal.sireId,
      sex: animal.sex,
      calvingDate: animal.birthDate,
      birthWeight: animal.birthWeight,
      calvingEase: animal.calvingEase,
      openWithoutCalf: false,
      flagged: false,
      updatedAt: STAMP,
    });
  }
  return rows;
}

export function mapCowSenseJetTables(tables: Record<string, JetRow[]>): ParsedHerd {
  const identities = IDENTITY_TABLES.map((name) => tables[name] || []).find((rows) => rows.length > 0) || [];
  const herdIds = allocateHerdIds(identities);
  const traits = traitsByGuid(tables.Anim_Traits || []);
  const measures = latestMeasures(tables.Anim_Measures || []);
  const notes = notesByGuid(tables.Anim_Notes || []);
  const animals: Animal[] = [];
  const warnings: string[] = [];

  for (const row of identities) {
    const guid = guidKey(row.GUID);
    const herdId = herdIds.get(guid);
    if (!herdId) continue;
    const trait = traits.get(guid);
    const weight = measures.get(guid);
    const birth = normalizeDate(cellText(row.BirthDate));
    const comment = cellText(row.Comment);
    const extra: Record<string, string> = {};
    for (const key of EXTRA_IDENTITY) {
      extra[key] = cellText(row[key]);
    }
    extra['Disposal Type'] = cellText(row.DisposalType);
    if (trait) {
      for (const key of [
        'PregCode',
        'PregDays',
        'PregDate',
        'EPD_BW',
        'EPD_WW',
        'EPD_YW',
        'EPD_MK',
      ] as const) {
        extra[key] = cellText(trait[key]);
      }
    }
    const current = weight?.get('Current Wt');
    if (current) {
      extra['Current Wt'] = measureValue(current);
      extra['Current Wt Date'] = normalizeDate(cellText(current.MeasureDate)) || '';
    }
    animals.push({
      id: stableId('animal', guid),
      herdId,
      electronicId: blank(cellText(row.EID)),
      name: blank(cellText(row.Name)),
      sex: sexFromCowSense(cellText(row.Sex)),
      status: statusFromCowSense(cellText(row.Status) || 'Active', cellText(row.DisposalType)),
      animalType: blank(cellText(row.Type)),
      birthDate: birth,
      yearBorn: yearFromDate(birth),
      location: blank(cellText(row.Location)),
      groupName: blank(cellText(row.SCRGroupName)),
      sireId: blank(herdIds.get(guidKey(row.LinkSire)) || ''),
      damId: blank(herdIds.get(guidKey(row.LinkDam)) || ''),
      registration: blank(cellText(row.OrgRegPrimary)),
      tattoo: blank(cellText(row.Tattoo1)),
      tattooLoc: blank(cellText(row.Tattoo1Loc)),
      brand: blank(cellText(row.Brand)),
      color: blank(cellText(trait?.ColorCode)),
      breed: blank(cellText(trait?.Brd1)),
      horned: blank(cellText(trait?.HornCode)),
      birthType: blank(cellText(trait?.TwinCode)),
      calvingEase: blank(cellText(trait?.CalvingEase)),
      serviceType: blank(cellText(trait?.ServiceType)),
      disposition: blank(cellText(trait?.DocilityScore)),
      bodyCondition: blank(cellText(trait?.ConditionCode)),
      birthWeight: blank(measureValue(weight?.get('Birth Weight'))),
      weaningWeight: blank(measureValue(weight?.get('Weaning Weight'))),
      weaningDate: blank(normalizeDate(cellText(weight?.get('Weaning Weight')?.MeasureDate)) || ''),
      yearlingWeight: blank(measureValue(weight?.get('Yearling Weight'))),
      yearlingDate: blank(normalizeDate(cellText(weight?.get('Yearling Weight')?.MeasureDate)) || ''),
      notes: blank(notes.get(guid) || comment),
      phenotype: blank(comment),
      extraJson: extraJson(extra),
      updatedAt: STAMP,
    });
  }

  const breeding: BreedingService[] = [];
  for (const row of tables.Anim_Breeding || []) {
    const cowId = herdIds.get(guidKey(row.LinkIdentity));
    if (!cowId) continue;
    const serviceDate = normalizeDate(cellText(row.BreedingDate));
    const year = yearFromDate(serviceDate) ?? new Date().getFullYear();
    const kind = breedingKind(cellText(row.BreedingType));
    breeding.push({
      id: stableId('breeding', guidKey(row.BreedingGUID) || `${cowId}|${serviceDate}|${kind}`),
      year,
      cowId,
      kind,
      sireId: blank(herdIds.get(guidKey(row.LinkSire)) || ''),
      serviceDate,
      flagged: false,
      updatedAt: STAMP,
    });
  }

  const headers = new Map<string, JetRow>();
  for (const row of tables.Treat_Header || []) {
    const key = guidKey(row.TreatGUID);
    if (key) headers.set(key, row);
  }
  const details = new Map<string, JetRow[]>();
  for (const row of tables.Treat_Detail || []) {
    const key = guidKey(row.LinkTreatHeader);
    if (!key) continue;
    const list = details.get(key) ?? [];
    list.push(row);
    details.set(key, list);
  }
  const treatments: TreatmentRecord[] = [];
  for (const row of tables.Treat_Index || []) {
    const animalHerdId = herdIds.get(guidKey(row.LinkIdentity));
    const header = headers.get(guidKey(row.LinkTreatHeader));
    if (!animalHerdId || !header) continue;
    const date = normalizeDate(cellText(header.TreatDate));
    const items = details.get(guidKey(header.TreatGUID));
    const lines = items && items.length > 0 ? items : [undefined];
    lines.forEach((item, index) => {
      const product = cellText(item?.ItemID) || cellText(header.TreatTag) || cellText(header.TreatClass);
      const notesText = [cellText(header.TreatNote), cellText(item?.DetailNote)].filter(Boolean).join(' · ');
      treatments.push({
        id: stableId(
          'tx',
          guidKey(header.TreatGUID),
          animalHerdId,
          String(index),
          cellText(item?.Index),
        ),
        animalHerdId,
        date,
        product: blank(product),
        dose: blank(cellText(item?.ItemDosage)),
        route: blank(cellText(item?.ItemRoute)),
        location: blank(cellText(item?.ItemLocation)),
        notes: blank(notesText),
        updatedAt: STAMP,
      });
    });
  }

  const sales: SaleRecord[] = [];
  for (const row of tables.Anim_Sales || []) {
    const calfId = herdIds.get(guidKey(row.LinkIdentity));
    if (!calfId) continue;
    const saleDate = normalizeDate(cellText(row.DateSold) || cellText(row.SaleDate));
    const year = yearFromDate(saleDate) ?? new Date().getFullYear();
    sales.push({
      id: stableId('sale', guidKey(row.Index) || calfId, saleDate || ''),
      year,
      calfId,
      sex: sexFromCowSense(cellText(row.SaleClass)),
      buyer: blank(cellText(row.BuyerName)),
      saleDate,
      price: blank(cellText(row.SalePrice).replace(/\.0+$/, '')),
      notes: blank(cellText(row.SaleNote)),
      flagged: false,
      updatedAt: STAMP,
    });
  }

  if (identities.length === 0) {
    warnings.push(
      'This Access file has no Animal_Identity table. Export Manage → List as CSV and drop that here.',
    );
  }

  return {
    format: 'access',
    magic: 'Standard Jet DB',
    animals,
    cowCalf: animalsFromDamBirth(animals),
    breeding,
    treatments,
    sales,
    unmappedColumns: [],
    warnings,
    tables: Object.keys(tables).filter((name) => (tables[name] || []).length > 0),
  };
}

function readTable(reader: MDBReader, name: string): JetRow[] {
  try {
    return reader.getTable(name).getData() as JetRow[];
  } catch {
    return [];
  }
}

export function parseJetHerd(bytes: Uint8Array): ParsedHerd {
  ensureBuffer();
  const buffer = Buffer.from(bytes);
  const reader = new MDBReader(buffer);
  const names = reader.getTableNames();
  const tables: Record<string, JetRow[]> = {};
  const wanted = new Set([
    ...IDENTITY_TABLES,
    'Anim_Traits',
    'Anim_Measures',
    'Anim_Breeding',
    'Anim_Notes',
    'Anim_Sales',
    'Treat_Header',
    'Treat_Detail',
    'Treat_Index',
  ]);
  for (const name of names) {
    if (wanted.has(name)) tables[name] = readTable(reader, name);
  }
  const parsed = mapCowSenseJetTables(tables);
  parsed.tables = names;
  if (bytes.byteLength > 40_000_000) {
    parsed.warnings.unshift(
      'This Cow Sense file is large. Import on a computer if a phone runs out of memory. HerdLedger only reads a copy; it does not change the original .csh.',
    );
  }
  return parsed;
}

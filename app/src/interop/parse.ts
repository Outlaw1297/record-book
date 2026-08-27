import type { Animal, BreedingKind, BreedingService, CowCalfRecord, SaleRecord, Sex, TreatmentRecord } from '../db/schema';
import { decodeSpreadsheetBytes, parseCsv, type CsvTable } from './csv';
import {
  mapAnimalHeader,
  mapBreedingHeader,
  mapCalvingHeader,
  mapSaleHeader,
  mapTreatmentHeader,
  normalizeDate,
  sexFromCowSense,
  statusFromCowSense,
  yearFromDate,
  type AnimalField,
} from './fields';
import { isJetDatabase, parseJetHerd } from './jet';

export type CowSenseFormat =
  | 'csv'
  | 'tsv'
  | 'json'
  | 'sqlite'
  | 'sqlce'
  | 'access'
  | 'zip'
  | 'csh-unknown'
  | 'empty';

export type ParsedHerd = {
  format: CowSenseFormat;
  magic: string;
  animals: Animal[];
  cowCalf: CowCalfRecord[];
  breeding: BreedingService[];
  treatments: TreatmentRecord[];
  sales: SaleRecord[];
  unmappedColumns: string[];
  warnings: string[];
  tables: string[];
};

const STAMP = '1970-01-01T00:00:00.000Z';

function magicLabel(bytes: Uint8Array): string {
  const head = Array.from(bytes.slice(0, 16))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(' ');
  const ascii = Array.from(bytes.slice(0, 16))
    .map((byte) => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '.'))
    .join('');
  return `${head} (${ascii})`;
}

function detectFormat(bytes: Uint8Array): CowSenseFormat {
  if (bytes.length === 0) return 'empty';
  const ascii = new TextDecoder('latin1').decode(bytes.slice(0, 32));
  if (ascii.startsWith('SQLite format 3')) return 'sqlite';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'zip';
  if (isJetDatabase(bytes)) return 'access';
  if (ascii.toLowerCase().includes('sql server compact') || ascii.includes('SDF Format')) {
    return 'sqlce';
  }
  return 'csh-unknown';
}

function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    return true;
  }
  const sample = bytes.slice(0, Math.min(bytes.length, 800));
  let printable = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte !== 127)) printable += 1;
  }
  return printable / Math.max(sample.length, 1) > 0.85;
}

function emptyHerd(format: CowSenseFormat, magic: string, warnings: string[] = []): ParsedHerd {
  return {
    format,
    magic,
    animals: [],
    cowCalf: [],
    breeding: [],
    treatments: [],
    sales: [],
    unmappedColumns: [],
    warnings,
    tables: [],
  };
}

function rowObject(headers: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((header, index) => {
    record[header] = row[index] ?? '';
  });
  return record;
}

function pick(row: Record<string, string>, mapped: Map<string, string>, key: string): string {
  for (const [header, field] of mapped) {
    if (field === key && row[header]?.trim()) return row[header].trim();
  }
  return '';
}

function classifyTable(headers: string[]): 'animals' | 'calving' | 'breeding' | 'treatments' | 'sales' {
  const animalHits = headers.filter((header) => mapAnimalHeader(header)).length;
  const calvingHits = headers.filter((header) => mapCalvingHeader(header)).length;
  const breedingHits = headers.filter((header) => mapBreedingHeader(header)).length;
  const treatmentHits = headers.filter((header) => mapTreatmentHeader(header)).length;
  const saleHits = headers.filter((header) => mapSaleHeader(header)).length;
  const scores: Array<['animals' | 'calving' | 'breeding' | 'treatments' | 'sales', number]> = [
    ['animals', animalHits],
    ['calving', calvingHits],
    ['breeding', breedingHits],
    ['treatments', treatmentHits],
    ['sales', saleHits],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  const names = headers.map((header) => header.toLowerCase()).join(' ');
  if (names.includes('product') || names.includes('dose') || names.includes('withdrawal')) {
    return 'treatments';
  }
  if (names.includes('buyer') || names.includes('sold')) return 'sales';
  if (names.includes('service date') || names.includes('breeding date')) return 'breeding';
  if (names.includes('calf') && names.includes('cow')) return 'calving';
  return scores[0][1] > 0 ? scores[0][0] : 'animals';
}

function stableId(kind: string, ...parts: string[]): string {
  return `cs:${kind}:${parts.map((part) => part.trim().toLowerCase()).join('|')}`;
}

function animalFromRow(
  row: Record<string, string>,
  mapped: Map<string, AnimalField>,
  extraHeaders: string[],
): Animal | null {
  const herdId = pick(row, mapped as Map<string, string>, 'herdId');
  if (!herdId) return null;
  const extra: Record<string, string> = {};
  for (const header of extraHeaders) {
    if (row[header]?.trim()) extra[header] = row[header].trim();
  }
  const birthDate = normalizeDate(pick(row, mapped as Map<string, string>, 'birthDate'));
  const yearBornRaw = pick(row, mapped as Map<string, string>, 'yearBorn');
  const yearBorn = yearBornRaw ? Number(yearBornRaw) || yearFromDate(yearBornRaw) : yearFromDate(birthDate);
  const sexValue = pick(row, mapped as Map<string, string>, 'sex');
  const statusValue = pick(row, mapped as Map<string, string>, 'status');
  const disposalType =
    extra.DisposalType ||
    extra['Disposal Type'] ||
    extra.disposalType ||
    '';
  return {
    id: stableId('animal', herdId),
    herdId,
    electronicId: pick(row, mapped as Map<string, string>, 'electronicId') || undefined,
    name: pick(row, mapped as Map<string, string>, 'name') || undefined,
    sex: sexFromCowSense(sexValue),
    status: statusFromCowSense(statusValue || 'Active', disposalType),
    animalType: pick(row, mapped as Map<string, string>, 'animalType') || undefined,
    birthDate,
    yearBorn,
    location: pick(row, mapped as Map<string, string>, 'location') || undefined,
    groupName: pick(row, mapped as Map<string, string>, 'groupName') || undefined,
    sireId: pick(row, mapped as Map<string, string>, 'sireId') || undefined,
    damId: pick(row, mapped as Map<string, string>, 'damId') || undefined,
    registration: pick(row, mapped as Map<string, string>, 'registration') || undefined,
    tattoo: pick(row, mapped as Map<string, string>, 'tattoo') || undefined,
    tattooLoc: pick(row, mapped as Map<string, string>, 'tattooLoc') || undefined,
    brand: pick(row, mapped as Map<string, string>, 'brand') || undefined,
    color: pick(row, mapped as Map<string, string>, 'color') || undefined,
    breed: pick(row, mapped as Map<string, string>, 'breed') || undefined,
    horned: pick(row, mapped as Map<string, string>, 'horned') || undefined,
    birthType: pick(row, mapped as Map<string, string>, 'birthType') || undefined,
    calvingEase: pick(row, mapped as Map<string, string>, 'calvingEase') || undefined,
    serviceType: pick(row, mapped as Map<string, string>, 'serviceType') || undefined,
    disposition: pick(row, mapped as Map<string, string>, 'disposition') || undefined,
    bodyCondition: pick(row, mapped as Map<string, string>, 'bodyCondition') || undefined,
    birthWeight: pick(row, mapped as Map<string, string>, 'birthWeight') || undefined,
    weaningWeight: pick(row, mapped as Map<string, string>, 'weaningWeight') || undefined,
    weaningDate: normalizeDate(pick(row, mapped as Map<string, string>, 'weaningDate')),
    yearlingWeight: pick(row, mapped as Map<string, string>, 'yearlingWeight') || undefined,
    yearlingDate: normalizeDate(pick(row, mapped as Map<string, string>, 'yearlingDate')),
    notes: pick(row, mapped as Map<string, string>, 'notes') || undefined,
    phenotype: pick(row, mapped as Map<string, string>, 'phenotype') || undefined,
    tagColor: pick(row, mapped as Map<string, string>, 'tagColor') || undefined,
    extraJson: Object.keys(extra).length ? JSON.stringify(extra) : undefined,
    updatedAt: STAMP,
  };
}

function parseAnimals(table: CsvTable): { animals: Animal[]; unmapped: string[] } {
  const mapped = new Map<string, AnimalField>();
  const unmapped: string[] = [];
  for (const header of table.headers) {
    const field = mapAnimalHeader(header);
    if (field && !mapped.has(header)) mapped.set(header, field);
    else if (!field) unmapped.push(header);
  }
  const animals: Animal[] = [];
  for (const raw of table.rows) {
    const animal = animalFromRow(rowObject(table.headers, raw), mapped, unmapped);
    if (animal) animals.push(animal);
  }
  return { animals, unmapped: unmapped.filter((header) => header.trim()) };
}

function parseCalving(table: CsvTable): CowCalfRecord[] {
  const mapped = new Map<string, string>();
  for (const header of table.headers) {
    const field = mapCalvingHeader(header);
    if (field) mapped.set(header, field);
  }
  const rows: CowCalfRecord[] = [];
  for (const raw of table.rows) {
    const row = rowObject(table.headers, raw);
    const cowId = pick(row, mapped, 'cowId');
    const calfId = pick(row, mapped, 'calfId');
    if (!cowId) continue;
    const calvingDate = normalizeDate(pick(row, mapped, 'calvingDate'));
    const year = yearFromDate(calvingDate) ?? new Date().getFullYear();
    rows.push({
      id: stableId('calving', String(year), cowId, calfId || 'open'),
      year,
      cowId,
      calfId: calfId || undefined,
      sireId: pick(row, mapped, 'sireId') || undefined,
      sex: sexFromCowSense(pick(row, mapped, 'sex')),
      calvingDate,
      birthWeight: pick(row, mapped, 'birthWeight') || undefined,
      birthCodes: pick(row, mapped, 'birthCodes') || undefined,
      calvingEase: pick(row, mapped, 'calvingEase') || undefined,
      remarks: pick(row, mapped, 'remarks') || undefined,
      openWithoutCalf: !calfId,
      flagged: false,
      updatedAt: STAMP,
    });
  }
  return rows;
}

function breedingKind(value: string): BreedingKind {
  const key = value.toLowerCase();
  if (key.includes('ai2') || key.includes('2nd')) return 'ai2';
  if (key.includes('ai') || key.includes('artificial')) return 'ai1';
  return 'pasture';
}

function parseBreeding(table: CsvTable): BreedingService[] {
  const mapped = new Map<string, string>();
  for (const header of table.headers) {
    const field = mapBreedingHeader(header);
    if (field) mapped.set(header, field);
  }
  const rows: BreedingService[] = [];
  for (const raw of table.rows) {
    const row = rowObject(table.headers, raw);
    const cowId = pick(row, mapped, 'cowId');
    if (!cowId) continue;
    const serviceDate = normalizeDate(pick(row, mapped, 'serviceDate'));
    const year = yearFromDate(serviceDate) ?? new Date().getFullYear();
    const kind = breedingKind(pick(row, mapped, 'kind'));
    rows.push({
      id: stableId('breeding', String(year), cowId, kind, serviceDate || ''),
      year,
      cowId,
      kind,
      sireId: pick(row, mapped, 'sireId') || undefined,
      serviceDate,
      flagged: false,
      updatedAt: STAMP,
    });
  }
  return rows;
}

function parseTreatments(table: CsvTable): TreatmentRecord[] {
  const mapped = new Map<string, string>();
  for (const header of table.headers) {
    const field = mapTreatmentHeader(header);
    if (field) mapped.set(header, field);
  }
  const rows: TreatmentRecord[] = [];
  for (const raw of table.rows) {
    const row = rowObject(table.headers, raw);
    const animalHerdId = pick(row, mapped, 'animalHerdId');
    const product = pick(row, mapped, 'product');
    if (!animalHerdId && !product) continue;
    const date = normalizeDate(pick(row, mapped, 'date'));
    rows.push({
      id: stableId('tx', animalHerdId, date || '', product),
      animalHerdId: animalHerdId || 'unknown',
      date,
      product: product || undefined,
      dose: pick(row, mapped, 'dose') || undefined,
      route: pick(row, mapped, 'route') || undefined,
      location: pick(row, mapped, 'location') || undefined,
      withdrawal: pick(row, mapped, 'withdrawal') || undefined,
      notes: pick(row, mapped, 'notes') || undefined,
      updatedAt: STAMP,
    });
  }
  return rows;
}

function parseSales(table: CsvTable): SaleRecord[] {
  const mapped = new Map<string, string>();
  for (const header of table.headers) {
    const field = mapSaleHeader(header);
    if (field) mapped.set(header, field);
  }
  const rows: SaleRecord[] = [];
  for (const raw of table.rows) {
    const row = rowObject(table.headers, raw);
    const calfId = pick(row, mapped, 'calfId');
    if (!calfId) continue;
    const saleDate = normalizeDate(pick(row, mapped, 'saleDate'));
    const year = yearFromDate(saleDate) ?? new Date().getFullYear();
    rows.push({
      id: stableId('sale', String(year), calfId),
      year,
      calfId,
      sex: sexFromCowSense(pick(row, mapped, 'sex')),
      buyer: pick(row, mapped, 'buyer') || undefined,
      saleDate,
      price: pick(row, mapped, 'price') || undefined,
      notes: pick(row, mapped, 'notes') || undefined,
      flagged: false,
      updatedAt: STAMP,
    });
  }
  return rows;
}

function ingestTable(table: CsvTable, into: ParsedHerd): void {
  if (table.headers.length === 0) return;
  const kind = classifyTable(table.headers);
  into.tables.push(kind);
  if (kind === 'calving') {
    into.cowCalf.push(...parseCalving(table));
    return;
  }
  if (kind === 'breeding') {
    into.breeding.push(...parseBreeding(table));
    return;
  }
  if (kind === 'treatments') {
    into.treatments.push(...parseTreatments(table));
    return;
  }
  if (kind === 'sales') {
    into.sales.push(...parseSales(table));
    return;
  }
  const parsed = parseAnimals(table);
  into.animals.push(...parsed.animals);
  for (const header of parsed.unmapped) {
    if (!into.unmappedColumns.includes(header)) into.unmappedColumns.push(header);
  }
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

function parseJsonHerd(text: string, magic: string): ParsedHerd | null {
  try {
    const parsed = JSON.parse(text) as {
      format?: string;
      animals?: Animal[];
      cowCalf?: CowCalfRecord[];
      breeding?: BreedingService[];
      treatments?: TreatmentRecord[];
      sales?: SaleRecord[];
    };
    if (
      parsed?.format !== 'record-book-snapshot' &&
      parsed?.format !== 'record-book-backup' &&
      !Array.isArray(parsed.animals)
    ) {
      return null;
    }
    return {
      format: 'json',
      magic,
      animals: Array.isArray(parsed.animals) ? parsed.animals : [],
      cowCalf: Array.isArray(parsed.cowCalf) ? parsed.cowCalf : [],
      breeding: Array.isArray(parsed.breeding) ? parsed.breeding : [],
      treatments: Array.isArray(parsed.treatments) ? parsed.treatments : [],
      sales: Array.isArray(parsed.sales) ? parsed.sales : [],
      unmappedColumns: [],
      warnings: [],
      tables: ['json'],
    };
  } catch {
    return null;
  }
}

function unknownBinaryWarning(format: CowSenseFormat): string {
  if (format === 'sqlite') {
    return 'This .csh looks like a SQLite database. Drop a Cow Sense CSV (Manage > List > Export) here too, or we will keep trying to map tables from a spreadsheet export.';
  }
  if (format === 'sqlce') {
    return 'This herd file looks like SQL Server Compact. Export from Cow Sense Manage → List as CSV and drop that here. Record Book does not write the original .csh.';
  }
  if (format === 'access') {
    return 'Could not read the Cow Sense Access tables in that .csh. Export Manage → List as CSV and drop that here. Record Book never writes the original herd file.';
  }
  return 'Could not read that .csh as a Cow Sense database or spreadsheet. Export from Manage → List as CSV or TXT and import that here. The CSV we export uses Cow Sense Sex/Type/Status words so Tools → Import can take them back.';
}

export function parseCowSenseText(text: string, fileName = 'herd.csv'): ParsedHerd {
  const json = parseJsonHerd(text, 'json');
  if (json) return json;
  const table = parseCsv(text);
  const delimiter = text.includes('\t') && (text.split('\t').length > text.split(',').length) ? 'tsv' : 'csv';
  const result = emptyHerd(fileName.toLowerCase().endsWith('.txt') || delimiter === 'tsv' ? 'tsv' : 'csv', 'text');
  ingestTable(table, result);
  if (result.cowCalf.length === 0) {
    result.cowCalf.push(...animalsFromDamBirth(result.animals));
  }
  if (result.animals.length === 0 && result.cowCalf.length === 0 && result.treatments.length === 0) {
    result.warnings.push('No animal rows found. The first row must be column names such as Visual ID, Sex, Type, Status.');
  }
  return result;
}

export function parseCowSenseBytes(bytes: Uint8Array, fileName = 'herd.csh'): ParsedHerd {
  const magic = magicLabel(bytes);
  const format = detectFormat(bytes);
  if (looksLikeText(bytes) || /\.(csv|txt|tsv|json)$/i.test(fileName)) {
    const text = decodeSpreadsheetBytes(bytes).replace(/\0/g, '');
    const parsed = parseCowSenseText(text, fileName);
    parsed.magic = magic;
    if (parsed.animals.length || parsed.cowCalf.length || parsed.treatments.length) {
      return parsed;
    }
  }
  if (format === 'access' || (format === 'csh-unknown' && /\.csh$/i.test(fileName) && isJetDatabase(bytes))) {
    try {
      const jet = parseJetHerd(bytes);
      jet.magic = magic;
      if (jet.animals.length === 0 && jet.warnings.length === 0) {
        jet.warnings.push(unknownBinaryWarning('access'));
      }
      return jet;
    } catch (error) {
      return emptyHerd('access', magic, [
        error instanceof Error ? error.message : 'Could not open this Cow Sense database.',
        'Record Book does not change the original .csh. Export Manage → List as CSV if this copy will not open.',
      ]);
    }
  }
  const result = emptyHerd(format === 'csh-unknown' && /\.csh$/i.test(fileName) ? 'csh-unknown' : format, magic, [
    unknownBinaryWarning(format),
  ]);
  return result;
}

export function mergeCalvingFromAnimals(parsed: ParsedHerd): ParsedHerd {
  if (parsed.cowCalf.length === 0) {
    parsed.cowCalf.push(...animalsFromDamBirth(parsed.animals));
  }
  return parsed;
}

export function countRows(parsed: ParsedHerd): number {
  return (
    parsed.animals.length +
    parsed.cowCalf.length +
    parsed.breeding.length +
    parsed.treatments.length +
    parsed.sales.length
  );
}

function asSex(value: unknown): Sex {
  return value === 'M' || value === 'F' ? value : '';
}

export function asAnimalDraft(value: unknown): Animal | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<Animal>;
  if (!row.herdId && !row.id) return null;
  return {
    ...row,
    id: String(row.id || stableId('animal', String(row.herdId))),
    herdId: String(row.herdId || ''),
    sex: asSex(row.sex),
    status: row.status || 'active',
    updatedAt: row.updatedAt || STAMP,
  };
}

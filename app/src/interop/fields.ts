import type { AnimalStatus, Sex } from '../db/schema';

export const COW_SENSE_SEX = ['Heifer', 'Cow', 'Bull', 'Steer'] as const;
export const COW_SENSE_TYPE = [
  'Nursing Calf',
  'Weaned Calf',
  'Yearling',
  'Replacement',
  'Breeding Cow',
  'Breeding Bull',
  'Multi Sire',
  'Stocker',
  'Feeder',
  'Calving Failure',
  'Calf',
  'Cow',
  'Bull',
  'Steer',
  'Herd Sire',
  'Unknown',
] as const;
export const COW_SENSE_STATUS = [
  'Active',
  'Disposed',
  'Reference',
  'Sold',
  'Dead',
  'Culled',
  'Open',
] as const;
export const COW_SENSE_DISPOSAL = ['Marketing', 'Culling', 'Death loss', 'Transfer'] as const;

export type AnimalField =
  | 'herdId'
  | 'electronicId'
  | 'name'
  | 'sex'
  | 'animalType'
  | 'status'
  | 'birthDate'
  | 'yearBorn'
  | 'location'
  | 'groupName'
  | 'sireId'
  | 'damId'
  | 'registration'
  | 'tattoo'
  | 'tattooLoc'
  | 'brand'
  | 'color'
  | 'breed'
  | 'horned'
  | 'birthType'
  | 'calvingEase'
  | 'serviceType'
  | 'disposition'
  | 'bodyCondition'
  | 'birthWeight'
  | 'weaningWeight'
  | 'weaningDate'
  | 'yearlingWeight'
  | 'yearlingDate'
  | 'notes'
  | 'phenotype'
  | 'tagColor';

const HEADER_ALIASES: Record<string, AnimalField> = {
  visualid: 'herdId',
  visualtag: 'herdId',
  tag: 'herdId',
  tagid: 'herdId',
  animalid: 'herdId',
  herdid: 'herdId',
  herd: 'herdId',
  id: 'herdId',
  eid: 'electronicId',
  electronicid: 'electronicId',
  rfid: 'electronicId',
  name: 'name',
  sex: 'sex',
  gender: 'sex',
  type: 'animalType',
  animaltype: 'animalType',
  status: 'status',
  animalstatus: 'status',
  birthdate: 'birthDate',
  dateofbirth: 'birthDate',
  dob: 'birthDate',
  birthyear: 'yearBorn',
  yearborn: 'yearBorn',
  location: 'location',
  pasture: 'location',
  group: 'groupName',
  groupname: 'groupName',
  sire: 'sireId',
  sireid: 'sireId',
  dam: 'damId',
  damid: 'damId',
  registration: 'registration',
  registrationprimary: 'registration',
  regno: 'registration',
  tattoo: 'tattoo',
  tattoo1: 'tattoo',
  tattooloc: 'tattooLoc',
  tattoo1loc: 'tattooLoc',
  brand: 'brand',
  color: 'color',
  colorcode: 'color',
  breed: 'breed',
  breed1: 'breed',
  horncode: 'horned',
  horned: 'horned',
  twincode: 'birthType',
  birthtype: 'birthType',
  calvingease: 'calvingEase',
  servicetype: 'serviceType',
  chutescore: 'disposition',
  disposition: 'disposition',
  bodycondition: 'bodyCondition',
  conditioncode: 'bodyCondition',
  birthweight: 'birthWeight',
  bw: 'birthWeight',
  weaningweight: 'weaningWeight',
  ww: 'weaningWeight',
  weaningdate: 'weaningDate',
  yearlingweight: 'yearlingWeight',
  yw: 'yearlingWeight',
  yearlingdate: 'yearlingDate',
  notes: 'notes',
  comment: 'notes',
  identitycomment: 'phenotype',
  phenotype: 'phenotype',
  tagcolor: 'tagColor',
};

const CALVING_ALIASES: Record<string, string> = {
  cow: 'cowId',
  cowid: 'cowId',
  dam: 'cowId',
  damid: 'cowId',
  calf: 'calfId',
  calfid: 'calfId',
  calfvisualid: 'calfId',
  sire: 'sireId',
  sireid: 'sireId',
  sex: 'sex',
  calvingdate: 'calvingDate',
  birthdate: 'calvingDate',
  birthweight: 'birthWeight',
  calvingease: 'calvingEase',
  remarks: 'remarks',
  birthcodes: 'birthCodes',
};

const BREEDING_ALIASES: Record<string, string> = {
  cow: 'cowId',
  cowid: 'cowId',
  sire: 'sireId',
  sireid: 'sireId',
  bull: 'sireId',
  servicedate: 'serviceDate',
  breedingdate: 'serviceDate',
  aidate: 'serviceDate',
  kind: 'kind',
  method: 'kind',
  servicetype: 'kind',
};

const TREATMENT_ALIASES: Record<string, string> = {
  animal: 'animalHerdId',
  animalid: 'animalHerdId',
  visualid: 'animalHerdId',
  tag: 'animalHerdId',
  date: 'date',
  treatmentdate: 'date',
  product: 'product',
  item: 'product',
  dose: 'dose',
  dosage: 'dose',
  route: 'route',
  location: 'location',
  withdrawal: 'withdrawal',
  notes: 'notes',
};

const SALE_ALIASES: Record<string, string> = {
  calf: 'calfId',
  calfId: 'calfId',
  visualid: 'calfId',
  animalid: 'calfId',
  sex: 'sex',
  buyer: 'buyer',
  soldto: 'buyer',
  saledate: 'saleDate',
  date: 'saleDate',
  price: 'price',
  notes: 'notes',
};

export function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '');
}

export function mapAnimalHeader(header: string): AnimalField | undefined {
  return HEADER_ALIASES[normalizeHeader(header)];
}

export function mapCalvingHeader(header: string): string | undefined {
  return CALVING_ALIASES[normalizeHeader(header)];
}

export function mapBreedingHeader(header: string): string | undefined {
  return BREEDING_ALIASES[normalizeHeader(header)];
}

export function mapTreatmentHeader(header: string): string | undefined {
  return TREATMENT_ALIASES[normalizeHeader(header)];
}

export function mapSaleHeader(header: string): string | undefined {
  return SALE_ALIASES[normalizeHeader(header)];
}

export function sexFromCowSense(value: string): Sex {
  const key = normalizeHeader(value);
  if (['heifer', 'heiferspay', 'spayedheifer', 'cow', 'female', 'f', 'h'].includes(key)) return 'F';
  if (['bull', 'steer', 'male', 'm', 'b', 's'].includes(key)) return 'M';
  return '';
}

export function statusFromCowSense(value: string, disposalType = ''): AnimalStatus {
  const key = normalizeHeader(value);
  const disposal = normalizeHeader(disposalType);
  if (['sold', 'sale', 'marketing'].includes(key)) return 'sold';
  if (['dead', 'died', 'death', 'deceased', 'deathloss'].includes(key)) return 'dead';
  if (['culled', 'cull', 'culling'].includes(key)) return 'culled';
  if (key === 'disposed') {
    if (disposal === 'marketing' || disposal === 'transfer') return 'sold';
    if (disposal.includes('death')) return 'dead';
    return 'culled';
  }
  if (['open'].includes(key)) return 'open';
  if (['flagged', 'flag'].includes(key)) return 'flagged';
  if (['reference', 'ref'].includes(key)) return 'reference';
  return 'active';
}

function typeLooksLikeCow(animalType?: string): boolean {
  const type = normalizeHeader(animalType || '');
  return type === 'cow' || type.endsWith('cow') || type.includes('breedingcow');
}

function typeLooksLikeSteer(animalType?: string): boolean {
  const type = normalizeHeader(animalType || '');
  return type === 'steer' || type === 'stocker' || type === 'feeder';
}

export function cowSenseSex(sex: Sex, animalType?: string, originalSex?: string): string {
  const original = (originalSex || '').trim();
  if ((COW_SENSE_SEX as readonly string[]).includes(original)) return original;
  if (sex === 'F') return typeLooksLikeCow(animalType) ? 'Cow' : 'Heifer';
  if (typeLooksLikeSteer(animalType)) return 'Steer';
  if (sex === 'M') return 'Bull';
  return '';
}

export function cowSenseStatus(status: AnimalStatus): string {
  switch (status) {
    case 'sold':
      return 'Sold';
    case 'dead':
      return 'Dead';
    case 'culled':
      return 'Culled';
    case 'open':
      return 'Open';
    case 'reference':
      return 'Reference';
    default:
      return 'Active';
  }
}

export function cowSenseFileStatus(status: AnimalStatus): string {
  if (status === 'reference') return 'Reference';
  if (status === 'sold' || status === 'dead' || status === 'culled') return 'Disposed';
  return 'Active';
}

export function cowSenseDisposalType(
  status: AnimalStatus,
  extra?: Record<string, string>,
): string {
  const fromExtra = extra?.['Disposal Type'] || extra?.DisposalType || extra?.disposalType;
  if (fromExtra?.trim()) return fromExtra.trim();
  if (status === 'sold') return 'Marketing';
  if (status === 'dead') return 'Death loss';
  if (status === 'culled') return 'Culling';
  return '';
}

export function cowSenseType(animalType?: string, sex?: Sex): string {
  const type = (animalType || '').trim();
  if (type) return type;
  if (sex === 'F') return 'Cow';
  if (sex === 'M') return 'Bull';
  return 'Calf';
}

export function yearFromDate(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.match(/(\d{4})/);
  if (!match) return undefined;
  const year = Number(match[1]);
  return year >= 1900 && year <= 2100 ? year : undefined;
}

export function normalizeDate(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const stripped = trimmed.replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, '');
  const iso = stripped.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = stripped.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (us) {
    const month = us[1].padStart(2, '0');
    const day = us[2].padStart(2, '0');
    const year =
      us[3].length === 2 ? (Number(us[3]) >= 50 ? `19${us[3]}` : `20${us[3]}`) : us[3];
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(stripped);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${parsed.getFullYear()}-${month}-${day}`;
}

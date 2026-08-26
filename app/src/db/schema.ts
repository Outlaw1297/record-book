import Dexie, { type EntityTable } from 'dexie';

export type Sex = 'M' | 'F' | '';

export type AnimalStatus =
  | 'active'
  | 'open'
  | 'sold'
  | 'dead'
  | 'flagged';

export interface Animal {
  id: string;
  herdId: string;
  tagColor?: string;
  phenotype?: string;
  name?: string;
  sex: Sex;
  status: AnimalStatus;
  notes?: string;
  yearBorn?: number;
  updatedAt: string;
  deletedAt?: string;
}

export interface CowCalfRecord {
  id: string;
  year: number;
  calfId?: string;
  cowId: string;
  sireId?: string;
  sex: Sex;
  calvingDate?: string;
  birthWeight?: string;
  birthCodes?: string;
  calvingEase?: string;
  remarks?: string;
  openWithoutCalf: boolean;
  flagged: boolean;
  updatedAt: string;
  deletedAt?: string;
}

export type BreedingKind = 'ai1' | 'ai2' | 'pasture';

export interface BreedingService {
  id: string;
  year: number;
  cowId: string;
  kind: BreedingKind;
  sireId?: string;
  serviceDate?: string;
  flagged: boolean;
  updatedAt: string;
  deletedAt?: string;
}

export interface PastureExposure {
  id: string;
  year: number;
  pastureName: string;
  bullInDate?: string;
  bullOutDate?: string;
  notes?: string;
  updatedAt: string;
  deletedAt?: string;
}

export type PastureRole = 'bull' | 'cow';

export interface PastureExposureAnimal {
  id: string;
  exposureId: string;
  animalHerdId: string;
  role: PastureRole;
  note?: string;
  metric?: string;
  flagged: boolean;
  updatedAt: string;
  deletedAt?: string;
}

export type ListMark = '' | 'x' | 'circled';

export interface SaleRecord {
  id: string;
  year: number;
  calfId: string;
  sex: Sex;
  buyer?: string;
  saleDate?: string;
  price?: string;
  notes?: string;
  /** How the row is marked in the paper cull/sale list. */
  listMark?: ListMark;
  flagged: boolean;
  updatedAt: string;
  deletedAt?: string;
}

export type SyncProvider = 'none' | 'google-drive' | 'dropbox';

export interface AppSettings {
  id: number;
  ranchName: string;
  currentYear: number;
  syncProvider: SyncProvider;
  lastSyncedAt?: string;
  deviceId: string;
}

export interface OutboxChange {
  id: string;
  entity:
    | 'animals'
    | 'cowCalf'
    | 'breeding'
    | 'pastures'
    | 'pastureAnimals'
    | 'sales'
    | 'settings';
  entityId: string;
  op: 'upsert' | 'delete';
  payload: unknown;
  updatedAt: string;
  syncedAt?: string;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

class RecordBookDB extends Dexie {
  animals!: EntityTable<Animal, 'id'>;
  cowCalf!: EntityTable<CowCalfRecord, 'id'>;
  breeding!: EntityTable<BreedingService, 'id'>;
  pastures!: EntityTable<PastureExposure, 'id'>;
  pastureAnimals!: EntityTable<PastureExposureAnimal, 'id'>;
  sales!: EntityTable<SaleRecord, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;
  outbox!: EntityTable<OutboxChange, 'id'>;

  constructor() {
    super('recordBook');
    this.version(1).stores({
      animals: 'id, herdId, status, updatedAt',
      cowCalf: 'id, year, cowId, calfId, updatedAt',
      breeding: 'id, year, cowId, kind, updatedAt',
      pastures: 'id, year, pastureName, updatedAt',
      pastureAnimals: 'id, exposureId, animalHerdId, role, updatedAt',
      sales: 'id, year, calfId, updatedAt',
      settings: 'id',
      outbox: 'id, entity, syncedAt, updatedAt',
    });
  }
}

export const db = new RecordBookDB();

export async function ensureSettings(): Promise<AppSettings> {
  const existing = await db.settings.get(1);
  if (existing) return existing;

  const settings: AppSettings = {
    id: 1,
    ranchName: 'Record Book',
    currentYear: new Date().getFullYear(),
    syncProvider: 'none',
    deviceId: newId(),
  };
  await db.settings.put(settings);
  return settings;
}

export async function queueChange(
  entity: OutboxChange['entity'],
  entityId: string,
  op: OutboxChange['op'],
  payload: unknown,
): Promise<void> {
  await db.outbox.put({
    id: newId(),
    entity,
    entityId,
    op,
    payload,
    updatedAt: nowIso(),
  });
}

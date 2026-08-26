import Dexie, { type EntityTable } from 'dexie';
import { sanitizeSettingsForSync } from '../sync/settingsPayload';
import { emitOutboxEvent } from '../sync/types';

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
  listMark?: ListMark;
  flagged: boolean;
  updatedAt: string;
  deletedAt?: string;
}

export type DeviceKind = 'phone' | 'desk';
export type SyncProvider = 'none' | 'google-drive' | 'dropbox';

export interface AppSettings {
  id: number;
  ranchName: string;
  operatorName?: string;
  currentYear: number;
  syncProvider: SyncProvider;
  lastSyncedAt?: string;
  deviceId: string;
  deviceName?: string;
  deviceKind?: DeviceKind;
  bookId?: string;
  onboardingComplete?: boolean;
  updatedAt?: string;
}

export interface SyncAuth {
  id: number;
  provider: Exclude<SyncProvider, 'none'>;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  accountEmail?: string;
  accountName?: string;
  rootFolderId?: string;
  snapshotsFolderId?: string;
  changesFolderId?: string;
}

export interface SyncApplied {
  fileKey: string;
  appliedAt: string;
  provider: string;
}

export interface SyncConflict {
  id: string;
  entity: string;
  entityId: string;
  kept: 'local' | 'remote';
  localUpdatedAt?: string;
  remoteUpdatedAt: string;
  createdAt: string;
  operatorName?: string;
  deviceName?: string;
}

export interface SyncDevice {
  deviceId: string;
  deviceName: string;
  operatorName?: string;
  kind?: DeviceKind;
  lastSeenAt: string;
  isThisDevice?: boolean;
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
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Local calendar date for field entry (not UTC). */
export function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  syncAuth!: EntityTable<SyncAuth, 'id'>;
  syncApplied!: EntityTable<SyncApplied, 'fileKey'>;
  syncConflicts!: EntityTable<SyncConflict, 'id'>;
  syncDevices!: EntityTable<SyncDevice, 'deviceId'>;

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
    this.version(2).stores({
      syncAuth: 'id, provider',
      syncApplied: 'fileKey, appliedAt',
      syncConflicts: 'id, entity, entityId, createdAt',
    });
    this.version(3).stores({
      syncDevices: 'deviceId, lastSeenAt',
    });
  }
}

export const db = new RecordBookDB();

/** Read-only. Safe inside Dexie liveQuery callbacks. */
export function getSettings(): Promise<AppSettings | undefined> {
  return db.settings.get(1);
}

export async function ensureSettings(): Promise<AppSettings> {
  const existing = await db.settings.get(1);
  if (existing) {
    if (existing.onboardingComplete == null) {
      const hasRows = (await db.cowCalf.count()) > 0;
      const next = { ...existing, onboardingComplete: hasRows };
      await db.settings.put(next);
      return next;
    }
    return existing;
  }

  const settings: AppSettings = {
    id: 1,
    ranchName: 'Record Book',
    operatorName: '',
    currentYear: new Date().getFullYear(),
    syncProvider: 'none',
    deviceId: newId(),
    deviceName: 'This device',
    deviceKind: 'phone',
    onboardingComplete: false,
    updatedAt: nowIso(),
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
    payload: entity === 'settings' ? sanitizeSettingsForSync(payload) : payload,
    updatedAt: nowIso(),
  });
  emitOutboxEvent();
}

export async function upsertAnimalByHerdId(
  herdId: string,
  extras: Partial<Pick<Animal, 'sex' | 'status' | 'notes' | 'yearBorn'>> = {},
): Promise<void> {
  const trimmed = herdId.trim();
  if (!trimmed) return;
  const existing = await db.animals
    .filter(
      (animal) =>
        !animal.deletedAt &&
        animal.herdId.toLowerCase() === trimmed.toLowerCase(),
    )
    .first();
  const record: Animal = {
    id: existing?.id ?? newId(),
    herdId: existing?.herdId ?? trimmed,
    sex: extras.sex || existing?.sex || '',
    status: extras.status ?? existing?.status ?? 'active',
    notes: extras.notes ?? existing?.notes,
    yearBorn: extras.yearBorn ?? existing?.yearBorn,
    tagColor: existing?.tagColor,
    phenotype: existing?.phenotype,
    name: existing?.name,
    updatedAt: nowIso(),
  };
  await db.animals.put(record);
  await queueChange('animals', record.id, 'upsert', record);
}

import type { OutboxChange, SyncProvider } from '../db/schema';

export const RECORD_BOOK_FOLDER = 'RecordBook';
export const SNAPSHOT_PATH = 'snapshots/herd-latest.json';
export const CONFIG_PATH = 'config.json';
export const DEVICES_PATH = 'devices.json';
export const CHANGES_PREFIX = 'changes/';

export type CloudProvider = Exclude<SyncProvider, 'none'>;

export type CloudFile = {
  key: string;
  updatedAt?: string;
};

export type ChangeLine = {
  v: 1;
  deviceId: string;
  deviceName?: string;
  operatorName?: string;
  entity: OutboxChange['entity'];
  entityId: string;
  op: OutboxChange['op'];
  updatedAt: string;
  payload: unknown;
};

export type HerdSnapshot = {
  format: 'record-book-snapshot';
  version: 1;
  exportedAt: string;
  animals: unknown[];
  cowCalf: unknown[];
  breeding: unknown[];
  pastures: unknown[];
  pastureAnimals: unknown[];
  sales: unknown[];
  settings: {
    ranchName: string;
    currentYear: number;
    updatedAt?: string;
  };
};

export type SyncedSettings = HerdSnapshot['settings'];

export interface CloudCarrier {
  readonly provider: CloudProvider;
  ensureRoot(): Promise<void>;
  readText(path: string): Promise<string | null>;
  writeText(path: string, text: string, mode?: 'add' | 'overwrite'): Promise<void>;
  list(prefix: string): Promise<CloudFile[]>;
}

export type SyncRunResult = {
  ok: boolean;
  detail: string;
  pulled: number;
  pushed: number;
  conflicts: number;
};

export const SYNC_EVENT = 'record-book-sync';
export const OUTBOX_EVENT = 'record-book-outbox';

export function emitSyncEvent(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SYNC_EVENT));
  }
}

export function emitOutboxEvent(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OUTBOX_EVENT));
  }
}

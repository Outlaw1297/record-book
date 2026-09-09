import { DEFAULT_RANCH_NAME } from '../brand';
import type { SyncedSettings } from './types';

export function sanitizeSettingsForSync(payload: unknown): SyncedSettings {
  const record =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {};
  return {
    ranchName:
      typeof record.ranchName === 'string' && record.ranchName.trim()
        ? record.ranchName
        : DEFAULT_RANCH_NAME,
    currentYear:
      typeof record.currentYear === 'number' && Number.isFinite(record.currentYear)
        ? record.currentYear
        : new Date().getFullYear(),
    updatedAt:
      typeof record.updatedAt === 'string' ? record.updatedAt : undefined,
  };
}

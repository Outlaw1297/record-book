import type { AppSettings } from '../db/schema';
import { sanitizeSettingsForSync } from './settingsPayload';
import type { ChangeLine, SyncedSettings } from './types';

export function decideWrite(
  localUpdatedAt: string | undefined,
  remoteUpdatedAt: string,
): 'apply' | 'keep-local' {
  if (!localUpdatedAt) return 'apply';
  return localUpdatedAt > remoteUpdatedAt ? 'keep-local' : 'apply';
}

export function parseJsonl(text: string): ChangeLine[] {
  const lines: ChangeLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as ChangeLine;
      if (parsed?.v !== 1 || !parsed.entity || !parsed.entityId || !parsed.op) {
        continue;
      }
      lines.push(parsed);
    } catch {
      /* skip a bad line rather than failing the whole file */
    }
  }
  return lines;
}

export function serializeJsonl(changes: ChangeLine[]): string {
  return changes.map((change) => JSON.stringify(change)).join('\n') + '\n';
}

export function mergeRemoteSettings(
  local: AppSettings,
  remote: unknown,
): AppSettings {
  const synced: SyncedSettings = sanitizeSettingsForSync(remote);
  return {
    ...local,
    ranchName: synced.ranchName,
    operatorName: synced.operatorName,
    currentYear: synced.currentYear,
    updatedAt: synced.updatedAt ?? local.updatedAt,
  };
}

export function snapshotSettings(settings: AppSettings): SyncedSettings {
  return sanitizeSettingsForSync(settings);
}

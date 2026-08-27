import type { SyncAuth } from '../db/schema';
import type { CloudProvider } from './types';

export function authRowId(provider: CloudProvider): number {
  return provider === 'google-drive' ? 1 : 2;
}

/** Old builds stored whichever login last won on id 1. Dropbox belongs on id 2. */
export function relocatedDropboxAuth(row: SyncAuth | undefined): SyncAuth | null {
  if (!row || row.provider !== 'dropbox' || row.id !== 1) return null;
  return { ...row, id: 2 };
}

export function preferredCloudProvider(
  syncProvider: string | undefined,
  connected: CloudProvider[],
): CloudProvider | null {
  if (connected.length === 0) return null;
  if (syncProvider === 'google-drive' || syncProvider === 'dropbox') {
    if (connected.includes(syncProvider)) return syncProvider;
  }
  return connected[0] ?? null;
}

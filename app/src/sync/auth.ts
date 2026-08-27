import { db, ensureSettings, type SyncAuth } from '../db/schema';
import { connectSharedFolder } from './sharedFolder';
import type { CloudProvider } from './types';

export async function getSyncAuth(): Promise<SyncAuth | undefined> {
  return db.syncAuth.get(1);
}

export async function disconnectCloud(): Promise<void> {
  const settings = await ensureSettings();
  await db.transaction('rw', db.syncAuth, db.settings, async () => {
    await db.syncAuth.delete(1);
    await db.settings.put({
      ...settings,
      syncProvider: 'none',
      updatedAt: new Date().toISOString(),
    });
  });
}

export async function startOAuth(
  provider: CloudProvider,
): Promise<{ navigated: boolean; detail?: string }> {
  const folder = await connectSharedFolder(provider);
  try {
    const { syncNow } = await import('./engine');
    const synced = await syncNow();
    if (synced.ok) return { navigated: false, detail: synced.detail };
  } catch {
    /* Folder is connected; background sync will retry. */
  }
  const label = provider === 'dropbox' ? 'Dropbox' : 'Google Drive';
  return {
    navigated: false,
    detail: `${label} folder connected (${folder.name}).`,
  };
}

export async function completeOAuthCallback(
  _params: URLSearchParams,
): Promise<{ ok: boolean; detail: string }> {
  return {
    ok: false,
    detail: 'Use Choose folder in Settings. Sign-in no longer uses a browser callback.',
  };
}

function isSharedFolderId(value: string | undefined): boolean {
  const id = (value || '').trim();
  return id === 'fsa' || id.startsWith('content://');
}

export function isUsableFolderSession(auth: SyncAuth | undefined): boolean {
  return isSharedFolderId(auth?.rootFolderId) || isSharedFolderId(auth?.accessToken);
}

export async function hasUsableSession(): Promise<boolean> {
  return isUsableFolderSession(await getSyncAuth());
}

export async function getValidAccessToken(): Promise<string | null> {
  const auth = await getSyncAuth();
  const root = (auth?.rootFolderId || '').trim();
  if (isSharedFolderId(root)) return root;
  const token = (auth?.accessToken || '').trim();
  return isSharedFolderId(token) ? token : null;
}

export async function requireAccessToken(): Promise<{
  token: string;
  auth: SyncAuth;
}> {
  const token = await getValidAccessToken();
  const auth = await getSyncAuth();
  if (!token || !auth) {
    throw new Error('Choose a shared folder in Settings.');
  }
  return { token, auth };
}

export async function saveAuthFolders(
  patch: Partial<
    Pick<SyncAuth, 'rootFolderId' | 'snapshotsFolderId' | 'changesFolderId'>
  >,
): Promise<void> {
  const auth = await getSyncAuth();
  if (!auth) return;
  await db.syncAuth.put({ ...auth, ...patch });
}

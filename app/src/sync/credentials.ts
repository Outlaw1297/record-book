import type { CloudProvider } from './types';
import { ranchUrl } from './ranchServer';

const GOOGLE_KEY = 'record-book.googleClientId';
const DROPBOX_KEY = 'record-book.dropboxAppKey';

function fromEnv(name: 'VITE_GOOGLE_CLIENT_ID' | 'VITE_DROPBOX_APP_KEY'): string {
  const value = import.meta.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

export function getGoogleClientId(): string {
  if (typeof localStorage === 'undefined') return fromEnv('VITE_GOOGLE_CLIENT_ID');
  return (localStorage.getItem(GOOGLE_KEY) || fromEnv('VITE_GOOGLE_CLIENT_ID')).trim();
}

export function getDropboxAppKey(): string {
  if (typeof localStorage === 'undefined') return fromEnv('VITE_DROPBOX_APP_KEY');
  return (localStorage.getItem(DROPBOX_KEY) || fromEnv('VITE_DROPBOX_APP_KEY')).trim();
}

export function saveGoogleClientId(value: string): void {
  const trimmed = value.trim();
  if (!trimmed) localStorage.removeItem(GOOGLE_KEY);
  else localStorage.setItem(GOOGLE_KEY, trimmed);
}

export function saveDropboxAppKey(value: string): void {
  const trimmed = value.trim();
  if (!trimmed) localStorage.removeItem(DROPBOX_KEY);
  else localStorage.setItem(DROPBOX_KEY, trimmed);
}

export function clientIdFor(provider: CloudProvider): string {
  return provider === 'google-drive' ? getGoogleClientId() : getDropboxAppKey();
}

export function missingClientIdMessage(provider: CloudProvider): string {
  const name = provider === 'google-drive' ? 'Google' : 'Dropbox';
  const secret =
    provider === 'google-drive' ? 'VITE_GOOGLE_CLIENT_ID' : 'VITE_DROPBOX_APP_KEY';
  return `${name} sign-in is not baked into this build. Add the ${secret} GitHub secret and rebuild the app. You do not paste keys on the phone.`;
}

export function hasEnvGoogleClientId(): boolean {
  return Boolean(fromEnv('VITE_GOOGLE_CLIENT_ID'));
}

export function hasEnvDropboxAppKey(): boolean {
  return Boolean(fromEnv('VITE_DROPBOX_APP_KEY'));
}

/** Pull public PKCE client IDs from the ranch API when this phone does not have them yet. */
export async function hydrateOAuthClients(): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  if (getGoogleClientId() && getDropboxAppKey()) return;
  const url = ranchUrl('/oauth-clients');
  if (!url) return;
  try {
    const response = await fetch(url);
    if (!response.ok) return;
    const body = (await response.json()) as {
      googleClientId?: string;
      dropboxAppKey?: string;
    };
    if (!getGoogleClientId() && body.googleClientId?.trim()) {
      saveGoogleClientId(body.googleClientId);
    }
    if (!getDropboxAppKey() && body.dropboxAppKey?.trim()) {
      saveDropboxAppKey(body.dropboxAppKey);
    }
  } catch {
    /* Ranch may be offline; baked GitHub secrets still sign in without a server. */
  }
}

/** Share public IDs with other devices via the ranch API. Local copies stay even if this fails. */
export async function publishOAuthClients(): Promise<void> {
  const url = ranchUrl('/oauth-clients');
  if (!url) return;
  const googleClientId = getGoogleClientId();
  const dropboxAppKey = getDropboxAppKey();
  if (!googleClientId && !dropboxAppKey) return;
  try {
    await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(googleClientId ? { googleClientId } : {}),
        ...(dropboxAppKey ? { dropboxAppKey } : {}),
      }),
    });
  } catch {
    /* This phone can still sign in with baked client IDs. */
  }
}

import type { CloudProvider } from './types';

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
  localStorage.setItem(GOOGLE_KEY, value.trim());
}

export function saveDropboxAppKey(value: string): void {
  localStorage.setItem(DROPBOX_KEY, value.trim());
}

export function clientIdFor(provider: CloudProvider): string {
  return provider === 'google-drive' ? getGoogleClientId() : getDropboxAppKey();
}

export function hasEnvGoogleClientId(): boolean {
  return Boolean(fromEnv('VITE_GOOGLE_CLIENT_ID'));
}

export function hasEnvDropboxAppKey(): boolean {
  return Boolean(fromEnv('VITE_DROPBOX_APP_KEY'));
}

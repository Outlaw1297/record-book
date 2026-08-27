import type { CloudProvider } from './types';

function fromEnv(name: 'VITE_GOOGLE_CLIENT_ID' | 'VITE_DROPBOX_APP_KEY'): string {
  const value = import.meta.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

export function getGoogleClientId(): string {
  return fromEnv('VITE_GOOGLE_CLIENT_ID');
}

export function getDropboxAppKey(): string {
  return fromEnv('VITE_DROPBOX_APP_KEY');
}

export function clientIdFor(provider: CloudProvider): string {
  return provider === 'google-drive' ? getGoogleClientId() : getDropboxAppKey();
}

export function missingClientIdMessage(provider: CloudProvider): string {
  if (provider === 'google-drive') {
    return 'Google sign-in is not baked into this APK yet. Create a Google Cloud OAuth web client and an Android client for me.flyingjranch.recordbook, add VITE_GOOGLE_CLIENT_ID, and rebuild. Each ranch still signs into their own Google account.';
  }
  return 'Dropbox sign-in is not baked into this APK yet. Create a Dropbox app with PKCE, add VITE_DROPBOX_APP_KEY, and rebuild. Each ranch still signs into their own Dropbox.';
}

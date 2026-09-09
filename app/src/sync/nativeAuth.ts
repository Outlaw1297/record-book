import { SocialLogin } from '@capgo/capacitor-social-login';
import { isNativeApp } from '../platform';
import { clientIdFor, missingClientIdMessage } from './credentials';
import type { CloudProvider } from './types';

const GOOGLE_SCOPES = [
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
];

export type NativeTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
};

export type NativeAccount = {
  email?: string;
  name?: string;
};

let initializedFor = '';

function asError(error: unknown, fallback: string): Error {
  if (error instanceof Error && error.message.trim()) {
    const message = error.message.trim();
    if (/cancel/i.test(message)) return new Error('Sign-in was cancelled.');
    if (
      /verif/i.test(message) ||
      /access blocked/i.test(message) ||
      /access_denied/i.test(message) ||
      /403/.test(message)
    ) {
      return new Error(
        'Google is not asking you to pay for verification. Keep HerdLedger in Testing. On a computer open console.cloud.google.com → Google Auth Platform → Audience. Publishing status must say Testing (do not Publish). Add THIS Gmail under Test users, wait a minute, try Sign in again. If Google shows “this app isn’t verified,” tap Advanced, then continue to HerdLedger (Google may still say Go to Record Book until the OAuth app name is renamed).',
      );
    }
    return new Error(message);
  }
  return new Error(fallback);
}

function expiresInFrom(access: { expires?: string } | null, seconds?: number | null): number {
  if (seconds && seconds > 0) return seconds;
  if (access?.expires) {
    const parsed = Date.parse(access.expires);
    if (!Number.isNaN(parsed)) {
      return Math.max(60, Math.round((parsed - Date.now()) / 1000));
    }
  }
  return 3600;
}

async function ensureNativeAuth(): Promise<void> {
  const google = clientIdFor('google-drive');
  if (initializedFor === google) return;
  await SocialLogin.initialize({
    ...(google
      ? {
          google: {
            webClientId: google,
            mode: 'online',
          },
        }
      : {}),
  });
  initializedFor = google;
}

export async function loginWithNativePlatform(provider: CloudProvider): Promise<{
  tokens: NativeTokens;
  account: NativeAccount;
}> {
  if (provider !== 'google-drive') {
    throw new Error('Dropbox on the phone uses the system browser, not Google Sign-In.');
  }
  const clientId = clientIdFor(provider);
  if (!clientId) {
    throw new Error(missingClientIdMessage(provider));
  }
  await ensureNativeAuth();
  try {
    const response = await SocialLogin.login({
      provider: 'google',
      options: {
        scopes: GOOGLE_SCOPES,
        forceRefreshToken: true,
        filterByAuthorizedAccounts: false,
        forcePrompt: true,
      },
    });
    if (response.provider !== 'google' || response.result.responseType !== 'online') {
      throw new Error('Google sign-in did not return an access token. Rebuild after adding Drive access on the Google app.');
    }
    const access = response.result.accessToken;
    if (!access?.token) {
      throw new Error('Google signed in but did not grant Drive. Add the Drive API and drive.file scope on the Google Cloud app.');
    }
    return {
      tokens: {
        access_token: access.token,
        refresh_token: access.refreshToken,
        expires_in: expiresInFrom(access),
      },
      account: {
        email: response.result.profile.email || undefined,
        name: response.result.profile.name || undefined,
      },
    };
  } catch (error) {
    throw asError(error, 'Google sign-in failed.');
  }
}

export async function refreshNativeSession(provider: CloudProvider): Promise<NativeTokens | null> {
  if (!isNativeApp()) return null;
  if (provider !== 'google-drive') return null;
  const clientId = clientIdFor(provider);
  if (!clientId) return null;
  try {
    await ensureNativeAuth();
    const response = await SocialLogin.login({
      provider: 'google',
      options: {
        scopes: GOOGLE_SCOPES,
        forceRefreshToken: true,
      },
    });
    if (response.provider !== 'google' || response.result.responseType !== 'online') {
      return null;
    }
    const access = response.result.accessToken;
    if (!access?.token) return null;
    return {
      access_token: access.token,
      refresh_token: access.refreshToken,
      expires_in: expiresInFrom(access),
    };
  } catch {
    return null;
  }
}

export async function logoutNativePlatform(provider?: CloudProvider): Promise<void> {
  if (!isNativeApp()) return;
  if (provider && provider !== 'google-drive') return;
  try {
    await ensureNativeAuth();
    await SocialLogin.logout({ provider: 'google' }).catch(() => undefined);
  } catch {
    /* Best-effort native sign-out. Local tokens are still cleared. */
  }
}

import { SocialLogin } from '@capgo/capacitor-social-login';
import { isNativeApp } from '../platform';
import { clientIdFor, missingClientIdMessage } from './credentials';
import { NATIVE_OAUTH_REDIRECT_URI } from './pkce';
import type { CloudProvider } from './types';

const GOOGLE_SCOPES = [
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
];

const DROPBOX_SCOPES = [
  'files.content.write',
  'files.content.read',
  'files.metadata.read',
  'files.metadata.write',
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
  const dropbox = clientIdFor('dropbox');
  const key = `${google}|${dropbox}`;
  if (initializedFor === key) return;
  await SocialLogin.initialize({
    ...(google
      ? {
          google: {
            webClientId: google,
            mode: 'online',
          },
        }
      : {}),
    ...(dropbox
      ? {
          oauth2: {
            dropbox: {
              appId: dropbox,
              authorizationBaseUrl: 'https://www.dropbox.com/oauth2/authorize',
              accessTokenEndpoint: 'https://api.dropboxapi.com/oauth2/token',
              redirectUrl: NATIVE_OAUTH_REDIRECT_URI,
              scope: DROPBOX_SCOPES.join(' '),
              pkceEnabled: true,
              responseType: 'code',
              androidUseCustomTabs: true,
              additionalParameters: { token_access_type: 'offline' },
            },
          },
        }
      : {}),
  });
  initializedFor = key;
}

export async function loginWithNativePlatform(provider: CloudProvider): Promise<{
  tokens: NativeTokens;
  account: NativeAccount;
}> {
  const clientId = clientIdFor(provider);
  if (!clientId) {
    throw new Error(missingClientIdMessage(provider));
  }
  await ensureNativeAuth();
  try {
    if (provider === 'google-drive') {
      const response = await SocialLogin.login({
        provider: 'google',
        options: {
          scopes: GOOGLE_SCOPES,
          forceRefreshToken: true,
          prompt: 'consent select_account',
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
    }

    const response = await SocialLogin.login({
      provider: 'oauth2',
      options: {
        providerId: 'dropbox',
        additionalParameters: { token_access_type: 'offline' },
      },
    });
    if (response.provider !== 'oauth2' || !response.result.accessToken?.token) {
      throw new Error('Dropbox sign-in did not finish.');
    }
    const resource = response.result.resourceData;
    const resourceName = resource?.name;
    const displayName =
      typeof resourceName === 'string'
        ? resourceName
        : resourceName &&
            typeof resourceName === 'object' &&
            'display_name' in resourceName &&
            typeof (resourceName as { display_name?: string }).display_name === 'string'
          ? (resourceName as { display_name: string }).display_name
          : undefined;
    return {
      tokens: {
        access_token: response.result.accessToken.token,
        refresh_token:
          response.result.refreshToken || response.result.accessToken.refreshToken || undefined,
        expires_in: expiresInFrom(response.result.accessToken, response.result.expiresIn),
      },
      account: {
        email: typeof resource?.email === 'string' ? resource.email : undefined,
        name: displayName,
      },
    };
  } catch (error) {
    throw asError(
      error,
      provider === 'google-drive'
        ? 'Google sign-in failed.'
        : 'Dropbox sign-in failed.',
    );
  }
}

export async function refreshNativeSession(provider: CloudProvider): Promise<NativeTokens | null> {
  if (!isNativeApp()) return null;
  const clientId = clientIdFor(provider);
  if (!clientId) return null;
  try {
    await ensureNativeAuth();
    if (provider === 'google-drive') {
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
    }
    const response = await SocialLogin.refreshToken({
      provider: 'oauth2',
      providerId: 'dropbox',
    });
    if (!response.accessToken?.token) return null;
    return {
      access_token: response.accessToken.token,
      refresh_token: response.refreshToken || response.accessToken.refreshToken || undefined,
      expires_in: expiresInFrom(response.accessToken, response.expiresIn),
    };
  } catch {
    return null;
  }
}

export async function logoutNativePlatform(provider?: CloudProvider): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await ensureNativeAuth();
    if (!provider || provider === 'google-drive') {
      await SocialLogin.logout({ provider: 'google' }).catch(() => undefined);
    }
    if (!provider || provider === 'dropbox') {
      await SocialLogin.logout({ provider: 'oauth2', providerId: 'dropbox' }).catch(
        () => undefined,
      );
    }
  } catch {
    /* Best-effort native sign-out. Local tokens are still cleared. */
  }
}

import { db, ensureSettings, type SyncAuth } from '../db/schema';
import { clientIdFor } from './credentials';
import { createPkce, oauthRedirectUri, randomUrlSafe, toFormBody } from './pkce';
import { ranchUrl } from './ranchServer';
import type { CloudProvider } from './types';

const OAUTH_SESSION_KEY = 'record-book.oauth';

type OauthSession = {
  provider: CloudProvider;
  verifier: string;
  state: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

function readSession(): OauthSession | null {
  try {
    const raw = localStorage.getItem(OAUTH_SESSION_KEY);
    return raw ? (JSON.parse(raw) as OauthSession) : null;
  } catch {
    return null;
  }
}

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

export async function startOAuth(provider: CloudProvider): Promise<void> {
  const readyUrl = ranchUrl(`/oauth/ready/${provider}`);
  if (readyUrl) {
    try {
      const ready = await fetch(readyUrl);
      const body = (await ready.json().catch(() => ({}))) as { error?: string };
      if (ready.ok) {
        const start = ranchUrl(
          `/oauth/start/${provider}?return_origin=${encodeURIComponent(window.location.origin)}`,
        );
        window.location.assign(start);
        return;
      }
      if (ready.status !== 503) {
        throw new Error(body.error || 'Could not start ranch sign-in.');
      }
    } catch (error) {
      if (error instanceof Error && !/failed to fetch|not fetched|networkerror/i.test(error.message)) {
        throw error;
      }
    }
  }

  const clientId = clientIdFor(provider);
  if (!clientId) {
    throw new Error(
      'Sign in is not set up on this ranch yet. Add the Google/Dropbox app on the NAS (or GitHub secrets), then tap Connect again. You do not paste keys on the phone.',
    );
  }

  const { verifier, challenge } = await createPkce();
  const state = randomUrlSafe(16);
  const redirectUri = oauthRedirectUri();
  localStorage.setItem(
    OAUTH_SESSION_KEY,
    JSON.stringify({ provider, verifier, state } satisfies OauthSession),
  );

  const url = new URL(
    provider === 'google-drive'
      ? 'https://accounts.google.com/o/oauth2/v2/auth'
      : 'https://www.dropbox.com/oauth2/authorize',
  );
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);

  if (provider === 'google-drive') {
    url.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.file');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
  } else {
    url.searchParams.set('token_access_type', 'offline');
  }

  window.location.assign(url.toString());
}

async function exchangeCode(
  provider: CloudProvider,
  code: string,
  verifier: string,
): Promise<TokenResponse> {
  const clientId = clientIdFor(provider);
  const redirectUri = oauthRedirectUri();
  const body =
    provider === 'google-drive'
      ? toFormBody({
          code,
          client_id: clientId,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        })
      : toFormBody({
          code,
          grant_type: 'authorization_code',
          client_id: clientId,
          redirect_uri: redirectUri,
          code_verifier: verifier,
        });

  const tokenUrl =
    provider === 'google-drive'
      ? 'https://oauth2.googleapis.com/token'
      : 'https://api.dropboxapi.com/oauth2/token';

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await response.json()) as TokenResponse;
  if (!response.ok || !json.access_token) {
    throw new Error(
      json.error_description || json.error || 'Cloud login did not finish.',
    );
  }
  return json;
}

async function fetchAccount(
  provider: CloudProvider,
  accessToken: string,
): Promise<{ email?: string; name?: string }> {
  try {
    if (provider === 'google-drive') {
      const response = await fetch(
        'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) return {};
      const json = (await response.json()) as {
        user?: { displayName?: string; emailAddress?: string };
      };
      return {
        email: json.user?.emailAddress,
        name: json.user?.displayName,
      };
    }
    const response = await fetch(
      'https://api.dropboxapi.com/2/users/get_current_account',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!response.ok) return {};
    const json = (await response.json()) as {
      email?: string;
      name?: { display_name?: string };
    };
    return { email: json.email, name: json.name?.display_name };
  } catch {
    return {};
  }
}

function expiresAtFrom(seconds?: number): number {
  const life = (seconds && seconds > 0 ? seconds : 3600) * 1000;
  return Date.now() + life;
}

async function persistAuth(
  provider: CloudProvider,
  tokens: TokenResponse,
  previous?: SyncAuth,
  options: { connect?: boolean } = {},
): Promise<SyncAuth> {
  const reuseAccount =
    !options.connect &&
    previous?.provider === provider &&
    Boolean(previous.accountEmail);
  const account = reuseAccount
    ? { email: previous?.accountEmail, name: previous?.accountName }
    : await fetchAccount(provider, tokens.access_token!);
  const auth: SyncAuth = {
    id: 1,
    provider,
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token || previous?.refreshToken,
    expiresAt: expiresAtFrom(tokens.expires_in),
    accountEmail: account.email || previous?.accountEmail,
    accountName: account.name || previous?.accountName,
    rootFolderId: previous?.rootFolderId,
    snapshotsFolderId: previous?.snapshotsFolderId,
    changesFolderId: previous?.changesFolderId,
  };
  await db.syncAuth.put(auth);
  if (options.connect) {
    const settings = await ensureSettings();
    await db.settings.put({
      ...settings,
      syncProvider: provider,
      updatedAt: new Date().toISOString(),
    });
  }
  return auth;
}

export async function completeOAuthCallback(
  params: URLSearchParams,
): Promise<{ ok: boolean; detail: string }> {
  const error = params.get('error_description') || params.get('error');
  if (error) {
    localStorage.removeItem(OAUTH_SESSION_KEY);
    return { ok: false, detail: error };
  }

  const handshake = params.get('ranch_oauth');
  const handshakeProvider = params.get('provider');
  if (handshake) {
    const sessionUrl = ranchUrl(`/oauth/session/${encodeURIComponent(handshake)}`);
    if (!sessionUrl) {
      return { ok: false, detail: 'Ranch API is not set. Sign in on ranch Wi-Fi.' };
    }
    const response = await fetch(sessionUrl);
    const tokens = (await response.json()) as TokenResponse & { provider?: CloudProvider };
    if (!response.ok || !tokens.access_token) {
      return {
        ok: false,
        detail: tokens.error_description || tokens.error || 'Sign-in expired. Try Connect again.',
      };
    }
    const provider =
      tokens.provider ||
      (handshakeProvider === 'google-drive' || handshakeProvider === 'dropbox'
        ? handshakeProvider
        : null);
    if (!provider) {
      return { ok: false, detail: 'Sign-in did not say Google or Dropbox.' };
    }
    const previous = await db.syncAuth.get(1);
    await persistAuth(provider, tokens, previous, { connect: true });
    try {
      const { syncNow } = await import('./engine');
      const synced = await syncNow();
      if (synced.ok) {
        return {
          ok: true,
          detail:
            provider === 'google-drive'
              ? 'Google signed in.'
              : 'Dropbox signed in.',
        };
      }
    } catch {
      /* Login succeeded; ranch sync will retry. */
    }
    return {
      ok: true,
      detail: provider === 'google-drive' ? 'Google signed in.' : 'Dropbox signed in.',
    };
  }

  const session = readSession();
  const code = params.get('code');
  const state = params.get('state');
  localStorage.removeItem(OAUTH_SESSION_KEY);

  if (!session || !code) {
    return {
      ok: false,
      detail: 'This login window expired. Start again from Settings.',
    };
  }
  if (session.state !== state) {
    return { ok: false, detail: 'Login state did not match. Try connecting again.' };
  }

  const previous = await db.syncAuth.get(1);
  const tokens = await exchangeCode(session.provider, code, session.verifier);
  await persistAuth(session.provider, tokens, previous, { connect: true });
  try {
    const { syncNow } = await import('./engine');
    const synced = await syncNow();
    if (synced.ok) {
      return {
        ok: true,
        detail:
          session.provider === 'google-drive'
            ? 'Google Drive connected. RecordBook folder is ready.'
            : 'Dropbox connected. RecordBook folder is ready.',
      };
    }
  } catch {
    /* Login succeeded; background sync will retry. */
  }
  return {
    ok: true,
    detail:
      session.provider === 'google-drive'
        ? 'Google Drive connected.'
        : 'Dropbox connected.',
  };
}

async function refreshTokens(auth: SyncAuth): Promise<SyncAuth> {
  if (!auth.refreshToken) {
    throw new Error('Cloud session expired. Reconnect in Settings.');
  }
  const clientId = clientIdFor(auth.provider);
  const tokenUrl =
    auth.provider === 'google-drive'
      ? 'https://oauth2.googleapis.com/token'
      : 'https://api.dropboxapi.com/oauth2/token';
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: toFormBody({
      grant_type: 'refresh_token',
      refresh_token: auth.refreshToken,
      client_id: clientId,
    }),
  });
  const json = (await response.json()) as TokenResponse;
  if (!response.ok || !json.access_token) {
    throw new Error('Cloud session expired. Reconnect in Settings.');
  }
  return persistAuth(auth.provider, json, auth);
}

export async function hasUsableSession(): Promise<boolean> {
  const auth = await getSyncAuth();
  if (!auth?.accessToken) return false;
  if (Date.now() < auth.expiresAt - 5000) return true;
  return Boolean(auth.refreshToken);
}

export async function getValidAccessToken(): Promise<string | null> {
  const auth = await getSyncAuth();
  if (!auth?.accessToken) return null;
  if (Date.now() < auth.expiresAt - 120_000) return auth.accessToken;
  if (!auth.refreshToken) return null;
  try {
    const next = await refreshTokens(auth);
    return next.accessToken;
  } catch {
    return null;
  }
}

export async function requireAccessToken(): Promise<{
  token: string;
  auth: SyncAuth;
}> {
  const token = await getValidAccessToken();
  const auth = await getSyncAuth();
  if (!token || !auth) {
    throw new Error('Connect Google Drive or Dropbox in Settings.');
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

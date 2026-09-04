import { db, ensureSettings, type SyncAuth } from '../db/schema';
import { isNativeApp } from '../platform';
import { clientIdFor, missingClientIdMessage } from './credentials';
import {
  hasRanchServer,
  removeNasCloudLogin,
  shareCloudLoginWithNas,
} from './ranchServer';
import {
  loginWithNativePlatform,
  logoutNativePlatform,
  refreshNativeSession,
} from './nativeAuth';
import {
  openExternalAuthUrl,
  prepareNativeOAuthReturn,
  waitForNativeOAuthReturn,
} from './oauthReturn';
import { createPkce, oauthRedirectUri, randomUrlSafe, toFormBody } from './pkce';
import { authRowId, preferredCloudProvider, relocatedDropboxAuth } from './authStore';
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

type AccountInfo = { email?: string; name?: string };

function readSession(): OauthSession | null {
  try {
    const raw = localStorage.getItem(OAUTH_SESSION_KEY);
    return raw ? (JSON.parse(raw) as OauthSession) : null;
  } catch {
    return null;
  }
}

let migratedAuthRows = false;

async function migrateCloudAuthRows(): Promise<void> {
  if (migratedAuthRows) return;
  const row = await db.syncAuth.get(1);
  const moved = relocatedDropboxAuth(row);
  if (moved) {
    await db.syncAuth.put(moved);
    await db.syncAuth.delete(1);
  }
  migratedAuthRows = true;
}

export async function getAuthFor(provider: CloudProvider): Promise<SyncAuth | undefined> {
  await migrateCloudAuthRows();
  const row = await db.syncAuth.get(authRowId(provider));
  return row?.provider === provider ? row : undefined;
}

export async function listCloudAuths(): Promise<SyncAuth[]> {
  await migrateCloudAuthRows();
  const rows = await db.syncAuth.toArray();
  return rows.filter(
    (row) => row.provider === 'google-drive' || row.provider === 'dropbox',
  );
}

export async function getSyncAuth(): Promise<SyncAuth | undefined> {
  const settings = await db.settings.get(1);
  const rows = await listCloudAuths();
  const preferred = preferredCloudProvider(
    settings?.syncProvider,
    rows.map((row) => row.provider),
  );
  if (!preferred) return undefined;
  return rows.find((row) => row.provider === preferred);
}

export async function disconnectCloud(provider?: CloudProvider): Promise<void> {
  await migrateCloudAuthRows();
  if (provider) {
    await logoutNativePlatform(provider);
    const settings = await ensureSettings();
    const remaining = (await listCloudAuths()).filter((row) => row.provider !== provider);
    await db.transaction('rw', db.syncAuth, db.settings, async () => {
      await db.syncAuth.delete(authRowId(provider));
      const next = remaining[0]?.provider ?? 'none';
      await db.settings.put({
        ...settings,
        syncProvider: settings.syncProvider === provider ? next : settings.syncProvider,
        updatedAt: new Date().toISOString(),
      });
    });
    await removeNasCloudLogin(provider);
    return;
  }
  await logoutNativePlatform();
  const settings = await ensureSettings();
  await db.transaction('rw', db.syncAuth, db.settings, async () => {
    await db.syncAuth.clear();
    await db.settings.put({
      ...settings,
      syncProvider: 'none',
      updatedAt: new Date().toISOString(),
    });
  });
  await removeNasCloudLogin('google-drive');
  await removeNasCloudLogin('dropbox');
}

function signedInDetail(provider: CloudProvider): string {
  return provider === 'google-drive'
    ? 'Signed in to YOUR Google Drive. Dropbox stays connected if you already signed in there.'
    : 'Signed in to YOUR Dropbox. Google stays connected if you already signed in there.';
}

function authorizationUrl(
  provider: CloudProvider,
  clientId: string,
  redirectUri: string,
  challenge: string,
  state: string,
): string {
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
  return url.toString();
}

async function savePkceSession(provider: CloudProvider): Promise<{
  challenge: string;
  redirectUri: string;
  state: string;
}> {
  const { verifier, challenge } = await createPkce();
  const state = randomUrlSafe(16);
  const redirectUri = oauthRedirectUri();
  localStorage.setItem(
    OAUTH_SESSION_KEY,
    JSON.stringify({ provider, verifier, state } satisfies OauthSession),
  );
  return { challenge, redirectUri, state };
}

function syncAfterLogin(): void {
  void import('./engine')
    .then(({ syncNow }) => syncNow())
    .catch(() => undefined);
}

async function finishNativeGoogleLogin(): Promise<{ navigated: boolean; detail: string }> {
  const native = await loginWithNativePlatform('google-drive');
  const previous = await getAuthFor('google-drive');
  await persistAuth('google-drive', native.tokens, previous, {
    connect: true,
    account: native.account,
  });
  syncAfterLogin();
  return { navigated: false, detail: signedInDetail('google-drive') };
}

async function finishNativeDropboxLogin(): Promise<{ navigated: boolean; detail: string }> {
  const clientId = clientIdFor('dropbox');
  if (!clientId) {
    throw new Error(missingClientIdMessage('dropbox'));
  }
  const { challenge, redirectUri, state } = await savePkceSession('dropbox');
  await prepareNativeOAuthReturn();
  const waiting = waitForNativeOAuthReturn();
  openExternalAuthUrl(
    authorizationUrl('dropbox', clientId, redirectUri, challenge, state),
  );
  const params = await waiting;
  const result = await completeOAuthCallback(params);
  if (!result.ok) {
    throw new Error(result.detail);
  }
  return { navigated: false, detail: result.detail };
}

export async function startOAuth(
  provider: CloudProvider,
): Promise<{ navigated: boolean; detail?: string }> {
  if (isNativeApp()) {
    return provider === 'google-drive'
      ? finishNativeGoogleLogin()
      : finishNativeDropboxLogin();
  }

  const clientId = clientIdFor(provider);
  if (!clientId) {
    throw new Error(missingClientIdMessage(provider));
  }

  const { challenge, redirectUri, state } = await savePkceSession(provider);
  window.location.assign(
    authorizationUrl(provider, clientId, redirectUri, challenge, state),
  );
  return { navigated: true };
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
): Promise<AccountInfo> {
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
  options: { connect?: boolean; account?: AccountInfo } = {},
): Promise<SyncAuth> {
  const reuseAccount =
    !options.connect &&
    previous?.provider === provider &&
    Boolean(previous.accountEmail);
  const account = options.account
    ? options.account
    : reuseAccount
      ? { email: previous?.accountEmail, name: previous?.accountName }
      : await fetchAccount(provider, tokens.access_token!);
  const auth: SyncAuth = {
    id: authRowId(provider),
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
  if (hasRanchServer()) {
    void shareCloudLoginWithNas({
      provider,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      expiresAt: auth.expiresAt,
      accountEmail: auth.accountEmail,
      accountName: auth.accountName,
      clientId: clientIdFor(provider),
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

  const previous = await getAuthFor(session.provider);
  const tokens = await exchangeCode(session.provider, code, session.verifier);
  await persistAuth(session.provider, tokens, previous, { connect: true });
  syncAfterLogin();
  return {
    ok: true,
    detail: signedInDetail(session.provider),
  };
}

async function refreshTokens(auth: SyncAuth): Promise<SyncAuth> {
  if (auth.refreshToken) {
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
    if (response.ok && json.access_token) {
      return persistAuth(auth.provider, json, auth);
    }
  }
  if (isNativeApp()) {
    const native = await refreshNativeSession(auth.provider);
    if (native?.access_token) {
      return persistAuth(auth.provider, native, auth);
    }
  }
  throw new Error('Cloud session expired. Reconnect in Settings.');
}

function authLooksUsable(auth: SyncAuth | undefined): boolean {
  if (!auth?.accessToken) return false;
  if (Date.now() < auth.expiresAt - 5000) return true;
  if (auth.refreshToken) return true;
  return isNativeApp();
}

export async function hasUsableSession(provider?: CloudProvider): Promise<boolean> {
  if (provider) return authLooksUsable(await getAuthFor(provider));
  const rows = await listCloudAuths();
  return rows.some((row) => authLooksUsable(row));
}

export async function getValidAccessToken(
  provider?: CloudProvider,
): Promise<string | null> {
  const auth = provider ? await getAuthFor(provider) : await getSyncAuth();
  if (!auth?.accessToken) return null;
  if (Date.now() < auth.expiresAt - 120_000) return auth.accessToken;
  try {
    const next = await refreshTokens(auth);
    return next.accessToken;
  } catch {
    return null;
  }
}

export async function requireAccessToken(provider: CloudProvider): Promise<{
  token: string;
  auth: SyncAuth;
}> {
  const token = await getValidAccessToken(provider);
  const auth = await getAuthFor(provider);
  if (!token || !auth) {
    throw new Error(
      provider === 'google-drive'
        ? 'Sign in with Google in Settings.'
        : 'Sign in with Dropbox in Settings.',
    );
  }
  return { token, auth };
}

export async function saveAuthFolders(
  provider: CloudProvider,
  patch: Partial<
    Pick<SyncAuth, 'rootFolderId' | 'snapshotsFolderId' | 'changesFolderId'>
  >,
): Promise<void> {
  const auth = await getAuthFor(provider);
  if (!auth) return;
  await db.syncAuth.put({ ...auth, ...patch });
}

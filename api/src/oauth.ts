import { createHash, randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import { Hono } from 'hono';

type Provider = 'google-drive' | 'dropbox';

type Pending = {
  provider: Provider;
  verifier: string;
  returnOrigin: string;
  createdAt: number;
};

type Handshake = {
  provider: Provider;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
};

type HandshakeRow = Handshake & { createdAt: number };

const pending = new Map<string, Pending>();
const handshakes = new Map<string, HandshakeRow>();
const PENDING_MS = 15 * 60_000;
const HANDSHAKE_MS = 2 * 60_000;

function b64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomId(): string {
  return b64url(randomBytes(24));
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function asProvider(value: string): Provider | null {
  if (value === 'google-drive' || value === 'dropbox') return value;
  return null;
}

function clientIdFor(provider: Provider): string {
  if (provider === 'google-drive') {
    return (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  }
  return (process.env.DROPBOX_APP_KEY || '').trim();
}

export function publicApiBase(c: Context): string {
  const proto = (c.req.header('x-forwarded-proto') || 'http').split(',')[0].trim();
  const host = (c.req.header('x-forwarded-host') || c.req.header('host') || 'localhost:8180')
    .split(',')[0]
    .trim();
  return `${proto}://${host}/api`;
}

export function allowReturnOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(url.hostname)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(url.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

function sweep(): void {
  const now = Date.now();
  for (const [id, row] of pending) {
    if (now - row.createdAt > PENDING_MS) pending.delete(id);
  }
  for (const [id, row] of handshakes) {
    if (now - row.createdAt > HANDSHAKE_MS) handshakes.delete(id);
  }
}

function putHandshake(id: string, row: Handshake): void {
  handshakes.set(id, { ...row, createdAt: Date.now() });
}

export const oauth = new Hono();

oauth.get('/ready/:provider', (c) => {
  const provider = asProvider(c.req.param('provider'));
  if (!provider) return c.json({ ok: false, error: 'Unknown provider.' }, 400);
  const clientId = clientIdFor(provider);
  if (!clientId) {
    return c.json(
      {
        ok: false,
        error:
          provider === 'google-drive'
            ? 'Google sign-in is not configured on this ranch yet.'
            : 'Dropbox sign-in is not configured on this ranch yet.',
      },
      503,
    );
  }
  return c.json({ ok: true, provider });
});

oauth.get('/start/:provider', (c) => {
  sweep();
  const provider = asProvider(c.req.param('provider'));
  if (!provider) return c.json({ error: 'Unknown provider.' }, 400);
  const clientId = clientIdFor(provider);
  if (!clientId) {
    return c.json(
      {
        error:
          provider === 'google-drive'
            ? 'Google sign-in is not configured on this ranch yet.'
            : 'Dropbox sign-in is not configured on this ranch yet.',
      },
      503,
    );
  }
  const returnOrigin = (c.req.query('return_origin') || '').trim();
  if (!allowReturnOrigin(returnOrigin)) {
    return c.json({ error: 'This app origin is not allowed to sign in.' }, 400);
  }
  const { verifier, challenge } = pkce();
  const state = randomId();
  pending.set(state, {
    provider,
    verifier,
    returnOrigin: returnOrigin.replace(/\/$/, ''),
    createdAt: Date.now(),
  });
  const redirectUri = `${publicApiBase(c)}/oauth/callback`;
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
  return c.redirect(url.toString(), 302);
});

oauth.get('/callback', async (c) => {
  sweep();
  const error = c.req.query('error_description') || c.req.query('error');
  const state = c.req.query('state') || '';
  const session = pending.get(state);
  pending.delete(state);
  if (error) {
    const origin = session?.returnOrigin || 'https://localhost';
    return c.redirect(
      `${origin}/oauth/callback?error=${encodeURIComponent(error)}`,
      302,
    );
  }
  const code = c.req.query('code') || '';
  if (!session || !code) {
    return c.json({ error: 'Sign-in expired. Start again from the app.' }, 400);
  }
  const clientId = clientIdFor(session.provider);
  const redirectUri = `${publicApiBase(c)}/oauth/callback`;
  const tokenUrl =
    session.provider === 'google-drive'
      ? 'https://oauth2.googleapis.com/token'
      : 'https://api.dropboxapi.com/oauth2/token';
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: session.verifier,
  });
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !json.access_token) {
    const detail = json.error_description || json.error || 'Cloud login did not finish.';
    return c.redirect(
      `${session.returnOrigin}/oauth/callback?error=${encodeURIComponent(detail)}`,
      302,
    );
  }
  const id = randomId();
  putHandshake(id, {
    provider: session.provider,
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
  });
  const next = new URL(`${session.returnOrigin}/oauth/callback`);
  next.searchParams.set('ranch_oauth', id);
  next.searchParams.set('provider', session.provider);
  return c.redirect(next.toString(), 302);
});

oauth.get('/session/:id', (c) => {
  sweep();
  const id = c.req.param('id');
  const row = handshakes.get(id);
  handshakes.delete(id);
  if (!row) return c.json({ error: 'Sign-in expired. Start again from the app.' }, 404);
  return c.json({
    provider: row.provider,
    access_token: row.accessToken,
    refresh_token: row.refreshToken,
    expires_in: row.expiresIn,
  });
});

import { isNativeApp } from '../platform';

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function randomUrlSafe(bytes = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function createPkce(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const verifier = randomUrlSafe(32);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: bytesToBase64Url(new Uint8Array(digest)) };
}

/** Loopback URI Chrome Custom Tabs can reach; keep in sync with OauthLoopbackServer.PORT. */
export const NATIVE_OAUTH_CALLBACK = 'http://127.0.0.1:18763/oauth/callback';

export function oauthRedirectUri(): string {
  if (isNativeApp()) {
    return NATIVE_OAUTH_CALLBACK;
  }
  return `${window.location.origin}/oauth/callback`;
}

export function toFormBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

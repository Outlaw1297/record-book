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

/** Custom-scheme return used by the APK, never the ranch API. */
export const NATIVE_OAUTH_REDIRECT_URI = 'me.flyingjranch.recordbook://oauth/callback';

export function oauthRedirectUriFor(native: boolean, origin: string): string {
  return native ? NATIVE_OAUTH_REDIRECT_URI : `${origin}/oauth/callback`;
}

/** APK must exchange against the custom scheme; the PWA uses this page’s origin. */
export function oauthRedirectUri(): string {
  return oauthRedirectUriFor(isNativeApp(), window.location.origin);
}

export function toFormBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

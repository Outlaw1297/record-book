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

/** Custom-scheme return used by the APK (Custom Tabs), never the ranch API. */
export const NATIVE_OAUTH_REDIRECT_URI = 'me.flyingjranch.recordbook://oauth/callback';

/** Browser / PWA return. The APK uses native Google Sign-In and the custom scheme above. */
export function oauthRedirectUri(): string {
  return `${window.location.origin}/oauth/callback`;
}

export function toFormBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

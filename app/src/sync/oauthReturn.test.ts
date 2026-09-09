import { describe, expect, it } from 'vitest';
import {
  deliverNativeOAuthReturn,
  isOAuthCallbackLocation,
  isOAuthCallbackPath,
  parseOAuthReturnUrl,
  waitForNativeOAuthReturn,
} from './oauthReturn';
import { NATIVE_OAUTH_REDIRECT_URI, oauthRedirectUriFor } from './pkce';

describe('native OAuth return', () => {
  it('uses the custom scheme on the phone and the page origin in the browser', () => {
    expect(oauthRedirectUriFor(true, 'https://localhost')).toBe(NATIVE_OAUTH_REDIRECT_URI);
    expect(oauthRedirectUriFor(false, 'https://ranch.example')).toBe(
      'https://ranch.example/oauth/callback',
    );
  });

  it('recognizes the PWA callback path and the custom-scheme host', () => {
    expect(isOAuthCallbackPath('/oauth/callback')).toBe(true);
    expect(isOAuthCallbackPath('/callback')).toBe(true);
    expect(isOAuthCallbackPath('/settings')).toBe(false);
    expect(isOAuthCallbackLocation('/oauth/callback', 'localhost')).toBe(true);
    expect(isOAuthCallbackLocation('/callback', 'oauth')).toBe(true);
    expect(isOAuthCallbackLocation('/callback', 'localhost')).toBe(false);
  });

  it('reads the code from both https and custom-scheme returns', () => {
    const web = parseOAuthReturnUrl(
      'https://localhost/oauth/callback?code=abc&state=s1',
    );
    expect(web?.get('code')).toBe('abc');
    expect(web?.get('state')).toBe('s1');

    const native = parseOAuthReturnUrl(
      `${NATIVE_OAUTH_REDIRECT_URI}?code=xyz&state=s2`,
    );
    expect(native?.get('code')).toBe('xyz');
    expect(native?.get('state')).toBe('s2');

    expect(parseOAuthReturnUrl('https://localhost/settings')).toBeNull();
  });

  it('hands the return to the waiting native Dropbox login', async () => {
    const waiting = waitForNativeOAuthReturn(5_000);
    const delivered = deliverNativeOAuthReturn(
      new URLSearchParams('code=from-app&state=ok'),
    );
    expect(delivered).toBe(true);
    const params = await waiting;
    expect(params.get('code')).toBe('from-app');
    expect(deliverNativeOAuthReturn(new URLSearchParams('code=late'))).toBe(false);
  });
});

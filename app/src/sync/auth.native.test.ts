import { describe, expect, it } from 'vitest';
import { missingClientIdMessage } from './credentials';
import { NATIVE_OAUTH_REDIRECT_URI, oauthRedirectUri } from './pkce';
import { noSharedBookDetail } from './statusCopy';

describe('native platform login', () => {
  it('uses the app scheme for APK OAuth, not the ranch API', () => {
    expect(NATIVE_OAUTH_REDIRECT_URI).toBe('me.flyingjranch.recordbook://oauth/callback');
    expect(NATIVE_OAUTH_REDIRECT_URI).not.toContain('/api/oauth');
  });

  it('keeps browser OAuth on this origin', () => {
    const previous = (globalThis as { window?: { location: { origin: string } } }).window;
    (globalThis as { window: { location: { origin: string } } }).window = {
      location: { origin: 'http://192.168.1.56:8180' },
    };
    expect(oauthRedirectUri()).toBe('http://192.168.1.56:8180/oauth/callback');
    expect(oauthRedirectUri()).not.toContain('/api/oauth');
    if (previous) {
      (globalThis as { window: typeof previous }).window = previous;
    }
  });

  it('tells the developer to bake client IDs, not paste them on the phone', () => {
    expect(missingClientIdMessage('google-drive')).toContain('VITE_GOOGLE_CLIENT_ID');
    expect(missingClientIdMessage('google-drive')).toContain('do not paste');
    expect(missingClientIdMessage('dropbox')).toContain('VITE_DROPBOX_APP_KEY');
  });

  it('does not require a ranch server when nothing is configured', () => {
    expect(noSharedBookDetail()).toMatch(/Sign in with Google or Dropbox/);
    expect(noSharedBookDetail()).not.toMatch(/Ranch API is not set/);
  });
});

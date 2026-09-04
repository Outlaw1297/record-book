import { describe, expect, it } from 'vitest';
import { missingClientIdMessage } from './credentials';
import { noSharedBookDetail } from './statusCopy';

describe('native cloud login', () => {
  it('asks each ranch to sign into their own account', () => {
    expect(noSharedBookDetail()).toMatch(/YOUR Google Drive or Dropbox/);
    expect(noSharedBookDetail()).toMatch(/Other ranches are not on this book/);
  });

  it('does not tell people to paste keys on the phone', () => {
    expect(missingClientIdMessage('google-drive')).not.toMatch(/paste/i);
    expect(missingClientIdMessage('google-drive')).toMatch(/oauth-setup/);
    expect(missingClientIdMessage('dropbox')).toMatch(/their own Dropbox/);
  });

  it('keeps the phone return URI on the custom scheme so token exchange matches Dropbox', async () => {
    const { NATIVE_OAUTH_REDIRECT_URI, oauthRedirectUriFor } = await import('./pkce');
    expect(oauthRedirectUriFor(true, 'https://localhost')).toBe(
      NATIVE_OAUTH_REDIRECT_URI,
    );
  });
});

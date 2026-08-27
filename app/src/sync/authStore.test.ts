import { describe, expect, it } from 'vitest';
import {
  authRowId,
  preferredCloudProvider,
  relocatedDropboxAuth,
} from './authStore';

describe('authRowId', () => {
  it('keeps Google on row 1 and Dropbox on row 2 so one login does not wipe the other', () => {
    expect(authRowId('google-drive')).toBe(1);
    expect(authRowId('dropbox')).toBe(2);
  });
});

describe('relocatedDropboxAuth', () => {
  it('moves a Dropbox session that was saved as the only row', () => {
    const moved = relocatedDropboxAuth({
      id: 1,
      provider: 'dropbox',
      accessToken: 'dbx',
      expiresAt: 1,
    });
    expect(moved?.id).toBe(2);
    expect(moved?.provider).toBe('dropbox');
  });

  it('leaves Google on row 1', () => {
    expect(
      relocatedDropboxAuth({
        id: 1,
        provider: 'google-drive',
        accessToken: 'g',
        expiresAt: 1,
      }),
    ).toBeNull();
  });
});

describe('preferredCloudProvider', () => {
  it('uses the last signed-in cloud when both are connected', () => {
    expect(preferredCloudProvider('dropbox', ['google-drive', 'dropbox'])).toBe(
      'dropbox',
    );
  });

  it('falls back to whatever is still signed in', () => {
    expect(preferredCloudProvider('dropbox', ['google-drive'])).toBe('google-drive');
    expect(preferredCloudProvider('none', [])).toBeNull();
  });
});

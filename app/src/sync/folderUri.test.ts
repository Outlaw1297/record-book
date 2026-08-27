import { describe, expect, it } from 'vitest';
import {
  assertCloudFolder,
  folderIsOnThisPhone,
  folderLooksLikeProvider,
} from './folderUri';

describe('folderUri', () => {
  it('treats the system storage tree as this phone', () => {
    expect(
      folderIsOnThisPhone(
        'content://com.android.externalstorage.documents/tree/primary%3ADownload',
      ),
    ).toBe(true);
  });

  it('recognizes a Google Drive tree URI', () => {
    const id =
      'content://com.google.android.apps.docs.storage/tree/enc%3Aexample';
    expect(folderLooksLikeProvider(id, 'google-drive')).toBe(true);
    expect(folderIsOnThisPhone(id)).toBe(false);
    expect(() => assertCloudFolder(id, 'google-drive')).not.toThrow();
  });

  it('rejects this-phone storage when Drive was requested', () => {
    expect(() =>
      assertCloudFolder(
        'content://com.android.externalstorage.documents/tree/primary%3A',
        'google-drive',
      ),
    ).toThrow(/Google Drive/i);
  });

  it('rejects this-phone storage when Dropbox was requested', () => {
    expect(() =>
      assertCloudFolder(
        'content://com.android.externalstorage.documents/tree/primary%3A',
        'dropbox',
      ),
    ).toThrow(/Dropbox on Android/i);
  });

  it('allows the browser folder handle', () => {
    expect(() => assertCloudFolder('fsa', 'google-drive')).not.toThrow();
  });
});

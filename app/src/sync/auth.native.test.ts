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
    expect(missingClientIdMessage('google-drive')).toMatch(/Android client/);
    expect(missingClientIdMessage('dropbox')).toMatch(/their own Dropbox/);
  });
});

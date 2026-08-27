import { describe, expect, it } from 'vitest';
import { cloudSyncRole } from './cloudRole';

describe('cloudSyncRole', () => {
  it('skips cloud when nobody signed in', () => {
    expect(cloudSyncRole(false, false)).toBe('off');
    expect(cloudSyncRole(true, false)).toBe('off');
  });

  it('uses Drive or Dropbox as the book when the ranch is down', () => {
    expect(cloudSyncRole(false, true)).toBe('book');
  });

  it('writes a spare copy when the ranch database is up', () => {
    expect(cloudSyncRole(true, true)).toBe('backup');
  });
});

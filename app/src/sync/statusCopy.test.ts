import { describe, expect, it } from 'vitest';
import { noneProviderBanner } from './statusCopy';

describe('noneProviderBanner', () => {
  it('treats the ranch database as the shared book after a copy', () => {
    expect(
      noneProviderBanner({
        pendingCount: 0,
        ranchConfigured: true,
        ranchSyncedAt: '2026-08-27T00:00:00.000Z',
      }),
    ).toMatch(/ranch database last synced/);
  });

  it('says pending rows are copying to ranch', () => {
    expect(
      noneProviderBanner({
        pendingCount: 4,
        ranchConfigured: true,
      }),
    ).toBe('4 change(s) copying to the ranch database…');
  });

  it('asks no-server installs to sign in', () => {
    expect(
      noneProviderBanner({
        pendingCount: 0,
        ranchConfigured: false,
      }),
    ).toMatch(/sign in with Google or Dropbox/i);
  });
});

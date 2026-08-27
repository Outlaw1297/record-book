import { describe, expect, it } from 'vitest';
import { noneProviderBanner } from './statusCopy';

describe('noneProviderBanner', () => {
  it('says the ranch copy finished even if Drive is not connected', () => {
    expect(
      noneProviderBanner({
        pendingCount: 4,
        ranchConfigured: true,
        ranchSyncedAt: '2026-08-27T00:00:00.000Z',
      }),
    ).toMatch(/Ranch database copied/);
  });

  it('says pending rows are copying to ranch before the first success', () => {
    expect(
      noneProviderBanner({
        pendingCount: 4,
        ranchConfigured: true,
      }),
    ).toBe('4 change(s) copying to the ranch database…');
  });
});

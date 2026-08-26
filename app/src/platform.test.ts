import { describe, expect, it } from 'vitest';
import { RANCH_LAN_API_PLACEHOLDER, isNativeApp } from './platform';

describe('native shell', () => {
  it('is not native in unit tests', () => {
    expect(isNativeApp()).toBe(false);
  });

  it('points the phone at the ranch LAN API, not /api', () => {
    expect(RANCH_LAN_API_PLACEHOLDER).toMatch(/^https?:\/\//);
    expect(RANCH_LAN_API_PLACEHOLDER).not.toBe('/api');
  });
});

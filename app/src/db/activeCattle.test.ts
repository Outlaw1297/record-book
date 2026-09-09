import { describe, expect, it } from 'vitest';
import { isActiveCattle } from './schema';

describe('isActiveCattle', () => {
  it('counts Active and Open, not sold or dead', () => {
    expect(isActiveCattle('active')).toBe(true);
    expect(isActiveCattle('open')).toBe(true);
    expect(isActiveCattle('sold')).toBe(false);
    expect(isActiveCattle('dead')).toBe(false);
    expect(isActiveCattle('culled')).toBe(false);
    expect(isActiveCattle('reference')).toBe(false);
  });
});

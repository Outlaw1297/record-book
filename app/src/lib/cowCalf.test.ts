import { describe, expect, it } from 'vitest';
import { calfRowLabel } from './cowCalf';

describe('calfRowLabel', () => {
  it('names the calf on a normal row', () => {
    expect(
      calfRowLabel({ cowId: 'TEST', calfId: 'TEST2', openWithoutCalf: false }),
    ).toBe('TEST2');
  });

  it('names the cow when the row is open with no calf', () => {
    expect(
      calfRowLabel({ cowId: 'Helen', calfId: undefined, openWithoutCalf: true }),
    ).toBe('Helen');
  });
});

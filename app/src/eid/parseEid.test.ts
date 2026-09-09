import { describe, expect, it } from 'vitest';
import { bestCircularEid, extractEid, formatEidGroups, scoreEid } from './parseEid';

describe('extractEid', () => {
  it('reads Allflex 15-digit Decimal2', () => {
    expect(extractEid('982003123456789')).toBe('982003123456789');
  });

  it('reads Tru-Test Decimal with spaces', () => {
    expect(extractEid('982 003 123 456 789')).toBe('982003123456789');
  });

  it('reads an ISO wrapper from a stick reader', () => {
    expect(extractEid('A0000000982003123456789')).toBe('982003123456789');
    expect(extractEid('1000000982003123456789')).toBe('982003123456789');
  });

  it('ignores empty noise', () => {
    expect(extractEid('Allflex')).toBeUndefined();
    expect(extractEid('000000000000000')).toBeUndefined();
    expect(extractEid('982003123456')).toBeUndefined();
    expect(extractEid('982003123456', { complete: true })).toBe('982003123456');
  });
});

describe('bestCircularEid', () => {
  it('rotates a ring that started in the middle of the number', () => {
    expect(bestCircularEid('003123456789982')).toBe('982003123456789');
  });

  it('handles a reversed unwrap around the disc', () => {
    const reversed = '982003123456789'.split('').reverse().join('');
    expect(bestCircularEid(reversed)).toBe('982003123456789');
  });

  it('scores a US 840 tag above a random rotation', () => {
    expect(scoreEid('840003219876543')).toBeGreaterThan(scoreEid('321987654384000'));
  });
});

describe('formatEidGroups', () => {
  it('groups like the Allflex disc', () => {
    expect(formatEidGroups('982003123456789')).toBe('982 003 123 456 789');
  });
});

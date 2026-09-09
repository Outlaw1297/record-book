import { describe, expect, it } from 'vitest';
import { uniqueYears, yearFromIsoDate, recordYear } from './year';
import { mergeChoices, rankedLabels } from './choices';

describe('yearFromIsoDate', () => {
  it('reads the calendar year from an ISO date', () => {
    expect(yearFromIsoDate('2024-03-12')).toBe(2024);
    expect(yearFromIsoDate('')).toBeUndefined();
    expect(yearFromIsoDate('March 12')).toBeUndefined();
  });
});

describe('recordYear', () => {
  it('prefers the date, then the existing year, then this year', () => {
    expect(recordYear('2023-01-01', 2026)).toBe(2023);
    expect(recordYear(undefined, 2019)).toBe(2019);
  });
});

describe('uniqueYears', () => {
  it('sorts newest first', () => {
    expect(uniqueYears([2024, 2026, 2024, undefined, 2022])).toEqual([2026, 2024, 2022]);
  });
});

describe('rankedLabels', () => {
  it('puts the most used label first', () => {
    expect(rankedLabels(['West', 'Home', 'West', 'west'])).toEqual(['West', 'Home']);
  });
});

describe('mergeChoices', () => {
  it('keeps ranch values first and skips duplicate commons', () => {
    expect(mergeChoices(['West', 'Home'], ['Home', 'East'])).toEqual(['West', 'Home', 'East']);
  });
});

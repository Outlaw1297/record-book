import { describe, expect, it } from 'vitest';
import { snapshotRowCount } from './snapshot';
import type { HerdSnapshot } from './types';

const empty: HerdSnapshot = {
  format: 'record-book-snapshot',
  version: 1,
  exportedAt: '2026-01-01T00:00:00.000Z',
  animals: [],
  cowCalf: [],
  breeding: [],
  pastures: [],
  pastureAnimals: [],
  sales: [],
  treatments: [],
  settings: { ranchName: 'Home', currentYear: 2026 },
};

describe('snapshotRowCount', () => {
  it('counts every herd table plus settings', () => {
    expect(
      snapshotRowCount({
        ...empty,
        animals: [{ id: 'a' }],
        cowCalf: [{ id: 'c1' }, { id: 'c2' }],
      }),
    ).toBe(4);
  });
});

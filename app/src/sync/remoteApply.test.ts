import { describe, expect, it } from 'vitest';
import { naturalKeyFor, planSnapshotApply } from './remoteApply';

describe('planSnapshotApply', () => {
  const now = '2026-09-04T14:00:00.000Z';

  it('skips animals the phone already has so a second sync is not a table scan', () => {
    const local = Array.from({ length: 200 }, (_, i) => ({
      id: `a${i}`,
      herdId: `H${i}`,
      updatedAt: now,
    }));
    const remote = local.map((row) => ({ ...row }));
    const plan = planSnapshotApply('animals', local, remote, now);
    expect(plan.puts).toHaveLength(0);
    expect(plan.applied).toBe(200);
    expect(plan.conflicts).toBe(0);
  });

  it('writes new animals in one pass', () => {
    const remote = [
      { id: 'n1', herdId: '101', updatedAt: now },
      { id: 'n2', herdId: '102', updatedAt: now },
    ];
    const plan = planSnapshotApply('animals', [], remote, now);
    expect(plan.puts).toHaveLength(2);
    expect(plan.applied).toBe(2);
    expect(plan.puts.map((row) => row.id)).toEqual(['n1', 'n2']);
  });

  it('keeps a newer local animal instead of the ranch copy', () => {
    const plan = planSnapshotApply(
      'animals',
      [{ id: 'local', herdId: '101', updatedAt: '2026-09-04T15:00:00.000Z' }],
      [{ id: 'remote', herdId: '101', updatedAt: '2026-09-04T12:00:00.000Z' }],
      now,
    );
    expect(plan.conflicts).toBe(1);
    expect(plan.puts.some((row) => row.id === 'remote' && !row.deletedAt)).toBe(false);
  });
});

describe('naturalKeyFor', () => {
  it('keys animals by herd id', () => {
    expect(naturalKeyFor('animals', { herdId: ' 101A ' })).toBe('animal:101a');
  });
});

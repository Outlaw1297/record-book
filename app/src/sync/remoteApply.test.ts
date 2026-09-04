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

  it('does not let a duplicate tombstone hide the live winner from the next remote with that key', () => {
    const plan = planSnapshotApply(
      'animals',
      [{ id: 'aaa', herdId: '101', updatedAt: '2026-09-04T12:00:00.000Z' }],
      [
        { id: 'zzz', herdId: '101', updatedAt: '2026-09-04T13:00:00.000Z' },
        { id: 'mmm', herdId: '101', updatedAt: '2026-09-04T14:00:00.000Z' },
      ],
      now,
    );
    const lastById = new Map(plan.puts.map((row) => [row.id, row]));
    expect(lastById.get('mmm')?.deletedAt).toBeUndefined();
    expect(lastById.get('zzz')?.deletedAt).toBeTruthy();
    expect(lastById.get('aaa')?.deletedAt).toBeTruthy();
  });

  it('matches the next page against the live animal, not a leftover tombstone', () => {
    const plan = planSnapshotApply(
      'treatments',
      [
        {
          id: 'live',
          animalHerdId: '101',
          date: '2026-09-01',
          product: 'Draxxin',
          updatedAt: '2026-09-04T13:00:00.000Z',
        },
        {
          id: 'aaa',
          animalHerdId: '101',
          date: '2026-09-01',
          product: 'Draxxin',
          updatedAt: '2026-09-04T13:00:00.000Z',
          deletedAt: '2026-09-04T13:00:00.000Z',
        },
      ],
      [
        {
          id: 'next',
          animalHerdId: '101',
          date: '2026-09-01',
          product: 'Draxxin',
          updatedAt: '2026-09-04T14:00:00.000Z',
        },
      ],
      now,
    );
    const lastById = new Map(plan.puts.map((row) => [row.id, row]));
    expect(lastById.get('next')?.deletedAt).toBeUndefined();
    expect(lastById.get('live')?.deletedAt).toBeTruthy();
  });
});

describe('naturalKeyFor', () => {
  it('keys animals by herd id', () => {
    expect(naturalKeyFor('animals', { herdId: ' 101A ' })).toBe('animal:101a');
  });
});

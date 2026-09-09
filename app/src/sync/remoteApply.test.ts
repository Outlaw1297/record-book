import { describe, expect, it } from 'vitest';
import {
  naturalKeyFor,
  naturalKeyFromRecord,
  planSnapshotMerge,
} from './remoteApply';

describe('naturalKeyFor', () => {
  it('keys animals by herd id', () => {
    expect(naturalKeyFor('animals', { herdId: ' 101A ' })).toBe('animal:101a');
  });
});

describe('naturalKeyFromRecord', () => {
  it('keys animals by herd id, not the record object', () => {
    expect(
      naturalKeyFromRecord('animals', { id: 'a1', herdId: '  42A  ' }),
    ).toBe('animal:42a');
    expect(naturalKeyFromRecord('animals', { id: 'a1', herdId: '  ' })).toBeNull();
  });

  it('keys calving by year, cow, and calf', () => {
    expect(
      naturalKeyFromRecord('cowCalf', {
        year: 2026,
        cowId: 'C1',
        calfId: 'K1',
      }),
    ).toBe('cowCalf:2026|c1|k1');
  });
});

describe('planSnapshotMerge', () => {
  it('queues every remote row when the phone book is empty', () => {
    const remotes = [
      { id: 'a1', herdId: '1', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'a2', herdId: '2', updatedAt: '2026-01-01T00:00:00.000Z' },
    ];
    const planned = planSnapshotMerge('animals', [], remotes);
    expect(planned.puts.map((row) => row.id)).toEqual(['a1', 'a2']);
    expect(planned.applied).toBe(2);
    expect(planned.conflicts).toBe(0);
  });

  it('skips a write when the same id is already saved at the same time', () => {
    const row = { id: 'a1', herdId: '1', updatedAt: '2026-01-01T00:00:00.000Z' };
    const planned = planSnapshotMerge('animals', [row], [row]);
    expect(planned.puts).toEqual([]);
    expect(planned.applied).toBe(1);
  });

  it('keeps a newer local row and does not overwrite it', () => {
    const local = { id: 'a1', herdId: '1', updatedAt: '2026-02-01T00:00:00.000Z' };
    const remote = { id: 'a1', herdId: '1', updatedAt: '2026-01-01T00:00:00.000Z' };
    const planned = planSnapshotMerge('animals', [local], [remote]);
    expect(planned.puts).toEqual([]);
    expect(planned.conflicts).toBe(1);
    expect(planned.applied).toBe(0);
  });

  it('replaces an older same-id local row', () => {
    const local = { id: 'a1', herdId: '1', updatedAt: '2026-01-01T00:00:00.000Z' };
    const remote = {
      id: 'a1',
      herdId: '1',
      name: 'Belle',
      updatedAt: '2026-02-01T00:00:00.000Z',
    };
    const planned = planSnapshotMerge('animals', [local], [remote]);
    expect(planned.puts).toEqual([remote]);
    expect(planned.conflicts).toBe(1);
    expect(planned.applied).toBe(0);
  });

  it('tombstones a natural-key duplicate when the ranch row wins', () => {
    const local = { id: 'phone', herdId: '42', updatedAt: '2026-01-01T00:00:00.000Z' };
    const remote = { id: 'ranch', herdId: '42', updatedAt: '2026-02-01T00:00:00.000Z' };
    const planned = planSnapshotMerge('animals', [local], [remote]);
    const tombstone = planned.puts.find((row) => row.id === 'phone');
    const kept = planned.puts.find((row) => row.id === 'ranch');
    expect(kept).toEqual(remote);
    expect(tombstone?.deletedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(planned.conflicts).toBe(1);
  });

  it('retargets pasture animals when a pasture id changes', () => {
    const local = {
      id: 'old',
      year: 2026,
      pastureName: 'North',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const remote = {
      id: 'new',
      year: 2026,
      pastureName: 'North',
      updatedAt: '2026-02-01T00:00:00.000Z',
    };
    const planned = planSnapshotMerge('pastures', [local], [remote]);
    expect(planned.retargets).toEqual([
      { fromId: 'old', toId: 'new', at: '2026-02-01T00:00:00.000Z' },
    ]);
  });

  it('plans ten thousand animals without scanning the table per row', () => {
    const remotes = Array.from({ length: 10_000 }, (_, index) => ({
      id: `a${index}`,
      herdId: `H${index}`,
      updatedAt: '2026-01-01T00:00:00.000Z',
    }));
    const started = Date.now();
    const planned = planSnapshotMerge('animals', [], remotes);
    expect(planned.puts).toHaveLength(10_000);
    expect(planned.applied).toBe(10_000);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

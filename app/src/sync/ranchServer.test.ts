import { describe, expect, it } from 'vitest';
import { joinRanchApiBase, ranchHttpDetail, ranchRequestInit, ranchUnreachableDetail, chunkList, snapshotChunkLabel, snapshotFingerprint, snapshotPushBodies } from './ranchServer';

describe('joinRanchApiBase', () => {
  it('turns a same-origin /api path into an absolute URL', () => {
    expect(joinRanchApiBase('/api', 'http://192.168.1.10')).toBe(
      'http://192.168.1.10/api',
    );
  });

  it('keeps an absolute ranch API origin', () => {
    expect(joinRanchApiBase('http://nas:8080/', 'http://ignored')).toBe(
      'http://nas:8080',
    );
  });

  it('returns empty when unset', () => {
    expect(joinRanchApiBase('  ', 'http://localhost:5173')).toBe('');
  });

  it('does not leave a trailing slash that would 404 Hono /v1/', () => {
    expect(joinRanchApiBase('http://nas:8180/api/', 'http://ignored')).toBe(
      'http://nas:8180/api',
    );
  });
});

describe('ranchUnreachableDetail', () => {
  const health = 'http://nas:8180/api/health';

  it('turns Failed to fetch into a ranch Wi-Fi check', () => {
    expect(ranchUnreachableDetail(new Error('Failed to fetch'), health)).toContain(
      health,
    );
    expect(ranchUnreachableDetail(new Error('Failed to fetch'), health)).toContain(
      'Stay on ranch Wi-Fi',
    );
  });

  it('keeps a specific HTTP error message', () => {
    expect(ranchUnreachableDetail(new Error('Ranch API 503'), health)).toBe(
      'Ranch API 503',
    );
  });
});

describe('ranchRequestInit', () => {
  it('does not let the phone reuse a cached ranch export', () => {
    expect(ranchRequestInit('GET').cache).toBe('no-store');
    expect(ranchRequestInit('POST', '{}').cache).toBe('no-store');
  });
});

describe('Cow Sense ranch snapshot chunks', () => {
  it('splits a large herd so nginx does not 504 one POST', () => {
    expect(chunkList([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    const animals = Array.from({ length: 1501 }, (_, i) => ({ id: String(i) }));
    const bodies = snapshotPushBodies({
      format: 'record-book-snapshot',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      animals,
      cowCalf: [],
      breeding: [],
      pastures: [],
      pastureAnimals: [],
      sales: [],
      treatments: [],
      settings: { ranchName: 'Flying J', currentYear: 2026 },
    });
    expect(bodies.length).toBeGreaterThan(1);
    expect(bodies[0]?.settings).toEqual({ ranchName: 'Flying J', currentYear: 2026 });
    expect(bodies.slice(1).every((body) => Array.isArray(body.animals))).toBe(true);
  });

  it('keeps a small herd in one POST', () => {
    const bodies = snapshotPushBodies({
      format: 'record-book-snapshot',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      animals: [{ id: '1' }],
      cowCalf: [],
      breeding: [],
      pastures: [],
      pastureAnimals: [],
      sales: [],
      treatments: [],
      settings: { ranchName: 'Flying J', currentYear: 2026 },
    });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.animals).toHaveLength(1);
  });

  it('labels a chunk so the status bar can show animals vs settings', () => {
    expect(snapshotChunkLabel({ settings: { ranchName: 'Flying J' } })).toBe('settings');
    expect(snapshotChunkLabel({ animals: [{ id: '1' }, { id: '2' }] })).toBe(
      'animals · 2 rows',
    );
  });

  it('explains a 504 as a NAS timeout on a large herd write', () => {
    expect(ranchHttpDetail(504)).toMatch(/timed out/i);
    expect(ranchHttpDetail(504)).toMatch(/504/);
  });

  it('fingerprints a herd so a closed tab can skip chunks already copied', () => {
    const snapshot = {
      format: 'record-book-snapshot' as const,
      version: 1 as const,
      exportedAt: '2026-01-01T00:00:00.000Z',
      animals: [{ id: 'a' }, { id: 'b' }],
      cowCalf: [],
      breeding: [],
      pastures: [],
      pastureAnimals: [],
      sales: [],
      treatments: [],
      settings: { ranchName: 'Flying J', currentYear: 2026 },
    };
    const same = snapshotFingerprint(snapshot);
    expect(snapshotFingerprint({ ...snapshot, exportedAt: '2026-09-04T00:00:00.000Z' })).toBe(
      same,
    );
    expect(
      snapshotFingerprint({
        ...snapshot,
        animals: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      }),
    ).not.toBe(same);
  });
});

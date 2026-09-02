import { describe, expect, it } from 'vitest';
import { joinRanchApiBase, ranchHttpDetail, ranchRequestInit, ranchUnreachableDetail, chunkList, snapshotPushBodies } from './ranchServer';

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
    const animals = Array.from({ length: 501 }, (_, i) => ({ id: String(i) }));
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

  it('explains a 504 as a NAS timeout on a large herd write', () => {
    expect(ranchHttpDetail(504)).toMatch(/timed out/i);
    expect(ranchHttpDetail(504)).toMatch(/504/);
  });
});

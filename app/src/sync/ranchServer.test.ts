import { describe, expect, it } from 'vitest';
import { joinRanchApiBase, ranchHttpDetail, ranchRequestInit, ranchUnreachableDetail, chunkList, snapshotChunkLabel, snapshotPushBodies, ranchExportPagePath, asExportMeta, asExportPage, isRanchTimeout, ranchTimeoutDetail, RANCH_EXPORT_PAGE } from './ranchServer';

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

  it('pages ranch export so a phone does not wait on one giant JSON', () => {
    expect(ranchExportPagePath('animals', 2000)).toBe(
      `/v1/export/animals?limit=${RANCH_EXPORT_PAGE}&offset=2000`,
    );
  });

  it('reads export meta counts', () => {
    const meta = asExportMeta({
      format: 'record-book-export-meta',
      counts: { animals: 9802, cowCalf: 12 },
      settings: { ranchName: 'Flying J', currentYear: 2026 },
    });
    expect(meta?.counts.animals).toBe(9802);
    expect(meta?.counts.cowCalf).toBe(12);
    expect(meta?.settings?.ranchName).toBe('Flying J');
    expect(asExportMeta({ format: 'record-book-snapshot' })).toBeNull();
  });

  it('rejects a damaged export page instead of treating it as the last page', () => {
    expect(asExportPage(null)).toBeNull();
    expect(asExportPage('not-json')).toBeNull();
    expect(asExportPage({ total: 9802 })).toBeNull();
    expect(asExportPage({ total: 9802, rows: [{ id: 'a1' }] })).toEqual({
      total: 9802,
      rows: [{ id: 'a1' }],
    });
    expect(asExportPage({ rows: [] })).toEqual({ rows: [] });
  });

  it('turns an aborted ranch GET into a wait-and-retry message', () => {
    expect(isRanchTimeout({ name: 'AbortError', message: 'The user aborted a request.' })).toBe(
      true,
    );
    expect(ranchTimeoutDetail()).toMatch(/large herd/i);
  });
});

import { describe, expect, it } from 'vitest';
import { joinRanchApiBase, ranchUnreachableDetail } from './ranchServer';

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
    expect(joinRanchApiBase('http://192.168.1.56:8180/api/', 'http://ignored')).toBe(
      'http://192.168.1.56:8180/api',
    );
  });
});

describe('ranchUnreachableDetail', () => {
  const health = 'http://192.168.1.56:8180/api/health';

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

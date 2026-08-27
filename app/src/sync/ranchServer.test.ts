import { describe, expect, it } from 'vitest';
import { joinRanchApiBase } from './ranchServer';

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
});

import { describe, expect, it } from 'vitest';
import { isDnsFailure, isHttpUrl, isNetworkFailure } from './appFetch';

describe('appFetch helpers', () => {
  it('detects cleartext ranch URLs', () => {
    expect(isHttpUrl('http://herdledger.flyingjranch.me/api/v1/export')).toBe(true);
    expect(isHttpUrl('https://api.dropboxapi.com/2/users/get_current_account')).toBe(false);
  });

  it('detects Android native DNS failures', () => {
    expect(
      isDnsFailure(
        new Error(
          'Unable to resolve host "api.dropboxapi.com": No address associated with hostname',
        ),
      ),
    ).toBe(true);
    expect(isNetworkFailure(new Error('Failed to fetch'))).toBe(true);
    expect(isNetworkFailure(new Error('Ranch API 503'))).toBe(false);
  });
});

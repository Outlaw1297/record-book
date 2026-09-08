import { describe, expect, it } from 'vitest';
import {
  httpsTwinUrl,
  isAbortFailure,
  isDnsFailure,
  isHttpUrl,
  isLanHttpUrl,
  isNetworkFailure,
} from './appFetch';

describe('appFetch helpers', () => {
  it('detects cleartext ranch URLs', () => {
    expect(isHttpUrl('http://herdledger.flyingjranch.me/api/v1/export')).toBe(true);
    expect(isHttpUrl('https://api.dropboxapi.com/2/users/get_current_account')).toBe(false);
  });

  it('upgrades a public http ranch URL to https so the APK is not mixed content', () => {
    expect(httpsTwinUrl('http://herdledger.flyingjranch.me/api/v1/export')).toBe(
      'https://herdledger.flyingjranch.me/api/v1/export',
    );
    expect(httpsTwinUrl('http://192.168.1.10:8180/api/health')).toBeUndefined();
    expect(isLanHttpUrl('http://nas:8180/api/health')).toBe(true);
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

  it('treats a hung Chromium abort as a network miss so sync can fail instead of spin', () => {
    const abort = new Error('The user aborted a request.');
    abort.name = 'AbortError';
    expect(isAbortFailure(abort)).toBe(true);
    expect(isNetworkFailure(abort)).toBe(true);
  });
});

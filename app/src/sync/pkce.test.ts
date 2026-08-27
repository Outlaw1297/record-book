import { describe, expect, it } from 'vitest';
import { NATIVE_OAUTH_CALLBACK } from './pkce';

describe('oauth redirect URI', () => {
  it('uses a loopback URI on the APK so Custom Tabs can return the code', () => {
    expect(NATIVE_OAUTH_CALLBACK).toBe('http://127.0.0.1:18763/oauth/callback');
  });
});

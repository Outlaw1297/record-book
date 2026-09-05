import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'me.flyingjranch.recordbook',
  appName: 'HerdLedger',
  webDir: 'dist',
  backgroundColor: '#F5F0E6',
  android: {
    allowMixedContent: true,
    backgroundColor: '#F5F0E6',
  },
  plugins: {
    // Do not patch window.fetch. Native OkHttp cannot resolve hosts on some
    // phones while Chrome can (Dropbox/Google "Unable to resolve host").
    // Chromium fetch matches the phone browser. Explicit CapacitorHttp.request
    // stays available as a fallback for http:// ranch URLs only.
    CapacitorHttp: {
      enabled: false,
    },
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
    },
  },
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
};

export default config;

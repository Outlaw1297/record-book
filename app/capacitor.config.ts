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
    CapacitorHttp: {
      enabled: true,
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

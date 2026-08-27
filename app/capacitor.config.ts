import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'me.flyingjranch.recordbook',
  appName: 'Record Book',
  webDir: 'dist',
  backgroundColor: '#f4eee6',
  android: {
    allowMixedContent: true,
    backgroundColor: '#f4eee6',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
};

export default config;

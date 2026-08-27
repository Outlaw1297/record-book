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
    allowNavigation: [
      '192.168.1.56',
      'accounts.google.com',
      '*.google.com',
      '*.googleusercontent.com',
      'www.dropbox.com',
      '*.dropbox.com',
      '*.dropboxapi.com',
    ],
  },
};

export default config;

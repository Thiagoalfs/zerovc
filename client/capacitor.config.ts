import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'xyz.safiroko.zerovc',
  appName: 'ZeroVC',
  webDir: 'dist',
  server: {
    url: 'https://zerovc.safiroko.xyz',
    cleartext: true,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;

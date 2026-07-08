import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.techinnovate.ev',
  appName: 'TechInnovate Mobility',
  webDir: 'dist',
  android: {
    buildOptions: {
      releaseType: 'AAB',
    },
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;

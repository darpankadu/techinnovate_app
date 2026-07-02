import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.techinnovate.mobility.cng',
  appName: 'TechInnovate Mobility',
  webDir: 'dist',
  android: {
    buildOptions: {
      releaseType: 'AAB',
    },
  },
  server: {
    androidScheme: 'https',
    url: 'https://cng-fleet-tracker-frontned.vercel.app',
    cleartext: true
  },
};

export default config;

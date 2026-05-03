import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.coldscout.app',
  appName: 'Cold Scout: Smart Outreach',
  webDir: 'dist',
  server: {
    allowNavigation: [
      'checkout.razorpay.com',
      'api.razorpay.com',
      'razorpay.com',
    ]
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    CapacitorCookies: {
      enabled: true,
    },
  },
};

export default config;

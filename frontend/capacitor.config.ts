import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.coldscout.app',
  appName: 'Cold Scout',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    allowNavigation: [
      'checkout.razorpay.com',
      'api.razorpay.com',
      'razorpay.com',
      '*'
    ]
  }
};

export default config;

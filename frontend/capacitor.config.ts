import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.coldscout.app',
  appName: 'Cold Scout',
  webDir: 'dist',
  server: {
    allowNavigation: [
      'checkout.razorpay.com',
      'api.razorpay.com',
      'razorpay.com',
      '*'
    ]
  },
  plugins: {
    CapacitorHttp: {
      // Route all HTTP requests through the native layer (OkHttp on Android,
      // URLSession on iOS) so they bypass WebView CORS restrictions entirely.
      // Without this, the WebView sends Origin: http://localhost which the
      // backend CORS middleware rejects.
      enabled: true,
    },
  },
};

export default config;

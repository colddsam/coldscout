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
    // Foreground delivery: without ``alert`` the @capacitor/push-notifications
    // plugin only fires the JS event and does NOT post a system-tray
    // notification while the app is open. Users would silently miss any
    // push that arrived while they were inside the app. Including
    // ``badge`` and ``sound`` matches the backgrounded experience.
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;

/**
 * Push notification helper.
 *
 * Wraps three platform paths behind one tiny API:
 *
 *   1. **Browser / installed PWA** — registers ``/sw.js``, asks the user for
 *      permission, subscribes through ``PushManager`` with the server's VAPID
 *      key, and POSTs the subscription to ``/api/v1/notifications/subscribe``.
 *   2. **Capacitor Android** — uses ``@capacitor/push-notifications`` to fetch
 *      an FCM token and registers it as ``platform: "android"``.
 *   3. **iOS PWA (16.4+)** — same as the browser path, but only after the user
 *      has installed the app via "Add to Home Screen". We surface a tip in the
 *      Settings UI when ``Notification`` is undefined or permission is denied.
 *
 * Every call here is best-effort: a missing capability (no SW, no VAPID key,
 * permission denied, FCM not configured) just resolves with ``status: "unsupported"``
 * or ``"denied"`` so the caller can show the right UI without try/catch.
 */
import { Capacitor } from '@capacitor/core';
import {
  PushNotifications,
  type Token,
} from '@capacitor/push-notifications';
import {
  getNotificationsConfig,
  subscribePush,
  unsubscribePushByEndpoint,
  type NotificationsConfig,
  type PushSubscriptionRead,
} from './api';

export type PushStatus =
  | 'subscribed'
  | 'denied'
  | 'unsupported'
  | 'not-configured'
  | 'error';

export interface PushResult {
  status: PushStatus;
  message?: string;
  endpoint?: string;
  subscription?: PushSubscriptionRead;
}

const SW_PATH = '/sw.js';

let cachedConfig: NotificationsConfig | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;

/** Detect Capacitor's Android shell (``@capacitor/push-notifications`` only fires there). */
export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/** Web Push capability check that's safe inside the Capacitor WebView too. */
export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

/**
 * Returns the current OS-level permission for browser notifications.
 *
 * Capacitor reports ``"granted"`` immediately because the native shell handles
 * its own permission prompt — we never gate the bell-icon UI on that.
 */
export function currentPermission(): NotificationPermission | 'unsupported' {
  if (isNativeAndroid()) return 'granted';
  if (!isWebPushSupported()) return 'unsupported';
  return Notification.permission;
}

async function getConfig(): Promise<NotificationsConfig> {
  if (cachedConfig) return cachedConfig;
  cachedConfig = await getNotificationsConfig();
  return cachedConfig;
}

/** Register the SPA's Service Worker. Called once on app boot for PWA users. */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (isNativeAndroid()) return null; // SW path is irrelevant in the native shell.
  if (!('serviceWorker' in navigator)) return null;
  if (swRegistration) return swRegistration;
  try {
    swRegistration = await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
    // Push a fresh VAPID key into the SW so it can self-resubscribe on
    // ``pushsubscriptionchange`` without the SPA being open.
    try {
      const cfg = await getConfig();
      if (cfg.vapid_public_key) {
        const target =
          swRegistration.active || swRegistration.installing || swRegistration.waiting;
        target?.postMessage({ type: 'cs-set-vapid', key: cfg.vapid_public_key });
      }
    } catch {
      // Non-fatal — config fetch can fail for unauthenticated boots.
    }
    return swRegistration;
  } catch (e) {
    console.warn('[push] ServiceWorker registration failed:', e);
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Request permission and subscribe the current device to push.
 *
 * Idempotent: re-calling on an already-subscribed device upserts the row.
 */
export async function enablePush(label?: string): Promise<PushResult> {
  if (isNativeAndroid()) return enableNativeAndroid(label);
  if (!isWebPushSupported()) {
    return {
      status: 'unsupported',
      message:
        'This browser does not support Web Push. On iOS, install Cold Scout to your Home Screen first.',
    };
  }

  const cfg = await getConfig();
  if (!cfg.web_push_enabled || !cfg.vapid_public_key) {
    return {
      status: 'not-configured',
      message: 'Web Push is not configured on the server.',
    };
  }

  const reg = await ensureServiceWorker();
  if (!reg) {
    return {
      status: 'unsupported',
      message: 'Service Worker registration failed — push cannot be enabled.',
    };
  }

  let perm = Notification.permission;
  if (perm === 'default') {
    perm = await Notification.requestPermission();
  }
  if (perm !== 'granted') {
    return {
      status: 'denied',
      message:
        'Notification permission was denied. Enable it in your browser settings to receive live updates.',
    };
  }

  let subscription: PushSubscription | null = null;
  try {
    subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      // Cast to BufferSource — TS5 narrows to ArrayBuffer-only here, but the
      // underlying browser API accepts any ArrayBufferLike.
      const appServerKey = urlBase64ToUint8Array(cfg.vapid_public_key) as unknown as BufferSource;
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });
    }
  } catch (e) {
    return {
      status: 'error',
      message: `Failed to create push subscription: ${(e as Error).message}`,
    };
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return {
      status: 'error',
      message: 'Push subscription returned without keys.',
    };
  }

  try {
    const persisted = await subscribePush({
      platform: 'web',
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      user_agent: navigator.userAgent || undefined,
      label,
    });
    return { status: 'subscribed', endpoint: json.endpoint, subscription: persisted };
  } catch (e) {
    return {
      status: 'error',
      message: `Backend rejected the subscription: ${(e as Error).message}`,
    };
  }
}

/** Unsubscribe this device from push and tell the backend to drop the row. */
export async function disablePush(): Promise<PushResult> {
  if (isNativeAndroid()) {
    try {
      await PushNotifications.removeAllListeners();
      await PushNotifications.unregister();
      return { status: 'unsupported', message: 'Native push disabled on this device.' };
    } catch (e) {
      return { status: 'error', message: (e as Error).message };
    }
  }
  if (!isWebPushSupported()) {
    return { status: 'unsupported' };
  }
  const reg = await ensureServiceWorker();
  if (!reg) return { status: 'unsupported' };
  try {
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      try {
        await unsubscribePushByEndpoint(endpoint);
      } catch {
        // best-effort
      }
      return { status: 'unsupported', endpoint };
    }
    return { status: 'unsupported' };
  } catch (e) {
    return { status: 'error', message: (e as Error).message };
  }
}

// ── Native (Capacitor / Android) path ─────────────────────────────────────────

/**
 * Friendly explanation for the most common native FCM errors so the user
 * doesn't see a raw "FIS_AUTH_ERROR" toast and assume the app is broken.
 *
 * FIS_AUTH_ERROR: Firebase Installations Service rejected the device. Almost
 * always means the API key in google-services.json has Android-app
 * restrictions in GCP Console that exclude this build's signing certificate,
 * or the Firebase Installations / Cloud Messaging APIs are disabled for the
 * project. Once the project-side config is corrected, retry succeeds.
 */
function humanizeFcmError(raw: string | undefined | null): string {
  const msg = (raw || '').trim();
  if (!msg) return 'FCM registration error';
  if (/FIS_AUTH_ERROR/i.test(msg)) {
    return (
      'Firebase rejected this device (FIS_AUTH_ERROR). Check that the Firebase ' +
      'Installations API and Cloud Messaging API are enabled, and that the ' +
      'API key has no Android-app restriction excluding this APK.'
    );
  }
  if (/SERVICE_NOT_AVAILABLE/i.test(msg)) {
    return 'FCM service unavailable. Check Google Play Services and your network, then retry.';
  }
  if (/AUTHENTICATION_FAILED/i.test(msg)) {
    return 'FCM authentication failed. The bundled google-services.json may not match the Firebase project.';
  }
  if (/MISSING_INSTANCEID_SERVICE/i.test(msg)) {
    return 'Firebase init missing in this build (google-services plugin did not run).';
  }
  return msg;
}

async function enableNativeAndroid(label?: string): Promise<PushResult> {
  const cfg = await getConfig();
  if (!cfg.fcm_enabled) {
    return {
      status: 'not-configured',
      message: 'FCM is not configured on the server.',
    };
  }

  try {
    const perm = await PushNotifications.checkPermissions();
    let granted = perm.receive === 'granted';
    if (!granted) {
      const req = await PushNotifications.requestPermissions();
      granted = req.receive === 'granted';
    }
    if (!granted) {
      return {
        status: 'denied',
        message: 'Push permission denied. Enable it in Android system settings.',
      };
    }
  } catch (e) {
    return { status: 'error', message: (e as Error).message };
  }

  // Detach the registration listeners from any previous attempt before
  // wiring fresh ones — without this, a second tap on "Enable" would stack
  // a new `registration` handler on top of the old one and the cached
  // `registrationError` from attempt #1 would re-fire forever as
  // "FCM registration failed". We deliberately do NOT call
  // ``removeAllListeners()`` because that would also wipe the foreground
  // ``pushNotificationReceived`` / ``pushNotificationActionPerformed``
  // hooks the live-notification bridge installs at app boot.
  await detachAndroidRegistrationListeners();
  // Drop any stale token Firebase cached from the failed attempt so the
  // next register() request walks the full token-fetch path again.
  try {
    await PushNotifications.unregister();
  } catch {
    // best-effort — unregister throws if there's nothing to remove.
  }

  // Wait for the FCM token via the ``registration`` event.
  return new Promise<PushResult>((resolve) => {
    let settled = false;
    const finish = (res: PushResult) => {
      if (settled) return;
      settled = true;
      // Detach the per-attempt listeners so the next tap starts clean.
      detachAndroidRegistrationListeners();
      resolve(res);
    };

    PushNotifications.addListener('registrationError', (err) => {
      finish({ status: 'error', message: humanizeFcmError(err?.error) });
    })
      .then((h) => androidRegistrationHandles.push(h))
      .catch((e) => finish({ status: 'error', message: (e as Error).message }));

    PushNotifications.addListener('registration', async (token: Token) => {
      try {
        const persisted = await subscribePush({
          platform: 'android',
          endpoint: token.value,
          user_agent: navigator.userAgent || undefined,
          label,
        });
        finish({ status: 'subscribed', endpoint: token.value, subscription: persisted });
      } catch (e) {
        finish({
          status: 'error',
          message: `Backend rejected the FCM token: ${(e as Error).message}`,
        });
      }
    })
      .then((h) => androidRegistrationHandles.push(h))
      .catch((e) => finish({ status: 'error', message: (e as Error).message }));

    PushNotifications.register().catch((e) =>
      finish({ status: 'error', message: (e as Error).message }),
    );

    // Safety timeout — Firebase token fetches can take a moment over slow
    // networks; 20 s gives FIS / FCM enough room without leaving the user
    // staring at a frozen button.
    setTimeout(
      () => finish({ status: 'error', message: 'FCM registration timed out' }),
      20_000,
    );
  });
}

// Module-scoped handles for the `registration` / `registrationError`
// listeners attached by enableNativeAndroid. Persisted here so a retry can
// remove just these without affecting the live-bridge listeners.
const androidRegistrationHandles: Array<{ remove: () => Promise<void> }> = [];

async function detachAndroidRegistrationListeners(): Promise<void> {
  while (androidRegistrationHandles.length) {
    const h = androidRegistrationHandles.pop();
    try {
      await h?.remove();
    } catch {
      // best-effort
    }
  }
}

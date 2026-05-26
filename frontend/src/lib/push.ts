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

let registrationInProgress = false;

const SW_PATH = '/sw.js';
// Stores the most recently registered push endpoint for THIS device. The
// backend scopes the unsubscribe by (user_id, endpoint), so on logout we
// need this to tell the server "drop my row for this device" while the
// JWT is still valid. Persisted in localStorage so it survives reloads
// and is shared across tabs of the same browser.
const ACTIVE_ENDPOINT_KEY = 'cs_push_active_endpoint';

let cachedConfig: NotificationsConfig | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;

function readActivePushEndpoint(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACTIVE_ENDPOINT_KEY);
  } catch {
    return null;
  }
}

export function getActivePushEndpoint(): string | null {
  return readActivePushEndpoint();
}

export function rememberActivePushEndpoint(endpoint: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACTIVE_ENDPOINT_KEY, endpoint);
  } catch {
    // localStorage quota / private mode — non-fatal.
  }
}

function forgetActivePushEndpoint(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ACTIVE_ENDPOINT_KEY);
  } catch {
    // best-effort
  }
}

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
    rememberActivePushEndpoint(json.endpoint);
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
      // Detach ONLY the per-enable-attempt registration listeners, not the
      // live-notification bridge listeners installed at app boot. Calling
      // ``removeAllListeners()`` here would wipe the foreground bridge
      // (``pushNotificationReceived`` / ``pushNotificationActionPerformed``
      // / ``registration``) and re-enabling without a hard reload would
      // leave the user receiving zero notifications until next launch.
      await detachAndroidRegistrationListeners();

      const endpoint = readActivePushEndpoint();
      if (endpoint) {
        try {
          await unsubscribePushByEndpoint(endpoint);
        } catch (e) {
          console.warn('[push] Failed to delete FCM token from backend:', e);
        }
      }

      await PushNotifications.unregister();
      forgetActivePushEndpoint();
      return { status: 'unsupported', message: 'Native push disabled on this device.' };
    } catch (e) {
      return { status: 'error', message: (e as Error).message };
    }
  }
  if (!isWebPushSupported()) {
    forgetActivePushEndpoint();
    return { status: 'unsupported' };
  }
  const reg = await ensureServiceWorker();
  if (!reg) {
    forgetActivePushEndpoint();
    return { status: 'unsupported' };
  }
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
      forgetActivePushEndpoint();
      return { status: 'unsupported', endpoint };
    }
    forgetActivePushEndpoint();
    return { status: 'unsupported' };
  } catch (e) {
    return { status: 'error', message: (e as Error).message };
  }
}

/**
 * Best-effort detach of THIS device's push subscription from the currently
 * authenticated user. Called immediately before ``supabase.auth.signOut()``
 * during logout so the previous user's row in ``push_subscriptions`` is
 * cleared while the JWT is still valid. We deliberately do NOT invalidate
 * the OS-level push permission or the FCM token: a teammate logging in on
 * the same device should be able to reuse the existing token (the backend
 * transfers ownership on subscribe). All errors are swallowed because
 * logout must succeed even if the network is offline.
 */
export async function detachActivePushFromCurrentUser(): Promise<void> {
  const endpoint = readActivePushEndpoint();
  if (!endpoint) return;
  try {
    await unsubscribePushByEndpoint(endpoint);
  } catch {
    // best-effort — backend transfer-on-subscribe will heal stale rows
    // the next time someone enables on this device.
  } finally {
    forgetActivePushEndpoint();
  }
}

/**
 * Silently re-bind THIS device to the *currently authenticated* user without
 * prompting for permission. Used right after a login flow: if the OS already
 * granted push permission (typically because a teammate previously enabled
 * it on this device), we want the device to start receiving the new user's
 * notifications immediately — no manual "Enable" tap from Settings.
 *
 * Idempotent and safe to call from anywhere: it never prompts, never throws,
 * and is a no-op when permission is missing or transport is unconfigured.
 */
export async function silentRebindPushToCurrentUser(): Promise<PushResult> {
  if (isNativeAndroid()) {
    try {
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive !== 'granted') {
        return { status: 'denied' };
      }
      const cfg = await getConfig();
      if (!cfg.fcm_enabled) {
        return { status: 'not-configured' };
      }
      // PushNotifications.register() is idempotent — when a token is already
      // cached the SDK fires the ``registration`` event with the existing
      // value. The persistent listener installed by ``useLiveNotificationBridge``
      // posts that token to ``/notifications/subscribe`` under the freshly
      // signed-in user, and the backend's transfer-on-subscribe drops any
      // prior owner of the same endpoint. No need to wire a one-shot
      // listener here.
      await PushNotifications.register();
      return { status: 'subscribed' };
    } catch (e) {
      return { status: 'error', message: (e as Error).message };
    }
  }
  if (!isWebPushSupported()) {
    return { status: 'unsupported' };
  }
  if (Notification.permission !== 'granted') {
    return { status: 'denied' };
  }
  const cfg = await getConfig();
  if (!cfg.web_push_enabled || !cfg.vapid_public_key) {
    return { status: 'not-configured' };
  }
  const reg = await ensureServiceWorker();
  if (!reg) return { status: 'unsupported' };
  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      // Permission is granted but the browser hasn't issued a subscription
      // yet (e.g. first launch after a SW reset). Create one quietly — the
      // user is already opted in at the OS level so this does not surface
      // any new permission prompt.
      const appServerKey = urlBase64ToUint8Array(cfg.vapid_public_key) as unknown as BufferSource;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });
    }
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { status: 'error', message: 'Push subscription returned without keys.' };
    }
    const persisted = await subscribePush({
      platform: 'web',
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      user_agent: navigator.userAgent || undefined,
    });
    rememberActivePushEndpoint(json.endpoint);
    return { status: 'subscribed', endpoint: json.endpoint, subscription: persisted };
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
function humanizeFcmError(raw: unknown): string {
  let msg = '';
  if (typeof raw === 'string') {
    msg = raw.trim();
  } else if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    msg = String(r.message || r.error || '').trim();
  } else {
    msg = String(raw || '').trim();
  }

  if (!msg || msg === '[object Object]') return 'FCM registration error';
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

  if (registrationInProgress) {
    return {
      status: 'error',
      message: 'A registration request is already active. Please wait a moment.',
    };
  }

  registrationInProgress = true;

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
  // NOTE: we deliberately do NOT call PushNotifications.unregister() here.
  // unregister() invokes FirebaseMessaging.deleteToken(), which forces the
  // next register() to make a full FIS round-trip for a fresh install ID.
  // Tapping Enable a few times in a row rapidly burns the per-device FIS
  // quota and the SDK then returns SERVICE_NOT_AVAILABLE for ~30-60 min.
  // getToken() is already idempotent — it returns the cached token when one
  // exists and only hits the network on first use or after rotation, so the
  // delete-then-refetch dance only added churn without a real benefit.

  // Wait for the FCM token via the ``registration`` event.
  return new Promise<PushResult>((resolve) => {
    let settled = false;
    const finish = (res: PushResult) => {
      if (settled) return;
      settled = true;
      registrationInProgress = false;
      // Detach the per-attempt listeners so the next tap starts clean.
      detachAndroidRegistrationListeners();
      resolve(res);
    };

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[push] FCM Registration Error:', err);
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
        rememberActivePushEndpoint(token.value);
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

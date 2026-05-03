/* eslint-disable no-restricted-globals */
/**
 * Cold Scout Service Worker.
 *
 * Two responsibilities:
 *
 * 1. **Web Push** — receive push events from the server and show OS-level
 *    notifications. Works on every modern browser plus iOS 16.4+ when the
 *    app has been installed via "Add to Home Screen". Notifications fire
 *    even when the SPA is closed because the browser keeps the SW alive.
 *
 * 2. **Notification click handling** — open / focus the SPA at the URL
 *    embedded in the push payload (e.g. ``/pipeline``) so the user lands
 *    on the right page when tapping the notification.
 *
 * No offline cache here on purpose: caching the SPA shell is a separate
 * concern and would tangle this file's blast-radius. Push is what we need
 * the SW for today.
 */

const SW_VERSION = "v1.0.0";
const DEFAULT_ICON = "/web-app-manifest-192x192.png";
const DEFAULT_BADGE = "/favicon-96x96.png";

self.addEventListener("install", (event) => {
  // Take control on the next activation cycle so a fresh SW is wired up
  // immediately when the user opens a new tab.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Best-effort JSON parse. Some push services strip the body when payload
 * encryption fails; we still surface a "Cold Scout" tap so the user knows
 * something happened.
 */
function parsePayload(event) {
  if (!event.data) return null;
  try {
    return event.data.json();
  } catch (_) {
    try {
      return { title: "Cold Scout", body: event.data.text() };
    } catch (__) {
      return null;
    }
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePayload(event) || {
    title: "Cold Scout",
    body: "You have a new notification.",
  };
  const title = payload.title || "Cold Scout";
  const tag = payload.group_key || `cs:${payload.id || Date.now()}`;
  const url = payload.url || "/";

  const options = {
    body: payload.body || "",
    icon: payload.icon || DEFAULT_ICON,
    badge: DEFAULT_BADGE,
    tag,                   // replaces existing notification with the same tag
    renotify: true,        // re-vibrate / re-alert on replacement
    requireInteraction: false,
    silent: false,
    data: {
      url,
      kind: payload.kind || "system",
      id: payload.id || null,
      payload: payload.payload || null,
      ts: payload.ts || new Date().toISOString(),
      version: SW_VERSION,
    },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // Tell every open tab about the push so the in-app feed can update
      // immediately without waiting for the next poll cycle.
      broadcastToClients({ type: "cs-push", payload }),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(focusOrOpen(target));
});

/**
 * The browser sometimes invalidates and re-issues a push subscription
 * (key rotation, server reset). When that happens we re-subscribe with the
 * same VAPID public key the SPA used originally and tell the backend so it
 * can drop the dead row.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(handleSubscriptionChange(event));
});

self.addEventListener("message", (event) => {
  // Allow the SPA to push a fresh VAPID key into the SW for re-subscription
  // races during ``pushsubscriptionchange``. Stored in IndexedDB-style memory
  // (ephemeral — survives only for the SW lifetime).
  if (event.data && event.data.type === "cs-set-vapid") {
    self.coldscoutVapidKey = event.data.key || null;
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────

async function focusOrOpen(url) {
  const allClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  // If a tab is already open, focus it and navigate.
  for (const client of allClients) {
    if ("focus" in client) {
      try {
        await client.focus();
        if ("navigate" in client) {
          await client.navigate(url);
        }
        return client;
      } catch (_) {
        // continue to next client
      }
    }
  }
  if (self.clients.openWindow) {
    return self.clients.openWindow(url);
  }
  return null;
}

async function broadcastToClients(message) {
  const allClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of allClients) {
    try {
      client.postMessage(message);
    } catch (_) {
      // ignore — the client may have just been torn down
    }
  }
}

async function handleSubscriptionChange(event) {
  const oldEndpoint = event.oldSubscription && event.oldSubscription.endpoint;
  const vapidKey = self.coldscoutVapidKey;
  if (!vapidKey) return; // nothing to do — SPA hasn't registered yet
  try {
    const newSub = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    await broadcastToClients({
      type: "cs-resubscribe",
      oldEndpoint,
      newSubscription: newSub.toJSON(),
    });
  } catch (e) {
    // If we can't resubscribe we still surface the loss to the SPA so it
    // can prompt the user.
    await broadcastToClients({
      type: "cs-subscription-lost",
      oldEndpoint,
      error: String(e && e.message ? e.message : e),
    });
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

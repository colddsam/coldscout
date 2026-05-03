/**
 * Live notification hooks.
 *
 * The bell-icon UI reads from a single React Query entry under
 * ``['notifications', scope]`` so the unread count and the dropdown list
 * stay coherent. Updates arrive via three independent mechanisms — they all
 * funnel into the same ``invalidateQueries`` so we never have to merge them
 * by hand:
 *
 *   1. **Polling** — every 30 s as a baseline so the count is correct even
 *      when the SW is asleep / the network was offline.
 *   2. **Service Worker push** — the SW posts ``{ type: "cs-push" }`` to all
 *      open clients on every ``push`` event; we react instantly.
 *   3. **Capacitor Android** — ``pushNotificationReceived`` events fire while
 *      the app is foregrounded; same invalidation path.
 *
 * The query key is namespaced through ``useUserScope`` so user A's feed cannot
 * leak into user B's session on a shared device.
 */
import { useEffect, useRef } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

import {
  clearAllNotifications,
  deleteNotification,
  getNotifications,
  listPushSubscriptions,
  markAllNotificationsRead,
  markNotificationRead,
  sendTestNotification,
  type NotificationFeed,
  type NotificationItem,
} from '../lib/api';
import { useUserScope } from './useUserScope';
import { useAuth } from './useAuth';

const FEED_KEY = 'notifications';
const POLL_MS = 30_000;

export function useNotificationsFeed(opts?: { limit?: number }) {
  const scope = useUserScope();
  return useQuery<NotificationFeed>({
    queryKey: [FEED_KEY, scope, opts?.limit ?? 30],
    queryFn: () => getNotifications({ limit: opts?.limit ?? 30 }),
    enabled: scope !== 'anon',
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
}

export function usePushSubscriptions() {
  const scope = useUserScope();
  return useQuery({
    queryKey: ['push-subscriptions', scope],
    queryFn: listPushSubscriptions,
    enabled: scope !== 'anon',
    staleTime: 60_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  const scope = useUserScope();
  return useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEED_KEY, scope] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  const scope = useUserScope();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEED_KEY, scope] }),
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  const scope = useUserScope();
  return useMutation({
    mutationFn: (id: number) => deleteNotification(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEED_KEY, scope] }),
  });
}

export function useClearAllNotifications() {
  const qc = useQueryClient();
  const scope = useUserScope();
  return useMutation({
    mutationFn: () => clearAllNotifications(),
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEED_KEY, scope] }),
  });
}

export function useSendTestNotification() {
  const qc = useQueryClient();
  const scope = useUserScope();
  return useMutation({
    mutationFn: (payload?: { title?: string; body?: string }) => sendTestNotification(payload),
    onSuccess: () => {
      toast.success('Test notification sent');
      qc.invalidateQueries({ queryKey: [FEED_KEY, scope] });
    },
    onError: (e: Error) => toast.error(`Test failed: ${e.message}`),
  });
}

/**
 * Bridges Service Worker / Capacitor push events into React Query + toast.
 *
 * Mount once near the app root (Shell). It is signed-in safe — no listeners
 * are wired until ``user`` is present, and they tear down on unmount.
 */
export function useLiveNotificationBridge() {
  const qc = useQueryClient();
  const scope = useUserScope();
  const { user } = useAuth();
  // Guard against double-firing toasts when the SW posts to multiple tabs.
  const lastShownIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) return;

    const showToast = (item: Partial<NotificationItem> | null | undefined) => {
      if (!item) return;
      const id = (item.id as number | undefined) ?? null;
      if (id !== null && lastShownIdRef.current === id) return;
      lastShownIdRef.current = id ?? lastShownIdRef.current;
      const title = item.title || 'Cold Scout';
      const body = item.body || '';
      toast(`${title}${body ? ` — ${body}` : ''}`, { duration: 4500 });
    };

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: [FEED_KEY, scope] });
    };

    // ── Service Worker bridge (web / installed PWA) ────────────────────────
    let onSwMessage: ((e: MessageEvent) => void) | null = null;
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      onSwMessage = (event: MessageEvent) => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'cs-push') {
          invalidate();
          showToast(data.payload || {});
        } else if (data.type === 'cs-resubscribe') {
          // SW re-acquired a subscription mid-session; re-list devices.
          qc.invalidateQueries({ queryKey: ['push-subscriptions', scope] });
        } else if (data.type === 'cs-subscription-lost') {
          qc.invalidateQueries({ queryKey: ['push-subscriptions', scope] });
        }
      };
      navigator.serviceWorker.addEventListener('message', onSwMessage);
    }

    // ── Capacitor Android bridge ───────────────────────────────────────────
    const capacitorListeners: Array<{ remove: () => Promise<void> }> = [];
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      // Foreground push: surface a toast and refresh the feed.
      PushNotifications.addListener('pushNotificationReceived', (n) => {
        invalidate();
        const data = n.data as Record<string, string> | undefined;
        let parsed: Partial<NotificationItem> = {};
        try {
          parsed = data?.payload ? JSON.parse(data.payload) : {};
        } catch {
          parsed = {};
        }
        showToast({
          title: parsed.title || n.title || 'Cold Scout',
          body: parsed.body || n.body || undefined,
          id: parsed.id,
        });
      })
        .then((handle) => capacitorListeners.push(handle))
        .catch(() => undefined);

      // Tap on a system notification — navigate to the embedded URL.
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        invalidate();
        const data = action.notification.data as Record<string, string> | undefined;
        const url = data?.url;
        if (url && typeof window !== 'undefined') {
          // Use hash-safe path navigation through window.location so we don't
          // need router context here.
          window.location.assign(url);
        }
      })
        .then((handle) => capacitorListeners.push(handle))
        .catch(() => undefined);
    }

    // Refresh once on mount so the badge is correct after a cold load.
    invalidate();

    return () => {
      if (onSwMessage && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onSwMessage);
      }
      capacitorListeners.forEach((h) => {
        h.remove().catch(() => undefined);
      });
    };
  }, [qc, scope, user]);
}

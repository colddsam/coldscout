/**
 * Settings panel for managing push notification devices.
 *
 * Lets the freelancer:
 *   - Enable / disable push on the current device (web or Capacitor Android).
 *   - See every device they've ever subscribed and revoke any of them.
 *   - Send a test notification to confirm the wiring is healthy.
 */
import { useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, Send, Smartphone, Trash2, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import {
  usePushSubscriptions,
  useSendTestNotification,
} from '../../hooks/useNotifications';
import { useQueryClient } from '@tanstack/react-query';
import { useUserScope } from '../../hooks/useUserScope';
import {
  currentPermission,
  disablePush,
  enablePush,
  getActivePushEndpoint,
  isNativeAndroid,
  isWebPushSupported,
} from '../../lib/push';
import { deletePushSubscription, getNotificationsConfig } from '../../lib/api';
import { timeAgo } from '../../lib/utils';

export default function NotificationsSettings() {
  const subs = usePushSubscriptions();
  const test = useSendTestNotification();
  const qc = useQueryClient();
  const scope = useUserScope();

  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    currentPermission(),
  );
  const [serverConfig, setServerConfig] = useState<{ web: boolean; fcm: boolean } | null>(null);

  const native = isNativeAndroid();

  useEffect(() => {
    let cancelled = false;
    getNotificationsConfig()
      .then((c) => {
        if (!cancelled) setServerConfig({ web: c.web_push_enabled, fcm: c.fcm_enabled });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const hasActiveLocalSub = useMemo(() => {
    if (!subs.data) return false;
    const activeEndpoint = getActivePushEndpoint();
    if (!activeEndpoint) return false;

    // Generate the same preview as the backend
    const preview = activeEndpoint.length > 28
      ? `${activeEndpoint.slice(0, 18)}…${activeEndpoint.slice(-8)}`
      : activeEndpoint;

    return subs.data.some((s) => s.endpoint_preview === preview);
  }, [subs.data]);

  const handleEnable = async () => {
    setBusy(true);
    const res = await enablePush(navigator.userAgent.slice(0, 60));
    setBusy(false);
    setPermission(currentPermission());
    if (res.status === 'subscribed') {
      toast.success('Notifications enabled on this device');
      qc.invalidateQueries({ queryKey: ['push-subscriptions', scope] });
    } else if (res.status === 'denied') {
      toast.error(res.message || 'Permission denied');
    } else if (res.status === 'unsupported') {
      toast.error(res.message || 'Push is not supported on this device');
    } else if (res.status === 'not-configured') {
      toast.error(res.message || 'Push is not configured on the server');
    } else {
      toast.error(res.message || 'Could not enable push');
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    const res = await disablePush();
    setBusy(false);
    setPermission(currentPermission());
    if (res.status === 'error') {
      toast.error(res.message || 'Failed to disable push');
      return;
    }
    toast.success('Push disabled on this device');
    qc.invalidateQueries({ queryKey: ['push-subscriptions', scope] });
  };

  const handleRemove = async (id: number) => {
    try {
      await deletePushSubscription(id);
      toast.success('Device removed');
      qc.invalidateQueries({ queryKey: ['push-subscriptions', scope] });
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    }
  };

  const supportText = (() => {
    if (native) return 'Android (Capacitor / FCM)';
    if (!isWebPushSupported()) {
      return 'Not supported in this browser. On iOS, install Cold Scout to your Home Screen first (Share → Add to Home Screen).';
    }
    if (permission === 'denied') {
      return 'Notification permission is denied. Enable it from your browser settings to subscribe.';
    }
    if (permission === 'granted') return 'Web Push (browser / installed PWA)';
    return 'Web Push — click Enable to grant permission.';
  })();

  const transportBadges = (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        label={`Web Push: ${serverConfig?.web ? 'Configured' : 'Disabled'}`}
        variant={serverConfig?.web ? 'green' : 'muted'}
      />
      <Badge
        label={`FCM (Android): ${serverConfig?.fcm ? 'Configured' : 'Disabled'}`}
        variant={serverConfig?.fcm ? 'green' : 'muted'}
      />
    </div>
  );

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-medium text-white/75 uppercase tracking-widest">
            Notifications
          </h3>
          <p className="text-[11px] text-tertiary mt-1">{supportText}</p>
        </div>
        <Bell className="w-4 h-4 text-white/75" />
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {hasActiveLocalSub ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<BellOff className="w-3.5 h-3.5" />}
              onClick={handleDisable}
              loading={busy}
            >
              Disable on this device
            </Button>
          ) : (
            <Button
              size="sm"
              icon={<Bell className="w-3.5 h-3.5" />}
              onClick={handleEnable}
              loading={busy}
            >
              Enable on this device
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={<Send className="w-3.5 h-3.5" />}
            onClick={() => test.mutate({})}
            loading={test.isPending}
          >
            Send test
          </Button>
        </div>

        {transportBadges}

        <div>
          <p className="text-[11px] text-tertiary uppercase tracking-wider mb-2">Subscribed devices</p>
          {subs.isLoading && <p className="text-xs text-tertiary">Loading…</p>}
          {!subs.isLoading && (subs.data || []).length === 0 && (
            <p className="text-xs text-tertiary">No devices subscribed yet.</p>
          )}
          <ul className="space-y-1.5">
            {(subs.data || []).map((s) => {
              const Icon = s.platform === 'android' ? Smartphone : Globe;
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-md bg-surface-3 border border-white/[0.06]"
                >
                  <Icon className="w-4 h-4 text-white/75 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate">
                      {s.label || s.user_agent || s.endpoint_preview}
                    </p>
                    <p className="text-[10px] font-mono text-tertiary truncate">
                      {s.platform} · last used {timeAgo(s.last_used_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(s.id)}
                    className="p-1.5 rounded text-tertiary hover:text-danger hover:bg-white/[0.06] transition-colors"
                    title="Remove device"
                    aria-label="Remove device"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Card>
  );
}

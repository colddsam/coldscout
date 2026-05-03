/**
 * Bell-icon notification center for the Topbar.
 *
 * One self-contained dropdown: badge (unread count), list of recent items,
 * mark-all-read, click-to-navigate, single-item dismiss. Reads from the
 * shared ``useNotificationsFeed`` query so the badge and the list never
 * disagree on what's unread.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  CheckCheck,
  Trash2,
  X,
  AlertTriangle,
  Activity,
  CheckCircle2,
  Sparkles,
  Info,
  Loader2,
} from 'lucide-react';
import {
  useClearAllNotifications,
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsFeed,
} from '../../hooks/useNotifications';
import type { NotificationItem } from '../../lib/api';
import { cn } from '../../lib/utils';
import { timeAgo } from '../../lib/utils';

const KIND_ICON: Record<string, { Icon: React.ElementType; tone: string }> = {
  stage_started: { Icon: Activity, tone: 'text-white' },
  stage_progress: { Icon: Loader2, tone: 'text-white' },
  stage_finished: { Icon: CheckCircle2, tone: 'text-success' },
  stage_failed: { Icon: AlertTriangle, tone: 'text-danger' },
  app_update: { Icon: Sparkles, tone: 'text-accent' },
  system: { Icon: Info, tone: 'text-secondary' },
};

function iconFor(kind: string) {
  return KIND_ICON[kind] || KIND_ICON.system;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const { data, isLoading, isError, refetch } = useNotificationsFeed({ limit: 20 });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const removeOne = useDeleteNotification();
  const clearAll = useClearAllNotifications();
  const navigate = useNavigate();

  const unread = data?.unread_count ?? 0;
  const items = data?.items || [];

  // Close on outside click / escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onItemClick = (n: NotificationItem) => {
    if (!n.read_at) markRead.mutate(n.id);
    if (n.url) {
      setOpen(false);
      // Same-origin paths route through React Router; absolute URLs open as-is.
      if (/^https?:\/\//i.test(n.url)) {
        window.open(n.url, '_blank', 'noopener');
      } else {
        navigate(n.url);
      }
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <motion.button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) refetch();
        }}
        className={cn(
          'relative p-1.5 rounded-md text-secondary hover:text-white hover:bg-white/[0.06] transition-colors',
          open && 'text-white bg-white/[0.06]',
        )}
        whileTap={{ scale: 0.92 }}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full',
              'bg-danger text-white text-[10px] font-bold leading-4 text-center',
              'border border-black',
            )}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className={cn(
              'absolute right-0 mt-2 z-50',
              'w-[min(92vw,360px)] max-h-[min(70vh,520px)]',
              'bg-surface-2 border border-white/[0.08] rounded-lg shadow-xl',
              'flex flex-col overflow-hidden',
            )}
            role="dialog"
            aria-label="Notifications"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
              <div>
                <p className="text-sm font-semibold text-white">Notifications</p>
                <p className="text-[11px] text-tertiary">
                  {unread > 0 ? `${unread} unread` : 'All caught up'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => markAll.mutate()}
                  disabled={markAll.isPending || unread === 0}
                  className={cn(
                    'p-1.5 rounded-md text-secondary hover:text-white hover:bg-white/[0.06]',
                    'disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
                  )}
                  title="Mark all as read"
                  aria-label="Mark all as read"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (items.length === 0) return;
                    if (confirm('Clear all notifications?')) clearAll.mutate();
                  }}
                  disabled={clearAll.isPending || items.length === 0}
                  className={cn(
                    'p-1.5 rounded-md text-secondary hover:text-danger hover:bg-white/[0.06]',
                    'disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
                  )}
                  title="Clear all"
                  aria-label="Clear all notifications"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoading && (
                <div className="px-4 py-8 text-center text-xs text-tertiary">Loading…</div>
              )}
              {isError && (
                <div className="px-4 py-8 text-center text-xs text-danger">
                  Could not load notifications.
                </div>
              )}
              {!isLoading && !isError && items.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <Bell className="w-6 h-6 mx-auto text-tertiary mb-2" />
                  <p className="text-xs text-tertiary">
                    Notifications about pipeline runs and app updates will land here.
                  </p>
                </div>
              )}
              <ul className="divide-y divide-white/[0.04]">
                {items.map((n) => {
                  const { Icon, tone } = iconFor(n.kind);
                  const isUnread = !n.read_at;
                  const isProgress = n.kind === 'stage_progress';
                  return (
                    <li
                      key={n.id}
                      className={cn(
                        'group flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors',
                        isUnread ? 'bg-white/[0.03]' : 'bg-transparent',
                        'hover:bg-white/[0.05]',
                      )}
                      onClick={() => onItemClick(n)}
                    >
                      <span className={cn('flex-shrink-0 mt-0.5', tone)}>
                        <Icon className={cn('w-4 h-4', isProgress && 'animate-spin')} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p
                            className={cn(
                              'text-sm truncate',
                              isUnread ? 'text-white font-semibold' : 'text-secondary',
                            )}
                          >
                            {n.title}
                          </p>
                          {isUnread && (
                            <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                          )}
                        </div>
                        {n.body && (
                          <p className="text-xs text-tertiary mt-0.5 line-clamp-2 break-words">
                            {n.body}
                          </p>
                        )}
                        <p className="text-[10px] font-mono text-tertiary mt-1">
                          {timeAgo(n.created_at)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeOne.mutate(n.id);
                        }}
                        className={cn(
                          'flex-shrink-0 p-1 rounded text-tertiary hover:text-danger hover:bg-white/[0.06]',
                          'opacity-0 group-hover:opacity-100 transition-opacity',
                        )}
                        title="Dismiss"
                        aria-label="Dismiss notification"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="px-3 py-2 border-t border-white/[0.08] text-[10px] text-tertiary text-center">
              Manage push devices in{' '}
              <button
                type="button"
                className="text-white underline-offset-2 hover:underline"
                onClick={() => {
                  setOpen(false);
                  navigate('/settings');
                }}
              >
                Settings
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

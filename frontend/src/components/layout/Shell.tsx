/**
 * Main Application Layout Shell.
 *
 * Dashboard frame with animated page transitions, smooth sidebar
 * collapse/expand, and plan gating for free-tier users.
 */
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import Container from './Container';
import { useSEO } from '../../hooks/useSEO';
import { useAuth } from '../../hooks/useAuth';
import { useRealtimePipelineStatus } from '../../hooks/useRealtimePipelineStatus';
import { useLiveNotificationBridge } from '../../hooks/useNotifications';
import { ensureServiceWorker } from '../../lib/push';
import UpgradeModal from '../dashboard/UpgradeModal';
import DashboardSkeleton from '../dashboard/DashboardSkeleton';

export default function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { hasPaidPlan, user } = useAuth();
  const [modalDismissed, setModalDismissed] = useState(false);
  // Holds the backend-supplied reason from the most recent 402 so the
  // modal can show the exact paywall message instead of the generic
  // dashboard copy. Cleared on dismiss.
  const [upgradeReason, setUpgradeReason] = useState<string | null>(null);
  const location = useLocation();

  // Free-plan dashboard gate (always-on for free users) OR any backend 402
  // surfaced via the api.ts interceptor (`upgrade-required` event). Either
  // path opens the same modal, with the reason field tailored to the trigger.
  const showUpgradeModal =
    !modalDismissed && (
      !!(user && user.role === 'freelancer' && !hasPaidPlan)
      || upgradeReason !== null
    );
  const showSkeleton = user?.role === 'freelancer' && !hasPaidPlan;

  // Listen for backend 402s emitted by api.ts. Any gated endpoint — pipeline
  // trigger, Send Now, WhatsApp, demo regen, Threads runs, weekly advice,
  // maps audit — fires this event, so the modal stays the single paywall
  // surface across the entire app.
  useEffect(() => {
    const handle = (e: Event) => {
      const detail = (e as CustomEvent<{ reason?: string }>).detail;
      setUpgradeReason(detail?.reason ?? 'This feature requires a paid plan.');
      setModalDismissed(false);
    };
    window.addEventListener('upgrade-required', handle);
    return () => window.removeEventListener('upgrade-required', handle);
  }, []);

  // Push-updates: refetch health + freelancer-status the instant any client
  // toggles production state, so the topbar pill and pipeline controls flip
  // without the user needing to refresh.
  useRealtimePipelineStatus();

  // Bridge SW / Capacitor push events into the React Query cache so the bell
  // badge updates instantly when a notification arrives.
  useLiveNotificationBridge();

  // Register the SW once per authenticated session — push permission is asked
  // for separately from the Settings page, but the SW must be live before the
  // browser will deliver any push events.
  useEffect(() => {
    if (!user) return;
    ensureServiceWorker().catch(() => undefined);
  }, [user]);

  useSEO({
    title: 'Dashboard | Cold Scout',
    description: 'Manage your AI lead generation pipeline, campaigns, and inbox.',
    index: false,
  });

  return (
    <div className="flex h-screen overflow-hidden bg-black">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="relative flex flex-1 flex-col overflow-hidden bg-surface-1">
        {/* Ambient background (static) */}

        <div className="relative z-10 flex flex-col flex-1 overflow-hidden">
          {/* Top chrome wrapper — owns the device safe-area inset so the
              status bar / notch never clips UpdateBanner or Topbar. Whether
              one or both render, the inset stays accounted for here. */}
          <div className="pt-safe">
            <Topbar onMenuClick={() => setMobileOpen(true)} />
          </div>

          <main
            className="flex-1 overflow-y-auto py-4 sm:py-6 lg:py-8 pb-safe-plus-4 px-safe [--safe-px:1rem] sm:[--safe-px:1.5rem] lg:[--safe-px:2rem]"
          >
            {showSkeleton ? (
              <Container>
                <DashboardSkeleton />
              </Container>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  {/* Default max-width keeps line-lengths legible on
                      ultrawide monitors. Pages that need full-bleed
                      (e.g. tables that benefit from extra horizontal
                      room) can wrap in <Container size="wide"> or
                      <Container size="full"> themselves. */}
                  <Container>
                    <Outlet />
                  </Container>
                </motion.div>
              </AnimatePresence>
            )}
          </main>
        </div>
      </div>

      {showUpgradeModal && (
        <UpgradeModal
          reason={upgradeReason}
          onDismiss={() => {
            setModalDismissed(true);
            setUpgradeReason(null);
          }}
        />
      )}
    </div>
  );
}

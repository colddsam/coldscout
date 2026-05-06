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
import { useSEO } from '../../hooks/useSEO';
import { useAuth } from '../../hooks/useAuth';
import { useRealtimePipelineStatus } from '../../hooks/useRealtimePipelineStatus';
import { useLiveNotificationBridge } from '../../hooks/useNotifications';
import { ensureServiceWorker } from '../../lib/push';
import UpgradeModal from '../dashboard/UpgradeModal';
import DashboardSkeleton from '../dashboard/DashboardSkeleton';
import AnimatedBackground from '../ui/AnimatedBackground';
import UpdateBanner from '../UpdateBanner';

export default function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { hasPaidPlan, user } = useAuth();
  const [modalDismissed, setModalDismissed] = useState(false);
  const location = useLocation();

  const showUpgradeModal = !!(user && user.role === 'freelancer' && !hasPaidPlan && !modalDismissed);
  const showSkeleton = user?.role === 'freelancer' && !hasPaidPlan;

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
        {/* Ambient animated background — anchored to the column, stays put as main scrolls */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <AnimatedBackground variant="dashboard" />
        </div>

        <div className="relative z-10 flex flex-col flex-1 overflow-hidden">
          {/* Top chrome wrapper — owns the device safe-area inset so the
              status bar / notch never clips UpdateBanner or Topbar. Whether
              one or both render, the inset stays accounted for here. */}
          <div className="pt-safe">
            <UpdateBanner />
            <Topbar onMenuClick={() => setMobileOpen(true)} />
          </div>

          <main 
            className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-safe-plus-4 px-safe [--safe-px:1rem] sm:[--safe-px:1.5rem] lg:[--safe-px:2rem]"
          >
            {showSkeleton ? (
              <DashboardSkeleton />
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            )}
          </main>
        </div>
      </div>

      {showUpgradeModal && <UpgradeModal onDismiss={() => setModalDismissed(true)} />}
    </div>
  );
}

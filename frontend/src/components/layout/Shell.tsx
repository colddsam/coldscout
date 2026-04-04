/**
 * Main Application Layout Shell.
 *
 * Dashboard frame with animated page transitions, smooth sidebar
 * collapse/expand, and plan gating for free-tier users.
 */
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useSEO } from '../../hooks/useSEO';
import { useAuth } from '../../hooks/useAuth';
import UpgradeModal from '../dashboard/UpgradeModal';
import DashboardSkeleton from '../dashboard/DashboardSkeleton';

export default function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { hasPaidPlan, user } = useAuth();
  const [modalDismissed, setModalDismissed] = useState(false);
  const location = useLocation();

  const showUpgradeModal = !!(user && user.role === 'freelancer' && !hasPaidPlan && !modalDismissed);
  const showSkeleton = user?.role === 'freelancer' && !hasPaidPlan;

  useSEO({
    title: 'Dashboard | Cold Scout',
    description: 'Manage your AI lead generation pipeline, campaigns, and inbox.',
    index: false,
  });

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onMenuClick={() => setMobileOpen(true)} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-accents-1">
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

      {showUpgradeModal && <UpgradeModal onDismiss={() => setModalDismissed(true)} />}
    </div>
  );
}

/**
 * Main Application Layout Shell.
 *
 * Provides the consistent structural frame for the dashboard, including:
 * - Responsive Sidebar (collapsible on desktop, drawer on mobile)
 * - Persistent Topbar with system status and page controls
 * - Scrollable main content area with nested routing support via <Outlet />
 *
 * Plan gating:
 * - Freelancers with a paid plan (pro / enterprise) → full dashboard access
 * - Freelancers on the free plan → UpgradeModal on entry, then DashboardSkeleton
 */
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
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

  // True after the user dismisses the modal — keeps skeleton visible for the session
  const [modalDismissed, setModalDismissed] = useState(false);

  // Derived: show upgrade modal for free-plan freelancers until dismissed
  const showUpgradeModal = !!(user && user.role === 'freelancer' && !hasPaidPlan && !modalDismissed);

  const handleDismiss = () => {
    setModalDismissed(true);
  };

  // Determine whether to show real content or skeleton
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

        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-accents-1">
          {showSkeleton ? <DashboardSkeleton /> : <Outlet />}
        </main>
      </div>

      {/* Upgrade plan dialog — rendered outside the main flow to overlay everything */}
      {showUpgradeModal && <UpgradeModal onDismiss={handleDismiss} />}
    </div>
  );
}

/**
 * Main Application Layout Shell.
 * 
 * Provides the consistent structural frame for the dashboard, including:
 * - Responsive Sidebar (collapsible on desktop, drawer on mobile)
 * - Persistent Topbar with system status and page controls
 * - Scrollable main content area with nested routing support via <Outlet />
 */
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useSEO } from '../../hooks/useSEO';

export default function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
          <Outlet />
        </main>
      </div>
    </div>
  );
}

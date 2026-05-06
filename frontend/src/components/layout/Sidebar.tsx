/**
 * Navigation Sidebar Component.
 *
 * Smooth collapse animation, animated active indicator, hover tooltips,
 * and icon micro-interactions. Mobile: slide-in drawer with backdrop blur.
 */
import { NavLink, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { cn } from '../../lib/utils';
import { NAV_ITEMS } from '../../lib/constants';
import { useHealth } from '../../hooks/useConfig';
import StatusDot from '../ui/StatusDot';
import Logo from '../ui/Logo';
import {
  LayoutDashboard, GitBranch, Clock, Users, Send, Inbox, User, Target,
  BarChart2, Settings, ChevronLeft, LogOut, Home, Heart, AtSign, CreditCard, Smartphone,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, GitBranch, Clock, Users, Send, Inbox, BarChart2, Settings, AtSign, CreditCard, User, Target, Smartphone,
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { data: health } = useHealth();
  const { logout, user } = useAuth();
  const role = user?.role || 'freelancer';
  const isRunning = health?.production_status === true;
  const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onMobileClose}
          />
        )}
      </AnimatePresence>

      <motion.aside
        className={cn(
          'flex flex-col bg-black border-r border-white/[0.08] z-50',
          'fixed inset-y-0 left-0 lg:static',
          // The mobile drawer sits in front of the status bar; without
          // the safe-area inset its logo strip would render under the
          // notification icons on Android 15+ edge-to-edge devices and
          // iPhones in landscape (left-edge inset).
          'pt-safe pl-safe',
          !mobileOpen && '-translate-x-full lg:translate-x-0',
          mobileOpen && 'translate-x-0',
        )}
        animate={{ width: collapsed && !mobileOpen ? 64 : 240 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-white/[0.08]">
          <div className="flex items-center overflow-hidden">
            <Logo
              size={collapsed && !mobileOpen ? 'sm' : 'md'}
              showText={!collapsed || !!mobileOpen}
              forceShowText={!!mobileOpen}
              className={cn(collapsed && !mobileOpen && 'w-full justify-center gap-0')}
            />
          </div>

          {mobileOpen && (
            <motion.button
              onClick={onMobileClose}
              className="lg:hidden p-1.5 text-secondary hover:text-white hover:bg-white/[0.06] rounded-md transition-colors"
              whileTap={{ scale: 0.9 }}
              aria-label="Close menu"
            >
              <ChevronLeft className="w-5 h-5" />
            </motion.button>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
          {/* Home Link */}
          <Link
            to="/"
            onClick={onMobileClose}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200',
              'text-secondary hover:text-white hover:bg-white/[0.06]',
              collapsed && !mobileOpen && 'justify-center px-0',
            )}
          >
            <Home className="w-[18px] h-[18px] flex-shrink-0" />
            <AnimatePresence>
              {(!collapsed || mobileOpen) && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="font-medium whitespace-nowrap overflow-hidden"
                >
                  Home
                </motion.span>
              )}
            </AnimatePresence>
          </Link>

          <div className="border-b border-white/[0.06] my-1.5 mx-1" />

          {NAV_ITEMS.filter((item) => {
            if (!(item.roles as readonly string[]).includes(role)) return false;
            if (isNativeAndroid && 'hideOnNative' in item && item.hideOnNative) return false;
            return true;
          }).map((item) => {
            const Icon = ICON_MAP[item.icon];
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onMobileClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 group relative',
                    isActive
                      ? 'bg-white/[0.08] text-white shadow-[inset_2px_0_0_var(--accent)]'
                      : 'text-secondary hover:text-white hover:bg-white/[0.06]',
                    collapsed && !mobileOpen && 'justify-center px-0',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {Icon && (
                      <motion.span
                        className={cn('flex-shrink-0', isActive ? 'text-accent' : '')}
                        whileHover={!isActive ? { scale: 1.1 } : undefined}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      >
                        <Icon className="w-[18px] h-[18px]" />
                      </motion.span>
                    )}
                    <AnimatePresence>
                      {(!collapsed || mobileOpen) && (
                        <motion.span
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: 'auto' }}
                          exit={{ opacity: 0, width: 0 }}
                          className={cn(
                            'whitespace-nowrap overflow-hidden',
                            isActive ? 'font-semibold' : 'font-medium',
                          )}
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>

                    {/* Tooltip for collapsed state */}
                    {collapsed && !mobileOpen && (
                      <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-surface-3 text-white text-xs font-medium rounded-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-white/[0.12] shadow-lg">
                        {item.label}
                      </div>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom Area — pb-safe keeps the logout/sponsor row clear of the
            iOS gesture bar and Android 3-button nav inset. */}
        <div className="border-t border-white/[0.08] p-3 space-y-1.5 pb-safe-plus-3">
          {/* Logout */}
          <button
            onClick={() => {
              logout();
              onMobileClose?.();
            }}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-all duration-200',
              'text-secondary hover:text-white hover:bg-white/[0.06]',
              collapsed && !mobileOpen && 'justify-center px-0',
            )}
            title="Logout"
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
            <AnimatePresence>
              {(!collapsed || mobileOpen) && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="font-medium whitespace-nowrap overflow-hidden"
                >
                  Logout
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* Sponsor */}
          <a
            href="https://github.com/sponsors/colddsam"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-all duration-200',
              'text-secondary hover:text-white hover:bg-white/[0.06]',
              collapsed && !mobileOpen && 'justify-center px-0',
            )}
            title="Sponsor the project"
          >
            <Heart
              className={cn(
                'w-[18px] h-[18px] flex-shrink-0',
                !collapsed || mobileOpen ? 'fill-current' : '',
              )}
            />
            <AnimatePresence>
              {(!collapsed || mobileOpen) && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="font-medium whitespace-nowrap overflow-hidden"
                >
                  Sponsor
                </motion.span>
              )}
            </AnimatePresence>
          </a>

          {/* System Status — freelancer only */}
          {role !== 'client' && (
            <motion.div
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-white/[0.08]',
                collapsed && !mobileOpen && 'justify-center px-0',
              )}
              layout
            >
              <StatusDot status={isRunning ? 'live' : 'hold'} />
              <AnimatePresence>
                {(!collapsed || mobileOpen) && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className="text-[10px] font-mono text-secondary uppercase tracking-[0.12em] font-semibold whitespace-nowrap overflow-hidden"
                  >
                    {isRunning ? 'SYSTEM RUN' : 'SYSTEM HOLD'}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Collapse Toggle (desktop) */}
          <motion.button
            onClick={onToggle}
            className="hidden lg:flex items-center justify-center w-full p-2 rounded-lg text-secondary hover:text-white hover:bg-white/[0.06] transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <motion.span
              animate={{ rotate: collapsed ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <ChevronLeft className="w-[18px] h-[18px]" />
            </motion.span>
          </motion.button>
        </div>
      </motion.aside>
    </>
  );
}

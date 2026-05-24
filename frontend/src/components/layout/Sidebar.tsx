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
  BarChart2, Settings, ChevronLeft, LogOut, Home, Heart, AtSign, CreditCard, Smartphone, Calendar,
  Shield, UserCog,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, GitBranch, Clock, Users, Send, Inbox, BarChart2, Settings, AtSign, CreditCard, User, Target, Smartphone, Calendar, Shield, UserCog,
};

/**
 * Admin-only nav items, rendered after the main NAV_ITEMS map and
 * only when the current user has ``is_superuser=true``. Kept local
 * because the role-based filter in NAV_ITEMS doesn't model a
 * superuser flag — they're orthogonal (a superuser can also be a
 * client or freelancer).
 */
const ADMIN_NAV_ITEMS: { path: string; label: string; icon: string }[] = [
  { path: '/admin/users', label: 'User Admin', icon: 'UserCog' },
];

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
        <div className="flex items-center justify-between px-4 h-14 border-b border-white/[0.06]">
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
              className="lg:hidden row-action"
              whileTap={{ scale: 0.9 }}
              aria-label="Close menu"
            >
              <ChevronLeft className="w-4 h-4" />
            </motion.button>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-3 space-y-[2px] px-2 overflow-y-auto">
          {/* Home Link */}
          <Link
            to="/"
            onClick={onMobileClose}
            className={cn(
              'flex items-center gap-3 px-2.5 py-2 rounded-md text-[13px] transition-all duration-200',
              'text-secondary hover:text-white hover:bg-white/[0.05]',
              collapsed && !mobileOpen && 'justify-center px-0',
            )}
          >
            <Home className="w-[17px] h-[17px] flex-shrink-0" strokeWidth={1.75} />
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

          {(!collapsed || mobileOpen) && (
            <p className="eyebrow px-3 pt-4 pb-1.5 text-[10px]">Workspace</p>
          )}
          {(collapsed && !mobileOpen) && <div className="hairline-fade my-3 mx-2" />}

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
                    'flex items-center gap-3 px-2.5 py-2 rounded-md text-[13px] transition-all duration-200 group relative',
                    isActive
                      ? 'text-white bg-white/[0.06]'
                      : 'text-secondary hover:text-white hover:bg-white/[0.04]',
                    collapsed && !mobileOpen && 'justify-center px-0',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Left accent rail for active items — replaces inset shadow */}
                    {isActive && (
                      <motion.span
                        layoutId="sidebar-active-rail"
                        className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full bg-white"
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}
                    {Icon && (
                      <span
                        className={cn(
                          'flex-shrink-0 transition-colors',
                          isActive ? 'text-white' : 'text-secondary group-hover:text-white',
                        )}
                      >
                        <Icon className="w-[17px] h-[17px]" strokeWidth={isActive ? 2 : 1.75} />
                      </span>
                    )}
                    <AnimatePresence>
                      {(!collapsed || mobileOpen) && (
                        <motion.span
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: 'auto' }}
                          exit={{ opacity: 0, width: 0 }}
                          className={cn(
                            'whitespace-nowrap overflow-hidden',
                            isActive ? 'font-semibold tracking-tight' : 'font-medium',
                          )}
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>

                    {/* Tooltip for collapsed state */}
                    {collapsed && !mobileOpen && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-surface-3 text-white text-[11px] font-medium rounded-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-white/[0.12] shadow-lg">
                        {item.label}
                      </div>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}

          {/* Superuser-only admin section. Backend gates the routes
              themselves — this is the UI affordance so operators can
              find the page. Hidden entirely for non-superusers so the
              existence of the panel isn't leaked. */}
          {user?.is_superuser && (
            <>
              {(!collapsed || mobileOpen) && (
                <p className="eyebrow px-3 pt-4 pb-1.5 text-[10px]">Admin</p>
              )}
              {(collapsed && !mobileOpen) && <div className="hairline-fade my-3 mx-2" />}

              {ADMIN_NAV_ITEMS.map((item) => {
                const Icon = ICON_MAP[item.icon];
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onMobileClose}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-2.5 py-2 rounded-md text-[13px] transition-all duration-200 group relative',
                        isActive
                          ? 'text-white bg-white/[0.06]'
                          : 'text-secondary hover:text-white hover:bg-white/[0.04]',
                        collapsed && !mobileOpen && 'justify-center px-0',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span
                            layoutId="sidebar-active-rail"
                            className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full bg-white"
                            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                          />
                        )}
                        {Icon && (
                          <span
                            className={cn(
                              'flex-shrink-0 transition-colors',
                              isActive ? 'text-white' : 'text-secondary group-hover:text-white',
                            )}
                          >
                            <Icon className="w-[17px] h-[17px]" strokeWidth={isActive ? 2 : 1.75} />
                          </span>
                        )}
                        <AnimatePresence>
                          {(!collapsed || mobileOpen) && (
                            <motion.span
                              initial={{ opacity: 0, width: 0 }}
                              animate={{ opacity: 1, width: 'auto' }}
                              exit={{ opacity: 0, width: 0 }}
                              className={cn(
                                'whitespace-nowrap overflow-hidden',
                                isActive ? 'font-semibold tracking-tight' : 'font-medium',
                              )}
                            >
                              {item.label}
                            </motion.span>
                          )}
                        </AnimatePresence>
                        {collapsed && !mobileOpen && (
                          <div className="absolute left-full ml-2 px-2 py-1 bg-surface-3 text-white text-[11px] font-medium rounded-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-white/[0.12] shadow-lg">
                            {item.label}
                          </div>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </>
          )}
        </nav>

        {/* Bottom Area */}
        <div className="border-t border-white/[0.06] p-2 space-y-[2px] pb-safe-plus-3">
          {/* System Status — freelancer only */}
          {role !== 'client' && (
            <motion.div
              className={cn(
                'flex items-center gap-2 px-2.5 py-2 rounded-md bg-white/[0.025] border border-white/[0.06]',
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
                    className="text-[10px] font-mono text-secondary uppercase tracking-[0.14em] font-semibold whitespace-nowrap overflow-hidden"
                  >
                    {isRunning ? 'System Run' : 'System Hold'}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Sponsor */}
          <a
            href="https://github.com/sponsors/colddsam"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center gap-3 w-full px-2.5 py-2 rounded-md text-[13px] transition-all duration-200',
              'text-secondary hover:text-white hover:bg-white/[0.04]',
              collapsed && !mobileOpen && 'justify-center px-0',
            )}
            title="Sponsor the project"
          >
            <Heart className="w-[17px] h-[17px] flex-shrink-0" strokeWidth={1.75} />
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

          {/* Logout */}
          <button
            onClick={() => {
              logout();
              onMobileClose?.();
            }}
            className={cn(
              'flex items-center gap-3 w-full px-2.5 py-2 rounded-md text-[13px] transition-all duration-200',
              'text-secondary hover:text-white hover:bg-white/[0.04]',
              collapsed && !mobileOpen && 'justify-center px-0',
            )}
            title="Logout"
          >
            <LogOut className="w-[17px] h-[17px] flex-shrink-0" strokeWidth={1.75} />
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

          {/* Collapse Toggle (desktop) */}
          <motion.button
            onClick={onToggle}
            className="hidden lg:flex items-center justify-center w-full p-1.5 mt-1 rounded-md text-tertiary hover:text-white hover:bg-white/[0.04] transition-colors"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <motion.span
              animate={{ rotate: collapsed ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <ChevronLeft className="w-4 h-4" />
            </motion.span>
          </motion.button>
        </div>
      </motion.aside>
    </>
  );
}

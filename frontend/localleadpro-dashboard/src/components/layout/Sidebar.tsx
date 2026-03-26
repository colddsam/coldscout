/**
 * Navigation Sidebar Component.
 * 
 * Responsibly manages application navigation, branding, and system status indicators.
 * Support responsive states:
 * - Desktop: Collapsible for maximum workspace area.
 * - Mobile: Absolute-positioned drawer with backdrop overaly.
 */
import { NavLink, Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { NAV_ITEMS } from '../../lib/constants';
import { useHealth } from '../../hooks/useConfig';
import StatusDot from '../ui/StatusDot';
import Logo from '../ui/Logo';
import {
  LayoutDashboard, GitBranch, Clock, Users, Send, Inbox,
  BarChart2, Settings, ChevronLeft, ChevronRight, LogOut, Home, Heart, AtSign
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

/**
 * Maps semantic navigation item icons to Lucide-React icon components.
 */
const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, GitBranch, Clock, Users, Send, Inbox, BarChart2, Settings, AtSign,
};

interface SidebarProps {
  /** Indicates if the sidebar is in its minimized state (desktop only) */
  collapsed: boolean;
  /** Callback triggered when the collapse state is toggled */
  onToggle: () => void;
  /** Indicates if the mobile drawer is currently visible */
  mobileOpen?: boolean;
  /** Callback triggered when the mobile drawer should be closed */
  onMobileClose?: () => void;
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { data: health } = useHealth();
  const { logout } = useAuth();
  const isRunning = health?.production_status === true;

  return (
    <>
      {/* Mobile Overlay */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onMobileClose}
      />

      <aside className={cn(
        'flex flex-col bg-white border-r border-gray-200 transition-all duration-300 z-50',
        'fixed inset-y-0 left-0 lg:static',
        collapsed ? 'w-16' : 'w-60',
        !mobileOpen && '-translate-x-full lg:translate-x-0',
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200">
          <div className="flex items-center">
            <Logo 
              size={collapsed && !mobileOpen ? "sm" : "md"} 
              showText={!collapsed || mobileOpen} 
              forceShowText={mobileOpen}
              className={cn(collapsed && !mobileOpen && "w-full justify-center gap-0")}
            />
          </div>
          
          {/* Mobile Close Button */}
          {mobileOpen && (
            <button 
              onClick={onMobileClose}
              className="lg:hidden p-1 text-secondary hover:text-black transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
          {/* Home / Landing Page link */}
          <Link
            to="/"
            onClick={onMobileClose}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-200',
              'text-secondary hover:text-black hover:bg-gray-50',
              collapsed && !mobileOpen && 'justify-center px-0',
            )}
          >
            <Home className="w-[18px] h-[18px] flex-shrink-0" />
            {(!collapsed || mobileOpen) && <span className="font-medium">Home</span>}
          </Link>

          <div className="border-b border-gray-100 my-1.5 mx-1" />

          {NAV_ITEMS.map((item) => {
            const Icon = ICON_MAP[item.icon];
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onMobileClose}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-200 group',
                  isActive
                    ? 'bg-black text-white'
                    : 'text-secondary hover:text-black hover:bg-gray-50',
                  collapsed && !mobileOpen && 'justify-center px-0',
                )}
              >
                {Icon && <Icon className="w-[18px] h-[18px] flex-shrink-0" />}
                {(!collapsed || mobileOpen) && <span className="font-medium">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom Area */}
        <div className="border-t border-gray-200 p-3 space-y-2">
          {/* Logout Button */}
          <button
            onClick={() => {
              logout();
              onMobileClose?.();
            }}
            className={cn(
              "flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-all duration-200",
              "text-secondary hover:text-black hover:bg-gray-50",
              collapsed && !mobileOpen && "justify-center px-0"
            )}
            title="Logout"
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
            {(!collapsed || mobileOpen) && <span className="font-medium">Logout</span>}
          </button>

          {/* Sponsor Button */}
          <a
            href="https://github.com/sponsors/colddsam"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-all duration-200",
              "text-secondary hover:text-black hover:bg-gray-50",
              collapsed && !mobileOpen && "justify-center px-0"
            )}
            title="Sponsor the project"
          >
            <Heart className={cn("w-[18px] h-[18px] flex-shrink-0", !collapsed || mobileOpen ? "fill-current" : "")} />
            {(!collapsed || mobileOpen) && <span className="font-medium">Sponsor</span>}
          </a>

          {/* System Status */}
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md bg-accents-1 border border-accents-2',
            collapsed && !mobileOpen && 'justify-center px-0',
          )}>
            <StatusDot status={isRunning ? 'live' : 'hold'} />
            {(!collapsed || mobileOpen) && (
              <span className="text-[10px] font-mono text-secondary uppercase tracking-wider">
                {isRunning ? 'SYSTEM RUN' : 'SYSTEM HOLD'}
              </span>
            )}
          </div>

          {/* Collapse Toggle (hide on mobile) */}
          <button
            onClick={onToggle}
            className="hidden lg:flex items-center justify-center w-full p-2 rounded-md text-secondary hover:text-black hover:bg-gray-50 transition-colors"
          >
            {collapsed ? <ChevronRight className="w-[18px] h-[18px]" /> : <ChevronLeft className="w-[18px] h-[18px]" />}
          </button>
        </div>
      </aside>
    </>
  );
}

/**
 * Persistent Header / Topbar Component.
 *
 * Glass-panel effect with context-aware page titles, health status,
 * and system toggle with animated micro-interactions.
 */
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useHealth, useSystemToggle } from '../../hooks/useConfig';
import Badge from '../ui/Badge';
import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { NAV_ITEMS } from '../../lib/constants';
import { timeAgo } from '../../lib/utils';
import { Menu, Pause, Play } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import NotificationBell from '../notifications/NotificationBell';

interface TopbarProps {
  onMenuClick: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const location = useLocation();
  const { data: health, dataUpdatedAt } = useHealth();
  const systemToggle = useSystemToggle();
  const [showConfirm, setShowConfirm] = useState(false);
  const { user } = useAuth();
  const role = user?.role || 'freelancer';

  const currentNav = NAV_ITEMS.find((n) => location.pathname.startsWith(n.path));
  const pageTitle = currentNav?.label || 'Dashboard';
  const isRunning = health?.production_status === true;

  const handleToggle = () => setShowConfirm(true);

  const confirmToggle = () => {
    systemToggle.mutate(isRunning ? 'hold' : 'resume');
    setShowConfirm(false);
  };

  return (
    <>
      <header className="flex items-center justify-between h-14 px-4 md:px-6 bg-black/70 backdrop-blur-md sticky top-0 z-30 border-b border-white/[0.08]">
        <div className="flex items-center gap-3 min-w-0">
          <motion.button
            onClick={onMenuClick}
            className="lg:hidden row-action -ml-1"
            whileTap={{ scale: 0.9 }}
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </motion.button>
          <motion.h1
            key={pageTitle}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="heading-section truncate"
          >
            {pageTitle}
          </motion.h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {!(role === 'client' && location.pathname === '/profile') && (
            <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-mono text-tertiary">
              <span className="relative w-1.5 h-1.5 rounded-full bg-success">
                <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-60" />
              </span>
              {dataUpdatedAt ? timeAgo(new Date(dataUpdatedAt).toISOString()) : '—'}
            </span>
          )}

          {health && (
            <Badge
              label={health.status === 'healthy' ? 'Healthy' : 'Error'}
              variant={health.status === 'healthy' ? 'teal' : 'red'}
              pulse={health.status === 'healthy'}
              className="hidden sm:inline-flex"
            />
          )}

          <NotificationBell />

          {role !== 'client' && (
            <Button
              variant={isRunning ? 'secondary' : 'primary'}
              size="sm"
              onClick={handleToggle}
              loading={systemToggle.isPending}
              icon={isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              aria-label={isRunning ? 'Hold system' : 'Resume system'}
              className="!gap-1.5 w-8 px-0 sm:w-auto sm:px-3"
            >
              <span className="hidden sm:inline">{isRunning ? 'Hold' : 'Resume'}</span>
            </Button>
          )}
        </div>
      </header>

      {role !== 'client' && (
        <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title={isRunning ? 'Hold the pipeline?' : 'Resume the pipeline?'}>
          <p className="text-[13px] text-secondary mb-5 leading-relaxed">
            {isRunning
              ? 'All automated discovery, outreach and follow-up jobs will pause until you resume the system.'
              : 'Automated discovery, outreach and follow-up jobs will resume on their scheduled cadence.'}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={confirmToggle}
              icon={isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            >
              {isRunning ? 'Hold System' : 'Resume System'}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

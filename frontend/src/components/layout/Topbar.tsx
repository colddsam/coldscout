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
import { Menu } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

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
      <header className="flex items-center justify-between h-14 px-4 md:px-6 glass-panel-strong sticky top-0 z-30 border-b border-accents-2">
        <div className="flex items-center gap-4">
          <motion.button
            onClick={onMenuClick}
            className="lg:hidden p-1.5 text-secondary hover:text-black transition-colors"
            whileTap={{ scale: 0.9 }}
          >
            <Menu className="w-6 h-6" />
          </motion.button>
          <motion.h1
            key={pageTitle}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="text-base font-semibold text-black tracking-tight whitespace-nowrap"
          >
            {pageTitle}
          </motion.h1>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          {!(role === 'client' && location.pathname === '/profile') && (
            <span className="hidden sm:inline text-[10px] font-mono text-subtle">
              Updated {dataUpdatedAt ? timeAgo(new Date(dataUpdatedAt).toISOString()) : '—'}
            </span>
          )}

          {health && (
            <Badge
              label={health.status === 'healthy' ? 'Healthy' : 'Error'}
              variant={health.status === 'healthy' ? 'teal' : 'red'}
              pulse={health.status === 'healthy'}
              className="hidden xs:flex"
            />
          )}

          {role !== 'client' && (
            <Button
              variant={isRunning ? 'danger' : 'primary'}
              size="sm"
              onClick={handleToggle}
              loading={systemToggle.isPending}
              className="px-2 md:px-4 text-[10px] md:text-xs"
            >
              <span className="hidden xs:inline">{isRunning ? '⏸ HOLD SYSTEM' : '▶ RESUME SYSTEM'}</span>
              <span className="xs:hidden">{isRunning ? '⏸' : '▶'}</span>
            </Button>
          )}
        </div>
      </header>

      {role !== 'client' && (
        <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="Confirm System Toggle">
          <p className="text-secondary text-sm mb-4">
            {isRunning
              ? 'This will pause ALL automated pipeline operations. Are you sure?'
              : 'This will resume all automated pipeline operations. Are you sure?'}
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button variant={isRunning ? 'danger' : 'primary'} onClick={confirmToggle}>
              {isRunning ? 'Hold System' : 'Resume System'}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

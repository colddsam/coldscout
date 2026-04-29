/**
 * Presentational Card Components.
 *
 * Provides structural containers with hover micro-interactions and
 * specialized StatCard variants for KPI visualization with animated counters.
 */
import { cn } from '../../lib/utils';
import { motion } from 'framer-motion';
import AnimatedCounter from './AnimatedCounter';
import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  padding?: boolean;
  interactive?: boolean;
}

export default function Card({
  children,
  className,
  glow = true,
  padding = true,
  interactive = false,
}: CardProps) {
  const Wrapper = interactive ? motion.div : 'div';
  const motionProps = interactive
    ? {
        whileHover: { y: -2, boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 12px 40px rgba(0,0,0,0.4)' },
        transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
      }
    : {};

  return (
    <Wrapper
      className={cn(
        'rounded-xl bg-surface-2 border border-white/[0.08]',
        'shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]',
        glow && !interactive && 'hover:border-white/[0.16] transition-all duration-300',
        padding && 'p-5',
        className,
      )}
      {...motionProps}
    >
      {children}
    </Wrapper>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: string;
  className?: string;
}

export function StatCard({ label, value, icon, trend, className }: StatCardProps) {
  const isNumber = typeof value === 'number';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <Card
        className={cn('relative overflow-hidden group hover:border-white/[0.18] transition-all duration-300', className)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="eyebrow mb-2 truncate">{label}</p>
            {isNumber ? (
              <AnimatedCounter
                value={value}
                className="text-3xl font-bold text-white tracking-tight font-mono"
              />
            ) : (
              <p className="text-3xl font-bold text-white tracking-tight truncate">{value}</p>
            )}
            {trend && (
              <p className="text-xs text-secondary mt-1.5 font-mono truncate">{trend}</p>
            )}
          </div>
          {icon && (
            <div className="flex-shrink-0 text-secondary group-hover:text-white transition-colors duration-300 mt-0.5 p-2.5 bg-white/[0.04] rounded-xl border border-white/[0.08] group-hover:border-white/[0.18] group-hover:bg-white/[0.06]">
              <span className="w-7 h-7 flex items-center justify-center">{icon}</span>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

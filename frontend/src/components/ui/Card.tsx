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
        'rounded-xl bg-[#111111] border border-white/5',
        glow && !interactive && 'hover:border-white/15 transition-all duration-300',
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
        className={cn('relative overflow-hidden group hover:border-white/15', className)}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] text-[#666666] uppercase tracking-[0.15em] font-semibold mb-2">
              {label}
            </p>
            {isNumber ? (
              <AnimatedCounter
                value={value}
                className="text-3xl font-bold text-white tracking-tighter font-mono"
              />
            ) : (
              <p className="text-3xl font-bold text-white tracking-tighter">{value}</p>
            )}
            {trend && (
              <p className="text-xs text-[#A0A0A0] mt-1.5 font-mono">{trend}</p>
            )}
          </div>
          {icon && (
            <div className="text-[#A0A0A0] group-hover:text-white transition-colors duration-300 mt-1 p-2.5 bg-white/5 rounded-xl border border-white/5 group-hover:border-white/15">
              <span className="w-8 h-8 flex items-center justify-center">{icon}</span>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

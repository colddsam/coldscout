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
        whileHover: { y: -2, boxShadow: '0 0 0 1px rgba(0,0,0,0.12), 0 12px 40px rgba(0,0,0,0.1)' },
        transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
      }
    : {};

  return (
    <Wrapper
      className={cn(
        'rounded-xl bg-white border border-gray-200',
        glow && !interactive && 'hover:shadow-vercel transition-all duration-300',
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
        className={cn('relative overflow-hidden group hover:shadow-vercel-hover', className)}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] text-secondary uppercase tracking-[0.15em] font-semibold mb-2">
              {label}
            </p>
            {isNumber ? (
              <AnimatedCounter
                value={value}
                className="text-3xl font-bold text-black tracking-tighter font-mono"
              />
            ) : (
              <p className="text-3xl font-bold text-black tracking-tighter">{value}</p>
            )}
            {trend && (
              <p className="text-xs text-secondary mt-1.5 font-mono">{trend}</p>
            )}
          </div>
          {icon && (
            <div className="text-accents-3 group-hover:text-black transition-colors duration-300 mt-1 p-2.5 bg-accents-1 rounded-xl border border-transparent group-hover:border-accents-2">
              <span className="w-8 h-8 flex items-center justify-center">{icon}</span>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

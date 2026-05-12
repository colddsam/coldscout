/**
 * Presentational Card Components.
 *
 * Structural containers with optional hover lift, header slot, and
 * decorative SVG corner ornaments. StatCard renders KPI tiles with
 * animated counters and tighter typography for dense dashboards.
 */
import { cn } from '../../lib/utils';
import { motion } from 'framer-motion';
import AnimatedCounter from './AnimatedCounter';
import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Soft hover border. Defaults to true for non-interactive cards. */
  glow?: boolean;
  /** Apply default p-5 padding. Pass `false` for full-bleed layouts. */
  padding?: boolean;
  /** Spring-physics hover lift. */
  interactive?: boolean;
  /** Optional decoration in the top-right corner — sits behind content. */
  decoration?: ReactNode;
  /** Title rendered in a styled header strip. */
  title?: ReactNode;
  /** Right-aligned actions in the header strip. */
  actions?: ReactNode;
}

export default function Card({
  children,
  className,
  glow = true,
  padding = true,
  interactive = false,
  decoration,
  title,
  actions,
}: CardProps) {
  const Wrapper = interactive ? motion.div : 'div';
  const motionProps = interactive
    ? {
        whileHover: { y: -2, boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 14px 40px rgba(0,0,0,0.5)' },
        transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
      }
    : {};

  const hasHeader = title !== undefined || actions !== undefined;

  return (
    <Wrapper
      className={cn(
        'relative overflow-hidden rounded-xl bg-surface-2 border border-white/[0.08]',
        'shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]',
        glow && !interactive && 'hover:border-white/[0.16] transition-all duration-300',
        // Padding applies only when no header is used (header has its own).
        padding && !hasHeader && 'p-5',
        className,
      )}
      {...motionProps}
    >
      {decoration && (
        <div className="deco-corner text-white">{decoration}</div>
      )}

      {hasHeader && (
        <>
          <div className="panel-header relative z-[1]">
            {title && <div className="panel-header-title">{title}</div>}
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
          <div className={cn(padding && 'p-5', 'relative z-[1]')}>{children}</div>
        </>
      )}

      {!hasHeader && <div className="relative z-[1]">{children}</div>}
    </Wrapper>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: string;
  /** Direction & color for the trend chip. */
  trendDirection?: 'up' | 'down' | 'neutral';
  /** Optional in-card SVG decoration. */
  decoration?: ReactNode;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon,
  trend,
  trendDirection = 'neutral',
  decoration,
  className,
}: StatCardProps) {
  const isNumber = typeof value === 'number';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn('stat-tile group', className)}
    >
      {decoration && (
        <div className="deco-corner text-white">{decoration}</div>
      )}

      <div className="relative z-[1] flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="eyebrow mb-2 truncate">{label}</p>
          {isNumber ? (
            <AnimatedCounter
              value={value}
              className="text-display-num text-[1.75rem] md:text-[2rem] leading-none block"
            />
          ) : (
            <p className="text-[1.5rem] md:text-[1.75rem] leading-none font-semibold text-white tracking-tight truncate">
              {value}
            </p>
          )}
          {trend && (
            <p
              className={cn(
                'mt-2 inline-flex items-center gap-1 text-[11px] font-mono',
                trendDirection === 'up' && 'text-success',
                trendDirection === 'down' && 'text-danger',
                trendDirection === 'neutral' && 'text-tertiary',
              )}
            >
              {trendDirection === 'up' && <span aria-hidden>▲</span>}
              {trendDirection === 'down' && <span aria-hidden>▼</span>}
              {trend}
            </p>
          )}
        </div>

        {icon && (
          <div className="icon-bubble flex-shrink-0">
            <span className="w-[18px] h-[18px] flex items-center justify-center [&>svg]:w-[18px] [&>svg]:h-[18px]">
              {icon}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

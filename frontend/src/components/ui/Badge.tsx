/**
 * Semantic Badge/Tag Component.
 *
 * Status indicators and categorical tagging with pulse animation
 * for live states and smooth color transitions.
 */
import { cn } from '../../lib/utils';
import type { LeadStatus } from '../../lib/api';
import { STATUS_COLORS } from '../../lib/constants';

interface BadgeProps {
  label: string;
  variant?: 'green' | 'teal' | 'amber' | 'red' | 'muted' | 'accent';
  className?: string;
  pulse?: boolean;
}

const variantStyles: Record<string, string> = {
  green:  'bg-success/10 text-success border-success/25',
  teal:   'bg-white/[0.08] text-white border-white/15',
  amber:  'bg-warning/10 text-warning border-warning/25',
  red:    'bg-danger/10 text-danger border-danger/25',
  accent: 'bg-accent/10 text-accent border-accent/25',
  muted:  'bg-white/[0.04] text-[#B0B0B0] border-white/10',
};

const dotColors: Record<string, string> = {
  green:  'bg-success',
  teal:   'bg-white',
  amber:  'bg-warning',
  red:    'bg-danger',
  accent: 'bg-accent',
  muted:  'bg-[#7A7A7A]',
};

export default function Badge({ label, variant = 'muted', className, pulse }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border uppercase tracking-wider',
        'transition-all duration-300',
        variantStyles[variant],
        className,
      )}
    >
      <span className="relative flex items-center justify-center">
        <span className={cn('w-1.5 h-1.5 rounded-full', dotColors[variant])} />
        {pulse && (
          <span
            className={cn(
              'absolute w-1.5 h-1.5 rounded-full animate-ping',
              dotColors[variant],
            )}
          />
        )}
      </span>
      {label}
    </span>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function statusBadge(status: LeadStatus | string) {
  const variant = (STATUS_COLORS[status] || 'muted') as BadgeProps['variant'];
  const label = status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
  return <Badge label={label} variant={variant} />;
}

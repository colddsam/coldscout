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
  variant?: 'green' | 'teal' | 'amber' | 'red' | 'muted';
  className?: string;
  pulse?: boolean;
}

const variantStyles: Record<string, string> = {
  green: 'bg-white text-black border-white shadow-[0_0_8px_rgba(255,255,255,0.1)]',
  teal: 'bg-white/10 text-white border-white/20',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  red: 'bg-red-500/10 text-red-400 border-red-500/20',
  muted: 'bg-white/5 text-[#A0A0A0] border-white/10',
};

const dotColors: Record<string, string> = {
  green: 'bg-black',
  teal: 'bg-white',
  amber: 'bg-amber-400',
  red: 'bg-red-400',
  muted: 'bg-[#666666]',
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

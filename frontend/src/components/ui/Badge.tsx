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
  green: 'bg-black text-white border-black shadow-minimal',
  teal: 'bg-gray-100 text-black border-gray-400',
  amber: 'bg-white text-black border-gray-200',
  red: 'bg-gray-800 text-white border-gray-800',
  muted: 'bg-accents-1 text-secondary border-accents-2',
};

const dotColors: Record<string, string> = {
  green: 'bg-white',
  teal: 'bg-black',
  amber: 'bg-gray-400',
  red: 'bg-gray-300',
  muted: 'bg-accents-3',
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

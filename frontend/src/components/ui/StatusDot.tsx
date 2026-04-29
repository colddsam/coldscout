/**
 * Minimalist Status Indicator Dot.
 * 
 * Provides a color-coded visual signal for system or entity health.
 * Includes a 'ping' animation for the 'live' status to indicate active processing.
 */
import { cn } from '../../lib/utils';

interface StatusDotProps {
  /** Semantic state of the entity being monitored */
  status: 'live' | 'hold' | 'error' | 'unknown';
  /** Additional CSS classes for custom positioning */
  className?: string;
}

const dotStyles: Record<string, string> = {
  live:    'bg-success shadow-[0_0_8px_rgba(52,211,153,0.6)]',
  hold:    'bg-warning shadow-[0_0_8px_rgba(251,191,36,0.45)]',
  error:   'bg-danger  shadow-[0_0_8px_rgba(248,113,113,0.55)]',
  unknown: 'bg-accents-5',
};

const pingStyles: Record<string, string> = {
  live:    'bg-success',
  hold:    'bg-warning',
  error:   'bg-danger',
  unknown: 'bg-accents-5',
};

export default function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span className={cn('relative inline-flex h-2.5 w-2.5', className)}>
      {status === 'live' && (
        <span
          className={cn(
            'animate-ping absolute inline-flex h-full w-full rounded-full opacity-60',
            pingStyles[status],
          )}
        />
      )}
      <span className={cn('relative inline-flex rounded-full h-2.5 w-2.5', dotStyles[status])} />
    </span>
  );
}

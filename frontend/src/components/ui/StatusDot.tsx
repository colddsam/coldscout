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
  live: 'bg-black',
  hold: 'bg-gray-400',
  error: 'bg-white border border-black',
  unknown: 'bg-accents-3',
};

export default function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span className={cn('relative inline-flex h-2.5 w-2.5', className)}>
      {status === 'live' && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-75" />
      )}
      <span className={cn('relative inline-flex rounded-full h-2.5 w-2.5', dotStyles[status])} />
    </span>
  );
}

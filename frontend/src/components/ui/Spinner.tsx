/**
 * Loading Indicator Components.
 * 
 * Provides a standardized 'Spinner' SVG animation and a 'PageLoader'
 * full-page centered variant for initial data fetching states.
 */
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SpinnerProps {
  /** Size variant for the spinner icon */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
}

const sizeMap = { xs: 'w-3 h-3', sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' };

export default function Spinner({ size = 'md', className }: SpinnerProps) {
  return <Loader2 className={cn('animate-spin text-black', sizeMap[size], className)} />;
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Spinner size="lg" />
    </div>
  );
}

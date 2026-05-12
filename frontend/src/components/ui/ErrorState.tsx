import { RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import Button from './Button';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

function ErrorOrnament() {
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" fill="none" stroke="currentColor" className="text-white/55">
      <motion.circle
        cx="42" cy="42" r="32"
        strokeWidth="1.2" strokeOpacity="0.35"
        animate={{ rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
        style={{ transformOrigin: '42px 42px' }}
        strokeDasharray="4 6"
      />
      <circle cx="42" cy="42" r="22" strokeWidth="1.2" strokeOpacity="0.4" />
      <line x1="42" y1="30" x2="42" y2="46" strokeWidth="1.8" strokeOpacity="0.7" strokeLinecap="round" />
      <motion.circle
        cx="42" cy="54" r="1.6"
        fill="currentColor"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.8, repeat: Infinity }}
      />
    </svg>
  );
}

export default function ErrorState({
  title = 'Something went wrong',
  message = 'Failed to load data. Please try again.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="empty-state">
      <ErrorOrnament />
      <p className="heading-section mt-4 mb-1.5">{title}</p>
      <p className="text-meta mb-5 max-w-md">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

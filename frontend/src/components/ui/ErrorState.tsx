import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from './Button';
import Card from './Card';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({
  title = 'Something went wrong',
  message = 'Failed to load data. Please try again.',
  onRetry,
}: ErrorStateProps) {
  return (
    <Card>
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 rounded-xl bg-danger/10 border border-danger/25 flex items-center justify-center mb-4">
          <AlertTriangle className="w-5 h-5 text-danger" />
        </div>
        <p className="text-base font-semibold text-white mb-1.5">{title}</p>
        <p className="text-sm text-secondary mb-5 max-w-md">{message}</p>
        {onRetry && (
          <Button variant="outline" size="sm" icon={<RefreshCw className="w-4 h-4" />} onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </Card>
  );
}

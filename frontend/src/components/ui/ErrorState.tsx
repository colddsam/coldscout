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
        <AlertTriangle className="w-8 h-8 text-gray-400 mb-3" />
        <p className="text-sm font-semibold text-gray-900 mb-1">{title}</p>
        <p className="text-xs text-gray-500 font-mono mb-4 max-w-md">{message}</p>
        {onRetry && (
          <Button variant="outline" size="sm" icon={<RefreshCw className="w-4 h-4" />} onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </Card>
  );
}

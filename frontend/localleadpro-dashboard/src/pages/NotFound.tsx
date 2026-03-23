import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';

/**
 * A standard 404 overlay displayed automatically by React Router when a
 * user navigates to an invalid/unregistered route.
 */
export default function NotFound() {
  useSEO({
    title: '404 — Page Not Found | Cold Scout',
    description: 'This page does not exist. Return to Cold Scout to discover AI-powered lead generation.',
    index: false,
  });

  return (
    <div className="min-h-screen flex items-center justify-center flex-col text-center space-y-6 bg-white">
      <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center">
        <ShieldAlert className="w-10 h-10 text-red-400" />
      </div>
      <div>
        <h1 className="text-5xl font-bold tracking-tight text-black mb-2">404</h1>
        <p className="text-gray-500 max-w-md mx-auto text-sm">
          The page you're looking for doesn't exist. Please return to the dashboard.
        </p>
      </div>
      <Link to="/" className="inline-block mt-4">
         <Button icon={<ArrowLeft className="w-4 h-4" />}>Return to Dashboard</Button>
      </Link>
    </div>
  );
}

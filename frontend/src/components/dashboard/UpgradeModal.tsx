/**
 * UpgradeModal — Plan Gate Dialog.
 *
 * Shown when a freelancer with a free plan enters the dashboard.
 * Offers two actions:
 *   - "Upgrade Now"   → navigates to /pricing
 *   - "Maybe Later"   → dismisses the dialog; skeleton view remains
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Lock, BarChart3, Users, Activity, X } from 'lucide-react';

interface UpgradeModalProps {
  onDismiss: () => void;
}

const FEATURES = [
  { icon: BarChart3, label: 'Real-time pipeline analytics' },
  { icon: Users,    label: 'Full lead database access' },
  { icon: Activity, label: 'Live scheduler & job control' },
  { icon: Zap,      label: 'AI outreach & email campaigns' },
];

export default function UpgradeModal({ onDismiss }: UpgradeModalProps) {
  const navigate = useNavigate();

  // Prevent background scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onDismiss]);

  const handleUpgrade = () => {
    onDismiss();
    navigate('/pricing');
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby="upgrade-modal-title"
    >
      {/* Semi-transparent overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onDismiss}
      />

      {/* Dialog card */}
      <div className="relative w-full max-w-md bg-white rounded-xl border border-gray-200 shadow-2xl animate-fade-in-up overflow-hidden">

        {/* Header accent bar */}
        <div className="h-1 w-full bg-black" />

        {/* Dismiss button */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 p-1.5 rounded-md text-gray-400 hover:text-black hover:bg-gray-100 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-8">
          {/* Icon + Badge */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 bg-black rounded-lg flex items-center justify-center flex-shrink-0">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-gray-100 rounded-full text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-1">
                <Zap className="w-3 h-3" /> Pro Feature
              </span>
              <p className="text-xs text-gray-400">Your current plan: Free</p>
            </div>
          </div>

          {/* Title */}
          <h2
            id="upgrade-modal-title"
            className="text-xl font-bold tracking-tight text-black mb-2"
          >
            Unlock Your Full Dashboard
          </h2>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            You're on the <strong>Free plan</strong>. Upgrade to <strong>Pro</strong> or{' '}
            <strong>Enterprise</strong> to access live data, pipeline controls, and AI-powered
            lead generation.
          </p>

          {/* Features list */}
          <ul className="space-y-2.5 mb-8">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3">
                <div className="w-7 h-7 bg-accents-1 border border-gray-200 rounded-md flex items-center justify-center flex-shrink-0">
                  <Icon className="w-3.5 h-3.5 text-black" />
                </div>
                <span className="text-sm text-gray-700">{label}</span>
              </li>
            ))}
          </ul>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleUpgrade}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              <Zap className="w-4 h-4" />
              Upgrade Now — View Plans
            </button>
            <button
              onClick={onDismiss}
              className="w-full py-2.5 px-6 text-sm text-gray-500 hover:text-black hover:bg-gray-50 rounded-lg transition-colors"
            >
              Maybe Later — Continue with Limited View
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

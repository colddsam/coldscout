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
  /**
   * Optional override for the description body. Used when the modal is
   * triggered by a backend 402 so the user sees the exact reason the
   * action was refused (e.g. "Triggering pipeline jobs requires a Pro
   * or Enterprise plan"). Falls back to the generic dashboard pitch.
   */
  reason?: string | null;
}

const FEATURES = [
  { icon: BarChart3, label: 'Real-time pipeline analytics' },
  { icon: Users,    label: 'Full lead database access' },
  { icon: Activity, label: 'Live scheduler & job control' },
  { icon: Zap,      label: 'AI outreach & email campaigns' },
];

export default function UpgradeModal({ onDismiss, reason }: UpgradeModalProps) {
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
      <div className="relative w-full max-w-md bg-surface-2 rounded-xl border border-white/10 shadow-[0_25px_65px_rgba(0,0,0,0.5)] animate-fade-in-up overflow-hidden">

        {/* Header accent bar */}
        <div className="h-1 w-full bg-white" />

        {/* Dismiss button */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 p-1.5 rounded-md text-[#8A8A8A] hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-8">
          {/* Icon + Badge */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
              <Lock className="w-5 h-5 text-black" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-white/5 border border-white/10 rounded-full text-[10px] font-semibold uppercase tracking-widest text-[#B0B0B0] mb-1">
                <Zap className="w-3 h-3" /> Pro Feature
              </span>
              <p className="text-xs text-[#8A8A8A]">Your current plan: Free</p>
            </div>
          </div>

          {/* Title */}
          <h2
            id="upgrade-modal-title"
            className="text-xl font-bold tracking-tight text-white mb-2"
          >
            Unlock Your Full Dashboard
          </h2>
          <p className="text-sm text-[#B0B0B0] mb-6 leading-relaxed">
            {reason ? (
              reason
            ) : (
              <>
                You're on the <strong className="text-white">Free plan</strong>. Upgrade to{' '}
                <strong className="text-white">Pro</strong> or{' '}
                <strong className="text-white">Enterprise</strong> to access live data, pipeline
                controls, and AI-powered lead generation.
              </>
            )}
          </p>

          {/* Features list */}
          <ul className="space-y-2.5 mb-8">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3">
                <div className="w-7 h-7 bg-white/5 border border-white/10 rounded-md flex items-center justify-center flex-shrink-0">
                  <Icon className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-sm text-[#C0C0C0]">{label}</span>
              </li>
            ))}
          </ul>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleUpgrade}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-white text-black rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              <Zap className="w-4 h-4" />
              Upgrade Now — View Plans
            </button>
            <button
              onClick={onDismiss}
              className="w-full py-2.5 px-6 text-sm text-[#B0B0B0] hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              Maybe Later — Continue with Limited View
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

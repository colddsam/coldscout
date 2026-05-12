/**
 * Billing & Subscription Management Page.
 *
 * Shows the user's current plan, subscription expiry, and payment history.
 * Allows upgrading, renewing, or cancelling the subscription.
 */
import { useState } from 'react';
import {
  CreditCard, Zap, Building2, CheckCircle2, XCircle,
  Clock, AlertTriangle, Receipt, ArrowUpRight, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import {
  useSubscription,
  useTransactions,
  useCheckout,
  useCancelSubscription,
} from '../hooks/useBilling';
import type { BillingPlan } from '../lib/api';
import { motion } from 'framer-motion';
import { pageTransition, fadeInUp } from '../lib/motion';

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatAmount(paise: number, currency = 'INR'): string {
  const amount = paise / 100;
  if (currency === 'INR') return `₹${amount.toLocaleString('en-IN')}`;
  return `${currency} ${amount.toLocaleString()}`;
}

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active:    { label: 'Active',    cls: 'bg-success/10 text-success border-success/25' },
    cancelled: { label: 'Cancelled', cls: 'bg-warning/10 text-warning border-warning/25' },
    expired:   { label: 'Expired',   cls: 'bg-danger/10 text-danger border-danger/25' },
    paid:      { label: 'Paid',      cls: 'bg-success/10 text-success border-success/25' },
    created:   { label: 'Pending',   cls: 'bg-white/[0.04] text-tertiary border-white/[0.1]' },
    failed:    { label: 'Failed',    cls: 'bg-danger/10 text-danger border-danger/25' },
  };
  const cfg = map[status ?? ''] ?? { label: status ?? '—', cls: 'bg-white/[0.04] text-tertiary border-white/[0.1]' };
  return (
    <span className={`inline-flex items-center h-[22px] px-2 rounded-full text-[10px] font-semibold border uppercase tracking-[0.06em] ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Plan card ────────────────────────────────────────────────────────────────

interface PlanCardProps {
  plan: 'free' | 'pro' | 'enterprise';
  isCurrentPlan: boolean;
  onUpgrade?: (plan: BillingPlan) => void;
  isLoading?: boolean;
}

function PlanCard({ plan, isCurrentPlan, onUpgrade, isLoading }: PlanCardProps) {
  const config = {
    free:       { label: 'Open Source', price: '₹0',        icon: CheckCircle2, desc: 'Download & self-host from GitHub Releases.' },
    pro:        { label: 'Pro',         price: '₹100/mo',   icon: Zap,          desc: 'Managed API + MCP Server. 2,000 leads / month.' },
    enterprise: { label: 'Enterprise',  price: '₹2,000/mo', icon: Building2,    desc: 'Dedicated instance + custom models.' },
  }[plan];

  const Icon = config.icon;

  return (
    <div className={`relative rounded-xl border p-5 transition-all duration-300 ${
      isCurrentPlan
        ? 'border-white/[0.22] bg-white/[0.04]'
        : 'border-white/[0.08] bg-surface-2 hover:border-white/[0.16]'
    }`}>
      {isCurrentPlan && (
        <span className="absolute -top-2.5 left-4 chip !bg-black !border-white/30 text-white">
          Current Plan
        </span>
      )}

      <div className="flex items-start justify-between mb-4">
        <div className="icon-bubble">
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-display-num text-[1.25rem] leading-none">
          {config.price}
        </span>
      </div>

      <p className="heading-card mb-1.5">{config.label}</p>
      <p className="text-meta leading-relaxed">{config.desc}</p>

      {!isCurrentPlan && plan !== 'free' && onUpgrade && (
        <button
          onClick={() => onUpgrade(plan as BillingPlan)}
          disabled={isLoading}
          className="mt-5 w-full h-9 rounded-lg text-[13px] font-semibold bg-white text-black hover:bg-[#EAEAEA] disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-1.5"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <>
              Upgrade to {config.label} <ArrowUpRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ── Cancel confirm dialog ──────────────────────────────────────────────────

function CancelDialog({
  expiresAt,
  onConfirm,
  onClose,
  isLoading,
}: {
  expiresAt?: string;
  onConfirm: () => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="elevated-panel p-5 max-w-sm w-full relative">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-danger/10 border border-danger/25 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-danger" />
          </div>
          <div className="min-w-0">
            <p className="heading-card">Cancel subscription?</p>
            <p className="text-meta mt-0.5">This action cannot be undone.</p>
          </div>
        </div>
        <p className="text-[13px] text-secondary mb-5 leading-relaxed">
          Your access continues until{' '}
          <span className="font-medium text-white">{formatDate(expiresAt)}</span>.
          After that, your account reverts to the Free plan.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="h-9 px-3.5 rounded-lg border border-white/[0.12] text-[13px] font-medium text-white hover:border-white/25 hover:bg-white/[0.04] transition-all"
          >
            Keep Plan
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="h-9 px-3.5 rounded-lg bg-white text-black text-[13px] font-medium hover:bg-[#EAEAEA] disabled:opacity-50 transition-all inline-flex items-center justify-center gap-1.5"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Cancel Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Billing() {
  const { user, syncUserToBackend } = useAuth();
  const { data: subscription, isLoading: subLoading } = useSubscription();
  const { data: transactions, isLoading: txLoading } = useTransactions();
  const { checkout } = useCheckout();
  const cancelMutation = useCancelSubscription();

  const [checkoutPlan, setCheckoutPlan] = useState<BillingPlan | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const currentPlan = user?.plan ?? 'free';
  const days = daysUntil(subscription?.current_period_end);

  const handleUpgrade = async (plan: BillingPlan) => {
    if (!user?.email) {
      toast.error('User session not found. Please log in again.');
      return;
    }
    setCheckoutPlan(plan);
    try {
      await checkout({
        plan,
        userEmail: user.email,
        userName: user.full_name || undefined,
        onSuccess: async () => {
          // Refresh user plan in auth context
          await syncUserToBackend();
        },
      });
    } finally {
      setCheckoutPlan(null);
    }
  };

  const handleCancelConfirm = async () => {
    await cancelMutation.mutateAsync(undefined);
    setShowCancelDialog(false);
  };

  return (
    <motion.div className="max-w-4xl mx-auto space-y-7" initial="initial" animate="animate" variants={pageTransition}>
      {/* Header */}
      <motion.div variants={fadeInUp} initial="hidden" animate="visible">
        <p className="eyebrow mb-1.5">Account</p>
        <div className="flex items-center gap-2.5">
          <CreditCard className="w-4 h-4 text-tertiary" />
          <h1 className="heading-page">Billing</h1>
        </div>
        <p className="text-[13px] text-tertiary mt-1.5">Manage your subscription and payment history.</p>
      </motion.div>

      {/* Subscription Status Banner */}
      {subscription?.has_subscription && (
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className={`rounded-xl border p-4 flex items-center justify-between gap-4 flex-wrap ${
            subscription.status === 'active'
              ? 'border-white/[0.18] bg-white/[0.04]'
              : subscription.status === 'cancelled'
              ? 'border-warning/30 bg-warning/[0.05]'
              : 'border-danger/30 bg-danger/[0.05]'
          }`}
        >
          <div className="flex items-center gap-3">
            {subscription.status === 'active' ? (
              <span className="halo-dot text-success" />
            ) : (
              <XCircle className="w-4 h-4 text-warning" />
            )}
            <div>
              <p className="heading-section">
                {subscription.status === 'active'
                  ? `${subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)} Plan · Active`
                  : `${subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)} · Cancellation Scheduled`}
              </p>
              <p className="text-meta mt-0.5">
                {subscription.status === 'cancelled'
                  ? `Access ends on ${formatDate(subscription.current_period_end)}`
                  : days !== null
                  ? days === 0
                    ? 'Expires today'
                    : `${days} day${days !== 1 ? 's' : ''} remaining · renews ${formatDate(subscription.current_period_end)}`
                  : `Expires ${formatDate(subscription.current_period_end)}`}
              </p>
            </div>
          </div>
          {subscription.status === 'active' && (
            <span className="text-[11px] text-tertiary font-mono inline-flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              {formatDate(subscription.current_period_start)} – {formatDate(subscription.current_period_end)}
            </span>
          )}
        </motion.div>
      )}

      {/* Plan Selection */}
      <section>
        <p className="eyebrow mb-3">Plans</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {(['free', 'pro', 'enterprise'] as const).map((p) => (
            <PlanCard
              key={p}
              plan={p}
              isCurrentPlan={currentPlan === p}
              onUpgrade={handleUpgrade}
              isLoading={checkoutPlan === p}
            />
          ))}
        </div>

        {subscription?.has_subscription && subscription.status === 'active' && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => setShowCancelDialog(true)}
              className="text-[12px] text-danger hover:text-danger/80 underline underline-offset-4 transition-colors"
            >
              Cancel subscription
            </button>
          </div>
        )}
      </section>

      {subscription?.status === 'cancelled' && (
        <div className="rounded-xl border border-warning/30 bg-warning/[0.05] p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <p className="heading-section">Subscription cancelled</p>
            <p className="text-meta mt-0.5 leading-relaxed">
              You can re-subscribe at any time. If you re-subscribe before{' '}
              <span className="font-medium text-secondary">{formatDate(subscription.current_period_end)}</span>,
              your access continues uninterrupted.
            </p>
          </div>
        </div>
      )}

      {/* Transaction History */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Receipt className="w-3.5 h-3.5 text-tertiary" />
          <p className="eyebrow">Payment History</p>
        </div>

        {txLoading || subLoading ? (
          <div className="rounded-xl border border-white/[0.08] p-8 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-tertiary" />
          </div>
        ) : transactions && transactions.length > 0 ? (
          <div className="rounded-xl border border-white/[0.08] overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto] text-[10px] font-semibold text-tertiary uppercase tracking-[0.12em] bg-black/40 border-b border-white/[0.06] px-4 py-2.5 gap-4">
              <span>Plan</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Status</span>
              <span className="text-right">Date</span>
            </div>
            {transactions.map((tx, i) => (
              <div
                key={tx.id}
                className={`grid grid-cols-[1fr_auto_auto_auto] items-center px-4 py-3 text-[13px] gap-4 ${
                  i < transactions.length - 1 ? 'border-b border-white/[0.05]' : ''
                } hover:bg-white/[0.025] transition-colors`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-white capitalize">{tx.plan} Plan</p>
                  <p className="text-[10px] text-tertiary font-mono truncate">{tx.razorpay_order_id}</p>
                </div>
                <span className="text-[13px] font-semibold text-white text-right tabular-nums">
                  {formatAmount(tx.amount, tx.currency)}
                </span>
                <span className="text-right">
                  <StatusBadge status={tx.status} />
                </span>
                <span className="text-[11px] text-tertiary whitespace-nowrap text-right font-mono">
                  {formatDate(tx.created_at)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Receipt className="w-7 h-7 text-tertiary mb-3" />
            <p className="heading-card mb-1">No payment history yet</p>
            <p className="text-meta">Payments will appear here after your first subscription.</p>
          </div>
        )}
      </section>

      {/* Cancel dialog */}
      {showCancelDialog && (
        <CancelDialog
          expiresAt={subscription?.current_period_end}
          onConfirm={handleCancelConfirm}
          onClose={() => setShowCancelDialog(false)}
          isLoading={cancelMutation.isPending}
        />
      )}
    </motion.div>
  );
}

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
    active:    { label: 'Active',    cls: 'bg-green-50 text-green-700 border-green-200' },
    cancelled: { label: 'Cancelled', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    expired:   { label: 'Expired',   cls: 'bg-red-50 text-red-600 border-red-200' },
    paid:      { label: 'Paid',      cls: 'bg-green-50 text-green-700 border-green-200' },
    created:   { label: 'Pending',   cls: 'bg-gray-50 text-gray-600 border-gray-200' },
    failed:    { label: 'Failed',    cls: 'bg-red-50 text-red-600 border-red-200' },
  };
  const cfg = map[status ?? ''] ?? { label: status ?? '—', cls: 'bg-gray-50 text-gray-600 border-gray-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
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
    free:       { label: 'Open Source', price: '₹0',       icon: CheckCircle2, desc: 'Self-hosted from GitHub',              color: 'gray' },
    pro:        { label: 'Pro',         price: '₹100/mo',   icon: Zap,          desc: 'Managed API + MCP Server (2,000 leads)', color: 'black' },
    enterprise: { label: 'Enterprise',  price: '₹2,000/mo', icon: Building2,    desc: 'Dedicated instance + custom models',     color: 'black' },
  }[plan];

  const Icon = config.icon;

  return (
    <div className={`relative rounded-xl border p-5 transition-all ${
      isCurrentPlan
        ? 'border-black bg-black text-white shadow-lg'
        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
    }`}>
      {isCurrentPlan && (
        <span className="absolute -top-3 left-4 bg-white text-black text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-gray-200 uppercase tracking-wider">
          Current Plan
        </span>
      )}

      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
          isCurrentPlan ? 'bg-white/10' : 'bg-gray-50 border border-gray-200'
        }`}>
          <Icon className={`w-4 h-4 ${isCurrentPlan ? 'text-white' : 'text-black'}`} />
        </div>
        <span className={`text-lg font-bold tracking-tight ${isCurrentPlan ? 'text-white' : 'text-black'}`}>
          {config.price}
        </span>
      </div>

      <p className={`text-sm font-semibold mb-1 ${isCurrentPlan ? 'text-white' : 'text-black'}`}>
        {config.label}
      </p>
      <p className={`text-xs ${isCurrentPlan ? 'text-gray-300' : 'text-secondary'}`}>
        {config.desc}
      </p>

      {!isCurrentPlan && plan !== 'free' && onUpgrade && (
        <button
          onClick={() => onUpgrade(plan as BillingPlan)}
          disabled={isLoading}
          className="mt-4 w-full py-2 rounded-lg text-xs font-semibold bg-black text-white hover:bg-gray-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <>
              Upgrade to {config.label} <ArrowUpRight className="w-3 h-3" />
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
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl p-6 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="font-semibold text-sm text-black">Cancel Subscription</p>
            <p className="text-xs text-secondary">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-secondary mb-5 leading-relaxed">
          Your access continues until{' '}
          <span className="font-medium text-black">{formatDate(expiresAt)}</span>.
          After that, your account reverts to the Free plan.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:border-black transition-colors"
          >
            Keep Plan
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
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
    <motion.div className="max-w-4xl mx-auto px-4 py-8 space-y-8" initial="initial" animate="animate" variants={pageTransition}>
      {/* Header */}
      <motion.div variants={fadeInUp} initial="hidden" animate="visible">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-lg bg-black flex items-center justify-center">
            <CreditCard className="w-4.5 h-4.5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-black">Billing</h1>
        </div>
        <p className="text-sm text-secondary ml-12">Manage your subscription and payment history.</p>
      </motion.div>

      {/* Subscription Status Banner */}
      {subscription?.has_subscription && (
        <motion.div variants={fadeInUp} initial="hidden" animate="visible" className={`rounded-xl border p-4 flex items-center justify-between ${
          subscription.status === 'active'
            ? 'bg-black text-white border-black'
            : subscription.status === 'cancelled'
            ? 'bg-amber-50 border-amber-200'
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-3">
            {subscription.status === 'active' ? (
              <CheckCircle2 className="w-5 h-5 text-white" />
            ) : (
              <XCircle className="w-5 h-5 text-amber-500" />
            )}
            <div>
              <p className={`text-sm font-semibold ${subscription.status === 'active' ? 'text-white' : 'text-black'}`}>
                {subscription.status === 'active'
                  ? `${subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)} Plan Active`
                  : `${subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)} — Cancellation Scheduled`}
              </p>
              <p className={`text-xs ${subscription.status === 'active' ? 'text-gray-300' : 'text-secondary'}`}>
                {subscription.status === 'cancelled'
                  ? `Access ends on ${formatDate(subscription.current_period_end)}`
                  : days !== null
                  ? days === 0
                    ? 'Expires today'
                    : `${days} day${days !== 1 ? 's' : ''} remaining — renews ${formatDate(subscription.current_period_end)}`
                  : `Expires ${formatDate(subscription.current_period_end)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {subscription.status === 'active' && (
              <>
                <Clock className="w-4 h-4 text-gray-300" />
                <span className="text-xs text-gray-300">
                  {formatDate(subscription.current_period_start)} – {formatDate(subscription.current_period_end)}
                </span>
              </>
            )}
          </div>
        </motion.div>
      )}

      {/* Plan Selection */}
      <section>
        <p className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">Plans</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

        {/* Cancel button — only shown for active non-free subscriptions */}
        {subscription?.has_subscription && subscription.status === 'active' && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => setShowCancelDialog(true)}
              className="text-xs text-red-500 hover:text-red-700 underline underline-offset-2 transition-colors"
            >
              Cancel subscription
            </button>
          </div>
        )}
      </section>

      {/* Renewal notice for cancelled */}
      {subscription?.status === 'cancelled' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-black">Subscription cancelled</p>
            <p className="text-xs text-secondary mt-0.5">
              You can re-subscribe at any time. If you re-subscribe before{' '}
              <span className="font-medium">{formatDate(subscription.current_period_end)}</span>,
              your access continues uninterrupted.
            </p>
          </div>
        </div>
      )}

      {/* Transaction History */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Receipt className="w-4 h-4 text-secondary" />
          <p className="text-xs font-semibold text-secondary uppercase tracking-wider">Payment History</p>
        </div>

        {txLoading || subLoading ? (
          <div className="rounded-xl border border-gray-200 p-8 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-secondary" />
          </div>
        ) : transactions && transactions.length > 0 ? (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto] text-[10px] font-semibold text-secondary uppercase tracking-wider bg-gray-50 border-b border-gray-100 px-4 py-2.5">
              <span>Plan</span>
              <span className="text-right pr-6">Amount</span>
              <span className="text-right pr-6">Status</span>
              <span className="text-right">Date</span>
            </div>
            {transactions.map((tx, i) => (
              <div
                key={tx.id}
                className={`grid grid-cols-[1fr_auto_auto_auto] items-center px-4 py-3 text-sm ${
                  i < transactions.length - 1 ? 'border-b border-gray-50' : ''
                } hover:bg-gray-50 transition-colors`}
              >
                <div>
                  <p className="font-medium text-black capitalize">{tx.plan} Plan</p>
                  <p className="text-[11px] text-subtle font-mono">{tx.razorpay_order_id}</p>
                </div>
                <span className="text-sm font-semibold text-black pr-6">
                  {formatAmount(tx.amount, tx.currency)}
                </span>
                <span className="pr-6">
                  <StatusBadge status={tx.status} />
                </span>
                <span className="text-xs text-secondary whitespace-nowrap">
                  {formatDate(tx.created_at)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 p-8 text-center">
            <Receipt className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-secondary">No payment history yet.</p>
            <p className="text-xs text-subtle mt-1">Payments will appear here after your first subscription.</p>
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

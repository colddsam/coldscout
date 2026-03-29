/**
 * Billing Hook.
 *
 * Provides React Query hooks for subscription data and payment mutations.
 * Handles loading Razorpay checkout.js and opening the payment modal.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  createPaymentOrder,
  verifyPayment,
  getSubscription,
  getTransactions,
  cancelSubscription,
  type BillingPlan,
} from '../lib/api';

// ── Razorpay script loader ─────────────────────────────────────────────────

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// ── Query hooks ────────────────────────────────────────────────────────────

export function useSubscription() {
  return useQuery({
    queryKey: ['subscription'],
    queryFn: getSubscription,
    staleTime: 60_000,
  });
}

export function useTransactions() {
  return useQuery({
    queryKey: ['billing-transactions'],
    queryFn: getTransactions,
    staleTime: 60_000,
  });
}

// ── Checkout ────────────────────────────────────────────────────────────────

interface CheckoutOptions {
  plan: BillingPlan;
  userEmail: string;
  userName?: string;
  /** Called after the subscription is successfully activated. */
  onSuccess?: (plan: BillingPlan, expiresAt: string) => void;
}

/**
 * Opens the Razorpay checkout modal for the given plan.
 *
 * Flow:
 *   1. Calls POST /billing/create-order → gets order_id + key_id
 *   2. Loads Razorpay checkout.js if not already loaded
 *   3. Opens modal
 *   4. On success, calls POST /billing/verify-payment
 *   5. Invalidates subscription cache + calls onSuccess callback
 */
export function useCheckout() {
  const queryClient = useQueryClient();

  const checkout = async ({ plan, userEmail, userName, onSuccess }: CheckoutOptions) => {
    // Step 1 — create server-side order
    let orderData;
    try {
      orderData = await createPaymentOrder(plan);
    } catch {
      toast.error('Could not initiate payment. Please try again.');
      return;
    }

    // Step 2 — load Razorpay script
    const loaded = await loadRazorpayScript();
    if (!loaded || !window.Razorpay) {
      toast.error('Payment gateway failed to load. Please check your connection.');
      return;
    }

    // Step 3 — open modal
    return new Promise<void>((resolve) => {
      const planLabel = plan === 'pro' ? 'Pro Plan' : 'Enterprise Plan';

      const rzp = new window.Razorpay({
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Cold Scout',
        description: `${planLabel} — Monthly`,
        image: '/favicon.svg',
        order_id: orderData.order_id,
        prefill: {
          email: userEmail,
          name: userName || '',
        },
        theme: { color: '#000000' },
        modal: {
          ondismiss: () => {
            toast('Payment cancelled.', { icon: '↩' });
            resolve();
          },
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          // Step 4 — verify with backend
          try {
            const result = await verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan,
            });

            // Step 5 — refresh subscription cache
            await queryClient.invalidateQueries({ queryKey: ['subscription'] });
            await queryClient.invalidateQueries({ queryKey: ['billing-transactions'] });

            toast.success(result.message || `${planLabel} activated!`);
            onSuccess?.(plan, result.plan_expires_at);
          } catch {
            toast.error('Payment verification failed. Please contact support.');
          }
          resolve();
        },
      });

      rzp.open();
    });
  };

  return { checkout };
}

// ── Cancel mutation ─────────────────────────────────────────────────────────

export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reason?: string) => cancelSubscription(reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      toast.success('Subscription cancelled. Access continues until the period ends.');
    },
    onError: () => {
      toast.error('Failed to cancel subscription. Please try again.');
    },
  });
}

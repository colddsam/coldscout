/**
 * Billing Hook.
 *
 * Provides React Query hooks for subscription data and payment mutations.
 * Handles loading Razorpay checkout.js and opening the payment modal.
 *
 * Platform Awareness:
 *   On web/PWA, the standard checkout.js modal is used.
 *   On native Capacitor builds (Android/iOS), the checkout is opened in an
 *   external system browser via @capacitor/browser to avoid WebView
 *   restrictions that block UPI intent switching (Google Pay, PhonePe, etc.).
 *
 * Back-Button Handling (Bug #4):
 *   When a payment modal is open on Android, the hardware back-button is
 *   intercepted via @capacitor/app to dismiss the modal instead of navigating
 *   backward or closing the app entirely.
 *
 * TODO (Production):
 *   - For production-grade native UPI support, integrate the Razorpay Capacitor
 *     Plugin (com.razorpay.cordova) which handles native intent switching.
 *   - For iOS App Store compliance with digital goods (policy 3.1.1), implement
 *     Native In-App Purchases (IAP) via RevenueCat or Capacitor IAP plugin.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import {
  createPaymentOrder,
  verifyPayment,
  getSubscription,
  getTransactions,
  cancelSubscription,
  type BillingPlan,
} from '../lib/api';
import { useAuth } from './useAuth';
import { useUserScope } from './useUserScope';

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

// ── Platform Detection ─────────────────────────────────────────────────────

/**
 * Returns true when running inside a Capacitor native shell (Android/iOS).
 * Web and PWA builds return false — they use the standard checkout.js modal.
 */
function isNativeMobile(): boolean {
  return Capacitor.isNativePlatform();
}

// ── Back-Button Guard ──────────────────────────────────────────────────────

/**
 * Registers an Android hardware back-button interceptor that calls the
 * provided `onBack` callback instead of letting the system close the app
 * or navigate backward through the React Router history.
 *
 * Returns a cleanup function that removes the listener.
 */
function registerBackButtonGuard(onBack: () => void): () => void {
  if (!isNativeMobile()) {
    // No-op on web — hardware back-button doesn't exist.
    return () => {};
  }

  const handle = App.addListener('backButton', () => {
    // Always intercept when a modal is open.
    // ev.canGoBack is true when the WebView has history, but we don't
    // want to navigate — we want to close the payment modal.
    onBack();
  });

  return () => {
    handle.then((h) => h.remove());
  };
}

// ── Query hooks ────────────────────────────────────────────────────────────

export function useSubscription() {
  const scope = useUserScope();
  return useQuery({
    queryKey: ['subscription', scope],
    queryFn: getSubscription,
    enabled: scope !== 'anon',
    staleTime: 60_000,
  });
}

export function useTransactions() {
  const scope = useUserScope();
  return useQuery({
    queryKey: ['billing-transactions', scope],
    queryFn: getTransactions,
    enabled: scope !== 'anon',
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
 * Opens the Razorpay checkout for the given plan.
 *
 * Flow (Web / PWA):
 *   1. Calls POST /billing/create-order → gets order_id + key_id
 *   2. Loads Razorpay checkout.js if not already loaded
 *   3. Opens modal with Android back-button guard
 *   4. On success, calls POST /billing/verify-payment
 *   5. Invalidates subscription cache + calls onSuccess callback
 *
 * Flow (Native Android / iOS):
 *   1. Same server-side order creation
 *   2. Opens Razorpay hosted checkout in external system browser via
 *      @capacitor/browser — this avoids WebView UPI intent restrictions
 *   3. Payment verification is handled server-side via Razorpay webhooks
 *   4. Refreshes subscription cache when user returns to the app
 */
export function useCheckout() {
  const queryClient = useQueryClient();
  const { syncUserToBackend } = useAuth();
  const scope = useUserScope();

  const checkout = async ({ plan, userEmail, userName, onSuccess }: CheckoutOptions) => {
    // Step 1 — create server-side order
    let orderData;
    try {
      orderData = await createPaymentOrder(plan);
    } catch {
      toast.error('Could not initiate payment. Please try again.');
      return;
    }

    // ── Native path: external browser checkout ─────────────────────────
    //
    // On Android/iOS we open Razorpay's hosted-checkout page in an in-app
    // browser (@capacitor/browser → Chrome Custom Tabs / SFSafariViewController)
    // because the standard checkout.js WebView blocks UPI intent switching.
    //
    // The hosted checkout has no native callback into the app, so we
    // detect payment completion through three independent signals and
    // act on whichever fires first:
    //   1. Razorpay webhook → backend updates user.plan → we poll
    //      /billing/subscription while the browser is open.
    //   2. User closes the browser manually → browserFinished event.
    //   3. The OS returns focus to the app → appStateChange.isActive.
    //
    // When activation is detected we close the browser (iOS only — on
    // Android the OS owns the Custom Tab, but Browser.close() is a
    // no-op there), surface a success toast, and refresh React Query
    // state so the UI flips out of the Razorpay screen immediately.
    if (isNativeMobile()) {
      const planLabel = plan === 'pro' ? 'Pro Plan' : 'Enterprise Plan';

      try {
        const checkoutUrl = new URL('https://api.razorpay.com/v1/checkout/embedded');
        checkoutUrl.searchParams.set('key_id', orderData.key_id);
        checkoutUrl.searchParams.set('order_id', orderData.order_id);
        checkoutUrl.searchParams.set('amount', String(orderData.amount));
        checkoutUrl.searchParams.set('currency', orderData.currency);
        checkoutUrl.searchParams.set('name', 'Cold Scout');
        checkoutUrl.searchParams.set('description', `${planLabel} — Monthly`);
        checkoutUrl.searchParams.set('prefill[email]', userEmail);
        if (userName) {
          checkoutUrl.searchParams.set('prefill[name]', userName);
        }

        // Shared completion state — guards against duplicate toasts when
        // multiple signals fire (e.g. poll succeeds, then user also
        // closes the browser, then the app comes back to foreground).
        let settled = false;
        let pollHandle: ReturnType<typeof setInterval> | null = null;
        let browserFinishedListener: Awaited<ReturnType<typeof Browser.addListener>> | null = null;
        let appStateListener: Awaited<ReturnType<typeof App.addListener>> | null = null;

        const cleanup = async () => {
          if (pollHandle) {
            clearInterval(pollHandle);
            pollHandle = null;
          }
          if (browserFinishedListener) {
            await browserFinishedListener.remove();
            browserFinishedListener = null;
          }
          if (appStateListener) {
            await appStateListener.remove();
            appStateListener = null;
          }
        };

        const refreshState = async () => {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['subscription', scope] }),
            queryClient.invalidateQueries({ queryKey: ['billing-transactions', scope] }),
            syncUserToBackend(),
          ]);
        };

        const finishAsSuccess = async () => {
          if (settled) return;
          settled = true;
          await refreshState();
          // iOS in-app browser supports programmatic close. On Android
          // Chrome Custom Tabs ignore close() but the user is already
          // back in the app once activation is detected.
          try {
            await Browser.close();
          } catch {
            /* no-op — close is best-effort */
          }
          toast.success(`${planLabel} activated!`);
          onSuccess?.(plan, '');
          await cleanup();
        };

        // ── Signal 1: poll /billing/subscription every 3s while the
        // browser is open. Razorpay webhooks normally update the plan
        // within seconds of capture.
        pollHandle = setInterval(async () => {
          if (settled) return;
          try {
            const sub = await getSubscription();
            if (sub?.plan === plan && sub?.status === 'active') {
              await finishAsSuccess();
            }
          } catch {
            /* polling is best-effort; ignore transient failures */
          }
        }, 3000);

        // Stop polling after 5 minutes regardless — avoid running
        // forever if the user abandons the flow.
        setTimeout(() => {
          if (!settled && pollHandle) {
            clearInterval(pollHandle);
            pollHandle = null;
          }
        }, 5 * 60 * 1000);

        // ── Signal 2: user closes the browser tab.
        browserFinishedListener = await Browser.addListener('browserFinished', async () => {
          if (settled) return;
          // Re-check subscription one more time before assuming
          // the user cancelled — the webhook may have just landed.
          await refreshState();
          try {
            const sub = await getSubscription();
            if (sub?.plan === plan && sub?.status === 'active') {
              await finishAsSuccess();
              return;
            }
          } catch {
            /* fall through to cancellation */
          }
          settled = true;
          toast('Payment cancelled.', { icon: '↩' });
          await cleanup();
        });

        // ── Signal 3: app returns to foreground (covers cases where
        // the browserFinished event is missed, e.g. user switches apps).
        appStateListener = await App.addListener('appStateChange', async (state) => {
          if (state.isActive && !settled) {
            await refreshState();
            try {
              const sub = await getSubscription();
              if (sub?.plan === plan && sub?.status === 'active') {
                await finishAsSuccess();
              }
            } catch {
              /* keep polling — don't settle as cancelled here */
            }
          }
        });

        await Browser.open({ url: checkoutUrl.toString(), presentationStyle: 'popover' });
      } catch {
        toast.error('Could not open payment page. Please try again.');
      }
      return;
    }

    // ── Web / PWA path: standard checkout.js modal ─────────────────────

    // Step 2 — load Razorpay script
    const loaded = await loadRazorpayScript();
    if (!loaded || !window.Razorpay) {
      toast.error('Payment gateway failed to load. Please check your connection.');
      return;
    }

    // Step 3 — open modal with back-button guard
    return new Promise<void>((resolve) => {
      const planLabel = plan === 'pro' ? 'Pro Plan' : 'Enterprise Plan';

      // Register back-button guard before opening the modal.
      // On web this is a no-op; on native it prevents app exit.
      let removeBackGuard: (() => void) | null = null;

      const cleanup = () => {
        if (removeBackGuard) {
          removeBackGuard();
          removeBackGuard = null;
        }
      };

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
            cleanup();
            toast('Payment cancelled.', { icon: '↩' });
            resolve();
          },
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          cleanup();
          // Step 4 — verify with backend
          try {
            const result = await verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan,
            });

            // Step 5 — refresh subscription cache and auth user state so
            // hasPaidPlan updates immediately without requiring a re-login
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['subscription', scope] }),
              queryClient.invalidateQueries({ queryKey: ['billing-transactions', scope] }),
              syncUserToBackend(),
            ]);

            toast.success(result.message || `${planLabel} activated!`);
            onSuccess?.(plan, result.plan_expires_at);
          } catch {
            toast.error('Payment verification failed. Please contact support.');
          }
          resolve();
        },
      });

      // Wire up back-button guard: pressing Android back closes the modal
      // instead of navigating away or closing the app.
      removeBackGuard = registerBackButtonGuard(() => {
        rzp.close();
        // The ondismiss handler above will run, calling cleanup() and resolve().
      });

      rzp.open();
    });
  };

  return { checkout };
}

// ── Cancel mutation ─────────────────────────────────────────────────────────

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  const scope = useUserScope();

  return useMutation({
    mutationFn: (reason?: string) => cancelSubscription(reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription', scope] });
      toast.success('Subscription cancelled. Access continues until the period ends.');
    },
    onError: () => {
      toast.error('Failed to cancel subscription. Please try again.');
    },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getInbox, respondToThread, updateThreadIntent, type IntentLabel } from '../lib/api';
import toast from 'react-hot-toast';

/**
 * Fetches the AI-classified inbox of prospect reply threads.
 *
 * Supports optional filtering by intent label (e.g., `interested`, `not_interested`)
 * and by whether a thread has already been responded to. This powers the Inbox page's
 * filtering controls, helping operators triage high-priority conversations first.
 *
 * The query is retried 0 times to surface IMAP connection failures immediately
 * rather than silently retrying and masking the error.
 *
 * @param params - Optional filters: `intent` and `responded` flag.
 * @returns TanStack Query result with an array of inbox thread objects.
 *
 * @example
 * const { data } = useInbox({ intent: 'interested', responded: false });
 */
export function useInbox(params?: { intent?: IntentLabel; responded?: boolean }) {
  return useQuery({
    queryKey: ['inbox', params],
    queryFn: () => getInbox(params),
    // Don't retry on failure — IMAP errors should surface immediately to the user
    retry: false,
  });
}

/**
 * Mutation hook for sending a manual reply to a specific inbox thread.
 *
 * Wraps the respond-to-thread API call. On success, the inbox cache is invalidated
 * so the thread's `responded` flag updates in the UI without a manual refresh.
 *
 * @returns TanStack Mutation object — call `.mutate({ id, body })`.
 *
 * @example
 * const respond = useRespondToThread();
 * respond.mutate({ id: thread.id, body: 'Thank you for your interest!' });
 */
export function useRespondToThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => respondToThread(id, body),
    onSuccess: () => {
      toast.success('Response sent successfully');
      qc.invalidateQueries({ queryKey: ['inbox'] });
    },
    onError: (err: Error) => {
      toast.error(`Send failed: ${err.message}`);
    },
  });
}

/**
 * Mutation hook for correcting the AI's intent classification on a reply thread.
 *
 * The AI classifies incoming replies automatically, but it can occasionally
 * misclassify ambiguous responses. This hook allows operators to manually override
 * the label (e.g., changing `not_interested` to `pricing_inquiry`) so downstream
 * automations and analytics reflect the correct intent.
 *
 * @returns TanStack Mutation object — call `.mutate({ id, intent })`.
 */
export function useUpdateThreadIntent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, intent }: { id: string; intent: IntentLabel }) => updateThreadIntent(id, intent),
    onSuccess: () => {
      toast.success('Intent updated');
      qc.invalidateQueries({ queryKey: ['inbox'] });
    },
    onError: (err: Error) => {
      toast.error(`Intent update failed: ${err.message}`);
    },
  });
}

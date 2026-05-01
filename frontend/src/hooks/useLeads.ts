import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getLeads,
  getLead,
  updateLead,
  deleteLead,
  getLeadOutreachState,
  triggerLeadOutreach,
  unlockLeadOutreach,
  getLeadWhatsappLink,
  type LeadOutreachState,
} from '../lib/api';
import toast from 'react-hot-toast';

/**
 * Fetches a paginated, filtered list of leads from the backend.
 *
 * Uses TanStack Query to automatically cache results by the full set of filter
 * parameters. Any change to `page`, `status`, `city`, or `category` triggers a
 * fresh network request, keeping the table view always in sync.
 *
 * @param params - Filter and pagination options forwarded to the API.
 * @returns TanStack Query result containing `data.leads`, `data.total`, `data.pages`, and loading state.
 *
 * @example
 * const { data, isLoading } = useLeads({ page: 1, limit: 25, status: 'qualified' });
 */
export function useLeads(params: {
  page?: number;
  limit?: number;
  status?: string;
  country?: string;
  country_code?: string;
  region?: string;
  city?: string;
  category?: string;
}) {
  return useQuery({
    queryKey: ['leads', params],
    queryFn: () => getLeads(params),
  });
}

/**
 * Fetches the full detail record for a single lead by its database ID.
 *
 * The query is disabled when `id` is falsy (e.g. the route hasn't hydrated
 * `:id` yet), preventing a spurious API call on initial render.
 *
 * @param id - The UUID of the lead to fetch.
 * @returns TanStack Query result with the full `Lead` object.
 */
export function useLead(id: string) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: () => getLead(id),
    // Guard: only fire the request once a valid lead ID is available
    enabled: !!id,
  });
}

/**
 * Mutation hook for updating a lead's status or manual notes.
 *
 * After a successful update, we invalidate both the list cache (`['leads']`)
 * and the individual detail cache (`['lead']`) so that any open view immediately
 * reflects the change without requiring a full page reload.
 *
 * @returns TanStack Mutation object — call `.mutate({ id, payload })` to trigger.
 *
 * @example
 * const updateLead = useUpdateLead();
 * updateLead.mutate({ id: lead.id, payload: { status: 'qualified' } });
 */
export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { status?: string; notes?: string } }) =>
      updateLead(id, payload),
    onSuccess: () => {
      toast.success('Lead updated successfully');
      // Bust both the list and detail caches so all views are fresh
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead'] });
    },
    onError: (err: Error) => {
      toast.error(`Update failed: ${err.message}`);
    },
  });
}

/**
 * Mutation hook for permanently deleting a lead record.
 *
 * This is a destructive, irreversible operation. On success the list cache is
 * invalidated so the deleted row disappears from the CRM table immediately.
 * A confirmation modal in `LeadDetail.tsx` should gate this mutation.
 *
 * @returns TanStack Mutation object — call `.mutate(id)` to trigger deletion.
 */
export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLead(id),
    onSuccess: () => {
      toast.success('Lead deleted successfully');
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (err: Error) => {
      toast.error(`Deletion failed: ${err.message}`);
    },
  });
}

/**
 * Per-lead manual outreach button state.
 *
 * Polls every 4 seconds while a job is queued or running so the UI flips
 * automatically once the worker finishes. Idle (eligible / locked / etc.)
 * leads keep a much longer cache to avoid hammering the API from the
 * Leads list, where dozens of these hooks may mount at once.
 */
export function useLeadOutreachState(id: string, enabled: boolean = true) {
  return useQuery<LeadOutreachState>({
    queryKey: ['lead-outreach-state', id],
    queryFn: () => getLeadOutreachState(id),
    enabled: enabled && !!id,
    // Match the cadence to the state: keep tabs on jobs currently in
    // flight, but back off once the lead is settled.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return data.button_state === 'in_flight' ? 4000 : false;
    },
    staleTime: 8000,
  });
}

/**
 * Triggers the single-lead outreach job. Optimistically marks the local
 * state as ``in_flight`` so the button switches to "Queued…" instantly,
 * then refetches to settle on the backend's authoritative payload.
 */
export function useTriggerLeadOutreach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => triggerLeadOutreach(id),
    onSuccess: (data, id) => {
      qc.setQueryData(['lead-outreach-state', id], data);
      qc.invalidateQueries({ queryKey: ['lead-outreach-state', id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead', id] });
      toast.success('Outreach queued — running on the next free slot.');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to trigger outreach');
    },
  });
}

/**
 * Unlocks a lead so its Run button becomes available again. Server enforces
 * that no manual job is currently in flight before allowing the reset.
 */
export function useUnlockLeadOutreach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unlockLeadOutreach(id),
    onSuccess: (data, id) => {
      qc.setQueryData(['lead-outreach-state', id], data);
      qc.invalidateQueries({ queryKey: ['lead-outreach-state', id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead', id] });
      toast.success('Lead unlocked — ready to send again.');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to unlock lead');
    },
  });
}

/**
 * Lazily fetches a wa.me deep link for a phone-qualified lead.
 *
 * The query is left in a manual-only mode (``enabled=false``) so it only
 * fires when the user actually clicks the WhatsApp button — assembling the
 * personalized message body is cheap but we don't need to do it for every
 * row in the table on render.
 */
export function useLeadWhatsappLink(id: string) {
  return useQuery({
    queryKey: ['lead-whatsapp-link', id],
    queryFn: () => getLeadWhatsappLink(id),
    enabled: false,
  });
}

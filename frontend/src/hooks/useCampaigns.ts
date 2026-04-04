import { useQuery } from '@tanstack/react-query';
import { getCampaigns, getCampaign, getCampaignStats } from '../lib/api';

/**
 * Fetches the list of all outreach campaigns from the backend.
 *
 * Returns a high-level summary for each campaign (name, status, sent count).
 * Used by the Campaigns list page to give operators a quick health overview
 * across all active sequences.
 *
 * @returns TanStack Query result with an array of `Campaign` objects.
 */
export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: getCampaigns,
  });
}

/**
 * Fetches the full details of a single campaign by its ID.
 *
 * The query is disabled while `id` is empty to avoid firing a request before
 * the route parameter has resolved (e.g., on initial render or a broken URL).
 *
 * @param id - The UUID of the campaign to fetch.
 * @returns TanStack Query result with the full `Campaign` detail object.
 */
export function useCampaign(id: string) {
  return useQuery({
    queryKey: ['campaign', id],
    queryFn: () => getCampaign(id),
    enabled: !!id,
  });
}

/**
 * Fetches aggregate performance statistics for a single campaign.
 *
 * Returns metrics like open rate, click rate, and reply rate. Used by the
 * campaign detail page to render the analytics breakdown charts. Kept as a
 * separate query from `useCampaign` so the stats can show a loading skeleton
 * independently while the rest of the page renders.
 *
 * @param id - The UUID of the campaign to get stats for.
 * @returns TanStack Query result with campaign aggregated statistics.
 */
export function useCampaignStats(id: string) {
  return useQuery({
    queryKey: ['campaign-stats', id],
    queryFn: () => getCampaignStats(id),
    enabled: !!id,
  });
}

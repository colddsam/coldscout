import { useQuery } from '@tanstack/react-query';
import { getCampaigns, getCampaign, getCampaignStats } from '../lib/api';
import { useUserScope } from './useUserScope';

/**
 * Fetches the list of all outreach campaigns owned by the current user.
 *
 * Returns a high-level summary for each campaign (name, status, sent count).
 * Used by the Campaigns list page to give operators a quick health overview
 * across their active sequences.
 *
 * The query key is namespaced by ``useUserScope()`` so a cached entry from
 * user A can never satisfy a fetch for user B on the same device.
 *
 * @returns TanStack Query result with an array of `Campaign` objects.
 */
export function useCampaigns() {
  const scope = useUserScope();
  return useQuery({
    queryKey: ['campaigns', scope],
    queryFn: getCampaigns,
    enabled: scope !== 'anon',
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
  const scope = useUserScope();
  return useQuery({
    queryKey: ['campaign', scope, id],
    queryFn: () => getCampaign(id),
    enabled: !!id && scope !== 'anon',
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
  const scope = useUserScope();
  return useQuery({
    queryKey: ['campaign-stats', scope, id],
    queryFn: () => getCampaignStats(id),
    enabled: !!id && scope !== 'anon',
  });
}

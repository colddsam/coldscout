import { useQuery } from '@tanstack/react-query';
import { getReports } from '../lib/api';
import { useUserScope } from './useUserScope';

/**
 * Fetches all daily pipeline reports for the Analytics page.
 *
 * The reports endpoint returns an array of daily summary objects, each containing
 * aggregate counts for discovered leads, qualified leads, emails sent, opens, and
 * replies. The Analytics page uses this data to render trend charts and track
 * the system's performance over time.
 *
 * Cache key is per-user via ``useUserScope`` — reports are scoped to the
 * calling freelancer on the backend, so the cache must be too, otherwise a
 * previous user's analytics would briefly render after a login switch.
 *
 * @returns TanStack Query result with an array of `Report` objects sorted by date descending.
 *
 * @example
 * const { data: reports, isLoading } = useAnalytics();
 * // reports[0] contains the most recent day's stats
 */
export function useAnalytics() {
  const scope = useUserScope();
  return useQuery({
    queryKey: ['analytics', scope],
    queryFn: getReports,
    enabled: scope !== 'anon',
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getHealth, getJobsConfig, updateJobsConfig, holdSystem, resumeSystem } from '../lib/api';
import toast from 'react-hot-toast';

/**
 * Polls the `/health` endpoint to check backend connectivity and system status.
 *
 * Defaults to re-fetching every 60 seconds so the Overview page stays aware of
 * any downtime without hammering the server. Increasing frequency (e.g., 10s)
 * is appropriate on the Settings page where users are actively managing state.
 *
 * @param {number} [refetchInterval=60000] - Polling cadence in milliseconds.
 * @returns {import('@tanstack/react-query').QueryResult} TanStack Query result with backend health data.
 */
export function useHealth(refetchInterval?: number) {
  return useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: refetchInterval ?? 60000,
  });
}

/**
 * Mutation hook for toggling the global pipeline production switch.
 *
 * This is the top-level kill-switch — calling `hold` stops all scheduled pipeline
 * jobs immediately by updating the `PRODUCTION_STATUS` env variable. Calling
 * `resume` re-enables them. This is intentionally separate from per-job config
 * so it can act as an emergency brake.
 *
 * @returns {import('@tanstack/react-query').MutationOptions} TanStack Mutation object — call `.mutate('hold')` or `.mutate('resume')`.
 *
 * @example
 * const toggle = useSystemToggle();
 * toggle.mutate('hold');   // Emergency stop
 * toggle.mutate('resume'); // Bring it back online
 */
export function useSystemToggle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: 'hold' | 'resume') =>
      action === 'hold' ? holdSystem() : resumeSystem(),
    onSuccess: (_data, action) => {
      toast.success(`System ${action === 'hold' ? 'paused' : 'resumed'} successfully`);
      // Refresh health so the status indicator reflects the new state immediately
      qc.invalidateQueries({ queryKey: ['health'] });
    },
    onError: (err: Error) => {
      toast.error(`System toggle failed: ${err.message}`);
    },
  });
}

/**
 * Fetches the current `jobs_config.json` content from the backend.
 *
 * This config drives the per-stage granular scheduler control. Every job has a
 * `status` (`RUN`/`HOLD`) and a cron `schedule`. Fetching it here makes the
 * Scheduler page's form inputs controlled and always reflect the server's truth.
 *
 * @returns {import('@tanstack/react-query').QueryResult} TanStack Query result with the full jobs configuration object.
 */
export function useConfigJobs() {
  return useQuery({
    queryKey: ['jobs-config'],
    queryFn: getJobsConfig,
  });
}

/**
 * Mutation hook for persisting changes to `jobs_config.json` on the server.
 *
 * This is used by the Scheduler page to save per-job schedule and status changes.
 * On success the cache is invalidated so the form re-hydrates with the confirmed
 * server state, preventing stale data from misleading the operator.
 *
 * @returns {import('@tanstack/react-query').MutationOptions} TanStack Mutation object — call `.mutate(config)` with the full updated config object.
 */
export function useUpdateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: Record<string, unknown>) => updateJobsConfig(config),
    onSuccess: () => {
      toast.success('Config saved');
      qc.invalidateQueries({ queryKey: ['jobs-config'] });
    },
    onError: (err: Error) => {
      toast.error(`Config save failed: ${err.message}`);
    },
  });
}
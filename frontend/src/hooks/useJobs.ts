import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getJobsConfig, updateJobsConfig } from '../lib/api';
import toast from 'react-hot-toast';

/**
 * Fetches the live `jobs_config.json` content and polls every 30 seconds.
 *
 * This hook is used by the Scheduler page to read the real-time status and
 * cron schedule of every pipeline stage. Polling ensures that if another
 * admin session updates the config, this view stays in sync automatically.
 *
 * @returns TanStack Query result with the keyed job configuration object.
 *
 * @example
 * const { data: config, isLoading } = useJobsConfig();
 * // config looks like: { discovery: { status: 'RUN', schedule: '0 9 * * 1-5' }, ... }
 */
export function useJobsConfig() {
  return useQuery({
    queryKey: ['jobs-config'],
    queryFn: getJobsConfig,
    // Poll every 30s to keep the Scheduler page live without manual refreshes
    refetchInterval: 30000,
  });
}

/**
 * Mutation hook for saving updated job schedules and status flags to the server.
 *
 * This sends the entire config object to the API, which persists it to
 * `config/jobs_config.json`. The APScheduler on the backend picks up changes
 * on its next polling cycle (typically within 60 seconds). This non-disruptive
 * hot-reload means schedules can be changed without a server restart.
 *
 * @returns TanStack Mutation object — call `.mutate(config)` with the full updated config.
 *
 * @example
 * const updateConfig = useUpdateJobsConfig();
 * updateConfig.mutate({ ...existingConfig, discovery: { status: 'HOLD', schedule: '0 9 * * 1-5' } });
 */
export function useUpdateJobsConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: Record<string, unknown>) => updateJobsConfig(config),
    onSuccess: () => {
      toast.success('Job config updated. Scheduler will sync within 60s.');
      qc.invalidateQueries({ queryKey: ['jobs-config'] });
    },
    onError: (err: Error) => {
      toast.error(`Config update failed: ${err.message}`);
    },
  });
}

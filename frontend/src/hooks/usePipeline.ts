import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPipelineStatus, triggerPipeline, type PipelineStage } from '../lib/api';
import toast from 'react-hot-toast';

/**
 * Polls the backend for real-time pipeline status every 30 seconds (default).
 *
 * The polling interval helps the Overview and Pipeline pages act like live
 * dashboards — they automatically refresh without requiring manual page reloads.
 * The interval can be overridden when a faster refresh is needed (e.g., 5000ms
 * immediately after triggering a pipeline stage).
 *
 * @param refetchInterval - How often to re-fetch in milliseconds. Defaults to 30,000 (30s).
 * @returns TanStack Query result with the current `PipelineStatus` payload.
 *
 * @example
 * // Poll every 5 seconds right after triggering a stage
 * const { data } = usePipelineStatus(5000);
 */
export function usePipelineStatus(refetchInterval?: number) {
  return useQuery({
    queryKey: ['pipeline-status'],
    queryFn: getPipelineStatus,
    refetchInterval: refetchInterval ?? 30000,
  });
}

/**
 * Mutation hook for manually triggering a specific pipeline stage via the API.
 *
 * After a successful trigger, the pipeline-status cache is invalidated so the
 * live status card updates within the next polling cycle. A success/error toast
 * gives the operator immediate visual feedback.
 *
 * @returns TanStack Mutation object — call `.mutate(stage)` where `stage` is a
 *   valid `PipelineStage` string (e.g., `'discovery'`, `'qualification'`, `'outreach'`).
 *
 * @example
 * const trigger = useTriggerPipeline();
 * trigger.mutate('discovery');
 */
export function useTriggerPipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stage: PipelineStage) => triggerPipeline(stage),
    onSuccess: (_data, stage) => {
      toast.success(`Pipeline stage "${stage}" triggered successfully`);
      qc.invalidateQueries({ queryKey: ['pipeline-status'] });
    },
    onError: (err: Error) => {
      toast.error(`Pipeline trigger failed: ${err.message}`);
    },
  });
}

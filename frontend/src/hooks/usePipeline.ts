import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPipelineStatus,
  getPipelineHistory,
  triggerPipeline,
  type PipelineStage,
  type PipelineStatusResponse,
} from '../lib/api';
import toast from 'react-hot-toast';
import { useUserScope } from './useUserScope';

/**
 * Polls the backend for real-time pipeline status.
 * Includes per-stage active_stages map for granular UI locking.
 *
 * Pipeline status surfaces the calling user's per-stage state (admins also
 * receive aggregated info), so the cache key is per-user — otherwise a
 * previous user's stage map could flash for the new user on login.
 */
export function usePipelineStatus(refetchInterval?: number) {
  const scope = useUserScope();
  return useQuery({
    queryKey: ['pipeline-status', scope],
    queryFn: getPipelineStatus,
    enabled: scope !== 'anon',
    refetchInterval: refetchInterval ?? 30000,
  });
}

/**
 * Fetches persistent pipeline job history for the log panel.
 */
export function usePipelineHistory(refetchInterval?: number) {
  const scope = useUserScope();
  return useQuery({
    queryKey: ['pipeline-history', scope],
    queryFn: () => getPipelineHistory(50),
    enabled: scope !== 'anon',
    refetchInterval: refetchInterval ?? 10000,
  });
}

/**
 * Mutation hook for manually triggering a pipeline stage.
 *
 * On success, the trigger response includes the latest `active_stages`
 * snapshot from Redis. We merge this directly into the cached pipeline-status
 * so the UI updates instantly — no waiting for the next poll cycle.
 */
export function useTriggerPipeline() {
  const qc = useQueryClient();
  const scope = useUserScope();
  return useMutation({
    mutationFn: (stage: PipelineStage) => triggerPipeline(stage),
    onSuccess: (data, stage) => {
      const label = stage === 'all' ? 'Full pipeline' : `Stage "${stage}"`;
      toast.success(`${label} triggered successfully`);

      // Optimistic update: merge the active_stages from the trigger response
      // into the cached pipeline-status so the UI shows "queued" immediately.
      if (data?.active_stages) {
        qc.setQueryData<PipelineStatusResponse>(['pipeline-status', scope], (old) => {
          if (!old) return old;
          return { ...old, active_stages: data.active_stages };
        });
      }

      // Also refetch to pick up any server-side changes we might have missed
      qc.invalidateQueries({ queryKey: ['pipeline-status', scope] });
      qc.invalidateQueries({ queryKey: ['pipeline-history', scope] });
    },
    onError: (err: Error) => {
      toast.error(`Pipeline trigger failed: ${err.message}`);
    },
  });
}

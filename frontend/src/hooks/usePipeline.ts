import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPipelineStatus,
  getPipelineHistory,
  triggerPipeline,
  type PipelineStage,
  type PipelineStatusResponse,
} from '../lib/api';
import toast from 'react-hot-toast';

/**
 * Polls the backend for real-time pipeline status.
 * Includes per-stage active_stages map for granular UI locking.
 */
export function usePipelineStatus(refetchInterval?: number) {
  return useQuery({
    queryKey: ['pipeline-status'],
    queryFn: getPipelineStatus,
    refetchInterval: refetchInterval ?? 30000,
  });
}

/**
 * Fetches persistent pipeline job history for the log panel.
 */
export function usePipelineHistory(refetchInterval?: number) {
  return useQuery({
    queryKey: ['pipeline-history'],
    queryFn: () => getPipelineHistory(50),
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
  return useMutation({
    mutationFn: (stage: PipelineStage) => triggerPipeline(stage),
    onSuccess: (data, stage) => {
      const label = stage === 'all' ? 'Full pipeline' : `Stage "${stage}"`;
      toast.success(`${label} triggered successfully`);

      // Optimistic update: merge the active_stages from the trigger response
      // into the cached pipeline-status so the UI shows "queued" immediately.
      if (data?.active_stages) {
        qc.setQueryData<PipelineStatusResponse>(['pipeline-status'], (old) => {
          if (!old) return old;
          return { ...old, active_stages: data.active_stages };
        });
      }

      // Also refetch to pick up any server-side changes we might have missed
      qc.invalidateQueries({ queryKey: ['pipeline-status'] });
      qc.invalidateQueries({ queryKey: ['pipeline-history'] });
    },
    onError: (err: Error) => {
      toast.error(`Pipeline trigger failed: ${err.message}`);
    },
  });
}

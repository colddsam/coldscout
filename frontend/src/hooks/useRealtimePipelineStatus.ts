import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeToPipelineStatus } from '../lib/realtime';

/**
 * Subscribes this tab to pipeline-status broadcasts. When any other client
 * toggles global production status or a freelancer's per-user status, this
 * hook invalidates the cached queries so the affected UI (Topbar indicator,
 * Settings page, Overview, pipeline controls) refetches and reflects the
 * new state without a manual refresh.
 *
 * Mount once, near the app root, inside the authenticated shell — the
 * Supabase channel is shared, so multiple mounts are safe but wasteful.
 */
export function useRealtimePipelineStatus() {
  const qc = useQueryClient();

  useEffect(() => {
    const unsubscribe = subscribeToPipelineStatus(() => {
      qc.invalidateQueries({ queryKey: ['health'] });
      qc.invalidateQueries({ queryKey: ['freelancer-status'] });
    });
    return unsubscribe;
  }, [qc]);
}

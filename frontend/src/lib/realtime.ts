/**
 * Supabase Realtime broadcast channel for pipeline-status changes.
 *
 * Why broadcast (not postgres_changes):
 *   - The global PRODUCTION_STATUS lives in an env var / .env file, not in
 *     the database — so postgres_changes cannot observe it.
 *   - Per-freelancer status DOES live in `freelancer_pipeline_configs`, but
 *     using a single broadcast channel for both keeps one fan-out path.
 *
 * Contract:
 *   - When a superuser toggles global hold/resume, or admin-toggles a
 *     freelancer's status, or a freelancer toggles their own, the browser
 *     that issued the mutation sends a broadcast after the REST call
 *     succeeds. All other authenticated browsers receive the event and
 *     invalidate the affected React Query keys, so their UI updates
 *     without a manual refresh.
 *   - The backend is authoritative. Broadcast is only a "poke" that tells
 *     clients to refetch — it never carries state that the UI trusts
 *     blindly.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

const CHANNEL_NAME = 'pipeline-status';
const EVENT_NAME = 'status-changed';

export type PipelineStatusEvent = {
  scope: 'global' | 'freelancer';
  user_id?: number;
};

let channel: RealtimeChannel | null = null;
let subscribed = false;

function getChannel(): RealtimeChannel {
  if (!channel) {
    channel = supabase.channel(CHANNEL_NAME, {
      config: { broadcast: { self: false } },
    });
  }
  return channel;
}

function ensureSubscribed(): RealtimeChannel {
  const ch = getChannel();
  if (!subscribed) {
    subscribed = true;
    ch.subscribe();
  }
  return ch;
}

/**
 * Send a pipeline-status-changed notification to every other connected
 * client. Safe to call from a mutation's onSuccess.
 */
export function broadcastPipelineStatusChange(payload: PipelineStatusEvent): void {
  const ch = ensureSubscribed();
  ch.send({ type: 'broadcast', event: EVENT_NAME, payload }).catch(() => {
    // Broadcast is best-effort: a dropped packet just means the other
    // client will pick up the change on its next poll. No user-facing error.
  });
}

/**
 * Subscribe to pipeline-status broadcasts. Returns an unsubscribe function.
 */
export function subscribeToPipelineStatus(
  onChange: (payload: PipelineStatusEvent) => void,
): () => void {
  const ch = ensureSubscribed();
  const handler = (msg: { payload: PipelineStatusEvent }) => {
    onChange(msg.payload);
  };
  ch.on('broadcast', { event: EVENT_NAME }, handler);
  return () => {
    // supabase-js doesn't expose per-listener removal; the listener is
    // cheap and lives for the session, so we simply no-op on unmount.
    // If multiple subscribers mount, each gets its own handler via `on`.
  };
}

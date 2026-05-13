/**
 * React Query hooks for the API Key Orchestrator admin page.
 *
 * Every hook scopes its cache to the same key tree (`['api-keys', ...]`)
 * so mutations can invalidate both the list and the stats in one call.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import {
  listAPIKeys,
  createAPIKey,
  updateAPIKey,
  toggleAPIKey,
  resetAPIKeyCooldown,
  deleteAPIKey,
  getAPIKeyStats,
  getAPIKeyProviderMap,
  previewAPIKeyWeight,
  type APIKeyCreatePayload,
  type APIKeyUpdatePayload,
  type APIKeyCollision,
} from '../lib/api';

export function useAPIKeys() {
  return useQuery({
    queryKey: ['api-keys', 'list'],
    queryFn: listAPIKeys,
    // Status badges (cooldown countdowns) feel stale after ~30s — refetch
    // quietly so the operator sees the pool come back online without a
    // manual reload.
    refetchInterval: 30_000,
  });
}

export function useAPIKeyStats() {
  return useQuery({
    queryKey: ['api-keys', 'stats'],
    queryFn: getAPIKeyStats,
    refetchInterval: 30_000,
  });
}

export function useAPIKeyProviderMap() {
  return useQuery({
    queryKey: ['api-keys', 'providers'],
    queryFn: getAPIKeyProviderMap,
    staleTime: 60 * 60_000, // cache for an hour — the map only changes on deploy
  });
}

/**
 * Format a collision list as a single human-readable sentence for toast feedback.
 */
function summarizeCollisions(collisions: APIKeyCollision[]): string {
  if (collisions.length === 0) return '';
  if (collisions.length === 1) {
    const c = collisions[0];
    const name = c.label || `${c.use_case} key`;
    return `${name} pushed from weight ${c.old_weight} → ${c.new_weight}`;
  }
  return `${collisions.length} other keys had their weight shifted down by 1`;
}

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['api-keys'] });
  };
}

export function useCreateAPIKey() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (payload: APIKeyCreatePayload) => createAPIKey(payload),
    onSuccess: (resp) => {
      toast.success('API key added to the pool');
      const note = summarizeCollisions(resp.weight_collisions);
      if (note) toast(note, { icon: '⚖️' });
      invalidate();
    },
    onError: (err: Error) => {
      toast.error(`Add failed: ${err.message}`);
    },
  });
}

export function useUpdateAPIKey() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: APIKeyUpdatePayload }) =>
      updateAPIKey(id, payload),
    onSuccess: (resp) => {
      toast.success('API key updated');
      const note = summarizeCollisions(resp.weight_collisions);
      if (note) toast(note, { icon: '⚖️' });
      invalidate();
    },
    onError: (err: Error) => {
      toast.error(`Update failed: ${err.message}`);
    },
  });
}

export function usePreviewAPIKeyWeight() {
  return useMutation({
    mutationFn: (payload: { provider_name: string; weight: number; exclude_id?: string }) =>
      previewAPIKeyWeight(payload),
  });
}

export function useToggleAPIKey() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => toggleAPIKey(id),
    onSuccess: (record) => {
      toast.success(record.is_active ? 'Key activated' : 'Key deactivated');
      invalidate();
    },
    onError: (err: Error) => {
      toast.error(`Toggle failed: ${err.message}`);
    },
  });
}

export function useResetAPIKeyCooldown() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => resetAPIKeyCooldown(id),
    onSuccess: () => {
      toast.success('Cooldown cleared');
      invalidate();
    },
    onError: (err: Error) => {
      toast.error(`Reset failed: ${err.message}`);
    },
  });
}

export function useDeleteAPIKey() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => deleteAPIKey(id),
    onSuccess: () => {
      toast.success('API key removed');
      invalidate();
    },
    onError: (err: Error) => {
      toast.error(`Delete failed: ${err.message}`);
    },
  });
}

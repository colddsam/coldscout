/**
 * Discovery-config react-query hooks.
 *
 * Strictly per-freelancer — every endpoint reads/writes only the
 * authenticated user's row. The server enforces this; we don't pass
 * any user_id from the client side.
 *
 * Cache isolation
 * ---------------
 * Every query key is namespaced by the current user's id (or ``"anon"`` when
 * unauthenticated). This is defense-in-depth on top of the auth-transition
 * cache wipe in ``useAuth``: even if a stale entry slipped through the wipe,
 * its key wouldn't match the new user's so they'd never see it. The cost is
 * one extra cache slot per user, which is negligible.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import {
  clearAllDiscoveryHistory,
  deleteDiscoveryHistoryEntry,
  getDiscoveryCategories,
  getDiscoveryConfig,
  getDiscoveryHistory,
  getDiscoveryLimits,
  previewDiscoveryRun,
  updateDiscoveryConfig,
  type DiscoveryConfigUpdate,
} from '../lib/api';
import { useUserScope } from './useUserScope';

// Discovery hooks delegate to the shared ``useUserScope`` so every per-user
// query key in the app uses the same scope segment (``u:{id}`` / ``anon``).

const QK = {
  config: (scope: string) => ['discovery-config', scope] as const,
  limits: (scope: string) => ['discovery-config', scope, 'limits'] as const,
  categories: (scope: string) => ['discovery-config', scope, 'categories'] as const,
  history: (scope: string, days: number) => ['discovery-config', scope, 'history', days] as const,
  preview: (scope: string) => ['discovery-config', scope, 'preview'] as const,
};

export function useDiscoveryConfig() {
  const scope = useUserScope();
  return useQuery({
    queryKey: QK.config(scope),
    queryFn: getDiscoveryConfig,
    enabled: scope !== 'anon',
    // The config row is auto-created on first GET, so this is safe to
    // mount unconditionally.
    staleTime: 60_000,
  });
}

export function useDiscoveryLimits() {
  const scope = useUserScope();
  return useQuery({
    queryKey: QK.limits(scope),
    queryFn: getDiscoveryLimits,
    enabled: scope !== 'anon',
    // Limits are tied to backend env vars and effectively static within
    // a session — cache aggressively.
    staleTime: 5 * 60_000,
  });
}

export function useDiscoveryCategories() {
  const scope = useUserScope();
  return useQuery({
    queryKey: QK.categories(scope),
    queryFn: getDiscoveryCategories,
    enabled: scope !== 'anon',
    staleTime: 60 * 60_000,
  });
}

export function useDiscoveryHistory(days = 60) {
  const scope = useUserScope();
  return useQuery({
    queryKey: QK.history(scope, days),
    queryFn: () => getDiscoveryHistory(days),
    enabled: scope !== 'anon',
    staleTime: 30_000,
  });
}

export function useDiscoveryPreview() {
  const scope = useUserScope();
  return useQuery({
    queryKey: QK.preview(scope),
    queryFn: previewDiscoveryRun,
    enabled: scope !== 'anon',
    staleTime: 10_000,
  });
}

export function useUpdateDiscoveryConfig() {
  const qc = useQueryClient();
  const scope = useUserScope();
  return useMutation({
    mutationFn: (payload: DiscoveryConfigUpdate) => updateDiscoveryConfig(payload),
    onSuccess: () => {
      toast.success('Discovery preferences saved.');
      qc.invalidateQueries({ queryKey: QK.config(scope) });
      qc.invalidateQueries({ queryKey: QK.preview(scope) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save discovery preferences.');
    },
  });
}

export function useDeleteDiscoveryHistoryEntry() {
  const qc = useQueryClient();
  const scope = useUserScope();
  return useMutation({
    mutationFn: (id: string) => deleteDiscoveryHistoryEntry(id),
    onSuccess: () => {
      toast.success('History entry removed. That area can be searched again.');
      qc.invalidateQueries({ queryKey: ['discovery-config', scope, 'history'] });
      qc.invalidateQueries({ queryKey: QK.preview(scope) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to remove history entry.');
    },
  });
}

export function useClearAllDiscoveryHistory() {
  const qc = useQueryClient();
  const scope = useUserScope();
  return useMutation({
    mutationFn: () => clearAllDiscoveryHistory(),
    onSuccess: (data) => {
      toast.success(`Cleared ${data.deleted} history entr${data.deleted === 1 ? 'y' : 'ies'}.`);
      qc.invalidateQueries({ queryKey: ['discovery-config', scope, 'history'] });
      qc.invalidateQueries({ queryKey: QK.preview(scope) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to clear history.');
    },
  });
}

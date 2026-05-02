/**
 * Discovery-config react-query hooks.
 *
 * Strictly per-freelancer — every endpoint reads/writes only the
 * authenticated user's row. The server enforces this; we don't pass
 * any user_id from the client side.
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

const QK = {
  config: ['discovery-config'] as const,
  limits: ['discovery-config', 'limits'] as const,
  categories: ['discovery-config', 'categories'] as const,
  history: (days: number) => ['discovery-config', 'history', days] as const,
  preview: ['discovery-config', 'preview'] as const,
};

export function useDiscoveryConfig() {
  return useQuery({
    queryKey: QK.config,
    queryFn: getDiscoveryConfig,
    // The config row is auto-created on first GET, so this is safe to
    // mount unconditionally.
    staleTime: 60_000,
  });
}

export function useDiscoveryLimits() {
  return useQuery({
    queryKey: QK.limits,
    queryFn: getDiscoveryLimits,
    // Limits are tied to backend env vars and effectively static within
    // a session — cache aggressively.
    staleTime: 5 * 60_000,
  });
}

export function useDiscoveryCategories() {
  return useQuery({
    queryKey: QK.categories,
    queryFn: getDiscoveryCategories,
    staleTime: 60 * 60_000,
  });
}

export function useDiscoveryHistory(days = 60) {
  return useQuery({
    queryKey: QK.history(days),
    queryFn: () => getDiscoveryHistory(days),
    staleTime: 30_000,
  });
}

export function useDiscoveryPreview() {
  return useQuery({
    queryKey: QK.preview,
    queryFn: previewDiscoveryRun,
    staleTime: 10_000,
  });
}

export function useUpdateDiscoveryConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DiscoveryConfigUpdate) => updateDiscoveryConfig(payload),
    onSuccess: () => {
      toast.success('Discovery preferences saved.');
      qc.invalidateQueries({ queryKey: QK.config });
      qc.invalidateQueries({ queryKey: QK.preview });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save discovery preferences.');
    },
  });
}

export function useDeleteDiscoveryHistoryEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDiscoveryHistoryEntry(id),
    onSuccess: () => {
      toast.success('History entry removed. That area can be searched again.');
      qc.invalidateQueries({ queryKey: ['discovery-config', 'history'] });
      qc.invalidateQueries({ queryKey: QK.preview });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to remove history entry.');
    },
  });
}

export function useClearAllDiscoveryHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => clearAllDiscoveryHistory(),
    onSuccess: (data) => {
      toast.success(`Cleared ${data.deleted} history entr${data.deleted === 1 ? 'y' : 'ies'}.`);
      qc.invalidateQueries({ queryKey: ['discovery-config', 'history'] });
      qc.invalidateQueries({ queryKey: QK.preview });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to clear history.');
    },
  });
}

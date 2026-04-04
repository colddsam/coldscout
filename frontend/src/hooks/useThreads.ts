/**
 * Threads Pipeline React Query Hooks.
 *
 * Provides data-fetching hooks for the Threads lead generation dashboard:
 * stats, profiles, engagements, search configs, and pipeline triggers.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../lib/api';
import toast from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────

export interface ThreadsStats {
  threads_enabled: boolean;
  profiles: { total: number; qualified: number; engaged: number };
  posts: number;
  engagements: number;
  rate_limiter: {
    replies_today: number;
    daily_cap: number;
    remaining: number;
    can_reply: boolean;
  };
}

export interface ThreadsProfile {
  id: string;
  threads_user_id: string;
  username: string;
  name: string | null;
  bio: string | null;
  followers_count: number | null;
  is_verified: boolean;
  qualification_status: string;
  ai_score: number | null;
  qualification_notes: string | null;
  created_at: string | null;
}

export interface ThreadsEngagement {
  id: string;
  threads_profile_id: string;
  reply_text: string | null;
  status: string;
  replied_at: string | null;
  response_text: string | null;
  response_received_at: string | null;
}

export interface ThreadsSearchConfig {
  id: string;
  keyword: string;
  category: string | null;
  search_type: string;
  is_active: boolean;
  max_results_per_search: number;
  last_searched_at: string | null;
}

// ── API Functions ──────────────────────────────────────────

const threadsApi = {
  getStats: async (): Promise<ThreadsStats> => {
    const { data } = await client.get('/api/v1/threads/stats');
    return data;
  },

  getProfiles: async (params: { status?: string; limit?: number; offset?: number }): Promise<ThreadsProfile[]> => {
    const { data } = await client.get('/api/v1/threads/profiles', { params });
    return data;
  },

  getEngagements: async (params: { status?: string; limit?: number }): Promise<ThreadsEngagement[]> => {
    const { data } = await client.get('/api/v1/threads/engagements', { params });
    return data;
  },

  getSearchConfigs: async (): Promise<ThreadsSearchConfig[]> => {
    const { data } = await client.get('/api/v1/threads/search-configs');
    return data;
  },

  createSearchConfig: async (payload: { keyword: string; category?: string; search_type?: string; max_results_per_search?: number }) => {
    const { data } = await client.post('/api/v1/threads/search-configs', payload);
    return data;
  },

  updateSearchConfig: async (id: string, payload: Partial<{ keyword: string; category: string; search_type: string; is_active: boolean; max_results_per_search: number }>) => {
    const { data } = await client.put(`/api/v1/threads/search-configs/${id}`, payload);
    return data;
  },

  deleteSearchConfig: async (id: string) => {
    const { data } = await client.delete(`/api/v1/threads/search-configs/${id}`);
    return data;
  },

  triggerDiscovery: async () => {
    const { data } = await client.post('/api/v1/threads/run/discovery');
    return data;
  },

  triggerQualification: async () => {
    const { data } = await client.post('/api/v1/threads/run/qualification');
    return data;
  },

  triggerEngagement: async () => {
    const { data } = await client.post('/api/v1/threads/run/engagement');
    return data;
  },

  triggerResponseCheck: async () => {
    const { data } = await client.post('/api/v1/threads/run/check-responses');
    return data;
  },
};

// ── Query Hooks ────────────────────────────────────────────

export function useThreadsStats() {
  return useQuery({
    queryKey: ['threads', 'stats'],
    queryFn: threadsApi.getStats,
    refetchInterval: 60_000,
  });
}

export function useThreadsProfiles(params: { status?: string; limit?: number; offset?: number } = {}) {
  return useQuery({
    queryKey: ['threads', 'profiles', params],
    queryFn: () => threadsApi.getProfiles(params),
  });
}

export function useThreadsEngagements(params: { status?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ['threads', 'engagements', params],
    queryFn: () => threadsApi.getEngagements(params),
  });
}

export function useThreadsSearchConfigs() {
  return useQuery({
    queryKey: ['threads', 'search-configs'],
    queryFn: threadsApi.getSearchConfigs,
  });
}

// ── Mutation Hooks ─────────────────────────────────────────

export function useCreateSearchConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: threadsApi.createSearchConfig,
    onSuccess: () => {
      toast.success('Search config created');
      qc.invalidateQueries({ queryKey: ['threads', 'search-configs'] });
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });
}

export function useUpdateSearchConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof threadsApi.updateSearchConfig>[1] }) =>
      threadsApi.updateSearchConfig(id, payload),
    onSuccess: () => {
      toast.success('Search config updated');
      qc.invalidateQueries({ queryKey: ['threads', 'search-configs'] });
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });
}

export function useDeleteSearchConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: threadsApi.deleteSearchConfig,
    onSuccess: () => {
      toast.success('Search config deleted');
      qc.invalidateQueries({ queryKey: ['threads', 'search-configs'] });
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });
}

export function useThreadsTrigger(stage: 'discovery' | 'qualification' | 'engagement' | 'response-check') {
  const qc = useQueryClient();
  const fnMap = {
    discovery: threadsApi.triggerDiscovery,
    qualification: threadsApi.triggerQualification,
    engagement: threadsApi.triggerEngagement,
    'response-check': threadsApi.triggerResponseCheck,
  };
  return useMutation({
    mutationFn: fnMap[stage],
    onSuccess: () => {
      toast.success(`${stage} triggered successfully`);
      qc.invalidateQueries({ queryKey: ['threads'] });
    },
    onError: (err: Error) => toast.error(`Trigger failed: ${err.message}`),
  });
}

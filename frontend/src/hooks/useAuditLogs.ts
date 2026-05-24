/**
 * Audit log hook.
 *
 * Mirrors the backend's tiered access model — the same hook works for:
 *   * The AdminUsers page (superuser view, with target_user_id filter).
 *   * The Profile / Settings "Account Activity" panel for a freelancer
 *     (self-only view; backend ignores any cross-user filter).
 *
 * The backend masks actor identity for non-superusers, so the UI can
 * render the response verbatim without doing its own privacy logic.
 */
import { useQuery } from '@tanstack/react-query';
import { client } from '../lib/api';

export type AuditAction =
  | 'plan_change'
  | 'role_change'
  | 'active_change'
  | 'superuser_change';

export interface AuditLogRow {
  id: number;
  action: AuditAction | string;
  actor_user_id: number | null;
  /** "Administrator" for non-superusers (masked); real email for admins. */
  actor_email: string | null;
  target_user_id: number | null;
  target_email: string | null;
  old_value: string | null;
  new_value: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AuditLogListResponse {
  items: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
}

export interface AuditLogFilters {
  action?: AuditAction;
  target_user_id?: number;
  actor_user_id?: number;
  since?: string;
  until?: string;
  page?: number;
  limit?: number;
}

const QUERY_KEY = 'audit-logs';

export function useAuditLogs(filters: AuditLogFilters = {}, enabled = true) {
  return useQuery<AuditLogListResponse>({
    queryKey: [QUERY_KEY, filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.action) params.action = filters.action;
      if (filters.target_user_id !== undefined) params.target_user_id = filters.target_user_id;
      if (filters.actor_user_id !== undefined) params.actor_user_id = filters.actor_user_id;
      if (filters.since) params.since = filters.since;
      if (filters.until) params.until = filters.until;
      if (filters.page) params.page = filters.page;
      if (filters.limit) params.limit = filters.limit;
      const { data } = await client.get<AuditLogListResponse>('/api/v1/audit-logs', {
        params,
      });
      return data;
    },
    enabled,
    staleTime: 15_000,
  });
}

export function useAuditLogActions(enabled = true) {
  return useQuery<string[]>({
    queryKey: [QUERY_KEY, 'meta', 'actions'],
    queryFn: async () => {
      const { data } = await client.get<string[]>('/api/v1/audit-logs/meta/actions');
      return data;
    },
    enabled,
    staleTime: 5 * 60_000, // Action vocabulary changes ~never.
  });
}

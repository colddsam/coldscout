/**
 * Superuser-only Admin Users hook.
 *
 * Thin React Query wrapper over ``/api/v1/admin/users/*``. Every mutation
 * invalidates the list query so the table reflects the change without
 * the operator needing to refresh, and also invalidates ``billing``
 * scoped queries because plan changes flip the user's effective
 * entitlement (which the Billing page surfaces).
 *
 * The backend enforces the superuser gate — these hooks only deal with
 * the happy path + standard 4xx/5xx error normalisation from api.ts.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { client } from '../lib/api';

// ── Types (kept local — these endpoints are admin-only & isolated) ──────────

export interface AdminUser {
  id: number;
  email: string;
  full_name: string | null;
  role: 'client' | 'freelancer';
  plan: 'free' | 'pro' | 'enterprise';
  plan_expires_at: string | null;
  is_active: boolean;
  is_superuser: boolean;
  auth_provider: string | null;
  avatar_url: string | null;
  supabase_uid: string | null;
  paid_plan_active: boolean;
}

export interface AdminUserListResponse {
  items: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminUserFilters {
  q?: string;
  role?: 'client' | 'freelancer';
  plan?: 'free' | 'pro' | 'enterprise';
  is_active?: boolean;
  is_superuser?: boolean;
  page?: number;
  limit?: number;
}

const ADMIN_LIST_KEY = 'admin-users';

// ── Queries ────────────────────────────────────────────────────────────────

export function useAdminUsers(filters: AdminUserFilters = {}) {
  return useQuery<AdminUserListResponse>({
    queryKey: [ADMIN_LIST_KEY, filters],
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = {};
      if (filters.q) params.q = filters.q;
      if (filters.role) params.role = filters.role;
      if (filters.plan) params.plan = filters.plan;
      if (typeof filters.is_active === 'boolean') params.is_active = filters.is_active;
      if (typeof filters.is_superuser === 'boolean') params.is_superuser = filters.is_superuser;
      if (filters.page) params.page = filters.page;
      if (filters.limit) params.limit = filters.limit;
      const { data } = await client.get<AdminUserListResponse>('/api/v1/admin/users', {
        params,
      });
      return data;
    },
    staleTime: 10_000,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

/**
 * Shared mutation factory — every PATCH on /admin/users/{id}/X follows
 * the same response shape (the updated AdminUser) and the same cache-
 * invalidation pattern. DRYing this up keeps the four mutation hooks
 * below identical in behaviour, so an operator's experience is
 * consistent across plan / role / active / superuser changes.
 */
function buildMutation<TBody>(suffix: 'plan' | 'role' | 'active' | 'superuser', successMsg: (u: AdminUser) => string) {
  return function useAdminMutation() {
    const qc = useQueryClient();
    return useMutation<AdminUser, Error, { userId: number; body: TBody }>({
      mutationFn: async ({ userId, body }) => {
        const { data } = await client.patch<AdminUser>(
          `/api/v1/admin/users/${userId}/${suffix}`,
          body,
        );
        return data;
      },
      onSuccess: (updated) => {
        // Refresh the table & the single-user query. Billing query
        // also depends on plan, so bust it. Keep the invalidate set
        // tight — we don't want to bounce every unrelated query.
        qc.invalidateQueries({ queryKey: [ADMIN_LIST_KEY] });
        qc.invalidateQueries({ queryKey: ['billing'] });
        toast.success(successMsg(updated));
      },
      onError: (err) => {
        toast.error(err.message || `Failed to update user`);
      },
    });
  };
}

export const useChangeUserPlan = buildMutation<{ plan: AdminUser['plan']; expires_at?: string }>(
  'plan',
  (u) => `${u.email} → plan: ${u.plan}`,
);

export const useChangeUserRole = buildMutation<{ role: AdminUser['role'] }>(
  'role',
  (u) => `${u.email} → role: ${u.role}`,
);

export const useChangeUserActive = buildMutation<{ is_active: boolean }>(
  'active',
  (u) => `${u.email} ${u.is_active ? 'reactivated' : 'deactivated'}`,
);

export const useChangeUserSuperuser = buildMutation<{ is_superuser: boolean }>(
  'superuser',
  (u) => `${u.email} ${u.is_superuser ? 'granted' : 'revoked'} superuser`,
);

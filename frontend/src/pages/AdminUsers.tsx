/**
 * Superuser-only User Administration.
 *
 * One page to manage every account on the platform — search/filter,
 * change plan, change role, suspend/reactivate, grant/revoke admin.
 *
 * Defence layers:
 *   1. Route guard (`SuperuserRoute` in App.tsx) blocks render entirely
 *      for non-superusers.
 *   2. Backend `get_current_active_superuser` gate on every endpoint
 *      blocks the mutation if a non-superuser somehow reaches it.
 *
 * UX choices:
 *   * Destructive actions (deactivate, revoke admin, demote to free)
 *     route through a confirm modal — operators routinely have multiple
 *     tabs open and a stray click on the wrong row is recoverable but
 *     embarrassing.
 *   * Idempotent mutations (no-op when the value already matches) live
 *     server-side so the table never flickers from a redundant request.
 *   * Self-actions are visually disabled with a tooltip explaining why
 *     — the backend still rejects them, this just shortens the
 *     feedback loop.
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Search, Shield, ShieldOff, UserCheck, UserX, CreditCard, UserCog, Loader2,
  AlertTriangle,
} from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import AuditLogList from '../components/dashboard/AuditLogList';
import { useAuth } from '../hooks/useAuth';
import { useSEO } from '../hooks/useSEO';
import {
  useAdminUsers,
  useChangeUserActive,
  useChangeUserPlan,
  useChangeUserRole,
  useChangeUserSuperuser,
  type AdminUser,
  type AdminUserFilters,
} from '../hooks/useAdminUsers';
import { cn } from '../lib/utils';

type ConfirmAction =
  | { kind: 'plan'; user: AdminUser; plan: AdminUser['plan'] }
  | { kind: 'role'; user: AdminUser; role: AdminUser['role'] }
  | { kind: 'active'; user: AdminUser; is_active: boolean }
  | { kind: 'superuser'; user: AdminUser; is_superuser: boolean };

const PLAN_OPTIONS: AdminUser['plan'][] = ['free', 'pro', 'enterprise'];
const ROLE_OPTIONS: AdminUser['role'][] = ['freelancer', 'client'];

export default function AdminUsers() {
  useSEO({
    title: 'Admin · Users — Cold Scout',
    description: 'Superuser-only user administration: change plans, roles, and account status.',
    index: false,
  });
  const { user: me } = useAuth();
  const myId = me?.id;

  // ── Filter state (mirrors the backend's query params) ────────────
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState<AdminUser['plan'] | ''>('');
  const [role, setRole] = useState<AdminUser['role'] | ''>('');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const limit = 50;

  const filters = useMemo<AdminUserFilters>(() => ({
    q: q.trim() || undefined,
    plan: plan || undefined,
    role: role || undefined,
    is_active: activeFilter === '' ? undefined : activeFilter === 'true',
    page,
    limit,
  }), [q, plan, role, activeFilter, page, limit]);

  const { data, isLoading, isError, refetch } = useAdminUsers(filters);
  const changePlan = useChangeUserPlan();
  const changeRole = useChangeUserRole();
  const changeActive = useChangeUserActive();
  const changeSuper = useChangeUserSuperuser();

  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const isAnyMutating = changePlan.isPending || changeRole.isPending
    || changeActive.isPending || changeSuper.isPending;

  // ── Action dispatchers ───────────────────────────────────────────
  const applyConfirmed = () => {
    if (!confirm) return;
    const { user } = confirm;
    switch (confirm.kind) {
      case 'plan':
        changePlan.mutate({ userId: user.id, body: { plan: confirm.plan } });
        break;
      case 'role':
        changeRole.mutate({ userId: user.id, body: { role: confirm.role } });
        break;
      case 'active':
        changeActive.mutate({ userId: user.id, body: { is_active: confirm.is_active } });
        break;
      case 'superuser':
        changeSuper.mutate({ userId: user.id, body: { is_superuser: confirm.is_superuser } });
        break;
    }
    setConfirm(null);
  };

  // Decide whether an action needs a confirm step. Destructive or
  // privilege-changing operations always confirm; safe upgrades go
  // through directly so the operator stays productive.
  const needsConfirm = (kind: ConfirmAction['kind'], value: unknown): boolean => {
    if (kind === 'plan') return value === 'free';                   // downgrade
    if (kind === 'role') return true;                               // any role flip
    if (kind === 'active') return value === false;                  // suspend
    if (kind === 'superuser') return true;                          // any privilege flip
    return false;
  };

  const dispatchAction = (action: ConfirmAction) => {
    if (needsConfirm(action.kind, valueOf(action))) {
      setConfirm(action);
    } else {
      // Skip confirm — fire immediately
      setConfirm(action);
      // tiny RAF defer so the modal flash doesn't show; we just route
      // through the same handler to keep state changes consistent.
      setTimeout(() => {
        const { user } = action;
        if (action.kind === 'plan') changePlan.mutate({ userId: user.id, body: { plan: action.plan } });
        else if (action.kind === 'role') changeRole.mutate({ userId: user.id, body: { role: action.role } });
        else if (action.kind === 'active') changeActive.mutate({ userId: user.id, body: { is_active: action.is_active } });
        else if (action.kind === 'superuser') changeSuper.mutate({ userId: user.id, body: { is_superuser: action.is_superuser } });
        setConfirm(null);
      }, 0);
    }
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <PageHeader
        eyebrow="Admin"
        title="User Administration"
        subtitle="View, upgrade, demote, and manage every account on the platform."
        actions={
          <div className="flex items-center gap-2 text-xs text-tertiary">
            <Shield className="w-3.5 h-3.5" /> Superuser
          </div>
        }
      />

      {/* Filter bar — collapses naturally on mobile */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tertiary pointer-events-none" />
            <input
              type="search"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Search email or name…"
              className="input-field pl-9"
            />
          </div>
          <select
            value={plan}
            onChange={(e) => { setPlan(e.target.value as AdminUser['plan'] | ''); setPage(1); }}
            className="input-field"
          >
            <option value="">All plans</option>
            {PLAN_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={role}
            onChange={(e) => { setRole(e.target.value as AdminUser['role'] | ''); setPage(1); }}
            className="input-field"
          >
            <option value="">All roles</option>
            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            value={activeFilter}
            onChange={(e) => { setActiveFilter(e.target.value as '' | 'true' | 'false'); setPage(1); }}
            className="input-field"
          >
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Suspended</option>
          </select>
        </div>
      </Card>

      {/* Results */}
      {isError ? (
        <ErrorState
          title="Could not load users"
          message="The admin user list failed to load. Try again."
          onRetry={() => refetch()}
        />
      ) : isLoading || !data ? (
        <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
      ) : data.items.length === 0 ? (
        <Card>
          <div className="empty-state">
            <p className="text-secondary text-sm">No users match these filters.</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Desktop: table; Mobile: stacked cards */}
          <Card padding={false}>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-tertiary text-[11px] uppercase tracking-widest">
                    <th className="px-5 py-3 font-semibold">User</th>
                    <th className="px-5 py-3 font-semibold">Plan</th>
                    <th className="px-5 py-3 font-semibold">Role</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      isSelf={u.id === myId}
                      mutating={isAnyMutating && confirm?.user.id === u.id}
                      onAction={dispatchAction}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-white/[0.06]">
              {data.items.map((u) => (
                <UserCard
                  key={u.id}
                  user={u}
                  isSelf={u.id === myId}
                  mutating={isAnyMutating && confirm?.user.id === u.id}
                  onAction={dispatchAction}
                />
              ))}
            </div>
          </Card>

          {/* Pagination */}
          {data.total > data.limit && (
            <div className="flex items-center justify-between text-xs text-tertiary">
              <span>
                Page {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))} ·{' '}
                {data.total} user{data.total === 1 ? '' : 's'}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={data.page <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={data.page * data.limit >= data.total}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmModal
        action={confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={applyConfirmed}
        loading={isAnyMutating}
      />

      {/* Platform-wide audit timeline. Superuser sees every event;
          actor identity is real (not masked) so operators can attribute
          every change. Filter dropdown lets you narrow by action type. */}
      <section className="space-y-3 pt-6">
        <div>
          <h3 className="heading-section">Audit Log</h3>
          <p className="text-meta mt-1">
            Every successful admin action across the platform. Each row
            records who changed what about whom, when, from which IP.
          </p>
        </div>
        <AuditLogList />
      </section>
    </motion.div>
  );
}


// ── Row + Card variants ─────────────────────────────────────────────

interface RowProps {
  user: AdminUser;
  isSelf: boolean;
  mutating: boolean;
  onAction: (a: ConfirmAction) => void;
}

function UserRow({ user, isSelf, mutating, onAction }: RowProps) {
  return (
    <tr className="border-t border-white/[0.06]">
      <td className="px-5 py-3 align-middle">
        <div className="flex items-center gap-3 min-w-0">
          <div className="icon-bubble flex-shrink-0">
            <UserCog className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-strong text-sm truncate">{user.full_name || user.email}</div>
            <div className="text-tertiary text-xs truncate">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="px-5 py-3 align-middle">
        <PlanPicker user={user} disabled={isSelf || mutating} onChange={(p) => onAction({ kind: 'plan', user, plan: p })} />
      </td>
      <td className="px-5 py-3 align-middle">
        <RolePicker user={user} disabled={isSelf || mutating} onChange={(r) => onAction({ kind: 'role', user, role: r })} />
      </td>
      <td className="px-5 py-3 align-middle">
        <StatusBadges user={user} />
      </td>
      <td className="px-5 py-3 align-middle">
        <RowActions user={user} isSelf={isSelf} mutating={mutating} onAction={onAction} />
      </td>
    </tr>
  );
}

function UserCard({ user, isSelf, mutating, onAction }: RowProps) {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-strong text-sm truncate">{user.full_name || user.email}</div>
          <div className="text-tertiary text-xs truncate">{user.email}</div>
        </div>
        <StatusBadges user={user} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="eyebrow mb-1">Plan</p>
          <PlanPicker user={user} disabled={isSelf || mutating} onChange={(p) => onAction({ kind: 'plan', user, plan: p })} />
        </div>
        <div>
          <p className="eyebrow mb-1">Role</p>
          <RolePicker user={user} disabled={isSelf || mutating} onChange={(r) => onAction({ kind: 'role', user, role: r })} />
        </div>
      </div>
      <RowActions user={user} isSelf={isSelf} mutating={mutating} onAction={onAction} />
    </div>
  );
}

// ── Helpers (pickers, badges, actions) ──────────────────────────────

function PlanPicker({ user, disabled, onChange }: {
  user: AdminUser;
  disabled: boolean;
  onChange: (p: AdminUser['plan']) => void;
}) {
  return (
    <select
      value={user.plan}
      disabled={disabled}
      onChange={(e) => {
        const newVal = e.target.value as AdminUser['plan'];
        if (newVal !== user.plan) onChange(newVal);
      }}
      className="input-field h-9 py-0"
      title={disabled ? 'You cannot change your own plan' : undefined}
    >
      {PLAN_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
    </select>
  );
}

function RolePicker({ user, disabled, onChange }: {
  user: AdminUser;
  disabled: boolean;
  onChange: (r: AdminUser['role']) => void;
}) {
  return (
    <select
      value={user.role}
      disabled={disabled}
      onChange={(e) => {
        const newVal = e.target.value as AdminUser['role'];
        if (newVal !== user.role) onChange(newVal);
      }}
      className="input-field h-9 py-0"
      title={disabled ? 'You cannot change your own role' : undefined}
    >
      {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
    </select>
  );
}

function StatusBadges({ user }: { user: AdminUser }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          'chip',
          user.is_active
            ? 'text-success border-success/30 bg-success/10'
            : 'text-danger border-danger/30 bg-danger/10',
        )}
      >
        {user.is_active ? 'Active' : 'Suspended'}
      </span>
      {user.paid_plan_active && (
        <span className="chip text-strong border-white/15">Paid</span>
      )}
      {user.is_superuser && (
        <span className="chip text-warning border-warning/30 bg-warning/10">Admin</span>
      )}
    </div>
  );
}

function RowActions({ user, isSelf, mutating, onAction }: RowProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        variant={user.is_active ? 'outline' : 'primary'}
        size="sm"
        disabled={isSelf || mutating}
        title={isSelf ? 'You cannot change your own status' : undefined}
        icon={user.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
        onClick={() => onAction({ kind: 'active', user, is_active: !user.is_active })}
      >
        {user.is_active ? 'Suspend' : 'Reactivate'}
      </Button>
      <Button
        variant={user.is_superuser ? 'outline' : 'secondary'}
        size="sm"
        disabled={isSelf || mutating}
        title={isSelf ? 'You cannot change your own superuser flag' : undefined}
        icon={user.is_superuser ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
        onClick={() => onAction({ kind: 'superuser', user, is_superuser: !user.is_superuser })}
      >
        {user.is_superuser ? 'Revoke admin' : 'Make admin'}
      </Button>
    </div>
  );
}

// ── Confirm modal ───────────────────────────────────────────────────

function ConfirmModal({
  action,
  onCancel,
  onConfirm,
  loading,
}: {
  action: ConfirmAction | null;
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  if (!action) return null;
  const { title, body, danger, ctaLabel } = describeAction(action);

  return (
    <Modal open={!!action} onClose={loading ? () => undefined : onCancel} title={title}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            'icon-bubble flex-shrink-0',
            danger && 'text-danger border-danger/30 bg-danger/10',
          )}>
            {danger ? <AlertTriangle className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
          </div>
          <p className="text-sm text-secondary leading-relaxed">{body}</p>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="secondary" size="md" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            size="md"
            onClick={onConfirm}
            loading={loading}
            icon={loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
          >
            {ctaLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function describeAction(action: ConfirmAction): {
  title: string;
  body: string;
  danger: boolean;
  ctaLabel: string;
} {
  const u = action.user;
  switch (action.kind) {
    case 'plan':
      if (action.plan === 'free') {
        return {
          title: `Downgrade ${u.email}?`,
          body: `This will set their plan to FREE, cancel their active subscription, and immediately block their pipeline jobs. Their data and account remain intact.`,
          danger: true,
          ctaLabel: 'Downgrade to free',
        };
      }
      return {
        title: `Upgrade ${u.email} to ${action.plan}?`,
        body: `This grants a 30-day ${action.plan} subscription with no payment. A subscription row will be created/updated and the pipeline gate unlocks immediately.`,
        danger: false,
        ctaLabel: `Upgrade to ${action.plan}`,
      };
    case 'role':
      return {
        title: `Change role to ${action.role}?`,
        body: action.role === 'client'
          ? `${u.email} will become a CLIENT. They lose access to the freelancer dashboard (pipeline, leads, etc.) and are redirected to /welcome. Their existing data is preserved.`
          : `${u.email} will become a FREELANCER. They gain access to the full pipeline dashboard. A scheduler config row will be created if missing.`,
        danger: action.role === 'client',
        ctaLabel: `Switch to ${action.role}`,
      };
    case 'active':
      return action.is_active
        ? {
            title: `Reactivate ${u.email}?`,
            body: `Their account becomes usable again. They can log in and use any features their plan/role entitles them to.`,
            danger: false,
            ctaLabel: 'Reactivate',
          }
        : {
            title: `Suspend ${u.email}?`,
            body: `This invalidates their session immediately and stops any scheduled pipeline jobs for them. They cannot log in until reactivated. No data is deleted.`,
            danger: true,
            ctaLabel: 'Suspend account',
          };
    case 'superuser':
      return action.is_superuser
        ? {
            title: `Grant superuser to ${u.email}?`,
            body: `This gives ${u.email} FULL access to this admin panel, plus the ability to change any user's plan, role, status, and admin flag. Use sparingly.`,
            danger: true,
            ctaLabel: 'Grant superuser',
          }
        : {
            title: `Revoke superuser from ${u.email}?`,
            body: `${u.email} will lose access to this admin panel and to every superuser-only endpoint. Their plan and role are unchanged.`,
            danger: true,
            ctaLabel: 'Revoke superuser',
          };
  }
}

function valueOf(action: ConfirmAction): unknown {
  if (action.kind === 'plan') return action.plan;
  if (action.kind === 'role') return action.role;
  if (action.kind === 'active') return action.is_active;
  return action.is_superuser;
}

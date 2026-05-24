/**
 * Audit Log List.
 *
 * Renders rows from ``/api/v1/audit-logs``. Same component is used by:
 *   * The Admin Users page (superuser view, with action + target_user_id
 *     filters).
 *   * The Profile / Settings "Account Activity" panel (freelancer view —
 *     backend hard-locks the scope to ``target_user_id == current_user.id``).
 *
 * No client-side privacy logic: the backend already masks actor identity
 * for non-superusers (returns ``"Administrator"`` + null id + null IP/UA),
 * so this component just renders what it gets.
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, ChevronDown, ChevronRight, CreditCard, Shield, User as UserIcon,
  Power, Filter,
} from 'lucide-react';
import Card from '../ui/Card';
import Spinner from '../ui/Spinner';
import Button from '../ui/Button';
import { cn } from '../../lib/utils';
import {
  useAuditLogs,
  useAuditLogActions,
  type AuditAction,
  type AuditLogFilters,
  type AuditLogRow,
} from '../../hooks/useAuditLogs';

interface AuditLogListProps {
  /**
   * When set, queries the backend with target_user_id=<this>. Honored
   * only for superusers; for non-superusers the backend ignores it and
   * scopes to the caller's own rows.
   */
  targetUserId?: number;
  /** Hide the action filter dropdown (e.g. when the list is short). */
  hideFilters?: boolean;
  /** Optional page-size override. Default 25. */
  pageSize?: number;
  /** Compact mode for embedding in narrower panels. */
  compact?: boolean;
}

const ACTION_LABEL: Record<string, string> = {
  plan_change: 'Plan changed',
  role_change: 'Role changed',
  active_change: 'Account status changed',
  superuser_change: 'Admin privilege changed',
};

const ACTION_ICON: Record<string, React.ElementType> = {
  plan_change: CreditCard,
  role_change: UserIcon,
  active_change: Power,
  superuser_change: Shield,
};

export default function AuditLogList({
  targetUserId,
  hideFilters,
  pageSize = 25,
  compact,
}: AuditLogListProps) {
  const [actionFilter, setActionFilter] = useState<AuditAction | ''>('');
  const [page, setPage] = useState(1);

  const filters: AuditLogFilters = useMemo(() => ({
    target_user_id: targetUserId,
    action: actionFilter || undefined,
    page,
    limit: pageSize,
  }), [targetUserId, actionFilter, page, pageSize]);

  const { data, isLoading, isError, refetch } = useAuditLogs(filters);
  const { data: actions } = useAuditLogActions(!hideFilters);

  return (
    <div className="space-y-3">
      {!hideFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 text-tertiary text-xs">
            <Filter className="w-3.5 h-3.5" /> Filter
          </div>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value as AuditAction | ''); setPage(1); }}
            className="input-field h-9 py-0 w-auto min-w-[180px]"
          >
            <option value="">All actions</option>
            {(actions || []).map((a) => (
              <option key={a} value={a}>{ACTION_LABEL[a] || a}</option>
            ))}
          </select>
        </div>
      )}

      <Card padding={false}>
        {isError ? (
          <div className="p-6 text-center text-sm text-secondary">
            Couldn't load audit log.{' '}
            <button onClick={() => refetch()} className="link-accent">Retry</button>
          </div>
        ) : isLoading || !data ? (
          <div className="flex items-center justify-center py-10"><Spinner /></div>
        ) : data.items.length === 0 ? (
          <div className="empty-state border-0 rounded-none">
            <Activity className="w-6 h-6 text-tertiary mb-3" />
            <p className="text-sm text-secondary">
              {targetUserId
                ? 'No admin actions have been recorded for this user yet.'
                : 'No admin actions have been recorded for your account yet.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {data.items.map((row) => (
              <AuditRow key={row.id} row={row} compact={!!compact} />
            ))}
          </ul>
        )}
      </Card>

      {data && data.total > data.limit && (
        <div className="flex items-center justify-between text-xs text-tertiary">
          <span>
            Page {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))} ·{' '}
            {data.total} event{data.total === 1 ? '' : 's'}
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
    </div>
  );
}


function AuditRow({ row, compact }: { row: AuditLogRow; compact: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = ACTION_ICON[row.action] || Activity;
  const label = ACTION_LABEL[row.action] || row.action;
  const time = formatTime(row.created_at);

  const summary = describeChange(row);
  const hasMetadata = row.metadata && Object.keys(row.metadata).length > 0;
  const canExpand = hasMetadata || (row.ip_address ?? row.user_agent);

  return (
    <li>
      <motion.button
        type="button"
        onClick={() => canExpand && setExpanded((v) => !v)}
        whileTap={canExpand ? { scale: 0.998 } : undefined}
        className={cn(
          'w-full text-left flex items-start gap-3 transition-colors',
          compact ? 'p-3' : 'p-4',
          canExpand && 'hover:bg-white/[0.025] cursor-pointer',
        )}
      >
        <div className="icon-bubble flex-shrink-0 mt-0.5">
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-strong truncate">{label}</p>
              <p className="text-xs text-tertiary mt-0.5 truncate">
                {summary}
              </p>
            </div>
            <span className="text-[11px] text-tertiary whitespace-nowrap flex-shrink-0 font-mono">
              {time}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-tertiary">
            <span className="inline-flex items-center gap-1">
              <Shield className="w-3 h-3" />
              by {row.actor_email || 'unknown'}
            </span>
            {row.target_email && (
              <span className="inline-flex items-center gap-1 truncate">
                <UserIcon className="w-3 h-3" />
                target {row.target_email}
              </span>
            )}
            {canExpand && (
              <span className="inline-flex items-center gap-0.5 ml-auto text-tertiary/80">
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {expanded ? 'Hide' : 'Details'}
              </span>
            )}
          </div>
        </div>
      </motion.button>

      {expanded && canExpand && (
        <div className={cn('pl-[4.5rem] pr-4 pb-4 -mt-1 space-y-2', compact && 'pl-14 pr-3 pb-3')}>
          {hasMetadata && (
            <pre className="bg-black/40 border border-white/[0.06] rounded-md p-3 text-[11px] text-secondary font-mono overflow-x-auto">
              {JSON.stringify(row.metadata, null, 2)}
            </pre>
          )}
          {(row.ip_address || row.user_agent) && (
            <div className="text-[11px] text-tertiary space-y-0.5">
              {row.ip_address && <p>IP: <span className="font-mono">{row.ip_address}</span></p>}
              {row.user_agent && <p className="truncate">UA: <span className="font-mono">{row.user_agent}</span></p>}
            </div>
          )}
        </div>
      )}
    </li>
  );
}


function describeChange(row: AuditLogRow): string {
  const old = row.old_value ?? '∅';
  const next = row.new_value ?? '∅';
  return `${old} → ${next}`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

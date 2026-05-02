import { useMemo, useState } from 'react';
import { usePipelineStatus, usePipelineHistory, useTriggerPipeline } from '../hooks/usePipeline';
import { useAuth } from '../hooks/useAuth';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';

import Modal from '../components/ui/Modal';
import PageHeader from '../components/layout/PageHeader';
import Spinner from '../components/ui/Spinner';
import { formatDate, timeAgo, cn } from '../lib/utils';
import { PIPELINE_STAGES } from '../lib/constants';
import {
  Search,
  CheckCircle,
  Sparkles,
  Send,
  BarChart2,
  TrendingUp,
  Play,
  Zap,
  Lock,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  PauseCircle,
  Calendar,
  Hand,
  Cog,
  User as UserIcon,
} from 'lucide-react';
import type {
  ActiveStageJob,
  JobTriggerSource,
  PipelineHistoryEntry,
  PipelineJobStatus,
  PipelineStage,
} from '../lib/api';
import { motion } from 'framer-motion';
import { pageTransition, staggerContainer, staggerItem, fadeInUp, defaultViewport } from '../lib/motion';
import ErrorState from '../components/ui/ErrorState';

const ICON_MAP: Record<string, React.ElementType> = {
  Search, CheckCircle, Sparkles, Send, BarChart2, TrendingUp,
};

// ── Status / trigger lookup tables ──────────────────────────────────────────

type BadgeVariant = 'green' | 'teal' | 'amber' | 'red' | 'muted' | 'accent';

const STATUS_VARIANT: Record<PipelineJobStatus, BadgeVariant> = {
  queued: 'amber',
  running: 'accent',
  completed: 'green',
  failed: 'red',
  skipped: 'muted',
};

const STATUS_LABEL: Record<PipelineJobStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  skipped: 'Skipped',
};

const TRIGGER_LABEL: Record<JobTriggerSource, string> = {
  manual: 'Manual',
  scheduler: 'Scheduled',
  system: 'System',
};

const TRIGGER_ICON: Record<JobTriggerSource, React.ElementType> = {
  manual: Hand,
  scheduler: Calendar,
  system: Cog,
};

// Coerce any free-text trigger into a known source so the lookup tables
// don't fall off the end. The backend already normalizes to these
// values; this is belt-and-braces for legacy history rows.
function normalizeTrigger(t: string | undefined | null): JobTriggerSource {
  if (t === 'manual' || t === 'scheduler' || t === 'system') return t;
  return 'system';
}

function normalizeStatus(s: string | undefined | null): PipelineJobStatus {
  if (s === 'queued' || s === 'running' || s === 'completed' || s === 'failed' || s === 'skipped') {
    return s;
  }
  return 'failed';
}

const STAGE_LABEL_BY_ID: Record<string, string> = Object.fromEntries(
  PIPELINE_STAGES.map((s) => [s.id, s.label]),
);

function stageDisplayName(stageOrComposite: string): string {
  // Superuser history rows can be keyed as "{user_id}:{stage}" — strip
  // the prefix for display so the label stays readable.
  const stage = stageOrComposite.includes(':')
    ? stageOrComposite.split(':').slice(1).join(':')
    : stageOrComposite;
  return STAGE_LABEL_BY_ID[stage] || stage.replace(/_/g, ' ');
}

// ── Status badge for the Stage cards (transient queued/running only) ────────

function StageStatusBadge({ job }: { job?: ActiveStageJob }) {
  if (!job) return null;
  const status = normalizeStatus(job.status);

  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-accent/10 text-accent border border-accent/25 uppercase tracking-wider">
        <Spinner size="xs" /> Running
      </span>
    );
  }

  if (status === 'queued') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-warning/10 text-warning border border-warning/25 uppercase tracking-wider">
        <Clock className="w-3 h-3" /> Queued
      </span>
    );
  }

  // completed / failed / skipped don't normally appear in the active
  // map (the tracker pops finalized entries) — render nothing rather
  // than flashing a stale badge.
  return null;
}

// ── Log row data shape ──────────────────────────────────────────────────────

interface LogRow {
  key: string;
  stage: string;
  status: PipelineJobStatus;
  trigger: JobTriggerSource;
  startedAt: string | null;
  endedAt: string | null;
  queuedAt: string | null;
  errorMessage: string | null;
  rawLogs: string[];
  isLive: boolean;
  ownerId: string | null;
}

function normalizeOwnerId(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

function buildLogRows(
  active: Record<string, ActiveStageJob>,
  history: PipelineHistoryEntry[],
): { live: LogRow[]; history: LogRow[] } {
  const live: LogRow[] = Object.entries(active).map(([key, job], idx) => ({
    key: `live::${key}::${idx}`,
    stage: job.stage,
    status: normalizeStatus(job.status),
    trigger: normalizeTrigger(job.triggered_by),
    startedAt: job.started_at,
    endedAt: job.ended_at,
    queuedAt: job.queued_at,
    errorMessage: job.error_message ?? null,
    rawLogs: job.logs ?? [],
    isLive: true,
    // Superuser cross-user view keys entries as ``"{user_id}:{stage}"``;
    // fall back to the explicit field when the row carries it directly.
    ownerId: normalizeOwnerId(
      job.user_id ?? (key.includes(':') ? key.split(':')[0] : null),
    ),
  }));

  // Live rows sorted: running first, then queued, then by started/queued time desc.
  live.sort((a, b) => {
    if (a.status !== b.status) {
      const order: Record<PipelineJobStatus, number> = {
        running: 0, queued: 1, completed: 2, failed: 3, skipped: 4,
      };
      return order[a.status] - order[b.status];
    }
    const aT = a.startedAt || a.queuedAt || '';
    const bT = b.startedAt || b.queuedAt || '';
    return bT.localeCompare(aT);
  });

  const hist: LogRow[] = history.map((h, idx) => ({
    key: `hist::${idx}::${h.ended_at ?? h.started_at ?? h.queued_at ?? idx}`,
    stage: h.stage,
    status: normalizeStatus(h.status),
    trigger: normalizeTrigger(h.triggered_by),
    startedAt: h.started_at,
    endedAt: h.ended_at,
    queuedAt: h.queued_at,
    errorMessage: h.error_message ?? null,
    rawLogs: h.logs ?? [],
    isLive: false,
    ownerId: normalizeOwnerId(h.user_id),
  }));

  return { live, history: hist };
}

// ── Single log row ──────────────────────────────────────────────────────────

interface LogRowItemProps {
  row: LogRow;
  expanded: boolean;
  onToggle: () => void;
  /** Superusers see whose run each entry belongs to. */
  showOwner: boolean;
}

function LogRowItem({ row, expanded, onToggle, showOwner }: LogRowItemProps) {
  const TriggerIcon = TRIGGER_ICON[row.trigger];
  // For live rows, show "started ... ago" while running; for completed/
  // skipped/failed history, anchor to ended_at because that's when the
  // run actually concluded.
  const anchorTs = row.isLive
    ? (row.startedAt || row.queuedAt)
    : (row.endedAt || row.startedAt || row.queuedAt);

  const stageLabel = stageDisplayName(row.stage);

  // Pick the leading status icon to give an at-a-glance read even
  // before the badge text registers.
  const StatusIcon =
    row.status === 'running'
      ? Spinner
      : row.status === 'queued'
        ? Clock
        : row.status === 'completed'
          ? CheckCircle
          : row.status === 'failed'
            ? AlertTriangle
            : PauseCircle; // skipped

  const statusAccentBorder = {
    running: 'border-accent/40',
    queued: 'border-warning/30',
    completed: 'border-success/25',
    failed: 'border-danger/30',
    skipped: 'border-white/10',
  }[row.status];

  return (
    <div
      className={cn(
        'border rounded-md bg-white/[0.02] transition-colors',
        statusAccentBorder,
        'hover:bg-white/[0.035]',
      )}
    >
      <div className="flex items-start justify-between gap-3 p-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="flex-shrink-0 mt-0.5">
            {row.status === 'running' ? (
              <Spinner size="xs" className="text-accent" />
            ) : (
              <StatusIcon
                className={cn(
                  'w-4 h-4',
                  row.status === 'queued' && 'text-warning',
                  row.status === 'completed' && 'text-success',
                  row.status === 'failed' && 'text-danger',
                  row.status === 'skipped' && 'text-secondary',
                )}
              />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white truncate">
                {stageLabel}
              </span>
              <Badge
                label={STATUS_LABEL[row.status]}
                variant={STATUS_VARIANT[row.status]}
                pulse={row.status === 'running' || row.status === 'queued'}
              />
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border',
                  'text-[10px] font-semibold uppercase tracking-wider',
                  // Trigger pill — softer than the status badge so the
                  // status stays the primary read.
                  row.trigger === 'manual' && 'bg-white/[0.04] text-white/85 border-white/15',
                  row.trigger === 'scheduler' && 'bg-accent/[0.06] text-accent/90 border-accent/20',
                  row.trigger === 'system' && 'bg-white/[0.03] text-secondary border-white/10',
                )}
                title={
                  row.trigger === 'manual'
                    ? 'Triggered manually from the Pipeline page'
                    : row.trigger === 'scheduler'
                      ? 'Triggered automatically by the scheduler'
                      : 'Triggered by the system'
                }
              >
                <TriggerIcon className="w-3 h-3" />
                {TRIGGER_LABEL[row.trigger]}
              </span>
              {showOwner && row.ownerId && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-white/[0.03] text-secondary border-white/10 text-[10px] font-semibold uppercase tracking-wider font-mono"
                  title={`Owned by user #${row.ownerId}`}
                >
                  <UserIcon className="w-3 h-3" />
                  user #{row.ownerId}
                </span>
              )}
            </div>

            {row.errorMessage && (row.status === 'failed' || row.status === 'skipped') && (
              <p
                className={cn(
                  'text-xs mt-1.5 leading-relaxed',
                  row.status === 'failed' ? 'text-danger/90' : 'text-secondary',
                )}
              >
                {row.errorMessage}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {anchorTs && (
            <span
              className="text-[11px] font-mono text-secondary whitespace-nowrap"
              title={formatDate(anchorTs)}
            >
              {timeAgo(anchorTs)}
            </span>
          )}
          {row.rawLogs.length > 0 && (
            <button
              type="button"
              onClick={onToggle}
              className="text-secondary hover:text-white transition-colors"
              aria-label={expanded ? 'Hide raw logs' : 'Show raw logs'}
              title={expanded ? 'Hide raw logs' : 'Show raw logs'}
            >
              {expanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {expanded && row.rawLogs.length > 0 && (
        <div className="border-t border-white/[0.06] bg-black/30 px-3 py-2">
          <pre className="font-mono text-[11px] text-white/80 leading-relaxed whitespace-pre-wrap break-words">
            {row.rawLogs.join('\n')}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * Pipeline Control Center.
 *
 * Provides granular manual control over the AI Lead Generation workflow.
 * Supports stage-specific triggers, full pipeline execution, per-stage
 * lock states, and persistent operation logging.
 */
export default function Pipeline() {
  const { user } = useAuth();
  const isSuperuser = !!user?.is_superuser;

  const { data: pipeline, isError, refetch } = usePipelineStatus(3000);
  const { data: historyData } = usePipelineHistory(5000);
  const trigger = useTriggerPipeline();
  const [showConfirm, setShowConfirm] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const handleRunFull = () => setShowConfirm(true);

  const confirmRun = () => {
    trigger.mutate('all');
    setShowConfirm(false);
  };

  const handleRunStage = (stage: PipelineStage) => {
    trigger.mutate(stage);
  };

  // Stable memoized references so downstream useMemo deps don't bust on
  // every render when the server response object reuses the same data.
  const activeStages = useMemo(
    () => pipeline?.active_stages ?? {},
    [pipeline?.active_stages],
  );
  const historyEntries = useMemo(
    () => historyData?.history ?? [],
    [historyData?.history],
  );

  const hasAnyRunning = Object.values(activeStages).some(
    (j) => j.status === 'running' || j.status === 'queued'
  );

  const isStageActive = (stageId: string): boolean => {
    const job = activeStages[stageId];
    return job?.status === 'running' || job?.status === 'queued';
  };

  const { live: liveRows, history: historyRows } = useMemo(
    () => buildLogRows(activeStages, historyEntries),
    [activeStages, historyEntries],
  );

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (isError) {
    return (
      <motion.div className="space-y-6" variants={pageTransition} initial="initial" animate="animate">
        <PageHeader title="Pipeline Control" subtitle="Error loading pipeline status" />
        <ErrorState title="Failed to load pipeline" message="Could not fetch pipeline status from the server." onRetry={refetch} />
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-6" variants={pageTransition} initial="initial" animate="animate">
      <PageHeader title="Pipeline Control" subtitle="Trigger and monitor the AI lead generation pipeline" />

      {/* Status Banner */}
      <motion.div variants={fadeInUp} initial="hidden" animate="visible">
      <div className={`rounded-lg p-6 border ${hasAnyRunning ? 'bg-accent/[0.06] border-accent/25' : 'bg-surface-2 border-white/10'}`}>
        <div className="flex items-center gap-4">
          {hasAnyRunning ? (
            <>
              <Spinner size="md" />
              <div>
                <p className="text-accent font-semibold">Pipeline Active</p>
                <p className="text-sm text-white/75">
                  Running: {Object.entries(activeStages)
                    .filter(([, j]) => j.status === 'running')
                    .map(([s]) => stageDisplayName(s))
                    .join(', ') || '—'}
                  {Object.values(activeStages).some((j) => j.status === 'queued') && (
                    <> · Queued: {Object.entries(activeStages)
                      .filter(([, j]) => j.status === 'queued')
                      .map(([s]) => stageDisplayName(s))
                      .join(', ')}
                    </>
                  )}
                </p>
              </div>
            </>
          ) : (
            <div>
              <p className="text-white font-semibold">Pipeline Idle</p>
              <p className="text-sm text-white/75 font-mono">
                Last run: {pipeline?.last_run?.at ? formatDate(pipeline.last_run.at) : 'Never'} ·
                Status: {pipeline?.last_run?.status ?? '—'}
              </p>
            </div>
          )}
        </div>
      </div>
      </motion.div>

      {/* Stage Cards */}
      <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" variants={staggerContainer} initial="hidden" animate="visible">
        {PIPELINE_STAGES.map((stage) => {
          const Icon = ICON_MAP[stage.icon] || Zap;
          const activeJob = activeStages[stage.id];
          const isBusy = isStageActive(stage.id);

          return (
            <motion.div key={stage.id} variants={staggerItem}>
            <Card className={isBusy ? 'border-white/30 ring-1 ring-black/10' : ''}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-md ${isBusy ? 'bg-black' : 'bg-white/5'}`}>
                    {isBusy && activeJob?.status === 'running' ? (
                      <Spinner size="xs" className="text-white" />
                    ) : isBusy && activeJob?.status === 'queued' ? (
                      <Lock className="w-5 h-5 text-white" />
                    ) : (
                      <Icon className={`w-5 h-5 text-white/75`} />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{stage.label}</h3>
                    <p className="text-xs text-white/75">{stage.description}</p>
                  </div>
                </div>
                <StageStatusBadge job={activeJob} />
              </div>
              <Button
                size="sm"
                variant="outline"
                icon={isBusy ? <Lock className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                onClick={() => handleRunStage(stage.id as PipelineStage)}
                loading={trigger.isPending && trigger.variables === stage.id}
                disabled={isBusy}
              >
                {activeJob?.status === 'running' ? 'Running...' : activeJob?.status === 'queued' ? 'Queued' : 'Run Stage'}
              </Button>
            </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Run Full Pipeline CTA */}
      <Button
        className="w-full py-4 text-lg"
        icon={<Zap className="w-5 h-5" />}
        onClick={handleRunFull}
        loading={trigger.isPending && trigger.variables === 'all'}
        disabled={hasAnyRunning}
      >
        {hasAnyRunning ? 'Pipeline Active...' : 'Run Full Pipeline'}
      </Button>

      {/* Pipeline Log */}
      <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xs font-medium text-white/75 uppercase tracking-widest">
              Pipeline Log
            </h3>
            <p className="text-xs text-secondary mt-1">
              Live runs update every few seconds. History keeps the last
              {' '}{historyData?.history?.length ?? 0} entries.
            </p>
          </div>
          {/* Compact legend so the colors are self-documenting. */}
          <div className="hidden md:flex items-center gap-1.5 text-[10px] text-secondary">
            <Badge label="Running" variant="accent" />
            <Badge label="Queued" variant="amber" />
            <Badge label="Done" variant="green" />
            <Badge label="Failed" variant="red" />
            <Badge label="Skipped" variant="muted" />
          </div>
        </div>

        {liveRows.length === 0 && historyRows.length === 0 ? (
          <div className="border border-dashed border-white/10 rounded-md p-8 text-center">
            <p className="text-sm text-secondary">
              No log entries yet. Trigger a pipeline stage to see output, or
              wait for the next scheduled run.
            </p>
          </div>
        ) : (
          <div className="space-y-4 max-h-[28rem] overflow-y-auto pr-1">
            {liveRows.length > 0 && (
              <section>
                <h4 className="text-[10px] font-semibold uppercase tracking-widest text-secondary mb-2">
                  Active runs ({liveRows.length})
                </h4>
                <div className="space-y-2">
                  {liveRows.map((row) => (
                    <LogRowItem
                      key={row.key}
                      row={row}
                      expanded={expandedRows.has(row.key)}
                      onToggle={() => toggleRow(row.key)}
                      showOwner={isSuperuser}
                    />
                  ))}
                </div>
              </section>
            )}

            {historyRows.length > 0 && (
              <section>
                <h4 className="text-[10px] font-semibold uppercase tracking-widest text-secondary mb-2">
                  Run history
                </h4>
                <div className="space-y-2">
                  {historyRows.map((row) => (
                    <LogRowItem
                      key={row.key}
                      row={row}
                      expanded={expandedRows.has(row.key)}
                      onToggle={() => toggleRow(row.key)}
                      showOwner={isSuperuser}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </Card>
      </motion.div>

      {/* Confirm Modal */}
      <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="Run Full Pipeline">
        <p className="text-white/75 text-sm mb-4">
          This will trigger all pipeline stages sequentially: Discovery → Qualification →
          Personalization → Outreach → Report. Are you sure?
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={() => setShowConfirm(false)}>Cancel</Button>
          <Button onClick={confirmRun}>Confirm Run</Button>
        </div>
      </Modal>
    </motion.div>
  );
}

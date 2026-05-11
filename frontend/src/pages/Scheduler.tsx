import { useMemo, useState } from 'react';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import {
  useConfigJobs,
  useUpdateConfig,
  useMyJobConfig,
  useUpdateMyJobConfig,
  useMyNotificationConfig,
  useUpdateMyNotificationConfig,
} from '../hooks/useConfig';
import { useFreelancerStatus } from '../hooks/useFreelancerStatus';
import { useAuth } from '../hooks/useAuth';
import { Play, Pause, Save, Lock, AlertTriangle, Bell, BellOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { pageTransition, staggerContainer, staggerItem, scaleIn } from '../lib/motion';
import ErrorState from '../components/ui/ErrorState';
import type { JobEffectiveStatus } from '../lib/api';

/**
 * Scheduler page.
 *
 * Superuser: edits the authoritative global job configuration (RUN/HOLD,
 * hour/minute/day_of_week). Editing is locked while production is HOLD —
 * resume production from the Settings / Overview page first.
 *
 * Freelancer: manages personal per-job overrides. If the superuser has a
 * job on HOLD globally, the freelancer sees it as locked and cannot
 * override it. If production is HOLD, the entire personal panel is
 * read-only.
 */
export default function Scheduler() {
  const { user } = useAuth();
  const isSuperuser = !!user?.is_superuser;

  const { data: globalConfig, isLoading: globalLoading, isError: globalError, refetch: refetchGlobal } = useConfigJobs();
  const { data: myJobs, isLoading: myLoading, isError: myError, refetch: refetchMy } = useMyJobConfig();
  const { data: notifPrefs, isLoading: notifLoading } = useMyNotificationConfig();
  const { data: statusData } = useFreelancerStatus();
  const updateGlobal = useUpdateConfig();
  const updateMine = useUpdateMyJobConfig();
  const updateNotifs = useUpdateMyNotificationConfig();

  const productionHold = (statusData?.global_production_status ?? myJobs?.global_production_status) === 'HOLD';

  if (globalLoading || myLoading || notifLoading) return null;
  if (globalError || myError) {
    return (
      <motion.div className="space-y-6" variants={pageTransition} initial="initial" animate="animate">
        <PageHeader title="Job Scheduler" subtitle="Error loading scheduler config" />
        <ErrorState
          title="Failed to load scheduler"
          message="Could not fetch job configuration from the server."
          onRetry={() => {
            refetchGlobal();
            refetchMy();
          }}
        />
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-8" variants={pageTransition} initial="initial" animate="animate">
      <PageHeader
        title="Job Scheduler"
        subtitle={isSuperuser ? 'Global schedule and personal preferences' : 'Your personal job preferences'}
      />

      {productionHold && (
        <Card className="bg-warning/[0.08] border-warning/30" padding={true}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning mt-0.5" />
            <div className="text-sm text-warning">
              <p className="font-semibold">Production is on HOLD.</p>
              <p>
                {isSuperuser
                  ? 'Resume production from the Overview page before editing the global configuration.'
                  : 'All jobs are paused by the administrator. You cannot modify personal preferences until production resumes.'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {isSuperuser && globalConfig && (
        <GlobalConfigEditor
          config={globalConfig as Record<string, Record<string, string | number>>}
          locked={productionHold}
          onSave={(updates) => updateGlobal.mutate(updates)}
          saving={updateGlobal.isPending}
        />
      )}

      {myJobs && (
        <MyPreferences
          jobs={myJobs.jobs}
          locked={productionHold}
          onSave={(updates) => updateMine.mutate(updates)}
          saving={updateMine.isPending}
          notifPrefs={notifPrefs?.prefs ?? {}}
          notifGoverned={new Set(notifPrefs?.stages ?? [])}
          onSaveNotifs={(prefs) => updateNotifs.mutate(prefs)}
          savingNotifs={updateNotifs.isPending}
        />
      )}
    </motion.div>
  );
}

// ── Superuser global editor ─────────────────────────────────────────────

function GlobalConfigEditor({
  config,
  locked,
  onSave,
  saving,
}: {
  config: Record<string, Record<string, string | number>>;
  locked: boolean;
  onSave: (updates: Record<string, Record<string, string | number>>) => void;
  saving: boolean;
}) {
  const [local, setLocal] = useState<Record<string, Record<string, string | number>>>({});

  const merged = useMemo(() => {
    const out: Record<string, Record<string, string | number>> = {};
    for (const [id, cfg] of Object.entries(config)) {
      out[id] = { ...cfg, ...(local[id] ?? {}) };
    }
    return out;
  }, [config, local]);

  const patch = (jobId: string, updates: Record<string, string | number>) => {
    setLocal((prev) => ({ ...prev, [jobId]: { ...(prev[jobId] ?? {}), ...updates } }));
  };

  const hasChanges = Object.keys(local).length > 0;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Global Configuration</h2>
        <AnimatePresence>
          {hasChanges && !locked && (
            <motion.div variants={scaleIn} initial="hidden" animate="visible" exit="hidden">
              <Button
                size="sm"
                icon={<Save className="w-4 h-4" />}
                loading={saving}
                onClick={() => {
                  onSave(local);
                  setLocal({});
                }}
              >
                Save global config
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.div className="grid grid-cols-1 xl:grid-cols-2 gap-4" variants={staggerContainer} initial="hidden" animate="visible">
        {Object.entries(merged).map(([jobId, cfg]) => {
          const isRunning = String(cfg.status).toUpperCase() === 'RUN';
          const type = String(cfg.type ?? 'cron');

          return (
            <motion.div key={jobId} variants={staggerItem}>
              <Card padding={true}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-white capitalize">{jobId.replace(/_/g, ' ')}</h3>
                    <p className="text-xs text-white/75">{type}</p>
                  </div>
                  <Button
                    variant={isRunning ? 'outline' : 'primary'}
                    size="sm"
                    disabled={locked}
                    icon={isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    onClick={() => patch(jobId, { status: isRunning ? 'HOLD' : 'RUN' })}
                  >
                    {isRunning ? 'Pause' : 'Enable'}
                  </Button>
                </div>

                {type === 'cron' ? (
                  <div className="grid grid-cols-3 gap-3">
                    <NumberField
                      label="Hour"
                      value={cfg.hour as number | undefined}
                      min={0}
                      max={23}
                      disabled={locked}
                      onChange={(v) => patch(jobId, { hour: v })}
                    />
                    <NumberField
                      label="Minute"
                      value={cfg.minute as number | undefined}
                      min={0}
                      max={59}
                      disabled={locked}
                      onChange={(v) => patch(jobId, { minute: v })}
                    />
                    <DayOfWeekField
                      value={cfg.day_of_week as string | undefined}
                      disabled={locked}
                      onChange={(v) => patch(jobId, { day_of_week: v })}
                    />
                  </div>
                ) : (
                  <NumberField
                    label="Interval (minutes)"
                    value={cfg.minutes as number | undefined}
                    min={1}
                    max={59}
                    disabled={locked}
                    onChange={(v) => patch(jobId, { minutes: v })}
                  />
                )}
              </Card>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value?: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-white/75">
      {label}
      <input
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
        className="px-2 py-1 rounded-md border border-white/10 text-sm text-white disabled:bg-surface-2 disabled:text-white/70"
      />
    </label>
  );
}

function DayOfWeekField({
  value,
  disabled,
  onChange,
}: {
  value?: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-white/75">
      Day of week
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 rounded-md border border-white/10 text-sm text-white disabled:bg-surface-2 disabled:text-white/70"
      >
        <option value="">(any)</option>
        {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </label>
  );
}

// ── Personal per-freelancer toggles ─────────────────────────────────────

function MyPreferences({
  jobs,
  locked,
  onSave,
  saving,
  notifPrefs,
  notifGoverned,
  onSaveNotifs,
  savingNotifs,
}: {
  jobs: import('../lib/api').FreelancerJobConfigRow[];
  locked: boolean;
  onSave: (updates: Record<string, JobEffectiveStatus>) => void;
  saving: boolean;
  notifPrefs: Record<string, boolean>;
  notifGoverned: Set<string>;
  onSaveNotifs: (prefs: Record<string, boolean>) => void;
  savingNotifs: boolean;
}) {
  const [local, setLocal] = useState<Record<string, JobEffectiveStatus>>({});
  const [localNotifs, setLocalNotifs] = useState<Record<string, boolean>>({});
  const hasChanges = Object.keys(local).length > 0;
  const hasNotifChanges = Object.keys(localNotifs).length > 0;

  const view = jobs.map((j) => ({
    ...j,
    freelancer_status: (local[j.job_id] ?? j.freelancer_status) as JobEffectiveStatus,
  }));

  const toggle = (jobId: string, current: JobEffectiveStatus) => {
    setLocal((prev) => ({ ...prev, [jobId]: current === 'RUN' ? 'HOLD' : 'RUN' }));
  };

  const notifEnabled = (jobId: string): boolean => {
    if (jobId in localNotifs) return localNotifs[jobId];
    // Default to true when the server hasn't returned a value for this job
    // (e.g. brand-new job_id rolled out before the prefs row was seeded).
    return notifPrefs[jobId] ?? true;
  };

  const toggleNotif = (jobId: string) => {
    const next = !notifEnabled(jobId);
    setLocalNotifs((prev) => ({ ...prev, [jobId]: next }));
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">My Preferences</h2>
          <p className="text-sm text-white/75">
            Turn individual jobs off just for your account, or silence their notifications.
            Global HOLD jobs are locked. Each toggle only affects your own account.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AnimatePresence>
            {hasNotifChanges && (
              <motion.div variants={scaleIn} initial="hidden" animate="visible" exit="hidden">
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Bell className="w-4 h-4" />}
                  loading={savingNotifs}
                  onClick={() => {
                    onSaveNotifs(localNotifs);
                    setLocalNotifs({});
                  }}
                >
                  Save notifications
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {hasChanges && !locked && (
              <motion.div variants={scaleIn} initial="hidden" animate="visible" exit="hidden">
                <Button
                  size="sm"
                  icon={<Save className="w-4 h-4" />}
                  loading={saving}
                  onClick={() => {
                    onSave(local);
                    setLocal({});
                  }}
                >
                  Save preferences
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <Card padding={true}>
        <ul className="divide-y divide-gray-100">
          {view.map((j) => {
            const globalHold = j.global_status === 'HOLD';
            const rowLocked = locked || globalHold || j.system_only;
            const userStatus = j.freelancer_status;
            const effective = rowLocked ? j.effective_status : userStatus;
            const notifSupported = notifGoverned.has(j.job_id);
            const notifOn = notifEnabled(j.job_id);

            return (
              <li key={j.job_id} className="flex items-center justify-between py-3 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {rowLocked ? (
                    <Lock className="w-4 h-4 text-white/70 shrink-0" />
                  ) : effective === 'RUN' ? (
                    <Play className="w-4 h-4 text-success shrink-0" />
                  ) : (
                    <Pause className="w-4 h-4 text-warning shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white capitalize truncate">
                      {j.job_id.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-white/75 truncate">
                      Global: {j.global_status}
                      {j.system_only && ' · system-only'}
                      {globalHold && !j.system_only && ' · controlled by admin'}
                      {notifSupported && (notifOn ? ' · notifications on' : ' · notifications off')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {notifSupported && (
                    <button
                      type="button"
                      title={notifOn ? 'Silence notifications for this job' : 'Enable notifications for this job'}
                      aria-label={notifOn ? 'Silence notifications' : 'Enable notifications'}
                      aria-pressed={notifOn}
                      onClick={() => toggleNotif(j.job_id)}
                      className={`p-2 rounded-md border border-white/10 transition ${
                        notifOn
                          ? 'text-success hover:bg-success/10'
                          : 'text-white/60 hover:bg-white/5'
                      }`}
                    >
                      {notifOn ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                    </button>
                  )}
                  <Button
                    size="sm"
                    variant={userStatus === 'RUN' ? 'outline' : 'primary'}
                    disabled={rowLocked}
                    onClick={() => toggle(j.job_id, userStatus)}
                  >
                    {rowLocked ? 'Locked' : userStatus === 'RUN' ? 'Disable for me' : 'Enable for me'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

import { useHealth, useSystemToggle } from '../hooks/useConfig';
import { usePipelineStatus, useTriggerPipeline } from '../hooks/usePipeline';
import { useLeads } from '../hooks/useLeads';
import { useJobsConfig } from '../hooks/useJobs';
import Card, { StatCard } from '../components/ui/Card';
import DataTable from '../components/ui/DataTable';
import Badge, { statusBadge } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import StatusDot from '../components/ui/StatusDot';
import PageHeader from '../components/layout/PageHeader';
import { formatDate } from '../lib/utils';
import { PIPELINE_STAGES } from '../lib/constants';
import { useNavigate } from 'react-router-dom';
import { Users, Target, Send, Activity, Database, Clock, ArrowRight, Play, Pause, Inbox, Sliders } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Lead } from '../lib/api';
import { motion } from 'framer-motion';
import { pageTransition, staggerContainer, staggerItem, fadeInUp, defaultViewport } from '../lib/motion';
import ErrorState from '../components/ui/ErrorState';
import { ArcOrnament, ConstellationOrnament, WaveOrnament, GridOrnament } from '../components/ui/Illustration';

/**
 * System Overview Dashboard.
 *
 * Aggregates real-time health metrics, active job status, and recent lead
 * activity into a single operational interface. Each KPI tile carries an
 * inline SVG ornament for visual rhythm; the pipeline stage rail uses the
 * shared `step-chip` style for consistency across the app.
 */
export default function Overview() {
  const { data: health, isError: healthError, refetch: refetchHealth } = useHealth();
  const { data: pipeline, isError: pipelineError, refetch: refetchPipeline } = usePipelineStatus();
  const { data: leads, isError: leadsError, refetch: refetchLeads } = useLeads({ page: 1, limit: 5 });
  const { data: jobsConfig, isError: jobsError, refetch: refetchJobs } = useJobsConfig();
  const triggerPipeline = useTriggerPipeline();
  const toggleSystem = useSystemToggle();
  const navigate = useNavigate();

  const totalLeads = leads?.total ?? 0;
  const isPaused = !health?.production_status;

  const hasError = healthError || pipelineError || leadsError || jobsError;
  if (hasError) {
    return (
      <motion.div className="space-y-6" variants={pageTransition} initial="initial" animate="animate">
        <PageHeader eyebrow="Dashboard" title="System Overview" subtitle="Real-time operational dashboard" />
        <ErrorState
          title="Failed to load dashboard"
          message="One or more data sources could not be reached. Check your connection and try again."
          onRetry={() => { refetchHealth(); refetchPipeline(); refetchLeads(); refetchJobs(); }}
        />
      </motion.div>
    );
  }

  const activeStageIdx = PIPELINE_STAGES.findIndex((s) => s.id === pipeline?.last_run?.stage);

  return (
    <motion.div className="space-y-6" variants={pageTransition} initial="initial" animate="animate">
      <PageHeader
        eyebrow="Dashboard"
        title="System Overview"
        subtitle="Real-time pipeline, jobs and lead activity at a glance."
        actions={
          <Button
            size="sm"
            icon={<Send className="w-3.5 h-3.5" />}
            onClick={() => triggerPipeline.mutate('all')}
            loading={triggerPipeline.isPending}
          >
            Run Pipeline
          </Button>
        }
      />

      {/* Stat Tiles */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={staggerItem} className="flex flex-col">
          <StatCard
            label="Total Leads"
            value={totalLeads}
            icon={<Users />}
            decoration={<ConstellationOrnament />}
          />
        </motion.div>
        <motion.div variants={staggerItem} className="flex flex-col">
          <StatCard
            label="Scheduler"
            value={pipeline?.scheduler_running ? 'Active' : 'Stopped'}
            icon={<Clock />}
            decoration={<ArcOrnament />}
            trend={pipeline?.scheduler_running ? 'Running on cadence' : 'Currently paused'}
            trendDirection={pipeline?.scheduler_running ? 'up' : 'neutral'}
          />
        </motion.div>
        <motion.div variants={staggerItem} className="flex flex-col">
          <StatCard
            label="Active Jobs"
            value={pipeline?.jobs?.length ?? 0}
            icon={<Activity />}
            decoration={<WaveOrnament />}
          />
        </motion.div>
        <motion.div variants={staggerItem} className="flex flex-col">
          <StatCard
            label="Last Pipeline"
            value={pipeline?.last_run?.status ?? '—'}
            icon={<Target />}
            decoration={<GridOrnament />}
            trend={pipeline?.last_run?.at ? formatDate(pipeline.last_run.at) : undefined}
          />
        </motion.div>
      </motion.div>

      {/* Pipeline Status + System Health */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
        variants={fadeInUp}
        initial="hidden"
        whileInView="visible"
        viewport={defaultViewport}
      >
        {/* Pipeline Status — spans 2 cols */}
        <Card
          className="lg:col-span-2"
          title={<><span>Pipeline Status</span></>}
          actions={
            <span className="text-[11px] font-mono text-tertiary">
              {pipeline?.last_run?.at ? `Last run · ${formatDate(pipeline.last_run.at)}` : 'No runs yet'}
            </span>
          }
        >
          <div className="flex flex-wrap items-center gap-y-2 gap-x-1.5 mb-5">
            {PIPELINE_STAGES.map((stage, i) => {
              const isActive = pipeline?.last_run?.stage === stage.id;
              const isDone = activeStageIdx > -1 && i < activeStageIdx;
              return (
                <div key={stage.id} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'step-chip',
                      isActive && 'is-active',
                      isDone && 'is-done',
                    )}
                  >
                    {stage.label}
                  </span>
                  {i < PIPELINE_STAGES.length - 1 && (
                    <span className="text-white/20 text-[10px]" aria-hidden>→</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <span className="text-tertiary">
              Status: <span className="text-white font-mono">{pipeline?.last_run?.status ?? '—'}</span>
            </span>
            <span className="text-tertiary">
              Jobs queued: <span className="text-white font-mono">{pipeline?.jobs?.length ?? 0}</span>
            </span>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={<Send className="w-3.5 h-3.5" />}
              onClick={() => triggerPipeline.mutate('all')}
              loading={triggerPipeline.isPending}
            >
              Run Full Pipeline
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Activity className="w-3.5 h-3.5" />}
              onClick={() => navigate('/pipeline')}
            >
              Pipeline Control
            </Button>
          </div>
        </Card>

        {/* System Health */}
        <Card title="System Health">
          <div className="space-y-3">
            {[
              { label: 'API Status', value: health?.status === 'healthy' ? 'OK' : 'Error', variant: health?.status === 'healthy' ? 'teal' : 'red' },
              { label: 'Scheduler', value: health?.scheduler_running ? 'Running' : 'Stopped', variant: health?.scheduler_running ? 'teal' : 'red' },
              { label: 'Production', value: health?.production_status ? 'RUN' : 'HOLD', variant: health?.production_status ? 'teal' : 'amber' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-[13px] text-secondary">{row.label}</span>
                <Badge label={row.value} variant={row.variant as 'teal' | 'red' | 'amber'} />
              </div>
            ))}
            <div className="hairline" />
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-secondary">Version</span>
              <span className="text-[12px] font-mono text-white">{health?.version ?? '—'}</span>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Recent Leads */}
      <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
        <Card
          padding={false}
          title="Recent Leads"
          actions={
            <button
              onClick={() => navigate('/leads')}
              className="text-action group"
            >
              View all
              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </button>
          }
        >
          <DataTable<Lead & Record<string, unknown>>
            className="border-0 rounded-none"
            columns={[
              { key: 'business_name', label: 'Business', render: (_, row) => <span className="text-white font-medium">{String(row.business_name)}</span> },
              { key: 'city', label: 'City' },
              { key: 'category', label: 'Category' },
              { key: 'status', label: 'Status', render: (_, row) => statusBadge(String(row.status)) },
              { key: 'created_at', label: 'Discovered', render: (_, row) => <span className="font-mono text-xs text-tertiary">{formatDate(String(row.created_at))}</span> },
            ]}
            data={(leads?.leads ?? []) as unknown as (Lead & Record<string, unknown>)[]}
            onRowClick={(row) => navigate(`/leads/${row.id}`)}
            loading={!leads}
            emptyMessage="No leads discovered yet"
            emptyHint="Trigger a discovery run from the pipeline page or wait for the next scheduled job."
          />
        </Card>
      </motion.div>

      {/* Jobs + Quick Actions */}
      <motion.div className="grid grid-cols-1 lg:grid-cols-2 gap-4" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
        {/* Job Status */}
        <Card title="Job Status" actions={<span className="text-[11px] font-mono text-tertiary">{jobsConfig ? `${Object.keys(jobsConfig).length} jobs` : ''}</span>}>
          <div className="space-y-2">
            {jobsConfig && Object.entries(jobsConfig).map(([jobId, config]) => {
              const isRunning = String(config.status).toUpperCase() === 'RUN';
              return (
                <div
                  key={jobId}
                  className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-white/[0.025] transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <StatusDot status={isRunning ? 'live' : 'hold'} />
                    <span className="text-[13px] text-white/90 font-mono truncate">{jobId}</span>
                  </div>
                  <Badge
                    label={isRunning ? 'Running' : 'Paused'}
                    variant={isRunning ? 'teal' : 'amber'}
                  />
                </div>
              );
            })}
            {!jobsConfig && (
              <p className="text-[13px] text-tertiary font-mono px-3">Loading jobs…</p>
            )}
          </div>
        </Card>

        {/* Quick Actions */}
        <Card title="Quick Actions & Control">
          <div className="space-y-4">
            
            {/* System Status Banner & Switch */}
            <div className="rounded-lg p-3 border border-white/[0.06] bg-white/[0.015] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-white/90 uppercase tracking-wider">System Outreach Switch</p>
                <p className="text-[11px] text-tertiary mt-0.5">
                  {!isPaused ? 'Scheduler is actively running jobs.' : 'Outreach is paused (APScheduler on hold).'}
                </p>
              </div>
              <Button
                variant={isPaused ? 'primary' : 'outline'}
                size="sm"
                className="w-full sm:w-auto font-mono text-[10px] uppercase tracking-wider"
                icon={isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                onClick={() => toggleSystem.mutate(isPaused ? 'resume' : 'hold')}
                loading={toggleSystem.isPending}
              >
                {isPaused ? 'Resume' : 'Pause'}
              </Button>
            </div>

            {/* Core Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="w-full justify-center text-xs"
                icon={<Send className="w-3.5 h-3.5" />}
                onClick={() => triggerPipeline.mutate('all')}
                loading={triggerPipeline.isPending}
              >
                Run Pipeline
              </Button>
              <Button
                variant="outline"
                className="w-full justify-center text-xs"
                icon={<Sliders className="w-3.5 h-3.5" />}
                onClick={() => navigate('/pipeline')}
              >
                Control
              </Button>
              <Button
                variant="outline"
                className="w-full justify-center text-xs"
                icon={<Database className="w-3.5 h-3.5" />}
                onClick={() => navigate('/analytics')}
              >
                Analytics
              </Button>
            </div>

            {/* Quick Navigation Shortcuts Grid */}
            <div className="border-t border-white/[0.06] pt-4">
              <p className="eyebrow mb-2.5">Dashboard Shortcuts</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={() => navigate('/discovery-targets')}
                  className="flex items-start gap-2.5 p-2.5 rounded-lg border border-white/[0.04] bg-white/[0.01] hover:border-white/[0.12] hover:bg-white/[0.025] transition-all text-left group"
                >
                  <div className="icon-bubble icon-bubble-sm flex-shrink-0 group-hover:bg-white/[0.06]">
                    <Target className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-white/90 leading-tight">Lead Discovery</p>
                    <p className="text-[10px] text-tertiary mt-0.5 line-clamp-1">Manage target locations and keywords</p>
                  </div>
                </button>

                <button
                  onClick={() => navigate('/inbox')}
                  className="flex items-start gap-2.5 p-2.5 rounded-lg border border-white/[0.04] bg-white/[0.01] hover:border-white/[0.12] hover:bg-white/[0.025] transition-all text-left group"
                >
                  <div className="icon-bubble icon-bubble-sm flex-shrink-0 group-hover:bg-white/[0.06]">
                    <Inbox className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-white/90 leading-tight">Smart Inbox</p>
                    <p className="text-[10px] text-tertiary mt-0.5 line-clamp-1">Review drafts and reply to leads</p>
                  </div>
                </button>

                <button
                  onClick={() => navigate('/campaigns')}
                  className="flex items-start gap-2.5 p-2.5 rounded-lg border border-white/[0.04] bg-white/[0.01] hover:border-white/[0.12] hover:bg-white/[0.025] transition-all text-left group"
                >
                  <div className="icon-bubble icon-bubble-sm flex-shrink-0 group-hover:bg-white/[0.06]">
                    <Send className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-white/90 leading-tight">Campaigns</p>
                    <p className="text-[10px] text-tertiary mt-0.5 line-clamp-1">Track outreach metrics & statistics</p>
                  </div>
                </button>

                <button
                  onClick={() => navigate('/leads')}
                  className="flex items-start gap-2.5 p-2.5 rounded-lg border border-white/[0.04] bg-white/[0.01] hover:border-white/[0.12] hover:bg-white/[0.025] transition-all text-left group"
                >
                  <div className="icon-bubble icon-bubble-sm flex-shrink-0 group-hover:bg-white/[0.06]">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-white/90 leading-tight">Leads CRM</p>
                    <p className="text-[10px] text-tertiary mt-0.5 line-clamp-1">Search and manage all discovered leads</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Diagnostics Footer */}
            <div className="border-t border-white/[0.06] pt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-tertiary">
              <span className="flex items-center gap-1.5">
                <span className={cn('w-1.5 h-1.5 rounded-full', isPaused ? 'bg-warning animate-pulse' : 'bg-success animate-pulse')} />
                Env: <span className="text-white">{health?.environment ?? 'Production'}</span>
              </span>
              <span>API: <span className="text-white">Active</span></span>
              <span>v{health?.version ?? '1.0.0'}</span>
            </div>

          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}

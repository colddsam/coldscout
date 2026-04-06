import { useHealth } from '../hooks/useConfig';
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
import { Users, Target, Send, Activity, Database, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Lead } from '../lib/api';
import { motion } from 'framer-motion';
import { pageTransition, staggerContainer, staggerItem, fadeInUp, defaultViewport } from '../lib/motion';
import ErrorState from '../components/ui/ErrorState';

/**
 * System Overview Dashboard.
 * 
 * Aggregates real-time health metrics, active job status, and recent lead activity 
 * into a single operational interface. Provides high-level KPIs and quick links 
 * to primary system controls.
 */
export default function Overview() {
  const { data: health, isError: healthError, refetch: refetchHealth } = useHealth();
  const { data: pipeline, isError: pipelineError, refetch: refetchPipeline } = usePipelineStatus();
  const { data: leads, isError: leadsError, refetch: refetchLeads } = useLeads({ page: 1, limit: 5 });
  const { data: jobsConfig, isError: jobsError, refetch: refetchJobs } = useJobsConfig();
  const triggerPipeline = useTriggerPipeline();
  const navigate = useNavigate();

  const totalLeads = leads?.total ?? 0;

  const hasError = healthError || pipelineError || leadsError || jobsError;
  if (hasError) {
    return (
      <motion.div className="space-y-6" variants={pageTransition} initial="initial" animate="animate">
        <PageHeader title="System Overview" subtitle="Real-time operational dashboard" />
        <ErrorState
          title="Failed to load dashboard"
          message="One or more data sources could not be reached. Check your connection and try again."
          onRetry={() => { refetchHealth(); refetchPipeline(); refetchLeads(); refetchJobs(); }}
        />
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-6" variants={pageTransition} initial="initial" animate="animate">
      <PageHeader title="System Overview" subtitle="Real-time operational dashboard" />

      {/* Stat Cards Row */}
      <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" variants={staggerContainer} initial="hidden" animate="visible">
        <motion.div variants={staggerItem}><StatCard label="Total Leads" value={totalLeads} icon={<Users className="w-8 h-8" />} /></motion.div>
        <motion.div variants={staggerItem}><StatCard label="Scheduler" value={pipeline?.scheduler_running ? 'Active' : 'Stopped'} icon={<Clock className="w-8 h-8" />} /></motion.div>
        <motion.div variants={staggerItem}><StatCard label="Active Jobs" value={pipeline?.jobs?.length ?? 0} icon={<Activity className="w-8 h-8" />} /></motion.div>
        <motion.div variants={staggerItem}><StatCard label="Last Pipeline" value={pipeline?.last_run?.status ?? '—'} icon={<Target className="w-8 h-8" />} /></motion.div>
      </motion.div>

      {/* Pipeline Status + System Health */}
      <motion.div className="grid grid-cols-1 lg:grid-cols-2 gap-4" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
        {/* Pipeline Status */}
        <Card>
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-4">Pipeline Status</h3>
          <div className="flex flex-wrap items-center gap-y-3 gap-x-2 mb-4">
            {PIPELINE_STAGES.map((stage, i) => (
              <div key={stage.id} className="flex items-center gap-2">
                <div className={cn(
                  "px-2.5 py-1.5 rounded-md text-[10px] md:text-xs font-mono border transition-all",
                  pipeline?.last_run?.stage === stage.id
                    ? 'bg-black text-white border-black shadow-vercel'
                    : 'bg-accents-1 text-secondary border-accents-2 hover:border-accents-3 hover:bg-white'
                )}>
                  {stage.label}
                </div>
                {i < PIPELINE_STAGES.length - 1 && (
                  <span className="text-gray-300 text-[10px]">→</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-400 font-mono">
            <span>Last run: {pipeline?.last_run?.at ? formatDate(pipeline.last_run.at) : '—'}</span>
            <span>Status: {pipeline?.last_run?.status ?? '—'}</span>
          </div>
          <div className="mt-4">
            <Button
              size="sm"
              icon={<Send className="w-3.5 h-3.5" />}
              onClick={() => triggerPipeline.mutate('all')}
              loading={triggerPipeline.isPending}
            >
              Run Full Pipeline
            </Button>
          </div>
        </Card>

        {/* System Health */}
        <Card>
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-4">System Health</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">API Status</span>
              <Badge label={health?.status === 'healthy' ? 'OK' : 'Error'} variant={health?.status === 'healthy' ? 'teal' : 'red'} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Scheduler</span>
              <Badge label={health?.scheduler_running ? 'Running' : 'Stopped'} variant={health?.scheduler_running ? 'teal' : 'red'} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Production Status</span>
              <Badge label={health?.production_status ? 'RUN' : 'HOLD'} variant={health?.production_status ? 'teal' : 'amber'} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Version</span>
              <span className="text-xs font-mono text-black">{health?.version ?? '—'}</span>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Recent Leads */}
      <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-widest">Recent Leads</h3>
          <Button variant="ghost" size="sm" onClick={() => navigate('/leads')}>View All →</Button>
        </div>
        <DataTable<Lead & Record<string, unknown>>
          columns={[
            { key: 'business_name', label: 'Business', render: (_, row) => <span className="text-gray-900 font-medium">{String(row.business_name)}</span> },
            { key: 'city', label: 'City' },
            { key: 'category', label: 'Category' },
            { key: 'status', label: 'Status', render: (_, row) => statusBadge(String(row.status)) },
            { key: 'created_at', label: 'Discovered', render: (_, row) => <span className="font-mono text-xs">{formatDate(String(row.created_at))}</span> },
          ]}
          data={(leads?.leads ?? []) as unknown as (Lead & Record<string, unknown>)[]}
          onRowClick={(row) => navigate(`/leads/${row.id}`)}
          loading={!leads}
          emptyMessage="No leads discovered yet"
        />
      </Card>
      </motion.div>

      {/* Jobs + Quick Actions */}
      <motion.div className="grid grid-cols-1 lg:grid-cols-2 gap-4" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
        {/* Job Status */}
        <Card>
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-4">Job Status</h3>
          <div className="space-y-3">
            {jobsConfig && Object.entries(jobsConfig).map(([jobId, config]) => (
              <div key={jobId} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-3">
                  <StatusDot status={String(config.status).toUpperCase() === 'RUN' ? 'live' : 'hold'} />
                  <span className="text-sm text-gray-700 font-mono">{jobId}</span>
                </div>
                <Badge
                  label={String(config.status).toUpperCase()}
                  variant={String(config.status).toUpperCase() === 'RUN' ? 'teal' : 'amber'}
                />
              </div>
            ))}
            {!jobsConfig && (
              <p className="text-sm text-gray-400 font-mono">Loading jobs...</p>
            )}
          </div>
        </Card>

        {/* Quick Actions */}
        <Card>
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <Button
              className="w-full"
              icon={<Send className="w-4 h-4" />}
              onClick={() => triggerPipeline.mutate('all')}
              loading={triggerPipeline.isPending}
            >
              Run Full Pipeline
            </Button>
            <Button
              variant="outline"
              className="w-full"
              icon={<Activity className="w-4 h-4" />}
              onClick={() => navigate('/pipeline')}
            >
              Pipeline Control
            </Button>
            <Button
              variant="outline"
              className="w-full"
              icon={<Database className="w-4 h-4" />}
              onClick={() => navigate('/analytics')}
            >
              View Analytics
            </Button>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}

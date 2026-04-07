import { useState } from 'react';
import { usePipelineStatus, usePipelineHistory, useTriggerPipeline } from '../hooks/usePipeline';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

import Modal from '../components/ui/Modal';
import PageHeader from '../components/layout/PageHeader';
import Spinner from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';
import { PIPELINE_STAGES } from '../lib/constants';
import { Search, CheckCircle, Sparkles, Send, BarChart2, TrendingUp, Play, Zap, Lock, Clock } from 'lucide-react';
import type { PipelineStage, ActiveStageJob } from '../lib/api';
import { motion } from 'framer-motion';
import { pageTransition, staggerContainer, staggerItem, fadeInUp, defaultViewport } from '../lib/motion';
import ErrorState from '../components/ui/ErrorState';

const ICON_MAP: Record<string, React.ElementType> = {
  Search, CheckCircle, Sparkles, Send, BarChart2, TrendingUp,
};

function StageStatusBadge({ job }: { job?: ActiveStageJob }) {
  if (!job) return null;

  if (job.status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">
        <Spinner size="xs" /> Running
      </span>
    );
  }

  if (job.status === 'queued') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
        <Clock className="w-3 h-3" /> Queued
      </span>
    );
  }

  return null;
}

/**
 * Pipeline Control Center.
 *
 * Provides granular manual control over the AI Lead Generation workflow.
 * Supports stage-specific triggers, full pipeline execution, per-stage
 * lock states, and persistent operation logging.
 */
export default function Pipeline() {
  const { data: pipeline, isError, refetch } = usePipelineStatus(3000);
  const { data: historyData } = usePipelineHistory(5000);
  const trigger = useTriggerPipeline();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleRunFull = () => setShowConfirm(true);

  const confirmRun = () => {
    trigger.mutate('all');
    setShowConfirm(false);
  };

  const handleRunStage = (stage: PipelineStage) => {
    trigger.mutate(stage);
  };

  const activeStages = pipeline?.active_stages ?? {};
  const hasAnyRunning = Object.values(activeStages).some(
    (j) => j.status === 'running' || j.status === 'queued'
  );

  const isStageActive = (stageId: string): boolean => {
    const job = activeStages[stageId];
    return job?.status === 'running' || job?.status === 'queued';
  };

  // Build log entries from persistent history + active job logs
  const logEntries: { text: string; status?: string }[] = [];

  // Add active job logs first (current runs)
  for (const job of Object.values(activeStages)) {
    for (const line of job.logs) {
      logEntries.push({ text: `[${job.stage}] ${line}`, status: job.status });
    }
  }

  // Add history entries
  if (historyData?.history) {
    for (const entry of historyData.history) {
      const endTime = entry.ended_at
        ? new Date(entry.ended_at).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
          })
        : '—';
      const statusIcon = entry.status === 'completed' ? '\u2705' : '\u274c';
      logEntries.push({
        text: `${statusIcon} [${endTime}] ${entry.stage} — ${entry.status} (${entry.triggered_by})`,
        status: entry.status,
      });
    }
  }

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
      <div className={`rounded-lg p-6 border ${hasAnyRunning ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-center gap-4">
          {hasAnyRunning ? (
            <>
              <Spinner size="md" />
              <div>
                <p className="text-emerald-700 font-semibold">Pipeline Active</p>
                <p className="text-sm text-gray-500">
                  Running: {Object.entries(activeStages)
                    .filter(([, j]) => j.status === 'running')
                    .map(([s]) => s)
                    .join(', ') || '—'}
                  {Object.values(activeStages).some((j) => j.status === 'queued') && (
                    <> · Queued: {Object.entries(activeStages)
                      .filter(([, j]) => j.status === 'queued')
                      .map(([s]) => s)
                      .join(', ')}
                    </>
                  )}
                </p>
              </div>
            </>
          ) : (
            <div>
              <p className="text-gray-900 font-semibold">Pipeline Idle</p>
              <p className="text-sm text-gray-500 font-mono">
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
            <Card className={isBusy ? 'border-black ring-1 ring-black/10' : ''}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-md ${isBusy ? 'bg-black' : 'bg-gray-100'}`}>
                    {isBusy && activeJob?.status === 'running' ? (
                      <Spinner size="xs" className="text-white" />
                    ) : isBusy && activeJob?.status === 'queued' ? (
                      <Lock className="w-5 h-5 text-white" />
                    ) : (
                      <Icon className={`w-5 h-5 text-gray-500`} />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{stage.label}</h3>
                    <p className="text-xs text-gray-500">{stage.description}</p>
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

      {/* Persistent Log */}
      <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
      <Card>
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-3">Pipeline Log</h3>
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4 max-h-80 overflow-y-auto font-mono text-xs space-y-1">
          {logEntries.length === 0 ? (
            <p className="text-gray-400">No log entries yet. Trigger a pipeline stage to see output.</p>
          ) : (
            logEntries.map((entry, i) => (
              <p
                key={i}
                className={
                  entry.status === 'failed' ? 'text-red-600' :
                  entry.status === 'running' ? 'text-emerald-600' :
                  entry.status === 'queued' ? 'text-amber-600' :
                  'text-gray-600'
                }
              >
                {entry.text}
              </p>
            ))
          )}
        </div>
      </Card>
      </motion.div>

      {/* Confirm Modal */}
      <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="Run Full Pipeline">
        <p className="text-gray-500 text-sm mb-4">
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

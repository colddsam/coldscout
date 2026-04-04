import { useState } from 'react';
import { usePipelineStatus, useTriggerPipeline } from '../hooks/usePipeline';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

import Modal from '../components/ui/Modal';
import PageHeader from '../components/layout/PageHeader';
import Spinner from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';
import { PIPELINE_STAGES } from '../lib/constants';
import { Search, CheckCircle, Sparkles, Send, BarChart2, TrendingUp, Play, Zap } from 'lucide-react';
import type { PipelineStage } from '../lib/api';
import { motion } from 'framer-motion';
import { pageTransition, staggerContainer, staggerItem, fadeInUp, defaultViewport } from '../lib/motion';

const ICON_MAP: Record<string, React.ElementType> = {
  Search, CheckCircle, Sparkles, Send, BarChart2, TrendingUp,
};

/**
 * Pipeline Control Center.
 * 
 * Provides granular manual control over the AI Lead Generation workflow.
 * Supports stage-specific triggers, full pipeline execution, and live 
 * operation logging for real-time feedback.
 */
export default function Pipeline() {
  const { data: pipeline } = usePipelineStatus(5000);
  const trigger = useTriggerPipeline();
  const [showConfirm, setShowConfirm] = useState(false);
  const [logEntries, setLogEntries] = useState<string[]>([]);

  const handleRunFull = () => setShowConfirm(true);

  const confirmRun = () => {
    const now = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogEntries((prev) => [...prev, `[${now}] Pipeline: all | Status: triggered`].slice(-20));
    trigger.mutate('all');
    setShowConfirm(false);
  };

  const handleRunStage = (stage: PipelineStage) => {
    const now = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogEntries((prev) => [...prev, `[${now}] Stage: ${stage} | Status: triggered`].slice(-20));
    trigger.mutate(stage);
  };

  const isRunning = pipeline?.last_run?.status === 'running';

  return (
    <motion.div className="space-y-6" variants={pageTransition} initial="initial" animate="animate">
      <PageHeader title="Pipeline Control" subtitle="Trigger and monitor the AI lead generation pipeline" />

      {/* Status Banner */}
      <motion.div variants={fadeInUp} initial="hidden" animate="visible">
      <div className={`rounded-lg p-6 border ${isRunning ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-center gap-4">
          {isRunning ? (
            <>
              <Spinner size="md" />
              <div>
                <p className="text-emerald-700 font-semibold">Pipeline Running</p>
                <p className="text-sm text-gray-500">Current stage: {pipeline?.last_run?.stage ?? 'unknown'}</p>
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
          const isActive = pipeline?.last_run?.stage === stage.id;

          return (
            <motion.div key={stage.id} variants={staggerItem}>
            <Card className={isActive ? 'border-black' : ''}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-md ${isActive ? 'bg-black' : 'bg-gray-100'}`}>
                    <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{stage.label}</h3>
                    <p className="text-xs text-gray-500">{stage.description}</p>
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                icon={<Play className="w-3.5 h-3.5" />}
                onClick={() => handleRunStage(stage.id as PipelineStage)}
                loading={trigger.isPending && trigger.variables === stage.id}
              >
                Run Stage
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
        disabled={isRunning}
      >
        {isRunning ? 'Pipeline Running...' : 'Run Full Pipeline'}
      </Button>

      {/* Live Log */}
      <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
      <Card>
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-3">Pipeline Log</h3>
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4 max-h-64 overflow-y-auto font-mono text-xs space-y-1">
          {logEntries.length === 0 ? (
            <p className="text-gray-400">No log entries yet. Trigger a pipeline stage to see output.</p>
          ) : (
            logEntries.map((entry, i) => (
              <p key={i} className="text-gray-600">{entry}</p>
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

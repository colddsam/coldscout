import { useState } from 'react';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useConfigJobs, useUpdateConfig } from '../hooks/useConfig';
import { PIPELINE_STAGES } from '../lib/constants';
import { Play, Pause, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { pageTransition, staggerContainer, staggerItem, scaleIn } from '../lib/motion';
import ErrorState from '../components/ui/ErrorState';

/**
 * The Scheduler page provides fine-grained control over the pipeline jobs.
 *
 * Each step of the pipeline (Discovery, Qualification, Outreach, etc.) runs on
 * an independent CRON schedule as configured in `jobs_config.json`. This page
 * reads that file dynamically and allows operators to adjust the schedule or
 * temporarily pause specific stages without stopping the whole system.
 *
 * Example use case: Pausing outreach campaigns on holidays but allowing the
 * scraper to continue running discovery sweeps.
 */
export default function Scheduler() {
  const { data: config, isLoading, isError, refetch } = useConfigJobs();
  const updateConfig = useUpdateConfig();
  const [localConfig, setLocalConfig] = useState<Record<string, Record<string, string>>>({});

  if (isLoading) return null;

  if (isError) {
    return (
      <motion.div className="space-y-6" variants={pageTransition} initial="initial" animate="animate">
        <PageHeader title="Job Scheduler" subtitle="Error loading scheduler config" />
        <ErrorState title="Failed to load scheduler" message="Could not fetch job configuration from the server." onRetry={refetch} />
      </motion.div>
    );
  }

  const mergedConfig = { ...(config || {}), ...localConfig } as Record<string, Record<string, string>>;

  const handleUpdate = (stage: string, updates: Record<string, string>) => {
    setLocalConfig(prev => ({
      ...prev,
      [stage]: { ...(mergedConfig[stage] || {}), ...updates }
    }));
  };

  const hasChanges = Object.keys(localConfig).length > 0;

  return (
    <motion.div className="space-y-6" variants={pageTransition} initial="initial" animate="animate">
      <PageHeader title="Job Scheduler" subtitle="Manage pipeline execution schedules" />

      <AnimatePresence>
      {hasChanges && (
        <motion.div variants={scaleIn} initial="hidden" animate="visible" exit="hidden">
        <Card className="bg-amber-50 border-amber-200" padding={true}>
          <div className="flex items-center justify-between">
            <span className="text-sm text-amber-700">You have unsaved schedule changes.</span>
            <Button size="sm" icon={<Save className="w-4 h-4" />} onClick={() => {
              updateConfig.mutate(localConfig);
              setLocalConfig({});
            }}>Save Configuration</Button>
          </div>
        </Card>
        </motion.div>
      )}
      </AnimatePresence>

      <motion.div className="grid grid-cols-1 xl:grid-cols-2 gap-6" variants={staggerContainer} initial="hidden" animate="visible">
        {PIPELINE_STAGES.map((stage) => {
          const jobConfig = mergedConfig[stage.id] || { status: 'HOLD', schedule: '0 0 * * *' };
          const isRunning = jobConfig.status === 'RUN';

          return (
            <motion.div key={stage.id} variants={staggerItem}>
            <Card padding={true}>
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 capitalize">{stage.label} Worker</h3>
                  <p className="text-sm text-gray-500">Controls the `{stage.id}` stage execution</p>
                </div>
                <Button
                  variant={isRunning ? 'outline' : 'primary'}
                  size="sm"
                  icon={isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  onClick={() => handleUpdate(stage.id, { status: isRunning ? 'HOLD' : 'RUN' })}
                  className="w-full sm:w-auto"
                >
                  {isRunning ? 'Pause Job' : 'Enable Job'}
                </Button>
              </div>

              <div className="space-y-4 border-t border-gray-100 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] items-center gap-2">
                  <span className="text-sm text-gray-500">Current Status</span>
                  <span className={`text-sm font-medium ${isRunning ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {isRunning ? '🟢 Active (Running on Schedule)' : '⏸️ Paused (On Hold)'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] items-center gap-2">
                  <span className="text-sm text-gray-500">Cron Schedule</span>
                  <input
                    type="text"
                    value={jobConfig.schedule}
                    onChange={(e) => handleUpdate(stage.id, { schedule: e.target.value })}
                    className="font-mono text-sm bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5 text-gray-900 w-full max-w-[200px] focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-colors"
                  />
                </div>
                <p className="text-xs text-gray-400 font-mono ml-0 sm:ml-[128px]">
                  Example: "0 9 * * 1-5" (9 AM, Mon-Fri)
                </p>
              </div>
            </Card>
            </motion.div>
          );
        })}
      </motion.div>
    </motion.div>
  );
}

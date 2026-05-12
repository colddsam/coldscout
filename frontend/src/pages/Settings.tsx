import { useState, useEffect } from 'react';
import { useConfigJobs, useUpdateConfig, useHealth, useSystemToggle } from '../hooks/useConfig';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Toggle from '../components/ui/Toggle';
import JsonEditor from '../components/ui/JsonEditor';
import { PageLoader } from '../components/ui/Spinner';
import PageHeader from '../components/layout/PageHeader';
import Badge from '../components/ui/Badge';
import toast from 'react-hot-toast';
import { Shield, Save, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';
import { pageTransition, staggerContainer, staggerItem } from '../lib/motion';
import NotificationsSettings from '../components/notifications/NotificationsSettings';

export default function Settings() {
  const { data: jobsConfig, isLoading: jobsLoading } = useConfigJobs();
  const { data: health, isLoading: healthLoading } = useHealth();
  const updateConfig = useUpdateConfig();
  const systemToggle = useSystemToggle();

  const [jsonStr, setJsonStr] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (jobsConfig) {
      const timer = setTimeout(() => {
        setJsonStr(JSON.stringify(jobsConfig, null, 2));
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [jobsConfig]);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(jsonStr);
      updateConfig.mutate(parsed);
      setDirty(false);
    } catch {
      toast.error('Invalid JSON: please fix syntax errors');
    }
  };

  const handleReset = () => {
    if (jobsConfig) {
      setJsonStr(JSON.stringify(jobsConfig, null, 2));
      setDirty(false);
    }
  };

  if (jobsLoading || healthLoading) return <PageLoader />;

  const isRunning = health?.production_status === true;

  return (
    <motion.div className="space-y-6" initial="initial" animate="animate" variants={pageTransition}>
      <PageHeader
        eyebrow="Admin"
        title="Settings"
        subtitle="System configuration & administration."
      />

      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-4" variants={staggerContainer} initial="hidden" animate="visible">
        {/* Main Config Editor (2/3) */}
        <motion.div className="lg:col-span-2 space-y-4" variants={staggerItem}>
          <Card
            title="Jobs Configuration"
            actions={
              <>
                {dirty && <Badge label="Modified" variant="amber" />}
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw className="w-3.5 h-3.5" />}
                  onClick={handleReset}
                  disabled={!dirty}
                >
                  Reset
                </Button>
                <Button
                  size="sm"
                  icon={<Save className="w-3.5 h-3.5" />}
                  onClick={handleSave}
                  loading={updateConfig.isPending}
                  disabled={!dirty}
                >
                  Save
                </Button>
              </>
            }
          >
            <JsonEditor
              value={jsonStr}
              onChange={(v) => { setJsonStr(v); setDirty(true); }}
              height={500}
            />
          </Card>
        </motion.div>

        {/* Sidebar Settings (1/3) */}
        <div className="space-y-4">
          {/* System Toggle */}
          <motion.div variants={staggerItem}>
            <Card title="Production Status">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-white font-medium">
                    System is {isRunning ? 'running' : 'on hold'}
                  </p>
                  <p className="text-meta mt-0.5">Toggle to hold or resume all scheduled jobs.</p>
                </div>
                <Toggle
                  value={isRunning}
                  onChange={() => systemToggle.mutate(isRunning ? 'hold' : 'resume')}
                  disabled={systemToggle.isPending}
                />
              </div>
            </Card>
          </motion.div>

          {/* Notifications */}
          <motion.div variants={staggerItem}>
            <NotificationsSettings />
          </motion.div>

          {/* Health Info */}
          <motion.div variants={staggerItem}>
            <Card title="System Info">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-tertiary">Version</span>
                  <span className="font-mono text-white text-[12px]">{health?.version ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-tertiary">Status</span>
                  <Badge label={health?.status === 'healthy' ? 'Healthy' : 'Error'} variant={health?.status === 'healthy' ? 'teal' : 'red'} />
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-tertiary">Scheduler</span>
                  <Badge label={health?.scheduler_running ? 'Active' : 'Inactive'} variant={health?.scheduler_running ? 'green' : 'amber'} />
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Security */}
          <motion.div variants={staggerItem}>
            <Card title={<><Shield className="w-3.5 h-3.5" />Security</>}>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-tertiary">API Key</span>
                  <span className="font-mono text-secondary text-[12px]">••••••••••</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-tertiary">Auth</span>
                  <Badge label="Proxy-side" variant="green" />
                </div>
                <p className="text-[11px] text-tertiary leading-relaxed mt-2 border-t border-white/[0.06] pt-2.5">
                  API key is stored in the proxy server environment and never exposed to the frontend.
                </p>
              </div>
            </Card>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}

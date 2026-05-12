/**
 * Threads Lead Generation Dashboard.
 *
 * Unified management page for the Meta Threads pipeline with four tabs:
 * Overview (stats + pipeline triggers), Profiles, Engagements, and Search Configs.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import Card, { StatCard } from '../components/ui/Card';
import DataTable, { type Column } from '../components/ui/DataTable';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import PageHeader from '../components/layout/PageHeader';
import { cn, formatDate } from '../lib/utils';
import {
  AtSign, Users, MessageCircle, Search, Play, Plus, Trash2,
  CheckCircle, Radio, Eye, X, Power, PowerOff
} from 'lucide-react';
import toast from 'react-hot-toast';
import { pageTransition, staggerContainer, staggerItem, fadeInUp } from '../lib/motion';
import {
  useThreadsStats,
  useThreadsProfiles,
  useThreadsEngagements,
  useThreadsSearchConfigs,
  useCreateSearchConfig,
  useDeleteSearchConfig,
  useUpdateSearchConfig,
  useThreadsTrigger,
  type ThreadsProfile,
  type ThreadsEngagement,
  type ThreadsSearchConfig,
} from '../hooks/useThreads';

type Tab = 'overview' | 'profiles' | 'engagements' | 'configs';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: Radio },
  { id: 'profiles', label: 'Profiles', icon: Users },
  { id: 'engagements', label: 'Engagements', icon: MessageCircle },
  { id: 'configs', label: 'Search Configs', icon: Search },
];

// ── Sub-Components ─────────────────────────────────────────

function qualificationBadge(status: string) {
  const map: Record<string, { variant: 'green' | 'teal' | 'amber' | 'red' | 'muted'; label: string }> = {
    qualified: { variant: 'green', label: 'Qualified' },
    engaged: { variant: 'teal', label: 'Engaged' },
    pending: { variant: 'amber', label: 'Pending' },
    disqualified: { variant: 'red', label: 'Disqualified' },
    converted: { variant: 'green', label: 'Converted' },
  };
  const cfg = map[status] || { variant: 'muted' as const, label: status };
  return <Badge label={cfg.label} variant={cfg.variant} />;
}

function engagementStatusBadge(status: string) {
  const map: Record<string, { variant: 'green' | 'teal' | 'amber' | 'red' | 'muted'; label: string }> = {
    sent: { variant: 'teal', label: 'Sent' },
    replied: { variant: 'green', label: 'Replied' },
    pending: { variant: 'amber', label: 'Pending' },
    failed: { variant: 'red', label: 'Failed' },
    reviewed: { variant: 'muted', label: 'Reviewed' },
  };
  const cfg = map[status] || { variant: 'muted' as const, label: status };
  return <Badge label={cfg.label} variant={cfg.variant} />;
}

// ── Overview Tab ───────────────────────────────────────────

function OverviewTab() {
  const { data: stats, isLoading } = useThreadsStats();
  const discovery = useThreadsTrigger('discovery');
  const qualification = useThreadsTrigger('qualification');
  const engagement = useThreadsTrigger('engagement');
  const responseCheck = useThreadsTrigger('response-check');

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><div className="h-20 bg-white/5 rounded animate-pulse" /></Card>
        ))}
      </div>
    );
  }

  const enabled = stats?.threads_enabled ?? false;

  return (
    <motion.div className="space-y-6" variants={staggerContainer} initial="hidden" animate="visible">
      {/* System Status Banner */}
      <motion.div variants={staggerItem}>
        <div className={cn(
          'rounded-xl border p-4 flex items-center gap-3',
          enabled ? 'border-white/[0.18] bg-white/[0.04]' : 'border-white/[0.08] bg-surface-2'
        )}>
          <div className={cn('icon-bubble flex-shrink-0', enabled && 'border-white/20 bg-white/[0.06] text-white')}>
            {enabled ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <p className="heading-section">
              Threads Pipeline · {enabled ? 'Active' : 'Inactive'}
            </p>
            <p className="text-meta mt-0.5">
              {enabled
                ? 'The pipeline is processing leads automatically.'
                : 'Set THREADS_ENABLED=true in .env and restart to activate.'}
            </p>
          </div>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={staggerItem}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            label="Profiles"
            value={stats?.profiles.total ?? 0}
            icon={<Users />}
            trend={`${stats?.profiles.qualified ?? 0} qualified`}
          />
          <StatCard
            label="Engaged"
            value={stats?.profiles.engaged ?? 0}
            icon={<MessageCircle />}
          />
          <StatCard
            label="Posts"
            value={stats?.posts ?? 0}
            icon={<AtSign />}
          />
          <StatCard
            label="Replies Today"
            value={`${stats?.rate_limiter?.replies_today ?? 0} / ${stats?.rate_limiter?.daily_cap ?? 20}`}
            icon={<Radio />}
            trend={stats?.rate_limiter?.can_reply ? 'Ready to reply' : 'Cap reached'}
            trendDirection={stats?.rate_limiter?.can_reply ? 'up' : 'down'}
          />
        </div>
      </motion.div>

      {/* Pipeline Triggers */}
      <motion.div variants={staggerItem}>
        <Card title="Manual Pipeline Triggers">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<Search className="w-3.5 h-3.5" />}
              loading={discovery.isPending}
              onClick={() => discovery.mutate()}
              disabled={!enabled}
            >
              Discovery
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<CheckCircle className="w-3.5 h-3.5" />}
              loading={qualification.isPending}
              onClick={() => qualification.mutate()}
              disabled={!enabled}
            >
              Qualification
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<MessageCircle className="w-3.5 h-3.5" />}
              loading={engagement.isPending}
              onClick={() => engagement.mutate()}
              disabled={!enabled}
            >
              Engagement
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Eye className="w-3.5 h-3.5" />}
              loading={responseCheck.isPending}
              onClick={() => responseCheck.mutate()}
              disabled={!enabled}
            >
              Check Responses
            </Button>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// ── Profiles Tab ──────────────────────────────────────────

function ProfilesTab() {
  const [statusFilter, setStatusFilter] = useState('');
  const { data: profiles, isLoading } = useThreadsProfiles({
    status: statusFilter || undefined,
    limit: 50,
  });

  const columns: Column<ThreadsProfile & Record<string, unknown>>[] = [
    {
      key: 'username',
      label: 'Username',
      render: (_, row) => (
        <span className="text-white font-medium">@{String(row.username)}</span>
      ),
    },
    { key: 'name', label: 'Name' },
    {
      key: 'followers_count',
      label: 'Followers',
      render: (_, row) => (
        <span className="font-mono text-xs">
          {row.followers_count != null ? Number(row.followers_count).toLocaleString() : '—'}
        </span>
      ),
      width: '100px',
    },
    {
      key: 'ai_score',
      label: 'Score',
      render: (_, row) => {
        const score = Number(row.ai_score) || 0;
        return (
          <span className={cn(
            'px-2 py-0.5 rounded-md font-mono text-xs border',
            score >= 70 ? 'bg-white text-black border-white' :
            score >= 40 ? 'bg-white/10 text-white border-white/20' :
            'bg-white/5 text-[#B0B0B0] border-white/10'
          )}>
            {score || '—'}
          </span>
        );
      },
      width: '80px',
    },
    {
      key: 'qualification_status',
      label: 'Status',
      render: (_, row) => qualificationBadge(String(row.qualification_status)),
    },
    {
      key: 'created_at',
      label: 'Discovered',
      render: (_, row) => (
        <span className="font-mono text-xs">{row.created_at ? formatDate(String(row.created_at)) : '—'}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card padding={true}>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field max-w-[200px]"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="qualified">Qualified</option>
            <option value="engaged">Engaged</option>
            <option value="disqualified">Disqualified</option>
            <option value="converted">Converted</option>
          </select>
          <span className="text-[11px] text-tertiary font-mono ml-auto">
            {profiles?.length ?? 0} profiles
          </span>
        </div>
      </Card>
      <Card padding={false}>
        <DataTable
          className="border-0 rounded-none"
          columns={columns}
          data={(profiles ?? []) as unknown as (ThreadsProfile & Record<string, unknown>)[]}
          loading={isLoading}
          emptyMessage="No Threads profiles discovered yet"
        />
      </Card>
    </div>
  );
}

// ── Engagements Tab ───────────────────────────────────────

function EngagementsTab() {
  const [statusFilter, setStatusFilter] = useState('');
  const { data: engagements, isLoading } = useThreadsEngagements({
    status: statusFilter || undefined,
    limit: 50,
  });

  const columns: Column<ThreadsEngagement & Record<string, unknown>>[] = [
    {
      key: 'reply_text',
      label: 'Reply',
      render: (_, row) => (
        <span className="text-[#B0B0B0] text-xs max-w-[300px] truncate block">
          {row.reply_text || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => engagementStatusBadge(String(row.status)),
    },
    {
      key: 'replied_at',
      label: 'Sent At',
      render: (_, row) => (
        <span className="font-mono text-xs">{row.replied_at ? formatDate(String(row.replied_at)) : '—'}</span>
      ),
    },
    {
      key: 'response_text',
      label: 'Response',
      render: (_, row) => (
        <span className="text-[#B0B0B0] text-xs max-w-[300px] truncate block">
          {row.response_text || '—'}
        </span>
      ),
    },
    {
      key: 'response_received_at',
      label: 'Response At',
      render: (_, row) => (
        <span className="font-mono text-xs">
          {row.response_received_at ? formatDate(String(row.response_received_at)) : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card padding={true}>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field max-w-[200px]"
          >
            <option value="">All Statuses</option>
            <option value="sent">Sent</option>
            <option value="replied">Replied</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
          <span className="text-[11px] text-tertiary font-mono ml-auto">
            {engagements?.length ?? 0} engagements
          </span>
        </div>
      </Card>
      <Card padding={false}>
        <DataTable
          className="border-0 rounded-none"
          columns={columns}
          data={(engagements ?? []) as unknown as (ThreadsEngagement & Record<string, unknown>)[]}
          loading={isLoading}
          emptyMessage="No engagements recorded yet"
        />
      </Card>
    </div>
  );
}

// ── Search Configs Tab ────────────────────────────────────

function SearchConfigsTab() {
  const { data: configs, isLoading } = useThreadsSearchConfigs();
  const createConfig = useCreateSearchConfig();
  const deleteConfig = useDeleteSearchConfig();
  const updateConfig = useUpdateSearchConfig();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [newCategory, setNewCategory] = useState('');

  const handleCreate = () => {
    if (!newKeyword.trim()) {
      toast.error('Keyword is required');
      return;
    }
    createConfig.mutate(
      { keyword: newKeyword.trim(), category: newCategory.trim() || undefined },
      {
        onSuccess: () => {
          setNewKeyword('');
          setNewCategory('');
          setShowAddForm(false);
        },
      }
    );
  };

  const handleToggle = (config: ThreadsSearchConfig) => {
    updateConfig.mutate({
      id: config.id,
      payload: { is_active: !config.is_active },
    });
  };

  return (
    <div className="space-y-3">
      <Card padding={true}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-tertiary font-mono">
            {configs?.length ?? 0} search configs
          </span>
          <Button
            variant="outline"
            size="sm"
            icon={showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? 'Cancel' : 'Add Keyword'}
          </Button>
        </div>

        {showAddForm && (
          <div className="mt-4 pt-4 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-2">
            <input
              type="text"
              placeholder="Keyword (e.g. need a website)"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              className="input-field"
            />
            <input
              type="text"
              placeholder="Category (optional)"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="input-field"
            />
            <Button size="sm" onClick={handleCreate} loading={createConfig.isPending}>
              Create
            </Button>
          </div>
        )}
      </Card>

      {isLoading ? (
        <Card>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 shimmer-bg rounded-lg" />
            ))}
          </div>
        </Card>
      ) : !configs?.length ? (
        <div className="empty-state">
          <Search className="w-7 h-7 text-tertiary mb-3" />
          <p className="heading-card mb-1">No search configs yet</p>
          <p className="text-meta max-w-xs">Add keywords to start discovering leads on Threads.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {configs.map((config) => (
            <div key={config.id} className="rounded-lg border border-white/[0.06] bg-surface-2 p-3 flex items-center justify-between gap-3 transition-colors hover:border-white/[0.14]">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => handleToggle(config)}
                  className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0',
                    config.is_active
                      ? 'bg-white text-black hover:bg-[#EAEAEA]'
                      : 'bg-white/[0.06] text-tertiary hover:bg-white/[0.1] hover:text-white'
                  )}
                  title={config.is_active ? 'Active — click to pause' : 'Paused — click to activate'}
                >
                  {config.is_active ? <Play className="w-3.5 h-3.5 fill-current" /> : <PowerOff className="w-3.5 h-3.5" />}
                </button>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-white truncate">{config.keyword}</p>
                  <p className="text-[11px] text-tertiary font-mono flex flex-wrap items-center gap-x-2 mt-0.5">
                    {config.category && <span>{config.category}</span>}
                    <span>{config.search_type}</span>
                    {config.last_searched_at && (
                      <span>· last {formatDate(config.last_searched_at)}</span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm(`Delete keyword "${config.keyword}"?`)) {
                    deleteConfig.mutate(config.id);
                  }
                }}
                className="row-action flex-shrink-0"
                aria-label={`Delete keyword ${config.keyword}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────

export default function Threads() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  return (
    <motion.div className="space-y-6" initial="initial" animate="animate" variants={pageTransition}>
      <PageHeader
        eyebrow="Channel"
        title="Threads Pipeline"
        subtitle="Meta Threads lead discovery, qualification & engagement."
        actions={<Badge label="Beta" variant="amber" />}
      />

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-white/[0.08] overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 text-[13px] font-medium transition-all border-b-2 -mb-[1px] whitespace-nowrap',
                activeTab === tab.id
                  ? 'border-white text-white'
                  : 'border-transparent text-tertiary hover:text-white hover:border-white/20',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <motion.div key={activeTab} variants={fadeInUp} initial="hidden" animate="visible">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'profiles' && <ProfilesTab />}
        {activeTab === 'engagements' && <EngagementsTab />}
        {activeTab === 'configs' && <SearchConfigsTab />}
      </motion.div>
    </motion.div>
  );
}

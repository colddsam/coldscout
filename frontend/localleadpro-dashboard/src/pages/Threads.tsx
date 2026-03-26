/**
 * Threads Lead Generation Dashboard.
 *
 * Unified management page for the Meta Threads pipeline with four tabs:
 * Overview (stats + pipeline triggers), Profiles, Engagements, and Search Configs.
 */
import { useState } from 'react';
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
          <Card key={i}><div className="h-20 bg-gray-50 rounded animate-pulse" /></Card>
        ))}
      </div>
    );
  }

  const enabled = stats?.threads_enabled ?? false;

  return (
    <div className="space-y-6">
      {/* System Status Banner */}
      <Card className={cn(
        'flex items-center gap-3',
        enabled ? 'border-black' : 'border-gray-300 bg-gray-50'
      )}>
        {enabled
          ? <Power className="w-5 h-5 text-black" />
          : <PowerOff className="w-5 h-5 text-gray-400" />
        }
        <div>
          <p className="text-sm font-semibold text-black">
            Threads Pipeline: {enabled ? 'Active' : 'Inactive'}
          </p>
          <p className="text-xs text-secondary">
            {enabled
              ? 'The pipeline is processing leads automatically.'
              : 'Set THREADS_ENABLED=true in .env and restart to activate.'}
          </p>
        </div>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Profiles"
          value={stats?.profiles.total ?? 0}
          icon={<Users className="w-5 h-5" />}
          trend={`${stats?.profiles.qualified ?? 0} qualified`}
        />
        <StatCard
          label="Engaged"
          value={stats?.profiles.engaged ?? 0}
          icon={<MessageCircle className="w-5 h-5" />}
        />
        <StatCard
          label="Posts"
          value={stats?.posts ?? 0}
          icon={<AtSign className="w-5 h-5" />}
        />
        <StatCard
          label="Replies Today"
          value={`${stats?.rate_limiter?.replies_today ?? 0} / ${stats?.rate_limiter?.daily_cap ?? 20}`}
          icon={<Radio className="w-5 h-5" />}
          trend={stats?.rate_limiter?.can_reply ? 'Ready to reply' : 'Cap reached'}
        />
      </div>

      {/* Pipeline Triggers */}
      <Card>
        <h3 className="text-sm font-semibold text-black mb-4 uppercase tracking-wider">Manual Pipeline Triggers</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Button
            variant="outline"
            size="sm"
            icon={<Search className="w-4 h-4" />}
            loading={discovery.isPending}
            onClick={() => discovery.mutate()}
            disabled={!enabled}
          >
            Run Discovery
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<CheckCircle className="w-4 h-4" />}
            loading={qualification.isPending}
            onClick={() => qualification.mutate()}
            disabled={!enabled}
          >
            Run Qualification
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<MessageCircle className="w-4 h-4" />}
            loading={engagement.isPending}
            onClick={() => engagement.mutate()}
            disabled={!enabled}
          >
            Run Engagement
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<Eye className="w-4 h-4" />}
            loading={responseCheck.isPending}
            onClick={() => responseCheck.mutate()}
            disabled={!enabled}
          >
            Check Responses
          </Button>
        </div>
      </Card>
    </div>
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
        <span className="text-gray-900 font-medium">@{String(row.username)}</span>
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
            score >= 70 ? 'bg-black text-white border-black' :
            score >= 40 ? 'bg-gray-100 text-black border-gray-300' :
            'bg-white text-gray-500 border-gray-200'
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
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-accents-1 border border-accents-2 rounded-md px-4 py-2 text-sm text-secondary focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-accents-3 transition-colors"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="qualified">Qualified</option>
            <option value="engaged">Engaged</option>
            <option value="disqualified">Disqualified</option>
            <option value="converted">Converted</option>
          </select>
          <span className="text-xs text-secondary font-mono">
            {profiles?.length ?? 0} profiles
          </span>
        </div>
      </Card>
      <Card padding={false}>
        <DataTable
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
        <span className="text-secondary text-xs max-w-[300px] truncate block">
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
        <span className="text-secondary text-xs max-w-[300px] truncate block">
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
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-accents-1 border border-accents-2 rounded-md px-4 py-2 text-sm text-secondary focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-accents-3 transition-colors"
          >
            <option value="">All Statuses</option>
            <option value="sent">Sent</option>
            <option value="replied">Replied</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
          <span className="text-xs text-secondary font-mono">
            {engagements?.length ?? 0} engagements
          </span>
        </div>
      </Card>
      <Card padding={false}>
        <DataTable
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
    <div className="space-y-4">
      <Card padding={true}>
        <div className="flex items-center justify-between">
          <span className="text-xs text-secondary font-mono">
            {configs?.length ?? 0} search configs
          </span>
          <Button
            variant="outline"
            size="sm"
            icon={showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? 'Cancel' : 'Add Keyword'}
          </Button>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="mt-4 pt-4 border-t border-accents-2 flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Keyword (e.g. need a website)"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              className="flex-1 bg-accents-1 border border-accents-2 rounded-md px-4 py-2 text-sm text-secondary placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-accents-3 transition-colors"
            />
            <input
              type="text"
              placeholder="Category (optional)"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="bg-accents-1 border border-accents-2 rounded-md px-4 py-2 text-sm text-secondary placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-accents-3 transition-colors min-w-[160px]"
            />
            <Button size="sm" onClick={handleCreate} loading={createConfig.isPending}>
              Create
            </Button>
          </div>
        )}
      </Card>

      {/* Configs List */}
      {isLoading ? (
        <Card>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-50 rounded animate-pulse" />
            ))}
          </div>
        </Card>
      ) : !configs?.length ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-secondary">
            <Search className="w-8 h-8 mb-3 text-accents-3" />
            <p className="font-mono text-sm">No search configs yet</p>
            <p className="text-xs mt-1">Add keywords to start discovering leads on Threads</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {configs.map((config) => (
            <Card key={config.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleToggle(config)}
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                    config.is_active
                      ? 'bg-black text-white'
                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                  )}
                  title={config.is_active ? 'Active — click to pause' : 'Paused — click to activate'}
                >
                  {config.is_active ? <Play className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
                </button>
                <div>
                  <p className="text-sm font-semibold text-black">{config.keyword}</p>
                  <p className="text-xs text-secondary">
                    {config.category && <span className="mr-2">{config.category}</span>}
                    <span className="font-mono">{config.search_type}</span>
                    {config.last_searched_at && (
                      <span className="ml-2 text-secondary/50">
                        last: {formatDate(config.last_searched_at)}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="w-4 h-4" />}
                onClick={() => {
                  if (confirm(`Delete keyword "${config.keyword}"?`)) {
                    deleteConfig.mutate(config.id);
                  }
                }}
                className="text-secondary hover:text-black"
              />
            </Card>
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
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Threads Pipeline"
        subtitle="Meta Threads lead discovery, qualification & engagement"
        actions={
          <div className="flex items-center gap-2">
            <Badge label="BETA" variant="amber" />
          </div>
        }
      />

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-[1px]',
                activeTab === tab.id
                  ? 'border-black text-black'
                  : 'border-transparent text-secondary hover:text-black hover:border-gray-300',
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'profiles' && <ProfilesTab />}
      {activeTab === 'engagements' && <EngagementsTab />}
      {activeTab === 'configs' && <SearchConfigsTab />}
    </div>
  );
}

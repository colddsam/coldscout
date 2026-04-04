import { motion } from 'framer-motion';
import { pageTransition, fadeInUp, scaleIn, defaultViewport } from '../lib/motion';
import { useCampaigns, useCampaignStats } from '../hooks/useCampaigns';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import DataTable, { type Column } from '../components/ui/DataTable';
import { PageLoader } from '../components/ui/Spinner';
import PageHeader from '../components/layout/PageHeader';
import { formatDate } from '../lib/utils';
import { useState } from 'react';
import { Send, X, Eye, MousePointerClick, Reply } from 'lucide-react';
import type { Campaign } from '../lib/api';

function CampaignDetailPanel({ campaign }: { campaign: Campaign }) {
  const { data: stats } = useCampaignStats(campaign.id);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-50 border border-gray-100 rounded-md p-3 text-center">
          <Send className="w-4 h-4 text-gray-500 mx-auto mb-1" />
          <p className="text-lg font-mono font-bold text-gray-900">{stats?.total_sent ?? campaign.total_sent ?? 0}</p>
          <p className="text-xs text-gray-400">Sent</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-md p-3 text-center">
          <Eye className="w-4 h-4 text-gray-400 mx-auto mb-1" />
          <p className="text-lg font-mono font-bold text-gray-900">{stats?.total_opened ?? campaign.total_opened ?? 0}</p>
          <p className="text-xs text-gray-400">Opened</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-md p-3 text-center">
          <MousePointerClick className="w-4 h-4 text-gray-400 mx-auto mb-1" />
          <p className="text-lg font-mono font-bold text-gray-900">{stats?.total_clicked ?? campaign.total_clicked ?? 0}</p>
          <p className="text-xs text-gray-400">Clicked</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-md p-3 text-center">
          <Reply className="w-4 h-4 text-gray-400 mx-auto mb-1" />
          <p className="text-lg font-mono font-bold text-gray-900">{stats?.total_replied ?? campaign.total_replied ?? 0}</p>
          <p className="text-xs text-gray-400">Replied</p>
        </div>
      </div>

      {/* Rates */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-2xl font-mono font-bold text-black">{stats.open_rate ?? '—'}%</p>
            <p className="text-xs text-gray-400">Open Rate</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-mono font-bold text-black">{stats.click_rate ?? '—'}%</p>
            <p className="text-xs text-gray-400">Click Rate</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-mono font-bold text-black">{stats.reply_rate ?? '—'}%</p>
            <p className="text-xs text-gray-400">Reply Rate</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The Campaigns page provides a high-level view of all outbound outreach efforts.
 * 
 * It lists all recorded campaigns and allows the user to click into a specific
 * campaign to view detailed performance metrics such as total sent, opened, 
 * clicked, and replied, along with calculated conversion rates.
 */
export default function Campaigns() {
  const { data: campaigns, isLoading } = useCampaigns();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) return <PageLoader />;

  const selected = campaigns?.find((c) => c.id === selectedId);

  const columns: Column<Campaign & Record<string, unknown>>[] = [
    {
      key: 'name',
      label: 'Campaign',
      render: (_, row) => <span className="text-gray-900 font-medium">{String(row.name || row.campaign_date || row.id)}</span>,
    },
    {
      key: 'total_sent',
      label: 'Sent',
      render: (_, row) => <span className="font-mono">{String(row.total_sent ?? 0)}</span>,
      width: '80px',
    },
    {
      key: 'total_opened',
      label: 'Opened',
      render: (_, row) => <span className="font-mono">{String(row.total_opened ?? 0)}</span>,
      width: '80px',
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => {
        const status = String(row.status ?? 'active');
        return <Badge label={status} variant={status === 'active' ? 'green' : 'muted'} />;
      },
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (_, row) => <span className="font-mono text-xs">{formatDate(String(row.created_at ?? row.campaign_date))}</span>,
    },
  ];

  return (
    <motion.div className="space-y-6" initial="initial" animate="animate" variants={pageTransition}>
      <PageHeader
        title="Campaigns"
        subtitle={`${campaigns?.length ?? 0} campaigns tracked`}
      />

      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-6" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
        {/* Campaign Table (2/3 or full) */}
        <div className={selected ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <Card padding={false}>
            <DataTable
              columns={columns}
              data={(campaigns ?? []) as unknown as (Campaign & Record<string, unknown>)[]}
              onRowClick={(row) => setSelectedId(String(row.id))}
              emptyMessage="No campaigns found"
            />
          </Card>
        </div>

        {/* Detail Panel (1/3) */}
        {selected && (
          <motion.div variants={scaleIn} initial="hidden" animate="visible">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-widest">Campaign Details</h3>
                <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <CampaignDetailPanel campaign={selected} />
            </Card>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}

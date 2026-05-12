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
import ErrorState from '../components/ui/ErrorState';
import { EmptyInbox } from '../components/ui/Illustration';
import type { ReactNode } from 'react';

function MetricTile({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-center transition-colors hover:border-white/[0.12]">
      <div className="text-tertiary mb-1.5 flex items-center justify-center">{icon}</div>
      <p className="text-display-num text-[1.05rem] leading-none">{value}</p>
      <p className="text-[10px] uppercase tracking-[0.1em] text-tertiary mt-1.5">{label}</p>
    </div>
  );
}

function CampaignDetailPanel({ campaign }: { campaign: Campaign }) {
  const { data: stats } = useCampaignStats(campaign.id);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <MetricTile icon={<Send className="w-3.5 h-3.5" />} label="Sent"    value={stats?.total_sent    ?? campaign.total_sent    ?? 0} />
        <MetricTile icon={<Eye className="w-3.5 h-3.5" />}  label="Opened"  value={stats?.total_opened  ?? campaign.total_opened  ?? 0} />
        <MetricTile icon={<MousePointerClick className="w-3.5 h-3.5" />} label="Clicked" value={stats?.total_clicked ?? campaign.total_clicked ?? 0} />
        <MetricTile icon={<Reply className="w-3.5 h-3.5" />} label="Replied" value={stats?.total_replied ?? campaign.total_replied ?? 0} />
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/[0.06]">
          {[
            { label: 'Open rate',  value: stats.open_rate },
            { label: 'Click rate', value: stats.click_rate },
            { label: 'Reply rate', value: stats.reply_rate },
          ].map((r) => (
            <div key={r.label} className="text-center">
              <p className="text-display-num text-[1.5rem] leading-none">{r.value ?? '—'}<span className="text-tertiary text-base ml-0.5">%</span></p>
              <p className="eyebrow mt-2 text-[10px]">{r.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Campaigns() {
  const { data: campaigns, isLoading, isError, refetch } = useCampaigns();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) return <PageLoader />;

  if (isError) {
    return (
      <motion.div className="space-y-6" initial="initial" animate="animate" variants={pageTransition}>
        <PageHeader eyebrow="Outreach" title="Campaigns" subtitle="Error loading campaigns" />
        <ErrorState title="Failed to load campaigns" message="Could not fetch campaign data from the server." onRetry={refetch} />
      </motion.div>
    );
  }

  const selected = campaigns?.find((c) => c.id === selectedId);

  const columns: Column<Campaign & Record<string, unknown>>[] = [
    {
      key: 'name',
      label: 'Campaign',
      render: (_, row) => <span className="text-white font-medium tracking-tight">{String(row.name || row.campaign_date || row.id)}</span>,
    },
    {
      key: 'total_sent',
      label: 'Sent',
      render: (_, row) => <span className="font-mono text-secondary">{String(row.total_sent ?? 0)}</span>,
      width: '80px',
      numeric: true,
    },
    {
      key: 'total_opened',
      label: 'Opened',
      render: (_, row) => <span className="font-mono text-secondary">{String(row.total_opened ?? 0)}</span>,
      width: '80px',
      numeric: true,
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
      render: (_, row) => <span className="font-mono text-[11px] text-tertiary">{formatDate(String(row.created_at ?? row.campaign_date))}</span>,
    },
  ];

  return (
    <motion.div className="space-y-6" initial="initial" animate="animate" variants={pageTransition}>
      <PageHeader
        eyebrow="Outreach"
        title="Campaigns"
        subtitle={`${campaigns?.length ?? 0} campaigns tracked · click a row for performance breakdown.`}
      />

      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-4" variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
        <div className={selected ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <Card padding={false}>
            <DataTable
              className="border-0 rounded-none"
              columns={columns}
              data={(campaigns ?? []) as unknown as (Campaign & Record<string, unknown>)[]}
              onRowClick={(row) => setSelectedId(String(row.id))}
              emptyMessage="No campaigns yet"
              emptyHint="Once your pipeline starts sending, campaigns will appear here with full performance metrics."
              emptyIllustration={<EmptyInbox size={84} />}
            />
          </Card>
        </div>

        {selected && (
          <motion.div variants={scaleIn} initial="hidden" animate="visible">
            <Card
              title="Campaign Details"
              actions={
                <button onClick={() => setSelectedId(null)} className="row-action" aria-label="Close">
                  <X className="w-3.5 h-3.5" />
                </button>
              }
            >
              <CampaignDetailPanel campaign={selected} />
            </Card>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}

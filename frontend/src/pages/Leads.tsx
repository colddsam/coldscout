import { useState } from 'react';
import { motion } from 'framer-motion';
import { pageTransition, fadeInUp, defaultViewport } from '../lib/motion';
import { useLeads } from '../hooks/useLeads';
import Card from '../components/ui/Card';
import DataTable, { type Column } from '../components/ui/DataTable';
import Button from '../components/ui/Button';
import { statusBadge } from '../components/ui/Badge';
import PageHeader from '../components/layout/PageHeader';
import { useNavigate } from 'react-router-dom';
import { formatDate, scoreBgColor, cn } from '../lib/utils';
import { LEAD_STATUSES } from '../lib/constants';
import { Search, ChevronLeft, ChevronRight, Download, Filter } from 'lucide-react';
import { exportLeadsCsv, type Lead } from '../lib/api';
import toast from 'react-hot-toast';
import { downloadBlob } from '../lib/utils';
import ErrorState from '../components/ui/ErrorState';
import LeadOutreachActions from '../components/dashboard/LeadOutreachActions';
import { EmptySearch } from '../components/ui/Illustration';

/**
 * CRM-style Leads Management page.
 */
export default function Leads() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const limit = 25;

  const { data, isLoading, isError, refetch } = useLeads({
    page,
    limit,
    status: status || undefined,
    country: country || undefined,
    region: region || undefined,
    city: city || undefined,
    category: category || undefined,
  });

  const handleExport = async () => {
    try {
      const blob = await exportLeadsCsv({
        status: status || undefined,
        country: country || undefined,
        region: region || undefined,
        city: city || undefined,
        category: category || undefined,
      });
      downloadBlob(blob, `leads_${new Date().toISOString().split('T')[0]}.csv`);
      toast.success('CSV exported successfully');
    } catch {
      toast.error('Export failed');
    }
  };

  const hasFilters = Boolean(country || region || city || category || status);
  const resetFilters = () => {
    setCountry(''); setRegion(''); setCity(''); setCategory(''); setStatus(''); setPage(1);
  };

  const columns: Column<Lead & Record<string, unknown>>[] = [
    {
      key: 'business_name',
      label: 'Business',
      render: (_, row) => (
        <span className="text-white font-medium tracking-tight">{String(row.business_name)}</span>
      ),
    },
    {
      key: 'city',
      label: 'Location',
      render: (_, row) => {
        const parts = [row.city, row.country_code].filter(Boolean);
        return <span className="text-secondary">{parts.join(', ')}</span>;
      },
    },
    {
      key: 'category',
      label: 'Category',
      render: (_, row) => <span className="text-secondary">{String(row.category ?? '—')}</span>,
    },
    {
      key: 'ai_score',
      label: 'Score',
      render: (_, row) => {
        const score = Number(row.ai_score) || 0;
        return (
          <span className={cn('inline-flex items-center justify-center min-w-[34px] px-1.5 py-0.5 rounded-md font-mono text-[11px] border', scoreBgColor(score))}>
            {score}
          </span>
        );
      },
      width: '70px',
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => statusBadge(String(row.status)),
    },
    {
      key: 'created_at',
      label: 'Discovered',
      render: (_, row) => <span className="font-mono text-[11px] text-tertiary">{formatDate(String(row.created_at))}</span>,
    },
    {
      key: 'actions',
      label: 'Action',
      width: '180px',
      render: (_, row) => (
        <LeadOutreachActions
          leadId={String(row.id)}
          leadStatusHint={String(row.status)}
          hasEmailHint={Boolean(row.email)}
          hasPhoneHint={Boolean(row.phone)}
          compact
        />
      ),
    },
  ];

  if (isError) {
    return (
      <motion.div className="space-y-6" initial="initial" animate="animate" variants={pageTransition}>
        <PageHeader eyebrow="CRM" title="Leads" subtitle="Error loading leads" />
        <ErrorState title="Failed to load leads" message="Could not fetch lead data from the server." onRetry={refetch} />
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-6" initial="initial" animate="animate" variants={pageTransition}>
      <PageHeader
        eyebrow="CRM"
        title="Leads"
        subtitle={data ? `${data.total} discovered · paginated 25 per page` : 'Discovered businesses ready for outreach.'}
        actions={
          <>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Clear filters
              </Button>
            )}
            <Button variant="outline" size="sm" icon={<Download className="w-3.5 h-3.5" />} onClick={handleExport}>
              Export CSV
            </Button>
          </>
        }
      />

      {/* Filters */}
      <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
        <Card padding>
          <div className="flex items-center gap-2 mb-3.5 pb-3 border-b border-white/[0.06]">
            <Filter className="w-3.5 h-3.5 text-tertiary" />
            <p className="eyebrow text-[10px]">Filters</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-tertiary pointer-events-none" />
              <input
                type="text"
                placeholder="Country"
                value={country}
                onChange={(e) => { setCountry(e.target.value); setPage(1); }}
                className="input-field !pl-9"
              />
            </div>
            <input
              type="text"
              placeholder="Region / State"
              value={region}
              onChange={(e) => { setRegion(e.target.value); setPage(1); }}
              className="input-field"
            />
            <input
              type="text"
              placeholder="City"
              value={city}
              onChange={(e) => { setCity(e.target.value); setPage(1); }}
              className="input-field"
            />
            <input
              type="text"
              placeholder="Category"
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(1); }}
              className="input-field"
            />
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="input-field"
            >
              <option value="">All statuses</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        </Card>
      </motion.div>

      {/* Table */}
      <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
        <Card padding={false}>
          <DataTable
            className="border-0 rounded-none"
            minWidth="850px"
            columns={columns}
            data={(data?.leads ?? []) as unknown as (Lead & Record<string, unknown>)[]}
            onRowClick={(row) => navigate(`/leads/${row.id}`)}
            loading={isLoading}
            emptyMessage={hasFilters ? 'No leads match your filters' : 'No leads discovered yet'}
            emptyHint={hasFilters ? 'Try widening your search or clearing filters.' : 'Trigger a discovery run from the pipeline page.'}
            emptyIllustration={hasFilters ? <EmptySearch size={84} /> : undefined}
          />
        </Card>
      </motion.div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={defaultViewport}
          className="flex flex-col sm:flex-row items-center justify-between gap-3"
        >
          <span className="text-[11px] font-mono text-tertiary order-2 sm:order-1">
            Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, data.total)} of {data.total}
          </span>
          <div className="flex items-center gap-1.5 order-1 sm:order-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<ChevronLeft className="w-3.5 h-3.5" />}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Prev
            </Button>
            <span className="text-[11px] font-mono text-secondary min-w-[80px] text-center px-2">
              Page {page} of {data.pages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
              disabled={page >= data.pages}
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

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
import { Search, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { exportLeadsCsv, type Lead } from '../lib/api';
import toast from 'react-hot-toast';
import { downloadBlob } from '../lib/utils';

/**
 * CRM-style Leads Management page.
 *
 * Provides a paginated data table of all pipeline-discovered leads with real-time
 * filtering by city, business category, and qualification status. This is the
 * primary view for operators who want to review, sort, and export discovered leads.
 *
 * Key capabilities:
 * - **Filtering**: City text search, category text search, and status dropdown
 *   all reset pagination to page 1 to avoid showing stale results.
 * - **Pagination**: A 25-per-page limit is enforced on the backend; the UI
 *   shows previous/next controls and a "page X of Y" counter.
 * - **CSV Export**: The export button calls the API with the active filters applied,
 *   so the downloaded file always matches what the user currently sees on screen.
 * - **Row Navigation**: Clicking any row navigates to `/leads/:id` for a full
 *   detail view with editing capabilities.
 */
export default function Leads() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const limit = 25;

  const { data, isLoading } = useLeads({
    page,
    limit,
    status: status || undefined,
    city: city || undefined,
    category: category || undefined,
  });

  const handleExport = async () => {
    try {
      const blob = await exportLeadsCsv({ status: status || undefined, city: city || undefined });
      downloadBlob(blob, `leads_${new Date().toISOString().split('T')[0]}.csv`);
      toast.success('CSV exported successfully');
    } catch {
      toast.error('Export failed');
    }
  };

  const columns: Column<Lead & Record<string, unknown>>[] = [
    {
      key: 'business_name',
      label: 'Business Name',
      render: (_, row) => (
        <span className="text-gray-900 font-medium">{String(row.business_name)}</span>
      ),
    },
    { key: 'city', label: 'City' },
    { key: 'category', label: 'Category' },
    {
      key: 'ai_score',
      label: 'Score',
      render: (_, row) => {
        const score = Number(row.ai_score) || 0;
        return (
          <span className={cn('px-2 py-0.5 rounded-md font-mono text-xs border', scoreBgColor(score))}>
            {score}
          </span>
        );
      },
      width: '80px',
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => statusBadge(String(row.status)),
    },
    {
      key: 'created_at',
      label: 'Discovered',
      render: (_, row) => <span className="font-mono text-xs">{formatDate(String(row.created_at))}</span>,
    },
  ];

  return (
    <motion.div className="space-y-6" initial="initial" animate="animate" variants={pageTransition}>
      <PageHeader
        title="Leads CRM"
        subtitle={`${data?.total ?? 0} total leads`}
        actions={
          <Button variant="outline" size="sm" icon={<Download className="w-4 h-4" />} onClick={handleExport}>
            Export CSV
          </Button>
        }
      />

      {/* Filters */}
      <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
      <Card padding={true}>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 md:gap-4 items-stretch sm:items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
            <input
              type="text"
              placeholder="Search by city..."
              value={city}
              onChange={(e) => { setCity(e.target.value); setPage(1); }}
              className="w-full bg-accents-1 border border-accents-2 rounded-md pl-10 pr-4 py-2 text-sm text-secondary placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-accents-3 transition-colors"
            />
          </div>

          <input
            type="text"
            placeholder="Category..."
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
            className="bg-accents-1 border border-accents-2 rounded-md px-4 py-2 text-sm text-secondary placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-accents-3 transition-colors min-w-[120px]"
          />

          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="bg-accents-1 border border-accents-2 rounded-md px-4 py-2 text-sm text-secondary focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-accents-3 transition-colors"
          >
            <option value="">All Statuses</option>
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
          columns={columns}
          data={(data?.leads ?? []) as unknown as (Lead & Record<string, unknown>)[]}
          onRowClick={(row) => navigate(`/leads/${row.id}`)}
          loading={isLoading}
          emptyMessage="No leads found matching your filters"
        />
      </Card>
      </motion.div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport} className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-[10px] md:text-xs font-mono text-secondary/60 order-2 sm:order-1">
            Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, data.total)} of {data.total} leads
          </span>
          <div className="flex items-center gap-2 order-1 sm:order-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<ChevronLeft />}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2"
            >
              <span className="hidden xs:inline">Prev</span>
            </Button>
            <span className="text-[10px] md:text-xs font-mono text-secondary min-w-[80px] text-center">
              Page {page} of {data.pages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
              disabled={page >= data.pages}
              className="px-2"
            >
              <span className="hidden xs:inline">Next</span> <ChevronRight />
            </Button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

/**
 * Analytics — advanced freelancer insights dashboard.
 *
 * Layout, top → bottom:
 *   1.  Window selector
 *   2.  AI Weekly Advice (Groq)
 *   3.  KPI tiles with inline sparklines
 *   4.  Conversion Funnel + Volume area chart (side-by-side)
 *   5.  Reply Sentiment donut + Top Niches horizontal bars
 *   6.  Open & Reply rate trend line
 *   7.  Engagement timing heatmaps (opens + replies)
 *   8.  Niche performance table
 *   9.  Daily reports (downloadable Excel)
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Download, Sparkles, TrendingUp, Mail, MailOpen, MessageSquare,
  Users, Target, RefreshCw, Loader2, AlertCircle, Activity, PieChart, Award,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  LineChart as RechartsLineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

import Card from '../components/ui/Card';
import { PageLoader } from '../components/ui/Spinner';
import PageHeader from '../components/layout/PageHeader';
import AreaChart from '../components/charts/AreaChart';
import Heatmap from '../components/charts/Heatmap';
import FunnelViz from '../components/charts/FunnelViz';
import Sparkline from '../components/charts/Sparkline';
import DonutChart, { type DonutSlice } from '../components/charts/DonutChart';
import HorizontalBars, { type HorizontalBarRow } from '../components/charts/HorizontalBars';
import DataTable, { type Column } from '../components/ui/DataTable';
import Button from '../components/ui/Button';
import ErrorState from '../components/ui/ErrorState';

import {
  useAnalytics,
  useFunnelStats,
  useNichePerformance,
  useSentimentBreakdown,
  useTimingInsights,
  useVolumeSeries,
  useWeeklyAdvice,
} from '../hooks/useAnalytics';
import { useUserScope } from '../hooks/useUserScope';
import {
  pageTransition, staggerContainer, staggerItem, fadeInUp, defaultViewport,
} from '../lib/motion';
import { downloadReport } from '../lib/api';
import { downloadBlob } from '../lib/utils';
import type { DailyReport, NicheRow, VolumePoint } from '../lib/api';

const WINDOW_OPTIONS = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
] as const;

const SENTIMENT_COLOR: Record<string, string> = {
  positive: '#34D399',
  neutral: '#94A3B8',
  negative: '#F87171',
  unsubscribe: '#FBBF24',
};

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// ── KPI tile with sparkline ─────────────────────────────────────────────────

function KpiTile({
  icon: Icon, label, value, sub, series, color = '#FFFFFF',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  series: number[];
  color?: string;
}) {
  return (
    <Card padding={true}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-white/85" />
        </div>
        <Sparkline data={series} color={color} width={84} height={28} label={`${label} trend`} />
      </div>
      <p className="text-[11px] uppercase tracking-wider text-white/50 font-medium mb-1">
        {label}
      </p>
      <p className="text-2xl font-semibold text-white tabular-nums">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-[11px] text-white/45 mt-1">{sub}</p>}
    </Card>
  );
}

// ── Weekly advice block ─────────────────────────────────────────────────────

function WeeklyAdvice() {
  const scope = useUserScope();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, isFetching } = useWeeklyAdvice();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['analytics-advice', scope] });
  };

  return (
    <Card
      title={(
        <span className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-info" />
          AI Weekly Advice
        </span>
      )}
      actions={(
        <Button
          variant="ghost"
          size="sm"
          icon={isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          onClick={refresh}
          disabled={isFetching}
        >
          Regenerate
        </Button>
      )}
    >
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 w-full rounded bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-start gap-2 text-sm text-warning">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Could not generate advice. Try again later.</span>
        </div>
      ) : !data?.bullets?.length ? (
        <p className="text-sm text-white/60">
          Send your first campaign — advice appears once we have data to analyse.
        </p>
      ) : (
        <ul className="space-y-3">
          {data.bullets.map((b, i) => (
            <li key={i} className="flex gap-3 text-sm text-white/85 leading-relaxed">
              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-info shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {data?.source === 'fallback' && (
        <p className="mt-3 text-[10px] uppercase tracking-wider text-white/35">
          Rule-based fallback — LLM unavailable
        </p>
      )}
    </Card>
  );
}

// ── Rates trend line chart (open / reply % over time) ─────────────────────

function RatesTrendChart({ data }: { data: VolumePoint[] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-56 text-white/40 font-mono text-sm">
        No data in this window
      </div>
    );
  }
  const rows = data.map((p) => ({
    date: p.date.slice(5),
    open: +(p.open_rate * 100).toFixed(2),
    reply: +(p.reply_rate * 100).toFixed(2),
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <RechartsLineChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="date"
          stroke="#666"
          fontSize={11}
          fontFamily="Almarai, system-ui, sans-serif"
          tickLine={false}
        />
        <YAxis
          stroke="#666"
          fontSize={11}
          tickFormatter={(v) => `${v}%`}
          tickLine={false}
          axisLine={false}
          width={36}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#0d0d0d',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '10px',
            fontSize: '12px',
            fontFamily: 'Almarai, system-ui, sans-serif',
            color: '#ffffff',
          }}
          formatter={(value, name) => {
            const n = typeof value === 'number' ? value : Number(value ?? 0);
            return [`${n.toFixed(1)}%`, String(name)];
          }}
        />
        <Line
          type="monotone"
          dataKey="open"
          name="Open rate"
          stroke="#60A5FA"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#60A5FA' }}
        />
        <Line
          type="monotone"
          dataKey="reply"
          name="Reply rate"
          stroke="#34D399"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#34D399' }}
        />
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function Analytics() {
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(30);

  const funnelQ = useFunnelStats(windowDays);
  const volumeQ = useVolumeSeries(windowDays);
  const sentimentQ = useSentimentBreakdown(windowDays);
  const timingQ = useTimingInsights(60);
  const nicheQ = useNichePerformance(90);
  const reportsQ = useAnalytics();

  const funnel = funnelQ.data;
  const totals = funnel?.totals;
  // Memoise the volume array so deriving sparkline series doesn't churn
  // on every render when the query returns the same data reference.
  const volume = useMemo<VolumePoint[]>(() => volumeQ.data ?? [], [volumeQ.data]);

  // Derive sparkline series from the volume timeseries — cheap and keeps
  // the KPI tiles in sync with the area chart below.
  const sparkSeries = useMemo(() => ({
    leads: volume.map((p) => p.leads_found),
    sent: volume.map((p) => p.emails_sent),
    opened: volume.map((p) => p.emails_opened),
    replied: volume.map((p) => p.replies_received),
  }), [volume]);

  const sentimentSlices: DonutSlice[] = useMemo(() => (
    (sentimentQ.data?.buckets ?? []).map((b) => ({
      key: b.key,
      label: b.label,
      value: b.count,
      color: SENTIMENT_COLOR[b.key] ?? '#FFFFFF',
    }))
  ), [sentimentQ.data]);

  // Top 5 niches by reply rate for the horizontal-bar widget.
  const topNiches: HorizontalBarRow[] = useMemo(() => (
    (nicheQ.data ?? []).slice(0, 5).map((n) => ({
      key: n.category,
      label: n.category,
      value: n.reply_rate,
      display: pct(n.reply_rate),
      hint: `${n.sent.toLocaleString()} sent · ${pct(n.open_rate)} opens`,
    }))
  ), [nicheQ.data]);

  const handleDownloadReport = async (date: string) => {
    try {
      const blob = await downloadReport(date);
      downloadBlob(blob, `report_${date}.json`);
      toast.success('Report downloaded');
    } catch {
      toast.error('Download failed');
    }
  };

  const nicheColumns: Column<NicheRow>[] = useMemo(() => [
    { key: 'category', label: 'Category',
      render: (v) => <span className="text-white font-medium">{String(v)}</span> },
    { key: 'discovered', label: 'Leads', numeric: true,
      render: (v) => <span className="text-secondary tabular-nums">{Number(v).toLocaleString()}</span> },
    { key: 'sent', label: 'Sent', numeric: true,
      render: (v) => <span className="text-secondary tabular-nums">{Number(v).toLocaleString()}</span> },
    { key: 'open_rate', label: 'Open %', numeric: true,
      render: (v) => <span className="text-white tabular-nums">{pct(Number(v))}</span> },
    { key: 'reply_rate', label: 'Reply %', numeric: true,
      render: (v) => {
        const rate = Number(v);
        const tone =
          rate >= 0.05 ? 'text-success' : rate >= 0.02 ? 'text-warning' : 'text-danger';
        return <span className={`${tone} font-medium tabular-nums`}>{pct(rate)}</span>;
      } },
  ], []);

  const reportColumns: Column<DailyReport>[] = useMemo(() => [
    { key: 'report_date', label: 'Date',
      render: (v) => <span className="font-mono text-white">{String(v)}</span> },
    { key: 'leads_discovered', label: 'Discovered', numeric: true,
      render: (v) => <span className="text-secondary">{String(v ?? '—')}</span> },
    { key: 'leads_qualified', label: 'Qualified', numeric: true,
      render: (v) => <span className="text-secondary">{String(v ?? '—')}</span> },
    { key: 'emails_sent', label: 'Sent', numeric: true,
      render: (v) => <span className="text-secondary">{String(v ?? '—')}</span> },
    { key: 'emails_opened', label: 'Opened', numeric: true,
      render: (v) => <span className="text-secondary">{String(v ?? '—')}</span> },
    {
      key: 'actions', label: '', width: '110px',
      render: (_, r) => (
        <Button
          variant="ghost"
          size="sm"
          icon={<Download className="w-3.5 h-3.5" />}
          onClick={() => handleDownloadReport(r.report_date)}
        >
          Export
        </Button>
      ),
    },
  ], []);

  if (funnelQ.isLoading && !funnel) return <PageLoader />;

  if (funnelQ.isError) {
    return (
      <motion.div className="space-y-6" initial="initial" animate="animate" variants={pageTransition}>
        <PageHeader eyebrow="Insights" title="Analytics" subtitle="Error loading analytics" />
        <ErrorState
          title="Failed to load analytics"
          message="Could not fetch the analytics summary from the server."
          onRetry={funnelQ.refetch}
        />
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-6" initial="initial" animate="animate" variants={pageTransition}>
      <PageHeader
        eyebrow="Insights"
        title="Analytics"
        subtitle={`Performance over the last ${windowDays} days.`}
      />

      {/* Window selector */}
      <div className="flex items-center gap-2">
        {WINDOW_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setWindowDays(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              windowDays === opt.value
                ? 'bg-white text-black border-white'
                : 'bg-white/[0.02] text-white/70 border-white/10 hover:border-white/25 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* AI Weekly Advice */}
      <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
        <WeeklyAdvice />
      </motion.div>

      {/* KPI row with sparklines */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={defaultViewport}
      >
        <motion.div variants={staggerItem}>
          <KpiTile
            icon={Users}
            label="Leads"
            value={totals?.discovered ?? 0}
            sub={funnel ? `${totals?.qualified ?? 0} qualified` : undefined}
            series={sparkSeries.leads}
            color="#FFFFFF"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <KpiTile
            icon={Mail}
            label="Sent"
            value={totals?.sent ?? 0}
            sub={funnel ? pct(funnel.conversions.qualified_to_sent) + ' of qualified' : undefined}
            series={sparkSeries.sent}
            color="#FFFFFF"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <KpiTile
            icon={MailOpen}
            label="Opens"
            value={totals?.opened ?? 0}
            sub={funnel ? pct(funnel.conversions.sent_to_opened) + ' open rate' : undefined}
            series={sparkSeries.opened}
            color="#60A5FA"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <KpiTile
            icon={MessageSquare}
            label="Replies"
            value={totals?.replied ?? 0}
            sub={funnel ? pct(funnel.conversions.sent_to_replied) + ' reply rate' : undefined}
            series={sparkSeries.replied}
            color="#34D399"
          />
        </motion.div>
      </motion.div>

      {/* Funnel + Volume side-by-side on lg */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={defaultViewport}
      >
        <motion.div variants={staggerItem}>
          <Card
            title={(
              <span className="flex items-center gap-2">
                <Target className="w-4 h-4 text-white/70" />
                Conversion Funnel
              </span>
            )}
          >
            <FunnelViz
              stages={funnel?.stages ?? []}
              conversions={funnel?.conversions as unknown as Record<string, number>}
            />
          </Card>
        </motion.div>

        <motion.div variants={staggerItem}>
          <Card
            title={(
              <span className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-white/70" />
                Volume vs Engagement
              </span>
            )}
          >
            <AreaChart
              data={volume.map((p) => ({ ...p, date: p.date.slice(5) }))}
              areas={[
                { dataKey: 'emails_sent', color: '#FFFFFF', label: 'Sent' },
                { dataKey: 'emails_opened', color: '#60A5FA', label: 'Opens' },
                { dataKey: 'replies_received', color: '#34D399', label: 'Replies' },
              ]}
            />
          </Card>
        </motion.div>
      </motion.div>

      {/* Sentiment donut + top niches */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-5 gap-4"
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={defaultViewport}
      >
        <motion.div variants={staggerItem} className="lg:col-span-2">
          <Card
            title={(
              <span className="flex items-center gap-2">
                <PieChart className="w-4 h-4 text-white/70" />
                Reply Sentiment
              </span>
            )}
          >
            {sentimentQ.isLoading ? (
              <div className="h-40 flex items-center justify-center text-white/40">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : (
              <DonutChart
                slices={sentimentSlices}
                centerValue={sentimentQ.data?.total_replies ?? 0}
                centerLabel="Replies"
              />
            )}
          </Card>
        </motion.div>

        <motion.div variants={staggerItem} className="lg:col-span-3">
          <Card
            title={(
              <span className="flex items-center gap-2">
                <Award className="w-4 h-4 text-white/70" />
                Top Niches by Reply Rate
              </span>
            )}
          >
            {nicheQ.isLoading ? (
              <div className="h-40 flex items-center justify-center text-white/40">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : (
              <HorizontalBars rows={topNiches} color="#34D399" max={1} />
            )}
          </Card>
        </motion.div>
      </motion.div>

      {/* Rates trend line */}
      <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
        <Card
          title={(
            <span className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-white/70" />
              Open & Reply Rate Trend
            </span>
          )}
        >
          <RatesTrendChart data={volume} />
        </Card>
      </motion.div>

      {/* Timing heatmaps */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={defaultViewport}
      >
        <motion.div variants={staggerItem}>
          <Card title="Best Time — Opens">
            {timingQ.isLoading ? (
              <div className="h-40 flex items-center justify-center text-white/40">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : (
              <>
                <Heatmap
                  matrix={timingQ.data?.opens ?? []}
                  weekdayLabels={timingQ.data?.weekday_labels ?? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']}
                  metric="opens"
                  accent="96, 165, 250"
                />
                {timingQ.data?.peak_open && (
                  <p className="text-xs text-white/55 mt-3">
                    Peak: <span className="text-white font-medium">
                      {timingQ.data.weekday_labels[timingQ.data.peak_open.weekday]} at {timingQ.data.peak_open.hour.toString().padStart(2,'0')}:00 UTC
                    </span> — {timingQ.data.peak_open.count} opens
                  </p>
                )}
              </>
            )}
          </Card>
        </motion.div>

        <motion.div variants={staggerItem}>
          <Card title="Best Time — Replies">
            {timingQ.isLoading ? (
              <div className="h-40 flex items-center justify-center text-white/40">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : (
              <>
                <Heatmap
                  matrix={timingQ.data?.replies ?? []}
                  weekdayLabels={timingQ.data?.weekday_labels ?? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']}
                  metric="replies"
                  accent="52, 211, 153"
                />
                {timingQ.data?.peak_reply && (
                  <p className="text-xs text-white/55 mt-3">
                    Peak: <span className="text-white font-medium">
                      {timingQ.data.weekday_labels[timingQ.data.peak_reply.weekday]} at {timingQ.data.peak_reply.hour.toString().padStart(2,'0')}:00 UTC
                    </span> — {timingQ.data.peak_reply.count} replies
                  </p>
                )}
              </>
            )}
          </Card>
        </motion.div>
      </motion.div>

      {/* Niche performance */}
      <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
        <Card padding={false} title="Niche Performance (90-day window)">
          <DataTable<NicheRow>
            className="border-0 rounded-none"
            columns={nicheColumns}
            data={nicheQ.data ?? []}
            emptyMessage="Not enough data yet"
            emptyHint="Categories appear here once 3+ leads from a niche have been discovered."
          />
        </Card>
      </motion.div>

      {/* Legacy daily reports */}
      <motion.div variants={fadeInUp} initial="hidden" whileInView="visible" viewport={defaultViewport}>
        <Card padding={false} title="Daily Reports">
          <DataTable
            className="border-0 rounded-none"
            columns={reportColumns}
            data={reportsQ.data ?? []}
            emptyMessage="No daily reports yet"
            emptyHint="Reports are generated automatically by the pipeline once it has finished a full cycle."
          />
        </Card>
      </motion.div>
    </motion.div>
  );
}

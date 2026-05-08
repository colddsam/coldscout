/**
 * Public Lead Scanner — comprehensive SEO + AEO + business audit.
 *
 * Two input modes:
 *   1. Website URL  → POST /api/v1/public/audit-website  → DeepAudit
 *   2. Maps URL     → POST /api/v1/public/audit-place    → MapsAuditResponse
 *                     (which embeds the same DeepAudit when a website is listed)
 *
 * Both endpoints are anonymous, rate-limited server-side, and never persist.
 * The audit covers:
 *   - Indexability + crawlability (HTTPS, robots, sitemap, canonical, noindex)
 *   - Meta (title length, description, Open Graph, Twitter Card)
 *   - Heading structure (H1 count, H2/H3 progression)
 *   - Content quality (word count, image alts, internal/external links)
 *   - Structured data (JSON-LD types, OG, Twitter)
 *   - Performance signals (HTML size, inline CSS/JS, lazy-load coverage)
 *   - Mobile readiness (viewport meta)
 *   - Accessibility (lang attribute, form labels, image alts)
 *   - Trust signals (privacy/terms links, contact info, copyright)
 *   - AEO (FAQPage / HowTo / speakable schema, llms.txt)
 *
 * The Maps mode additionally surfaces business intel (rating, reviews, hours,
 * photos, status, editorial summary) and derives marketing recommendations.
 */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Globe2,
  Loader2,
  Search,
  XCircle,
  Info,
  Sparkles,
  Star,
  Phone,
  MapPin,
  Clock,
  Image as ImageIcon,
  TrendingUp,
  ShieldCheck,
  ShieldAlert,
  Lightbulb,
  ExternalLink,
  ChevronDown,
  Award,
  Type as TypeIcon,
  Heading1,
  Code2,
  Zap,
  Smartphone,
  Accessibility,
  Bot,
  ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { useSEO } from '../hooks/useSEO';
import {
  auditWebsite,
  auditPlace,
  type DeepAudit,
  type MapsAuditResponse,
  type AuditFinding,
  type AuditCategory,
  type AuditSeverity,
  type AuditCategoryScore,
} from '../lib/api';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';

/* ════════════════════ Display tables ════════════════════ */

type Mode = 'website' | 'maps';

const MODE_TABS: { id: Mode; label: string; help: string; placeholder: string }[] = [
  {
    id: 'website',
    label: 'Website URL',
    help: 'Paste any business website. We audit SEO, AEO, performance, trust, and accessibility — and tell you what to fix first.',
    placeholder: 'example.com',
  },
  {
    id: 'maps',
    label: 'Google Maps URL',
    help: 'Paste a Google Maps share link. We pull the business profile, audit the linked website, and add Maps-specific recommendations.',
    placeholder: 'https://maps.app.goo.gl/...',
  },
];

const CATEGORY_LABEL: Record<AuditCategory, string> = {
  indexability: 'Indexability',
  meta: 'Meta tags',
  headings: 'Headings',
  content: 'Content',
  schema: 'Structured data',
  performance: 'Performance',
  mobile: 'Mobile',
  accessibility: 'Accessibility',
  trust: 'Trust signals',
  aeo: 'Answer engines (AEO)',
};

const CATEGORY_ICON: Record<AuditCategory, React.ReactNode> = {
  indexability: <Search className="w-3.5 h-3.5" />,
  meta: <TypeIcon className="w-3.5 h-3.5" />,
  headings: <Heading1 className="w-3.5 h-3.5" />,
  content: <Type className="w-3.5 h-3.5" />,
  schema: <Code2 className="w-3.5 h-3.5" />,
  performance: <Zap className="w-3.5 h-3.5" />,
  mobile: <Smartphone className="w-3.5 h-3.5" />,
  accessibility: <Accessibility className="w-3.5 h-3.5" />,
  trust: <ShieldCheck className="w-3.5 h-3.5" />,
  aeo: <Bot className="w-3.5 h-3.5" />,
};

// Tiny shim so typescript doesn't complain about the `Type` icon — Lucide
// renames it to `Type` but `TypeIcon` already imports it. Re-export here
// so the table above can reference both spots.
function Type(props: React.SVGProps<SVGSVGElement>) {
  return <TypeIcon {...props} />;
}

const SEVERITY_STYLE: Record<
  AuditSeverity,
  { ring: string; pill: string; icon: React.ReactNode; sortKey: number }
> = {
  critical: {
    ring: 'border-red-400/30',
    pill: 'bg-red-500/15 text-red-200 border-red-400/30',
    icon: <ShieldAlert className="w-3.5 h-3.5" />,
    sortKey: 0,
  },
  warning: {
    ring: 'border-yellow-400/25',
    pill: 'bg-yellow-500/10 text-yellow-200 border-yellow-400/25',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    sortKey: 1,
  },
  info: {
    ring: 'border-white/15',
    pill: 'bg-white/[0.06] text-white/85 border-white/15',
    icon: <Info className="w-3.5 h-3.5" />,
    sortKey: 2,
  },
  good: {
    ring: 'border-emerald-400/25',
    pill: 'bg-emerald-500/10 text-emerald-200 border-emerald-400/25',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    sortKey: 3,
  },
};

/* ════════════════════ Score visuals ════════════════════ */

function gradeTone(grade: string): string {
  if (grade === 'A+' || grade === 'A') return 'text-emerald-300';
  if (grade === 'B') return 'text-yellow-200';
  if (grade === 'C') return 'text-orange-300';
  return 'text-red-300';
}

function ScoreRing({ score, grade, size = 160 }: { score: number; grade: string; size?: number }) {
  const radius = size * 0.4;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const tone = gradeTone(grade);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={size * 0.07}
          fill="none"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          className={tone}
          strokeWidth={size * 0.07}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          animate={{ strokeDashoffset: circumference - dash }}
          transition={{ duration: 0.9, ease: [0.25, 0.1, 0.25, 1] }}
          style={{ transform: 'rotate(-90deg)', transformOrigin: `${size / 2}px ${size / 2}px` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={`text-4xl font-bold tracking-tighter ${tone}`}>{grade}</div>
        <div className="text-2xl font-bold tracking-tight text-white">{score}</div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary mt-0.5">/ 100</div>
      </div>
    </div>
  );
}

function CategoryBar({ cat }: { cat: AuditCategoryScore }) {
  const tone =
    cat.score >= 80
      ? 'bg-emerald-400'
      : cat.score >= 60
        ? 'bg-yellow-300'
        : cat.score >= 40
          ? 'bg-orange-400'
          : 'bg-red-400';
  return (
    <div className="rounded-xl border border-white/[0.08] bg-surface-2/60 p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-white/[0.06] border border-white/10">
            {CATEGORY_ICON[cat.category]}
          </span>
          {CATEGORY_LABEL[cat.category]}
        </div>
        <div className="text-sm font-bold tracking-tight text-white">{cat.score}</div>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          className={`h-full ${tone}`}
          initial={{ width: 0 }}
          animate={{ width: `${cat.score}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <div className="mt-2 text-xs text-secondary line-clamp-1">
        {cat.findings_count === 0 ? 'No issues — looking great.' : cat.headline}
      </div>
    </div>
  );
}

function FindingRow({ finding }: { finding: AuditFinding }) {
  const [open, setOpen] = useState(false);
  const style = SEVERITY_STYLE[finding.severity];
  return (
    <div className={`rounded-xl border ${style.ring} bg-surface-2/60`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span
          className={`mt-0.5 inline-flex items-center justify-center rounded-md border px-1.5 py-1 ${style.pill} flex-shrink-0`}
        >
          {style.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-[0.15em] text-tertiary">
              {CATEGORY_LABEL[finding.category]}
            </span>
            <span
              className={`text-[10px] uppercase tracking-[0.12em] rounded-full border px-2 py-0.5 ${style.pill}`}
            >
              {finding.severity}
            </span>
            <span className="text-[10px] uppercase tracking-[0.12em] text-tertiary">
              {finding.impact} impact
            </span>
          </div>
          <h3 className="mt-1.5 text-sm font-semibold text-white">{finding.title}</h3>
          <p className="mt-1 text-xs text-secondary leading-relaxed line-clamp-2">{finding.detail}</p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-tertiary mt-1.5 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-white/[0.06]"
          >
            <div className="p-4 space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary mb-1">Detail</div>
                <p className="text-sm text-white/85 leading-relaxed">{finding.detail}</p>
              </div>
              <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-emerald-200/80 mb-1">
                  <Lightbulb className="w-3 h-3" />
                  How to fix
                </div>
                <p className="text-sm text-emerald-50 leading-relaxed">{finding.suggestion}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ════════════════════ Result panels ════════════════════ */

function CategoryGrid({ scores }: { scores: AuditCategoryScore[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {scores.map((cat) => (
        <CategoryBar key={cat.category} cat={cat} />
      ))}
    </div>
  );
}

function FindingsByCategory({ findings }: { findings: AuditFinding[] }) {
  const grouped = useMemo(() => {
    const out: Record<string, AuditFinding[]> = {};
    for (const f of findings) {
      (out[f.category] ||= []).push(f);
    }
    // Sort findings within each group by severity then impact.
    for (const k of Object.keys(out)) {
      out[k].sort(
        (a, b) =>
          SEVERITY_STYLE[a.severity].sortKey - SEVERITY_STYLE[b.severity].sortKey,
      );
    }
    return out;
  }, [findings]);

  const orderedCategories: AuditCategory[] = [
    'indexability',
    'meta',
    'headings',
    'content',
    'schema',
    'performance',
    'mobile',
    'accessibility',
    'trust',
    'aeo',
  ];

  return (
    <div className="space-y-6">
      {orderedCategories.map((cat) => {
        const items = grouped[cat];
        if (!items || items.length === 0) return null;
        return (
          <section key={cat}>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 text-white">
                {CATEGORY_ICON[cat]}
              </span>
              <h2 className="text-sm font-semibold text-white">{CATEGORY_LABEL[cat]}</h2>
              <span className="text-[10px] uppercase tracking-[0.15em] text-tertiary">
                {items.length} {items.length === 1 ? 'finding' : 'findings'}
              </span>
            </div>
            <div className="space-y-2">
              {items.map((f) => (
                <FindingRow key={f.code + f.title} finding={f} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function HeaderCard({ audit }: { audit: DeepAudit }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-7">
        <ScoreRing score={audit.overall_score} grade={audit.grade} />
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <div className="text-[11px] uppercase tracking-[0.18em] text-tertiary">Audited</div>
          <div className="mt-1 text-base sm:text-lg font-semibold truncate">
            {audit.final_url || audit.normalized_url}
          </div>
          <p className="mt-3 text-sm text-white/85 leading-relaxed">{audit.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2 justify-center sm:justify-start">
            <Pill ok={audit.is_dns_valid} label={audit.is_dns_valid ? 'DNS resolves' : 'DNS unreachable'} />
            <Pill
              ok={audit.is_http_valid}
              label={audit.is_http_valid ? `HTTP ${audit.http_status ?? 200}` : 'Site offline'}
            />
            <Pill ok={audit.has_ssl} label={audit.has_ssl ? 'HTTPS' : 'No HTTPS'} />
            <Pill
              ok={audit.has_robots_txt}
              label={audit.has_robots_txt ? 'robots.txt' : 'No robots.txt'}
            />
            <Pill
              ok={audit.has_sitemap_referenced}
              label={audit.has_sitemap_referenced ? 'sitemap.xml' : 'No sitemap'}
            />
            <Pill ok={audit.has_llms_txt} label={audit.has_llms_txt ? 'llms.txt' : 'No llms.txt'} />
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat icon={<TypeIcon className="w-3.5 h-3.5" />} label="Words" value={audit.word_count} />
            <Stat icon={<ImageIcon className="w-3.5 h-3.5" />} label="Images" value={audit.image_count} />
            <Stat
              icon={<ExternalLink className="w-3.5 h-3.5" />}
              label="External links"
              value={audit.external_link_count}
            />
            <Stat
              icon={<Code2 className="w-3.5 h-3.5" />}
              label="Schemas"
              value={audit.detected_schemas.length}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaSnippet({ audit }: { audit: DeepAudit }) {
  const titleLen = (audit.page_title || '').length;
  const descLen = (audit.meta_description || '').length;
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-5">
      <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary mb-3">
        Search-result preview
      </div>
      <div className="rounded-lg border border-white/[0.06] bg-surface-1/80 p-4">
        <div className="text-xs text-tertiary truncate">{audit.canonical || audit.final_url}</div>
        <div className="mt-1 text-base text-blue-300/90 truncate">
          {audit.page_title || '(no title — Google will pick one)'}
        </div>
        <div className="mt-1 text-xs text-secondary line-clamp-3">
          {audit.meta_description || '(no description — Google will generate one from the page body)'}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-tertiary">
        <span>title: {titleLen} chars</span>
        <span>description: {descLen} chars</span>
        {audit.detected_schemas.length > 0 && (
          <span>schemas: {audit.detected_schemas.slice(0, 4).join(', ')}{audit.detected_schemas.length > 4 ? '…' : ''}</span>
        )}
      </div>
    </div>
  );
}

/* ════════════════════ Maps panels ════════════════════ */

function StarRow({ rating, count }: { rating: number; count: number }) {
  const filled = Math.round(rating);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`w-3.5 h-3.5 ${i <= filled ? 'text-yellow-300 fill-yellow-300' : 'text-white/20'}`}
          />
        ))}
      </div>
      <span className="text-sm font-semibold text-white">{rating.toFixed(1)}</span>
      <span className="text-xs text-tertiary">({count.toLocaleString()})</span>
    </div>
  );
}

function BusinessCard({ business }: { business: MapsAuditResponse['business'] }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-5">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center flex-shrink-0">
          <MapPin className="w-5 h-5 text-white/80" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold tracking-tight text-white truncate">
            {business.display_name || 'Unnamed listing'}
          </h2>
          {business.primary_type && (
            <div className="text-[11px] uppercase tracking-[0.15em] text-tertiary mt-0.5">
              {business.primary_type}
            </div>
          )}
          {business.formatted_address && (
            <p className="text-xs text-secondary mt-1 truncate">{business.formatted_address}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {business.rating != null && business.user_rating_count != null && (
              <StarRow rating={business.rating} count={business.user_rating_count} />
            )}
            {business.business_status && business.business_status !== 'OPERATIONAL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-red-400/30 bg-red-500/10 text-[11px] text-red-200">
                <AlertTriangle className="w-3 h-3" /> {business.business_status.replace(/_/g, ' ')}
              </span>
            )}
            {business.open_now != null && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${
                  business.open_now
                    ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-white/15 bg-white/[0.04] text-tertiary'
                }`}
              >
                <Clock className="w-3 h-3" /> {business.open_now ? 'Open now' : 'Closed'}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          icon={<Star className="w-3.5 h-3.5" />}
          label="Photos"
          value={business.photo_count}
        />
        <Stat
          icon={<Star className="w-3.5 h-3.5" />}
          label="Reviews"
          value={business.user_rating_count ?? 0}
        />
        {business.phone && (
          <Stat icon={<Phone className="w-3.5 h-3.5" />} label="Phone" value={business.phone} valueClass="font-mono text-xs" />
        )}
        {business.website_uri ? (
          <Stat
            icon={<Globe2 className="w-3.5 h-3.5" />}
            label="Website"
            value={business.website_uri.replace(/^https?:\/\//, '')}
            valueClass="truncate text-xs"
          />
        ) : (
          <Stat
            icon={<Globe2 className="w-3.5 h-3.5" />}
            label="Website"
            value="Not set"
            valueClass="text-xs text-red-300"
          />
        )}
      </div>

      {business.editorial_summary && (
        <div className="mt-4 rounded-lg border border-white/[0.06] bg-surface-1/60 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary mb-1">From Google</div>
          <p className="text-sm text-white/85 leading-relaxed">{business.editorial_summary}</p>
        </div>
      )}

      {business.weekday_descriptions.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary mb-2">Hours</div>
          <ul className="space-y-1">
            {business.weekday_descriptions.map((d) => (
              <li key={d} className="text-xs text-secondary">
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {business.photo_thumbnails.length > 0 && (
        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary mb-2">Photos from Google</div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {business.photo_thumbnails.slice(0, 8).map((src, i) => (
              <div
                key={src}
                className="aspect-square rounded-lg overflow-hidden border border-white/[0.06] bg-surface-1"
              >
                <img
                  src={src}
                  alt={`Photo ${i + 1} of ${business.display_name ?? 'business'}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {business.reviews.length > 0 && (
        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary mb-2">Recent reviews</div>
          <div className="space-y-2">
            {business.reviews.slice(0, 3).map((r, i) => (
              <div
                key={i}
                className="rounded-lg border border-white/[0.06] bg-surface-1/60 p-3"
              >
                <div className="flex items-center gap-2 text-xs text-tertiary">
                  <span className="font-semibold text-white">{r.author_name || 'Anonymous'}</span>
                  {r.rating != null && (
                    <span className="inline-flex items-center gap-0.5 text-yellow-300">
                      <Star className="w-3 h-3 fill-yellow-300" />
                      {r.rating}
                    </span>
                  )}
                  {r.relative_time && <span>· {r.relative_time}</span>}
                </div>
                {r.text && (
                  <p className="mt-1.5 text-xs text-secondary leading-relaxed line-clamp-3">{r.text}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {business.google_maps_uri && (
        <a
          href={business.google_maps_uri}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-5 text-xs text-white/80 hover:text-white"
        >
          Open on Google Maps <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

function RecommendationsCard({ recs }: { recs: MapsAuditResponse['recommendations'] }) {
  if (recs.length === 0) return null;
  const priorityRank = { high: 0, medium: 1, low: 2 };
  const sorted = [...recs].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-emerald-500/10 border border-emerald-400/25 text-emerald-200">
          <TrendingUp className="w-4 h-4" />
        </span>
        <h3 className="text-sm font-semibold text-white">Top recommendations to grow this business</h3>
      </div>
      <ul className="space-y-3">
        {sorted.map((r, i) => (
          <li key={r.code} className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-[11px] font-bold text-white">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-semibold text-white">{r.title}</h4>
                <span
                  className={`text-[10px] uppercase tracking-[0.12em] rounded-full border px-2 py-0.5 ${
                    r.priority === 'high'
                      ? 'border-red-400/30 bg-red-500/10 text-red-200'
                      : r.priority === 'medium'
                        ? 'border-yellow-400/25 bg-yellow-500/10 text-yellow-200'
                        : 'border-white/15 bg-white/[0.04] text-tertiary'
                  }`}
                >
                  {r.priority} priority
                </span>
              </div>
              <p className="mt-1 text-xs text-secondary leading-relaxed">{r.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ════════════════════ Atoms ════════════════════ */

function Pill({ ok, label, icon }: { ok: boolean; label: string; icon?: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium ${
        ok
          ? 'bg-emerald-500/10 border-emerald-400/25 text-emerald-200'
          : 'bg-white/[0.04] border-white/10 text-secondary'
      }`}
    >
      {icon ?? (ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />)}
      {label}
    </span>
  );
}

function Stat({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-surface-1/60 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-tertiary">
        {icon} {label}
      </div>
      <div className={`mt-1 text-sm font-semibold text-white ${valueClass ?? ''}`}>{value}</div>
    </div>
  );
}

/* ════════════════════ Page ════════════════════ */

export default function LeadScanner() {
  useSEO({
    title: 'Free SEO Audit + AEO Audit + Google Maps Audit — Cold Scout',
    description:
      'Paste any website URL or Google Maps share link. Get an instant, comprehensive SEO + AEO + business audit with prioritized actions to grow your business — no signup needed.',
    canonical: 'https://coldscout.colddsam.com/scanner',
    keywords:
      'free SEO audit, AEO audit, Google Maps audit, website scanner, business audit, local SEO checker, structured data validator, Cold Scout scanner',
    index: true,
  });

  const [mode, setMode] = useState<Mode>('website');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [audit, setAudit] = useState<DeepAudit | null>(null);
  const [maps, setMaps] = useState<MapsAuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeMode = MODE_TABS.find((t) => t.id === mode)!;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const trimmed = input.trim();
    if (!trimmed) {
      setError(`Enter a ${mode === 'website' ? 'website URL' : 'Google Maps URL'} to audit.`);
      return;
    }
    setError(null);
    setAudit(null);
    setMaps(null);
    setLoading(true);
    try {
      if (mode === 'website') {
        const data = await auditWebsite(trimmed);
        setAudit(data);
      } else {
        const data = await auditPlace(trimmed);
        setMaps(data);
        setAudit(data.website_audit);
      }
    } catch (err) {
      const message = (err as Error).message || 'Something went wrong. Try again.';
      toast.error(message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const allFindings = useMemo(() => {
    if (!audit && !maps) return [] as AuditFinding[];
    const fromAudit = audit?.findings ?? [];
    const fromMaps = maps?.derived_findings ?? [];
    return [...fromMaps, ...fromAudit];
  }, [audit, maps]);

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <PublicNavbar />

      {/* Background ornament */}
      <div className="pointer-events-none absolute inset-0 -z-0 opacity-[0.18] noise-overlay" />
      <div className="pointer-events-none absolute top-[-20%] right-[-10%] w-[40rem] h-[40rem] rounded-full bg-gradient-to-br from-white/[0.04] to-transparent blur-3xl" />

      <main className="relative z-10 max-w-5xl mx-auto px-5 sm:px-6 pt-32 sm:pt-36 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center mb-10"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-[0.18em] uppercase bg-white/[0.06] border border-white/10 text-secondary">
            <Award className="w-3.5 h-3.5" /> Free comprehensive audit
          </span>
          <h1 className="mt-5 text-3xl sm:text-5xl font-bold tracking-tight text-gradient">
            Full SEO, AEO &amp; Google Maps audit
          </h1>
          <p className="mt-3 text-sm sm:text-base text-secondary max-w-2xl mx-auto leading-relaxed">
            One scan, ten categories, every blocker that's holding the business back — with a
            prioritized fix list. Free, no signup, results in seconds.
          </p>
        </motion.div>

        {/* Mode tabs */}
        <div className="flex items-center justify-center gap-1 mb-3 p-1 rounded-xl border border-white/[0.08] bg-surface-2/60 max-w-md mx-auto">
          {MODE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setMode(t.id);
                setError(null);
              }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
                mode === t.id
                  ? 'bg-white text-black'
                  : 'text-secondary hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-tertiary max-w-xl mx-auto mb-6">{activeMode.help}</p>

        {/* Input */}
        <motion.form
          onSubmit={onSubmit}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="relative flex flex-col sm:flex-row gap-2 sm:gap-3 p-2 rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md shadow-[0_24px_64px_rgba(0,0,0,0.45)]"
        >
          <div className="flex items-center gap-2 px-3 flex-1 min-w-0">
            {mode === 'website' ? (
              <Globe2 className="w-4 h-4 text-tertiary flex-shrink-0" />
            ) : (
              <MapPin className="w-4 h-4 text-tertiary flex-shrink-0" />
            )}
            <input
              type="text"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              placeholder={activeMode.placeholder}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-tertiary py-3 disabled:opacity-60"
              aria-label={mode === 'website' ? 'Website URL' : 'Google Maps URL'}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-black text-sm font-semibold shadow-[0_4px_16px_rgba(255,255,255,0.08)] disabled:opacity-50 disabled:pointer-events-none transition-colors hover:bg-[#E5E5E5]"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? 'Auditing…' : 'Run audit'}
          </button>
        </motion.form>

        {error && !loading && <p className="mt-3 text-xs text-red-300/90 text-center">{error}</p>}

        {/* Loading skeleton */}
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3"
            >
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-xl border border-white/[0.06] bg-surface-2/40 shimmer-bg"
                />
              ))}
            </motion.div>
          )}

          {/* Maps result wrapper */}
          {!loading && maps && (
            <motion.div
              key="maps-result"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-10 space-y-6"
            >
              <BusinessCard business={maps.business} />
              <RecommendationsCard recs={maps.recommendations} />
              {!maps.business.website_uri && (
                <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 p-5">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-white/70 mt-0.5" />
                    <p className="text-sm text-secondary">
                      No website is listed on this Google Business Profile, so we ran the Maps-only
                      audit. Add a website URL in Google Business Profile and re-run for the full
                      SEO/AEO scorecard.
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Website audit (shown by both modes when present) */}
          {!loading && audit && (
            <motion.div
              key="audit-result"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-6 space-y-6"
            >
              <HeaderCard audit={audit} />
              <CategoryGrid scores={audit.category_scores} />
              <MetaSnippet audit={audit} />
              <FindingsByCategory findings={allFindings} />

              <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 p-6 text-center">
                <p className="text-sm text-secondary mb-4">
                  Ready to run audits like this on every prospect — and follow up with personalized
                  outreach? Cold Scout's pipeline turns this scorecard into pre-drafted emails for
                  each lead.
                </p>
                <Link
                  to="/signup"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black text-sm font-semibold shadow-lg hover:bg-[#E5E5E5] transition-colors"
                >
                  Try Cold Scout free <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <p className="text-[11px] text-tertiary text-center pt-2">
                Audits are performed live and not stored. Cold Scout never contacts the audited
                business on your behalf without explicit setup.
              </p>
            </motion.div>
          )}

          {/* Empty / hint state */}
          {!loading && !audit && !maps && !error && (
            <motion.div
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              <FeatureCard
                icon={<Search className="w-5 h-5" />}
                title="SEO + Indexability"
                copy="Robots, sitemap, canonical, HTTPS, redirects, meta tags, headings — every signal Google uses."
              />
              <FeatureCard
                icon={<Bot className="w-5 h-5" />}
                title="AEO + Structured data"
                copy="JSON-LD types, FAQPage, HowTo, llms.txt, speakable — what answer engines need to cite you."
              />
              <FeatureCard
                icon={<Sparkles className="w-5 h-5" />}
                title="Performance + Trust"
                copy="HTML weight, inline CSS/JS, lazy-load coverage, privacy/terms links, contact info, social proof."
              />
              <FeatureCard
                icon={<MapPin className="w-5 h-5" />}
                title="Google Maps intel"
                copy="Rating, review velocity, photos, hours, status, editorial summary — and a prioritized growth plan."
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <PublicFooter />
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  copy,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface-2/40 p-5">
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/[0.06] border border-white/10 text-white">
        {icon}
      </div>
      <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs text-secondary leading-relaxed">{copy}</p>
    </div>
  );
}

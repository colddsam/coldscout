/**
 * Reusable audit-result panels.
 *
 * Extracted from LeadScanner.tsx so the same renderers power:
 *   - the live scanner page (/scanner)
 *   - the shared-report viewer (/shared/audit/:token)
 *
 * Anything that touches the *display* of a DeepAudit / MapsAuditResponse
 * lives here. Page-level concerns (input forms, gating, navigation) stay
 * in the host page.
 */
import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Globe2,
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
  ParkingCircle,
  Wallet,
  Utensils,
  MessageSquare,
  Lock,
  Cookie,
  Server,
  Network,
  FileWarning,
  Package,
  Mail,
} from 'lucide-react';

import type {
  DeepAudit,
  MapsAuditResponse,
  AuditFinding,
  AuditCategory,
  AuditSeverity,
  AuditCategoryScore,
  PlaceCategoryScore,
  SecurityAuditResponse,
  SecurityFinding,
  SecurityCategory,
  SecurityCategoryScore,
} from '../../lib/api';

/* ════════════════════ Display tables ════════════════════ */

// eslint-disable-next-line react-refresh/only-export-components
export const CATEGORY_LABEL: Record<AuditCategory, string> = {
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

// eslint-disable-next-line react-refresh/only-export-components
export const CATEGORY_ICON: Record<AuditCategory, React.ReactNode> = {
  indexability: <Search className="w-3.5 h-3.5" />,
  meta: <TypeIcon className="w-3.5 h-3.5" />,
  headings: <Heading1 className="w-3.5 h-3.5" />,
  content: <TypeIcon className="w-3.5 h-3.5" />,
  schema: <Code2 className="w-3.5 h-3.5" />,
  performance: <Zap className="w-3.5 h-3.5" />,
  mobile: <Smartphone className="w-3.5 h-3.5" />,
  accessibility: <Accessibility className="w-3.5 h-3.5" />,
  trust: <ShieldCheck className="w-3.5 h-3.5" />,
  aeo: <Bot className="w-3.5 h-3.5" />,
};

// eslint-disable-next-line react-refresh/only-export-components
export const SEVERITY_STYLE: Record<
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

export function ScoreRing({
  score,
  grade,
  size = 160,
}: {
  score: number;
  grade: string;
  size?: number;
}) {
  const radius = size * 0.4;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const tone = gradeTone(grade);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
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

export function CategoryBar({ cat }: { cat: AuditCategoryScore }) {
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

export function FindingRow({ finding }: { finding: AuditFinding }) {
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

export function CategoryGrid({ scores }: { scores: AuditCategoryScore[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {scores.map((cat) => (
        <CategoryBar key={cat.category} cat={cat} />
      ))}
    </div>
  );
}

export function FindingsByCategory({ findings }: { findings: AuditFinding[] }) {
  const grouped = useMemo(() => {
    const out: Record<string, AuditFinding[]> = {};
    for (const f of findings) {
      (out[f.category] ||= []).push(f);
    }
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

export function HeaderCard({ audit }: { audit: DeepAudit }) {
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

export function MetaSnippet({ audit }: { audit: DeepAudit }) {
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
          <span>
            schemas: {audit.detected_schemas.slice(0, 4).join(', ')}
            {audit.detected_schemas.length > 4 ? '…' : ''}
          </span>
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
            className={`w-3.5 h-3.5 ${
              i <= filled ? 'text-yellow-300 fill-yellow-300' : 'text-white/20'
            }`}
          />
        ))}
      </div>
      <span className="text-sm font-semibold text-white">{rating.toFixed(1)}</span>
      <span className="text-xs text-tertiary">({count.toLocaleString()})</span>
    </div>
  );
}

export function BusinessCard({ business }: { business: MapsAuditResponse['business'] }) {
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
            {business.price_level && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-white/15 bg-white/[0.04] text-[11px] text-tertiary">
                {business.price_level.replace(/PRICE_LEVEL_/, '').toLowerCase()}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat icon={<ImageIcon className="w-3.5 h-3.5" />} label="Photos" value={business.photo_count} />
        <Stat
          icon={<Star className="w-3.5 h-3.5" />}
          label="Reviews"
          value={business.user_rating_count ?? 0}
        />
        {business.phone && (
          <Stat
            icon={<Phone className="w-3.5 h-3.5" />}
            label="Phone"
            value={business.phone}
            valueClass="font-mono text-xs"
          />
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

      {(business.editorial_summary || business.generative_summary) && (
        <div className="mt-4 rounded-lg border border-white/[0.06] bg-surface-1/60 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary mb-1">From Google</div>
          <p className="text-sm text-white/85 leading-relaxed">
            {business.editorial_summary || business.generative_summary}
          </p>
        </div>
      )}

      {business.review_summary && (
        <div className="mt-3 rounded-lg border border-white/[0.06] bg-surface-1/60 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary mb-1">Google review summary</div>
          <p className="text-sm text-white/85 leading-relaxed">{business.review_summary}</p>
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
            {business.photo_thumbnails.slice(0, 12).map((src, i) => (
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
            {business.reviews.slice(0, 5).map((r, i) => (
              <div key={i} className="rounded-lg border border-white/[0.06] bg-surface-1/60 p-3">
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
                  <p className="mt-1.5 text-xs text-secondary leading-relaxed line-clamp-4">{r.text}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3 text-xs">
        {business.google_maps_uri && (
          <a
            href={business.google_maps_uri}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-white/80 hover:text-white"
          >
            Open on Google Maps <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {business.write_a_review_uri && (
          <a
            href={business.write_a_review_uri}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-white/80 hover:text-white"
          >
            Write a review <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

/* ───── Analytics + Scorecard ───── */

const PLACE_CATEGORY_LABEL: Record<PlaceCategoryScore['category'], string> = {
  reviews: 'Reviews',
  profile: 'Profile completeness',
  photos: 'Photos',
  engagement: 'Engagement',
  discoverability: 'Discoverability',
};

const PLACE_CATEGORY_ICON: Record<PlaceCategoryScore['category'], React.ReactNode> = {
  reviews: <Star className="w-3.5 h-3.5" />,
  profile: <ShieldCheck className="w-3.5 h-3.5" />,
  photos: <ImageIcon className="w-3.5 h-3.5" />,
  engagement: <MessageSquare className="w-3.5 h-3.5" />,
  discoverability: <Search className="w-3.5 h-3.5" />,
};

export function ScorecardCard({ scorecard }: { scorecard: MapsAuditResponse['scorecard'] }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-7">
        <ScoreRing score={scorecard.overall_score} grade={scorecard.grade} />
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <div className="text-[11px] uppercase tracking-[0.18em] text-tertiary">Local presence</div>
          <h2 className="mt-1 text-base sm:text-lg font-semibold">Place audit scorecard</h2>
          <p className="mt-3 text-sm text-white/85 leading-relaxed">{scorecard.summary}</p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {scorecard.categories.map((c) => {
              const tone =
                c.score >= 80
                  ? 'bg-emerald-400'
                  : c.score >= 60
                    ? 'bg-yellow-300'
                    : c.score >= 40
                      ? 'bg-orange-400'
                      : 'bg-red-400';
              return (
                <div key={c.category} className="rounded-xl border border-white/[0.08] bg-surface-1/60 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-white/[0.06] border border-white/10">
                        {PLACE_CATEGORY_ICON[c.category]}
                      </span>
                      {PLACE_CATEGORY_LABEL[c.category]}
                    </div>
                    <div className="text-sm font-bold text-white">{c.score}</div>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <motion.div
                      className={`h-full ${tone}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${c.score}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                  </div>
                  <div className="mt-2 text-[11px] text-secondary">{c.headline}</div>
                  <div className="text-[11px] text-tertiary line-clamp-2">{c.detail}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MetricsCard({
  metrics,
  benchmark,
}: {
  metrics: MapsAuditResponse['metrics'];
  benchmark: MapsAuditResponse['benchmark'];
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 text-white">
          <TrendingUp className="w-4 h-4" />
        </span>
        <h3 className="text-sm font-semibold text-white">Analytics &amp; metrics</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MetricBar label="Profile completeness" value={metrics.profile_completeness_pct} />
        <MetricBar label="NAP completeness" value={metrics.nap_completeness_pct} />
        <MetricBar label="Photo coverage" value={metrics.photo_coverage_pct} />
        <MetricBar label="Amenity disclosure" value={metrics.amenity_disclosure_pct} />
        <MetricBar label="Accessibility disclosure" value={metrics.accessibility_disclosure_pct} />
        <MetricBar label="Sentiment proxy" value={metrics.sentiment_proxy_pct} />
      </div>
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          label="Reviews / month"
          value={metrics.estimated_review_velocity_per_month.toFixed(1)}
        />
        <Stat
          icon={<Clock className="w-3.5 h-3.5" />}
          label="Last review"
          value={metrics.days_since_latest_review != null ? `${metrics.days_since_latest_review}d ago` : '—'}
        />
        <Stat
          icon={<Award className="w-3.5 h-3.5" />}
          label="Rating percentile"
          value={
            metrics.rating_percentile_estimate != null
              ? `Top ${100 - metrics.rating_percentile_estimate}%`
              : '—'
          }
        />
        <Stat
          icon={<TypeIcon className="w-3.5 h-3.5" />}
          label="Avg review length"
          value={`${metrics.avg_review_length_chars} chars`}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Tag tone={metrics.local_pack_eligible ? 'good' : 'warn'}>
          {metrics.local_pack_eligible ? 'Local-pack eligible' : 'Below local-pack threshold'}
        </Tag>
        {metrics.is_top_rated && <Tag tone="good">Top rated</Tag>}
        {metrics.is_low_rated && <Tag tone="bad">Below 4.0★</Tag>}
        {metrics.is_new_listing && <Tag tone="info">New listing</Tag>}
      </div>
      <div className="mt-5 rounded-lg border border-white/[0.06] bg-surface-1/60 p-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary mb-1">
          Benchmark — {benchmark.category_label}
        </div>
        <p className="text-xs text-secondary leading-relaxed">
          Healthy listings in this category typically have{' '}
          <strong className="text-white">{benchmark.review_benchmark}+ reviews</strong> and average{' '}
          <strong className="text-white">{benchmark.star_benchmark.toFixed(1)}★</strong>.
          {benchmark.review_gap > 0 ? (
            <>
              {' '}
              You need <strong className="text-white">{benchmark.review_gap}</strong> more reviews to reach the bar.
            </>
          ) : (
            <> Reviews already at or above the bar.</>
          )}
          {benchmark.star_gap > 0 ? (
            <>
              {' '}
              Average rating is <strong className="text-white">{benchmark.star_gap.toFixed(1)}</strong> below benchmark.
            </>
          ) : (
            <> Star rating already at or above benchmark.</>
          )}
        </p>
      </div>
    </div>
  );
}

function MetricBar({ label, value }: { label: string; value: number }) {
  const tone =
    value >= 80
      ? 'bg-emerald-400'
      : value >= 60
        ? 'bg-yellow-300'
        : value >= 40
          ? 'bg-orange-400'
          : 'bg-red-400';
  return (
    <div className="rounded-lg border border-white/[0.06] bg-surface-1/60 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary">{label}</div>
        <div className="text-xs font-bold text-white">{value}</div>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          className={`h-full ${tone}`}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

function Tag({
  tone,
  children,
}: {
  tone: 'good' | 'warn' | 'bad' | 'info';
  children: React.ReactNode;
}) {
  const styles = {
    good: 'bg-emerald-500/10 border-emerald-400/25 text-emerald-200',
    warn: 'bg-yellow-500/10 border-yellow-400/25 text-yellow-200',
    bad: 'bg-red-500/10 border-red-400/30 text-red-200',
    info: 'bg-white/[0.06] border-white/10 text-secondary',
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${styles}`}
    >
      {children}
    </span>
  );
}

/* ───── Attributes + amenities ───── */

type FlagDict = Record<string, boolean | null | undefined>;

const FLAG_LABELS: Record<string, string> = {
  delivery: 'Delivery',
  takeout: 'Takeout',
  dine_in: 'Dine in',
  curbside_pickup: 'Curbside pickup',
  reservable: 'Reservations',
  serves_breakfast: 'Breakfast',
  serves_lunch: 'Lunch',
  serves_dinner: 'Dinner',
  serves_brunch: 'Brunch',
  serves_beer: 'Beer',
  serves_wine: 'Wine',
  serves_cocktails: 'Cocktails',
  serves_coffee: 'Coffee',
  serves_dessert: 'Dessert',
  serves_vegetarian_food: 'Vegetarian',
  good_for_children: 'Kid-friendly',
  good_for_groups: 'Groups',
  good_for_watching_sports: 'Sports viewing',
  allows_dogs: 'Dogs allowed',
  live_music: 'Live music',
  menu_for_children: 'Kids menu',
  outdoor_seating: 'Outdoor seating',
  restroom: 'Restroom',
  wheelchair_accessible_parking: 'WC parking',
  wheelchair_accessible_entrance: 'WC entrance',
  wheelchair_accessible_restroom: 'WC restroom',
  wheelchair_accessible_seating: 'WC seating',
  free_parking_lot: 'Free parking lot',
  paid_parking_lot: 'Paid parking lot',
  free_street_parking: 'Free street parking',
  paid_street_parking: 'Paid street parking',
  valet_parking: 'Valet',
  free_garage_parking: 'Free garage',
  paid_garage_parking: 'Paid garage',
  accepts_credit_cards: 'Credit cards',
  accepts_debit_cards: 'Debit cards',
  accepts_cash_only: 'Cash only',
  accepts_nfc: 'Tap-to-pay (NFC)',
};

function FlagList({
  title,
  icon,
  flags,
}: {
  title: string;
  icon: React.ReactNode;
  flags: FlagDict;
}) {
  const known = Object.entries(flags).filter(([, v]) => v === true || v === false);
  if (known.length === 0) return null;
  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface-1/60 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 text-white">
          {icon}
        </span>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {known.map(([k, v]) => (
          <span
            key={k}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${
              v
                ? 'bg-emerald-500/10 border-emerald-400/25 text-emerald-200'
                : 'bg-white/[0.04] border-white/10 text-tertiary line-through'
            }`}
          >
            {v ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            {FLAG_LABELS[k] || k.replace(/_/g, ' ')}
          </span>
        ))}
      </div>
    </div>
  );
}

export function AttributesCard({ business }: { business: MapsAuditResponse['business'] }) {
  const amenityCount = Object.values(business.amenities).filter((v) => v === true || v === false).length;
  const accessibilityCount = Object.values(business.accessibility).filter(
    (v) => v === true || v === false,
  ).length;
  const parkingCount = Object.values(business.parking).filter((v) => v === true || v === false).length;
  const paymentsCount = Object.values(business.payments).filter((v) => v === true || v === false).length;
  if (amenityCount + accessibilityCount + parkingCount + paymentsCount === 0) return null;
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 text-white">
          <Sparkles className="w-4 h-4" />
        </span>
        <h3 className="text-sm font-semibold text-white">Listing attributes &amp; services</h3>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <FlagList
          title="Services &amp; amenities"
          icon={<Utensils className="w-3.5 h-3.5" />}
          flags={business.amenities as unknown as FlagDict}
        />
        <FlagList
          title="Accessibility"
          icon={<Accessibility className="w-3.5 h-3.5" />}
          flags={business.accessibility as unknown as FlagDict}
        />
        <FlagList
          title="Parking"
          icon={<ParkingCircle className="w-3.5 h-3.5" />}
          flags={business.parking as unknown as FlagDict}
        />
        <FlagList
          title="Payments"
          icon={<Wallet className="w-3.5 h-3.5" />}
          flags={business.payments as unknown as FlagDict}
        />
      </div>
    </div>
  );
}

export function LocationCard({ business }: { business: MapsAuditResponse['business'] }) {
  const rows: { label: string; value: string | null | undefined }[] = [
    { label: 'Country', value: business.country },
    { label: 'Region', value: business.region },
    { label: 'City', value: business.city },
    { label: 'Sublocality', value: business.sublocality },
    { label: 'Neighborhood', value: business.neighborhood },
    { label: 'Postal code', value: business.postal_code },
    { label: 'Plus code', value: business.plus_code_compound || business.plus_code_global },
    {
      label: 'Coordinates',
      value:
        business.latitude && business.longitude
          ? `${business.latitude.toFixed(5)}, ${business.longitude.toFixed(5)}`
          : null,
    },
    { label: 'Place ID', value: business.place_id },
  ];
  const visible = rows.filter((r) => !!r.value);
  if (visible.length === 0) return null;
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 text-white">
          <MapPin className="w-4 h-4" />
        </span>
        <h3 className="text-sm font-semibold text-white">Location &amp; identifiers</h3>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {visible.map((r) => (
          <div key={r.label} className="rounded-lg border border-white/[0.06] bg-surface-1/60 p-3">
            <dt className="text-[10px] uppercase tracking-[0.18em] text-tertiary">{r.label}</dt>
            <dd className="mt-1 text-xs text-white font-medium break-words">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function RecommendationsCard({ recs }: { recs: MapsAuditResponse['recommendations'] }) {
  if (recs.length === 0) return null;
  const priorityRank: Record<'high' | 'medium' | 'low', number> = { high: 0, medium: 1, low: 2 };
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

export function Pill({ ok, label, icon }: { ok: boolean; label: string; icon?: React.ReactNode }) {
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

export function Stat({
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

/* ════════════════════ Combined renderer ════════════════════ */

export function MapsAuditView({ maps }: { maps: MapsAuditResponse }) {
  return (
    <div className="space-y-6">
      <ScorecardCard scorecard={maps.scorecard} />
      <BusinessCard business={maps.business} />
      <MetricsCard metrics={maps.metrics} benchmark={maps.benchmark} />
      <AttributesCard business={maps.business} />
      <LocationCard business={maps.business} />
      <RecommendationsCard recs={maps.recommendations} />
      {!maps.business.website_uri && (
        <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 p-5">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-white/70 mt-0.5" />
            <p className="text-sm text-secondary">
              No website is listed on this Google Business Profile, so we ran the Maps-only audit. Add a
              website URL in Google Business Profile and re-run for the full SEO/AEO scorecard.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function WebsiteAuditView({
  audit,
  extraFindings = [],
}: {
  audit: DeepAudit;
  extraFindings?: AuditFinding[];
}) {
  const allFindings = useMemo(
    () => [...extraFindings, ...(audit.findings ?? [])],
    [audit, extraFindings],
  );
  return (
    <div className="space-y-6">
      <HeaderCard audit={audit} />
      <CategoryGrid scores={audit.category_scores} />
      <MetaSnippet audit={audit} />
      <FindingsByCategory findings={allFindings} />
    </div>
  );
}

/* ════════════════════ Security audit display ════════════════════ */

// eslint-disable-next-line react-refresh/only-export-components
export const SECURITY_CATEGORY_LABEL: Record<SecurityCategory, string> = {
  tls: 'TLS / certificate',
  headers: 'Security headers',
  cookies: 'Cookies',
  content: 'Content + forms',
  info_disclosure: 'Info disclosure',
  dns_email: 'DNS &amp; email auth',
  fingerprinting: 'Fingerprinting',
  dependencies: 'Dependencies',
  privacy: 'Privacy &amp; legal',
};

// eslint-disable-next-line react-refresh/only-export-components
export const SECURITY_CATEGORY_ICON: Record<SecurityCategory, React.ReactNode> = {
  tls: <Lock className="w-3.5 h-3.5" />,
  headers: <ShieldCheck className="w-3.5 h-3.5" />,
  cookies: <Cookie className="w-3.5 h-3.5" />,
  content: <Code2 className="w-3.5 h-3.5" />,
  info_disclosure: <FileWarning className="w-3.5 h-3.5" />,
  dns_email: <Network className="w-3.5 h-3.5" />,
  fingerprinting: <Server className="w-3.5 h-3.5" />,
  dependencies: <Package className="w-3.5 h-3.5" />,
  privacy: <Mail className="w-3.5 h-3.5" />,
};

function SecurityCategoryBar({ cat }: { cat: SecurityCategoryScore }) {
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
            {SECURITY_CATEGORY_ICON[cat.category]}
          </span>
          {SECURITY_CATEGORY_LABEL[cat.category]}
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

function SecurityFindingRow({ finding }: { finding: SecurityFinding }) {
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
              {SECURITY_CATEGORY_LABEL[finding.category]}
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
              {finding.evidence && (
                <div className="rounded-lg border border-white/[0.06] bg-surface-1/80 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary mb-1">Evidence</div>
                  <code className="text-[11px] text-white/85 break-all font-mono">{finding.evidence}</code>
                </div>
              )}
              <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-emerald-200/80 mb-1">
                  <Lightbulb className="w-3 h-3" />
                  Recommended fix
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

function SecurityHeaderCard({ audit }: { audit: SecurityAuditResponse }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-7">
        <ScoreRing score={audit.overall_score} grade={audit.grade} />
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <div className="text-[11px] uppercase tracking-[0.18em] text-tertiary">Security posture</div>
          <div className="mt-1 text-base sm:text-lg font-semibold truncate">
            {audit.final_url || audit.normalized_url}
          </div>
          <p className="mt-3 text-sm text-white/85 leading-relaxed">{audit.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2 justify-center sm:justify-start">
            <Pill ok={audit.has_ssl} label={audit.has_ssl ? 'HTTPS' : 'No HTTPS'} />
            <Pill ok={audit.has_hsts} label={audit.has_hsts ? 'HSTS' : 'No HSTS'} />
            <Pill ok={audit.has_csp} label={audit.has_csp ? 'CSP' : 'No CSP'} />
            <Pill
              ok={audit.mixed_content_count === 0}
              label={
                audit.mixed_content_count === 0
                  ? 'No mixed content'
                  : `${audit.mixed_content_count} mixed-content asset(s)`
              }
            />
            <Pill
              ok={audit.insecure_form_count === 0}
              label={
                audit.insecure_form_count === 0
                  ? 'Forms over HTTPS'
                  : `${audit.insecure_form_count} insecure form(s)`
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TLSCard({ tls }: { tls: SecurityAuditResponse['tls'] }) {
  if (!tls) return null;
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 text-white">
          <Lock className="w-4 h-4" />
        </span>
        <h3 className="text-sm font-semibold text-white">TLS &amp; certificate</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Stat icon={<Lock className="w-3.5 h-3.5" />} label="Protocol" value={tls.protocol ?? '—'} />
        <Stat
          icon={<Code2 className="w-3.5 h-3.5" />}
          label="Cipher"
          value={tls.cipher_name ?? '—'}
          valueClass="font-mono text-xs"
        />
        <Stat
          icon={<ShieldCheck className="w-3.5 h-3.5" />}
          label="Chain validates"
          value={tls.chain_ok === false ? 'No' : tls.chain_ok ? 'Yes' : '—'}
          valueClass={tls.chain_ok === false ? 'text-red-300' : ''}
        />
        <Stat
          icon={<Clock className="w-3.5 h-3.5" />}
          label="Expires in"
          value={tls.days_until_expiry == null ? '—' : `${tls.days_until_expiry} day(s)`}
          valueClass={
            tls.days_until_expiry != null && tls.days_until_expiry < 14
              ? 'text-red-300'
              : ''
          }
        />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 text-xs">
        {tls.issuer && (
          <div className="rounded-lg border border-white/[0.06] bg-surface-1/60 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary">Issuer</div>
            <div className="mt-1 text-white/85 break-all font-mono text-[11px]">{tls.issuer}</div>
          </div>
        )}
        {tls.subject && (
          <div className="rounded-lg border border-white/[0.06] bg-surface-1/60 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary">Subject</div>
            <div className="mt-1 text-white/85 break-all font-mono text-[11px]">{tls.subject}</div>
          </div>
        )}
        {tls.san.length > 0 && (
          <div className="rounded-lg border border-white/[0.06] bg-surface-1/60 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary">SAN ({tls.san.length})</div>
            <div className="mt-1 text-white/85 break-all font-mono text-[11px] line-clamp-3">
              {tls.san.join(', ')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HeadersCard({ headers }: { headers: SecurityAuditResponse['headers'] }) {
  if (!headers || headers.length === 0) return null;
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 text-white">
          <ShieldCheck className="w-4 h-4" />
        </span>
        <h3 className="text-sm font-semibold text-white">Security headers</h3>
      </div>
      <div className="space-y-1.5">
        {headers.map((h) => {
          const style = SEVERITY_STYLE[h.severity];
          return (
            <div
              key={h.name}
              className={`flex items-start gap-3 p-3 rounded-lg border ${style.ring} bg-surface-1/60`}
            >
              <span
                className={`mt-0.5 inline-flex items-center justify-center rounded-md border px-1.5 py-1 ${style.pill} flex-shrink-0`}
              >
                {style.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-xs font-mono text-white">{h.name}</code>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-tertiary">
                    {h.present ? 'present' : 'missing'}
                  </span>
                </div>
                {h.value && (
                  <div className="mt-1 text-[11px] text-white/85 break-all font-mono line-clamp-2">
                    {h.value}
                  </div>
                )}
                {h.note && <p className="mt-1 text-[11px] text-secondary">{h.note}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CookiesCard({ cookies }: { cookies: SecurityAuditResponse['cookies'] }) {
  if (!cookies || cookies.length === 0) return null;
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 text-white">
          <Cookie className="w-4 h-4" />
        </span>
        <h3 className="text-sm font-semibold text-white">Cookies set</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {cookies.map((c) => {
          const style = SEVERITY_STYLE[c.severity];
          return (
            <div
              key={c.name}
              className={`flex items-start gap-2.5 p-3 rounded-lg border ${style.ring} bg-surface-1/60`}
            >
              <span
                className={`mt-0.5 inline-flex items-center justify-center rounded-md border px-1.5 py-1 ${style.pill} flex-shrink-0`}
              >
                {style.icon}
              </span>
              <div className="min-w-0 flex-1">
                <code className="text-xs font-mono text-white truncate block">{c.name}</code>
                <div className="mt-1 flex flex-wrap gap-1">
                  <span
                    className={`text-[10px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border ${
                      c.secure
                        ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
                        : 'border-red-400/30 bg-red-500/10 text-red-200'
                    }`}
                  >
                    {c.secure ? 'secure' : 'no secure'}
                  </span>
                  <span
                    className={`text-[10px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border ${
                      c.http_only
                        ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
                        : 'border-yellow-400/25 bg-yellow-500/10 text-yellow-200'
                    }`}
                  >
                    {c.http_only ? 'httponly' : 'no httponly'}
                  </span>
                  <span
                    className={`text-[10px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border ${
                      c.same_site
                        ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
                        : 'border-white/15 bg-white/[0.04] text-tertiary'
                    }`}
                  >
                    SameSite={c.same_site || 'none'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExposedPathsCard({ paths }: { paths: SecurityAuditResponse['exposed_paths'] }) {
  if (!paths || paths.length === 0) return null;
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 text-white">
          <FileWarning className="w-4 h-4" />
        </span>
        <h3 className="text-sm font-semibold text-white">Probe results</h3>
      </div>
      <div className="space-y-1.5">
        {paths.map((p) => {
          const style = SEVERITY_STYLE[p.severity];
          return (
            <div
              key={p.path}
              className={`flex items-start gap-3 p-3 rounded-lg border ${style.ring} bg-surface-1/60`}
            >
              <span
                className={`mt-0.5 inline-flex items-center justify-center rounded-md border px-1.5 py-1 ${style.pill} flex-shrink-0`}
              >
                {style.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-xs font-mono text-white">{p.path}</code>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-tertiary">
                    HTTP {p.status}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-secondary">{p.note}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DNSEmailCard({ dns }: { dns: SecurityAuditResponse['dns_email'] }) {
  if (!dns) return null;
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 text-white">
          <Network className="w-4 h-4" />
        </span>
        <h3 className="text-sm font-semibold text-white">DNS &amp; email auth</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          icon={<Mail className="w-3.5 h-3.5" />}
          label="MX records"
          value={dns.has_mx ? 'Present' : 'None'}
          valueClass={dns.has_mx ? '' : 'text-tertiary'}
        />
        <Stat
          icon={<ShieldCheck className="w-3.5 h-3.5" />}
          label="SPF"
          value={dns.spf_record ? 'Set' : 'Missing'}
          valueClass={dns.spf_record ? 'text-emerald-300' : 'text-red-300'}
        />
        <Stat
          icon={<ShieldCheck className="w-3.5 h-3.5" />}
          label="DMARC"
          value={dns.dmarc_record ? 'Set' : 'Missing'}
          valueClass={dns.dmarc_record ? 'text-emerald-300' : 'text-red-300'}
        />
        <Stat
          icon={<Lock className="w-3.5 h-3.5" />}
          label="DNSSEC"
          value={dns.has_dnssec ? 'Enabled' : dns.has_dnssec === false ? 'Disabled' : 'Unknown'}
          valueClass={dns.has_dnssec ? 'text-emerald-300' : ''}
        />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 text-xs">
        {dns.spf_record && (
          <div className="rounded-lg border border-white/[0.06] bg-surface-1/60 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary">SPF</div>
            <div className="mt-1 text-white/85 break-all font-mono text-[11px]">
              {dns.spf_record}
            </div>
          </div>
        )}
        {dns.dmarc_record && (
          <div className="rounded-lg border border-white/[0.06] bg-surface-1/60 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary">DMARC</div>
            <div className="mt-1 text-white/85 break-all font-mono text-[11px]">
              {dns.dmarc_record}
            </div>
          </div>
        )}
        {dns.caa_records.length > 0 && (
          <div className="rounded-lg border border-white/[0.06] bg-surface-1/60 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary">
              CAA ({dns.caa_records.length})
            </div>
            <div className="mt-1 space-y-1">
              {dns.caa_records.slice(0, 6).map((r, i) => (
                <div key={i} className="text-white/85 break-all font-mono text-[11px]">
                  {r}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LibrariesCard({
  libs,
  server,
  poweredBy,
}: {
  libs: SecurityAuditResponse['detected_libraries'];
  server: string | null;
  poweredBy: string | null;
}) {
  if (libs.length === 0 && !server && !poweredBy) return null;
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 text-white">
          <Package className="w-4 h-4" />
        </span>
        <h3 className="text-sm font-semibold text-white">Detected stack</h3>
      </div>
      {(server || poweredBy) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          {server && (
            <Stat
              icon={<Server className="w-3.5 h-3.5" />}
              label="Server"
              value={server}
              valueClass="font-mono text-xs"
            />
          )}
          {poweredBy && (
            <Stat
              icon={<Code2 className="w-3.5 h-3.5" />}
              label="X-Powered-By"
              value={poweredBy}
              valueClass="font-mono text-xs"
            />
          )}
        </div>
      )}
      {libs.length > 0 && (
        <div className="space-y-1.5">
          {libs.map((l, i) => {
            const style = SEVERITY_STYLE[l.severity];
            return (
              <div
                key={`${l.name}-${l.version}-${i}`}
                className={`flex items-start gap-3 p-3 rounded-lg border ${style.ring} bg-surface-1/60`}
              >
                <span
                  className={`mt-0.5 inline-flex items-center justify-center rounded-md border px-1.5 py-1 ${style.pill} flex-shrink-0`}
                >
                  {style.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">{l.name}</span>
                    {l.version && (
                      <code className="text-xs font-mono text-tertiary">{l.version}</code>
                    )}
                  </div>
                  {l.note && <p className="mt-1 text-[11px] text-secondary">{l.note}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SecurityCategoryGrid({ scores }: { scores: SecurityCategoryScore[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {scores.map((cat) => (
        <SecurityCategoryBar key={cat.category} cat={cat} />
      ))}
    </div>
  );
}

function SecurityFindingsByCategory({ findings }: { findings: SecurityFinding[] }) {
  const grouped = useMemo(() => {
    const out: Record<string, SecurityFinding[]> = {};
    for (const f of findings) {
      (out[f.category] ||= []).push(f);
    }
    for (const k of Object.keys(out)) {
      out[k].sort(
        (a, b) => SEVERITY_STYLE[a.severity].sortKey - SEVERITY_STYLE[b.severity].sortKey,
      );
    }
    return out;
  }, [findings]);
  const ordered: SecurityCategory[] = [
    'tls',
    'headers',
    'cookies',
    'content',
    'info_disclosure',
    'dns_email',
    'fingerprinting',
    'dependencies',
    'privacy',
  ];
  return (
    <div className="space-y-6">
      {ordered.map((cat) => {
        const items = grouped[cat];
        if (!items || items.length === 0) return null;
        return (
          <section key={cat}>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 text-white">
                {SECURITY_CATEGORY_ICON[cat]}
              </span>
              <h2 className="text-sm font-semibold text-white">
                {SECURITY_CATEGORY_LABEL[cat]}
              </h2>
              <span className="text-[10px] uppercase tracking-[0.15em] text-tertiary">
                {items.length} {items.length === 1 ? 'finding' : 'findings'}
              </span>
            </div>
            <div className="space-y-2">
              {items.map((f) => (
                <SecurityFindingRow key={f.code + f.title} finding={f} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function SecurityAuditView({ audit }: { audit: SecurityAuditResponse }) {
  return (
    <div className="space-y-6">
      <SecurityHeaderCard audit={audit} />
      <SecurityCategoryGrid scores={audit.category_scores} />
      <TLSCard tls={audit.tls} />
      <HeadersCard headers={audit.headers} />
      <CookiesCard cookies={audit.cookies} />
      <ExposedPathsCard paths={audit.exposed_paths} />
      <DNSEmailCard dns={audit.dns_email} />
      <LibrariesCard
        libs={audit.detected_libraries}
        server={audit.server_software}
        poweredBy={audit.powered_by}
      />
      <SecurityFindingsByCategory findings={audit.findings} />
    </div>
  );
}

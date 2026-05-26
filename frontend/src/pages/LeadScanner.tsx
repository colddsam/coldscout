/**
 * Lead Scanner — comprehensive SEO + AEO + business audit.
 *
 * Two input modes:
 *   1. Website URL  → POST /api/v1/public/audit-website  → DeepAudit  (free, anonymous)
 *   2. Google Maps  → POST /api/v1/audit/place           → MapsAuditResponse
 *                     (Pro/Enterprise only — requires login + active plan)
 *
 * The website tab stays free as a public lead magnet. The Maps tab is
 * gated: anonymous and free-plan users see the feature preview with a
 * "Sign in" / "Upgrade to Pro" CTA, but cannot run the audit.
 *
 * Once an audit is run, the user can hit "Share report" to send the
 * snapshot to recipients. The share modal handles anonymous → signin
 * → resume flow via sessionStorage; the recipient lands on
 * /shared/audit/:token where they must sign in to view.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe2,
  Loader2,
  Search,
  Sparkles,
  MapPin,
  Award,
  Bot,
  ArrowRight,
  Lock,
  Crown,
  LogIn,
  Share2,
  TrendingUp,
  Lightbulb,
  ShieldCheck,
  Cookie,
  Server,
  Network,
  Package,
  FileWarning,
  Code2,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { useSEO } from '../hooks/useSEO';
import { useAuth } from '../hooks/useAuth';
import {
  auditWebsite,
  auditPlace,
  auditSecurity,
  auditSecurityPlace,
  getAuditAccess,
  getSecurityAuditAccess,
  type DeepAudit,
  type MapsAuditResponse,
  type AuditFinding,
  type SecurityAuditResponse,
  type SecurityAuditPlaceResponse,
} from '../lib/api';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import {
  MapsAuditView,
  WebsiteAuditView,
  SecurityAuditView,
} from '../components/scanner/AuditResultPanels';
import ShareReportModal, {
  PENDING_SHARE_KEY,
  type SharePayload,
} from '../components/scanner/ShareReportModal';

/* ════════════════════ Display tables ════════════════════ */

type Mode = 'website' | 'maps' | 'security';
type SecuritySubMode = 'website' | 'maps';

const MODE_TABS: { id: Mode; label: string; help: string; placeholder: string }[] = [
  {
    id: 'website',
    label: 'Website SEO',
    help: 'Paste any business website. We audit SEO, AEO, performance, trust, and accessibility — and tell you what to fix first.',
    placeholder: 'example.com',
  },
  {
    id: 'maps',
    label: 'Google Maps',
    help: 'Paste a Google Maps share link, place ID, or business name. We pull the full Google Business Profile + analytics, audit the linked website, and surface a prioritized growth plan.',
    placeholder: 'https://maps.app.goo.gl/... or "Acme Cafe, Bengaluru"',
  },
  {
    id: 'security',
    label: 'Security audit',
    help: 'Run a comprehensive security scan — TLS, security headers, cookies, mixed content, info disclosure, SPF/DMARC, dependency versions. Pro & Enterprise feature.',
    placeholder: 'example.com or a Google Maps URL',
  },
];

/* ════════════════════ Locked-mode preview ════════════════════ */

function LockedMapsPreview({
  isAuthenticated,
  plan,
  reason,
}: {
  isAuthenticated: boolean;
  plan: string | null;
  reason: string | null;
}) {
  const headline = !isAuthenticated
    ? 'Sign in to unlock the Google Maps audit'
    : plan === 'free'
      ? 'Upgrade to Pro to unlock the Google Maps audit'
      : 'Renew your subscription to keep using the Maps audit';
  const cta = !isAuthenticated ? (
    <Link
      to="/login"
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black text-sm font-semibold shadow-lg hover:bg-[#E5E5E5] transition-colors"
    >
      <LogIn className="w-3.5 h-3.5" /> Sign in to continue
    </Link>
  ) : (
    <Link
      to="/billing"
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black text-sm font-semibold shadow-lg hover:bg-[#E5E5E5] transition-colors"
    >
      <Crown className="w-3.5 h-3.5" /> Upgrade to Pro
    </Link>
  );

  const features = [
    {
      title: 'Full Google Business Profile pull',
      detail: 'Rating, reviews, photos, hours, attributes, accessibility, parking, payments, services.',
      icon: <MapPin className="w-4 h-4" />,
    },
    {
      title: 'Computed analytics + benchmarks',
      detail:
        'Profile completeness, NAP score, review velocity, sentiment proxy, local-pack eligibility, rating percentile.',
      icon: <TrendingUp className="w-4 h-4" />,
    },
    {
      title: 'Five-category scorecard',
      detail: 'Reviews, profile, photos, engagement, discoverability — each with a 0-100 score and headline.',
      icon: <Award className="w-4 h-4" />,
    },
    {
      title: 'Linked-website deep audit',
      detail: 'When the listing has a website, we run the same SEO + AEO + trust audit and fold it into the score.',
      icon: <Globe2 className="w-4 h-4" />,
    },
    {
      title: 'Prioritized growth plan',
      detail: 'High/medium/low priority recommendations specifically derived from this listing.',
      icon: <Lightbulb className="w-4 h-4" />,
    },
    {
      title: 'Universal URL resolver',
      detail: 'Paste any Maps share link, place ID, or even just the business name — we resolve it.',
      icon: <Search className="w-4 h-4" />,
    },
  ];

  return (
    <div className="mt-6 rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-6 sm:p-8 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/10 mb-4">
        <Lock className="w-5 h-5 text-white/80" />
      </div>
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-[0.18em] uppercase bg-amber-500/10 border border-amber-400/30 text-amber-200">
        <Crown className="w-3.5 h-3.5" /> Pro &amp; Enterprise
      </span>
      <h2 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight">{headline}</h2>
      <p className="mt-2 text-sm text-secondary max-w-xl mx-auto leading-relaxed">
        {reason ||
          'The Google Maps audit pulls every signal Google exposes about a business and turns it into a prioritized growth plan. Ten audits/month included on Pro, unlimited on Enterprise.'}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {cta}
        <Link
          to="/pricing"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 bg-white/[0.04] text-sm font-semibold text-white hover:bg-white/[0.08] transition-colors"
        >
          See pricing
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-left">
        {features.map((f) => (
          <div key={f.title} className="rounded-2xl border border-white/[0.08] bg-surface-1/60 p-4">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/[0.06] border border-white/10 text-white">
              {f.icon}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-white">{f.title}</h3>
            <p className="mt-1 text-xs text-secondary leading-relaxed">{f.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════ Locked-security preview ════════════════════ */

function LockedSecurityPreview({
  isAuthenticated,
  plan,
  reason,
}: {
  isAuthenticated: boolean;
  plan: string | null;
  reason: string | null;
}) {
  const headline = !isAuthenticated
    ? 'Sign in to unlock the website security audit'
    : plan === 'free'
      ? 'Upgrade to Pro to unlock the security audit'
      : 'Renew your subscription to keep using the security audit';
  const cta = !isAuthenticated ? (
    <Link
      to="/login"
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black text-sm font-semibold shadow-lg hover:bg-[#E5E5E5] transition-colors"
    >
      <LogIn className="w-3.5 h-3.5" /> Sign in to continue
    </Link>
  ) : (
    <Link
      to="/billing"
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black text-sm font-semibold shadow-lg hover:bg-[#E5E5E5] transition-colors"
    >
      <Crown className="w-3.5 h-3.5" /> Upgrade to Pro
    </Link>
  );

  const features = [
    {
      title: 'TLS certificate inspection',
      detail: 'Validity, chain, protocol version, cipher suite, expiry countdown, SAN coverage.',
      icon: <Lock className="w-4 h-4" />,
    },
    {
      title: 'OWASP-aligned security headers',
      detail: 'HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP/COEP/CORP.',
      icon: <ShieldCheck className="w-4 h-4" />,
    },
    {
      title: 'Cookie flag audit',
      detail: 'Secure, HttpOnly, SameSite per cookie — flags the ones a stolen session could ride.',
      icon: <Cookie className="w-4 h-4" />,
    },
    {
      title: 'Info-disclosure probes',
      detail: '.env, .git/, phpinfo, server-status, .htpasswd, .DS_Store — paths attackers fingerprint within minutes.',
      icon: <FileWarning className="w-4 h-4" />,
    },
    {
      title: 'SPF / DMARC / CAA / DNSSEC',
      detail: 'Email-auth + cert-issuance + DNS-integrity records — the spoofing & phishing surface most teams forget.',
      icon: <Network className="w-4 h-4" />,
    },
    {
      title: 'Server fingerprinting',
      detail: 'Banner leakage, X-Powered-By, EOL software versions (PHP 5.x, Apache 2.2, OpenSSL 1.0.x).',
      icon: <Server className="w-4 h-4" />,
    },
    {
      title: 'Dependency version detection',
      detail: 'Outdated jQuery / Bootstrap / Angular + CMS generator tags that expose known-vulnerable versions.',
      icon: <Package className="w-4 h-4" />,
    },
    {
      title: 'Mixed content + form audit',
      detail: 'HTTP resources on HTTPS pages, forms posting to plain HTTP, missing Subresource Integrity on CDN scripts.',
      icon: <Code2 className="w-4 h-4" />,
    },
    {
      title: 'Maps URL mode',
      detail: 'Paste a Google Maps URL — we resolve the listing and run the full audit on its website automatically.',
      icon: <MapPin className="w-4 h-4" />,
    },
  ];

  return (
    <div className="mt-6 rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-6 sm:p-8 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/10 mb-4">
        <Lock className="w-5 h-5 text-white/80" />
      </div>
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-[0.18em] uppercase bg-rose-500/10 border border-rose-400/30 text-rose-200">
        <ShieldCheck className="w-3.5 h-3.5" /> Pro &amp; Enterprise
      </span>
      <h2 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight">{headline}</h2>
      <p className="mt-2 text-sm text-secondary max-w-xl mx-auto leading-relaxed">
        {reason ||
          'The security audit scans the entire public-facing security surface of a website — TLS, headers, cookies, DNS, dependencies, and exposed paths — in one click. Free on Pro and Enterprise.'}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {cta}
        <Link
          to="/pricing"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 bg-white/[0.04] text-sm font-semibold text-white hover:bg-white/[0.08] transition-colors"
        >
          See pricing
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-left">
        {features.map((f) => (
          <div key={f.title} className="rounded-2xl border border-white/[0.08] bg-surface-1/60 p-4">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/[0.06] border border-white/10 text-white">
              {f.icon}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-white">{f.title}</h3>
            <p className="mt-1 text-xs text-secondary leading-relaxed">{f.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════ Page ════════════════════ */

export default function LeadScanner() {
  useSEO({
    title: 'Free SEO Audit + AEO Audit + Google Maps Audit — Cold Scout',
    description:
      'Paste any website URL or Google Maps share link. Get an instant, comprehensive SEO + AEO + business audit with prioritized actions to grow your business.',
    canonical: 'https://coldscout.colddsam.com/scanner',
    keywords:
      'free SEO audit, AEO audit, Google Maps audit, website scanner, business audit, local SEO checker, structured data validator, Cold Scout scanner',
    index: true,
  });

  const { isAuthenticated, hasPaidPlan, user, isLoading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>('website');
  // Security sub-mode: 'website' (plain URL) vs 'maps' (Google Maps URL).
  // We keep this separate from the top-level Mode so switching between SEO
  // and security doesn't lose the user's last sub-mode choice.
  const [securitySub, setSecuritySub] = useState<SecuritySubMode>('website');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [audit, setAudit] = useState<DeepAudit | null>(null);
  const [maps, setMaps] = useState<MapsAuditResponse | null>(null);
  const [security, setSecurity] = useState<SecurityAuditResponse | null>(null);
  const [securityPlace, setSecurityPlace] = useState<SecurityAuditPlaceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessReason, setAccessReason] = useState<string | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);
  const [secAccessReason, setSecAccessReason] = useState<string | null>(null);
  const [secAccessChecked, setSecAccessChecked] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);

  const activeMode = MODE_TABS.find((t) => t.id === mode)!;
  const mapsLocked = !isAuthenticated || !hasPaidPlan;
  const securityLocked = !isAuthenticated || !hasPaidPlan;

  // On mount: if a pending share survived a login round-trip (we wrote it
  // to sessionStorage before sending the user to /login), restore the
  // audit state and reopen the share modal automatically. The query flag
  // ?share=1 is also accepted so a deep link from a notification works.
  useEffect(() => {
    if (authLoading) return;
    let pending: SharePayload | null = null;
    try {
      const raw = sessionStorage.getItem(PENDING_SHARE_KEY);
      if (raw) pending = JSON.parse(raw) as SharePayload;
    } catch {
      pending = null;
    }
    if (!pending) return;

    // Re-hydrate the result panels so the user sees what they're sharing
    // (matches the experience before the login redirect).
    try {
      if (pending.kind === 'website') {
        setAudit(pending.body as DeepAudit);
        setMaps(null);
        setSecurity(null);
        setSecurityPlace(null);
        setMode('website');
      } else if (pending.kind === 'maps') {
        setMaps(pending.body as MapsAuditResponse);
        const inner = (pending.body as MapsAuditResponse).website_audit;
        setAudit(inner ?? null);
        setSecurity(null);
        setSecurityPlace(null);
        setMode('maps');
      } else if (pending.kind === 'security') {
        setSecurity(pending.body as SecurityAuditResponse);
        setSecurityPlace(null);
        setMaps(null);
        setAudit(null);
        setMode('security');
        setSecuritySub('website');
      } else if (pending.kind === 'security_place') {
        const body = pending.body as SecurityAuditPlaceResponse;
        setSecurityPlace(body);
        setSecurity(body.website_security);
        setMaps(null);
        setAudit(null);
        setMode('security');
        setSecuritySub('maps');
      }
    } catch {
      // Defensive: bad payload — clear and bail.
      sessionStorage.removeItem(PENDING_SHARE_KEY);
      return;
    }

    if (isAuthenticated) {
      setSharePayload(pending);
      setShareOpen(true);
      sessionStorage.removeItem(PENDING_SHARE_KEY);
      // Drop the ?share=1 marker so a refresh after dismissing the modal
      // doesn't try to re-open it from stale URL state.
      if (searchParams.has('share')) {
        const next = new URLSearchParams(searchParams);
        next.delete('share');
        setSearchParams(next, { replace: true });
      }
    }
    // We deliberately depend only on auth-loading completion + auth status;
    // setSearchParams/searchParams are stable from the router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated]);

  // Re-confirm access against the backend when the user lands on the Maps
  // tab. This catches the edge case where the cached ``user.plan`` is stale
  // (e.g., the daily expiry sweep already ran on the server).
  useEffect(() => {
    if (mode !== 'maps' || authLoading) return;
    if (!isAuthenticated) {
      setAccessChecked(true);
      setAccessReason(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await getAuditAccess();
        if (cancelled) return;
        if (!data.allowed) setAccessReason(data.reason);
        else setAccessReason(null);
      } catch {
        // Silent — the gate also runs on POST, so a transient access-check
        // failure isn't fatal. The locked preview remains visible if the
        // local plan flag says so.
      } finally {
        if (!cancelled) setAccessChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, isAuthenticated, authLoading, user?.plan, user?.plan_expires_at]);

  // Same dance for the Security tab. We keep two separate access flags so
  // the user can't be "logged in on free, hits security tab, sees old maps
  // upgrade copy" — each tab confirms its own gate.
  useEffect(() => {
    if (mode !== 'security' || authLoading) return;
    if (!isAuthenticated) {
      setSecAccessChecked(true);
      setSecAccessReason(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await getSecurityAuditAccess();
        if (cancelled) return;
        if (!data.allowed) setSecAccessReason(data.reason);
        else setSecAccessReason(null);
      } catch {
        // Silent — server-side gate is authoritative on POST.
      } finally {
        if (!cancelled) setSecAccessChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, isAuthenticated, authLoading, user?.plan, user?.plan_expires_at]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (mode === 'maps' && mapsLocked) {
      setError('Sign in with a Pro or Enterprise plan to run a Google Maps audit.');
      return;
    }
    if (mode === 'security' && securityLocked) {
      setError('Sign in with a Pro or Enterprise plan to run a security audit.');
      return;
    }
    const trimmed = input.trim();
    if (!trimmed) {
      const what =
        mode === 'website'
          ? 'website URL'
          : mode === 'maps'
            ? 'Google Maps URL or business name'
            : securitySub === 'maps'
              ? 'Google Maps URL or business name'
              : 'website URL';
      setError(`Enter a ${what} to audit.`);
      return;
    }
    setError(null);
    setAudit(null);
    setMaps(null);
    setSecurity(null);
    setSecurityPlace(null);
    setLoading(true);
    try {
      if (mode === 'website') {
        const data = await auditWebsite(trimmed);
        setAudit(data);
      } else if (mode === 'maps') {
        const data = await auditPlace(trimmed);
        setMaps(data);
        setAudit(data.website_audit);
      } else if (mode === 'security') {
        if (securitySub === 'maps') {
          const data = await auditSecurityPlace(trimmed);
          setSecurityPlace(data);
          setSecurity(data.website_security);
        } else {
          const data = await auditSecurity(trimmed);
          setSecurity(data);
        }
      }
    } catch (err) {
      type ErrShape = { response?: { data?: { detail?: string } } };
      const e2 = err as ErrShape;
      const message =
        e2?.response?.data?.detail ||
        (err as Error).message ||
        'Something went wrong. Try again.';
      toast.error(message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const allFindings = useMemo(() => {
    if (!audit && !maps) return [] as AuditFinding[];
    const fromMaps = maps?.derived_findings ?? [];
    return fromMaps;
  }, [audit, maps]);

  const onShareClick = () => {
    // Build a fresh SharePayload from whichever result is currently
    // visible. Priority: security_place > maps > security > website.
    // We want the recipient to see the *richer* of the two reports
    // when both are present, and security findings outrank a vanilla
    // SEO audit because that's the more sensitive document.
    let payload: SharePayload | null = null;
    if (securityPlace) {
      const label =
        securityPlace.business?.display_name ||
        securityPlace.business?.website_uri ||
        'Security audit';
      payload = {
        kind: 'security_place',
        title: `Security audit — ${label}`,
        subject_url:
          securityPlace.business?.website_uri ||
          securityPlace.business?.google_maps_uri ||
          null,
        body: securityPlace,
      };
    } else if (maps) {
      const label =
        maps.business?.display_name ||
        maps.business?.website_uri ||
        'Google Maps audit';
      payload = {
        kind: 'maps',
        title: `Audit — ${label}`,
        subject_url: maps.business?.website_uri || maps.business?.google_maps_uri || null,
        body: maps,
      };
    } else if (security) {
      const host = (security.final_url || security.normalized_url || '').replace(
        /^https?:\/\//,
        '',
      );
      payload = {
        kind: 'security',
        title: `Security audit — ${host || 'website'}`,
        subject_url: security.final_url || security.normalized_url || null,
        body: security,
      };
    } else if (audit) {
      const host = (audit.final_url || audit.normalized_url || '').replace(/^https?:\/\//, '');
      payload = {
        kind: 'website',
        title: `Audit — ${host || 'website'}`,
        subject_url: audit.final_url || audit.normalized_url || null,
        body: audit,
      };
    }
    if (!payload) {
      toast.error('Run an audit first, then share the result.');
      return;
    }
    setSharePayload(payload);
    setShareOpen(true);
  };

  // Has any result been computed in the current session?
  const hasAnyResult = Boolean(audit || maps || security || securityPlace);

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
            <Award className="w-3.5 h-3.5" /> Comprehensive audit
          </span>
          <h1 className="mt-5 text-3xl sm:text-5xl font-bold tracking-tight text-gradient">
            Full SEO, AEO &amp; Google Maps audit
          </h1>
          <p className="mt-3 text-sm sm:text-base text-secondary max-w-2xl mx-auto leading-relaxed">
            One scan, ten categories, every blocker that's holding the business back — with a
            prioritized fix list. Website audit is free; the deep Google Maps audit is a Pro feature.
          </p>
        </motion.div>

        {/* Mode tabs */}
        <div className="flex items-center justify-center gap-1 mb-3 p-1 rounded-xl border border-white/[0.08] bg-surface-2/60 max-w-xl mx-auto">
          {MODE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setMode(t.id);
                setError(null);
              }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold uppercase tracking-[0.12em] transition-colors flex items-center justify-center gap-1.5 ${
                mode === t.id
                  ? 'bg-white text-black'
                  : 'text-secondary hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              {t.label}
              {((t.id === 'maps' && mapsLocked) || (t.id === 'security' && securityLocked)) && (
                <Lock className="w-3 h-3" />
              )}
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-tertiary max-w-xl mx-auto mb-6">{activeMode.help}</p>

        {/* Security sub-mode toggle — only visible inside the Security tab */}
        {mode === 'security' && !securityLocked && (
          <div className="flex items-center justify-center gap-1 mb-4 p-1 rounded-xl border border-white/[0.08] bg-surface-2/60 max-w-sm mx-auto">
            {(['website', 'maps'] as SecuritySubMode[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSecuritySub(id);
                  setError(null);
                }}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold uppercase tracking-[0.12em] whitespace-nowrap transition-colors flex items-center justify-center gap-1.5 ${
                  securitySub === id
                    ? 'bg-white text-black'
                    : 'text-secondary hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {id === 'website' ? (
                  <Globe2 className="w-3 h-3" />
                ) : (
                  <MapPin className="w-3 h-3" />
                )}
                {id === 'website' ? 'Website URL' : 'Google Maps'}
              </button>
            ))}
          </div>
        )}

        {/* Locked previews — shown instead of the input when gated */}
        {mode === 'maps' && mapsLocked ? (
          <LockedMapsPreview
            isAuthenticated={isAuthenticated}
            plan={user?.plan ?? null}
            reason={accessChecked ? accessReason : null}
          />
        ) : mode === 'security' && securityLocked ? (
          <LockedSecurityPreview
            isAuthenticated={isAuthenticated}
            plan={user?.plan ?? null}
            reason={secAccessChecked ? secAccessReason : null}
          />
        ) : (
          <motion.form
            onSubmit={onSubmit}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="relative flex flex-col sm:flex-row gap-2 sm:gap-3 p-2 rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md shadow-[0_24px_64px_rgba(0,0,0,0.45)]"
          >
            <div className="flex items-center gap-2 px-3 flex-1 min-w-0">
              {mode === 'website' ||
              (mode === 'security' && securitySub === 'website') ? (
                <Globe2 className="w-4 h-4 text-tertiary flex-shrink-0" />
              ) : (
                <MapPin className="w-4 h-4 text-tertiary flex-shrink-0" />
              )}
              <input
                type="text"
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                placeholder={
                  mode === 'security'
                    ? securitySub === 'website'
                      ? 'example.com'
                      : 'https://maps.app.goo.gl/... or "Acme Cafe, Bengaluru"'
                    : activeMode.placeholder
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
                className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-tertiary py-3 disabled:opacity-60"
                aria-label={
                  mode === 'website' ||
                  (mode === 'security' && securitySub === 'website')
                    ? 'Website URL'
                    : 'Google Maps URL or business name'
                }
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
        )}

        {error && !loading && <p className="mt-3 text-xs text-red-300/90 text-center">{error}</p>}

        {/* Share button — surfaced once any result is available */}
        {!loading && hasAnyResult && (
          <div className="mt-5 flex items-center justify-center">
            <button
              type="button"
              onClick={onShareClick}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-sm font-semibold text-white transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share this report
            </button>
          </div>
        )}

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
              className="mt-10"
            >
              <MapsAuditView maps={maps} />
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
              <WebsiteAuditView audit={audit} extraFindings={allFindings} />

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
                Audits are performed live. Sharing a report captures a snapshot — recipients sign
                in to view, so you always know who's reading it.
              </p>
            </motion.div>
          )}

          {/* Security audit results */}
          {!loading && (security || securityPlace) && (
            <motion.div
              key="security-result"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-10 space-y-6"
            >
              {/* When we ran security_place, render the business header from
                  the Maps response above the security panels so the user
                  knows which listing they audited. */}
              {securityPlace && (
                <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-5">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 text-white">
                      <MapPin className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary">
                        Audited from Maps listing
                      </div>
                      <div className="mt-1 text-base font-semibold truncate">
                        {securityPlace.business.display_name ?? 'Unnamed listing'}
                      </div>
                      {securityPlace.business.formatted_address && (
                        <p className="text-xs text-secondary truncate">
                          {securityPlace.business.formatted_address}
                        </p>
                      )}
                      {securityPlace.business.website_uri ? (
                        <p className="mt-2 text-xs text-tertiary truncate font-mono">
                          {securityPlace.business.website_uri}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-red-300">
                          This listing has no website on its Google Business Profile — there's
                          nothing for the security scanner to audit. Ask the owner to add one.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {security && <SecurityAuditView audit={security} />}

              <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 p-6 text-center">
                <p className="text-sm text-secondary mb-4">
                  This is a snapshot of public-facing security signals — same surface a hostile
                  visitor sees. For a full pentest of authenticated routes and business logic,
                  engage a qualified security consultant.
                </p>
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black text-sm font-semibold shadow-lg hover:bg-[#E5E5E5] transition-colors"
                >
                  See Cold Scout plans <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </motion.div>
          )}

          {/* Empty / hint state */}
          {!loading && !audit && !maps && !error && mode === 'website' && (
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
                title="Google Maps intel (Pro)"
                copy="Rating, review velocity, photos, hours, status, attributes, accessibility, parking, payments — and a prioritized growth plan."
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <ShareReportModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        payload={sharePayload}
      />

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

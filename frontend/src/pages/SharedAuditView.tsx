/**
 * Shared audit-report viewer (/shared/audit/:token).
 *
 * Renders an audit snapshot someone has shared. The viewer **must** be
 * signed in — that auth gate is what makes the share-flow a signup
 * funnel.
 *
 *   - Unauthenticated → redirect to /login?next=/shared/audit/:token,
 *     with a CTA below the form to /signup if they're new. After login
 *     they bounce back here and the report loads.
 *   - 404 → token unknown / mistyped / link copied wrong.
 *   - 410 → expired or revoked.
 *   - Any other error → generic "couldn't load" with a retry.
 *
 * The recipient sees exactly the same panels the owner saw at share
 * time. Re-running the audit would be wrong: a "shared report from
 * 3 weeks ago" should not silently become a different audit today.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Loader2, ShieldAlert, Sparkles } from 'lucide-react';

import { useAuth } from '../hooks/useAuth';
import { useSEO } from '../hooks/useSEO';
import {
  getSharedAudit,
  type SharedAuditView,
  type DeepAudit,
  type MapsAuditResponse,
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

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; data: SharedAuditView }
  | { kind: 'gone'; detail: string }
  | { kind: 'missing' }
  | { kind: 'error'; detail: string };

export default function SharedAuditViewPage() {
  const { token = '' } = useParams<{ token: string }>();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  // /shared/audit/<token> is private. We never want crawlers to index a
  // shared snapshot — both because the data is third-party owned and
  // because the page only ever renders behind auth anyway.
  useSEO({
    title: 'Shared audit report — Cold Scout',
    description: 'A Cold Scout audit report shared privately with you. Sign in to view.',
    canonical: `https://coldscout.colddsam.com/shared/audit/${token}`,
    index: false,
  });

  // Bounce anonymous viewers through /login first. We preserve the deep
  // link via ?next=… so they land back here automatically. The auth
  // loading flag stops a double-bounce while Supabase rehydrates.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      const next = encodeURIComponent(`/shared/audit/${token}`);
      navigate(`/login?next=${next}`, { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate, token]);

  // Fetch once we're authenticated. If auth flips back to false (logout
  // mid-view), let the effect above re-bounce.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      if (!token) {
        if (!cancelled) setState({ kind: 'missing' });
        return;
      }
      setState({ kind: 'loading' });
      try {
        const data = await getSharedAudit(token);
        if (cancelled) return;
        setState({ kind: 'ok', data });
      } catch (err: unknown) {
        if (cancelled) return;
        type ErrShape = { response?: { status?: number; data?: { detail?: string } } };
        const e = err as ErrShape;
        const status = e?.response?.status;
        const detail = e?.response?.data?.detail || 'Could not load this shared report.';
        if (status === 404) setState({ kind: 'missing' });
        else if (status === 410) setState({ kind: 'gone', detail });
        else setState({ kind: 'error', detail });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, token]);

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <PublicNavbar />

      <div className="pointer-events-none absolute inset-0 -z-0 opacity-[0.18] noise-overlay" />
      <div className="pointer-events-none absolute top-[-20%] right-[-10%] w-[40rem] h-[40rem] rounded-full bg-gradient-to-br from-white/[0.04] to-transparent blur-3xl" />

      <main className="relative z-10 max-w-5xl mx-auto px-5 sm:px-6 pt-28 sm:pt-32 pb-24">
        {(state.kind === 'loading' || authLoading || !isAuthenticated) && (
          <LoadingPanel />
        )}

        {state.kind === 'missing' && <NotFoundPanel />}

        {state.kind === 'gone' && <ExpiredPanel detail={state.detail} />}

        {state.kind === 'error' && <ErrorPanel detail={state.detail} />}

        {state.kind === 'ok' && <ReportPanel data={state.data} />}
      </main>

      <PublicFooter />
    </div>
  );
}

/* ════════════════════ Sub-panels ════════════════════ */

function LoadingPanel() {
  return (
    <div className="flex flex-col items-center justify-center py-32">
      <Loader2 className="w-7 h-7 animate-spin text-white/60" />
      <p className="mt-4 text-sm text-tertiary">Loading shared report…</p>
    </div>
  );
}

function NotFoundPanel() {
  return (
    <div className="text-center py-20">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/10 mb-4">
        <AlertTriangle className="w-5 h-5 text-white/80" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">This shared report doesn't exist</h1>
      <p className="mt-3 text-sm text-secondary max-w-md mx-auto leading-relaxed">
        The link you opened doesn't match any active share. Double-check the URL — links
        can sometimes get cut off when forwarded over chat. Ask the sender for a fresh
        link if needed.
      </p>
      <div className="mt-6">
        <Link
          to="/scanner"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-[#E5E5E5] transition-colors"
        >
          Run your own audit instead <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

function ExpiredPanel({ detail }: { detail: string }) {
  return (
    <div className="text-center py-20">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-400/30 mb-4">
        <ShieldAlert className="w-5 h-5 text-amber-200" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">This shared report is no longer available</h1>
      <p className="mt-3 text-sm text-secondary max-w-md mx-auto leading-relaxed">{detail}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/scanner"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-[#E5E5E5] transition-colors"
        >
          Run an audit yourself <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        <Link
          to="/pricing"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 bg-white/[0.04] text-sm font-semibold text-white hover:bg-white/[0.08] transition-colors"
        >
          See pricing
        </Link>
      </div>
    </div>
  );
}

function ErrorPanel({ detail }: { detail: string }) {
  return (
    <div className="text-center py-20">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-red-500/10 border border-red-400/30 mb-4">
        <AlertTriangle className="w-5 h-5 text-red-200" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Couldn't load this report</h1>
      <p className="mt-3 text-sm text-secondary max-w-md mx-auto leading-relaxed">{detail}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-[#E5E5E5] transition-colors"
      >
        Try again
      </button>
    </div>
  );
}

function ReportPanel({ data }: { data: SharedAuditView }) {
  const owner = data.owner_display_name || 'A Cold Scout user';
  const created = new Date(data.created_at);
  const expires = new Date(data.expires_at);

  // Discriminate the payload by ``kind``. The server already shaped it
  // correctly; these casts are just narrowing for the type system.
  const isMaps = data.kind === 'maps';
  const isSecurity = data.kind === 'security';
  const isSecurityPlace = data.kind === 'security_place';

  const maps = isMaps ? (data.payload as MapsAuditResponse) : null;
  const securityPlace = isSecurityPlace
    ? (data.payload as SecurityAuditPlaceResponse)
    : null;
  const security: SecurityAuditResponse | null = isSecurity
    ? (data.payload as SecurityAuditResponse)
    : securityPlace?.website_security ?? null;
  const websiteAudit: DeepAudit | null = isMaps
    ? maps?.website_audit ?? null
    : isSecurity || isSecurityPlace
      ? null
      : (data.payload as DeepAudit);
  const derivedFindings = maps?.derived_findings ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header card */}
      <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-5 sm:p-6">
        <div className="flex items-start gap-4">
          {data.owner_avatar_url ? (
            <img
              src={data.owner_avatar_url}
              alt={owner}
              className="w-12 h-12 rounded-full object-cover border border-white/10"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-sm font-semibold">
              {(owner[0] || 'C').toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary">Shared with you</div>
            <h1 className="mt-1 text-lg sm:text-xl font-semibold text-white truncate">{data.title}</h1>
            <p className="mt-1 text-xs text-secondary">
              by <span className="text-white font-medium">{owner}</span>
              {data.is_owner ? ' · this is your share' : ''} ·{' '}
              {created.toLocaleDateString(undefined, { dateStyle: 'medium' })}
            </p>
            {data.subject_url && (
              <p className="mt-1 text-xs text-tertiary break-all">{data.subject_url}</p>
            )}
            {data.message && (
              <div className="mt-3 rounded-lg border border-white/[0.06] bg-surface-1/60 p-3 text-sm text-white/85 whitespace-pre-wrap leading-relaxed">
                {data.message}
              </div>
            )}
            <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.04] text-[10px] text-tertiary uppercase tracking-[0.18em]">
              <Sparkles className="w-3 h-3" />
              Snapshot — link expires {expires.toLocaleDateString(undefined, { dateStyle: 'medium' })}
            </div>
          </div>
        </div>
      </div>

      {maps && <MapsAuditView maps={maps} />}
      {websiteAudit && (
        <WebsiteAuditView audit={websiteAudit} extraFindings={derivedFindings} />
      )}
      {securityPlace && (
        <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md p-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary mb-1">
            Audited from Maps listing
          </div>
          <div className="text-base font-semibold">
            {securityPlace.business.display_name ?? 'Unnamed listing'}
          </div>
          {securityPlace.business.formatted_address && (
            <p className="text-xs text-secondary mt-0.5">
              {securityPlace.business.formatted_address}
            </p>
          )}
          {securityPlace.business.website_uri ? (
            <p className="mt-2 text-xs text-tertiary font-mono break-all">
              {securityPlace.business.website_uri}
            </p>
          ) : (
            <p className="mt-2 text-xs text-red-300">
              This listing has no website on its Google Business Profile, so the security audit
              had no target to scan.
            </p>
          )}
        </div>
      )}
      {security && <SecurityAuditView audit={security} />}

      {/* Run your own audit CTA */}
      <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 p-6 text-center">
        <p className="text-sm text-secondary mb-4">
          Want to run audits like this on your own websites or competitors? It's free —
          you can scan unlimited websites on the Cold Scout scanner page.
        </p>
        <Link
          to="/scanner"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black text-sm font-semibold shadow-lg hover:bg-[#E5E5E5] transition-colors"
        >
          Run your own audit <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </motion.div>
  );
}

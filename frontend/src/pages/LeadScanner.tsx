/**
 * Public Lead Scanner — lead-magnet page at /scanner.
 *
 * A visitor pastes a website URL; the backend's qualification helpers
 * run live and return a small "Digital Presence Scorecard". The first
 * two flaws are visible; the rest are blurred behind a CTA that points
 * at the existing /signup flow.
 *
 * Production-safety notes
 * -----------------------
 * - This page calls a *public* endpoint (no auth, no API key). The
 *   request shape is the only thing the user controls; the response
 *   schema is validated by Pydantic on the backend before reaching us.
 * - The endpoint is rate-limited server-side (10/min/IP). On a 429 we
 *   show a friendly toast rather than retrying — automatic retries
 *   would just burn through the limit faster.
 * - We do NOT persist anything client-side. The visitor's URL stays in
 *   component state and is gone on navigation. Email capture for the
 *   "Unlock Full Audit" CTA is handled by the existing /signup flow,
 *   not by this page.
 */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Globe2,
  Lock,
  ShieldAlert,
  Sparkles,
  Loader2,
  Search,
  XCircle,
  Info,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { useSEO } from '../hooks/useSEO';
import {
  scanWebsite,
  type ScanResult,
  type ScanFlaw,
  type ScanFlawSeverity,
} from '../lib/api';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';

const SEVERITY_STYLES: Record<ScanFlawSeverity, { ring: string; pill: string; icon: React.ReactNode }> = {
  critical: {
    ring: 'border-red-400/30',
    pill: 'bg-red-500/15 text-red-200 border-red-400/30',
    icon: <ShieldAlert className="w-4 h-4" />,
  },
  warning: {
    ring: 'border-yellow-400/25',
    pill: 'bg-yellow-500/10 text-yellow-200 border-yellow-400/25',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  info: {
    ring: 'border-white/15',
    pill: 'bg-white/[0.06] text-white/85 border-white/15',
    icon: <Info className="w-4 h-4" />,
  },
};

function FlawCard({ flaw, locked = false }: { flaw: ScanFlaw; locked?: boolean }) {
  const style = SEVERITY_STYLES[flaw.severity] ?? SEVERITY_STYLES.info;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`relative rounded-xl border ${style.ring} bg-surface-2/70 backdrop-blur p-4`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex items-center justify-center rounded-md border px-1.5 py-1 ${style.pill}`}
        >
          {style.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={`text-sm font-semibold ${locked ? 'select-none blur-sm' : 'text-white'}`}>
            {flaw.title}
          </h3>
          <p
            className={`text-xs mt-1 leading-relaxed ${
              locked ? 'select-none blur-sm text-white/70' : 'text-secondary'
            }`}
          >
            {flaw.detail}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function ScoreRing({ score }: { score: number }) {
  // Single SVG ring — keeps the page lightweight (no chart lib).
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;
  const tone =
    score >= 75 ? 'text-emerald-300' : score >= 50 ? 'text-yellow-200' : 'text-red-300';
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden>
        <circle
          cx="70"
          cy="70"
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="10"
          fill="none"
        />
        <motion.circle
          cx="70"
          cy="70"
          r={radius}
          stroke="currentColor"
          className={tone}
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          animate={{ strokeDashoffset: circumference - dash }}
          transition={{ duration: 0.9, ease: [0.25, 0.1, 0.25, 1] }}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '70px 70px' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-3xl font-bold tracking-tight text-white">{score}</div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary mt-0.5">Score</div>
      </div>
    </div>
  );
}

export default function LeadScanner() {
  useSEO({
    title: 'Free Website Audit — Cold Scout Scanner',
    description:
      'Paste any business website URL and get an instant Digital Presence Scorecard — no signup required. Find SSL gaps, mobile issues, missing socials and more.',
    index: true,
  });

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visibleFlaws = useMemo(() => result?.flaws.slice(0, 2) ?? [], [result]);
  const lockedFlaws = useMemo(() => result?.flaws.slice(2) ?? [], [result]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const trimmed = input.trim();
    if (!trimmed) {
      setError('Enter a website URL to audit.');
      return;
    }
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const data = await scanWebsite(trimmed);
      setResult(data);
    } catch (err) {
      const message = (err as Error).message || 'Something went wrong. Try again.';
      // 429 surfaces here too — the user-friendly message comes from the
      // backend's slowapi handler; we just relay it through toast so the
      // input stays focused on the next attempt.
      toast.error(message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <PublicNavbar />

      {/* Background ornament */}
      <div className="pointer-events-none absolute inset-0 -z-0 opacity-[0.18] noise-overlay" />
      <div className="pointer-events-none absolute top-[-20%] right-[-10%] w-[40rem] h-[40rem] rounded-full bg-gradient-to-br from-white/[0.04] to-transparent blur-3xl" />

      <main className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 pt-32 sm:pt-36 pb-24 px-safe">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center mb-10"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-[0.18em] uppercase bg-white/[0.06] border border-white/10 text-secondary">
            <Sparkles className="w-3.5 h-3.5" />
            Free audit
          </span>
          <h1 className="mt-5 text-3xl sm:text-5xl font-bold tracking-tight text-gradient">
            Digital Presence Scorecard
          </h1>
          <p className="mt-3 text-sm sm:text-base text-secondary max-w-xl mx-auto leading-relaxed">
            Paste any business website. We'll instantly check SSL, mobile-friendliness,
            social-proof links, and a few other signals freelancers care about — no signup needed
            for the basics.
          </p>
        </motion.div>

        <motion.form
          onSubmit={onSubmit}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="relative flex flex-col sm:flex-row gap-2 sm:gap-3 p-2 rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md shadow-[0_24px_64px_rgba(0,0,0,0.45)]"
        >
          <div className="flex items-center gap-2 px-3 flex-1 min-w-0">
            <Globe2 className="w-4 h-4 text-tertiary flex-shrink-0" />
            <input
              type="text"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              placeholder="example.com"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-tertiary py-3 disabled:opacity-60"
              aria-label="Website URL"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-black text-sm font-semibold shadow-[0_4px_16px_rgba(255,255,255,0.08)] disabled:opacity-50 disabled:pointer-events-none transition-colors hover:bg-[#E5E5E5]"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            {loading ? 'Scanning…' : 'Scan website'}
          </button>
        </motion.form>

        {error && !loading && (
          <p className="mt-3 text-xs text-red-300/90 text-center">{error}</p>
        )}

        {/* ── Result ───────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3"
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-xl border border-white/[0.06] bg-surface-2/40 shimmer-bg"
                />
              ))}
            </motion.div>
          )}

          {result && !loading && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-10 space-y-6"
            >
              {/* Score header */}
              <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-4 sm:gap-6 p-5 rounded-2xl border border-white/[0.08] bg-surface-2/60 backdrop-blur-md">
                <ScoreRing score={result.score} />
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-tertiary">
                    Audited
                  </div>
                  <div className="mt-1 text-base font-semibold truncate">
                    {result.normalized_url}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 justify-center sm:justify-start">
                    <Pill
                      ok={result.is_dns_valid}
                      label={result.is_dns_valid ? 'DNS resolves' : 'DNS unreachable'}
                    />
                    <Pill
                      ok={result.is_http_valid}
                      label={result.is_http_valid ? 'Site responds' : 'Site offline'}
                    />
                    <Pill
                      ok={result.has_ssl}
                      label={result.has_ssl ? 'HTTPS' : 'No HTTPS'}
                      icon={<Lock className="w-3 h-3" />}
                    />
                    <Pill
                      ok={result.is_mobile_friendly}
                      label={result.is_mobile_friendly ? 'Mobile-friendly' : 'Not mobile-friendly'}
                    />
                    <Pill
                      ok={result.has_socials}
                      label={result.has_socials ? 'Socials linked' : 'No socials'}
                    />
                  </div>
                </div>
              </div>

              {/* Flaws (free preview) */}
              {result.flaws.length === 0 ? (
                <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-400/25 bg-emerald-500/10">
                  <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                  <div className="text-sm text-emerald-100">
                    Looking good — we didn't catch any obvious flaws on this site.
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleFlaws.map((flaw) => (
                    <FlawCard key={flaw.code} flaw={flaw} />
                  ))}

                  {lockedFlaws.length > 0 && (
                    <div className="relative">
                      {/* Blurred locked cards */}
                      <div className="space-y-3 select-none">
                        {lockedFlaws.map((flaw) => (
                          <FlawCard key={flaw.code} flaw={flaw} locked />
                        ))}
                      </div>
                      {/* Overlay CTA — sits over the blur */}
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-black/0 via-black/40 to-black/85 flex items-end justify-center p-4">
                        <Link
                          to="/signup"
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black text-sm font-semibold shadow-lg hover:bg-[#E5E5E5] transition-colors"
                        >
                          Unlock the full audit
                          <Sparkles className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <p className="text-[11px] text-tertiary text-center pt-2">
                Audits are performed live and not stored. Cold Scout never contacts the audited
                business on your behalf without explicit setup.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <PublicFooter />
    </div>
  );
}

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

/**
 * Share Report modal.
 *
 * Shown from the /scanner page after the user has run either a website
 * audit or a Google Maps audit and clicks "Share report". Lets them:
 *
 *   1. Email a list of recipients an invitation link.
 *   2. Copy the shareable URL to the clipboard.
 *   3. Re-share the same payload to additional recipients later (the
 *      backend creates one row per share — calling the endpoint twice
 *      with the same payload is fine and tracked separately).
 *
 * If the user is NOT signed in, the modal renders a sign-in CTA instead
 * of the form. The audit payload + the user's intent to share is
 * persisted to ``sessionStorage`` (key ``cs:pending-share``) so when
 * they return after login we can re-open the modal pre-populated.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  ClipboardCopy,
  Loader2,
  LogIn,
  Mail,
  Share2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import Modal from '../ui/Modal';
import { useAuth } from '../../hooks/useAuth';
import {
  createSharedAudit,
  type SharedAuditKind,
  type CreateSharedAuditResponse,
  type DeepAudit,
  type MapsAuditResponse,
  type SecurityAuditResponse,
  type SecurityAuditPlaceResponse,
} from '../../lib/api';

export interface SharePayload {
  kind: SharedAuditKind;
  title: string;
  subject_url?: string | null;
  body:
    | DeepAudit
    | MapsAuditResponse
    | SecurityAuditResponse
    | SecurityAuditPlaceResponse;
}

interface ShareReportModalProps {
  open: boolean;
  onClose: () => void;
  payload: SharePayload | null;
}

// sessionStorage key used to resume a pending share after sign-in. We
// intentionally use sessionStorage (not localStorage) so the pending
// share dies with the tab — leaking an audit snapshot to a future user
// on the same device would be embarrassing.
export const PENDING_SHARE_KEY = 'cs:pending-share';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export default function ShareReportModal({
  open,
  onClose,
  payload,
}: ShareReportModalProps) {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const [emailInput, setEmailInput] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateSharedAuditResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset internal state every time the modal opens with a fresh payload.
  useEffect(() => {
    if (!open) return;
    setEmailInput('');
    setRecipients([]);
    setMessage('');
    setResult(null);
    setCopied(false);
    // Tiny delay so the modal's enter animation doesn't fight focus.
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [open, payload?.title]);

  const titleSummary = useMemo(() => {
    if (!payload) return '';
    return payload.title.length > 70 ? `${payload.title.slice(0, 70)}…` : payload.title;
  }, [payload]);

  const addRecipientFromInput = () => {
    const next = emailInput.trim().toLowerCase();
    if (!next) return;
    if (!isValidEmail(next)) {
      toast.error('That email address doesn’t look valid.');
      return;
    }
    if (recipients.includes(next)) {
      setEmailInput('');
      return;
    }
    if (recipients.length >= 10) {
      toast.error('You can add up to 10 recipients per share.');
      return;
    }
    setRecipients((prev) => [...prev, next]);
    setEmailInput('');
  };

  const removeRecipient = (email: string) => {
    setRecipients((prev) => prev.filter((e) => e !== email));
  };

  const goSignIn = () => {
    if (!payload) {
      navigate('/login');
      return;
    }
    // Persist the audit snapshot so we can re-open this modal after the
    // round-trip through login + Supabase callback.
    try {
      sessionStorage.setItem(PENDING_SHARE_KEY, JSON.stringify(payload));
    } catch {
      // Storage full / disabled — the user just loses the pending state.
    }
    const next = encodeURIComponent('/scanner?share=1');
    navigate(`/login?next=${next}`);
  };

  const submit = async () => {
    if (!payload || submitting) return;

    // Treat a half-typed email in the input box as if the user pressed
    // Enter — otherwise they'll click Send and nothing happens, which is
    // a maddening UX failure.
    let finalRecipients = recipients;
    if (emailInput.trim()) {
      const candidate = emailInput.trim().toLowerCase();
      if (!isValidEmail(candidate)) {
        toast.error('That email address doesn’t look valid.');
        return;
      }
      if (!finalRecipients.includes(candidate)) {
        finalRecipients = [...finalRecipients, candidate];
        setRecipients(finalRecipients);
        setEmailInput('');
      }
    }

    setSubmitting(true);
    try {
      const data = await createSharedAudit({
        kind: payload.kind,
        title: payload.title,
        subject_url: payload.subject_url ?? null,
        message: message.trim() || null,
        recipients: finalRecipients,
        payload: payload.body as unknown as Record<string, unknown>,
      });
      setResult(data);
      if (finalRecipients.length === 0) {
        toast.success('Share link ready — copy it from the modal.');
      } else if (data.failed.length === 0) {
        toast.success(
          `Sent to ${data.delivered} recipient${data.delivered === 1 ? '' : 's'}.`,
        );
      } else {
        toast.error(
          `Sent to ${data.delivered}, but ${data.failed.length} failed. Check the modal for details.`,
        );
      }
    } catch (err: unknown) {
      type ErrorWithDetail = { response?: { data?: { detail?: string }; status?: number } };
      const e = err as ErrorWithDetail;
      const detail =
        e?.response?.data?.detail ||
        (err as Error)?.message ||
        'Something went wrong while creating the share.';
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async () => {
    if (!result?.url) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      toast.success('Link copied to clipboard.');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not access the clipboard. Long-press the link to copy.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.06] border border-white/10 text-white">
              <Share2 className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">Share this audit</h2>
              <p className="text-[11px] text-tertiary mt-0.5 line-clamp-1">
                {titleSummary || 'Snapshot the report and send it to anyone.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="row-action -mr-1"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {!isAuthenticated ? (
          <AuthGate onSignIn={goSignIn} />
        ) : result ? (
          <SuccessPanel
            result={result}
            onCopy={copyLink}
            copied={copied}
            onAgain={() => setResult(null)}
            ownerEmail={user?.email}
          />
        ) : (
          <>
            {/* Recipients block */}
            <div>
              <label
                htmlFor="share-recipients"
                className="text-[10px] uppercase tracking-[0.18em] text-tertiary"
              >
                Email recipients (optional)
              </label>
              <div className="mt-1.5 flex items-center gap-2 px-3 py-2 rounded-xl border border-white/[0.08] bg-surface-1/60 focus-within:border-white/20">
                <Mail className="w-4 h-4 text-tertiary flex-shrink-0" />
                <input
                  id="share-recipients"
                  ref={inputRef}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="name@business.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                      e.preventDefault();
                      addRecipientFromInput();
                    } else if (e.key === 'Backspace' && !emailInput && recipients.length) {
                      removeRecipient(recipients[recipients.length - 1]);
                    }
                  }}
                  onBlur={addRecipientFromInput}
                  className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-tertiary"
                  aria-label="Recipient email"
                />
                <button
                  type="button"
                  onClick={addRecipientFromInput}
                  disabled={!emailInput.trim()}
                  className="text-[11px] uppercase tracking-[0.15em] text-white/70 hover:text-white disabled:opacity-40"
                >
                  Add
                </button>
              </div>
              {recipients.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <AnimatePresence initial={false}>
                    {recipients.map((email) => (
                      <motion.span
                        key={email}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.15 }}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.04] text-[11px] text-white"
                      >
                        {email}
                        <button
                          type="button"
                          onClick={() => removeRecipient(email)}
                          className="text-tertiary hover:text-white"
                          aria-label={`Remove ${email}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
              )}
              <p className="mt-2 text-[11px] text-tertiary leading-relaxed">
                We'll email each recipient an invitation with a private link. Up to 10
                addresses per share. Leave blank if you only want a copy-link.
              </p>
            </div>

            {/* Message block */}
            <div>
              <label
                htmlFor="share-message"
                className="text-[10px] uppercase tracking-[0.18em] text-tertiary"
              >
                Message (optional)
              </label>
              <textarea
                id="share-message"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 500))}
                placeholder="Hi! Here's the audit we just ran — happy to walk you through the high-impact items."
                rows={3}
                className="mt-1.5 w-full px-3 py-2 rounded-xl border border-white/[0.08] bg-surface-1/60 text-sm text-white placeholder:text-tertiary outline-none focus:border-white/20 resize-none"
              />
              <div className="mt-1 text-right text-[10px] text-tertiary">
                {message.length}/500
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-surface-1/60 p-3 flex items-start gap-2.5">
              <Sparkles className="w-3.5 h-3.5 text-white/70 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-secondary leading-relaxed">
                Recipients will need to sign in or create a free Cold Scout account to
                view the report. Links stay live for 30 days. You can revoke any share
                later from <Link to="/profile" className="text-white underline">your profile</Link>.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 rounded-lg text-sm text-secondary hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || !payload}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-50 hover:bg-[#E5E5E5] transition-colors"
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Share2 className="w-3.5 h-3.5" />
                )}
                {submitting
                  ? 'Creating link…'
                  : recipients.length === 0 && !emailInput.trim()
                    ? 'Create link'
                    : 'Send + create link'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ───────────────── sub-panels ───────────────── */

function AuthGate({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/[0.08] bg-surface-1/60 p-4 text-sm text-white/85 leading-relaxed">
        Sharing audit reports is a Cold Scout member feature. Sign in or create a free
        account to send this report to anyone with one click — your link stays private
        and recipients view inside a real Cold Scout login.
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={onSignIn}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:bg-[#E5E5E5] transition-colors"
        >
          <LogIn className="w-3.5 h-3.5" />
          Sign in to share
        </button>
      </div>
      <p className="text-[11px] text-tertiary text-center">
        Don't have an account?{' '}
        <Link to="/signup" className="text-white underline">
          Create one in 30 seconds
        </Link>{' '}
        — it's free.
      </p>
    </div>
  );
}

function SuccessPanel({
  result,
  onCopy,
  copied,
  onAgain,
  ownerEmail,
}: {
  result: CreateSharedAuditResponse;
  onCopy: () => void;
  copied: boolean;
  onAgain: () => void;
  ownerEmail?: string;
}) {
  const expires = new Date(result.expires_at);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-4">
        <div className="flex items-start gap-2.5">
          <Check className="w-4 h-4 text-emerald-300 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-emerald-50 leading-relaxed">
            Share is live.{' '}
            {result.delivered > 0
              ? `Sent to ${result.delivered} recipient${result.delivered === 1 ? '' : 's'}. `
              : ''}
            Anyone with the link will need to sign in to view, so we know who's reading
            your report.
          </div>
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-[0.18em] text-tertiary">
          Shareable link
        </label>
        <div className="mt-1.5 flex items-center gap-2 px-3 py-2 rounded-xl border border-white/[0.08] bg-surface-1/60">
          <input
            type="text"
            value={result.url}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 bg-transparent outline-none text-xs text-white font-mono truncate"
            aria-label="Shareable link"
          />
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/15 bg-white/[0.04] text-[11px] text-white hover:bg-white/[0.08]"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-300" />
            ) : (
              <ClipboardCopy className="w-3.5 h-3.5" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-tertiary">
          Expires {expires.toLocaleDateString(undefined, { dateStyle: 'medium' })} · 30
          days from now.
        </p>
      </div>

      {result.failed.length > 0 && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3">
          <div className="flex items-start gap-2.5">
            <Trash2 className="w-3.5 h-3.5 text-red-300 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-red-100 leading-relaxed">
              We couldn't deliver to: <span className="font-mono">{result.failed.join(', ')}</span>.
              The link itself is still valid — copy it and forward manually if needed.
              {ownerEmail ? (
                <>
                  {' '}
                  Replies go to <span className="font-mono">{ownerEmail}</span>.
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onAgain}
          className="px-3 py-2 rounded-lg text-sm text-secondary hover:text-white"
        >
          Share again
        </button>
      </div>
    </div>
  );
}

/**
 * In-call CRM sidebar (host only).
 *
 * Rendered inside <LiveKitRoom>. Shows the linked lead's score, website-audit
 * signals, and previous outreach history, plus a notes field that autosaves
 * (debounced) to the lead's profile in real time. Provides the "End meeting"
 * action which marks the room complete (applying the 5-minute "Interviewed"
 * rule) and disconnects.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoomContext } from '@livekit/components-react';
import {
  Loader2, Star, Globe, Phone, Mail, CheckCircle2, XCircle,
  Save, PhoneOff, ExternalLink, FileText,
} from 'lucide-react';
import { getMeetingCrm, saveMeetingNotes, endMeeting } from '../../lib/api';
import { format } from 'date-fns';

interface Props {
  roomId: string;
  primaryColor: string;
}

function Signal({ label, value }: { label: string; value: boolean | null | undefined }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="text-white/60">{label}</span>
      {value ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-success" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-danger" />
      )}
    </div>
  );
}

export default function CrmSidebar({ roomId, primaryColor }: Props) {
  const room = useRoomContext();
  const { data: crm, isLoading } = useQuery({
    queryKey: ['meeting-crm', roomId],
    queryFn: () => getMeetingCrm(roomId),
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  // The editor is seeded from the loaded CRM notes (host's saved notes, or the
  // lead's existing notes) WITHOUT an effect: until the host edits, we render
  // the server value directly; once they type, ``draft`` takes over. This keeps
  // setState out of effects (react-hooks/set-state-in-effect) and avoids
  // clobbering existing lead notes when the host never types.
  const [draft, setDraft] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [ending, setEnding] = useState(false);
  const dirtyRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesRef = useRef('');

  const notesValue = draft !== null ? draft : (crm?.notes ?? '');

  // Best-effort flush of unsaved notes on unmount (no setState here).
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (dirtyRef.current) {
        saveMeetingNotes(roomId, notesRef.current).catch(() => {});
      }
    };
  }, [roomId]);

  const onNotesChange = (val: string) => {
    setDraft(val);
    notesRef.current = val;
    dirtyRef.current = true;
    setSaveState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await saveMeetingNotes(roomId, val);
        dirtyRef.current = false;
        setSaveState('saved');
      } catch {
        setSaveState('idle');
      }
    }, 800);
  };

  const handleEnd = async () => {
    setEnding(true);
    if (timer.current) clearTimeout(timer.current);
    try {
      // Only persist if the host actually edited — never overwrite existing
      // lead notes with an empty editor.
      if (dirtyRef.current) {
        await saveMeetingNotes(roomId, notesRef.current);
        dirtyRef.current = false;
      }
    } catch { /* best-effort */ }
    try {
      await endMeeting(roomId);
    } catch { /* idempotent / non-fatal */ }
    try {
      await room.disconnect();
    } catch { /* triggers LiveKitRoom onDisconnected */ }
  };

  return (
    <div className="flex flex-col h-full bg-surface border-l border-white/10 w-full lg:w-[340px] shrink-0">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <FileText className="w-4 h-4" style={{ color: primaryColor }} />
        <span className="text-sm font-semibold text-white">Lead workspace</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-white/40" />
          </div>
        ) : (
          <>
            {/* Identity */}
            <div>
              <h3 className="text-white font-semibold text-base">
                {crm?.business_name || crm?.guest_name || 'Guest'}
              </h3>
              {crm?.category && <p className="text-xs text-white/50 mt-0.5">{crm.category}</p>}
              <div className="mt-2 space-y-1">
                {crm?.email && (
                  <p className="text-xs text-white/60 flex items-center gap-1.5">
                    <Mail className="w-3 h-3" /> {crm.email}
                  </p>
                )}
                {crm?.phone && (
                  <p className="text-xs text-white/60 flex items-center gap-1.5">
                    <Phone className="w-3 h-3" /> {crm.phone}
                  </p>
                )}
                {crm?.website_url && (
                  <a
                    href={crm.website_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs flex items-center gap-1.5 hover:underline"
                    style={{ color: primaryColor }}
                  >
                    <Globe className="w-3 h-3" /> Website <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Score + tier */}
            {(crm?.ai_score != null || crm?.lead_tier) && (
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                {crm?.ai_score != null && (
                  <div className="flex items-center gap-1.5">
                    <Star className="w-4 h-4" style={{ color: primaryColor }} />
                    <span className="text-lg font-bold text-white">{crm.ai_score}</span>
                    <span className="text-[10px] text-white/40">/100</span>
                  </div>
                )}
                {crm?.lead_tier && (
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-full text-black"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Tier {crm.lead_tier}
                  </span>
                )}
                {crm?.status && (
                  <span className="text-[11px] text-white/50 capitalize ml-auto">{crm.status}</span>
                )}
              </div>
            )}

            {/* Website audit signals */}
            {crm?.has_lead && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-1.5">
                  Website audit
                </p>
                <Signal label="Has website" value={crm.has_website} />
                <Signal label="Mobile friendly" value={crm.is_mobile_responsive} />
                <Signal label="Online booking" value={crm.has_online_booking} />
                <Signal label="E-commerce" value={crm.has_ecommerce} />
              </div>
            )}

            {/* Qualification notes */}
            {crm?.qualification_notes && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-1.5">
                  AI qualification
                </p>
                <p className="text-xs text-white/70 leading-relaxed whitespace-pre-wrap">
                  {crm.qualification_notes}
                </p>
              </div>
            )}

            {/* Outreach history */}
            {crm?.outreach_history && crm.outreach_history.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-2">
                  Outreach history
                </p>
                <div className="space-y-2">
                  {crm.outreach_history.map((o, i) => (
                    <div key={i} className="text-xs">
                      <p className="text-white/80 truncate">{o.subject || '(no subject)'}</p>
                      <p className="text-white/40 text-[10px] flex items-center gap-2">
                        {o.sent_at ? format(new Date(o.sent_at), 'MMM d, yyyy') : '—'}
                        {o.status && <span className="capitalize">· {o.status}</span>}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes (autosave) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                  Meeting notes
                </p>
                <span className="text-[10px] text-white/40 flex items-center gap-1">
                  {saveState === 'saving' && <Loader2 className="w-3 h-3 animate-spin" />}
                  {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? (
                    <><Save className="w-3 h-3" /> Saved</>
                  ) : null}
                </span>
              </div>
              <textarea
                value={notesValue}
                onChange={(e) => onNotesChange(e.target.value)}
                rows={6}
                placeholder={crm?.has_lead ? 'Notes save to the lead profile in real time…' : 'Notes for this meeting…'}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 resize-none"
                style={{ ['--tw-ring-color' as string]: primaryColor }}
              />
            </div>
          </>
        )}
      </div>

      <div className="p-3 border-t border-white/10">
        <button
          onClick={handleEnd}
          disabled={ending}
          className="w-full flex items-center justify-center gap-2 bg-danger/15 border border-danger/30 text-danger font-medium py-2.5 rounded-xl text-sm hover:bg-danger/25 transition-colors disabled:opacity-60"
        >
          {ending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneOff className="w-4 h-4" />}
          End meeting
        </button>
      </div>
    </div>
  );
}

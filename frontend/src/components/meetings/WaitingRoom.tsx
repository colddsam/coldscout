/**
 * Branded waiting room shown to a guest who joins before the host.
 *
 * Rendered INSIDE <LiveKitRoom> so it can use the participants hook to detect
 * when a host (identity prefixed ``host-``) connects, at which point it
 * disappears and reveals the conference. Surfaces a public-safe teaser of the
 * lead's website-audit scorecard to build credibility while they wait.
 */
import { useParticipants } from '@livekit/components-react';
import { Loader2, ShieldCheck, Globe } from 'lucide-react';
import type { MeetingBranding } from '../../lib/api';

interface Props {
  branding: MeetingBranding | null;
  primaryColor: string;
}

export default function WaitingRoom({ branding, primaryColor }: Props) {
  const participants = useParticipants();
  const hostPresent = participants.some((p) => (p.identity || '').startsWith('host-'));

  // Host has arrived → step aside and let the conference show.
  if (hostPresent) return null;

  const teaser = branding?.audit_teaser;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/92 backdrop-blur-sm p-6">
      <div className="w-full max-w-md text-center">
        {branding?.agency_logo_url ? (
          <img
            src={branding.agency_logo_url}
            alt={branding.agency_name || 'Host'}
            className="w-16 h-16 rounded-full object-cover mx-auto mb-5 border border-white/15"
          />
        ) : (
          <div
            className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center text-white text-xl font-bold"
            style={{ backgroundColor: primaryColor }}
          >
            {(branding?.host_name || 'C')[0]?.toUpperCase()}
          </div>
        )}

        <h2 className="text-xl font-semibold text-white mb-2">
          Preparing your custom strategy…
        </h2>
        <p className="text-sm text-white/60 mb-6">
          {branding?.host_name ? `${branding.host_name} will let you in shortly.` : 'Your host will let you in shortly.'}
        </p>

        {teaser && (
          <div className="text-left rounded-2xl border border-white/10 bg-white/[0.04] p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4" style={{ color: primaryColor }} />
              <span className="text-xs font-semibold uppercase tracking-wider text-white/70">
                Your audit preview
              </span>
            </div>
            {teaser.business_name && (
              <p className="text-white font-medium mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-white/40" />
                {teaser.business_name}
              </p>
            )}
            {teaser.website_score_tier && (
              <div className="inline-flex items-center gap-1.5 mb-2">
                <span className="text-[11px] text-white/50">Website grade</span>
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded-full text-black"
                  style={{ backgroundColor: primaryColor }}
                >
                  {teaser.website_score_tier}
                </span>
              </div>
            )}
            {teaser.headline && (
              <p className="text-sm text-white/70 leading-relaxed">{teaser.headline}</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-center gap-2 text-white/50 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Waiting for host…
        </div>
      </div>
    </div>
  );
}

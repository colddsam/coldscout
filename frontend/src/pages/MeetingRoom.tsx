/**
 * Native In-App Video Meeting Room — `/meet/:roomId`
 *
 * A white-labeled LiveKit room. Leads join via the public link (guest token);
 * the freelancer who owns the booking is auto-detected as host (host token)
 * and gets the live CRM sidebar. Guests see a branded waiting room until the
 * host joins. Plan gating (Pro/Enterprise) is enforced server-side on the
 * host-token endpoint; the global 402 interceptor surfaces the upgrade modal.
 *
 * Rendered as a full-screen public route (outside the dashboard Shell). The
 * web build loads this client-only (ssr:false), so browser-only APIs and the
 * LiveKit SDK are safe here.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  PreJoin,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Loader2, Video, VideoOff, PanelRightOpen, PanelRightClose } from 'lucide-react';
import toast from 'react-hot-toast';

import { useAuth } from '../hooks/useAuth';
import {
  getMeetingConfig,
  getMeetingBranding,
  getMeetingHostToken,
  getMeetingGuestToken,
  endMeeting,
  type MeetingBranding,
} from '../lib/api';
import WaitingRoom from '../components/meetings/WaitingRoom';
import CrmSidebar from '../components/meetings/CrmSidebar';

/** Subset of LiveKit's LocalUserChoices we consume (typed locally to avoid a
 *  hard dependency on the SDK's exported type across versions). */
interface UserChoices {
  username: string;
  videoEnabled: boolean;
  audioEnabled: boolean;
  videoDeviceId: string;
  audioDeviceId: string;
}

type Phase =
  | 'loading'
  | 'unavailable'
  | 'notfound'
  | 'ended'
  | 'prejoin'
  | 'joining'
  | 'inroom'
  | 'left';

const DEFAULT_COLOR = '#6366f1';

function CenterCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black p-6">
      <div className="w-full max-w-sm text-center">
        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-5 text-white/70">
          {icon}
        </div>
        <h1 className="text-xl font-semibold text-white mb-2">{title}</h1>
        {subtitle && <p className="text-sm text-white/55 mb-6">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export default function MeetingRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [phase, setPhase] = useState<Phase>(roomId ? 'loading' : 'notfound');
  const [branding, setBranding] = useState<MeetingBranding | null>(null);
  const [token, setToken] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [role, setRole] = useState<'host' | 'guest'>('guest');
  const [choices, setChoices] = useState<UserChoices | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const primaryColor = branding?.agency_primary_color || DEFAULT_COLOR;

  // ── Load config + branding (after auth settles so role routing is correct) ──
  // All setState happens after an await inside the async loader (never
  // synchronously in the effect body) to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!roomId || authLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const cfg = await getMeetingConfig();
        if (cancelled) return;
        if (!cfg.enabled) {
          setPhase('unavailable');
          return;
        }
        setServerUrl(cfg.livekit_url);
        const b = await getMeetingBranding(roomId);
        if (cancelled) return;
        setBranding(b);
        setPhase(b.status === 'completed' ? 'ended' : 'prejoin');
      } catch (e) {
        if (cancelled) return;
        // getMeetingConfig failure → unavailable; branding 404 → not found.
        const msg = (e instanceof Error ? e.message : '').toLowerCase();
        setPhase(msg.includes('not found') ? 'notfound' : 'unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, authLoading]);

  // ── Join: try host (if authed) → fall back to guest ─────────────────────────
  const handleJoin = useCallback(
    async (vals: UserChoices) => {
      if (!roomId) return;
      setChoices(vals);
      setPhase('joining');

      if (isAuthenticated) {
        try {
          const t = await getMeetingHostToken(roomId);
          setRole('host');
          setToken(t.token);
          setServerUrl(t.livekit_url);
          setPhase('inroom');
          return;
        } catch {
          // Not the owner / plan lapsed / etc. — fall through to guest.
        }
      }

      try {
        const name = (vals.username || user?.full_name || 'Guest').trim() || 'Guest';
        const t = await getMeetingGuestToken(roomId, { guest_name: name });
        setRole('guest');
        setToken(t.token);
        setServerUrl(t.livekit_url);
        setPhase('inroom');
      } catch (e) {
        const msg = (e instanceof Error ? e.message : '').toLowerCase();
        if (msg.includes('ended')) setPhase('ended');
        else if (msg.includes('configured')) setPhase('unavailable');
        else {
          toast.error(e instanceof Error ? e.message : 'Could not join the meeting.');
          setPhase('prejoin');
        }
      }
    },
    [roomId, isAuthenticated, user],
  );

  // ── Leave: host marks the room complete (fallback 5-min interview rule) ──────
  const handleDisconnected = useCallback(() => {
    if (role === 'host' && roomId) {
      endMeeting(roomId).catch(() => {});
    }
    setPhase('left');
  }, [role, roomId]);

  // ── Terminal / pre-join states ──────────────────────────────────────────────
  if (phase === 'loading' || phase === 'joining' || authLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <Loader2 className="w-7 h-7 animate-spin text-white/50" />
      </div>
    );
  }

  if (phase === 'unavailable') {
    return (
      <CenterCard
        icon={<VideoOff className="w-6 h-6" />}
        title="Video isn't available"
        subtitle="In-app video meetings aren't configured for this workspace yet. Please use the link your host shares another way."
      >
        <button onClick={() => navigate('/')} className="text-sm text-white/60 hover:text-white">
          Go to homepage
        </button>
      </CenterCard>
    );
  }

  if (phase === 'notfound') {
    return (
      <CenterCard
        icon={<VideoOff className="w-6 h-6" />}
        title="Meeting not found"
        subtitle="This meeting link is invalid or has been removed."
      >
        <button onClick={() => navigate('/')} className="text-sm text-white/60 hover:text-white">
          Go to homepage
        </button>
      </CenterCard>
    );
  }

  if (phase === 'ended') {
    return (
      <CenterCard
        icon={<Video className="w-6 h-6" />}
        title="This meeting has ended"
        subtitle="Thanks for joining. You can close this tab."
      >
        <button onClick={() => navigate('/')} className="text-sm text-white/60 hover:text-white">
          Go to homepage
        </button>
      </CenterCard>
    );
  }

  if (phase === 'left') {
    return (
      <CenterCard
        icon={<Video className="w-6 h-6" />}
        title="You've left the meeting"
        subtitle="You can rejoin if the meeting is still in progress."
      >
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setPhase('prejoin')}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-black"
            style={{ backgroundColor: primaryColor }}
          >
            Rejoin
          </button>
          <button
            onClick={() => navigate(role === 'host' ? '/bookings' : '/')}
            className="text-sm text-white/55 hover:text-white"
          >
            {role === 'host' ? 'Back to bookings' : 'Go to homepage'}
          </button>
        </div>
      </CenterCard>
    );
  }

  if (phase === 'prejoin') {
    return (
      <div className="fixed inset-0 bg-black flex flex-col">
        <header className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          {branding?.agency_logo_url ? (
            <img
              src={branding.agency_logo_url}
              alt={branding.agency_name || 'Host'}
              className="w-8 h-8 rounded-full object-cover border border-white/15"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-black text-sm font-bold"
              style={{ backgroundColor: primaryColor }}
            >
              {(branding?.host_name || 'C')[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {branding?.title || 'Meeting'}
            </p>
            <p className="text-xs text-white/50 truncate">with {branding?.host_name || 'your host'}</p>
          </div>
        </header>
        <div
          className="flex-1 min-h-0 flex items-center justify-center p-4"
          data-lk-theme="default"
          style={{ ['--lk-accent-bg' as string]: primaryColor }}
        >
          <div className="w-full max-w-md">
            <PreJoin
              defaults={{
                username: user?.full_name || '',
                videoEnabled: true,
                audioEnabled: true,
              }}
              onSubmit={(vals) => handleJoin(vals as UserChoices)}
              onError={(err) => toast.error(err?.message || 'Device error')}
              joinLabel="Join meeting"
            />
          </div>
        </div>
      </div>
    );
  }

  // ── In room ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black flex flex-col"
      style={{ ['--lk-accent-bg' as string]: primaryColor }}
    >
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 shrink-0">
        {branding?.agency_logo_url ? (
          <img
            src={branding.agency_logo_url}
            alt={branding.agency_name || 'Host'}
            className="w-7 h-7 rounded-full object-cover border border-white/15"
          />
        ) : (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-black text-xs font-bold"
            style={{ backgroundColor: primaryColor }}
          >
            {(branding?.host_name || 'C')[0]?.toUpperCase()}
          </div>
        )}
        <p className="text-sm font-semibold text-white truncate flex-1 min-w-0">
          {branding?.title || 'Meeting'}
        </p>
        {role === 'host' && (
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="lg:hidden p-2 rounded-lg text-white/70 hover:bg-white/10"
            aria-label="Toggle lead workspace"
          >
            {sidebarOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
          </button>
        )}
      </header>

      <div className="flex-1 min-h-0" data-lk-theme="default">
        <LiveKitRoom
          token={token}
          serverUrl={serverUrl}
          connect
          video={choices?.videoEnabled ?? true}
          audio={choices?.audioEnabled ?? true}
          onDisconnected={handleDisconnected}
          onError={(e) => toast.error(e?.message || 'Connection error')}
          options={{
            videoCaptureDefaults: choices?.videoDeviceId ? { deviceId: choices.videoDeviceId } : undefined,
            audioCaptureDefaults: choices?.audioDeviceId ? { deviceId: choices.audioDeviceId } : undefined,
          }}
          style={{ height: '100%' }}
        >
          <div className="flex h-full min-h-0">
            <div className="flex-1 min-w-0 relative">
              <VideoConference />
              {role === 'guest' && <WaitingRoom branding={branding} primaryColor={primaryColor} />}
            </div>

            {role === 'host' && (
              <>
                <div className="hidden lg:flex h-full">
                  <CrmSidebar roomId={roomId!} primaryColor={primaryColor} />
                </div>
                {sidebarOpen && (
                  <div className="lg:hidden absolute inset-0 z-40 flex justify-end bg-black/40">
                    <div className="w-[88%] max-w-[360px] h-full" onClick={(e) => e.stopPropagation()}>
                      <CrmSidebar roomId={roomId!} primaryColor={primaryColor} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>
    </div>
  );
}

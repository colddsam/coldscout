import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  Calendar, Clock, Mail, Loader2, CheckCircle2, XCircle, ExternalLink, Plus,
  Link2, Copy, Trash2, ToggleLeft, ToggleRight, Globe, Video
} from 'lucide-react';
import {
  getMyBookings, approveBooking, rejectBooking, cancelBooking, createManualBlock,
  getMyEventTypes, createEventType, updateEventType, deleteEventType,
  createInstantMeeting, getMyFreelancerProfile, getMeetingConfig
} from '../lib/api';
import type { EventTypeItem } from '../lib/api';
import AvailabilitySettings from '../components/bookings/AvailabilitySettings';
import toast from 'react-hot-toast';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { Capacitor } from '@capacitor/core';

interface Booking {
  id: number;
  guest_name: string;
  guest_email: string;
  guest_notes?: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'completed';
  booking_type: 'standard' | 'custom_link' | 'instant' | 'custom_request' | 'manual_block';
  proposed_times?: string;
  google_meet_link?: string;
  meeting_link?: string | null;
  // Native in-app video
  room_id?: string | null;
  provider?: string | null;
  meeting_status?: 'planned' | 'active' | 'completed' | null;
}

// Duration presets for the Event Type creation UI
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

export default function Bookings() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'appointments' | 'event-types' | 'availability'>('appointments');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'cancelled'>('all');

  // Block Time modal state
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [blockTitle, setBlockTitle] = useState('Personal Time');
  const [blockDate, setBlockDate] = useState('');
  const [blockStart, setBlockStart] = useState('');
  const [blockEnd, setBlockEnd] = useState('');

  // Instant Meeting modal state
  const [isInstantModalOpen, setIsInstantModalOpen] = useState(false);
  const [imGuestName, setIMGuestName] = useState('');
  const [imGuestEmail, setIMGuestEmail] = useState('');
  const [imTitle, setIMTitle] = useState('Discovery Call');
  const [imDesc, setIMDesc] = useState('');
  const [imDuration, setIMDuration] = useState(30);
  const [imNativeVideo, setIMNativeVideo] = useState(true);

  // Event Type modal state
  const [isETModalOpen, setIsETModalOpen] = useState(false);
  const [etTitle, setETTitle] = useState('');
  const [etSlug, setETSlug] = useState('');
  const [etDuration, setETDuration] = useState(30);
  const [etDesc, setETDesc] = useState('');
  const [etColor, setETColor] = useState('#ffffff');

  // ── Bookings queries ─────────────────────────────────────────────────────
  const { data: bookingData, isLoading } = useQuery({
    queryKey: ['bookings'],
    queryFn: () => getMyBookings(),
  });

  const bookings = Array.isArray(bookingData?.bookings) ? bookingData.bookings : [];

  const approveMutation = useMutation({
    mutationFn: (id: number) => approveBooking(id),
    onSuccess: () => {
      toast.success('Booking approved');
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
    onError: () => toast.error('Failed to approve booking'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => rejectBooking(id),
    onSuccess: () => {
      toast.success('Booking rejected');
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
    onError: () => toast.error('Failed to reject booking'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => cancelBooking(id),
    onSuccess: () => {
      toast.success('Booking cancelled');
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
    onError: () => toast.error('Failed to cancel booking'),
  });

  const createBlockMutation = useMutation({
    mutationFn: () => {
      if (!blockDate || !blockStart || !blockEnd) throw new Error("Please fill out all fields");
      const startDateTime = new Date(`${blockDate}T${blockStart}:00`);
      const endDateTime = new Date(`${blockDate}T${blockEnd}:00`);
      return createManualBlock({
        title: blockTitle,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString()
      });
    },
    onSuccess: () => {
      toast.success('Time blocked successfully');
      setIsBlockModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to block time')
  });

  const createInstantMutation = useMutation({
    mutationFn: () => {
      if (!imGuestName.trim() || !imGuestEmail.trim() || !imTitle.trim()) {
        throw new Error("Guest name, email, and title are required");
      }
      return createInstantMeeting({
        guest_name: imGuestName.trim(),
        guest_email: imGuestEmail.trim(),
        title: imTitle.trim(),
        description: imDesc.trim() || undefined,
        duration_minutes: imDuration,
        use_native_video: imNativeVideo && videoEnabled,
      });
    },
    onSuccess: (data) => {
      toast.success('Instant meeting created!');
      setIsInstantModalOpen(false);
      setIMGuestName(''); setIMGuestEmail(''); setIMTitle('Discovery Call'); setIMDesc(''); setIMDuration(30);
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      if (data.room_id) {
        // Branded room — open it as host. In the Capacitor (Android) WebView a
        // window.open('_blank') doesn't open a usable tab, so navigate in-app;
        // on web keep the new tab so the Bookings page stays open to copy the link.
        if (Capacitor.isNativePlatform()) {
          navigate(`/meet/${data.room_id}`);
        } else {
          window.open(`/meet/${data.room_id}`, '_blank', 'noopener');
        }
      } else if (data.meeting_link) {
        toast.success(`Meeting Link: ${data.meeting_link}`, { duration: 6000 });
      }
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create instant meeting'),
  });

  const filteredBookings = (bookings || []).filter((b: Booking) => {
    if (filter === 'all') return true;
    return b.status === filter;
  });

  // ── Event Types queries ──────────────────────────────────────────────────
  const { data: etData, isLoading: isETLoading } = useQuery({
    queryKey: ['event-types'],
    queryFn: () => getMyEventTypes(),
  });

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => getMyFreelancerProfile(),
  });

  // Whether native in-app video is configured for this workspace. When it
  // isn't, the "Cold Scout Video" toggle is hidden and instant meetings keep
  // using Google Meet / the profile link (no behaviour change).
  const { data: meetingCfg } = useQuery({
    queryKey: ['meeting-config'],
    queryFn: () => getMeetingConfig(),
    staleTime: 300_000,
  });
  const videoEnabled = !!meetingCfg?.enabled;

  const eventTypes: EventTypeItem[] = Array.isArray(etData?.event_types) ? etData.event_types : [];

  const createETMutation = useMutation({
    mutationFn: () => {
      if (!etTitle.trim() || !etSlug.trim()) throw new Error("Title and slug are required");
      return createEventType({
        title: etTitle.trim(),
        slug: etSlug.trim(),
        duration_minutes: etDuration,
        description: etDesc.trim() || undefined,
        color: etColor,
      });
    },
    onSuccess: () => {
      toast.success('Event type created!');
      setIsETModalOpen(false);
      setETTitle(''); setETSlug(''); setETDuration(30); setETDesc(''); setETColor('#ffffff');
      queryClient.invalidateQueries({ queryKey: ['event-types'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create event type'),
  });

  const toggleETMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      updateEventType(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-types'] });
    },
    onError: () => toast.error('Failed to update event type'),
  });

  const deleteETMutation = useMutation({
    mutationFn: (id: number) => deleteEventType(id),
    onSuccess: () => {
      toast.success('Event type deleted');
      queryClient.invalidateQueries({ queryKey: ['event-types'] });
    },
    onError: () => toast.error('Failed to delete event type'),
  });

  // Auto-generate slug from title
  const handleTitleChange = (val: string) => {
    setETTitle(val);
    setETSlug(val.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-'));
  };

  const copyLink = (slug: string) => {
    const base = window.location.origin;
    // The user profile's username is embedded in the booking link, we'll use profile data if available.
    // For now, the freelancer can read the full link from the card.
    const link = `${base}/book/${slug}`;
    navigator.clipboard.writeText(link);
    toast.success('Link copied!');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <p className="eyebrow mb-1.5">Calendar</p>
          <h1 className="heading-page">Bookings</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <p className="text-[13px] text-tertiary">Manage meetings and event types.</p>
            {profile?.scheduling_preferences?.timezone && (
              <span className="chip">
                <Globe className="w-3 h-3" />
                {profile.scheduling_preferences.timezone}
              </span>
            )}
          </div>
        </div>
        {activeTab === 'appointments' ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" icon={<Link2 className="w-3.5 h-3.5" />} onClick={() => setIsInstantModalOpen(true)}>
              Instant Meeting
            </Button>
            <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setIsBlockModalOpen(true)}>
              Block Time
            </Button>
          </div>
        ) : (
          <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setIsETModalOpen(true)}>
            New Event Type
          </Button>
        )}
      </div>

      {/* Top-level tabs */}
      <div className="segmented overflow-x-auto">
        {(['appointments', 'event-types', 'availability'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`segmented-item ${activeTab === tab ? 'is-active' : ''}`}
          >
            {tab === 'event-types' ? 'Event Types' : tab === 'availability' ? 'Availability' : 'Appointments'}
          </button>
        ))}
      </div>

      {activeTab === 'availability' && (
        <div className="rounded-xl border border-info/25 bg-info/[0.05] p-4 flex items-start gap-3">
          <Clock className="w-4 h-4 text-info shrink-0 mt-0.5" />
          <div className="text-[13px] text-info/95 leading-relaxed">
            <p className="font-semibold mb-1">Notice Period Active</p>
            <p className="text-info/80">A 1-hour notice period is automatically applied to all native bookings to prevent unexpected "instant" meetings.</p>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {activeTab === 'appointments' && (
          <motion.div key="appointments" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* Sub-tabs: all / pending / approved / cancelled / completed */}
            <div className="flex gap-1.5 mb-5 overflow-x-auto flex-wrap">
              {['all', 'pending', 'approved', 'cancelled', 'completed'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab as 'all' | 'pending' | 'approved' | 'cancelled')}
                  className={`chip capitalize ${
                    filter === tab
                      ? '!text-white !bg-white/[0.08] !border-white/20'
                      : 'hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {isLoading ? (
              <div className="py-20 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-tertiary" /></div>
            ) : filteredBookings.length === 0 ? (
              <div className="empty-state">
                <Calendar className="w-7 h-7 text-tertiary mb-3" />
                <p className="heading-card mb-1">No bookings found</p>
                <p className="text-meta max-w-sm">When someone schedules a meeting, it will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredBookings.map((booking: Booking) => {
                  const isPast = new Date(booking.end_time) < new Date();
                  const isClosed = booking.status === 'completed' || (isPast && booking.status === 'approved');

                  return (
                    <motion.div
                      key={booking.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`bg-surface border rounded-xl p-5 relative overflow-hidden group ${
                        isClosed ? 'border-white/5 bg-white/5 opacity-60' :
                        booking.status === 'pending' ? 'border-warning/25 bg-warning/[0.05]' :
                        booking.status === 'approved' ? 'border-success/25 bg-success/[0.05]' :
                        'border-white/10'
                      }`}
                    >
                      {/* Status indicator bar */}
                      <div className={`absolute top-0 left-0 bottom-0 w-1 ${
                        isClosed ? 'bg-white/15' :
                        booking.status === 'pending' ? 'bg-warning/60' :
                        booking.status === 'approved' ? 'bg-success/60' :
                        booking.status === 'cancelled' ? 'bg-danger/60' :
                        'bg-white/10'
                      }`} />

                      <div className="flex items-start justify-between">
                        <div className="flex gap-3">
                          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white font-bold shrink-0">
                            {booking.guest_name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <h3 className="text-white font-semibold flex items-center gap-2">
                              {booking.guest_name}
                              <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize font-medium ${
                                isClosed ? 'bg-white/10 text-white/60' :
                                booking.status === 'pending' ? 'bg-warning/15 text-warning' :
                                booking.status === 'approved' ? 'bg-success/15 text-success' :
                                'bg-white/10 text-white/60'
                              }`}>
                                {isClosed ? 'closed' : booking.status}
                              </span>
                            </h3>
                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                              <Mail className="w-3 h-3" /> {booking.guest_email}
                            </p>
                          </div>
                        </div>
                        {booking.booking_type === 'manual_block' && (
                          <span className="text-[10px] bg-white/10 text-white/50 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> Block
                          </span>
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 p-3 bg-black/40 rounded-lg border border-white/5">
                        <div className="space-y-1">
                          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Date</p>
                          <p className="text-sm text-white font-medium flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-gray-400" />
                            {format(new Date(booking.start_time), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Time</p>
                          <p className="text-sm text-white font-medium flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            {format(new Date(booking.start_time), 'h:mm a')}
                          </p>
                        </div>
                      </div>

                      {booking.guest_notes && (
                        <div className="mt-3 p-3 bg-white/5 rounded-lg border border-white/5">
                          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1">Notes</p>
                          <p className="text-xs text-gray-400 italic line-clamp-2">"{booking.guest_notes}"</p>
                        </div>
                      )}

                      {booking.provider === 'livekit' && booking.room_id && booking.meeting_status !== 'completed' && (
                        <button
                          onClick={() => navigate(`/meet/${booking.room_id}`)}
                          className="mt-3 w-full flex items-center justify-center gap-2 bg-info/[0.08] border border-info/25 text-info text-xs font-medium py-2 rounded-lg hover:bg-info/15 transition-colors"
                        >
                          <Video className="w-3 h-3" /> Join branded room
                        </button>
                      )}

                      {booking.google_meet_link && booking.status === 'approved' && (
                        <a
                          href={booking.google_meet_link}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 w-full flex items-center justify-center gap-2 bg-info/[0.08] border border-info/25 text-info text-xs font-medium py-2 rounded-lg hover:bg-info/15 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" /> Join Google Meet
                        </a>
                      )}

                      <div className="mt-4 flex gap-2">
                        {!isClosed && booking.status === 'pending' && (
                          <>
                            <button
                              onClick={() => approveMutation.mutate(booking.id)}
                              disabled={approveMutation.isPending}
                              className="flex-1 bg-white text-black font-medium py-2 px-3 rounded-lg text-sm hover:bg-gray-200 transition-colors flex items-center justify-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button
                              onClick={() => rejectMutation.mutate(booking.id)}
                              disabled={rejectMutation.isPending}
                              className="flex-1 bg-white/5 border border-white/10 text-white font-medium py-2 px-3 rounded-lg text-sm hover:bg-white/10 transition-colors flex items-center justify-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                          </>
                        )}
                        {!isClosed && (booking.status === 'approved' || booking.booking_type === 'manual_block') && (
                          <button
                            onClick={() => cancelMutation.mutate(booking.id)}
                            disabled={cancelMutation.isPending}
                            className="w-full bg-surface-2 border border-white/10 text-danger font-medium py-2 px-3 rounded-lg text-sm hover:bg-danger/10 hover:border-danger/30 transition-colors flex items-center justify-center gap-1"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'event-types' && (
          <motion.div key="event-types" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {isETLoading ? (
              <div className="py-20 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-tertiary" /></div>
            ) : eventTypes.length === 0 ? (
              <div className="empty-state">
                <Link2 className="w-7 h-7 text-tertiary mb-3" />
                <p className="heading-card mb-1">No custom event types yet</p>
                <p className="text-meta max-w-md mb-5">
                  By default, leads will see a 30 Minute Meeting on your booking page. Create custom event types for different durations.
                </p>
                <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setIsETModalOpen(true)}>
                  Create First Event Type
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {eventTypes.map((et) => (
                  <motion.div
                    key={et.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`relative bg-surface border rounded-xl p-5 group transition-colors ${
                      et.is_active ? 'border-white/10' : 'border-white/5 opacity-60'
                    }`}
                  >
                    {/* Colour accent bar */}
                    <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl" style={{ backgroundColor: et.color || '#ffffff' }} />

                    <div className="flex items-start justify-between mt-1">
                      <div>
                        <h3 className="text-white font-semibold text-base">{et.title}</h3>
                        <div className="flex items-center gap-2 mt-1.5 text-sm text-gray-400">
                          <Clock className="w-3.5 h-3.5" />
                          {et.duration_minutes} min
                        </div>
                      </div>
                      <button
                        onClick={() => toggleETMutation.mutate({ id: et.id, is_active: !et.is_active })}
                        className="text-gray-500 hover:text-white transition-colors"
                        title={et.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {et.is_active ? <ToggleRight className="w-5 h-5 text-success" /> : <ToggleLeft className="w-5 h-5" />}
                      </button>
                    </div>

                    {et.description && (
                      <p className="text-xs text-gray-500 mt-2 line-clamp-2">{et.description}</p>
                    )}

                    <div className="flex items-center gap-1 mt-4 text-xs text-gray-600 bg-white/5 rounded-lg px-3 py-2 font-mono truncate">
                      <Link2 className="w-3 h-3 shrink-0" />
                      /book/.../{et.slug}
                    </div>

                    <div className="flex items-center gap-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => copyLink(et.slug)}
                        className="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-white bg-white/10 hover:bg-white/15 rounded-lg py-2 transition-colors"
                      >
                        <Copy className="w-3 h-3" /> Copy Link
                      </button>
                      <button
                        onClick={() => { if (confirm('Delete this event type?')) deleteETMutation.mutate(et.id); }}
                        className="flex items-center justify-center gap-1 text-xs font-medium text-danger bg-danger/10 hover:bg-danger/20 rounded-lg py-2 px-3 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'availability' && (
          <motion.div key="availability" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {profile ? (
              <AvailabilitySettings profile={profile} />
            ) : (
              <div className="empty-state">
                <Loader2 className="w-5 h-5 animate-spin text-tertiary mb-3" />
                <p className="text-meta">Loading availability settings…</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Block Time Modal */}
      <Modal
        open={isBlockModalOpen}
        onClose={() => setIsBlockModalOpen(false)}
        title="Block Time"
      >
        <p className="text-sm text-white/70 mb-6">Manually mark a time period as busy so leads cannot book it.</p>
        <form onSubmit={(e) => { e.preventDefault(); createBlockMutation.mutate(); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">Title</label>
            <input 
              type="text" 
              required 
              value={blockTitle}
              onChange={e => setBlockTitle(e.target.value)}
              className="input-field"
              placeholder="e.g. Lunch, Out of Office"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-2">Date</label>
            <input 
              type="date" 
              required 
              value={blockDate}
              onChange={e => setBlockDate(e.target.value)}
              className="input-field"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">Start Time</label>
              <input 
                type="time" 
                required 
                value={blockStart}
                onChange={e => setBlockStart(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">End Time</label>
              <input 
                type="time" 
                required 
                value={blockEnd}
                onChange={e => setBlockEnd(e.target.value)}
                className="input-field"
              />
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => setIsBlockModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createBlockMutation.isPending}>
              Block Time
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Event Type Modal */}
      <Modal
        open={isETModalOpen}
        onClose={() => setIsETModalOpen(false)}
        title="Create Event Type"
      >
        <p className="text-sm text-white/70 mb-6">
          Create a new meeting type with a custom duration. Leads will see it on your booking page.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); createETMutation.mutate(); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">Title *</label>
            <input 
              type="text" 
              required 
              value={etTitle}
              onChange={e => handleTitleChange(e.target.value)}
              className="input-field"
              placeholder="e.g. 15 Min Discovery Call"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-2">URL Slug</label>
            <div className="flex items-center gap-0 rounded-xl overflow-hidden border border-white/10">
              <span className="bg-white/5 px-3 py-3 text-sm text-gray-500 shrink-0">/book/.../</span>
              <input 
                type="text" 
                required 
                value={etSlug}
                onChange={e => setETSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className="flex-1 bg-white/5 px-3 py-3 text-white focus:outline-none text-sm font-mono"
                placeholder="15-min-discovery"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-2">Duration</label>
            <div className="flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setETDuration(d)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    etDuration === d ? 'bg-white text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  {d} min
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-2">Description (optional)</label>
            <textarea 
              value={etDesc}
              onChange={e => setETDesc(e.target.value)}
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/20 resize-none"
              placeholder="What's this meeting about?"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-2">Accent Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={etColor}
                onChange={e => setETColor(e.target.value)}
                className="w-10 h-10 rounded-lg border border-white/10 cursor-pointer bg-transparent"
              />
              <span className="text-xs text-gray-500 font-mono">{etColor}</span>
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => setIsETModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createETMutation.isPending}>
              Create Event Type
            </Button>
          </div>
        </form>
      </Modal>

      {/* Instant Meeting Modal */}
      <Modal
        open={isInstantModalOpen}
        onClose={() => setIsInstantModalOpen(false)}
        title="Instant Meeting"
      >
        <p className="text-sm text-white/70 mb-6">
          Generate an immediate meeting link and invite a guest via email.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); createInstantMutation.mutate(); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">Guest Name *</label>
              <input 
                type="text" 
                required 
                value={imGuestName}
                onChange={e => setIMGuestName(e.target.value)}
                className="input-field"
                placeholder="e.g. John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">Guest Email *</label>
              <input 
                type="email" 
                required 
                value={imGuestEmail}
                onChange={e => setIMGuestEmail(e.target.value)}
                className="input-field"
                placeholder="john@example.com"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-2">Meeting Title *</label>
            <input 
              type="text" 
              required 
              value={imTitle}
              onChange={e => setIMTitle(e.target.value)}
              className="input-field"
              placeholder="e.g. Quick Intro"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-2">Duration</label>
            <div className="flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setIMDuration(d)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    imDuration === d ? 'bg-white text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  {d} min
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-2">Description (optional)</label>
            <textarea
              value={imDesc}
              onChange={e => setIMDesc(e.target.value)}
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/20 resize-none"
              placeholder="What's this meeting about?"
            />
          </div>
          {videoEnabled && (
            <button
              type="button"
              onClick={() => setIMNativeVideo((v) => !v)}
              className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left hover:bg-white/[0.06] transition-colors"
            >
              <Video className="w-4 h-4 text-white/70 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-white">Cold Scout Video (branded room)</span>
                <span className="block text-xs text-white/50">
                  Host in-app with the lead CRM sidebar. Off = Google Meet / your link.
                </span>
              </span>
              {imNativeVideo ? (
                <ToggleRight className="w-6 h-6 text-success shrink-0" />
              ) : (
                <ToggleLeft className="w-6 h-6 text-white/40 shrink-0" />
              )}
            </button>
          )}
          <div className="pt-4 flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => setIsInstantModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createInstantMutation.isPending}>
              Create & Invite
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

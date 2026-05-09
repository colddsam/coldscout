import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  Calendar, Clock, Mail, Loader2, CheckCircle2, XCircle, ExternalLink, Plus,
  Link2, Copy, Trash2, ToggleLeft, ToggleRight
} from 'lucide-react';
import {
  getMyBookings, approveBooking, rejectBooking, cancelBooking, createManualBlock,
  getMyEventTypes, createEventType, updateEventType, deleteEventType,
} from '../lib/api';
import type { EventTypeItem } from '../lib/api';
import toast from 'react-hot-toast';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';

interface Booking {
  id: number;
  guest_name: string;
  guest_email: string;
  guest_notes?: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  booking_type: 'standard' | 'custom_link' | 'instant' | 'custom_request' | 'manual_block';
  proposed_times?: string;
  google_meet_link?: string;
}

// Duration presets for the Event Type creation UI
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

export default function Bookings() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'appointments' | 'event-types'>('appointments');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'cancelled'>('all');

  // Block Time modal state
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [blockTitle, setBlockTitle] = useState('Personal Time');
  const [blockDate, setBlockDate] = useState('');
  const [blockStart, setBlockStart] = useState('');
  const [blockEnd, setBlockEnd] = useState('');

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

  const filteredBookings = (bookings || []).filter((b: Booking) => {
    if (filter === 'all') return true;
    return b.status === filter;
  });

  // ── Event Types queries ──────────────────────────────────────────────────
  const { data: etData, isLoading: isETLoading } = useQuery({
    queryKey: ['event-types'],
    queryFn: () => getMyEventTypes(),
  });

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
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Bookings</h1>
          <p className="text-sm text-gray-400 mt-1">Manage meetings and event types.</p>
        </div>
        {activeTab === 'appointments' ? (
          <Button onClick={() => setIsBlockModalOpen(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Block Time
          </Button>
        ) : (
          <Button onClick={() => setIsETModalOpen(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Event Type
          </Button>
        )}
      </div>

      {/* Top-level tabs: Appointments | Event Types */}
      <div className="flex gap-2 border-b border-white/10 pb-4">
        {(['appointments', 'event-types'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-lg capitalize transition-colors ${
              activeTab === tab ? 'bg-white text-black' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab === 'event-types' ? 'Event Types' : 'Appointments'}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'appointments' ? (
          <motion.div key="appointments" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* Sub-tabs: all / pending / approved / cancelled */}
            <div className="flex gap-2 mb-6">
              {['all', 'pending', 'approved', 'cancelled'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab as 'all' | 'pending' | 'approved' | 'cancelled')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors ${
                    filter === tab ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {isLoading ? (
              <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-white/50" /></div>
            ) : filteredBookings.length === 0 ? (
              <div className="py-20 text-center border border-white/5 rounded-xl bg-surface-2/50">
                <Calendar className="w-10 h-10 text-white/20 mx-auto mb-3" />
                <h3 className="text-white font-medium">No bookings found</h3>
                <p className="text-sm text-gray-400 mt-1">You don't have any {filter !== 'all' ? filter : ''} bookings.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredBookings.map((booking: Booking) => (
                  <motion.div
                    key={booking.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-surface border border-white/10 rounded-xl p-5 flex flex-col md:flex-row gap-6 md:items-center"
                  >
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-medium text-white">{booking.guest_name}</h3>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          booking.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' :
                          booking.status === 'approved' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                          'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          {booking.status.toUpperCase()}
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                        {booking.booking_type !== 'custom_request' && (
                          <>
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-4 h-4" />
                              {format(new Date(booking.start_time), 'MMM d, yyyy')}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4" />
                              {format(new Date(booking.start_time), 'h:mm a')} 
                              {booking.booking_type !== 'manual_block' && ` (${booking.duration_minutes} min)`}
                            </div>
                          </>
                        )}
                        {booking.booking_type !== 'manual_block' && (
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-4 h-4" />
                            <a href={`mailto:${booking.guest_email}`} className="hover:text-white transition-colors">{booking.guest_email}</a>
                          </div>
                        )}
                        {booking.booking_type === 'custom_request' && (
                          <div className="flex items-center gap-1.5 text-accent">
                            <Clock className="w-4 h-4" />
                            Custom Request
                          </div>
                        )}
                        {booking.booking_type === 'manual_block' && (
                          <div className="flex items-center gap-1.5 text-gray-500">
                            <Calendar className="w-4 h-4" />
                            Blocked Time
                          </div>
                        )}
                      </div>

                      {booking.proposed_times && (
                        <div className="text-sm text-accent bg-accent/10 p-3 rounded-lg border border-accent/20">
                          <span className="font-medium mr-2">Proposed Times:</span>
                          {booking.proposed_times}
                        </div>
                      )}

                      {booking.guest_notes && (
                        <div className="text-sm text-gray-300 bg-black/20 p-3 rounded-lg border border-white/5">
                          <span className="text-gray-500 font-medium mr-2">Notes:</span>
                          {booking.guest_notes}
                        </div>
                      )}
                      
                      {booking.google_meet_link && (
                        <div className="flex items-center gap-2 mt-2">
                          <a href={booking.google_meet_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300">
                            Join Google Meet <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 md:flex-col md:w-32">
                      {booking.status === 'pending' && (
                        <>
                          <button
                            onClick={() => approveMutation.mutate(booking.id)}
                            disabled={approveMutation.isPending}
                            className="flex-1 w-full bg-white text-black font-medium py-2 px-3 rounded-lg text-sm hover:bg-gray-200 transition-colors flex items-center justify-center gap-1"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Approve
                          </button>
                          <button
                            onClick={() => rejectMutation.mutate(booking.id)}
                            disabled={rejectMutation.isPending}
                            className="flex-1 w-full bg-surface-2 border border-white/10 text-white font-medium py-2 px-3 rounded-lg text-sm hover:bg-white/5 transition-colors flex items-center justify-center gap-1"
                          >
                            <XCircle className="w-4 h-4" /> Reject
                          </button>
                        </>
                      )}
                      {booking.status === 'approved' && (
                        <button
                          onClick={() => cancelMutation.mutate(booking.id)}
                          disabled={cancelMutation.isPending}
                          className="w-full bg-surface-2 border border-white/10 text-red-400 font-medium py-2 px-3 rounded-lg text-sm hover:bg-red-500/10 hover:border-red-500/20 transition-colors flex items-center justify-center gap-1"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          /* ── Event Types Tab ─────────────────────────────────────────── */
          <motion.div key="event-types" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {isETLoading ? (
              <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-white/50" /></div>
            ) : eventTypes.length === 0 ? (
              <div className="py-20 text-center border border-white/5 rounded-xl bg-surface-2/50">
                <Link2 className="w-10 h-10 text-white/20 mx-auto mb-3" />
                <h3 className="text-white font-medium">No custom event types yet</h3>
                <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto mb-6">
                  By default, leads will see a "30 Minute Meeting" on your booking page.
                  Create custom event types to offer different durations (e.g., 15-min intro, 60-min deep dive).
                </p>
                <Button onClick={() => setIsETModalOpen(true)} className="inline-flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Create Your First Event Type
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
                        {et.is_active ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5" />}
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
                        className="flex items-center justify-center gap-1 text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg py-2 px-3 transition-colors"
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
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
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
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
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
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">End Time</label>
              <input 
                type="time" 
                required 
                value={blockEnd}
                onChange={e => setBlockEnd(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
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
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
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
    </div>
  );
}

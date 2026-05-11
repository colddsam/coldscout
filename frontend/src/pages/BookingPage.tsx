/**
 * Public Booking Page — `/book/:username` or `/book/:username/:eventSlug`
 *
 * Provides a branded scheduling experience where users can select
 * an available time slot and book a meeting directly on the platform.
 */
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar as CalendarIcon, Clock, User, Briefcase, MapPin, Globe, 
  ChevronLeft, ChevronRight, CheckCircle2, ArrowLeft, Loader2
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, isBefore, startOfDay, addMonths, subMonths, isSameMonth, parseISO } from 'date-fns';
import type { AxiosError } from 'axios';

import { getPublicProfile, getBookingSlots, createNativeBooking, requestCustomTime, getPublicEventTypes } from '../lib/api';
import type { EventTypeItem } from '../lib/api';
import { useSEO } from '../hooks/useSEO';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import { fadeInUp, defaultViewport } from '../lib/motion';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import toast from 'react-hot-toast';

export default function BookingPage() {
  const { username, eventSlug } = useParams<{ username: string; eventSlug?: string }>();
  const navigate = useNavigate();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Form state
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestNotes, setGuestNotes] = useState('');
  
  // Custom request state
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [proposedTimes, setProposedTimes] = useState('');

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['public-profile', username],
    queryFn: () => getPublicProfile(username!),
    enabled: !!username,
    retry: false,
  });

  // Fetch event types for this freelancer
  const { data: eventsData } = useQuery({
    queryKey: ['public-events', username],
    queryFn: () => getPublicEventTypes(username!),
    enabled: !!username,
  });

  const eventTypes: EventTypeItem[] = eventsData?.event_types || [];
  // Resolve the active event type from the URL slug (or default to first/only)
  const activeEvent: EventTypeItem | undefined = eventSlug
    ? eventTypes.find(e => e.slug === eventSlug)
    : eventTypes.length === 1 ? eventTypes[0] : undefined;
  const activeDuration = activeEvent?.duration_minutes || 30;
  // Show event picker only when there are multiple event types and no slug in URL
  const showEventPicker = !eventSlug && eventTypes.length > 1;

  useSEO({
    title: profile ? `Book a Meeting with ${profile.full_name || username}` : 'Book a Meeting - Cold Scout',
    description: profile ? `Schedule a time with ${profile.full_name || username} via Cold Scout.` : 'Schedule a meeting easily.',
    index: false, // Don't index booking pages
  });

  // Calculate calendar days
  const firstDayOfMonth = startOfMonth(currentMonth);
  const lastDayOfMonth = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: firstDayOfMonth, end: lastDayOfMonth });

  // Add empty slots for days before the first day of the month to align with weekday headers
  const startingDayIndex = firstDayOfMonth.getDay();
  const calendarDays = Array(startingDayIndex).fill(null).concat(daysInMonth);

  // Fetch slots for selected date
  const { data: slotData, isLoading: isLoadingSlots } = useQuery({
    queryKey: ['booking-slots', username, selectedDate?.toISOString(), activeDuration],
    queryFn: () => {
      const dayStart = startOfDay(selectedDate!);
      const start = dayStart.toISOString();
      const end = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000).toISOString();
      const visitorTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return getBookingSlots(username!, start, end, activeDuration, visitorTimezone);
    },
    enabled: !!username && !!selectedDate && !showEventPicker,
  });

  const slots = slotData?.slots || [];

  const createBooking = useMutation({
    mutationFn: () => {
      if (!selectedDate || !selectedSlot) throw new Error("Slot not selected");
      return createNativeBooking(username!, {
        guest_name: guestName,
        guest_email: guestEmail,
        guest_notes: guestNotes,
        start_time: selectedSlot,
        duration_minutes: activeDuration,
        event_slug: eventSlug || activeEvent?.slug,
      });
    },
    onSuccess: () => {
      setIsSuccess(true);
      toast.success("Booking confirmed!");
    },
    onError: (err: AxiosError<{ detail?: string }>) => {
      toast.error((err.response?.data?.detail) || err.message || "Failed to book meeting");
    }
  });

  const createCustomBooking = useMutation({
    mutationFn: () => {
      return requestCustomTime(username!, {
        guest_name: guestName,
        guest_email: guestEmail,
        guest_notes: guestNotes,
        proposed_times: proposedTimes,
      });
    },
    onSuccess: () => {
      setIsSuccess(true);
      setIsCustomModalOpen(false);
      toast.success("Custom request sent!");
    },
    onError: (err: AxiosError<{ detail?: string }>) => {
      toast.error((err.response?.data?.detail) || err.message || "Failed to send request");
    }
  });

  const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-white/20" />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-4xl font-bold mb-4 text-white">404</h1>
        <h2 className="text-2xl font-semibold mb-4 text-white/90">User Not Found</h2>
        <p className="text-white/60 mb-8 max-w-md mx-auto">
          We couldn't find a booking page for <span className="text-white font-mono">@{username}</span>.
        </p>
        <Button onClick={() => navigate('/')} variant="outline">Return Home</Button>
      </div>
    );
  }

  const isNotAvailable = profile.freelancer?.availability === 'not_available';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col relative overflow-hidden font-sans">
      <PublicNavbar />

      {/* Decorative Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-white/[0.02] rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-white/[0.02] rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay" />
      </div>

      <main className="flex-1 container max-w-6xl mx-auto px-4 sm:px-6 py-12 lg:py-24 relative z-10 flex flex-col lg:flex-row gap-8 lg:gap-12">
        {/* Left Column: Profile Info */}
        <motion.div 
          className="lg:w-1/3 flex flex-col"
          variants={fadeInUp} initial="hidden" animate="visible" viewport={defaultViewport}
        >
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-md sticky top-24">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors mb-8">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>

            <div className="w-20 h-20 rounded-full border-2 border-white/20 bg-black overflow-hidden mb-6">
              {profile.avatar_url || profile.profile_photo_url ? (
                <img src={profile.avatar_url || profile.profile_photo_url || undefined} alt={profile.full_name || username} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-white/5 text-white/20">
                  <User className="w-8 h-8" />
                </div>
              )}
            </div>

            <h1 className="text-2xl font-bold text-white mb-2">{profile.full_name || username}</h1>
            
            {profile.freelancer && (
              <div className="space-y-3 mt-6">
                {profile.freelancer.professional_title && (
                  <div className="flex items-start gap-3 text-white/70">
                    <Briefcase className="w-5 h-5 mt-0.5 shrink-0" />
                    <span className="text-sm">{profile.freelancer.professional_title}</span>
                  </div>
                )}
                {profile.location && (
                  <div className="flex items-start gap-3 text-white/70">
                    <MapPin className="w-5 h-5 mt-0.5 shrink-0" />
                    <span className="text-sm">{profile.location}</span>
                  </div>
                )}
                {profile.freelancer.personal_website && (
                  <div className="flex items-start gap-3 text-white/70">
                    <Globe className="w-5 h-5 mt-0.5 shrink-0" />
                    <a href={profile.freelancer.personal_website} target="_blank" rel="noopener noreferrer" className="text-sm hover:text-white transition-colors">
                      {profile.freelancer.personal_website.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                )}
                {profile.freelancer?.scheduling_preferences?.timezone && (
                  <div className="flex items-start gap-3 text-white/70">
                    <Globe className="w-5 h-5 mt-0.5 shrink-0 text-blue-400" />
                    <span className="text-sm">Timezone: {profile.freelancer.scheduling_preferences.timezone}</span>
                  </div>
                )}
              </div>
            )}

            <div className="mt-8 pt-8 border-t border-white/10">
              <div className="flex items-center gap-3 text-white">
                <Clock className="w-5 h-5" />
                <span className="font-medium">{activeEvent?.title || `${activeDuration} Minute Meeting`}</span>
              </div>
              <p className="text-sm text-white/60 mt-3">
                {activeEvent?.description || 'Web conferencing details provided upon confirmation.'}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Right Column: Calendar / Form / Success */}
        <motion.div 
          className="lg:w-2/3 bg-black border border-white/10 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md"
          variants={fadeInUp} initial="hidden" animate="visible" viewport={defaultViewport}
        >
          <AnimatePresence mode="wait">
            {isSuccess ? (
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-12 flex flex-col items-center text-center justify-center h-full min-h-[500px]"
              >
                <div className="w-20 h-20 rounded-full bg-success/15 border border-success/30 flex items-center justify-center mb-6">
                  <CheckCircle2 className="w-10 h-10 text-success" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-4">{proposedTimes ? "Request Sent!" : "You're booked!"}</h2>
                <p className="text-lg text-white/70 mb-8 max-w-md">
                  {proposedTimes 
                    ? "We've sent your custom time request to the freelancer. They will review it and get back to you soon."
                    : "A calendar invitation has been sent to your email address with the meeting link."
                  }
                </p>
                {!proposedTimes && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-left w-full max-w-md mb-8">
                    <div className="flex items-center gap-4 mb-4">
                      <CalendarIcon className="w-5 h-5 text-white/50" />
                      <div>
                        <div className="text-sm text-white/50">Date & Time</div>
                        <div className="text-white font-medium">{selectedSlot ? format(parseISO(selectedSlot), 'EEEE, MMMM d, yyyy') : ''}</div>
                        <div className="text-white font-medium">
                          {selectedSlot ? format(parseISO(selectedSlot), 'h:mm a') : ''} ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Globe className="w-5 h-5 text-white/50" />
                      <div>
                        <div className="text-sm text-white/50">Location</div>
                        <div className="text-white font-medium">Web Conferencing</div>
                      </div>
                    </div>
                  </div>
                )}
                <Button onClick={() => navigate('/')} variant="outline">Back to Home</Button>
              </motion.div>
            ) : isNotAvailable ? (
              <motion.div 
                key="unavailable"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-12 flex flex-col items-center text-center justify-center h-full min-h-[500px]"
              >
                <CalendarIcon className="w-16 h-16 text-white/10 mb-6" />
                <h2 className="text-2xl font-bold text-white mb-4">Currently Unavailable</h2>
                <p className="text-white/60 mb-8 max-w-sm">
                  {profile.full_name || username} is not currently accepting new bookings through this calendar.
                </p>
                <div className="bg-white/5 border border-white/10 rounded-xl p-6 w-full max-w-md text-left">
                  <h3 className="text-sm font-semibold text-white mb-4">Send a custom request?</h3>
                  <p className="text-xs text-white/50 mb-6">
                    You can still propose a time or send a message, and they may get back to you if their schedule opens up.
                  </p>
                  <Button onClick={() => setIsCustomModalOpen(true)} className="w-full">
                    Request Custom Time
                  </Button>
                </div>
              </motion.div>
            ) : showEventPicker ? (
              <motion.div
                key="event-picker"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-8 lg:p-12"
              >
                <h2 className="text-2xl font-bold text-white mb-2">Select a Meeting Type</h2>
                <p className="text-white/60 mb-8 text-sm">Choose the type of meeting you'd like to schedule.</p>
                <div className="grid grid-cols-1 gap-3">
                  {eventTypes.map((et) => (
                    <button
                      key={et.id || et.slug}
                      onClick={() => navigate(`/book/${username}/${et.slug}`)}
                      className="relative bg-white/5 border border-white/10 hover:border-white/30 rounded-xl p-5 text-left transition-all group"
                    >
                      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{ backgroundColor: et.color || '#ffffff' }} />
                      <div className="flex items-center justify-between">
                        <h3 className="text-white font-medium">{et.title}</h3>
                        <div className="flex items-center gap-1.5 text-sm text-white/50">
                          <Clock className="w-4 h-4" />
                          {et.duration_minutes} min
                        </div>
                      </div>
                      {et.description && (
                        <p className="text-sm text-white/40 mt-2">{et.description}</p>
                      )}
                      <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-hover:text-white/60 transition-colors" />
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : selectedSlot ? (
              <motion.div 
                key="form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-8 lg:p-12"
              >
                <button onClick={() => setSelectedSlot(null)} className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors mb-8">
                  <ArrowLeft className="w-4 h-4" /> Back to times
                </button>
                
                <h2 className="text-2xl font-bold text-white mb-2">Enter Details</h2>
                <p className="text-white/60 mb-8 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> {format(parseISO(selectedSlot), 'EEEE, MMMM d, yyyy @ h:mm a')}
                </p>

                <form onSubmit={(e) => { e.preventDefault(); createBooking.mutate(); }} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Name *</label>
                    <input 
                      type="text" 
                      required 
                      value={guestName}
                      onChange={e => setGuestName(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                      placeholder="Jane Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Email *</label>
                    <input 
                      type="email" 
                      required 
                      value={guestEmail}
                      onChange={e => setGuestEmail(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                      placeholder="jane@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Please share anything that will help prepare for our meeting.</label>
                    <textarea 
                      value={guestNotes}
                      onChange={e => setGuestNotes(e.target.value)}
                      rows={4}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all resize-none"
                    />
                  </div>
                  
                  <div className="pt-4 flex gap-4">
                    <Button type="submit" loading={createBooking.isPending} className="flex-1 py-4">
                      Schedule Event
                    </Button>
                  </div>
                </form>
              </motion.div>
            ) : (
              <motion.div 
                key="calendar"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex flex-col lg:flex-row h-full"
              >
                {/* Calendar View */}
                <div className={`p-8 lg:p-12 ${selectedDate ? 'lg:w-1/2 lg:border-r border-white/10' : 'w-full'}`}>
                  <h2 className="text-2xl font-bold text-white mb-8">Select a Date & Time</h2>
                  
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-lg font-medium text-white">{format(currentMonth, 'MMMM yyyy')}</h3>
                    <div className="flex gap-2">
                      <button onClick={handlePrevMonth} className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/70 hover:text-white">
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button onClick={handleNextMonth} className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/70 hover:text-white">
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-y-4 text-center mb-4">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <div key={day} className="text-xs font-semibold text-white/50 tracking-wider uppercase">{day}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-2">
                    {calendarDays.map((day, idx) => {
                      if (!day) return <div key={`empty-${idx}`} />;
                      
                      const isPast = isBefore(day, startOfDay(new Date()));
                      const isSelected = selectedDate && isSameDay(day, selectedDate);
                      const isCurrentMonthDay = isSameMonth(day, currentMonth);

                      return (
                        <button
                          key={day.toISOString()}
                          disabled={isPast || !isCurrentMonthDay}
                          onClick={() => setSelectedDate(day)}
                          className={`
                            relative w-full aspect-square flex items-center justify-center rounded-full text-sm font-medium transition-all
                            ${isPast || !isCurrentMonthDay ? 'text-white/20 cursor-not-allowed' : 'hover:bg-white/10 text-white'}
                            ${isSelected ? 'bg-white text-black hover:bg-white/90 font-bold' : ''}
                            ${isToday(day) && !isSelected ? 'border border-white/30 text-white' : ''}
                          `}
                        >
                          {format(day, 'd')}
                          {isSelected && <div className="absolute -bottom-1 w-1 h-1 bg-white rounded-full" />}
                        </button>
                      );
                    })}
                  </div>
                  
                  <div className="mt-8 pt-8 border-t border-white/10 flex flex-col items-center">
                    <div className="flex items-center gap-2 text-xs text-white/40 mb-6 bg-white/[0.03] px-3 py-1.5 rounded-full border border-white/5">
                      <Globe className="w-3.5 h-3.5" />
                      <span>Slots shown in <strong>{Intl.DateTimeFormat().resolvedOptions().timeZone}</strong></span>
                    </div>
                    <p className="text-sm text-white/50 mb-4">Don't see a time that works for you?</p>
                    <Button variant="outline" onClick={() => setIsCustomModalOpen(true)} className="w-full">
                      Request a Custom Time
                    </Button>
                  </div>
                </div>

                {/* Slots View */}
                {selectedDate && (
                  <div className="p-8 lg:p-12 lg:w-1/2 bg-white/[0.02]">
                    <p className="text-sm font-medium text-white/70 mb-6 flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4" />
                      {format(selectedDate, 'EEEE, MMMM d')}
                    </p>
                    
                    {isLoadingSlots ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-white/50" />
                      </div>
                    ) : slots.length > 0 ? (
                      <div className="flex flex-col gap-3 h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {slots.map(slot => (
                          <button
                            key={slot}
                            onClick={() => setSelectedSlot(slot)}
                            className="py-3 px-4 rounded-xl border border-white/20 text-white font-medium hover:border-white hover:bg-white/5 transition-all text-center"
                          >
                            {format(parseISO(slot), 'h:mm a')}
                          </button>
                        ))}
                      </div>
                    ) : slotData?.is_closed ? (
                      <div className="text-center py-12 flex flex-col items-center">
                        <div className="w-16 h-16 rounded-full bg-danger/10 border border-danger/25 flex items-center justify-center mb-4">
                          <Clock className="w-8 h-8 text-danger" />
                        </div>
                        <p className="text-white font-medium mb-2">Schedule Closed</p>
                        <p className="text-sm text-white/40 max-w-[200px]">
                          Working hours for this day have ended. Please select a future date.
                        </p>
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <p className="text-white/50 mb-2">No slots available on this day.</p>
                        <p className="text-sm text-white/30">Try selecting another date or a different duration.</p>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>

      <Modal
        open={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        title="Request Custom Time"
      >
        <p className="text-sm text-white/70 mb-6">Propose a few times that work better for you, and we'll try our best to accommodate.</p>
        <form onSubmit={(e) => { e.preventDefault(); createCustomBooking.mutate(); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">Name *</label>
            <input 
              type="text" 
              required 
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-2">Email *</label>
            <input 
              type="email" 
              required 
              value={guestEmail}
              onChange={e => setGuestEmail(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
              placeholder="jane@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-2">Proposed Times (incl. timezone) *</label>
            <textarea 
              required
              value={proposedTimes}
              onChange={e => setProposedTimes(e.target.value)}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all resize-none"
              placeholder="e.g. Next Tuesday after 3 PM EST, or Wednesday morning"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-2">Any other notes?</label>
            <textarea 
              value={guestNotes}
              onChange={e => setGuestNotes(e.target.value)}
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all resize-none"
            />
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => setIsCustomModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createCustomBooking.isPending}>
              Send Request
            </Button>
          </div>
        </form>
      </Modal>

      <PublicFooter />
    </div>
  );
}

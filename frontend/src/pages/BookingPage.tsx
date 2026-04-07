/**
 * Public Booking Page — `/book/:username`
 *
 * Resolves the user's booking URL and either redirects or shows a branded
 * interstitial with fallback contact info. Matches the monochrome design
 * system used across Cold Scout public pages.
 */
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Calendar, ArrowLeft, ExternalLink, Mail, Phone, Loader2, User,
} from 'lucide-react';
import { getPublicProfile } from '../lib/api';
import { useSEO } from '../hooks/useSEO';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import { fadeInUp, staggerContainer, staggerItem, scaleIn, defaultViewport } from '../lib/motion';

export default function BookingPage() {
  const { username } = useParams<{ username: string }>();

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['public-profile', username],
    queryFn: () => getPublicProfile(username!),
    enabled: !!username,
    retry: false,
  });

  const displayName = profile?.full_name || username || 'User';
  const bookingUrl = profile?.freelancer?.booking_url;
  const photoUrl = profile?.profile_photo_url || profile?.avatar_url;

  useSEO({
    title: `Book a Meeting with ${displayName} | Cold Scout`,
    description: `Schedule a meeting with ${displayName} on Cold Scout — AI-powered lead generation platform.`,
    canonical: username ? `https://coldscout.colddsam.com/book/${username}` : undefined,
    index: !!profile,
  });

  return (
    <>
      <PublicNavbar />
      <main className="min-h-screen bg-gray-50 pt-16 pb-12">
        {isLoading && (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {isError && (
          <motion.div
            className="max-w-lg mx-auto px-6 py-24 text-center"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={scaleIn}>
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            </motion.div>
            <motion.h2 variants={staggerItem} className="text-xl font-bold text-black mb-2">
              Profile Not Found
            </motion.h2>
            <motion.p variants={staggerItem} className="text-sm text-gray-500 mb-6">
              The booking page you are looking for does not exist.
            </motion.p>
            <motion.div variants={staggerItem}>
              <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-black hover:underline">
                <ArrowLeft className="w-4 h-4" /> Back to Home
              </Link>
            </motion.div>
          </motion.div>
        )}

        {profile && (
          <motion.div
            className="max-w-lg mx-auto px-4 sm:px-6"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {/* Profile Card */}
            <motion.div
              className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
              variants={fadeInUp}
              initial="hidden"
              whileInView="visible"
              viewport={defaultViewport}
            >
              {/* Header */}
              <div className="bg-black px-6 py-8 text-center">
                <motion.div variants={scaleIn} className="mb-4">
                  <div className="w-20 h-20 mx-auto rounded-full border-3 border-white bg-white shadow-md overflow-hidden">
                    {photoUrl ? (
                      <img src={photoUrl} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-300">
                        <User className="w-10 h-10" />
                      </div>
                    )}
                  </div>
                </motion.div>
                <h1 className="text-xl font-bold text-white">{displayName}</h1>
                {profile.freelancer?.professional_title && (
                  <p className="text-sm text-gray-400 mt-1">{profile.freelancer.professional_title}</p>
                )}
              </div>

              {/* Body */}
              <div className="p-6">
                {bookingUrl ? (
                  /* Has booking URL — show interstitial with redirect button */
                  <motion.div variants={staggerItem} className="text-center space-y-5">
                    <div>
                      <Calendar className="w-10 h-10 text-black mx-auto mb-3" />
                      <h2 className="text-lg font-bold text-black">Book a Meeting</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Choose a time that works for you.
                      </p>
                    </div>

                    <motion.a
                      href={bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="inline-flex items-center gap-2 px-8 py-3 bg-black text-white rounded-full text-sm font-semibold shadow-md hover:bg-gray-800 transition-colors"
                    >
                      <Calendar className="w-4 h-4" />
                      Open Scheduling Page
                      <ExternalLink className="w-3.5 h-3.5" />
                    </motion.a>

                    <p className="text-xs text-gray-400">
                      You will be redirected to an external scheduling service.
                    </p>
                  </motion.div>
                ) : (
                  /* No booking URL — show contact fallback */
                  <motion.div variants={staggerItem} className="text-center space-y-5">
                    <div>
                      <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <h2 className="text-lg font-bold text-black">Get in Touch</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Reach out directly to schedule a conversation.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {profile.email && (
                        <a
                          href={`mailto:${profile.email}?subject=Meeting Request`}
                          className="flex items-center justify-center gap-2 px-6 py-3 bg-black text-white rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors"
                        >
                          <Mail className="w-4 h-4" />
                          Send Email
                        </a>
                      )}
                      {profile.phone && (
                        <a
                          href={`tel:${profile.phone}`}
                          className="flex items-center justify-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-full text-sm font-semibold hover:bg-gray-50 hover:border-gray-400 transition-colors"
                        >
                          <Phone className="w-4 h-4" />
                          {profile.phone}
                        </a>
                      )}
                      {!profile.email && !profile.phone && (
                        <p className="text-sm text-gray-400">
                          No contact information available. Visit their{' '}
                          <Link to={`/u/${username}`} className="text-black underline hover:no-underline">
                            profile
                          </Link>{' '}
                          for more details.
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Profile link */}
                <div className="mt-6 pt-5 border-t border-gray-100 text-center">
                  <Link
                    to={`/u/${username}`}
                    className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-black transition-colors"
                  >
                    View full profile <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </main>
      <PublicFooter />
    </>
  );
}

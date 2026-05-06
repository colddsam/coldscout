/**
 * Public Navigation Bar.
 *
 * Sticky pill navbar with smooth scroll-aware width transitions, animated
 * active-link indicator, hover micro-interactions, and a slide-in mobile menu.
 */
import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Heart, Menu, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import Logo from '../ui/Logo';

export default function PublicNavbar() {
  const { isAuthenticated, user, userRole } = useAuth();
  const effectiveRole = user?.role || userRole;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const { scrollY } = useScroll();

  // Smoothly interpolate visual properties from scroll. ``navTop`` is
  // composed with the device safe-area inset so the floating nav clears
  // the status bar / notch on Android 15+ edge-to-edge devices and iOS
  // PWAs (where the WebView extends behind the system bar).
  const navWidth = useTransform(scrollY, [0, 80], ['100%', '92%']);
  const navTopBase = useTransform(scrollY, [0, 80], [12, 16]);
  const navTop = useTransform(navTopBase, (v) => `calc(env(safe-area-inset-top) + ${v}px)`);
  const navRadius = useTransform(scrollY, [0, 80], [20, 999]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : 'unset';
  }, [isMenuOpen]);

  const handleLinkClick = () => setIsMenuOpen(false);

  const navLinks = [
    { name: 'Home', href: '/' },
    { name: 'Scanner', href: '/scanner' },
    { name: 'Pricing', href: '/pricing' },
    { name: 'Docs', href: '/docs' },
    { name: 'Support', href: '/support' },
  ];

  const dashboardPath = isAuthenticated
    ? effectiveRole === 'client'
      ? '/welcome'
      : '/overview'
    : '/login';

  const dashboardLabel = isAuthenticated
    ? effectiveRole === 'client'
      ? 'Welcome Page'
      : 'Dashboard'
    : 'Get Started';

  return (
    <motion.nav
      className="fixed left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{ top: navTop }}
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <motion.div
        className="pointer-events-auto relative z-50"
        style={{
          width: navWidth,
          maxWidth: '1100px',
          borderRadius: navRadius,
        }}
      >
        {/* Animated glass surface */}
        <motion.div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ borderRadius: 'inherit' }}
          animate={{
            backgroundColor: scrolled
              ? 'rgba(0,0,0,0.78)'
              : 'rgba(0,0,0,0.35)',
            backdropFilter: scrolled ? 'blur(18px)' : 'blur(8px)',
            boxShadow: scrolled
              ? '0 8px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)'
              : '0 2px 10px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />

        {/* Subtle moving sheen */}
        <motion.div
          aria-hidden
          className="absolute inset-0 -z-10 overflow-hidden"
          style={{ borderRadius: 'inherit' }}
        >
          <motion.div
            className="absolute top-0 -left-1/3 w-1/3 h-full"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)',
            }}
            animate={{ x: ['0%', '500%'] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'linear', delay: 2 }}
          />
        </motion.div>

        <div className="flex items-center justify-between h-14 px-4 sm:px-6">
          <Link
            to="/"
            className="flex items-center"
            aria-label="Cold Scout Home"
            onClick={handleLinkClick}
          >
            <Logo size="md" />
          </Link>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-1 lg:gap-2">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.href;
              return (
                <Link
                  key={link.name}
                  to={link.href}
                  className="relative px-3 py-1.5 text-xs md:text-sm tracking-wide group"
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-active-pill"
                      className="absolute inset-0 rounded-full bg-white/10 border border-white/10"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span
                    className={`relative z-10 transition-colors duration-200 ${
                      isActive
                        ? 'text-white font-medium'
                        : 'text-[#B0B0B0] group-hover:text-white'
                    }`}
                  >
                    {link.name}
                  </span>
                </Link>
              );
            })}

            <a
              href="https://github.com/sponsors/colddsam"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 px-3 py-1.5 text-xs text-[#B0B0B0] hover:text-white transition-colors flex items-center gap-1.5 group"
            >
              <motion.span
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Heart className="w-3.5 h-3.5 fill-white/80 text-white/80 group-hover:fill-white group-hover:text-white" />
              </motion.span>
              Sponsor
            </a>

            <Link to={dashboardPath} className="ml-2">
              <motion.span
                className="inline-flex items-center gap-2 bg-white text-black px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium relative overflow-hidden"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <span className="relative z-10">{dashboardLabel}</span>
                <ArrowRight className="w-3.5 h-3.5 relative z-10" />
              </motion.span>
            </Link>
          </div>

          {/* Mobile Toggle */}
          <motion.button
            className="md:hidden p-2 text-[#F0F0F0]/80 hover:text-white transition-colors"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle Menu"
            whileTap={{ scale: 0.9 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={isMenuOpen ? 'close' : 'open'}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="block"
              >
                {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>
      </motion.div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            className="md:hidden fixed inset-0 top-0 bg-black/95 backdrop-blur-xl z-40 pointer-events-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="flex flex-col p-6 pt-[calc(env(safe-area-inset-top)+6rem)] gap-2 h-full pb-safe">
              {navLinks.map((link, i) => (
                <motion.div
                  key={link.name}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ delay: i * 0.06, duration: 0.32, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <Link
                    to={link.href}
                    className="text-lg font-medium text-white border-b border-white/[0.08] py-4 flex items-center justify-between group w-full"
                    onClick={handleLinkClick}
                  >
                    {link.name}
                    <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white group-hover:translate-x-1 transition-all" />
                  </Link>
                </motion.div>
              ))}
              <motion.a
                href="https://github.com/sponsors/colddsam"
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg font-medium text-white border-b border-white/[0.08] py-4 flex items-center gap-2"
                onClick={handleLinkClick}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: navLinks.length * 0.06, duration: 0.32 }}
              >
                <Heart className="w-5 h-5 fill-white text-white" /> Sponsor
              </motion.a>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (navLinks.length + 1) * 0.06, duration: 0.32 }}
                className="mt-auto"
              >
                <Link
                  to={dashboardPath}
                  className="flex items-center justify-center gap-2 bg-white text-black px-6 py-4 rounded-2xl text-base font-medium hover:bg-gray-100 transition-colors"
                  onClick={handleLinkClick}
                >
                  {dashboardLabel}
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

/**
 * Public Navigation Bar.
 *
 * Scroll-aware navbar with glass-panel effect, animated hover underlines,
 * and a smooth mobile slide-in menu with staggered link reveals.
 */
import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Heart, Menu, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import Logo from '../ui/Logo';

export default function PublicNavbar() {
  const { isAuthenticated, user, userRole } = useAuth();
  const effectiveRole = user?.role || userRole;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const isHomePage = location.pathname === '/';

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : 'unset';
  }, [isMenuOpen]);

  const handleLinkClick = () => setIsMenuOpen(false);

  const navLinks = [
    { name: 'Features', href: isHomePage ? '#features' : '/#features' },
    { name: 'How it works', href: isHomePage ? '#workflow' : '/#workflow' },
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
      : 'Go to Dashboard'
    : 'Sign In';

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'glass-panel-strong shadow-subtle'
          : 'bg-transparent border-b border-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center"
          aria-label="Cold Scout Home"
          onClick={handleLinkClick}
        >
          <Logo size="md" />
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className={`relative text-sm transition-colors hover-underline ${
                location.pathname === link.href
                  ? 'text-black font-medium'
                  : 'text-secondary hover:text-black'
              }`}
            >
              {link.name}
            </a>
          ))}
          <a
            href="https://github.com/sponsors/colddsam"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-secondary hover:text-black transition-colors flex items-center gap-1"
          >
            <Heart className="w-3.5 h-3.5 fill-black text-black" /> Sponsor
          </a>
          <Link to={dashboardPath}>
            <motion.span
              className="inline-flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg text-sm font-medium"
              whileHover={{ scale: 1.02, backgroundColor: '#333' }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              {dashboardLabel}
              <ArrowRight className="w-4 h-4" />
            </motion.span>
          </Link>
        </div>

        {/* Mobile Toggle */}
        <motion.button
          className="md:hidden p-2 text-secondary hover:text-black transition-colors"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle Menu"
          whileTap={{ scale: 0.9 }}
        >
          {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </motion.button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            className="md:hidden fixed inset-0 top-16 bg-white z-40"
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className="flex flex-col p-6 gap-2 h-full bg-white">
              {navLinks.map((link, i) => (
                <motion.a
                  key={link.name}
                  href={link.href}
                  className="text-lg font-medium text-black border-b border-gray-100 py-4 flex items-center justify-between group"
                  onClick={handleLinkClick}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                >
                  {link.name}
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-black group-hover:translate-x-1 transition-all" />
                </motion.a>
              ))}
              <motion.a
                href="https://github.com/sponsors/colddsam"
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg font-medium text-black border-b border-gray-100 py-4 flex items-center gap-2"
                onClick={handleLinkClick}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: navLinks.length * 0.05, duration: 0.3 }}
              >
                <Heart className="w-5 h-5 fill-black text-black" /> Sponsor
              </motion.a>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (navLinks.length + 1) * 0.05, duration: 0.3 }}
                className="mt-auto"
              >
                <Link
                  to={dashboardPath}
                  className="flex items-center justify-center gap-2 bg-black text-white px-6 py-4 rounded-xl text-base font-medium hover:bg-gray-800 transition-colors"
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
    </nav>
  );
}

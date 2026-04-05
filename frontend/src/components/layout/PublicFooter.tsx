/**
 * Public Footer Component.
 *
 * Scroll-triggered reveal with hover effects on social icons
 * and consistent link styling.
 */
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, Github, Mail, ArrowUpRight, Linkedin } from 'lucide-react';
import Logo from '../ui/Logo';
import ScrollReveal from '../ui/ScrollReveal';

export default function PublicFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className="border-t border-gray-200 py-16 bg-white relative z-10"
      role="contentinfo"
      aria-label="Site footer"
      itemScope
      itemType="https://schema.org/WPFooter"
    >
      <div className="max-w-6xl mx-auto px-6">
        {/* CTA Section */}
        <ScrollReveal>
          <div className="relative mb-16 rounded-2xl bg-black text-white p-8 md:p-12 overflow-hidden">
            <div className="absolute inset-0 bg-grid-dense opacity-10" />
            <div className="relative z-10 text-center max-w-2xl mx-auto">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
                Ready to automate your outreach?
              </h2>
              <p className="text-gray-400 text-sm mb-6">
                Join thousands of freelancers using AI to discover and engage qualified leads.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 bg-white text-black px-6 py-3 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
              >
                Get Started Free <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </ScrollReveal>

        <div className="flex flex-col md:flex-row items-start justify-between gap-12 mb-12">
          {/* Brand */}
          <ScrollReveal delay={0.1}>
            <div
              className="flex flex-col gap-4 max-w-sm"
              itemScope
              itemType="https://schema.org/Organization"
            >
              <meta itemProp="name" content="Cold Scout" />
              <meta itemProp="url" content="https://coldscout.colddsam.com/" />
              <Link to="/" className="flex items-center" aria-label="Cold Scout Home" itemProp="url">
                <Logo size="sm" />
              </Link>
              <p className="text-sm text-secondary leading-relaxed" itemProp="description">
                AI-powered lead generation platform that discovers, qualifies, and engages local business leads at scale.
              </p>
              <div className="flex items-center gap-3">
                {[
                  {
                    href: 'https://github.com/colddsam/coldscout',
                    label: 'Cold Scout on GitHub',
                    icon: <Github className="w-4 h-4" />,
                    itemProp: 'sameAs',
                  },
                  {
                    href: 'mailto:admin@colddsam.com',
                    label: 'Email Cold Scout support',
                    icon: <Mail className="w-4 h-4" />,
                    itemProp: 'email',
                  },
                  {
                    href: 'https://www.linkedin.com/company/coldscout',
                    label: 'Cold Scout on LinkedIn',
                    icon: <Linkedin className="w-4 h-4" />,
                    itemProp: 'sameAs',
                  },
                ].map((item) => (
                  <motion.a
                    key={item.label}
                    href={item.href}
                    target={item.href.startsWith('http') ? '_blank' : undefined}
                    rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    aria-label={item.label}
                    className="text-secondary hover:text-black transition-colors p-2 rounded-lg hover:bg-gray-100"
                    itemProp={item.itemProp}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    {item.icon}
                  </motion.a>
                ))}
              </div>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-12 md:gap-24">
            {/* Product */}
            <ScrollReveal delay={0.15}>
              <div className="flex flex-col gap-4">
                <h2 className="text-[10px] font-bold text-black uppercase tracking-[0.15em]">Product</h2>
                <nav className="flex flex-col gap-2.5" aria-label="Product navigation">
                  {[
                    { href: '/#features', label: 'Features' },
                    { href: '/#workflow', label: 'How it works' },
                    { href: '/#faq', label: 'FAQ' },
                    { to: '/pricing', label: 'Pricing' },
                    { to: '/docs', label: 'Documentation' },
                    { to: '/support', label: 'Support' },
                  ].map((item) =>
                    'to' in item ? (
                      <Link key={item.label} to={item.to!} className="text-sm text-secondary hover:text-black transition-colors hover-underline inline-block">
                        {item.label}
                      </Link>
                    ) : (
                      <a key={item.label} href={item.href} className="text-sm text-secondary hover:text-black transition-colors hover-underline inline-block">
                        {item.label}
                      </a>
                    ),
                  )}
                </nav>
              </div>
            </ScrollReveal>

            {/* Legal */}
            <ScrollReveal delay={0.2}>
              <div className="flex flex-col gap-4">
                <h2 className="text-[10px] font-bold text-black uppercase tracking-[0.15em]">Legal</h2>
                <nav className="flex flex-col gap-2.5" aria-label="Legal navigation">
                  {[
                    { to: '/privacy', label: 'Privacy Policy' },
                    { to: '/terms', label: 'Terms of Service' },
                    { to: '/refund-policy', label: 'Refund Policy' },
                    { to: '/delete-data', label: 'Data Deletion' },
                  ].map((item) => (
                    <Link key={item.label} to={item.to} className="text-sm text-secondary hover:text-black transition-colors hover-underline inline-block">
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </div>
            </ScrollReveal>

            {/* Community */}
            <ScrollReveal delay={0.25}>
              <div className="flex flex-col gap-4">
                <h2 className="text-[10px] font-bold text-black uppercase tracking-[0.15em]">Community</h2>
                <nav className="flex flex-col gap-2.5" aria-label="Community navigation">
                  <a href="https://github.com/colddsam/coldscout" target="_blank" rel="noopener noreferrer" className="text-sm text-secondary hover:text-black transition-colors hover-underline inline-block">
                    GitHub Repository
                  </a>
                  <a href="https://github.com/colddsam/coldscout/issues" target="_blank" rel="noopener noreferrer" className="text-sm text-secondary hover:text-black transition-colors hover-underline inline-block">
                    Report an Issue
                  </a>
                  <a href="https://www.linkedin.com/company/coldscout" target="_blank" rel="noopener noreferrer" className="text-sm text-secondary hover:text-black transition-colors hover-underline inline-block">
                    LinkedIn Page
                  </a>
                  <a
                    href="https://github.com/sponsors/colddsam"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-secondary hover:text-black transition-colors flex items-center gap-1 hover-underline inline-block"
                  >
                    <Heart className="w-3 h-3 fill-black text-black" /> Sponsor
                  </a>
                </nav>
              </div>
            </ScrollReveal>
          </div>
        </div>

        <div className="pt-8 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-subtle">
            &copy; {currentYear} Cold Scout. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a href="/sitemap.xml" className="text-[10px] text-subtle hover:text-black transition-colors uppercase tracking-[0.15em] font-medium" aria-label="XML Sitemap">
              Sitemap
            </a>
            <a href="/robots.txt" className="text-[10px] text-subtle hover:text-black transition-colors uppercase tracking-[0.15em] font-medium" aria-label="Robots.txt">
              Robots
            </a>
            <span className="text-[10px] text-subtle uppercase tracking-[0.15em] font-medium">Built with precision</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

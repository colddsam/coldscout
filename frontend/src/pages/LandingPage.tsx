/**
 * Public Landing Page.
 *
 * Cinematic dark-mode SaaS marketing page with scroll-triggered
 * reveals, animated counters, and monochromatic design.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Zap, Mail, BarChart2, ArrowRight, ChevronRight,
  Target, Shield,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useSEO } from '../hooks/useSEO';
import JsonLd from '../components/seo/JsonLd';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import ScrollReveal from '../components/ui/ScrollReveal';
import AnimatedCounter from '../components/ui/AnimatedCounter';
import WordsPullUp from '../components/animations/WordsPullUp';
import StaggeredCard from '../components/animations/StaggeredCard';
import FadeUpBlock from '../components/animations/FadeUpBlock';
import AnimatedLetter from '../components/animations/AnimatedLetter';
import AnimatedBackground from '../components/ui/AnimatedBackground';
import Orbital3D from '../components/ui/Orbital3D';
import { staggerContainer, staggerItem } from '../lib/motion';

/* ── Hero Section ── */

function HeroSection() {
  const { isAuthenticated } = useAuth();

  return (
    <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden bg-black">
      {/* Layered animated background: grid drift + orbs + floating SVG shapes + constellation */}
      <AnimatedBackground variant="hero" />

      {/* Subtle noise overlay (kept on top for grain texture) */}
      <div className="absolute inset-0 noise-overlay opacity-[0.2] pointer-events-none" aria-hidden="true" />

      {/* Pseudo-3D orbital halo behind heading */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0 opacity-60 pointer-events-none" aria-hidden>
        <Orbital3D size={520} />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 border border-white/10 rounded-full px-4 py-1.5 mb-10 bg-white/[0.03]"
        >
          <span className="relative flex items-center justify-center">
            <span className="inline-block w-2 h-2 rounded-full bg-white" />
            <span className="absolute inline-block w-2 h-2 rounded-full bg-white animate-ping" />
          </span>
          <span className="text-xs font-medium text-[#B0B0B0]">AI-Powered Lead Generation</span>
        </motion.div>

        {/* Giant heading */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.92] mb-2 text-balance">
          <WordsPullUp text="Discover leads." className="text-white" />
        </h1>
        <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.92] mb-2 text-balance">
          <motion.span
            className="text-gradient"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            Qualify instantly.
          </motion.span>
        </h1>
        <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.92] mb-8 text-balance">
          <WordsPullUp text="Close faster." className="text-white" delay={0.7} />
        </h1>

        <motion.p
          className="text-base md:text-lg text-[#B0B0B0] max-w-2xl mx-auto mb-10"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.5 }}
        >
          Cold Scout uses AI to discover, enrich, and engage local business leads —
          automating your entire outreach pipeline from search to inbox.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.5 }}
        >
          <Link to={isAuthenticated ? '/overview' : '/login'}>
            <motion.span
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-white text-black px-6 py-3.5 rounded-full text-sm font-semibold group shadow-[0_4px_20px_rgba(255,255,255,0.1)]"
              whileHover={{ scale: 1.03, boxShadow: '0 0 30px rgba(255,255,255,0.1)' }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              {isAuthenticated ? 'Go to Dashboard' : 'Get Started'}
              <span className="w-6 h-6 bg-black rounded-full flex items-center justify-center">
                <ArrowRight className="w-3.5 h-3.5 text-white group-hover:translate-x-0.5 transition-transform" />
              </span>
            </motion.span>
          </Link>
          <a href="#features">
            <motion.span
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-white/15 text-white/70 px-6 py-3.5 rounded-full text-sm font-medium hover:text-white hover:border-white/30 transition-all duration-300"
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              Learn More
            </motion.span>
          </a>
        </motion.div>

        {/* Stats row */}
        <motion.div
          className="grid grid-cols-1 sm:flex items-center justify-center gap-8 md:gap-16 mt-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.3, duration: 0.5 }}
        >
          {[
            { value: 10000, suffix: '+', label: 'Leads Generated' },
            { value: 95, suffix: '%', label: 'Email Accuracy' },
            { value: 3, suffix: 'x', label: 'Faster Outreach' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <AnimatedCounter
                value={stat.value}
                suffix={stat.suffix}
                className="text-2xl md:text-3xl font-bold tracking-tighter text-white font-mono"
                duration={1.5}
              />
              <p className="text-[10px] uppercase tracking-[0.15em] text-[#8A8A8A] mt-1 font-semibold">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ── Features Section ── */

function FeaturesSection() {
  const features = [
    { icon: Search, title: 'Smart Discovery', description: 'AI-powered Google Maps scraping to find and qualify local businesses based on your ideal customer profile.' },
    { icon: Zap, title: 'Instant Enrichment', description: 'Automatically enrich leads with contact info, social profiles, tech stack, and business intelligence.' },
    { icon: Mail, title: 'Personalized Outreach', description: 'AI-generated email campaigns with personalized copy that resonates with each prospect.' },
    { icon: BarChart2, title: 'Pipeline Analytics', description: 'Track every lead through your pipeline with real-time analytics and conversion insights.' },
    { icon: Target, title: 'Intent Scoring', description: 'Machine learning models score leads by purchase intent, ensuring you focus on the hottest prospects.' },
    { icon: Shield, title: 'Compliance Built-in', description: 'GDPR and CAN-SPAM compliant by design. Rate limiting and ethical scraping practices.' },
  ];

  return (
    <section id="features" className="py-24 md:py-32 bg-black relative overflow-hidden">
      <AnimatedBackground variant="subtle" showShapes={true} showConstellation={false} />
      <div className="relative max-w-6xl mx-auto px-6">
        <ScrollReveal className="text-center mb-16">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#8A8A8A] font-semibold mb-3">Features</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-white">
            Everything you need to scale outreach
          </h2>
        </ScrollReveal>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          {features.map((feature, i) => (
            <StaggeredCard key={feature.title} index={i} className="h-full">
              <motion.div
                className="group p-6 rounded-2xl border border-white/[0.08] bg-surface-2 hover:border-white/15 transition-all duration-300 h-full"
                whileHover={{ y: -4 }}
              >
                <motion.div
                  className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 group-hover:bg-white group-hover:border-white transition-colors duration-300"
                  whileHover={{ rotate: 5 }}
                >
                  <feature.icon className="w-5 h-5 text-[#B0B0B0] group-hover:text-black transition-colors duration-300" />
                </motion.div>
                <h3 className="text-base font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-[#B0B0B0] leading-relaxed">{feature.description}</p>
              </motion.div>
            </StaggeredCard>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ── Workflow Section ── */

function WorkflowSection() {
  const steps = [
    { num: '01', title: 'Configure', desc: 'Set your target industry, location, and ideal customer criteria.' },
    { num: '02', title: 'Discover', desc: 'AI scrapes Google Maps and enriches leads with business data.' },
    { num: '03', title: 'Score & Qualify', desc: 'ML models rank leads by intent and readiness to buy.' },
    { num: '04', title: 'Engage', desc: 'Automated personalized email campaigns reach your best prospects.' },
  ];

  return (
    <section id="workflow" className="py-24 md:py-32 bg-surface-1 relative overflow-hidden">
      <AnimatedBackground variant="subtle" showShapes={false} />
      <div className="relative max-w-6xl mx-auto px-6">
        <ScrollReveal className="text-center mb-16">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#8A8A8A] font-semibold mb-3">How it works</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-white">
            Four steps to qualified leads
          </h2>
        </ScrollReveal>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          {steps.map((step, i) => (
            <motion.div key={step.num} className="relative" variants={staggerItem}>
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-full w-6 z-10">
                  <ChevronRight className="w-5 h-5 text-white/15" />
                </div>
              )}
              <motion.div
                className="bg-surface-2 rounded-2xl border border-white/[0.08] p-6 h-full hover:border-white/15 transition-all duration-300"
                whileHover={{ y: -4, boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 4px 20px rgba(0,0,0,0.4)' }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              >
                <span className="text-3xl font-bold text-white/10 tracking-tighter font-mono">{step.num}</span>
                <h3 className="text-base font-semibold text-white mt-3 mb-2">{step.title}</h3>
                <p className="text-sm text-[#B0B0B0] leading-relaxed">{step.desc}</p>
              </motion.div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ── Metrics Section ── */

function MetricsSection() {
  return (
    <section className="py-24 md:py-32 bg-black relative">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <FadeUpBlock>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#8A8A8A] font-semibold mb-6">Results</p>
        </FadeUpBlock>
        <AnimatedLetter
          text="Cold Scout helps teams discover 10x more qualified leads, cut prospecting time by 80%, and increase reply rates by 3x — all with zero manual data entry."
          className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight text-white/80 leading-snug"
        />
      </div>
    </section>
  );
}

/* ── Pricing Section ── */

function PricingSection() {
  const plans = [
    {
      name: 'Open Source',
      price: 'Free',
      period: '',
      desc: 'Download & self-host with your own API keys.',
      features: ['Full platform access', 'All 5 pipeline stages', 'Unlimited leads (your keys)', 'Web dashboard included'],
      cta: 'Download Free',
      href: 'https://github.com/colddsam/coldscout/releases',
      external: true,
      featured: false,
    },
    {
      name: 'Pro',
      price: '₹100',
      period: '/month',
      desc: 'Hosted API & MCP Server — no deployment.',
      features: ['No deployment needed', 'MCP server access', '2,000 leads/month', 'AI qualification + emails', 'Email support (48h)'],
      cta: 'Get Started',
      href: '/login',
      external: false,
      featured: true,
    },
    {
      name: 'Enterprise',
      price: '₹2,000',
      period: '/month',
      desc: 'For agencies and freelancing firms.',
      features: ['Unlimited leads', 'Dedicated API instance', 'Custom ICP models', 'White-label templates', 'Priority support (4h)'],
      cta: 'Contact Sales',
      href: 'mailto:colddsam@gmail.com?subject=Cold%20Scout%20Enterprise%20Inquiry',
      external: true,
      featured: false,
    },
  ];

  return (
    <section id="pricing" className="py-24 md:py-32 bg-surface-1 relative overflow-hidden">
      <AnimatedBackground variant="subtle" showShapes={true} />
      <div className="relative max-w-6xl mx-auto px-6">
        <ScrollReveal className="text-center mb-16">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#8A8A8A] font-semibold mb-3">Pricing</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-white">
            Simple, transparent pricing
          </h2>
          <p className="text-[#B0B0B0] mt-3 max-w-md mx-auto">Open source forever. Pay only for our hosted infrastructure.</p>
        </ScrollReveal>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          {plans.map((plan, i) => (
            <StaggeredCard key={plan.name} index={i}>
              <motion.div
                whileHover={{ y: -4 }}
                className={`rounded-2xl border p-8 transition-all duration-300 h-full ${
                  plan.featured
                    ? 'border-white/25 bg-surface-2 shadow-[0_0_30px_rgba(255,255,255,0.03)]'
                    : 'border-white/[0.08] bg-surface-2 hover:border-white/15'
                }`}
              >
                <div className="flex items-center gap-2 mb-4">
                  <p className={`text-[10px] uppercase tracking-[0.15em] font-semibold ${plan.featured ? 'text-white' : 'text-[#8A8A8A]'}`}>{plan.name}</p>
                  {plan.featured && (
                    <span className="text-[9px] uppercase tracking-wider bg-white/10 text-white px-2 py-0.5 rounded-full font-medium">Popular</span>
                  )}
                </div>
                <div className="mb-4">
                  <span className="text-4xl font-bold tracking-tighter text-white">{plan.price}</span>
                  {plan.period && <span className="text-sm text-[#8A8A8A]">{plan.period}</span>}
                </div>
                <p className="text-sm mb-6 text-[#B0B0B0]">{plan.desc}</p>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-[#C0C0C0]">
                      <span className="w-1 h-1 rounded-full bg-white/40" />
                      {f}
                    </li>
                  ))}
                </ul>
                {plan.external ? (
                  <a
                    href={plan.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block text-center py-2.5 rounded-full text-sm font-medium transition-colors ${
                      plan.featured
                        ? 'bg-white text-black hover:bg-gray-200'
                        : 'border border-white/15 text-white hover:bg-white/10'
                    }`}
                  >
                    {plan.cta}
                  </a>
                ) : (
                  <Link
                    to={plan.href}
                    className="block text-center py-2.5 rounded-full text-sm font-medium bg-white text-black hover:bg-gray-200 transition-colors"
                  >
                    {plan.cta}
                  </Link>
                )}
              </motion.div>
            </StaggeredCard>
          ))}
        </motion.div>

        <ScrollReveal delay={0.3} className="text-center mt-8">
          <Link to="/pricing" className="inline-flex items-center gap-1.5 text-sm text-[#B0B0B0] hover:text-white transition-colors group">
            See full comparison & regional pricing
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ── FAQ Section ── */

function FaqSection() {
  const faqs = [
    { q: 'What is Cold Scout?', a: 'Cold Scout is an AI-powered lead generation platform that automatically discovers local businesses via Google Maps, qualifies them using Llama AI, and sends personalized cold email campaigns — automating your entire outreach pipeline.' },
    { q: 'How does Cold Scout find leads?', a: 'It uses the Google Maps Places API and intelligent web scraping to discover businesses matching your Ideal Customer Profile (ICP), then enriches each lead with contact info, social profiles, and tech stack details.' },
    { q: 'Is Cold Scout free?', a: 'Yes — fully open source under MIT license. Self-host for free with your own API keys. Managed Pro plan (₹100/mo) and Enterprise (₹2,000/mo) available for teams that prefer hosted infrastructure.' },
    { q: 'What AI models power Cold Scout?', a: 'Groq-powered Llama 3.3 70B for qualification and email generation, Llama 3.1 8B for faster tasks. This provides high-quality AI inference at extremely low cost.' },
    { q: 'Can AI agents use Cold Scout?', a: 'Yes. Cold Scout provides a Model Context Protocol (MCP) server so AI agents like Claude or GPT-4 can directly call lead generation endpoints. Included in Pro and Enterprise plans.' },
    { q: 'Is Cold Scout GDPR compliant?', a: 'Yes. Built for compliance — GDPR, CCPA, and CAN-SPAM. All emails include unsubscribe links, and the platform uses ethical scraping with rate limiting.' },
  ];

  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <section id="faq" className="py-24 md:py-32 bg-black relative">
      <div className="max-w-3xl mx-auto px-6">
        <ScrollReveal className="text-center mb-16">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#8A8A8A] font-semibold mb-3">FAQ</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-white">
            Frequently asked questions
          </h2>
        </ScrollReveal>

        <motion.div
          className="space-y-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          {faqs.map((faq, i) => (
            <motion.div
              key={i}
              variants={staggerItem}
              className="border border-white/[0.08] rounded-2xl overflow-hidden hover:border-white/15 transition-all duration-200 bg-surface-2"
            >
              <button
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] transition-colors text-left"
                aria-expanded={openIdx === i}
              >
                <span className="text-sm font-semibold text-white pr-4">{faq.q}</span>
                <motion.span
                  animate={{ rotate: openIdx === i ? 90 : 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <ChevronRight className="w-4 h-4 text-[#8A8A8A] flex-shrink-0" />
                </motion.span>
              </button>
              <AnimatePresence>
                {openIdx === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="px-5 pb-5 text-sm text-[#B0B0B0] leading-relaxed border-t border-white/[0.08] pt-4">
                      {faq.a}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ── Structured Data ── */

const LD_SOFTWARE = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': 'https://coldscout.colddsam.com/#software',
  name: 'Cold Scout',
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Lead Generation Software',
  operatingSystem: 'Web, SaaS',
  url: 'https://coldscout.colddsam.com/',
  downloadUrl: 'https://github.com/colddsam/coldscout/releases',
  description: 'AI-powered lead generation platform that automates outreach pipeline — from Google Maps discovery to personalized email campaigns.',
  softwareVersion: '1.0.0',
  featureList: [
    'AI Lead Discovery via Google Maps',
    'ML-based Lead Qualification and Intent Scoring',
    'Personalized Email Generation with Groq AI',
    'Automated Cold Outreach Pipeline',
    'Real-time Pipeline Analytics Dashboard',
    'GDPR and CAN-SPAM Compliant',
    'MCP Server for AI Agents',
    'Open Source Self-Hosting',
  ],
  screenshot: 'https://coldscout.colddsam.com/banner.png',
  offers: [
    { '@type': 'Offer', name: 'Open Source (Self-hosted)', price: '0', priceCurrency: 'INR', availability: 'https://schema.org/InStock', description: 'Full platform access, unlimited leads, self-hosted with your own API keys' },
    { '@type': 'Offer', name: 'Pro — Managed API', price: '100', priceCurrency: 'INR', priceSpecification: { '@type': 'RecurringChargeSpecification', billingDuration: 'P1M', price: '100', priceCurrency: 'INR' }, availability: 'https://schema.org/InStock', description: 'Hosted API and MCP Server, 2000 leads/month, no deployment needed' },
    { '@type': 'Offer', name: 'Enterprise', price: '2000', priceCurrency: 'INR', priceSpecification: { '@type': 'RecurringChargeSpecification', billingDuration: 'P1M', price: '2000', priceCurrency: 'INR' }, availability: 'https://schema.org/InStock', description: 'Unlimited leads, dedicated instance, custom ICP models, white-label' },
  ],
  creator: { '@id': 'https://coldscout.colddsam.com/#organization' },
};

const LD_HOW_TO = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How to Generate Qualified Leads with Cold Scout AI',
  description: 'Use Cold Scout to automatically discover, qualify, and engage local business leads in four steps.',
  step: [
    { '@type': 'HowToStep', position: 1, name: 'Configure Your Target', text: 'Set your target industry, location, and ideal customer criteria in the pipeline configuration.', url: 'https://coldscout.colddsam.com/docs#configuration' },
    { '@type': 'HowToStep', position: 2, name: 'AI Lead Discovery', text: 'Cold Scout AI scrapes Google Maps and enriches leads with business data, contact info, and social profiles.', url: 'https://coldscout.colddsam.com/docs#discovery' },
    { '@type': 'HowToStep', position: 3, name: 'Score and Qualify', text: 'Machine learning models rank leads by purchase intent and ICP fit, ensuring you focus on hot prospects.', url: 'https://coldscout.colddsam.com/docs#qualification' },
    { '@type': 'HowToStep', position: 4, name: 'Automated Personalized Outreach', text: 'AI-generated personalized email campaigns automatically reach your best prospects with tracked follow-ups.', url: 'https://coldscout.colddsam.com/docs#outreach' },
  ],
  totalTime: 'PT5M',
};

const LD_FAQ_HOME = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    { '@type': 'Question', name: 'What is Cold Scout?', acceptedAnswer: { '@type': 'Answer', text: 'Cold Scout is an AI-powered lead generation platform that automatically discovers local businesses via Google Maps, qualifies them using Llama AI models, and sends personalized cold email campaigns. It automates the entire outreach pipeline from search to inbox.' } },
    { '@type': 'Question', name: 'How does Cold Scout find leads?', acceptedAnswer: { '@type': 'Answer', text: 'Cold Scout uses the Google Maps Places API and intelligent web scraping to discover local businesses matching your Ideal Customer Profile (ICP). It then enriches each lead with website data, contact information, social profiles, and tech stack details.' } },
    { '@type': 'Question', name: 'Is Cold Scout free to use?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Cold Scout is fully open source under the MIT license. You can self-host the entire platform for free using your own API keys. We also offer a managed Pro plan at ₹100/month and Enterprise at ₹2,000/month for teams that prefer hosted infrastructure.' } },
    { '@type': 'Question', name: 'What AI does Cold Scout use for lead qualification?', acceptedAnswer: { '@type': 'Answer', text: 'Cold Scout uses Groq-powered Llama 3 models (Llama 3.3 70B and Llama 3.1 8B) for lead qualification, intent scoring, and personalized email generation. This provides fast, high-quality AI inference at low cost.' } },
    { '@type': 'Question', name: 'Can AI agents like Claude or GPT-4 use Cold Scout?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Cold Scout provides a Model Context Protocol (MCP) server that enables AI agents to directly call lead generation endpoints. Pro and Enterprise plans include MCP server access.' } },
    { '@type': 'Question', name: 'Is Cold Scout GDPR compliant?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Cold Scout is built with compliance in mind. It adheres to GDPR, CCPA, and CAN-SPAM regulations. All outreach emails include unsubscribe mechanisms, and the platform implements ethical scraping practices with rate limiting.' } },
  ],
};

/* ── Page Component ── */

export default function LandingPage() {
  useSEO({
    title: 'Cold Scout — AI Lead Generation Platform | Automate B2B Outreach',
    description:
      'Cold Scout uses AI to discover, enrich, and engage local business leads — automating your entire outreach pipeline from search to inbox. Free open-source + managed plans from ₹100/month.',
    canonical: 'https://coldscout.colddsam.com/',
    keywords:
      'AI lead generation, local business leads, cold outreach automation, lead qualification, email campaign automation, Google Maps scraping, sales pipeline, B2B leads, ICP scoring, automated prospecting, lead generation software, open source CRM',
  });

  return (
    <div className="bg-black text-white font-sans antialiased">
      <JsonLd data={LD_SOFTWARE} id="software" />
      <JsonLd data={LD_HOW_TO} id="howto" />
      <JsonLd data={LD_FAQ_HOME} id="faq-home" />
      <PublicNavbar />
      <main id="main-content">
        <HeroSection />
        <FeaturesSection />
        <WorkflowSection />
        <MetricsSection />
        <PricingSection />
        <FaqSection />
      </main>
      <PublicFooter />
    </div>
  );
}

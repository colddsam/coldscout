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
  Target, Shield, Users,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useSEO } from '../hooks/useSEO';
import JsonLd from '../components/seo/JsonLd';
import { SITE } from '../lib/seo/site';
import { BASE_PRICING } from '../lib/seo/pricing';
import { HOMEPAGE_FAQS } from '../lib/seo/faq';
import {
  softwareApplicationSchema,
  howToSchema,
  faqSchema,
  breadcrumbSchema,
} from '../lib/seo/schemas';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import ScrollReveal from '../components/ui/ScrollReveal';
import AnimatedCounter from '../components/ui/AnimatedCounter';
import WordsPullUp from '../components/animations/WordsPullUp';
import StaggeredCard from '../components/animations/StaggeredCard';
import FadeUpBlock from '../components/animations/FadeUpBlock';
import AnimatedLetter from '../components/animations/AnimatedLetter';
import { staggerContainer, staggerItem } from '../lib/motion';

/* ── Hero Section ── */

function HeroSection() {
  const { isAuthenticated } = useAuth();

  return (
    <section className="relative min-h-screen flex items-center justify-center pt-24 pb-12 overflow-hidden bg-black">
      {/* Subtle noise overlay (kept on top for grain texture) */}
      <div className="absolute inset-0 noise-overlay opacity-[0.2] pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-24">
          <div className="text-left">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 border border-white/10 rounded-full px-4 py-1.5 mb-8 bg-white/[0.03]"
            >
              <span className="relative flex items-center justify-center">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-white" />
                <span className="absolute inline-block w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              </span>
              <span className="text-xs font-medium text-[#B0B0B0]">AI-Powered Lead Generation</span>
            </motion.div>

            {/* Giant heading */}
            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[5rem] font-bold tracking-tighter leading-[1.05] mb-2">
              <WordsPullUp text="Discover leads." className="text-white" />
            </h1>
            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[5rem] font-bold tracking-tighter leading-[1.05] mb-2">
              <WordsPullUp text="Qualify instantly." className="text-white" delay={0.2} />
            </h1>
            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[5rem] font-bold tracking-tighter leading-[1.05] mb-8">
              <motion.span
                className="text-gradient block"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.5 }}
              >
                Close faster.
              </motion.span>
            </h1>

            <motion.p
              className="text-base md:text-lg text-[#B0B0B0] max-w-lg mb-10 leading-relaxed"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.5 }}
            >
              Cold Scout uses AI to discover, enrich, and engage local business leads —
              automating your entire outreach pipeline from search to inbox.
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row items-center gap-4"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1, duration: 0.5 }}
            >
              <Link to={isAuthenticated ? '/overview' : '/login'} className="w-full sm:w-auto">
                <motion.span
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-white text-black px-6 py-3.5 rounded-full text-sm font-semibold group shadow-[0_0_40px_rgba(255,255,255,0.15)]"
                  whileHover={{ scale: 1.03, boxShadow: '0 0 50px rgba(255,255,255,0.2)' }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  Go to Dashboard
                  <span className="w-5 h-5 bg-black rounded-full flex items-center justify-center">
                    <ArrowRight className="w-3 h-3 text-white group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </motion.span>
              </Link>
              <Link to="/scanner" className="w-full sm:w-auto">
                <motion.span
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-white/15 text-white/70 px-6 py-3.5 rounded-full text-sm font-medium hover:text-white hover:border-white/30 hover:bg-white/5 transition-all duration-300"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  <Search className="w-4 h-4" />
                  Free Website Audit
                </motion.span>
              </Link>
            </motion.div>
          </div>
          
          <div className="relative flex justify-center lg:justify-end mt-12 lg:mt-0">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5, type: "spring", stiffness: 100 }}
              className="relative w-full max-w-[600px] aspect-square bg-black border border-white/10 border-dashed rounded-3xl flex items-center justify-center"
            >
              <span className="text-[#555] text-sm font-mono uppercase tracking-[0.2em]">Image Placeholder</span>
              {/* Optional glowing effect behind image */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-white/5 blur-[100px] rounded-full pointer-events-none -z-10" />
            </motion.div>
          </div>
        </div>

        {/* Stats row */}
        <motion.div
          className="flex justify-center border-t border-white/10 pt-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.3, duration: 0.5 }}
        >
          <div className="flex flex-col md:flex-row items-center justify-center w-full max-w-4xl divide-y md:divide-y-0 md:divide-x divide-white/10">
            <div className="flex items-center justify-center gap-5 py-6 md:py-0 px-8 w-full md:w-1/3">
              <div className="w-12 h-12 bg-white/[0.03] border border-white/[0.08] rounded-2xl flex items-center justify-center shadow-inner">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <div className="text-2xl lg:text-3xl font-bold tracking-tighter text-white font-mono flex items-center">
                  <AnimatedCounter value={10000} duration={1.5} />+
                </div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-[#8A8A8A] mt-0.5 font-semibold">Leads Generated</p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-5 py-6 md:py-0 px-8 w-full md:w-1/3">
              <div className="w-12 h-12 bg-white/[0.03] border border-white/[0.08] rounded-2xl flex items-center justify-center shadow-inner">
                <Mail className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <div className="text-2xl lg:text-3xl font-bold tracking-tighter text-white font-mono flex items-center">
                  <AnimatedCounter value={95} duration={1.5} />%
                </div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-[#8A8A8A] mt-0.5 font-semibold">Email Accuracy</p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-5 py-6 md:py-0 px-8 w-full md:w-1/3">
              <div className="w-12 h-12 bg-white/[0.03] border border-white/[0.08] rounded-2xl flex items-center justify-center shadow-inner">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <div className="text-2xl lg:text-3xl font-bold tracking-tighter text-white font-mono flex items-center">
                  <AnimatedCounter value={3} duration={1.5} />x
                </div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-[#8A8A8A] mt-0.5 font-semibold">Faster Outreach</p>
              </div>
            </div>
          </div>
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
      name: BASE_PRICING.oss.name,
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
      name: BASE_PRICING.pro.name,
      price: `₹${BASE_PRICING.pro.inrPerMonth}`,
      period: '/month',
      desc: 'Hosted API & MCP Server — no deployment.',
      features: ['No deployment needed', 'MCP server access', '2,000 leads/month', 'AI qualification + emails', 'Email support (48h)'],
      cta: 'Get Started',
      href: '/login',
      external: false,
      featured: true,
    },
    {
      name: BASE_PRICING.enterprise.name,
      price: `₹${BASE_PRICING.enterprise.inrPerMonth}`,
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
  // Use the canonical homepage FAQ slice so Q/A copy matches /faq exactly.
  // Diverging the answer text creates Featured-Snippet conflicts (Google
  // picks the shorter version) and weakens AEO citations.
  const faqs = HOMEPAGE_FAQS;

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

const LD_SOFTWARE = softwareApplicationSchema();

const LD_HOW_TO = howToSchema({
  name: 'How to Generate Qualified Leads with Cold Scout AI',
  description:
    'Use Cold Scout to automatically discover, qualify, and engage local business leads in four steps.',
  totalTimeISO: 'PT5M',
  steps: [
    {
      name: 'Configure Your Target',
      text: 'Set your target industry, location, and ideal customer criteria in the pipeline configuration.',
      url: `${SITE.url}/docs#configuration`,
    },
    {
      name: 'AI Lead Discovery',
      text: 'Cold Scout AI scrapes Google Maps and enriches leads with business data, contact info, and social profiles.',
      url: `${SITE.url}/docs#discovery`,
    },
    {
      name: 'Score and Qualify',
      text: 'Machine learning models rank leads by purchase intent and ICP fit, ensuring you focus on hot prospects.',
      url: `${SITE.url}/docs#qualification`,
    },
    {
      name: 'Automated Personalized Outreach',
      text: 'AI-generated personalized email campaigns automatically reach your best prospects with tracked follow-ups.',
      url: `${SITE.url}/docs#outreach`,
    },
  ],
});

// JSON-LD answers must match the visible FAQ on this page AND the /faq page
// verbatim — diverging copy creates duplicate-FAQPage conflicts that Google
// silently de-dupes (often surfacing the *shorter* answer in Featured
// Snippets). Source from the shared canonical list.
const LD_FAQ_HOME = faqSchema(HOMEPAGE_FAQS, `${SITE.url}/`);

const LD_BREADCRUMB_HOME = breadcrumbSchema(
  [{ name: 'Home', url: `${SITE.url}/` }],
  `${SITE.url}/`,
);

/* ── Page Component ── */

export default function LandingPage() {
  useSEO({
    title: 'Cold Scout — AI Lead Generation Platform | Automate B2B Outreach',
    description: `Cold Scout uses AI to discover, enrich, and engage local business leads — automating your entire outreach pipeline from search to inbox. Free open-source + managed plans from ₹${BASE_PRICING.pro.inrPerMonth}/month.`,
    canonical: `${SITE.url}/`,
    keywords:
      'AI lead generation platform, Google Maps lead scraper, B2B outreach automation, open source lead generation, cold email AI generator, local business leads, lead qualification, email campaign automation, sales pipeline, ICP scoring, automated prospecting, lead generation software, MCP server lead generation',
  });

  return (
    <div className="bg-black text-white font-sans antialiased">
      <JsonLd data={LD_SOFTWARE} id="software" />
      <JsonLd data={LD_HOW_TO} id="howto" />
      <JsonLd data={LD_FAQ_HOME} id="faq-home" />
      <JsonLd data={LD_BREADCRUMB_HOME} id="breadcrumb-home" />
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

/**
 * Public Landing Page.
 *
 * Marketing entry point featuring the value proposition, core features,
 * and pricing tiers for the AI Lead Generation system.
 */
import { Link } from 'react-router-dom';
import {
  Search, Zap, Mail, BarChart2, ArrowRight, ChevronRight,
  Target, Shield
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useSEO } from '../hooks/useSEO';
import JsonLd from '../components/seo/JsonLd';

/* ── SVG Decorations ── */

function GridBackground() {
  return (
    <div className="absolute inset-0 bg-grid opacity-60 pointer-events-none" aria-hidden="true" />
  );
}

function FloatingDots() {
  return (
    <svg className="absolute top-20 right-10 w-24 h-24 opacity-10 animate-float" viewBox="0 0 100 100" aria-hidden="true">
      {[...Array(25)].map((_, i) => (
        <circle key={i} cx={(i % 5) * 25 + 12} cy={Math.floor(i / 5) * 25 + 12} r="2" fill="#000" />
      ))}
    </svg>
  );
}

/* ── Components ── */

function Navbar() {
  const { isAuthenticated } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-panel">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3" aria-label="Cold Scout Home">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="28" height="28" rx="6" fill="#000" />
            <path d="M8 14L12 10L16 14L12 18Z" fill="#A4DBD9" />
            <path d="M12 14L16 10L20 14L16 18Z" fill="#fff" fillOpacity="0.6" />
          </svg>
          <span className="text-lg font-semibold tracking-tight">
            Cold <span className="text-secondary font-normal">Scout</span>
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <a href="#features" className="hidden md:inline text-sm text-secondary hover:text-black transition-colors">Features</a>
          <a href="#workflow" className="hidden md:inline text-sm text-secondary hover:text-black transition-colors">How it works</a>
          <a href="#pricing" className="hidden md:inline text-sm text-secondary hover:text-black transition-colors">Pricing</a>
          <Link to="/docs" className="hidden md:inline text-sm text-secondary hover:text-black transition-colors">Docs</Link>
          <Link
            to={isAuthenticated ? '/overview' : '/login'}
            className="inline-flex items-center gap-2 bg-black text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            {isAuthenticated ? 'Go to Dashboard' : 'Sign In'} <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>
      </div>
    </nav>
  );
}

function HeroSection() {
  const { isAuthenticated } = useAuth();

  return (
    <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
      <GridBackground />
      <FloatingDots />
      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 border border-gray-200 rounded-full px-4 py-1.5 mb-8 bg-white shadow-minimal animate-fade-in">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-medium text-secondary">AI-Powered Lead Generation</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tighter text-black leading-[0.95] mb-6 animate-fade-in-up">
          Discover leads.<br />
          <span className="text-gradient">Qualify instantly.</span><br />
          Close faster.
        </h1>

        <p className="text-lg md:text-xl text-secondary max-w-2xl mx-auto mb-10 animate-fade-in-up delay-200">
          Cold Scout uses AI to discover, enrich, and engage local business leads — 
          automating your entire outreach pipeline from search to inbox.
        </p>

        <div className="flex items-center justify-center gap-4 animate-fade-in-up delay-300">
          <Link
            to={isAuthenticated ? '/overview' : '/login'}
            className="inline-flex items-center gap-2 bg-black text-white px-6 py-3 rounded-md text-sm font-medium hover:bg-gray-800 transition-all hover:shadow-vercel-hover"
          >
            {isAuthenticated ? 'Go to Dashboard' : 'Get Started'} <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
          <a
            href="#features"
            className="inline-flex items-center gap-2 bg-white text-black px-6 py-3 rounded-md text-sm font-medium border border-gray-200 hover:border-black hover:shadow-vercel transition-all"
          >
            Learn More
          </a>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-center gap-8 md:gap-16 mt-16 animate-fade-in-up delay-500">
          {[
            { value: '10k+', label: 'Leads Generated' },
            { value: '95%', label: 'Email Accuracy' },
            { value: '3x', label: 'Faster Outreach' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl md:text-3xl font-bold tracking-tighter text-black">{stat.value}</p>
              <p className="text-[10px] uppercase tracking-widest text-subtle mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const features = [
    {
      icon: Search,
      title: 'Smart Discovery',
      description: 'AI-powered Google Maps scraping to find and qualify local businesses based on your ideal customer profile.',
    },
    {
      icon: Zap,
      title: 'Instant Enrichment',
      description: 'Automatically enrich leads with contact info, social profiles, tech stack, and business intelligence.',
    },
    {
      icon: Mail,
      title: 'Personalized Outreach',
      description: 'AI-generated email campaigns with personalized copy that resonates with each prospect.',
    },
    {
      icon: BarChart2,
      title: 'Pipeline Analytics',
      description: 'Track every lead through your pipeline with real-time analytics and conversion insights.',
    },
    {
      icon: Target,
      title: 'Intent Scoring',
      description: 'Machine learning models score leads by purchase intent, ensuring you focus on the hottest prospects.',
    },
    {
      icon: Shield,
      title: 'Compliance Built-in',
      description: 'GDPR and CAN-SPAM compliant by design. Rate limiting and ethical scraping practices.',
    },
  ];

  return (
    <section id="features" className="py-24 md:py-32 bg-white relative">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-[10px] uppercase tracking-[0.2em] text-subtle font-semibold mb-3">Features</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-black">
            Everything you need to scale outreach
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <div
              key={feature.title}
              className="group p-6 rounded-lg border border-gray-200 hover:border-black hover:shadow-vercel transition-all duration-300"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="w-10 h-10 rounded-md bg-accents-1 border border-gray-200 flex items-center justify-center mb-4 group-hover:bg-black group-hover:border-black transition-colors">
                <feature.icon className="w-5 h-5 text-secondary group-hover:text-white transition-colors" />
              </div>
              <h3 className="text-base font-semibold text-black mb-2">{feature.title}</h3>
              <p className="text-sm text-secondary leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  const steps = [
    { num: '01', title: 'Configure', desc: 'Set your target industry, location, and ideal customer criteria.' },
    { num: '02', title: 'Discover', desc: 'AI scrapes Google Maps and enriches leads with business data.' },
    { num: '03', title: 'Score & Qualify', desc: 'ML models rank leads by intent and readiness to buy.' },
    { num: '04', title: 'Engage', desc: 'Automated personalized email campaigns reach your best prospects.' },
  ];

  return (
    <section id="workflow" className="py-24 md:py-32 bg-accents-1 relative">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-[10px] uppercase tracking-[0.2em] text-subtle font-semibold mb-3">How it works</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-black">
            Four steps to qualified leads
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, i) => (
            <div key={step.num} className="relative">
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-full w-6 z-10">
                  <ChevronRight className="w-5 h-5 text-gray-300" />
                </div>
              )}
              <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-vercel transition-all duration-300">
                <span className="text-3xl font-bold text-accents-2 tracking-tighter">{step.num}</span>
                <h3 className="text-base font-semibold text-black mt-3 mb-2">{step.title}</h3>
                <p className="text-sm text-secondary leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  const plans = [
    {
      name: 'Open Source',
      price: 'Free',
      period: '',
      desc: 'Self-hosted from GitHub with your own API keys.',
      features: ['Full platform access', 'All 5 pipeline stages', 'Unlimited leads (your keys)', 'Community support'],
      cta: 'View on GitHub',
      href: 'https://github.com/colddsam/AI-LEAD-GENERATION',
      external: true,
      featured: false,
    },
    {
      name: 'Pro',
      price: '$30',
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
      price: '$100',
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
    <section id="pricing" className="py-24 md:py-32 bg-white relative">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-[10px] uppercase tracking-[0.2em] text-subtle font-semibold mb-3">Pricing</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-black">
            Simple, transparent pricing
          </h2>
          <p className="text-secondary mt-3 max-w-md mx-auto">Open source forever. Pay only for our hosted infrastructure.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-lg border p-8 transition-all duration-300 ${
                plan.featured
                  ? 'border-black shadow-vercel-hover bg-black text-white'
                  : 'border-gray-200 bg-white hover:shadow-vercel'
              }`}
            >
              <p className={`text-[10px] uppercase tracking-widest font-semibold mb-4 ${plan.featured ? 'text-coldscout-teal' : 'text-subtle'}`}>{plan.name}</p>
              <div className="mb-4">
                <span className="text-4xl font-bold tracking-tighter">{plan.price}</span>
                {plan.period && <span className={`text-sm ${plan.featured ? 'text-gray-400' : 'text-secondary'}`}>{plan.period}</span>}
              </div>
              <p className={`text-sm mb-6 ${plan.featured ? 'text-gray-400' : 'text-secondary'}`}>{plan.desc}</p>
              <ul className="space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <span className={`w-1 h-1 rounded-full ${plan.featured ? 'bg-coldscout-teal' : 'bg-black'}`} />
                    {f}
                  </li>
                ))}
              </ul>
              {plan.external ? (
                <a
                  href={plan.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block text-center py-2.5 rounded-md text-sm font-medium transition-colors ${
                    plan.featured
                      ? 'bg-white text-black hover:bg-gray-100'
                      : 'bg-black text-white hover:bg-gray-800'
                  }`}
                >
                  {plan.cta}
                </a>
              ) : (
                <Link
                  to={plan.href}
                  className="block text-center py-2.5 rounded-md text-sm font-medium bg-white text-black hover:bg-gray-100 transition-colors"
                >
                  {plan.cta}
                </Link>
              )}
            </div>
          ))}
        </div>

        <div className="text-center mt-8">
          <Link to="/pricing" className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-black transition-colors">
            See full comparison & regional pricing <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-gray-200 py-12 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <svg width="24" height="24" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="28" height="28" rx="6" fill="#000" />
              <path d="M8 14L12 10L16 14L12 18Z" fill="#A4DBD9" />
              <path d="M12 14L16 10L20 14L16 18Z" fill="#fff" fillOpacity="0.6" />
            </svg>
            <span className="text-sm font-semibold tracking-tight">Cold Scout</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#features" className="text-xs text-secondary hover:text-black transition-colors">Features</a>
            <a href="#workflow" className="text-xs text-secondary hover:text-black transition-colors">How it works</a>
            <a href="#pricing" className="text-xs text-secondary hover:text-black transition-colors">Pricing</a>
            <Link to="/docs" className="text-xs text-secondary hover:text-black transition-colors">Docs</Link>
          </div>
          <p className="text-xs text-subtle">
            &copy; {new Date().getFullYear()} Cold Scout. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ── Landing Page ── */

const LD_ORGANIZATION = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Cold Scout',
  url: 'https://coldscout.colddsam.com',
  logo: 'https://coldscout.colddsam.com/android-chrome-512x512.png',
  description: 'AI-powered lead generation platform that discovers, qualifies, and engages local business leads at scale.',
  sameAs: ['https://github.com/colddsam/AI-LEAD-GENERATION'],
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'colddsam@gmail.com',
    contactType: 'customer support',
  },
};

const LD_WEBSITE = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Cold Scout',
  url: 'https://coldscout.colddsam.com',
  description: 'AI-powered lead generation platform that discovers, qualifies, and engages local business leads at scale.',
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: 'https://coldscout.colddsam.com/docs?q={search_term_string}',
    },
    'query-input': 'required name=search_term_string',
  },
};

const LD_SOFTWARE = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Cold Scout',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: 'https://coldscout.colddsam.com',
  description: 'AI-powered lead generation platform that automates outreach pipeline from search to inbox.',
  offers: [
    {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      name: 'Open Source (Self-hosted)',
    },
    {
      '@type': 'Offer',
      price: '30',
      priceCurrency: 'USD',
      name: 'Pro — Hosted API',
      billingIncrement: 1,
    },
    {
      '@type': 'Offer',
      price: '100',
      priceCurrency: 'USD',
      name: 'Enterprise',
      billingIncrement: 1,
    },
  ],
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.8',
    reviewCount: '12',
  },
};

export default function LandingPage() {
  useSEO({
    title: 'Cold Scout — AI Lead Generation Platform',
    description:
      'Cold Scout uses AI to discover, enrich, and engage local business leads — automating your entire outreach pipeline from search to inbox. Try it free.',
    canonical: 'https://coldscout.colddsam.com/',
    keywords:
      'AI lead generation, local business leads, cold outreach automation, lead qualification, email campaign, Google Maps scraping, sales pipeline, B2B leads, ICP scoring',
  });

  return (
    <div className="bg-white text-black font-sans antialiased">
      <JsonLd data={LD_ORGANIZATION} id="organization" />
      <JsonLd data={LD_WEBSITE} id="website" />
      <JsonLd data={LD_SOFTWARE} id="software" />
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <WorkflowSection />
      <PricingSection />
      <Footer />
    </div>
  );
}


/**
 * Pricing Page.
 *
 * Three-tier pricing model with regional currency selector,
 * feature comparison table, FAQ, and CTA. Follows the
 * Vercel-aesthetic design system used throughout the platform.
 */
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Check, X, ChevronDown, ExternalLink, Download,
  Zap, Building2, Globe, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSEO } from '../hooks/useSEO';
import JsonLd from '../components/seo/JsonLd';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import { useAuth } from '../hooks/useAuth';
import { useCheckout } from '../hooks/useBilling';
import type { BillingPlan } from '../lib/api';
import {
  fadeIn, fadeInUp, staggerContainer, staggerItem,
  accordionContent, hoverLift, defaultViewport,
} from '../lib/motion';
import { CURRENCIES, BASE_PRICING, type CurrencyDisplay } from '../lib/seo/pricing';
import { SITE } from '../lib/seo/site';
import {
  serviceSchema,
  faqSchema,
  breadcrumbSchema,
  webPageSchema,
} from '../lib/seo/schemas';
import { buildOgImage } from '../lib/seo/og';

type CurrencyInfo = CurrencyDisplay;

function formatPrice(value: number, symbol: string): string {
  return `${symbol}${value.toLocaleString()}`;
}


/* ═══════════════ Currency Selector ═══════════════ */

function CurrencySelector({ selected, onChange }: {
  selected: CurrencyInfo;
  onChange: (c: CurrencyInfo) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2.5 border border-white/10 rounded-full px-4 py-2 bg-white/5 text-sm font-medium hover:border-white/30 hover:bg-white/10 transition-all duration-300 shadow-[0_4px_15px_rgba(0,0,0,0.2)]"
      >
        <span className="text-base">{selected.flag}</span>
        <span className="text-white">{selected.code}</span>
        <ChevronDown className={`w-4 h-4 text-[#B0B0B0] transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <motion.div
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            className="absolute right-0 mt-2 w-52 glass-panel-strong rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.6)] z-50 py-1.5 border border-white/10 overflow-hidden"
          >
            {CURRENCIES.map((c) => (
              <button
                key={c.code}
                onClick={() => { onChange(c); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-200 ${
                  c.code === selected.code ? 'bg-white/10 font-semibold text-white' : 'text-[#B0B0B0] hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="text-base">{c.flag}</span>
                <span>{c.code}</span>
                <span className="ml-auto text-[10px] uppercase tracking-widest text-[#8A8A8A]">{c.symbol}</span>
              </button>
            ))}
          </motion.div>
        </>
      )}
    </div>
  );
}

/* ═══════════════ Collapsible FAQ ═══════════════ */

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div variants={staggerItem} className="border border-white/[0.08] rounded-2xl overflow-hidden hover:border-white/15 bg-surface-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] transition-colors text-left"
      >
        <span className="text-sm font-semibold text-white pr-4">{q}</span>
        <ChevronDown className={`w-4 h-4 text-[#8A8A8A] flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            variants={accordionContent}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            className="overflow-hidden"
          >
            <p className="px-5 pb-5 text-sm text-[#B0B0B0] leading-relaxed border-t border-white/[0.08] pt-4">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ═══════════════ Hero Section ═══════════════ */

function PricingHero({ currency, onCurrencyChange }: {
  currency: CurrencyInfo;
  onCurrencyChange: (c: CurrencyInfo) => void;
}) {
  return (
    <section className="relative pt-32 pb-10 bg-black">
      <div className="absolute inset-0 noise-overlay opacity-[0.15]" />
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="relative z-10 max-w-6xl mx-auto px-6 text-center"
      >
        <motion.div variants={staggerItem} className="inline-flex items-center gap-2 border border-white/10 rounded-full px-4 py-1.5 mb-8 bg-white/[0.03]">
          <Zap className="w-3.5 h-3.5 text-white" />
          <span className="text-xs font-medium text-[#B0B0B0]">Pricing</span>
        </motion.div>

        <motion.h1 variants={staggerItem} className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter text-white leading-[0.95] mb-6">
          Choose Your<br />
          <span className="text-gradient">Plan</span>
        </motion.h1>

        <motion.p variants={staggerItem} className="text-lg md:text-xl text-[#B0B0B0] max-w-2xl mx-auto mb-8">
          Open source forever. Pay only when you want our hosted infrastructure.
        </motion.p>

        <motion.div variants={staggerItem} className="flex items-center justify-center gap-3">
          <Globe className="w-4 h-4 text-[#B0B0B0]" />
          <span className="text-sm text-[#B0B0B0]">Currency:</span>
          <CurrencySelector selected={currency} onChange={onCurrencyChange} />
        </motion.div>
      </motion.div>
    </section>
  );
}

/* ═══════════════ Pricing Cards ═══════════════ */

function PricingCards({ currency }: { currency: CurrencyInfo }) {
  const { user, isAuthenticated } = useAuth();
  const { checkout } = useCheckout();
  const navigate = useNavigate();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const handleProCheckout = async () => {
    if (!isAuthenticated || !user) {
      navigate('/login');
      return;
    }
    if (user.plan === 'pro') {
      navigate('/billing');
      return;
    }
    setCheckoutLoading('pro');
    try {
      await checkout({
        plan: 'pro' as BillingPlan,
        userEmail: user.email,
        userName: user.full_name || undefined,
        onSuccess: () => {
          toast.success('Pro plan activated! Redirecting to billing...');
          setTimeout(() => navigate('/billing'), 1500);
        },
      });
    } finally {
      setCheckoutLoading(null);
    }
  };

  const plans = [
    {
      name: 'Open Source',
      icon: Download,
      price: 'Free',
      period: '',
      tagline: 'Download & self-host',
      desc: 'Download the release package, add your own API keys, and run the full pipeline on your own infrastructure.',
      features: [
        'Full platform access',
        'All 5 pipeline stages',
        'Unlimited leads (your API keys)',
        'Web dashboard included',
        'Community support (GitHub Issues)',
        'Docker & pip install ready',
      ],
      cta: 'Download Free Package',
      ctaLink: 'https://github.com/colddsam/coldscout/releases',
      external: true,
      featured: false,
      planKey: null,
    },
    {
      name: 'Pro',
      icon: Zap,
      price: formatPrice(currency.pro, currency.symbol),
      period: '/mo',
      tagline: 'Hosted API & MCP Server',
      desc: 'Skip deployment — use our managed API and MCP server to power your lead generation instantly.',
      features: [
        'No deployment needed',
        'MCP server access',
        '2,000 leads/month',
        'AI qualification + email generation',
        'Dashboard analytics',
        'Email support (48h response)',
        '99.5% uptime SLA',
      ],
      cta: isAuthenticated && user?.plan === 'pro' ? 'Manage Plan' : 'Get Started',
      ctaLink: null,
      external: false,
      featured: true,
      planKey: 'pro',
    },
    {
      name: 'Enterprise',
      icon: Building2,
      price: formatPrice(currency.enterprise, currency.symbol),
      period: '/mo',
      tagline: 'For agencies & freelancing firms',
      desc: 'Dedicated infrastructure, custom AI models, and white-glove support for professional teams.',
      features: [
        'Unlimited leads',
        'Dedicated API instance',
        'Custom ICP model training',
        'White-label email templates',
        'Priority support (4h response)',
        'Custom integrations',
        'Dedicated account manager',
      ],
      cta: 'Contact Sales',
      ctaLink: 'mailto:colddsam@gmail.com?subject=Cold%20Scout%20Enterprise%20Inquiry',
      external: true,
      featured: false,
      planKey: 'enterprise',
    },
  ];

  return (
    <section className="py-16 bg-black">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={defaultViewport}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6 max-w-5xl mx-auto"
        >
          {plans.map((plan) => {
            const isLoading = checkoutLoading === plan.planKey;

            return (
              <motion.div
                key={plan.name}
                variants={staggerItem}
                whileHover={hoverLift}
                className={`relative rounded-2xl border overflow-hidden ${
                  plan.featured
                    ? 'border-white/25 bg-surface-2 text-white scale-[1.02] shadow-[0_0_30px_rgba(255,255,255,0.03)]'
                    : 'border-white/[0.08] bg-surface-2 hover:border-white/15'
                }`}
              >
                {plan.featured && (
                  <div className="absolute top-0 left-0 right-0 h-px bg-white/25" />
                )}

                <div className="p-8">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      plan.featured ? 'bg-white/10' : 'bg-white/5 border border-white/10'
                    }`}>
                      <plan.icon className={`w-4.5 h-4.5 ${plan.featured ? 'text-white' : 'text-[#B0B0B0]'}`} />
                    </div>
                    <div>
                      <p className={`text-[10px] uppercase tracking-[0.15em] font-semibold ${
                        plan.featured ? 'text-white' : 'text-[#8A8A8A]'
                      }`}>{plan.name}</p>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="mb-2">
                    <span className="text-4xl font-bold tracking-tighter text-white">{plan.price}</span>
                    {plan.period && (
                      <span className={`text-sm ml-1 text-[#8A8A8A]`}>{plan.period}</span>
                    )}
                  </div>
                  <p className={`text-xs font-medium mb-1 ${plan.featured ? 'text-gray-300' : 'text-white'}`}>{plan.tagline}</p>
                  <p className={`text-[12px] leading-relaxed mb-6 text-[#B0B0B0]`}>{plan.desc}</p>

                  {/* Features */}
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm">
                        <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${plan.featured ? 'text-white' : 'text-white/60'}`} />
                        <span className="text-[#C0C0C0]">{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  {plan.external ? (
                    <a
                      href={plan.ctaLink!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center justify-center gap-2 w-full py-3 rounded-full text-sm font-medium transition-all duration-200 ${
                        plan.featured
                          ? 'bg-white text-black hover:bg-gray-200'
                          : 'border border-white/15 text-white hover:bg-white/10'
                      }`}
                      aria-label={`${plan.cta} with the ${plan.name} plan`}
                    >
                      {plan.cta} <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : plan.planKey === 'pro' ? (
                    <button
                      onClick={handleProCheckout}
                      disabled={isLoading}
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-full text-sm font-medium bg-white text-black hover:bg-gray-200 disabled:opacity-70 transition-all duration-200"
                      aria-label={`${plan.cta} with the ${plan.name} plan`}
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>{plan.cta} <ArrowRight className="w-3.5 h-3.5" /></>
                      )}
                    </button>
                  ) : (
                    <Link
                      to="/login"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-full text-sm font-medium bg-white text-black hover:bg-gray-200 transition-all duration-200"
                      aria-label={`${plan.cta} with the ${plan.name} plan`}
                    >
                      {plan.cta} <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* INR note when non-INR currency selected */}
        {currency.code !== 'INR' && (
          <p className="text-center text-[11px] text-[#8A8A8A] mt-6">
            * Payments are processed in INR (₹). Displayed prices are approximate conversions for reference.
          </p>
        )}
      </div>
    </section>
  );
}

/* ═══════════════ Comparison Table ═══════════════ */

function ComparisonTable() {
  const rows: { feature: string; os: boolean | string; pro: boolean | string; ent: boolean | string }[] = [
    { feature: 'Full Platform Access', os: true, pro: true, ent: true },
    { feature: 'All 5 Pipeline Stages', os: true, pro: true, ent: true },
    { feature: 'Documentation Access', os: true, pro: true, ent: true },
    { feature: 'Downloadable Package', os: true, pro: false, ent: false },
    { feature: 'Hosted API Access', os: false, pro: true, ent: true },
    { feature: 'MCP Server Access', os: false, pro: true, ent: true },
    { feature: 'Monthly Lead Limit', os: 'Unlimited*', pro: '2,000', ent: 'Unlimited' },
    { feature: 'AI Qualification', os: true, pro: true, ent: true },
    { feature: 'Email Generation', os: true, pro: true, ent: true },
    { feature: 'Dashboard Analytics', os: true, pro: true, ent: true },
    { feature: 'Custom ICP Models', os: false, pro: false, ent: true },
    { feature: 'White-label Templates', os: false, pro: false, ent: true },
    { feature: 'Dedicated API Instance', os: false, pro: false, ent: true },
    { feature: 'Custom Integrations', os: false, pro: false, ent: true },
    { feature: 'Support', os: 'Community', pro: 'Email (48h)', ent: 'Priority (4h)' },
    { feature: 'Uptime SLA', os: '—', pro: '99.5%', ent: '99.9%' },
  ];

  function renderCell(val: boolean | string) {
    if (val === true) return <Check className="w-4 h-4 text-white mx-auto" />;
    if (val === false) return <X className="w-4 h-4 text-white/20 mx-auto" />;
    return <span className="text-xs text-[#B0B0B0]">{val}</span>;
  }

  return (
    <motion.section
      variants={fadeInUp}
      initial="hidden"
      whileInView="visible"
      viewport={defaultViewport}
      className="py-24 bg-surface-1"
    >
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#8A8A8A] font-semibold mb-3">Compare</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-white">Feature Comparison</h2>
        </div>

        <div className="overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-white/10">
          <div className="bg-surface-2 border border-white/[0.08] rounded-2xl overflow-hidden min-w-[800px]">
          {/* Header */}
          <div className="grid grid-cols-4 border-b border-white/[0.08] bg-white/[0.02]">
            <div className="p-4" />
            <div className="p-4 text-center border-l border-white/[0.08]">
              <p className="text-[10px] uppercase tracking-widest text-[#8A8A8A] font-semibold">Open Source</p>
              <p className="text-lg font-bold tracking-tighter mt-0.5 text-white">Free</p>
            </div>
            <div className="p-4 text-center border-l border-white/[0.08] bg-white/[0.03]">
              <p className="text-[10px] uppercase tracking-widest text-white font-semibold">Pro</p>
              <p className="text-lg font-bold tracking-tighter mt-0.5 text-white">₹{BASE_PRICING.pro.inrPerMonth}<span className="text-xs font-normal text-[#8A8A8A]">/mo</span></p>
            </div>
            <div className="p-4 text-center border-l border-white/[0.08]">
              <p className="text-[10px] uppercase tracking-widest text-[#8A8A8A] font-semibold">Enterprise</p>
              <p className="text-lg font-bold tracking-tighter mt-0.5 text-white">₹{BASE_PRICING.enterprise.inrPerMonth}<span className="text-xs font-normal text-[#8A8A8A]">/mo</span></p>
            </div>
          </div>


          {/* Rows */}
          {rows.map((row, i) => (
            <div key={row.feature} className={`grid grid-cols-4 ${i < rows.length - 1 ? 'border-b border-white/[0.03]' : ''} hover:bg-white/[0.02] transition-colors`}>
              <div className="p-4 text-sm text-white font-medium">{row.feature}</div>
              <div className="p-4 text-center border-l border-white/[0.03]">{renderCell(row.os)}</div>
              <div className="p-4 text-center border-l border-white/[0.03] bg-white/[0.02]">{renderCell(row.pro)}</div>
              <div className="p-4 text-center border-l border-white/[0.03]">{renderCell(row.ent)}</div>
            </div>
          ))}
          </div>
        </div>

        <p className="text-center text-[11px] text-[#8A8A8A] mt-4">
          * Open Source unlimited leads require your own Google Places API keys and Groq credits.
        </p>
      </div>
    </motion.section>
  );
}

/* ═══════════════ FAQ Section ═══════════════ */

function FaqSection() {
  const faqs = [
    {
      q: 'Is the platform truly free to self-host?',
      a: 'Absolutely. Download the Cold Scout OSS package from our GitHub Releases page, set up your own API keys (Google Places, Groq, Brevo — all have free tiers), and run it on your own machine or server. You only pay for third-party API usage on your own accounts. The package includes a web dashboard, Docker support, and full documentation.',
    },
    {
      q: 'What do I get with the Pro plan that I can\'t do myself?',
      a: 'The Pro plan gives you instant access to our pre-configured, managed API server and MCP server — no deployment, no Docker, no environment setup. We handle infrastructure, scaling, monitoring, and uptime. You get a ready-to-use API key and start generating leads immediately.',
    },
    {
      q: 'Can I cancel my subscription anytime?',
      a: 'Yes. Both Pro and Enterprise plans are billed monthly with no long-term contracts. Cancel anytime from your dashboard. Your access continues until the end of the current billing period. All your data remains exportable.',
    },
    {
      q: 'What happens if I exceed the 2,000 leads/month on Pro?',
      a: 'You\'ll receive a notification when you approach your limit. Once reached, the pipeline pauses until the next billing cycle. You can upgrade to Enterprise at any time for unlimited leads, or continue self-hosting with your own API keys.',
    },
    {
      q: 'How does the Enterprise plan differ for agencies?',
      a: 'Enterprise customers get a dedicated API instance (not shared), custom ICP model training tailored to your niche, white-label email templates with your branding, and priority support with a 4-hour response SLA. We also offer custom integrations with your existing CRM or sales tools.',
    },
  ];

  return (
    <section className="py-24 bg-black">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-12">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#8A8A8A] font-semibold mb-3">FAQ</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-white">Common Questions</h2>
        </div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={defaultViewport}
          className="space-y-3"
        >
          {faqs.map((faq) => (
            <FaqItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ═══════════════ CTA Banner ═══════════════ */

function CtaBanner() {
  return (
    <motion.section
      variants={fadeInUp}
      initial="hidden"
      whileInView="visible"
      viewport={defaultViewport}
      className="py-24 bg-surface-1"
    >
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-white mb-4">
          Start building today
        </h2>
        <p className="text-[#B0B0B0] text-lg max-w-xl mx-auto mb-10">
          Whether you want full control with self-hosting or instant access with our
          managed API — Cold Scout has you covered.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="https://github.com/colddsam/coldscout/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 border border-white/15 text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-white/10 transition-all"
          >
            <Download className="w-4 h-4" />
            Download Free Package
          </a>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 bg-white text-black px-6 py-3 rounded-full text-sm font-medium hover:bg-gray-200 transition-all"
          >
            Get API Access <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </motion.section>
  );
}


/* ═══════════════ Main Pricing Page ═══════════════ */

const PRICING_URL = `${SITE.url}/pricing`;

const PRICING_FAQS = [
  {
    q: 'Is the platform truly free to self-host?',
    a: 'Absolutely. Download the Cold Scout OSS package from our GitHub Releases page, set up your own API keys (Google Places, Groq, Brevo — all have free tiers), and run it on your own machine. You only pay for third-party API usage on your own accounts.',
  },
  {
    q: 'What do I get with the Pro plan?',
    a: 'The Pro plan gives you instant access to our pre-configured, managed API server and MCP server — no deployment, no Docker, no environment setup. You get a ready-to-use API key and start generating leads immediately.',
  },
  {
    q: 'Can I cancel my subscription anytime?',
    a: 'Yes. Both Pro and Enterprise plans are billed monthly with no long-term contracts. Cancel anytime from your dashboard. Your access continues until the end of the current billing period.',
  },
  {
    q: 'What happens if I exceed the 2,000 leads/month on Pro?',
    a: 'You will receive a notification when you approach your limit. Once reached, the pipeline pauses until the next billing cycle. You can upgrade to Enterprise at any time for unlimited leads.',
  },
  {
    q: 'How does the Enterprise plan differ for agencies?',
    a: 'Enterprise customers get a dedicated API instance, custom ICP model training tailored to their niche, white-label email templates, and priority support with a 4-hour response SLA.',
  },
];

const LD_WEBPAGE_PRICING = webPageSchema({
  url: PRICING_URL,
  name: 'Pricing — Cold Scout AI Lead Generation',
  description:
    `Simple, transparent pricing for Cold Scout. Free open-source self-hosting, Pro managed API at ₹${BASE_PRICING.pro.inrPerMonth}/month, and Enterprise plans for agencies at ₹${BASE_PRICING.enterprise.inrPerMonth}/month.`,
  dateModified: '2026-05-08',
});

const LD_FAQ_PRICING = faqSchema(PRICING_FAQS, PRICING_URL);
const LD_SERVICE_PRICING = serviceSchema();
const LD_BREADCRUMB_PRICING = breadcrumbSchema(
  [
    { name: 'Home', url: `${SITE.url}/` },
    { name: 'Pricing', url: PRICING_URL },
  ],
  PRICING_URL,
);

export default function Pricing() {
  const [currency, setCurrency] = useState<CurrencyInfo>(() => {
    // 1. Try saved preference (guarded: this initializer runs during SSR/SSG
    //    where localStorage doesn't exist; the client re-reads on hydration).
    const saved = typeof window !== 'undefined' ? localStorage.getItem('cs-currency') : null;
    if (saved) {
      const match = CURRENCIES.find((c) => c.code === saved);
      if (match) return match;
    }
    // 2. Try auto-detection from Browser Locale
    try {
      const detected = new Intl.NumberFormat().resolvedOptions().currency;
      const match = CURRENCIES.find((c) => c.code === detected);
      if (match) {
        return match;
      }
    } catch {
      // Fallback
    }
    // 3. Global Default
    return CURRENCIES[0];
  });

  const handleCurrencyChange = (c: CurrencyInfo) => {
    setCurrency(c);
    localStorage.setItem('cs-currency', c.code);
  };

  // 4. Geolocation Fallback (IP-based)
  useEffect(() => {
    const detectLocation = async () => {
      // Only auto-detect if no preference is saved
      if (localStorage.getItem('cs-currency')) return;

      try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        
        if (data.currency) {
          const match = CURRENCIES.find(c => c.code === data.currency);
          if (match && match.code !== currency.code) {
            setCurrency(match);
            localStorage.setItem('cs-currency', match.code);
            toast.success(`Currency switched to ${match.code} based on your country`, {
              icon: match.flag,
              duration: 4000
            });
          }
        }
      } catch {
        // Silent fallback
      }
    };

    detectLocation();
  }, [currency.code]);

  useSEO({
    title: 'Pricing — Cold Scout AI Lead Generation',
    description: `Simple, transparent pricing for Cold Scout. Free open-source self-hosting, Pro managed API at ₹${BASE_PRICING.pro.inrPerMonth}/month, and Enterprise plans for agencies at ₹${BASE_PRICING.enterprise.inrPerMonth}/month. No hidden fees.`,
    canonical: PRICING_URL,
    keywords:
      'Cold Scout pricing, AI lead generation pricing, lead generation SaaS cost, open source lead tool, managed API pricing, enterprise lead generation',
    ogImage: buildOgImage({
      title: 'Cold Scout Pricing',
      subtitle: `Free self-host · Pro ₹${BASE_PRICING.pro.inrPerMonth}/mo · Enterprise ₹${BASE_PRICING.enterprise.inrPerMonth.toLocaleString()}/mo`,
      kind: 'pricing',
    }),
  });

  return (
    <div className="bg-black text-white font-sans antialiased">
      <JsonLd data={LD_WEBPAGE_PRICING} id="webpage-pricing" />
      <JsonLd data={LD_FAQ_PRICING} id="faq-pricing" />
      <JsonLd data={LD_BREADCRUMB_PRICING} id="breadcrumb-pricing" />
      <JsonLd data={LD_SERVICE_PRICING} id="service-pricing" />
      <PublicNavbar />
      <PricingHero currency={currency} onCurrencyChange={handleCurrencyChange} />
      <PricingCards currency={currency} />
      <ComparisonTable />
      <FaqSection />
      <CtaBanner />
      <PublicFooter />
    </div>
  );
}

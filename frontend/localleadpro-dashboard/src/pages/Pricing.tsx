/**
 * Pricing Page.
 *
 * Three-tier pricing model with regional currency selector,
 * feature comparison table, FAQ, and CTA. Follows the
 * Vercel-aesthetic design system used throughout the platform.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Check, X, ChevronDown, ExternalLink,
  Github, Zap, Building2, Globe, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSEO } from '../hooks/useSEO';
import JsonLd from '../components/seo/JsonLd';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import { useAuth } from '../hooks/useAuth';
import { useCheckout } from '../hooks/useBilling';
import type { BillingPlan } from '../lib/api';

/* ═══════════════ Currency Data ═══════════════ */

interface CurrencyInfo {
  code: string;
  symbol: string;
  flag: string;
  pro: number;
  enterprise: number;
}

const CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', symbol: '$', flag: '🇺🇸', pro: 30, enterprise: 100 },
  { code: 'EUR', symbol: '€', flag: '🇪🇺', pro: 25, enterprise: 90 },
  { code: 'GBP', symbol: '£', flag: '🇬🇧', pro: 25, enterprise: 80 },
  { code: 'INR', symbol: '₹', flag: '🇮🇳', pro: 2500, enterprise: 8500 },
  { code: 'CAD', symbol: 'C$', flag: '🇨🇦', pro: 40, enterprise: 135 },
  { code: 'AUD', symbol: 'A$', flag: '🇦🇺', pro: 45, enterprise: 150 },
  { code: 'JPY', symbol: '¥', flag: '🇯🇵', pro: 4500, enterprise: 15000 },
  { code: 'BRL', symbol: 'R$', flag: '🇧🇷', pro: 150, enterprise: 500 },
];

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
        className="inline-flex items-center gap-2 border border-gray-200 rounded-md px-3 py-1.5 bg-white text-sm hover:border-black hover:shadow-vercel transition-all"
      >
        <span>{selected.flag}</span>
        <span className="font-medium">{selected.code}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-secondary transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-lg shadow-vercel-hover z-50 py-1 animate-fade-in">
            {CURRENCIES.map((c) => (
              <button
                key={c.code}
                onClick={() => { onChange(c); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-accents-1 transition-colors ${
                  c.code === selected.code ? 'bg-accents-1 font-medium' : ''
                }`}
              >
                <span>{c.flag}</span>
                <span>{c.code}</span>
                <span className="ml-auto text-xs text-secondary">{c.symbol}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════ Collapsible FAQ ═══════════════ */

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden transition-all duration-200 hover:shadow-vercel">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 bg-white hover:bg-accents-1 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-black pr-4">{q}</span>
        <ChevronDown className={`w-4 h-4 text-secondary flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`transition-all duration-300 overflow-hidden ${open ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <p className="px-5 pb-5 text-sm text-secondary leading-relaxed border-t border-gray-100 pt-4">{a}</p>
      </div>
    </div>
  );
}

/* ═══════════════ Hero Section ═══════════════ */

function PricingHero({ currency, onCurrencyChange }: {
  currency: CurrencyInfo;
  onCurrencyChange: (c: CurrencyInfo) => void;
}) {
  return (
    <section className="relative pt-32 pb-10 overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-40 pointer-events-none" />
      <div className="relative z-10 max-w-6xl mx-auto px-6 text-center">
        <div className="inline-flex items-center gap-2 border border-gray-200 rounded-full px-4 py-1.5 mb-8 bg-white shadow-minimal animate-fade-in">
          <Zap className="w-3.5 h-3.5 text-black" />
          <span className="text-xs font-medium text-secondary">Pricing</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter text-black leading-[0.95] mb-6 animate-fade-in-up">
          Choose Your<br />
          <span className="text-gradient">Plan</span>
        </h1>

        <p className="text-lg md:text-xl text-secondary max-w-2xl mx-auto mb-8 animate-fade-in-up delay-200">
          Open source forever. Pay only when you want our hosted infrastructure.
        </p>

        <div className="flex items-center justify-center gap-3 animate-fade-in-up delay-300">
          <Globe className="w-4 h-4 text-secondary" />
          <span className="text-sm text-secondary">Currency:</span>
          <CurrencySelector selected={currency} onChange={onCurrencyChange} />
        </div>
      </div>
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
      icon: Github,
      price: 'Free',
      period: '',
      tagline: 'Self-hosted from GitHub',
      desc: 'Clone, deploy, and run the full platform on your own infrastructure with your own API keys.',
      features: [
        'Full platform access',
        'All 5 pipeline stages',
        'Unlimited leads (your API keys)',
        'Community support (GitHub Issues)',
        'Complete documentation',
        'Self-managed infrastructure',
      ],
      cta: 'View on GitHub',
      ctaLink: 'https://github.com/colddsam/coldscout.git',
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
    <section className="py-16 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan) => {
            const isLoading = checkoutLoading === plan.planKey;

            return (
              <div
                key={plan.name}
                className={`relative rounded-xl border transition-all duration-300 overflow-hidden ${
                  plan.featured
                    ? 'border-black shadow-vercel-hover bg-black text-white scale-[1.02]'
                    : 'border-gray-200 bg-white hover:shadow-vercel hover:border-black'
                }`}
              >
                {plan.featured && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-black" />
                )}

                <div className="p-8">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      plan.featured ? 'bg-white/10' : 'bg-accents-1 border border-gray-200'
                    }`}>
                      <plan.icon className={`w-4.5 h-4.5 ${plan.featured ? 'text-white' : 'text-secondary'}`} />
                    </div>
                    <div>
                      <p className={`text-[10px] uppercase tracking-[0.15em] font-semibold ${
                        plan.featured ? 'text-white' : 'text-subtle'
                      }`}>{plan.name}</p>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="mb-2">
                    <span className="text-4xl font-bold tracking-tighter">{plan.price}</span>
                    {plan.period && (
                      <span className={`text-sm ml-1 ${plan.featured ? 'text-gray-400' : 'text-secondary'}`}>{plan.period}</span>
                    )}
                  </div>
                  <p className={`text-xs font-medium mb-1 ${plan.featured ? 'text-gray-300' : 'text-black'}`}>{plan.tagline}</p>
                  <p className={`text-[12px] leading-relaxed mb-6 ${plan.featured ? 'text-gray-400' : 'text-secondary'}`}>{plan.desc}</p>

                  {/* Features */}
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm">
                        <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${plan.featured ? 'text-white' : 'text-black'}`} />
                        <span className={plan.featured ? 'text-gray-200' : 'text-secondary'}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  {plan.external ? (
                    <a
                      href={plan.ctaLink!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center justify-center gap-2 w-full py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                        plan.featured
                          ? 'bg-white text-black hover:bg-gray-100'
                          : 'bg-black text-white hover:bg-gray-800'
                      }`}
                      aria-label={`${plan.cta} with the ${plan.name} plan`}
                    >
                      {plan.cta} <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : plan.planKey === 'pro' ? (
                    <button
                      onClick={handleProCheckout}
                      disabled={isLoading}
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-lg text-sm font-medium bg-white text-black hover:bg-gray-100 disabled:opacity-70 transition-all duration-200"
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
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-lg text-sm font-medium bg-white text-black hover:bg-gray-100 transition-all duration-200"
                      aria-label={`${plan.cta} with the ${plan.name} plan`}
                    >
                      {plan.cta} <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* INR note when non-INR currency selected */}
        {currency.code !== 'INR' && (
          <p className="text-center text-[11px] text-subtle mt-6">
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
    { feature: 'Self-hosted Deployment', os: true, pro: false, ent: false },
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
    if (val === true) return <Check className="w-4 h-4 text-black mx-auto" />;
    if (val === false) return <X className="w-4 h-4 text-gray-300 mx-auto" />;
    return <span className="text-xs text-secondary">{val}</span>;
  }

  return (
    <section className="py-24 bg-accents-1">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12">
          <p className="text-[10px] uppercase tracking-[0.2em] text-subtle font-semibold mb-3">Compare</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-black">Feature Comparison</h2>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-4 border-b border-gray-100 bg-accents-1">
            <div className="p-4" />
            <div className="p-4 text-center border-l border-gray-100">
              <p className="text-[10px] uppercase tracking-widest text-subtle font-semibold">Open Source</p>
              <p className="text-lg font-bold tracking-tighter mt-0.5">Free</p>
            </div>
            <div className="p-4 text-center border-l border-gray-100 bg-black/5">
              <p className="text-[10px] uppercase tracking-widest text-black font-semibold">Pro</p>
              <p className="text-lg font-bold tracking-tighter mt-0.5">$30<span className="text-xs font-normal text-secondary">/mo</span></p>
            </div>
            <div className="p-4 text-center border-l border-gray-100">
              <p className="text-[10px] uppercase tracking-widest text-subtle font-semibold">Enterprise</p>
              <p className="text-lg font-bold tracking-tighter mt-0.5">$100<span className="text-xs font-normal text-secondary">/mo</span></p>
            </div>
          </div>


          {/* Rows */}
          {rows.map((row, i) => (
            <div key={row.feature} className={`grid grid-cols-4 ${i < rows.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-accents-1 transition-colors`}>
              <div className="p-4 text-sm text-black font-medium">{row.feature}</div>
              <div className="p-4 text-center border-l border-gray-50">{renderCell(row.os)}</div>
              <div className="p-4 text-center border-l border-gray-50 bg-black/[0.02]">{renderCell(row.pro)}</div>
              <div className="p-4 text-center border-l border-gray-50">{renderCell(row.ent)}</div>
            </div>
          ))}
        </div>

        <p className="text-center text-[11px] text-subtle mt-4">
          * Open Source unlimited leads require your own Google Places API keys and Groq credits.
        </p>
      </div>
    </section>
  );
}

/* ═══════════════ FAQ Section ═══════════════ */

function FaqSection() {
  const faqs = [
    {
      q: 'Is the platform truly free to self-host?',
      a: 'Absolutely. The entire Cold Scout codebase is open source under the MIT license. Clone the GitHub repository, set up your own API keys (Google Places, Groq, Brevo, etc.), and deploy on your own infrastructure at zero cost. You only pay for the third-party API usage on your own accounts.',
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
    <section className="py-24 bg-white">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-12">
          <p className="text-[10px] uppercase tracking-[0.2em] text-subtle font-semibold mb-3">FAQ</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-black">Common Questions</h2>
        </div>

        <div className="space-y-3">
          {faqs.map((faq) => (
            <FaqItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════ CTA Banner ═══════════════ */

function CtaBanner() {
  return (
    <section className="py-24 bg-accents-1">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-black mb-4">
          Start building today
        </h2>
        <p className="text-secondary text-lg max-w-xl mx-auto mb-10">
          Whether you want full control with self-hosting or instant access with our
          managed API — Cold Scout has you covered.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="https://github.com/colddsam/coldscout.git"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-white text-black px-6 py-3 rounded-lg text-sm font-medium border border-gray-200 hover:border-black hover:shadow-vercel transition-all"
          >
            <Github className="w-4 h-4" />
            Clone Repository
          </a>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 bg-black text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-gray-800 transition-all hover:shadow-vercel-hover"
          >
            Get API Access <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}


/* ═══════════════ Main Pricing Page ═══════════════ */

const LD_FAQ_PRICING = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Is the platform truly free to self-host?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Absolutely. The entire Cold Scout codebase is open source under the MIT license. Clone the GitHub repository, set up your own API keys (Google Places, Groq, Brevo, etc.), and deploy on your own infrastructure at zero cost.',
      },
    },
    {
      '@type': 'Question',
      name: 'What do I get with the Pro plan?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The Pro plan gives you instant access to our pre-configured, managed API server and MCP server — no deployment, no Docker, no environment setup. You get a ready-to-use API key and start generating leads immediately.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I cancel my subscription anytime?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Both Pro and Enterprise plans are billed monthly with no long-term contracts. Cancel anytime from your dashboard. Your access continues until the end of the current billing period.',
      },
    },
    {
      '@type': 'Question',
      name: 'What happens if I exceed the 2,000 leads/month on Pro?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'You will receive a notification when you approach your limit. Once reached, the pipeline pauses until the next billing cycle. You can upgrade to Enterprise at any time for unlimited leads.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does the Enterprise plan differ for agencies?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Enterprise customers get a dedicated API instance, custom ICP model training tailored to their niche, white-label email templates, and priority support with a 4-hour response SLA.',
      },
    },
  ],
};

const LD_BREADCRUMB_PRICING = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://coldscout.colddsam.com/',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Pricing',
      item: 'https://coldscout.colddsam.com/pricing',
    },
  ],
};

export default function Pricing() {
  const [currency, setCurrency] = useState<CurrencyInfo>(CURRENCIES[0]);

  useSEO({
    title: 'Pricing — Cold Scout AI Lead Generation',
    description:
      'Simple, transparent pricing for Cold Scout. Free open-source self-hosting, Pro managed API at $30/month, and Enterprise plans for agencies. No hidden fees.',
    canonical: 'https://coldscout.colddsam.com/pricing',
    keywords:
      'Cold Scout pricing, AI lead generation pricing, lead generation SaaS cost, open source lead tool, managed API pricing, enterprise lead generation',
  });

  return (
    <div className="bg-white text-black font-sans antialiased">
      <JsonLd data={LD_FAQ_PRICING} id="faq-pricing" />
      <JsonLd data={LD_BREADCRUMB_PRICING} id="breadcrumb-pricing" />
      <PublicNavbar />
      <PricingHero currency={currency} onCurrencyChange={setCurrency} />
      <PricingCards currency={currency} />
      <ComparisonTable />
      <FaqSection />
      <CtaBanner />
      <PublicFooter />
    </div>
  );
}


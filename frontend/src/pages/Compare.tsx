/**
 * Comparison page — Cold Scout vs major B2B lead gen tools.
 *
 * Comparison URLs are extremely high-intent for AEO. Answer engines often
 * surface comparison pages above generic product pages for queries like
 * "Cold Scout vs Apollo" or "Apollo alternatives".
 */
import { Link } from 'react-router-dom';
import { Check, X, Scale, ArrowRight } from 'lucide-react';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import { useSEO } from '../hooks/useSEO';
import JsonLd from '../components/seo/JsonLd';
import { SITE } from '../lib/seo/site';
import { BASE_PRICING } from '../lib/seo/pricing';
import {
  breadcrumbSchema,
  webPageSchema,
  faqSchema,
} from '../lib/seo/schemas';
import { buildOgImage } from '../lib/seo/og';
import { COMPARE_FAQS } from '../lib/seo/page-data';

const COMPARE_URL = `${SITE.url}/compare`;

interface Tool {
  name: string;
  pricingFloor: string;
  primaryStrength: string;
  primaryWeakness: string;
  features: { label: string; value: string | boolean }[];
}

const TOOLS: Tool[] = [
  {
    name: 'Cold Scout',
    pricingFloor: 'Free (self-host)',
    primaryStrength: 'Open-source AI pipeline tied to Google Maps; MCP server included.',
    primaryWeakness: 'No native CRM sync yet; not optimized for SaaS-to-SaaS contact targeting.',
    features: [
      { label: 'Open source', value: true },
      { label: 'Self-hostable', value: true },
      { label: 'AI qualification (Llama)', value: true },
      { label: 'MCP server for AI agents', value: true },
      { label: 'Google Maps discovery', value: true },
      { label: 'B2B contact database', value: false },
      { label: 'Native CRM sync', value: 'Roadmap' },
      { label: 'Starting price', value: `Free / ₹${BASE_PRICING.pro.inrPerMonth}/mo` },
    ],
  },
  {
    name: 'Apollo',
    pricingFloor: '~$50/seat/mo',
    primaryStrength: 'Largest B2B contact database (260M+ contacts).',
    primaryWeakness: 'Closed-source; per-seat pricing scales aggressively with credits.',
    features: [
      { label: 'Open source', value: false },
      { label: 'Self-hostable', value: false },
      { label: 'AI qualification (Llama)', value: false },
      { label: 'MCP server for AI agents', value: false },
      { label: 'Google Maps discovery', value: false },
      { label: 'B2B contact database', value: true },
      { label: 'Native CRM sync', value: true },
      { label: 'Starting price', value: '~$50/seat/mo' },
    ],
  },
  {
    name: 'Outreach',
    pricingFloor: '~$130/seat/mo (annual)',
    primaryStrength: 'Enterprise-grade sequencing, Salesforce sync, mature analytics.',
    primaryWeakness: 'Annual contracts; only economic for revenue teams of 20+.',
    features: [
      { label: 'Open source', value: false },
      { label: 'Self-hostable', value: false },
      { label: 'AI qualification (Llama)', value: false },
      { label: 'MCP server for AI agents', value: false },
      { label: 'Google Maps discovery', value: false },
      { label: 'B2B contact database', value: false },
      { label: 'Native CRM sync', value: true },
      { label: 'Starting price', value: '~$130/seat/mo' },
    ],
  },
  {
    name: 'Instantly',
    pricingFloor: '~$30/mo',
    primaryStrength: 'Affordable, deliverability-first, unlimited inboxes.',
    primaryWeakness: 'Lighter on data — bring your own list.',
    features: [
      { label: 'Open source', value: false },
      { label: 'Self-hostable', value: false },
      { label: 'AI qualification (Llama)', value: false },
      { label: 'MCP server for AI agents', value: false },
      { label: 'Google Maps discovery', value: false },
      { label: 'B2B contact database', value: false },
      { label: 'Native CRM sync', value: 'Limited' },
      { label: 'Starting price', value: '~$30/mo' },
    ],
  },
];

const LD_BREADCRUMB = breadcrumbSchema(
  [
    { name: 'Home', url: `${SITE.url}/` },
    { name: 'Compare', url: COMPARE_URL },
  ],
  COMPARE_URL,
);

const LD_WEBPAGE = webPageSchema({
  url: COMPARE_URL,
  name: 'Cold Scout vs Apollo vs Outreach vs Instantly — Comparison',
  description:
    'Honest side-by-side comparison of Cold Scout against Apollo, Outreach, and Instantly. Pricing, AI features, data sources, and where each tool wins.',
});

const LD_FAQ = faqSchema(COMPARE_FAQS, COMPARE_URL);

function renderCell(val: string | boolean) {
  if (val === true) return <Check className="w-4 h-4 text-white mx-auto" />;
  if (val === false) return <X className="w-4 h-4 text-white/20 mx-auto" />;
  return <span className="text-xs text-[#B0B0B0]">{val}</span>;
}

export default function Compare() {
  useSEO({
    title: 'Cold Scout vs Apollo vs Outreach vs Instantly — Comparison',
    description:
      'Honest side-by-side comparison of Cold Scout against Apollo, Outreach, and Instantly. Pricing, AI features, data sources, and where each tool wins.',
    canonical: COMPARE_URL,
    keywords:
      'Cold Scout vs Apollo, Apollo alternative, Outreach alternative, Instantly alternative, B2B lead generation comparison, open source lead generation',
    ogImage: buildOgImage({
      title: 'Cold Scout vs the alternatives',
      subtitle: 'Apollo, Outreach, Instantly compared honestly',
      badge: 'COMPARE',
    }),
  });

  return (
    <div className="bg-black text-white font-sans antialiased">
      <JsonLd data={LD_WEBPAGE} id="webpage-compare" />
      <JsonLd data={LD_BREADCRUMB} id="breadcrumb-compare" />
      <JsonLd data={LD_FAQ} id="faq-compare" />
      <PublicNavbar />

      <section className="relative pt-32 pb-12 bg-black">
        <div className="absolute inset-0 noise-overlay opacity-[0.15]" />
        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 border border-white/10 rounded-full px-4 py-1.5 mb-6 bg-white/[0.03]">
            <Scale className="w-3.5 h-3.5 text-white" />
            <span className="text-xs font-medium text-[#B0B0B0]">Comparison</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tighter text-white leading-[0.95] mb-5">
            Cold Scout vs<br />
            <span className="text-gradient">the alternatives.</span>
          </h1>
          <p className="text-lg text-[#B0B0B0] max-w-2xl mx-auto">
            An honest comparison of how Cold Scout stacks up against Apollo, Outreach, and Instantly —
            and where each tool actually wins.
          </p>
        </div>
      </section>

      <section className="py-12 bg-black">
        <div className="max-w-6xl mx-auto px-6">
          <div className="overflow-x-auto pb-4">
            <div className="bg-surface-2 border border-white/[0.08] rounded-2xl overflow-hidden min-w-[900px]">
              <div className="grid grid-cols-5 border-b border-white/[0.08] bg-white/[0.02]">
                <div className="p-4" />
                {TOOLS.map((t, i) => (
                  <div
                    key={t.name}
                    className={`p-4 text-center border-l border-white/[0.08] ${i === 0 ? 'bg-white/[0.03]' : ''}`}
                  >
                    <p className={`text-[10px] uppercase tracking-widest font-semibold ${i === 0 ? 'text-white' : 'text-[#8A8A8A]'}`}>
                      {t.name}
                    </p>
                    <p className="text-sm font-bold tracking-tight mt-1 text-white">{t.pricingFloor}</p>
                  </div>
                ))}
              </div>
              {TOOLS[0].features.map((feat, fi) => (
                <div
                  key={feat.label}
                  className={`grid grid-cols-5 ${fi < TOOLS[0].features.length - 1 ? 'border-b border-white/[0.03]' : ''} hover:bg-white/[0.02]`}
                >
                  <div className="p-4 text-sm text-white font-medium">{feat.label}</div>
                  {TOOLS.map((t, i) => (
                    <div
                      key={t.name}
                      className={`p-4 text-center border-l border-white/[0.03] ${i === 0 ? 'bg-white/[0.02]' : ''}`}
                    >
                      {renderCell(t.features[fi].value)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-surface-1">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tighter text-white text-center mb-10">
            Where each one wins
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {TOOLS.map((t) => (
              <div key={t.name} className="border border-white/[0.08] bg-surface-2 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-2">{t.name}</h3>
                <p className="text-sm text-[#B0B0B0] mb-3">
                  <strong className="text-white">Wins at: </strong>
                  {t.primaryStrength}
                </p>
                <p className="text-sm text-[#B0B0B0]">
                  <strong className="text-white">Trade-off: </strong>
                  {t.primaryWeakness}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-black">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tighter text-white mb-4">
            Want the deeper write-up?
          </h2>
          <p className="text-[#B0B0B0] mb-8">
            Read the full editorial comparison on the blog — or skip ahead to the pricing page.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/blog/cold-scout-vs-apollo-vs-outreach"
              className="inline-flex items-center gap-2 border border-white/15 text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-white/10"
            >
              Read full comparison <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 bg-white text-black px-6 py-3 rounded-full text-sm font-medium hover:bg-gray-200"
            >
              See pricing <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

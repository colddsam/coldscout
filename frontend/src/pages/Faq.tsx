/**
 * Standalone FAQ page.
 *
 * The `/faq` URL is a high-AEO target on its own — answer engines often surface
 * dedicated FAQ pages above scattered FAQ blocks on product pages. The previous
 * /faq → /pricing#faq redirect has been removed; this page is now the canonical
 * destination, with an exhaustive FAQPage JSON-LD payload.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, HelpCircle } from 'lucide-react';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import { useSEO } from '../hooks/useSEO';
import JsonLd from '../components/seo/JsonLd';
import { SITE } from '../lib/seo/site';
import { BASE_PRICING } from '../lib/seo/pricing';
import {
  faqSchema,
  breadcrumbSchema,
  webPageSchema,
} from '../lib/seo/schemas';
import { buildOgImage } from '../lib/seo/og';
import {
  staggerContainer, staggerItem, accordionContent, defaultViewport,
} from '../lib/motion';

const FAQ_URL = `${SITE.url}/faq`;

const FAQS = [
  {
    section: 'Product',
    items: [
      {
        q: 'What is Cold Scout?',
        a: 'Cold Scout is an open-source AI lead generation platform that discovers local businesses on Google Maps, qualifies them with Llama 3 models, and drafts personalized cold emails. It automates the entire outreach pipeline from search to inbox.',
      },
      {
        q: 'How does Cold Scout discover leads?',
        a: 'Cold Scout uses the Google Places API to search for businesses matching your Ideal Customer Profile (industry, location, rating, review count). It tiles geographies into grid cells to bypass per-query result caps, dedups by place_id, and enriches each lead with website, phone, and social profiles.',
      },
      {
        q: 'What AI models power Cold Scout?',
        a: 'Cold Scout uses Groq-hosted Llama 3.3 70B for qualification and personalized email generation, and Llama 3.1 8B for fast scoring tasks. Groq\'s low latency lets the pipeline score thousands of leads per minute.',
      },
      {
        q: 'Can AI agents like Claude or GPT use Cold Scout?',
        a: 'Yes. Cold Scout exposes a Model Context Protocol (MCP) server. Any MCP-aware client (Claude Desktop, Claude Code, Cursor, Cline) can call lead discovery, qualification, and email generation as native tools.',
      },
    ],
  },
  {
    section: 'Pricing & Plans',
    items: [
      {
        q: 'Is the platform truly free to self-host?',
        a: 'Yes. Download the OSS package from GitHub Releases, plug in your own API keys (Google Places, Groq, Brevo — all have free tiers), and run it. Your monthly bill is whatever the underlying APIs cost you on your own accounts. Cold Scout itself is free under an open-source license.',
      },
      {
        q: 'What do I get with the Pro plan?',
        a: `Pro (₹${BASE_PRICING.pro.inrPerMonth}/month) is the same pipeline pre-deployed for you — managed API + MCP server, 2,000 leads per month, AI qualification and email generation, dashboard analytics, email support with a 48-hour response SLA, and a 99.5% uptime SLA. No Docker, no environment setup.`,
      },
      {
        q: 'What does Enterprise add over Pro?',
        a: `Enterprise (₹${BASE_PRICING.enterprise.inrPerMonth.toLocaleString()}/month) gives you a dedicated API instance (not shared infrastructure), unlimited leads, custom ICP model training tuned to your niche, white-label email templates, priority support with a 4-hour response SLA, and a dedicated account manager.`,
      },
      {
        q: 'Can I cancel anytime?',
        a: 'Yes. Both Pro and Enterprise are billed monthly with no long-term contracts. Cancel from your dashboard at any time — access continues until the end of the current billing period and your data remains exportable.',
      },
      {
        q: 'What happens if I exceed 2,000 leads on Pro?',
        a: 'You get a notification when you approach the limit. Once reached, the pipeline pauses until the next billing cycle. You can upgrade to Enterprise at any time for unlimited leads, or temporarily run the OSS package on your own keys.',
      },
    ],
  },
  {
    section: 'Integration & Setup',
    items: [
      {
        q: 'How do I connect Cold Scout to my AI agent?',
        a: 'Cold Scout ships an MCP server. On Pro, generate an API key from the dashboard\'s MCP settings and add the server to your AI client\'s MCP config. On OSS, the local server runs at http://localhost:8000/mcp by default.',
      },
      {
        q: 'Do you integrate with HubSpot, Pipedrive, or Salesforce?',
        a: 'Native CRM sync is on the public roadmap and shipping next quarter. In the meantime, every lead is exportable as CSV/Excel from the dashboard, and the FastAPI backend exposes a REST API you can wire into any CRM via Zapier, Make, or a small custom worker.',
      },
      {
        q: 'Which email provider does Cold Scout use?',
        a: 'Cold Scout sends through Brevo (Sendinblue) SMTP. Brevo handles IP reputation, DKIM/SPF/DMARC alignment, and provides automatic unsubscribe handling — all required for compliant cold outreach at volume.',
      },
    ],
  },
  {
    section: 'Compliance & Data',
    items: [
      {
        q: 'Is Cold Scout GDPR compliant?',
        a: 'Yes. Cold Scout is built with GDPR, CCPA, and CAN-SPAM in mind. Every outreach email includes a one-click unsubscribe footer. Data deletion requests are honored end-to-end. The platform implements ethical scraping with rate limiting and respects robots.txt directives.',
      },
      {
        q: 'Where is my data stored?',
        a: 'On the Pro and Enterprise plans, data is stored in our managed PostgreSQL instance (Supabase) in the Asia-South region by default. Enterprise customers can request EU- or US-hosted instances. On the OSS plan, your data sits in your own database — we never see it.',
      },
      {
        q: 'How do I delete my data?',
        a: 'Use /delete-data on coldscout.colddsam.com to submit a deletion request, or email admin@colddsam.com. We honor GDPR Article 17 right-to-erasure within 30 days, but typically much faster.',
      },
    ],
  },
];

const FLAT_FAQS = FAQS.flatMap((s) => s.items);

const LD_FAQ = faqSchema(FLAT_FAQS, FAQ_URL);

const LD_BREADCRUMB = breadcrumbSchema(
  [
    { name: 'Home', url: `${SITE.url}/` },
    { name: 'FAQ', url: FAQ_URL },
  ],
  FAQ_URL,
);

const LD_WEBPAGE = webPageSchema({
  url: FAQ_URL,
  name: 'FAQ — Cold Scout AI Lead Generation Platform',
  description:
    'Frequently asked questions about Cold Scout — product capabilities, pricing tiers, integrations, MCP server, AI models, deliverability, and GDPR compliance.',
});

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      variants={staggerItem}
      className="border border-white/[0.08] rounded-2xl overflow-hidden hover:border-white/15 bg-surface-2"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] transition-colors text-left"
      >
        <span className="text-sm font-semibold text-white pr-4">{q}</span>
        <ChevronDown
          className={`w-4 h-4 text-[#8A8A8A] flex-shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
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
            <p className="px-5 pb-5 text-sm text-[#B0B0B0] leading-relaxed border-t border-white/[0.08] pt-4">
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Faq() {
  useSEO({
    title: 'FAQ — Cold Scout AI Lead Generation Platform',
    description:
      'Frequently asked questions about Cold Scout — product capabilities, pricing tiers, integrations, MCP server, AI models, deliverability, and GDPR compliance.',
    canonical: FAQ_URL,
    keywords:
      'Cold Scout FAQ, AI lead generation FAQ, MCP server FAQ, Cold Scout pricing FAQ, open source lead generation, GDPR cold email',
    ogImage: buildOgImage({
      title: 'Cold Scout FAQ',
      subtitle: 'Product, pricing, integrations, compliance — quick answers',
      badge: 'FAQ',
    }),
  });

  return (
    <div className="bg-black text-white font-sans antialiased">
      <JsonLd data={LD_FAQ} id="faq-page" />
      <JsonLd data={LD_BREADCRUMB} id="breadcrumb-faq" />
      <JsonLd data={LD_WEBPAGE} id="webpage-faq" />
      <PublicNavbar />

      <section className="relative pt-32 pb-12 bg-black">
        <div className="absolute inset-0 noise-overlay opacity-[0.15]" />
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 border border-white/10 rounded-full px-4 py-1.5 mb-6 bg-white/[0.03]">
            <HelpCircle className="w-3.5 h-3.5 text-white" />
            <span className="text-xs font-medium text-[#B0B0B0]">FAQ</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tighter text-white leading-[0.95] mb-5">
            Frequently asked
            <br />
            <span className="text-gradient">questions.</span>
          </h1>
          <p className="text-lg text-[#B0B0B0]">
            Quick answers about Cold Scout's product, pricing, integrations, and compliance.
          </p>
        </div>
      </section>

      <section className="py-12 bg-black">
        <div className="max-w-3xl mx-auto px-6 space-y-12">
          {FAQS.map((sec) => (
            <div key={sec.section}>
              <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#8A8A8A] font-semibold mb-4">
                {sec.section}
              </h2>
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                whileInView="visible"
                viewport={defaultViewport}
                className="space-y-3"
              >
                {sec.items.map((item) => (
                  <FaqItem key={item.q} q={item.q} a={item.a} />
                ))}
              </motion.div>
            </div>
          ))}
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

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
// BASE_PRICING is now imported transitively via src/lib/seo/faq.ts (the
// canonical Q/A source). Kept here only as a marker that we no longer need
// the direct import — TypeScript will error on any stale reference.
import {
  faqSchema,
  breadcrumbSchema,
  webPageSchema,
} from '../lib/seo/schemas';
import { buildOgImage } from '../lib/seo/og';
import {
  staggerContainer, staggerItem, accordionContent, defaultViewport,
} from '../lib/motion';

import { FAQ_SECTIONS, ALL_FAQS } from '../lib/seo/faq';

const FAQ_URL = `${SITE.url}/faq`;

// Canonical FAQ source lives in src/lib/seo/faq.ts so the landing-page
// snippet stays in sync with this page — Google de-dupes overlapping
// FAQPage schemas, and AEO citations (Perplexity, ChatGPT) need one
// consistent answer per question.
const FAQS = FAQ_SECTIONS;
const FLAT_FAQS = ALL_FAQS;

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

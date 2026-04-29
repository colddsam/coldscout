import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSEO } from '../hooks/useSEO';
import JsonLd from '../components/seo/JsonLd';
import { Headphones, Mail, Clock, BookOpen, Zap, AlertCircle, MessageSquare } from 'lucide-react';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import { fadeInUp, staggerContainer, staggerItem, defaultViewport } from '../lib/motion';

const LD_BREADCRUMB = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://coldscout.colddsam.com/' },
    { '@type': 'ListItem', position: 2, name: 'Customer Support', item: 'https://coldscout.colddsam.com/support' },
  ],
};

const LD_SUPPORT = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  name: 'Customer Support — Cold Scout',
  description: 'Get help with Cold Scout. Reach our support team via email or explore our self-service resources.',
  publisher: {
    '@type': 'Organization',
    name: 'Cold Scout',
    logo: 'https://coldscout.colddsam.com/web-app-manifest-512x512.png',
  },
};

const LD_FAQ_SUPPORT = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How do I contact Cold Scout support?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Email us at admin@colddsam.com for technical and general support, or for billing and account inquiries. Include your account email, a description of the issue, and any relevant screenshots for fastest resolution.',
      },
    },
    {
      '@type': 'Question',
      name: 'What are Cold Scout support response times?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Critical issues (platform outages, data loss): within 4 hours. Standard issues (bugs, setup errors, billing): within 24 hours. General enquiries (feature requests, questions): within 72 hours. Response times are measured during business hours, Monday through Friday.',
      },
    },
    {
      '@type': 'Question',
      name: 'What can Cold Scout support help with?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Our support team assists with platform setup and onboarding, AI pipeline and automation troubleshooting, account and billing management, and reporting bugs or technical errors.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do I escalate an unresolved Cold Scout support ticket?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'If your issue has not been resolved within the expected response window, reply to your original support thread and add "ESCALATE" in the subject line. A senior team member will review your case and respond within 24 hours.',
      },
    },
  ],
};

export default function Support() {
  useSEO({
    title: 'Customer Support — Cold Scout',
    description: 'Need help with Cold Scout? Contact our support team or browse self-service resources for setup, billing, and platform questions.',
    canonical: 'https://coldscout.colddsam.com/support',
    index: true,
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <JsonLd data={LD_BREADCRUMB} id="support-breadcrumb" />
      <JsonLd data={LD_SUPPORT} id="support-page" />
      <JsonLd data={LD_FAQ_SUPPORT} id="support-faq" />

      {/* Background layer */}
      <div className="absolute inset-0 noise-overlay opacity-[0.15]" />
      {/* Background glow effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-96 bg-white rounded-full blur-[120px] opacity-[0.02] pointer-events-none -z-10" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-white rounded-full blur-[150px] opacity-[0.01] pointer-events-none -z-10" />

      <PublicNavbar />

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24 relative z-10">

        {/* Page Header */}
        <motion.div className="text-center mb-16" variants={fadeInUp} initial="hidden" animate="visible">
          <div className="inline-flex items-center justify-center p-3 bg-white/5 border border-white/10 rounded-2xl mb-6 shadow-glow-white animate-float">
            <Headphones className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-gradient">Customer Support</h1>
          <p className="text-[#8A8A8A] text-lg max-w-2xl mx-auto">
            We're here to help. Whether you have a technical issue, billing question, or just need some guidance — our support team has you covered.
          </p>
        </motion.div>

        <motion.div className="space-y-8" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={defaultViewport}>

          {/* Contact Us */}
          <motion.section className="bg-surface-2 rounded-2xl p-8 border border-white/[0.08] card-glow text-left" variants={staggerItem}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-white/5 rounded-lg">
                <Mail className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-2xl font-semibold text-white">1. How to Reach Us</h2>
            </div>
            <div className="prose prose-sm max-w-none text-[#B0B0B0] prose-invert">
              <p>
                Our primary support channel is email. Send us a detailed message and we'll get back to you as quickly as possible. To help us resolve your issue faster, please include your account email, a description of the problem, and any relevant screenshots.
              </p>
            </div>
            <div className="mt-6 grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.05] hover:border-white/10 transition-colors">
                <p className="text-xs font-semibold text-white uppercase tracking-wider mb-1">General & Technical Support</p>
                <a href="mailto:admin@colddsam.com" className="text-white font-medium hover:underline transition-colors text-sm">
                  admin@colddsam.com
                </a>
                <p className="text-xs text-[#8A8A8A] mt-1">Setup, bugs, AI pipeline issues</p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.05] hover:border-white/10 transition-colors">
                <p className="text-xs font-semibold text-white uppercase tracking-wider mb-1">Billing & Account</p>
                <a href="mailto:admin@colddsam.com" className="text-white font-medium hover:underline transition-colors text-sm">
                  admin@colddsam.com
                </a>
                <p className="text-xs text-[#8A8A8A] mt-1">Subscriptions, invoices, refunds</p>
              </div>
            </div>
          </motion.section>

          {/* Response Times */}
          <motion.section className="bg-surface-2 rounded-2xl p-8 border border-white/[0.08] card-glow text-left" variants={staggerItem}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-white/5 rounded-lg">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-2xl font-semibold text-white">2. Support Hours & Response Times</h2>
            </div>
            <div className="prose prose-sm max-w-none text-[#B0B0B0] prose-invert mb-6">
              <p>
                Our team operates across multiple time zones to provide timely support. Response times depend on the nature and severity of your request.
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] text-center">
                <p className="text-2xl font-bold text-white tracking-tight">≤ 4h</p>
                <p className="text-xs font-semibold text-white uppercase tracking-wider mt-1">Critical Issues</p>
                <p className="text-xs text-[#8A8A8A] mt-1">Platform outages, data loss</p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] text-center">
                <p className="text-2xl font-bold text-white tracking-tight">≤ 24h</p>
                <p className="text-xs font-semibold text-white uppercase tracking-wider mt-1">Standard Issues</p>
                <p className="text-xs text-[#8A8A8A] mt-1">Bugs, setup errors, billing</p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] text-center">
                <p className="text-2xl font-bold text-white tracking-tight">≤ 72h</p>
                <p className="text-xs font-semibold text-white uppercase tracking-wider mt-1">General Enquiries</p>
                <p className="text-xs text-[#8A8A8A] mt-1">Feature requests, questions</p>
              </div>
            </div>
            <p className="text-xs text-[#8A8A8A] mt-4">
              Response times are measured during business hours (Mon–Fri). Weekend tickets are handled on the next business day.
            </p>
          </motion.section>

          {/* What We Can Help With */}
          <motion.section className="bg-surface-2 rounded-2xl p-8 border border-white/[0.08] card-glow text-left" variants={staggerItem}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-white/5 rounded-lg">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-2xl font-semibold text-white">3. What We Can Help With</h2>
            </div>
            <div className="prose prose-sm max-w-none text-[#B0B0B0] prose-invert mb-4">
              <p>Our support team is trained to assist with all aspects of the Cold Scout platform, including but not limited to:</p>
            </div>
            <ul className="space-y-3">
              {[
                { icon: <Zap className="w-4 h-4" />, title: 'Platform Setup & Onboarding', desc: 'Connecting APIs, configuring lead discovery pipelines, and getting started with campaigns.' },
                { icon: <BookOpen className="w-4 h-4" />, title: 'AI Pipeline & Automation', desc: 'Troubleshooting AI qualification, email outreach sequences, and scheduler issues.' },
                { icon: <Mail className="w-4 h-4" />, title: 'Account & Billing', desc: 'Managing your subscription, updating payment methods, downloading invoices, and processing refunds.' },
                { icon: <AlertCircle className="w-4 h-4" />, title: 'Bugs & Technical Errors', desc: 'Reporting unexpected behavior, UI issues, or API errors you encounter in the platform.' },
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.08]">
                  <span className="mt-0.5 text-white shrink-0">{item.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="text-xs text-[#B0B0B0] mt-0.5">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </motion.section>

          {/* Self-Service Resources */}
          <motion.section className="bg-surface-2 rounded-2xl p-8 border border-white/[0.08] card-glow text-left" variants={staggerItem}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-white/5 rounded-lg">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-2xl font-semibold text-white">4. Self-Service Resources</h2>
            </div>
            <div className="prose prose-sm max-w-none text-[#B0B0B0] prose-invert">
              <p>
                Before reaching out, you may be able to find an instant answer in our documentation or platform guides. We keep these updated with every release.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="/docs"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                <BookOpen className="w-4 h-4" />
                Documentation
              </a>
              <a
                href="/pricing"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 text-white text-sm font-medium hover:bg-white/5 transition-colors"
              >
                Pricing & Plans
              </a>
              <a
                href="/terms"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 text-white text-sm font-medium hover:bg-white/5 transition-colors"
              >
                Terms of Service
              </a>
              <a
                href="/refund-policy"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 text-white text-sm font-medium hover:bg-white/5 transition-colors"
              >
                Refund Policy
              </a>
            </div>
          </motion.section>

          {/* Escalation */}
          <motion.section className="bg-white/[0.03] rounded-2xl p-8 border border-white/[0.08] card-glow text-left" variants={staggerItem}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-white/5 rounded-lg">
                <AlertCircle className="w-5 h-5 text-[#B0B0B0]" />
              </div>
              <h2 className="text-2xl font-semibold text-white">5. Escalation & Unresolved Issues</h2>
            </div>
            <div className="prose prose-sm max-w-none text-[#B0B0B0] prose-invert">
              <p>
                If your issue has not been resolved within the expected response window, or if you are not satisfied with the resolution provided, you may escalate by replying to your original support thread and adding <strong>"ESCALATE"</strong> in the subject line. A senior team member will review your case and respond within 24 hours.
              </p>
              <p className="mt-3">
                We take every support request seriously. Our goal is to ensure every Cold Scout user has a productive and frustration-free experience with the platform.
              </p>
            </div>
          </motion.section>

        </motion.div>
      </main>

      <PublicFooter />
    </div>
  );
}

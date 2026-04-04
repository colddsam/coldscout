import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSEO } from '../hooks/useSEO';
import JsonLd from '../components/seo/JsonLd';
import { CreditCard, XCircle, CheckCircle, AlertTriangle, Mail, ReceiptText } from 'lucide-react';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import { fadeInUp, staggerContainer, staggerItem, defaultViewport } from '../lib/motion';

const LD_BREADCRUMB = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://coldscout.colddsam.com/' },
    { '@type': 'ListItem', position: 2, name: 'Cancellation & Refund Policy', item: 'https://coldscout.colddsam.com/refund-policy' },
  ],
};

const LD_REFUND = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Cancellation & Refund Policy — Cold Scout',
  description: 'Understand how to cancel your Cold Scout subscription and when you are eligible for a refund.',
  publisher: {
    '@type': 'Organization',
    name: 'Cold Scout',
    logo: 'https://coldscout.colddsam.com/web-app-manifest-512x512.png',
  },
};

export default function RefundPolicy() {
  useSEO({
    title: 'Cancellation & Refund Policy — Cold Scout',
    description: 'Learn about Cold Scout\'s cancellation process, refund eligibility windows, and how to submit a refund request for your subscription.',
    canonical: 'https://coldscout.colddsam.com/refund-policy',
    index: true,
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-white text-black relative overflow-hidden">
      <JsonLd data={LD_BREADCRUMB} id="refund-breadcrumb" />
      <JsonLd data={LD_REFUND} id="refund-page" />

      {/* Background layer */}
      <div className="absolute inset-0 bg-dots pointer-events-none" />
      {/* Background glow effects */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-black rounded-full blur-[150px] opacity-10 pointer-events-none -z-10" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-black rounded-full blur-[150px] opacity-5 pointer-events-none -z-10" />

      <PublicNavbar />

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24 relative z-10">

        {/* Page Header */}
        <motion.div className="text-center mb-16" variants={fadeInUp} initial="hidden" animate="visible">
          <div className="inline-flex items-center justify-center p-3 bg-black rounded-2xl mb-6 shadow-[0_0_20px_rgba(0,0,0,0.1)] animate-float">
            <ReceiptText className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-gradient">Cancellation & Refund Policy</h1>
          <p className="text-[#666666] text-lg max-w-2xl mx-auto">
            We believe in transparency. This policy explains how cancellations work, when refunds apply, and how to submit a request — with no fine print.
          </p>
          <p className="text-xs text-[#999999] mt-4">Last updated: March 2026</p>
        </motion.div>

        <motion.div className="space-y-8" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={defaultViewport}>

          {/* Subscription Cancellation */}
          <motion.section className="bg-white rounded-2xl p-8 border border-[#eaeaea] card-glow text-left" variants={staggerItem}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-black/5 rounded-lg">
                <XCircle className="w-5 h-5 text-black" />
              </div>
              <h2 className="text-2xl font-semibold">1. Subscription Cancellation</h2>
            </div>
            <div className="prose prose-sm max-w-none text-[#666666]">
              <p>
                You may cancel your Cold Scout subscription at any time. Cancellation takes effect at the end of your current billing period — you will retain full access to all platform features until then.
              </p>
              <ul className="list-disc pl-5 mt-4 space-y-2">
                <li>Cancellation can be initiated from your <strong>Account Settings → Subscription</strong> page.</li>
                <li>Alternatively, email us at <a href="mailto:admin@colddsam.com" className="text-black hover:underline font-medium">admin@colddsam.com</a> with your account details and we will process it within 1 business day.</li>
                <li>After cancellation, your data is retained for <strong>30 days</strong> before permanent deletion, giving you time to export any leads or reports you need.</li>
                <li>Reactivating your subscription before the end of the billing period will immediately cancel the pending cancellation.</li>
              </ul>
            </div>
          </motion.section>

          {/* Refund Eligibility */}
          <motion.section className="bg-white rounded-2xl p-8 border border-[#eaeaea] card-glow text-left" variants={staggerItem}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-black/5 rounded-lg">
                <CheckCircle className="w-5 h-5 text-black" />
              </div>
              <h2 className="text-2xl font-semibold">2. Refund Eligibility</h2>
            </div>
            <div className="prose prose-sm max-w-none text-[#666666]">
              <p>We offer refunds in the following circumstances:</p>
            </div>
            <div className="mt-4 space-y-3">
              {[
                {
                  label: '7-Day Money-Back Guarantee',
                  desc: 'New subscribers on any paid plan may request a full refund within 7 days of the initial charge if the platform does not meet their expectations.',
                },
                {
                  label: 'Service Outage Credits',
                  desc: 'If Cold Scout experiences a verified platform-wide outage lasting more than 4 consecutive hours within a billing period, affected users are eligible for a prorated credit.',
                },
                {
                  label: 'Duplicate or Erroneous Charge',
                  desc: 'If you were charged more than once for the same billing period or incorrectly billed at the wrong price, we will issue a full refund for the duplicate amount immediately upon verification.',
                },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-[#fafafa] border border-[#eaeaea]">
                  <CheckCircle className="w-4 h-4 text-black mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-black">{item.label}</p>
                    <p className="text-xs text-[#666666] mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>

          {/* No-Refund Scenarios */}
          <motion.section className="bg-white rounded-2xl p-8 border border-[#eaeaea] card-glow text-left" variants={staggerItem}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-black/5 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-black" />
              </div>
              <h2 className="text-2xl font-semibold">3. Non-Refundable Situations</h2>
            </div>
            <div className="prose prose-sm max-w-none text-[#666666]">
              <p>Refunds will <strong>not</strong> be issued in the following cases:</p>
              <ul className="list-disc pl-5 mt-4 space-y-2">
                <li>Requests made after the 7-day new-subscriber window has elapsed.</li>
                <li>Partial use of a billing period — access to the platform is provided for the full paid period regardless of usage.</li>
                <li>Accounts suspended or terminated due to a violation of our <a href="/terms" className="text-black hover:underline font-medium">Terms of Service</a> (e.g., spam, abuse, or platform exploitation).</li>
                <li>Dissatisfaction resulting from incorrect configuration of the platform by the user.</li>
                <li>Requests for features not included in the subscribed plan tier.</li>
                <li>Third-party charges (e.g., Google Places API, SMTP provider costs) that are incurred outside of the Cold Scout platform.</li>
              </ul>
            </div>
            <div className="mt-6 inline-flex items-center px-3 py-1 bg-black text-white rounded-md text-sm font-medium border border-black">
              All refund decisions are made at Cold Scout's sole discretion.
            </div>
          </motion.section>

          {/* How to Request */}
          <motion.section className="bg-white rounded-2xl p-8 border border-[#eaeaea] card-glow text-left" variants={staggerItem}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-black/5 rounded-lg">
                <Mail className="w-5 h-5 text-black" />
              </div>
              <h2 className="text-2xl font-semibold">4. How to Request a Refund</h2>
            </div>
            <div className="prose prose-sm max-w-none text-[#666666]">
              <p>
                To submit a refund request, email us at the address below. To speed up processing, please include the following in your message:
              </p>
              <ul className="list-disc pl-5 mt-4 space-y-2">
                <li>The email address associated with your Cold Scout account.</li>
                <li>The date of the charge and the amount.</li>
                <li>The reason for your refund request.</li>
                <li>Any supporting screenshots or context that may help us process your case.</li>
              </ul>
              <p className="mt-4">
                We aim to process all refund requests within <strong>5–7 business days</strong>. Approved refunds are returned to the original payment method and may take an additional 3–5 business days to appear on your statement depending on your bank.
              </p>
            </div>
            <div className="mt-6 p-4 rounded-xl bg-[#fafafa] border border-[#eaeaea] flex items-center justify-between hover:bg-white hover:border-[#d4d4d4] transition-colors">
              <div>
                <p className="font-medium text-black text-sm">Refund & Billing Contact</p>
                <a href="mailto:admin@colddsam.com" className="text-black hover:underline font-medium text-sm transition-colors">
                  admin@colddsam.com
                </a>
              </div>
              <CreditCard className="w-5 h-5 text-[#999999] shrink-0" />
            </div>
          </motion.section>

          {/* Billing Disputes */}
          <motion.section className="bg-[#fafafa] rounded-2xl p-8 border border-[#eaeaea] card-glow text-left" variants={staggerItem}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-black/5 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-[#666666]" />
              </div>
              <h2 className="text-2xl font-semibold">5. Billing Disputes & Chargebacks</h2>
            </div>
            <div className="prose prose-sm max-w-none text-[#666666]">
              <p>
                We strongly encourage you to contact us directly before initiating a chargeback through your bank or payment provider. In many cases, we can resolve billing issues faster and without the delays that chargebacks introduce.
              </p>
              <p className="mt-3">
                Accounts with open or unresolved chargebacks may be temporarily suspended until the dispute is settled. If a chargeback is filed without prior contact, we reserve the right to contest it with documented transaction and access records.
              </p>
              <p className="mt-3">
                If you believe a charge is fraudulent or unauthorized, please contact us immediately at <a href="mailto:admin@colddsam.com" className="text-black hover:underline font-medium">admin@colddsam.com</a> — we will investigate and take action promptly.
              </p>
            </div>
          </motion.section>

        </motion.div>
      </main>

      <PublicFooter />
    </div>
  );
}

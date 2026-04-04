import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSEO } from '../hooks/useSEO';
import JsonLd from '../components/seo/JsonLd';
import { Scale, Target, AlertTriangle, Shield } from 'lucide-react';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import { fadeInUp, staggerContainer, staggerItem, defaultViewport } from '../lib/motion';

const LD_BREADCRUMB = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://coldscout.colddsam.com/' },
    { '@type': 'ListItem', position: 2, name: 'Terms of Service', item: 'https://coldscout.colddsam.com/terms' },
  ],
};

const LD_TERMS = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Terms of Service — Cold Scout',
  description: 'Rules and guidelines for using the Cold Scout AI Lead Generation platform.',
  publisher: {
    '@type': 'Organization',
    name: 'Cold Scout',
  },
};

export default function Terms() {
  useSEO({
    title: 'Terms of Service — Cold Scout',
    description: 'Please read our Terms of Service carefully. They govern your use of the Cold Scout platform and our AI lead generation services.',
    canonical: 'https://coldscout.colddsam.com/terms',
    index: true,
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-white text-black relative overflow-hidden">
      <JsonLd data={LD_BREADCRUMB} id="terms-breadcrumb" />
      <JsonLd data={LD_TERMS} id="terms-page" />
      {/* Background layer */}
      <div className="absolute inset-0 bg-dots pointer-events-none" />
      {/* Background glow effects */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-black rounded-full blur-[150px] opacity-10 pointer-events-none -z-10" />

      <PublicNavbar />

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24 relative z-10">
        <motion.div className="text-center mb-16" variants={fadeInUp} initial="hidden" animate="visible">
          <div className="inline-flex items-center justify-center p-3 bg-black rounded-2xl mb-6 shadow-[0_0_20px_rgba(0,0,0,0.1)] animate-float">
            <Scale className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Terms of Service</h1>
          <p className="text-[#666666] text-lg max-w-2xl mx-auto">
            Please read these rules carefully. They govern your use of the Cold Scout platform and services.
          </p>
        </motion.div>

        <motion.div className="grid gap-8" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={defaultViewport}>
          <motion.div className="bg-white rounded-2xl p-8 border border-[#eaeaea] card-glow" variants={staggerItem}>
            <div className="flex items-center gap-3 mb-4">
              <Target className="w-6 h-6 text-black" />
              <h2 className="text-2xl font-bold">1. Usage Rules</h2>
            </div>
            <p className="text-[#666666] mt-2 mb-4 leading-relaxed">
              By accessing Cold Scout, you agree to comply with these terms. Our software is provided for lawful B2B data prospecting and outreach automation. You are responsible for ensuring that your usage complies with your local regulations (e.g., GDPR, CCPA, CAN-SPAM).
            </p>
            <ul className="list-disc pl-5 space-y-2 text-[#666666]">
              <li>You must be at least 18 years old to use the platform.</li>
              <li>You must provide accurate and complete setup information.</li>
              <li>You are responsible for safeguarding your account credentials.</li>
            </ul>
          </motion.div>

          <motion.div className="bg-white rounded-2xl p-8 border border-[#eaeaea] card-glow" variants={staggerItem}>
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-6 h-6 text-black" />
              <h2 className="text-2xl font-bold">2. No Abuse</h2>
            </div>
            <p className="text-[#666666] mt-2 leading-relaxed">
              We maintain a strict zero-tolerance policy against platform abuse. You may not use Cold Scout to:
            </p>
            <ul className="list-disc pl-5 mt-4 space-y-2 text-[#666666]">
              <li>Send unsolicited, harassing, or threatening communications.</li>
              <li>Scrape or extract data for the purpose of reselling it as a standalone database.</li>
              <li>Attempt to bypass, exploit, or circumvent the platform's API rate limits or security measures.</li>
              <li>Distribute malware, phishing links, or illicit material.</li>
            </ul>
            <div className="mt-4 inline-flex items-center px-3 py-1 bg-black text-white rounded-md text-sm font-medium border border-black">
              Violators will face immediate termination without a refund.
            </div>
          </motion.div>


          <motion.div className="bg-[#fafafa] rounded-2xl p-8 border border-[#eaeaea] card-glow" variants={staggerItem}>
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-[#666666]" />
              <h2 className="text-2xl font-bold">3. Disclaimer</h2>
            </div>
            <p className="text-[#666666] mt-2 leading-relaxed text-sm">
              COLD SCOUT IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. WE DO NOT GUARANTEE THAT THE SERVICE WILL BE UNINTERRUPTED, COMPLETELY SECURE, OR FREE FROM ERRORS. IN NO EVENT SHALL COLD SCOUT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES RESULTING FROM YOUR USE OF THE PLATFORM.
            </p>
          </motion.div>
        </motion.div>
      </main>

      <PublicFooter />
    </div>
  );
}

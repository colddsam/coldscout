import { useEffect } from 'react';
import { motion } from 'framer-motion';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import { useSEO } from '../hooks/useSEO';
import JsonLd from '../components/seo/JsonLd';
import { fadeInUp, staggerContainer, staggerItem, defaultViewport } from '../lib/motion';
import { Shield, Mail, Database } from 'lucide-react';

const LD_BREADCRUMB = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://coldscout.colddsam.com/' },
    { '@type': 'ListItem', position: 2, name: 'Privacy Policy', item: 'https://coldscout.colddsam.com/privacy' },
  ],
};

const LD_PRIVACY = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Privacy Policy — Cold Scout',
  description: 'Learn how Cold Scout protects your personal and business data.',
  publisher: {
    '@type': 'Organization',
    name: 'Cold Scout',
    logo: 'https://coldscout.colddsam.com/web-app-manifest-512x512.png',
  },
};

export default function Privacy() {
  useSEO({
    title: 'Privacy Policy — Cold Scout',
    description: 'Our commitment to protecting your personal and business data. Read about how we handle information securely at Cold Scout.',
    canonical: 'https://coldscout.colddsam.com/privacy',
    index: true,
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-white text-black relative overflow-hidden">
      <JsonLd data={LD_BREADCRUMB} id="privacy-breadcrumb" />
      <JsonLd data={LD_PRIVACY} id="privacy-page" />
      {/* Background layer */}
      <div className="absolute inset-0 bg-grid pointer-events-none" />
      {/* Background glow effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-96 bg-black rounded-full blur-[120px] opacity-10 pointer-events-none -z-10" />

      <PublicNavbar />
      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24 relative z-10">
        <motion.div className="text-center mb-16" variants={fadeInUp} initial="hidden" animate="visible">
          <div className="inline-flex items-center justify-center p-3 bg-black rounded-2xl mb-6 shadow-[0_0_20px_rgba(0,0,0,0.1)] animate-float">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-gradient">Privacy Policy</h1>
          <p className="text-[#666666] text-lg max-w-2xl mx-auto">
            We value your privacy and are committed to protecting your personal data.
            This policy outlines how we handle your information securely.
          </p>
        </motion.div>

        <motion.div className="space-y-8" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={defaultViewport}>
          <motion.section className="bg-white rounded-2xl p-8 border border-[#eaeaea] card-glow text-left" variants={staggerItem}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-black/5 rounded-lg">
                <Database className="w-5 h-5 text-black" />
              </div>
              <h2 className="text-2xl font-semibold">1. What data we collect</h2>
            </div>
            <div className="prose prose-sm max-w-none text-[#666666]">
              <p>When you use Cold Scout, we may collect the following types of information:</p>
              <ul className="list-disc pl-5 mt-4 space-y-2">
                <li><strong>Account Information:</strong> Name, email address, and billing details provided during registration.</li>
                <li><strong>Usage Data:</strong> Information about how you interact with our platform, including features used, time spent, and performance metrics.</li>
                <li><strong>Lead Data:</strong> The data you process through our system specifically for the purpose of your business operations.</li>
              </ul>
            </div>
          </motion.section>

          <motion.section className="bg-white rounded-2xl p-8 border border-[#eaeaea] card-glow text-left" variants={staggerItem}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-black/5 rounded-lg">
                <Shield className="w-5 h-5 text-black" />
              </div>
              <h2 className="text-2xl font-semibold">2. How we use it</h2>
            </div>
            <div className="prose prose-sm max-w-none text-[#666666]">
              <p>We use the collected data to provide, maintain, and improve our services to you:</p>
              <ul className="list-disc pl-5 mt-4 space-y-2">
                <li>To operate and provide the Cold Scout platform services.</li>
                <li>To process transactions and send related information including invoices and confirmations.</li>
                <li>To send technical notices, updates, security alerts, and administrative messages.</li>
                <li>To respond to your comments, questions, and customer service requests.</li>
                <li>To analyze platform usage to iteratively improve our AI generation and lead scoring models.</li>
              </ul>
              <p className="mt-4">We explicitly <strong>do not sell</strong> your personal data or your lead data to third parties.</p>
            </div>
          </motion.section>

          <motion.section className="bg-white rounded-2xl p-8 border border-[#eaeaea] card-glow text-left" variants={staggerItem}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-black/5 rounded-lg">
                <Mail className="w-5 h-5 text-black" />
              </div>
              <h2 className="text-2xl font-semibold">3. Contact email</h2>
            </div>
            <div className="prose prose-sm max-w-none text-[#666666]">
              <p>If you have any questions, concerns, or requests regarding this Privacy Policy or your personal data, please don't hesitate to reach out to our privacy team.</p>
              <div className="mt-6 p-4 rounded-xl bg-[#fafafa] border border-[#eaeaea] flex items-center justify-between transition-colors hover:bg-white hover:border-[#d4d4d4]">
                <div>
                  <p className="font-medium text-black">Privacy & DPO Contact</p>
                  <a href="mailto:admin@colddsam.com" className="text-black hover:underline font-medium transition-colors">
                    admin@colddsam.com
                  </a>
                </div>
              </div>
            </div>
          </motion.section>
        </motion.div>

      </main>

      <PublicFooter />    </div>
  );
}

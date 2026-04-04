import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSEO } from '../hooks/useSEO';
import JsonLd from '../components/seo/JsonLd';
import { Trash2, Mail, CheckCircle2 } from 'lucide-react';
import PublicNavbar from '../components/layout/PublicNavbar';
import PublicFooter from '../components/layout/PublicFooter';
import { fadeInUp, staggerContainer, staggerItem, defaultViewport } from '../lib/motion';

/**
 * Breadcrumb schema for data deletion page.
 */
const LD_BREADCRUMB = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://coldscout.colddsam.com/' },
    { '@type': 'ListItem', position: 2, name: 'Data Deletion', item: 'https://coldscout.colddsam.com/delete-data' },
  ],
};

/**
 * Data deletion page component.
 *
 * This component handles the rendering of the data deletion page, including
 * the breadcrumb schema, SEO metadata, and the main content.
 */
export default function DataDeletion() {
  /**
   * Set SEO metadata for the page.
   *
   * @param {object} props - Component props.
   */
  useSEO({
    title: 'Data Deletion Request — Cold Scout',
    description: 'Learn how to request the permanent deletion of your account and associated data from the Cold Scout platform.',
    canonical: 'https://coldscout.colddsam.com/delete-data',
    index: false, // Legal/utility pages often don't need heavy indexing, but we'll keep it searchable if needed. Actually indexing=false is safer for specific data request pages unless they are marketing landing pages.
  });

  /**
   * Scroll to top of the page on mount.
   */
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-[#fafafa] text-black relative overflow-hidden">
      <JsonLd data={LD_BREADCRUMB} id="deletion-breadcrumb" />
      {/* Background layer */}
      <div className="absolute inset-0 bg-grid pointer-events-none" />
      <PublicNavbar />

      {/* Main Content */}
      <motion.main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-40 pb-24 relative z-10 flex flex-col items-center" variants={staggerContainer} initial="hidden" whileInView="visible" viewport={defaultViewport}>

        <motion.div variants={fadeInUp}>
          <div className="w-24 h-24 bg-black rounded-full flex items-center justify-center mb-8 border border-black shadow-[0_0_40px_rgba(0,0,0,0.1)] animate-float">
              <Trash2 className="w-10 h-10 text-white" />
          </div>
        </motion.div>

        <motion.div className="text-center mb-12" variants={staggerItem}>
          <h1 className="text-4xl font-bold tracking-tight mb-4">Request Data Deletion</h1>
          <p className="text-[#666666] text-lg max-w-xl mx-auto">
            We believe you should have complete control over your data. If you wish to permanently delete your account and all associated data, follow the instructions below.
          </p>
        </motion.div>

        <motion.div className="w-full bg-white rounded-2xl border border-[#eaeaea] shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden" variants={staggerItem}>
          <div className="p-8 border-b border-[#eaeaea]">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5 text-black" />
              How to delete your data
            </h2>
            <p className="text-[#666666] mb-6">
              To securely request the deletion of your account, teams, and generated leads, please send an email to our support team from the email address associated with your Cold Scout account.
            </p>

            <div className="bg-[#fafafa] border border-[#eaeaea] rounded-xl p-6 flex flex-col items-center hover:bg-white hover:shadow-minimal transition-all">
              <span className="text-sm font-bold text-[#999999] uppercase tracking-wider mb-2">Send an email to</span>
              <a href="mailto:admin@colddsam.com?subject=Data Deletion Request" className="text-2xl font-bold text-black hover:underline transition-colors">
                admin@colddsam.com
              </a>
            </div>
          </div>

          <div className="p-8 bg-[#fafafa]">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#999999] mb-4">What happens next?</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-black shrink-0 mt-0.5" />
                <span className="text-[#666666] text-sm">We will securely verify your identity to prevent unauthorized deletion.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-black shrink-0 mt-0.5" />
                <span className="text-[#666666] text-sm">Once verified, all your platform data (leads, campaigns, billing information) will be permanently eradicated within 30 days.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-black shrink-0 mt-0.5" />
                <span className="text-[#666666] text-sm">You will receive a final confirmation email once the process is complete.</span>
              </li>
            </ul>
          </div>
        </motion.div>


      </motion.main>

      <PublicFooter />
    </div>
  );
}

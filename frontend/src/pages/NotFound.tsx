import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Button from '../components/ui/Button';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';
import { staggerContainer, staggerItem, staggerItemScale } from '../lib/motion';

/**
 * A standard 404 overlay displayed automatically by React Router when a
 * user navigates to an invalid/unregistered route.
 */
export default function NotFound() {
  useSEO({
    title: '404 — Page Not Found | Cold Scout',
    description: 'This page does not exist. Return to Cold Scout to discover AI-powered lead generation.',
    index: false,
  });

  return (
    <motion.div className="min-h-screen flex items-center justify-center flex-col text-center space-y-6 bg-white" variants={staggerContainer} initial="hidden" animate="visible">
      <motion.div variants={staggerItemScale} className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
        <ShieldAlert className="w-10 h-10 text-black" />
      </motion.div>
      <motion.div variants={staggerItem}>
        <h1 className="text-5xl font-bold tracking-tight text-black mb-2">404</h1>
        <p className="text-gray-500 max-w-md mx-auto text-sm">
          The page you're looking for doesn't exist. Please return to the dashboard.
        </p>
      </motion.div>
      <motion.div variants={staggerItem}>
        <Link to="/" className="inline-block mt-4">
           <Button icon={<ArrowLeft className="w-4 h-4" />}>Return to Dashboard</Button>
        </Link>
      </motion.div>
    </motion.div>
  );
}

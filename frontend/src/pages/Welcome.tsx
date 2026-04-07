import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import Card from '../components/ui/Card';
import PublicFooter from '../components/layout/PublicFooter';
import ScrollReveal from '../components/ui/ScrollReveal';
import { useSEO } from '../hooks/useSEO';
import Logo from '../components/ui/Logo';
import {
  fadeInUp,
  staggerContainer,
  staggerContainerSlow,
  staggerItem,
  defaultViewport,
} from '../lib/motion';
import { DEFAULT_BOOKING_URL } from '../lib/constants';

import {
  Sparkles,
  Target,
  BarChart3,
  Clock,
  ArrowRight,
  CheckCircle,
  Calendar,
  MessageSquare,
} from 'lucide-react';

/**
 * Welcome page for clients.
 *
 * This is the landing page for users with the "client" role after authentication.
 * It provides an onboarding experience and explains the service offering.
 */
export default function Welcome() {
  const { user, logout } = useAuth();

  useSEO({
    title: 'Welcome — Cold Scout',
    description: 'Welcome to Cold Scout. Your AI-powered lead generation journey starts here.',
    canonical: 'https://coldscout.colddsam.com/welcome',
    index: false,
  });

  const features = [
    {
      icon: <Target className="w-5 h-5" />,
      title: 'Targeted Lead Discovery',
      description: 'AI identifies businesses that match your ideal customer profile.',
    },
    {
      icon: <Sparkles className="w-5 h-5" />,
      title: 'Smart Qualification',
      description: 'Every lead is scored and qualified before reaching you.',
    },
    {
      icon: <MessageSquare className="w-5 h-5" />,
      title: 'Personalized Outreach',
      description: 'AI-crafted emails tailored to each prospect\'s needs.',
    },
    {
      icon: <BarChart3 className="w-5 h-5" />,
      title: 'Real-time Analytics',
      description: 'Track open rates, replies, and conversions as they happen.',
    },
  ];

  const steps = [
    {
      number: '01',
      title: 'Schedule a Consultation',
      description: 'Book a call to discuss your target market and ideal customer profile.',
    },
    {
      number: '02',
      title: 'We Configure Your Pipeline',
      description: 'Our team sets up your AI-powered lead generation system.',
    },
    {
      number: '03',
      title: 'Qualified Leads Delivered',
      description: 'Receive warm, qualified leads directly to your inbox.',
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo — links to landing page */}
            <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
              <Logo size="md" />
            </Link>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                {user?.full_name || user?.email}
              </span>
              <Link
                to="/profile"
                className="text-sm text-gray-600 hover:text-black transition-colors"
              >
                Profile
              </Link>

              <button
                onClick={logout}
                className="text-sm text-gray-600 hover:text-black transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-40" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-gray-100 to-gray-200/50 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <motion.div className="max-w-3xl" variants={staggerContainer} initial="hidden" animate="visible">
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-600 mb-6">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Account created successfully
            </motion.div>

            <motion.h1 variants={fadeInUp} className="text-4xl sm:text-5xl font-bold tracking-tight text-black mb-6">
              Welcome to Cold Scout,{' '}
              <span className="text-gray-400">{user?.full_name?.split(' ')[0] || 'there'}!</span>
            </motion.h1>

            <motion.p variants={fadeInUp} className="text-lg text-gray-600 mb-8 max-w-2xl">
              You're one step away from accessing AI-powered lead generation that delivers
              qualified prospects directly to your pipeline.
            </motion.p>

            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4">
              <a
                href={DEFAULT_BOOKING_URL}
                target="_blank"

                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-black text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                <Calendar className="w-4 h-4" />
                Schedule Consultation
              </a>
              <Link
                to="/docs"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-gray-200 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Learn More
                <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gray-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-black mb-4">What You Get</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Our AI-powered system handles the entire lead generation process, from discovery to
              qualified outreach.
            </p>
          </div>

          <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" variants={staggerContainerSlow} initial="hidden" whileInView="visible" viewport={defaultViewport}>
            {features.map((feature, index) => (
              <motion.div key={index} variants={staggerItem}><Card className="p-6">
                <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center text-white mb-4">
                  {feature.icon}
                </div>
                <h3 className="font-semibold text-black mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-600">{feature.description}</p>
              </Card></motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-black mb-4">How It Works</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Getting started is simple. Here's what to expect.
            </p>
          </div>

          <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-8" variants={staggerContainerSlow} initial="hidden" whileInView="visible" viewport={defaultViewport}>
            {steps.map((step, index) => (
              <motion.div key={index} variants={staggerItem} className="relative">
                <div className="text-6xl font-bold text-gray-100 mb-4">{step.number}</div>
                <h3 className="font-semibold text-black mb-2">{step.title}</h3>
                <p className="text-sm text-gray-600">{step.description}</p>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 right-0 w-1/2 h-px bg-gray-200" />
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-black text-white">
        <ScrollReveal>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex justify-center mb-6">
            <Clock className="w-12 h-12 text-gray-400" />
          </div>
          <h2 className="text-2xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-gray-400 mb-8 max-w-xl mx-auto">
            Schedule a 15-minute call to discuss your lead generation goals and see how Cold Scout
            can help grow your business.
          </p>
          <a
            href={DEFAULT_BOOKING_URL}
            target="_blank"

            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-white text-black rounded-md text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            <Calendar className="w-4 h-4" />
            Book Your Consultation
          </a>
        </div>
        </ScrollReveal>
      </section>

      {/* Full footer matching the rest of the public site */}
      <PublicFooter />
    </div>
  );
}

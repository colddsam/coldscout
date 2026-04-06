/**
 * Public Demo Website Viewer.
 *
 * Renders an AI-generated landing page demo inside a sandboxed iframe.
 * This page is PUBLIC (no authentication required) — recipients click
 * the demo link directly from their email.
 *
 * Security:
 *   - The iframe uses sandbox="allow-scripts allow-same-origin" to permit
 *     Tailwind/Alpine.js execution while blocking navigation, forms, and popups.
 *   - The backend serves the HTML with strict CSP headers as a second layer.
 *   - The generated HTML's CSS/JS is fully isolated from our React app.
 */

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSEO } from '../hooks/useSEO';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function LeadDemoViewer() {
  const { leadId } = useParams<{ leadId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useSEO({
    title: 'Your Website Demo | Cold Scout',
    description: 'A custom website demo built for your business by Cold Scout.',
    index: false,
  });

  const demoUrl = `${API_BASE}/api/v1/public/demo/${leadId}`;

  return (
    <div className="relative w-screen h-screen bg-white overflow-hidden">
      {/* Sticky top banner */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black text-white px-4 py-3 flex items-center justify-between text-sm shadow-lg">
        <div className="flex items-center gap-3">
          <span className="font-bold tracking-tight">Cold Scout</span>
          <span className="hidden sm:inline text-gray-400">|</span>
          <span className="hidden sm:inline text-gray-300">
            This website demo was built for your business
          </span>
        </div>
        <Link
          to="/"
          className="bg-white text-black px-4 py-1.5 rounded-full text-xs font-bold hover:bg-gray-100 transition-colors whitespace-nowrap"
        >
          Claim This Website
        </Link>
      </div>

      {/* Loading state */}
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-40">
          <div className="text-center space-y-4">
            <div className="w-10 h-10 border-2 border-black border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-500 text-sm">Loading your website demo...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-40">
          <div className="text-center space-y-4 max-w-md mx-auto px-6">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
              <span className="text-2xl">🌐</span>
            </div>
            <h1 className="text-2xl font-bold text-black">Demo Not Available</h1>
            <p className="text-gray-500 text-sm leading-relaxed">
              This website demo may have expired or is still being generated.
              If you received this link in an email, please try again shortly.
            </p>
            <Link
              to="/"
              className="inline-block bg-black text-white px-6 py-2.5 rounded-full text-sm font-bold hover:bg-gray-800 transition-colors"
            >
              Visit Cold Scout
            </Link>
          </div>
        </div>
      )}

      {/* Sandboxed iframe */}
      <iframe
        src={demoUrl}
        title="Website Demo"
        className="w-full border-0"
        style={{ height: 'calc(100vh - 48px)', marginTop: '48px' }}
        sandbox="allow-scripts"
        loading="lazy"
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
      />
    </div>
  );
}

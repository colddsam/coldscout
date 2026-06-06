/**
 * Next.js config for the Cold Scout web app.
 *
 * This app REUSES the React source in ../frontend/src (single source of truth;
 * the Vite app in ../frontend still builds the Android APK). Three bridges make
 * that source run unmodified under Next:
 *
 *   1. `experimental.externalDir` lets Next compile TS/TSX imported from
 *      outside this package (../frontend/src).
 *   2. A webpack alias maps `react-router-dom` -> our compat shim
 *      (src/compat/react-router-dom.tsx) which re-implements the router API on
 *      top of next/navigation.
 *   3. DefinePlugin rewrites `import.meta.env.VITE_*` (Vite-only) to the
 *      corresponding build-time env values, so the shared code's env access
 *      works in both toolchains. Env var NAMES are kept identical (VITE_*).
 *
 * React / React-Query / Framer-Motion / Supabase are force-aliased to THIS
 * package's node_modules so there is exactly one copy of each context-bearing
 * singleton (the shared source would otherwise resolve them from
 * ../frontend/node_modules and break hooks/context).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Public env values that the shared code reads via import.meta.env.VITE_*.
// Read from process.env at build time (Next loads .env.local / Vercel env).
const VITE_ENV_KEYS = [
  'VITE_API_BASE_URL',
  'VITE_API_KEY',
  'VITE_APP_URL',
  'VITE_SITE_NAME',
  'VITE_APP_BOOKING_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_PUBLIC_OG_DISABLED',
];

/** Security headers ported from frontend/vercel.json. */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  {
    key: 'Content-Security-Policy',
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://cdn.jsdelivr.net https://plausible.io; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://api.coldscout.colddsam.com https://api.razorpay.com https://lumberjack.razorpay.com https://bbmvzahgkrmkciiejunt.supabase.co wss://bbmvzahgkrmkciiejunt.supabase.co https://api.github.com https://objects.githubusercontent.com https://github.com https://cdn.jsdelivr.net https://plausible.io; worker-src 'self' blob:; frame-src https://api.razorpay.com; object-src 'none'; base-uri 'self'; upgrade-insecure-requests",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile TSX imported from ../frontend/src.
  experimental: {
    externalDir: true,
  },
  // The shared source is being migrated incrementally; don't let stray legacy
  // type/lint issues from the Vite tree block the Next build. Tightened later.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  webpack: (config, { webpack }) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};

    // react-router-dom -> compat shim
    config.resolve.alias['react-router-dom'] = path.resolve(
      __dirname,
      'src/compat/react-router-dom.tsx',
    );

    // Dedupe context-bearing singletons to THIS package's copy so the shared
    // source (compiled from ../frontend/src) never pulls a second instance from
    // ../frontend/node_modules. NOTE: react/react-dom are deliberately NOT
    // aliased here — hard-aliasing them breaks Next's RSC `react-server`
    // resolution; React dedupe is handled via resolve.modules below.
    for (const pkg of [
      '@tanstack/react-query',
      'framer-motion',
      '@supabase/supabase-js',
    ]) {
      config.resolve.alias[pkg] = path.resolve(__dirname, 'node_modules', pkg);
    }

    // Resolve bare imports from web/node_modules FIRST, so shared code compiled
    // from ../frontend/src doesn't grab ../frontend/node_modules/react.
    config.resolve.modules = [
      path.resolve(__dirname, 'node_modules'),
      'node_modules',
    ];

    // import.meta.env.VITE_* -> build-time values
    const defines = {
      'import.meta.env.DEV': JSON.stringify(process.env.NODE_ENV !== 'production'),
      'import.meta.env.PROD': JSON.stringify(process.env.NODE_ENV === 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV || 'development'),
      'import.meta.env.SSR': JSON.stringify(false),
    };
    for (const key of VITE_ENV_KEYS) {
      defines[`import.meta.env.${key}`] = JSON.stringify(process.env[key] ?? '');
    }
    config.plugins.push(new webpack.DefinePlugin(defines));

    return config;
  },

  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },

  async redirects() {
    return [
      { source: '/home', destination: '/', permanent: true },
      { source: '/documentation', destination: '/docs', permanent: true },
      { source: '/contact', destination: '/support', permanent: true },
      { source: '/refund', destination: '/refund-policy', permanent: true },
      { source: '/cancellation', destination: '/refund-policy', permanent: true },
      { source: '/tos', destination: '/terms', permanent: true },
    ];
  },
};

export default nextConfig;

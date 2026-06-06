/**
 * Root layout — server component.
 *
 * Replaces frontend/index.html. The static <head> (verification tags, icons,
 * theme color, OG/Twitter defaults, JSON-LD org/website/software graph) is
 * expressed through the Next Metadata API + hoisted tags. Per-route titles and
 * descriptions are supplied by each route's `metadata` / `generateMetadata`.
 */
import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { SITE } from '@front/lib/seo/site';
import { metadataBase } from '@/lib/seo';
import Providers from './providers';
import './globals.css';

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: 'Cold Scout — AI Lead Generation Platform | Automate B2B Outreach',
    template: '%s',
  },
  description:
    'Cold Scout is an AI-powered lead generation platform that discovers, qualifies, and engages local business leads at scale. Automate your entire outreach pipeline from search to inbox.',
  applicationName: 'Cold Scout',
  authors: [{ name: 'Cold Scout' }],
  alternates: {
    canonical: `${SITE.url}/`,
    languages: { en: `${SITE.url}/`, 'x-default': `${SITE.url}/` },
  },
  manifest: '/site.webmanifest?v=2',
  appleWebApp: {
    capable: true,
    title: 'Cold Scout',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  verification: {
    google: '5nKg5xf4hIJu_aK0BVKpGxC_zmLcJ4aX0hU5PteFTmM',
    yandex: 'c53cf3eb1bcf494a',
    other: {
      'p:domain_verify': '286bedde5f002cfef0d38dae25ebfb46',
      'ahrefs-site-verification':
        'e283d698838467fe56d8fbe1aeb3433c20972538015924444b7caf15d6dfe6fa',
      bingbot: 'index, follow',
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico?v=2', type: 'image/x-icon' },
      { url: '/favicon.svg?v=2', type: 'image/svg+xml' },
      { url: '/favicon-96x96.png?v=2', type: 'image/png', sizes: '96x96' },
      { url: '/favicon-32x32.png?v=2', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16x16.png?v=2', type: 'image/png', sizes: '16x16' },
    ],
    apple: [{ url: '/apple-touch-icon.png?v=2', sizes: '180x180' }],
    other: [{ rel: 'mask-icon', url: '/favicon.svg', color: '#000000' }],
  },
  openGraph: {
    type: 'website',
    url: `${SITE.url}/`,
    siteName: SITE.name,
    title: 'Cold Scout — AI Lead Generation Platform | Automate B2B Outreach',
    description:
      'Cold Scout uses AI to discover, enrich, and engage local business leads — automating your entire outreach pipeline from search to inbox.',
    locale: 'en_US',
    images: [
      {
        url: `${SITE.url}/banner.png`,
        width: 1200,
        height: 630,
        alt: 'Cold Scout — AI Lead Generation Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@ColdSc0ut',
    creator: '@colddsam',
    title: 'Cold Scout — AI Lead Generation Platform | Automate B2B Outreach',
    description:
      'Discover, qualify, and engage leads with AI. Automate your outreach pipeline from search to inbox.',
    images: [`${SITE.url}/banner.png`],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
};

const ORGANIZATION_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE.url}/#organization`,
  name: 'Cold Scout',
  legalName: 'Cold Scout',
  url: `${SITE.url}/`,
  logo: {
    '@type': 'ImageObject',
    url: `${SITE.url}/web-app-manifest-512x512.png`,
    width: 512,
    height: 512,
  },
  image: `${SITE.url}/banner.png`,
  description:
    'AI-powered lead generation platform that discovers, qualifies, and engages local business leads at scale. Automate your entire outreach pipeline from search to inbox.',
  foundingDate: '2024',
  email: 'admin@colddsam.com',
  sameAs: ['https://github.com/colddsam/coldscout', 'https://x.com/ColdSc0ut'],
};

const WEBSITE_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE.url}/#website`,
  name: 'Cold Scout',
  alternateName: 'Cold Scout AI Lead Generation',
  url: `${SITE.url}/`,
  description:
    'AI-powered lead generation platform that discovers, qualifies, and engages local business leads at scale.',
  publisher: { '@id': `${SITE.url}/#organization` },
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${SITE.url}/docs?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
  inLanguage: 'en-US',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr">
      <head>
        {/* Performance: preconnect / dns-prefetch (React hoists into <head>) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="preconnect" href="https://api.coldscout.colddsam.com" crossOrigin="" />
        <link
          rel="preconnect"
          href="https://bbmvzahgkrmkciiejunt.supabase.co"
          crossOrigin=""
        />
        <link
          rel="preload"
          as="style"
          href="https://fonts.googleapis.com/css2?family=Almarai:wght@300;400;700;800&family=Instrument+Serif:ital@1&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Almarai:wght@300;400;700;800&family=Instrument+Serif:ital@1&display=swap"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_LD) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_LD) }}
        />
      </head>
      <body className="font-sans text-white antialiased bg-black">
        <Providers>{children}</Providers>
        <Script
          src="https://plausible.io/js/pa-Zd8IkCjCeDsewEU490lvG.js"
          strategy="afterInteractive"
        />
        <Script id="plausible-init" strategy="afterInteractive">
          {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()`}
        </Script>
      </body>
    </html>
  );
}

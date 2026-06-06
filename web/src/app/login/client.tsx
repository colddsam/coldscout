'use client';
import dynamic from 'next/dynamic';

// Auth pages are client-only and noindex — render without SSR to avoid
// window/storage access during prerender.
const Login = dynamic(() => import('@front/pages/Login'), { ssr: false });

export default function Client() {
  return <Login />;
}

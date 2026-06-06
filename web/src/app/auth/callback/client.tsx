'use client';
import dynamic from 'next/dynamic';

// OAuth/PKCE callback handler — reads the code from the URL on the client.
const AuthCallback = dynamic(() => import('@front/pages/AuthCallback'), {
  ssr: false,
});

export default function Client() {
  return <AuthCallback />;
}

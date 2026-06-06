'use client';
import dynamic from 'next/dynamic';

const SignUp = dynamic(() => import('@front/pages/SignUp'), { ssr: false });

export default function Client() {
  return <SignUp />;
}

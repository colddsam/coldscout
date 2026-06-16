'use client';
import dynamic from 'next/dynamic';

const MeetingRoom = dynamic(() => import('@front/pages/MeetingRoom'), { ssr: false });

export default function Client() {
  return <MeetingRoom />;
}

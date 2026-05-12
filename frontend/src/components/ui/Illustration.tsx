/**
 * Interactive monochrome SVG illustrations.
 *
 * Reusable, animated, pure-CSS/Framer Motion vector ornaments and
 * empty-state graphics. Strictly black/white. Replaces flat icon
 * placeholders so cards and empty states stay "alive".
 *
 * Conventions:
 *   - All graphics scale via parent width/height — no fixed pixel widths.
 *   - Strokes use `currentColor` so text-color utilities theme them.
 *   - Animations respect prefers-reduced-motion via the global media query
 *     in index.css that throttles all animation durations.
 */
import { motion } from 'framer-motion';
import type { SVGProps } from 'react';

/* ─────────────────────────────────────────────────────────────
 * Corner ornaments — sit inside `.deco-corner` containers.
 * Soft, abstract, never the focal point.
 * ───────────────────────────────────────────────────────────── */

/** Concentric arcs that slowly rotate. Good for "system / orbit / live" cards. */
export function ArcOrnament(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 240 120" fill="none" stroke="currentColor" className="w-full h-full text-white" {...props}>
      <motion.g
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
        style={{ transformOrigin: '220px 8px' }}
      >
        <circle cx="220" cy="8" r="40"  strokeOpacity="0.10" strokeWidth="1" />
        <circle cx="220" cy="8" r="68"  strokeOpacity="0.08" strokeWidth="1" strokeDasharray="2 4" />
        <circle cx="220" cy="8" r="96"  strokeOpacity="0.06" strokeWidth="1" />
        <circle cx="220" cy="8" r="124" strokeOpacity="0.04" strokeWidth="1" strokeDasharray="1 6" />
      </motion.g>
      <circle cx="220" cy="8" r="3" fill="currentColor" fillOpacity="0.6" />
    </svg>
  );
}

/** Constellation of slowly twinkling dots. Good for "data / discovery" cards. */
export function ConstellationOrnament(props: SVGProps<SVGSVGElement>) {
  const dots = [
    { x: 30,  y: 24, r: 1.5, d: 0.0 },
    { x: 64,  y: 50, r: 1.0, d: 0.4 },
    { x: 110, y: 18, r: 1.8, d: 0.8 },
    { x: 152, y: 60, r: 1.2, d: 1.2 },
    { x: 190, y: 28, r: 1.5, d: 1.6 },
    { x: 220, y: 70, r: 1.0, d: 2.0 },
    { x: 86,  y: 90, r: 1.2, d: 2.4 },
    { x: 168, y: 96, r: 1.0, d: 2.8 },
  ];
  return (
    <svg viewBox="0 0 240 120" fill="currentColor" className="w-full h-full text-white" {...props}>
      <g stroke="currentColor" strokeOpacity="0.08" strokeWidth="0.6">
        <line x1="30"  y1="24" x2="64"  y2="50" />
        <line x1="64"  y1="50" x2="110" y2="18" />
        <line x1="110" y1="18" x2="152" y2="60" />
        <line x1="152" y1="60" x2="190" y2="28" />
        <line x1="190" y1="28" x2="220" y2="70" />
        <line x1="152" y1="60" x2="168" y2="96" />
        <line x1="64"  y1="50" x2="86"  y2="90" />
      </g>
      {dots.map((d, i) => (
        <motion.circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={d.r}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, delay: d.d, ease: 'easeInOut' }}
        />
      ))}
    </svg>
  );
}

/** Animated wave lines — good for "pipeline / flow / signal" cards. */
export function WaveOrnament(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 240 120" fill="none" stroke="currentColor" className="w-full h-full text-white" {...props}>
      {[0, 1, 2, 3].map((i) => (
        <motion.path
          key={i}
          d={`M0 ${24 + i * 18} Q 60 ${10 + i * 18} 120 ${24 + i * 18} T 240 ${24 + i * 18}`}
          strokeOpacity={0.12 - i * 0.025}
          strokeWidth="1"
          strokeDasharray="4 4"
          animate={{ pathOffset: [0, 1] }}
          transition={{ duration: 8 + i * 1.5, repeat: Infinity, ease: 'linear' }}
        />
      ))}
    </svg>
  );
}

/** Grid mesh with slow shimmer — good for analytics / data cards. */
export function GridOrnament(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 240 120" fill="none" stroke="currentColor" className="w-full h-full text-white" {...props}>
      <defs>
        <pattern id="grid-orn" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M16 0 H0 V16" strokeOpacity="0.07" strokeWidth="0.5" fill="none" />
        </pattern>
      </defs>
      <rect width="240" height="120" fill="url(#grid-orn)" />
      <motion.circle
        cx="180" cy="40" r="2"
        fill="currentColor"
        animate={{ opacity: [0.2, 0.8, 0.2] }}
        transition={{ duration: 2.5, repeat: Infinity }}
      />
      <motion.circle
        cx="64" cy="80" r="2"
        fill="currentColor"
        animate={{ opacity: [0.2, 0.7, 0.2] }}
        transition={{ duration: 3, repeat: Infinity, delay: 0.6 }}
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Empty-state illustrations — center-stage graphics.
 * Used inside `.empty-state` containers.
 * ───────────────────────────────────────────────────────────── */

interface EmptyIllustrationProps {
  size?: number;
  className?: string;
}

/** Empty list / no records — clipboard with floating dashed lines. */
export function EmptyClipboard({ size = 96, className }: EmptyIllustrationProps) {
  return (
    <svg
      width={size}
      height={size * 0.85}
      viewBox="0 0 120 102"
      fill="none"
      className={className}
      stroke="currentColor"
    >
      <motion.rect
        x="28" y="14" width="64" height="80"
        rx="8"
        strokeOpacity="0.32"
        strokeWidth="1.2"
        fill="rgba(255,255,255,0.025)"
        animate={{ y: [14, 12, 14] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <rect x="44" y="6"  width="32" height="14" rx="4" strokeOpacity="0.4" strokeWidth="1.2" fill="rgba(0,0,0,1)" />
      <line x1="40" y1="36" x2="80" y2="36" strokeOpacity="0.22" strokeWidth="1" />
      <line x1="40" y1="50" x2="72" y2="50" strokeOpacity="0.18" strokeWidth="1" />
      <line x1="40" y1="64" x2="76" y2="64" strokeOpacity="0.14" strokeWidth="1" />
      <motion.circle
        cx="100" cy="22" r="2"
        fill="currentColor" fillOpacity="0.5"
        animate={{ opacity: [0.2, 0.8, 0.2] }}
        transition={{ duration: 2.5, repeat: Infinity }}
      />
      <motion.circle
        cx="18" cy="72" r="2"
        fill="currentColor" fillOpacity="0.5"
        animate={{ opacity: [0.2, 0.8, 0.2] }}
        transition={{ duration: 3, repeat: Infinity, delay: 0.7 }}
      />
    </svg>
  );
}

/** Empty inbox — paper plane drifting */
export function EmptyInbox({ size = 96, className }: EmptyIllustrationProps) {
  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 120 102" fill="none" className={className} stroke="currentColor">
      <motion.g
        animate={{ y: [0, -4, 0], x: [0, 2, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <path d="M14 56 L102 14 L88 92 L60 66 L14 56 Z" strokeWidth="1.2" strokeOpacity="0.4" fill="rgba(255,255,255,0.02)" />
        <path d="M60 66 L102 14" strokeWidth="1" strokeOpacity="0.25" />
        <path d="M60 66 L72 84" strokeWidth="1" strokeOpacity="0.25" />
      </motion.g>
      <motion.path
        d="M6 88 Q 20 80 32 88"
        strokeWidth="1" strokeOpacity="0.15" strokeDasharray="2 4"
        animate={{ strokeDashoffset: [0, -12] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
      />
    </svg>
  );
}

/** Empty search — magnifier with scanning beam */
export function EmptySearch({ size = 96, className }: EmptyIllustrationProps) {
  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 120 102" fill="none" className={className} stroke="currentColor">
      <circle cx="50" cy="44" r="26" strokeWidth="1.4" strokeOpacity="0.4" />
      <line x1="69" y1="63" x2="92" y2="86" strokeWidth="1.6" strokeOpacity="0.5" strokeLinecap="round" />
      <motion.line
        x1="32" y1="44" x2="68" y2="44"
        strokeOpacity="0.5"
        strokeWidth="1.2"
        animate={{ y1: [30, 58, 30], y2: [30, 58, 30] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.circle
        cx="50" cy="44" r="3"
        fill="currentColor" fillOpacity="0.4"
        animate={{ opacity: [0.2, 0.7, 0.2] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    </svg>
  );
}

/** Empty / connection — pulsing node graph */
export function EmptyNetwork({ size = 96, className }: EmptyIllustrationProps) {
  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 120 102" fill="none" className={className} stroke="currentColor">
      <g strokeOpacity="0.18" strokeWidth="1">
        <line x1="60" y1="20" x2="22" y2="56" />
        <line x1="60" y1="20" x2="98" y2="56" />
        <line x1="22" y1="56" x2="60" y2="86" />
        <line x1="98" y1="56" x2="60" y2="86" />
        <line x1="22" y1="56" x2="98" y2="56" />
      </g>
      {[
        { x: 60, y: 20, d: 0 },
        { x: 22, y: 56, d: 0.4 },
        { x: 98, y: 56, d: 0.8 },
        { x: 60, y: 86, d: 1.2 },
      ].map((n, i) => (
        <motion.circle
          key={i}
          cx={n.x}
          cy={n.y}
          r="4"
          fill="rgba(0,0,0,1)"
          stroke="currentColor"
          strokeOpacity="0.6"
          strokeWidth="1.2"
          animate={{ scale: [1, 1.25, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, delay: n.d, ease: 'easeInOut' }}
          style={{ transformOrigin: `${n.x}px ${n.y}px` }}
        />
      ))}
    </svg>
  );
}

/** Auth / lock — keyhole that gently pulses */
export function EmptyLock({ size = 96, className }: EmptyIllustrationProps) {
  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 120 102" fill="none" className={className} stroke="currentColor">
      <rect x="36" y="44" width="48" height="48" rx="8" strokeWidth="1.4" strokeOpacity="0.4" />
      <path d="M44 44 V32 a16 16 0 0 1 32 0 V44" strokeWidth="1.4" strokeOpacity="0.4" />
      <motion.circle
        cx="60" cy="64" r="4"
        fill="currentColor" fillOpacity="0.5"
        animate={{ opacity: [0.3, 0.8, 0.3] }}
        transition={{ duration: 2.5, repeat: Infinity }}
      />
      <line x1="60" y1="68" x2="60" y2="80" strokeWidth="1.4" strokeOpacity="0.5" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Inline status icons with motion
 * ───────────────────────────────────────────────────────────── */

/** Spinning hairline ring — for inline async indicators */
export function MiniSpinner({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      animate={{ rotate: 360 }}
      transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
    >
      <circle cx="12" cy="12" r="9" strokeOpacity="0.2" strokeWidth="2" />
      <path d="M21 12 a 9 9 0 0 0 -9 -9" strokeWidth="2" strokeLinecap="round" />
    </motion.svg>
  );
}

/** Animated outline pulse halo around a child element */
export function PulseHalo({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`relative inline-flex ${className ?? ''}`}>
      <motion.span
        className="absolute inset-0 rounded-full border border-white/30"
        animate={{ scale: [1, 1.8], opacity: [0.55, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
      />
      {children}
    </span>
  );
}

const Illustration = {
  ArcOrnament,
  ConstellationOrnament,
  WaveOrnament,
  GridOrnament,
  EmptyClipboard,
  EmptyInbox,
  EmptySearch,
  EmptyNetwork,
  EmptyLock,
  MiniSpinner,
  PulseHalo,
};

export default Illustration;

/**
 * Animated Background.
 *
 * Layered ambient background composed of:
 *   - drifting grid mesh
 *   - breathing gradient orbs
 *   - floating geometric SVG shapes (pseudo-3D rotation)
 *   - subtle constellation network
 *
 * Pure-presentational, pointer-events: none, sits behind content.
 * Honours prefers-reduced-motion via the global CSS rule in index.css.
 */
import { motion } from 'framer-motion';
import { useMemo } from 'react';

type Variant = 'hero' | 'dashboard' | 'subtle';

interface AnimatedBackgroundProps {
  variant?: Variant;
  className?: string;
  showShapes?: boolean;
  showOrbs?: boolean;
  showGrid?: boolean;
  showConstellation?: boolean;
}

/* ── Floating geometric shape ── */
function FloatingShape({
  delay = 0,
  duration = 18,
  x,
  y,
  size = 80,
  shape = 'triangle',
  opacity = 0.06,
}: {
  delay?: number;
  duration?: number;
  x: string;
  y: string;
  size?: number;
  shape?: 'triangle' | 'square' | 'ring' | 'cross' | 'hex';
  opacity?: number;
}) {
  const renderShape = () => {
    const stroke = `rgba(255,255,255,${opacity * 4})`;
    const fill = `rgba(255,255,255,${opacity})`;
    switch (shape) {
      case 'triangle':
        return (
          <polygon
            points={`${size / 2},4 ${size - 4},${size - 4} 4,${size - 4}`}
            fill={fill}
            stroke={stroke}
            strokeWidth="1"
          />
        );
      case 'square':
        return (
          <rect
            x="4"
            y="4"
            width={size - 8}
            height={size - 8}
            fill={fill}
            stroke={stroke}
            strokeWidth="1"
            rx="6"
          />
        );
      case 'ring':
        return (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - 4}
            fill="none"
            stroke={stroke}
            strokeWidth="1.2"
          />
        );
      case 'cross':
        return (
          <g stroke={stroke} strokeWidth="1.2">
            <line x1={size / 2} y1="6" x2={size / 2} y2={size - 6} />
            <line x1="6" y1={size / 2} x2={size - 6} y2={size / 2} />
          </g>
        );
      case 'hex': {
        const r = size / 2 - 4;
        const cx = size / 2;
        const cy = size / 2;
        const points = Array.from({ length: 6 }, (_, i) => {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
        }).join(' ');
        return (
          <polygon
            points={points}
            fill={fill}
            stroke={stroke}
            strokeWidth="1"
          />
        );
      }
    }
  };

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="absolute pointer-events-none"
      style={{ left: x, top: y, willChange: 'transform' }}
      initial={{ opacity: 0, rotate: 0 }}
      animate={{
        opacity: [0, 1, 1, 0.6, 1],
        rotate: [0, 90, 180, 270, 360],
        y: [0, -30, 0, 30, 0],
        x: [0, 20, 0, -20, 0],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      {renderShape()}
    </motion.svg>
  );
}

/* ── Breathing gradient orb ── */
function GradientOrb({
  x,
  y,
  size,
  delay = 0,
  intensity = 0.05,
}: {
  x: string;
  y: string;
  size: number;
  delay?: number;
  intensity?: number;
}) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
        background: `radial-gradient(circle, rgba(255,255,255,${intensity}) 0%, rgba(255,255,255,0) 70%)`,
        filter: 'blur(40px)',
        willChange: 'transform, opacity',
      }}
      initial={{ scale: 0.9, opacity: 0.6 }}
      animate={{
        scale: [0.9, 1.15, 0.95, 1.1, 0.9],
        opacity: [0.6, 1, 0.7, 0.9, 0.6],
      }}
      transition={{
        duration: 14,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

/* ── Constellation: subtle dot-line network ── */
function Constellation({ count = 12, opacity = 0.08 }: { count?: number; opacity?: number }) {
  const points = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        // eslint-disable-next-line react-hooks/purity
        x: Math.random() * 100,
        // eslint-disable-next-line react-hooks/purity
        y: Math.random() * 100,
        // eslint-disable-next-line react-hooks/purity
        delay: Math.random() * 4,
      })),
    [count]
  );

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      {points.map((p, i) => {
        const next = points[(i + 1) % points.length];
        return (
          <g key={i}>
            <motion.line
              x1={p.x}
              y1={p.y}
              x2={next.x}
              y2={next.y}
              stroke={`rgba(255,255,255,${opacity})`}
              strokeWidth="0.08"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: [0, 1, 1, 0], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 8, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.circle
              cx={p.x}
              cy={p.y}
              r="0.25"
              fill="rgba(255,255,255,0.5)"
              initial={{ opacity: 0.3 }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 3, delay: p.delay, repeat: Infinity }}
            />
          </g>
        );
      })}
    </svg>
  );
}

/* ── Animated Drift Grid (subtle motion) ── */
function DriftGrid() {
  return (
    <motion.div
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage: `
          linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        maskImage:
          'radial-gradient(ellipse at center, black 30%, transparent 80%)',
        WebkitMaskImage:
          'radial-gradient(ellipse at center, black 30%, transparent 80%)',
      }}
      animate={{ backgroundPosition: ['0px 0px', '60px 60px'] }}
      transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
    />
  );
}

export default function AnimatedBackground({
  variant = 'hero',
  className = '',
  showShapes,
  showOrbs,
  showGrid,
  showConstellation,
}: AnimatedBackgroundProps) {
  const cfg = {
    hero: { shapes: true, orbs: true, grid: true, constellation: true, intensity: 1 },
    dashboard: { shapes: true, orbs: true, grid: true, constellation: false, intensity: 0.6 },
    subtle: { shapes: false, orbs: true, grid: true, constellation: false, intensity: 0.4 },
  }[variant];

  const _shapes = showShapes ?? cfg.shapes;
  const _orbs = showOrbs ?? cfg.orbs;
  const _grid = showGrid ?? cfg.grid;
  const _constellation = showConstellation ?? cfg.constellation;

  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
    >
      {_grid && <DriftGrid />}

      {_orbs && (
        <>
          <GradientOrb x="-10%" y="-10%" size={520} delay={0} intensity={0.06 * cfg.intensity} />
          <GradientOrb x="60%" y="20%" size={420} delay={3} intensity={0.04 * cfg.intensity} />
          <GradientOrb x="20%" y="65%" size={380} delay={6} intensity={0.05 * cfg.intensity} />
          <GradientOrb x="75%" y="70%" size={300} delay={9} intensity={0.03 * cfg.intensity} />
        </>
      )}

      {_shapes && (
        <>
          <FloatingShape x="8%" y="14%" size={70} shape="triangle" delay={0} duration={22} opacity={0.05} />
          <FloatingShape x="85%" y="10%" size={56} shape="ring" delay={2} duration={18} opacity={0.06} />
          <FloatingShape x="78%" y="55%" size={64} shape="hex" delay={4} duration={26} opacity={0.05} />
          <FloatingShape x="12%" y="72%" size={48} shape="square" delay={1.5} duration={20} opacity={0.05} />
          <FloatingShape x="48%" y="82%" size={40} shape="cross" delay={3.5} duration={16} opacity={0.07} />
          <FloatingShape x="55%" y="18%" size={36} shape="ring" delay={5} duration={19} opacity={0.05} />
        </>
      )}

      {_constellation && <Constellation count={10} opacity={0.06} />}

      {/* Vignette to anchor the layered motion */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)',
        }}
      />
    </div>
  );
}

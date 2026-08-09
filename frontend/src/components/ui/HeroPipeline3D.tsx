/**
 * Hero illustration — pseudo-3D isometric render of the Cold Scout pipeline.
 *
 * Three stacked isometric slabs (Discover → Qualify → Outreach) with upright
 * map pins, a radar sweep, score bars, a broadcast envelope, and data motes
 * travelling down the corner pillars.
 *
 * Deliberately pure SVG + Framer Motion — no Three.js / WebGL — so it stays
 * cheap enough for the Capacitor Android WebView and renders identically in
 * the Next.js (SSG/ISR) build. Strictly monochrome, matching the landing page.
 *
 * Geometry: each slab is a 2.5:1 isometric diamond. Face content is authored
 * in a local 100×100 square and projected with a matrix, so anything drawn
 * "flat" lands on the slab surface; anything drawn in screen space (pins, the
 * envelope) reads as standing upright out of it.
 */
import { motion, useReducedMotion } from 'framer-motion';

/* ── Geometry ── */

const CX = 300; // rig centre on the x axis
const HX = 170; // slab half-width
const HY = 68;  // slab half-depth (2.5:1 isometric)
const T = 14;   // slab thickness

const DISCOVER = 175;
const QUALIFY = 300;
const OUTREACH = 425;

/** Project a point from a slab's local 100×100 face into screen space. */
function toScreen(u: number, v: number, cy: number): [number, number] {
  return [CX + (HX / 100) * (u - v), cy - HY + (HY / 100) * (u + v)];
}

/** Matrix that maps the local 100×100 face onto a slab's top surface. */
function faceMatrix(cy: number): string {
  return `matrix(${HX / 100} ${HY / 100} ${-HX / 100} ${HY / 100} ${CX} ${cy - HY})`;
}

const topFace = (cy: number) =>
  `M ${CX} ${cy - HY} L ${CX + HX} ${cy} L ${CX} ${cy + HY} L ${CX - HX} ${cy} Z`;
const leftFace = (cy: number) =>
  `M ${CX - HX} ${cy} L ${CX} ${cy + HY} L ${CX} ${cy + HY + T} L ${CX - HX} ${cy + T} Z`;
const rightFace = (cy: number) =>
  `M ${CX} ${cy + HY} L ${CX + HX} ${cy} L ${CX + HX} ${cy + T} L ${CX} ${cy + HY + T} Z`;

/* ── Slab shell ── */

function Slab({ cy, children }: { cy: number; children?: React.ReactNode }) {
  return (
    <g>
      {/* extruded sides — left catches the light, right falls into shadow */}
      <path d={leftFace(cy)} fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
      <path d={rightFace(cy)} fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      {/* top surface */}
      <path d={topFace(cy)} fill="url(#cs-hero-face)" stroke="rgba(255,255,255,0.24)" strokeWidth="1" />
      {/* face content, projected onto the surface and clipped to its edges */}
      <g transform={faceMatrix(cy)} clipPath="url(#cs-hero-face-clip)">
        {children}
      </g>
    </g>
  );
}

/* ── Slab 1 · Discover ── */

const PINS: Array<[number, number]> = [
  [32, 24],
  [68, 40],
  [44, 62],
  [80, 74],
  [20, 54],
];

function DiscoverFace({ still }: { still: boolean }) {
  const lines = [20, 40, 60, 80];
  return (
    <>
      <g stroke="rgba(255,255,255,0.09)" strokeWidth="1" vectorEffect="non-scaling-stroke">
        {lines.map((n) => (
          <line key={`u${n}`} x1={n} y1="0" x2={n} y2="100" />
        ))}
        {lines.map((n) => (
          <line key={`v${n}`} x1="0" y1={n} x2="100" y2={n} />
        ))}
      </g>
      {/* radar sweep across the surface */}
      {!still && (
        <motion.rect
          x="0"
          width="100"
          height="1.6"
          fill="rgba(255,255,255,0.35)"
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: [0, 98], opacity: [0, 0.9, 0.9, 0] }}
          transition={{ duration: 3.6, repeat: Infinity, ease: 'linear', times: [0, 0.12, 0.85, 1] }}
        />
      )}
    </>
  );
}

function Pin({ u, v, delay, still }: { u: number; v: number; delay: number; still: boolean }) {
  const [x, y] = toScreen(u, v, DISCOVER);
  return (
    <g>
      {/* ground contact + expanding ping */}
      <ellipse cx={x} cy={y} rx="7" ry="3" fill="rgba(255,255,255,0.14)" />
      {!still && (
        <motion.ellipse
          cx={x}
          cy={y}
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="1"
          initial={{ rx: 4, ry: 1.6, opacity: 0 }}
          animate={{ rx: [4, 26], ry: [1.6, 10.4], opacity: [0.55, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeOut', delay }}
        />
      )}
      <motion.g
        animate={still ? undefined : { y: [-2.5, 2.5, -2.5] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay }}
      >
        <path
          d={`M ${x - 5.4} ${y - 19} L ${x} ${y - 2} L ${x + 5.4} ${y - 19} Z`}
          fill="rgba(255,255,255,0.92)"
        />
        <circle cx={x} cy={y - 24} r="7.5" fill="rgba(255,255,255,0.92)" />
        <circle cx={x} cy={y - 24} r="3" fill="#000" />
      </motion.g>
    </g>
  );
}

/* ── Slab 2 · Qualify ── */

const SCORES = [64, 44, 76, 34];

function QualifyFace({ still }: { still: boolean }) {
  return (
    <g>
      {SCORES.map((w, i) => {
        const y = 29 + i * 15;
        return (
          <g key={y}>
            <circle cx="13" cy={y + 3.5} r="2.4" fill="rgba(255,255,255,0.4)" />
            <rect
              x="20"
              y={y}
              width="70"
              height="7"
              rx="3.5"
              fill="rgba(255,255,255,0.06)"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <motion.rect
              x="20"
              y={y}
              width={w}
              height="7"
              rx="3.5"
              fill="rgba(255,255,255,0.7)"
              animate={still ? undefined : { opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.35 }}
            />
          </g>
        );
      })}
    </g>
  );
}

/* ── Slab 3 · Outreach ── */

/** Local-space anchor of the envelope; the broadcast rings radiate from it. */
const SEND_U = 62;
const SEND_V = 62;

function OutreachFace({ still }: { still: boolean }) {
  const dots = [20, 36, 52, 68, 84];
  return (
    <g>
      <g fill="rgba(255,255,255,0.16)">
        {dots.map((u) => dots.map((v) => <circle key={`${u}-${v}`} cx={u} cy={v} r="1.1" />))}
      </g>
      {[0, 1, 2].map((i) => (
        <motion.circle
          key={i}
          cx={SEND_U}
          cy={SEND_V}
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          initial={{ r: 14, opacity: still ? 0.25 : 0 }}
          animate={still ? undefined : { r: [14, 58], opacity: [0.55, 0] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: 'easeOut', delay: i * 1.13 }}
        />
      ))}
    </g>
  );
}

function Envelope({ still }: { still: boolean }) {
  const [ax, ay] = toScreen(SEND_U, SEND_V, OUTREACH);
  const w = 66;
  const h = 44;
  const x = ax - w / 2;
  const y = ay - 6 - h;
  return (
    <g>
      <ellipse cx={ax} cy={ay} rx="36" ry="13" fill="rgba(255,255,255,0.08)" />
      <motion.g
        animate={still ? undefined : { y: [-3, 3, -3] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <rect x={x} y={y} width={w} height={h} rx="4" fill="url(#cs-hero-face)" stroke="rgba(255,255,255,0.6)" strokeWidth="1.3" />
        <path d={`M ${x + 3} ${y + 5} L ${ax} ${y + 26} L ${x + w - 3} ${y + 5}`} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.3" />
      </motion.g>
    </g>
  );
}

/* ── Corner pillars + travelling data motes ── */

function Pillars({ still }: { still: boolean }) {
  const motes = [
    { x: CX - HX, delay: 0 },
    { x: CX - HX, delay: 1.6 },
    { x: CX + HX, delay: 0.8 },
    { x: CX + HX, delay: 2.4 },
  ];
  return (
    <g>
      {[CX - HX, CX + HX].map((x) => (
        <line
          key={x}
          x1={x}
          y1={DISCOVER}
          x2={x}
          y2={OUTREACH}
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="1"
          strokeDasharray="3 6"
        />
      ))}
      <line x1={CX} y1={DISCOVER - HY} x2={CX} y2={OUTREACH - HY} stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="3 6" />
      {!still &&
        motes.map((m, i) => (
          <motion.circle
            key={i}
            cx={m.x}
            r="2.6"
            fill="#fff"
            initial={{ cy: DISCOVER, opacity: 0 }}
            animate={{ cy: [DISCOVER, OUTREACH], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeIn', delay: m.delay, times: [0, 0.15, 0.8, 1] }}
          />
        ))}
    </g>
  );
}

/* ── Orbit ring ── */

const ORBIT_RX = 268;
const ORBIT_RY = 108;
const ORBIT_STEPS = 24;

function orbitKeyframes(offset: number) {
  const cx: number[] = [];
  const cy: number[] = [];
  for (let i = 0; i <= ORBIT_STEPS; i += 1) {
    const a = ((i / ORBIT_STEPS) * 360 + offset) * (Math.PI / 180);
    cx.push(CX + Math.cos(a) * ORBIT_RX);
    cy.push(QUALIFY + Math.sin(a) * ORBIT_RY);
  }
  return { cx, cy };
}

function Orbit({ still }: { still: boolean }) {
  return (
    <g>
      <ellipse cx={CX} cy={QUALIFY} rx={ORBIT_RX} ry={ORBIT_RY} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      <ellipse cx={CX} cy={QUALIFY} rx={ORBIT_RX - 34} ry={ORBIT_RY - 14} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="2 8" />
      {!still &&
        [0, 180].map((offset, i) => {
          const k = orbitKeyframes(offset);
          return (
            <motion.circle
              key={offset}
              r="2.4"
              fill="rgba(255,255,255,0.7)"
              animate={{ cx: k.cx, cy: k.cy }}
              transition={{ duration: 22 + i * 5, repeat: Infinity, ease: 'linear' }}
            />
          );
        })}
    </g>
  );
}

/* ── Labels ── */

function Label({ cy, text }: { cy: number; text: string }) {
  return (
    <g>
      <line x1={CX + HX + 4} y1={cy} x2={CX + HX + 14} y2={cy} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
      {/* Font size is in viewBox units, so it shrinks with the SVG — bump it
          on narrow screens (the Android shell) to keep the labels legible. */}
      <text
        x={CX + HX + 20}
        y={cy + 3.5}
        fill="rgba(255,255,255,0.42)"
        className="text-[16px] sm:text-[10px]"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        letterSpacing="2"
      >
        {text}
      </text>
    </g>
  );
}

/* ── Root ── */

interface HeroPipeline3DProps {
  className?: string;
}

export default function HeroPipeline3D({ className = '' }: HeroPipeline3DProps) {
  const still = useReducedMotion() ?? false;

  return (
    <svg
      viewBox="0 0 600 600"
      className={`w-full h-full ${className}`}
      role="img"
      aria-label="Isometric diagram of the Cold Scout pipeline: leads are discovered on a map, scored for qualification, then sent as personalised outreach."
    >
      <defs>
        <linearGradient id="cs-hero-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
        </linearGradient>
        <radialGradient id="cs-hero-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        {/* In local face space the 0–100 square *is* the isometric diamond. */}
        <clipPath id="cs-hero-face-clip">
          <rect x="0" y="0" width="100" height="100" />
        </clipPath>
      </defs>

      <ellipse cx={CX} cy={QUALIFY} rx="250" ry="215" fill="url(#cs-hero-glow)" />

      <motion.g
        animate={still ? undefined : { y: [-7, 7, -7] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Orbit still={still} />
        <Pillars still={still} />

        {/* Painted far-to-near: the upper slab sits above the ones below it. */}
        <Slab cy={OUTREACH}>
          <OutreachFace still={still} />
        </Slab>
        <Envelope still={still} />

        <Slab cy={QUALIFY}>
          <QualifyFace still={still} />
        </Slab>

        <Slab cy={DISCOVER}>
          <DiscoverFace still={still} />
        </Slab>
        {PINS.map(([u, v], i) => (
          <Pin key={`${u}-${v}`} u={u} v={v} delay={i * 0.55} still={still} />
        ))}

        <Label cy={DISCOVER} text="DISCOVER" />
        <Label cy={QUALIFY} text="QUALIFY" />
        <Label cy={OUTREACH} text="OUTREACH" />
      </motion.g>
    </svg>
  );
}

/**
 * Pseudo-3D orbital SVG illustration.
 *
 * Three rotating elliptical rings with a central pulse — purely decorative,
 * lightweight (no Three.js), gives a "3D object" feel through CSS transform-3d
 * + framer-motion rotation.
 */
import { motion } from 'framer-motion';

interface Orbital3DProps {
  size?: number;
  className?: string;
}

export default function Orbital3D({ size = 320, className = '' }: Orbital3DProps) {
  return (
    <div
      className={`relative pointer-events-none ${className}`}
      style={{ width: size, height: size, perspective: 1200 }}
      aria-hidden
    >
      {/* Three orbits at different inclinations */}
      <motion.div
        className="absolute inset-0"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateX: 65, rotateZ: 360 }}
        transition={{
          rotateX: { duration: 0 },
          rotateZ: { duration: 26, repeat: Infinity, ease: 'linear' },
        }}
      >
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
          <defs>
            <linearGradient id="orb-grad-1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.5)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
          </defs>
          <ellipse
            cx={size / 2}
            cy={size / 2}
            rx={size / 2 - 10}
            ry={size / 2 - 10}
            fill="none"
            stroke="url(#orb-grad-1)"
            strokeWidth="1.2"
          />
        </svg>
      </motion.div>

      <motion.div
        className="absolute inset-0"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: 70, rotateZ: -360 }}
        transition={{
          rotateY: { duration: 0 },
          rotateZ: { duration: 32, repeat: Infinity, ease: 'linear' },
        }}
      >
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
          <ellipse
            cx={size / 2}
            cy={size / 2}
            rx={size / 2 - 30}
            ry={size / 2 - 30}
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="1"
            strokeDasharray="4 6"
          />
        </svg>
      </motion.div>

      <motion.div
        className="absolute inset-0"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateX: 30, rotateY: 30, rotateZ: 360 }}
        transition={{
          rotateX: { duration: 0 },
          rotateY: { duration: 0 },
          rotateZ: { duration: 40, repeat: Infinity, ease: 'linear' },
        }}
      >
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
          <ellipse
            cx={size / 2}
            cy={size / 2}
            rx={size / 2 - 50}
            ry={size / 2 - 50}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
          />
        </svg>
      </motion.div>

      {/* Central pulsing core */}
      <motion.div
        className="absolute top-1/2 left-1/2 rounded-full"
        style={{
          width: size * 0.18,
          height: size * 0.18,
          marginLeft: -(size * 0.09),
          marginTop: -(size * 0.09),
          background:
            'radial-gradient(circle, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.2) 50%, transparent 80%)',
          filter: 'blur(4px)',
        }}
        animate={{ scale: [0.8, 1.1, 0.85, 1, 0.8], opacity: [0.6, 1, 0.7, 0.95, 0.6] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Orbiting satellites */}
      {[0, 120, 240].map((angle, i) => (
        <motion.div
          key={angle}
          className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full bg-white"
          style={{
            marginLeft: -4,
            marginTop: -4,
            boxShadow: '0 0 10px rgba(255,255,255,0.7)',
          }}
          animate={{
            x: [
              Math.cos((angle * Math.PI) / 180) * (size / 2 - 10),
              Math.cos(((angle + 90) * Math.PI) / 180) * (size / 2 - 10),
              Math.cos(((angle + 180) * Math.PI) / 180) * (size / 2 - 10),
              Math.cos(((angle + 270) * Math.PI) / 180) * (size / 2 - 10),
              Math.cos(((angle + 360) * Math.PI) / 180) * (size / 2 - 10),
            ],
            y: [
              Math.sin((angle * Math.PI) / 180) * (size / 2 - 10),
              Math.sin(((angle + 90) * Math.PI) / 180) * (size / 2 - 10),
              Math.sin(((angle + 180) * Math.PI) / 180) * (size / 2 - 10),
              Math.sin(((angle + 270) * Math.PI) / 180) * (size / 2 - 10),
              Math.sin(((angle + 360) * Math.PI) / 180) * (size / 2 - 10),
            ],
          }}
          transition={{
            duration: 26 + i * 4,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  );
}

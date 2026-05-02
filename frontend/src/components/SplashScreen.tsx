/**
 * SplashScreen — Animated loading splash for the Cold Scout application.
 *
 * Displays the logo with a premium entrance animation sequence:
 *   1. Radial glow pulse fades in behind the logo
 *   2. Logo scales up with a gentle bounce
 *   3. Brand name types in letter-by-letter
 *   4. Tagline fades up
 *   5. Orbital ring spins around the logo
 *   6. Progress bar fills while the app bootstraps
 *   7. Entire screen fades out and unmounts
 *
 * Usage: Wrap your app in <SplashScreen> and it auto-dismisses after
 * a minimum display time + React hydration readiness.
 */
import { useState, useEffect, useCallback } from 'react';

/** Minimum time (ms) the splash stays visible for brand impression. */
const MIN_DISPLAY_MS = 2800;

interface SplashScreenProps {
  /** Called once the splash has fully faded out and can be unmounted. */
  onFinished?: () => void;
}

export default function SplashScreen({ onFinished }: SplashScreenProps) {
  const [phase, setPhase] = useState<'entering' | 'visible' | 'exiting' | 'done'>('entering');

  const dismiss = useCallback(() => {
    setPhase('exiting');
    setTimeout(() => {
      setPhase('done');
      onFinished?.();
    }, 600); // matches the fade-out transition
  }, [onFinished]);

  useEffect(() => {
    // Enter → Visible after a brief tick so CSS transitions trigger
    const enterTimer = requestAnimationFrame(() => setPhase('visible'));

    // Auto-dismiss after minimum display time
    const dismissTimer = setTimeout(dismiss, MIN_DISPLAY_MS);

    return () => {
      cancelAnimationFrame(enterTimer);
      clearTimeout(dismissTimer);
    };
  }, [dismiss]);

  if (phase === 'done') return null;

  const isVisible = phase === 'visible';
  const isExiting = phase === 'exiting';

  return (
    <div
      id="splash-screen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000000',
        opacity: isExiting ? 0 : 1,
        transition: 'opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
      }}
    >
      {/* ── Ambient glow ─────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          width: '340px',
          height: '340px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 50%, transparent 70%)',
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'scale(1)' : 'scale(0.5)',
          transition: 'opacity 1s ease 0.2s, transform 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.2s',
          pointerEvents: 'none',
        }}
      />

      {/* ── Orbital ring ─────────────────────────────────── */}
      <div
        className="splash-orbital-ring"
        style={{
          position: 'absolute',
          width: '180px',
          height: '180px',
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.08)',
          opacity: isVisible ? 1 : 0,
          transition: 'opacity 0.8s ease 0.6s',
          animation: isVisible ? 'splash-orbit-spin 8s linear infinite' : 'none',
        }}
      >
        {/* Orbiting dot */}
        <div
          style={{
            position: 'absolute',
            top: '-4px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#FFFFFF',
            boxShadow: '0 0 12px 2px rgba(255,255,255,0.3)',
          }}
        />
      </div>

      {/* ── Logo ─────────────────────────────────────────── */}
      <img
        src="/android-chrome-512x512.png"
        alt="Cold Scout"
        width={96}
        height={96}
        style={{
          position: 'relative',
          zIndex: 2,
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.7) translateY(16px)',
          transition: 'opacity 0.6s ease 0.1s, transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s',
          filter: 'grayscale(1) brightness(1.2) drop-shadow(0 0 24px rgba(255,255,255,0.15))',
        }}
      />

      {/* ── Brand Name ──────────────────────────────────── */}
      <h1
        style={{
          position: 'relative',
          zIndex: 2,
          marginTop: '20px',
          fontSize: '22px',
          fontWeight: 700,
          fontFamily: "'Almarai', sans-serif",
          letterSpacing: '0.08em',
          color: '#F5F5F5',
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.5s ease 0.5s, transform 0.5s ease 0.5s',
        }}
      >
        {'Cold Scout'.split('').map((char, i) => (
          <span
            key={i}
            className="splash-letter"
            style={{
              display: 'inline-block',
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? 'translateY(0)' : 'translateY(8px)',
              transition: `opacity 0.3s ease ${0.5 + i * 0.05}s, transform 0.3s ease ${0.5 + i * 0.05}s`,
            }}
          >
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
      </h1>

      {/* ── Tagline ─────────────────────────────────────── */}
      <p
        style={{
          position: 'relative',
          zIndex: 2,
          marginTop: '8px',
          fontSize: '12px',
          fontWeight: 400,
          fontFamily: "'Almarai', sans-serif",
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'rgba(255, 255, 255, 0.4)',
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 0.5s ease 1.1s, transform 0.5s ease 1.1s',
        }}
      >
        Smart Outreach
      </p>

      {/* ── Progress bar ────────────────────────────────── */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          marginTop: '32px',
          width: '120px',
          height: '2px',
          borderRadius: '2px',
          background: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
          opacity: isVisible ? 1 : 0,
          transition: 'opacity 0.4s ease 1.4s',
        }}
      >
        <div
          className="splash-progress-fill"
          style={{
            height: '100%',
            borderRadius: '2px',
            background: 'linear-gradient(90deg, #FFFFFF, #666666)',
            animation: isVisible ? 'splash-progress 2.2s cubic-bezier(0.4, 0, 0.2, 1) 0.6s forwards' : 'none',
            width: '0%',
          }}
        />
      </div>

      {/* ── Particle field (decorative) ──────────────────── */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="splash-particle"
            style={{
              position: 'absolute',
              width: '2px',
              height: '2px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              left: `${15 + i * 14}%`,
              bottom: '-4px',
              opacity: isVisible ? 1 : 0,
              animation: isVisible
                ? `splash-float-up ${3 + (i % 3)}s ease-in-out ${0.8 + i * 0.3}s infinite`
                : 'none',
            }}
          />
        ))}
      </div>

      {/* ── Inline keyframes ────────────────────────────── */}
      <style>{`
        @keyframes splash-orbit-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes splash-progress {
          0%   { width: 0%; }
          60%  { width: 70%; }
          100% { width: 100%; }
        }
        @keyframes splash-float-up {
          0%   { transform: translateY(0) scale(1); opacity: 0; }
          20%  { opacity: 0.6; }
          100% { transform: translateY(-100vh) scale(0.3); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

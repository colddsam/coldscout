import type { Config } from 'tailwindcss';

/**
 * SINGLE SOURCE OF TRUTH FOR THE TAILWIND THEME (colors, fonts, animations).
 *
 * Kept as PURE DATA — no plugin imports — so it can be shared by both the
 * Vite/Android config (frontend/tailwind.config.ts) and the Next.js/web config
 * (web/tailwind.config.ts) without either app having to resolve the other's
 * node_modules. Each config imports `@tailwindcss/typography` from its OWN
 * dependency tree, so a web-only `npm install` no longer fails to resolve it.
 */
export const theme: Config['theme'] = {
  extend: {
    colors: {
      /* ── Dark Monochrome Palette (refined SaaS scale) ── */
      surface: '#000000',
      'surface-1': '#0A0A0A',
      'surface-2': '#121212',
      'surface-3': '#1A1A1A',
      'surface-4': '#232323',
      foreground: '#F5F5F5',
      primary: '#F5F5F5',
      'primary-dim': '#B0B0B0',
      secondary: '#B0B0B0',
      subtle: '#808080',
      muted: '#7A7A7A',
      border: 'rgba(255,255,255,0.08)',
      'border-strong': 'rgba(255,255,255,0.14)',
      /* Numbered accents (Vercel-style scale, brightened for legibility) */
      'accents-1': '#0A0A0A',
      'accents-2': '#121212',
      'accents-3': '#1F1F1F',
      'accents-4': '#2E2E2E',
      'accents-5': '#5C5C5C',
      'accents-6': '#7A7A7A',
      'accents-7': '#A8A8A8',
      'accents-8': '#D0D0D0',
      /* ── Brand Accent (strictly monochromatic) ── */
      accent: {
        DEFAULT: '#FFFFFF',
        hover:   '#E0E0E0',
        dim:     '#A0A0A0',
        subtle:  'rgba(255,255,255,0.06)',
        ring:    'rgba(255,255,255,0.25)',
      },
      /* ── Semantic Colors (Mapped to index.css variables for accessibility) ── */
      success: {
        DEFAULT: 'var(--success)',
        subtle: 'rgba(52, 211, 153, 0.10)',
      },
      warning: {
        DEFAULT: 'var(--warning)',
        subtle: 'rgba(251, 191, 36, 0.10)',
      },
      danger: {
        DEFAULT: 'var(--danger)',
        subtle: 'rgba(248, 113, 113, 0.15)',
      },
      info: {
        DEFAULT: 'var(--info)',
        subtle: 'rgba(96, 165, 250, 0.10)',
      },
    },
    fontFamily: {
      sans: ['"Almarai"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      serif: ['"Instrument Serif"', 'Georgia', 'serif'],
      mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      display: ['"Instrument Serif"', 'Georgia', 'serif'],
    },
    borderRadius: {
      DEFAULT: '0.375rem',
      lg: '0.5rem',
      xl: '0.75rem',
      '2xl': '1rem',
      '3xl': '1.5rem',
    },
    boxShadow: {
      vercel: '0 0 0 1px rgba(255,255,255,0.05), 0 4px 12px rgba(0,0,0,0.4)',
      'vercel-hover': '0 0 0 1px rgba(255,255,255,0.1), 0 8px 30px rgba(0,0,0,0.5)',
      minimal: '0 2px 4px rgba(0,0,0,0.3)',
      glass: '0 8px 32px rgba(0,0,0,0.4)',
      elevated: '0 0 0 1px rgba(255,255,255,0.06), 0 16px 48px rgba(0,0,0,0.5)',
      'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.05)',
      subtle: '0 1px 2px rgba(0,0,0,0.4)',
      'glow-white': '0 0 20px rgba(255,255,255,0.05)',
    },
    letterSpacing: {
      tighter: '-0.04em',
      tight: '-0.02em',
    },
    animation: {
      'fade-in': 'fadeIn 0.5s ease forwards',
      'fade-in-up': 'fadeInUp 0.6s ease forwards',
      'slide-up': 'slideUp 0.4s ease forwards',
      'slide-in-left': 'slideInLeft 0.4s ease forwards',
      'slide-in-right': 'slideInRight 0.4s ease forwards',
      float: 'float 6s ease-in-out infinite',
      'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      glow: 'glow 2s ease-in-out infinite alternate',
      shimmer: 'shimmer 2s linear infinite',
      'scale-in': 'scaleIn 0.3s ease forwards',
      'blur-in': 'blurIn 0.5s ease forwards',
      'gradient-shift': 'gradientShift 6s ease infinite',
      'bounce-subtle': 'bounceSubtle 2s ease-in-out infinite',
      'spin-slow': 'spin 3s linear infinite',
      'width-expand': 'widthExpand 0.3s ease forwards',
      'dot-pulse': 'dotPulse 1.5s ease-in-out infinite',
    },
    keyframes: {
      fadeIn: {
        from: { opacity: '0' },
        to: { opacity: '1' },
      },
      fadeInUp: {
        from: { opacity: '0', transform: 'translateY(24px)' },
        to: { opacity: '1', transform: 'translateY(0)' },
      },
      slideUp: {
        from: { transform: 'translateY(12px)', opacity: '0' },
        to: { transform: 'translateY(0)', opacity: '1' },
      },
      slideInLeft: {
        from: { transform: 'translateX(-12px)', opacity: '0' },
        to: { transform: 'translateX(0)', opacity: '1' },
      },
      slideInRight: {
        from: { transform: 'translateX(12px)', opacity: '0' },
        to: { transform: 'translateX(0)', opacity: '1' },
      },
      float: {
        '0%, 100%': { transform: 'translateY(0px)' },
        '50%': { transform: 'translateY(-10px)' },
      },
      glow: {
        from: { boxShadow: '0 0 8px rgba(255,255,255,0.05)' },
        to: { boxShadow: '0 0 20px rgba(255,255,255,0.1)' },
      },
      shimmer: {
        '0%': { backgroundPosition: '-200% 0' },
        '100%': { backgroundPosition: '200% 0' },
      },
      scaleIn: {
        from: { opacity: '0', transform: 'scale(0.95)' },
        to: { opacity: '1', transform: 'scale(1)' },
      },
      blurIn: {
        from: { opacity: '0', filter: 'blur(8px)' },
        to: { opacity: '1', filter: 'blur(0px)' },
      },
      gradientShift: {
        '0%, 100%': { backgroundPosition: '0% 50%' },
        '50%': { backgroundPosition: '100% 50%' },
      },
      bounceSubtle: {
        '0%, 100%': { transform: 'translateY(0)' },
        '50%': { transform: 'translateY(-4px)' },
      },
      widthExpand: {
        from: { width: '0%' },
        to: { width: '100%' },
      },
      dotPulse: {
        '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
        '50%': { opacity: '1', transform: 'scale(1.5)' },
      },
    },
    backdropBlur: {
      xs: '2px',
    },
    transitionDuration: {
      '250': '250ms',
      '350': '350ms',
      '400': '400ms',
    },
  },
};

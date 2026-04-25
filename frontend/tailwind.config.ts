import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* ── Dark Monochrome Palette ── */
        surface: '#000000',
        'surface-1': '#111111',
        'surface-2': '#1C1C1C',
        'surface-3': '#2A2A2A',
        foreground: '#F0F0F0',
        primary: '#F0F0F0',
        'primary-dim': '#A0A0A0',
        secondary: '#A0A0A0',
        subtle: '#666666',
        border: 'rgba(255,255,255,0.05)',
        'accents-1': '#111111',
        'accents-2': '#1C1C1C',
        'accents-3': '#2A2A2A',
        'accents-4': '#444444',
        'accents-5': '#666666',
        'accents-6': '#888888',
        'accents-7': '#A0A0A0',
        'accents-8': '#C0C0C0',
        /* ── Semantic Colors ── */
        success: {
          DEFAULT: '#33CC66',
          subtle: 'rgba(51,204,102,0.1)',
        },
        warning: {
          DEFAULT: '#FFAA33',
          subtle: 'rgba(255,170,51,0.1)',
        },
        danger: {
          DEFAULT: '#FF4444',
          subtle: 'rgba(255,68,68,0.1)',
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
  },
  plugins: [typography],
} satisfies Config;

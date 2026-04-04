import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Monochrome palette
        surface: '#ffffff',
        foreground: '#000000',
        secondary: '#666666',
        subtle: '#999999',
        border: '#eaeaea',
        'accents-1': '#fafafa',
        'accents-2': '#eaeaea',
        'accents-3': '#d4d4d4',
        'accents-4': '#b0b0b0',
        'accents-5': '#888888',
        'accents-6': '#666666',
        'accents-7': '#555555',
        'accents-8': '#444444',
        // Semantic colors (monochrome scale)
        success: {
          DEFAULT: '#000000',
          subtle: '#f5f5f5',
        },
        warning: {
          DEFAULT: '#666666',
          subtle: '#fafafa',
        },
        danger: {
          DEFAULT: '#000000',
          subtle: '#f5f5f5',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        display: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        vercel: '0 0 0 1px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.08)',
        'vercel-hover': '0 0 0 1px rgba(0,0,0,0.12), 0 8px 30px rgba(0,0,0,0.12)',
        minimal: '0 2px 4px rgba(0,0,0,0.02)',
        glass: '0 8px 32px rgba(0,0,0,0.06)',
        elevated: '0 0 0 1px rgba(0,0,0,0.06), 0 16px 48px rgba(0,0,0,0.1)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.1)',
        subtle: '0 1px 2px rgba(0,0,0,0.04)',
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
          from: { boxShadow: '0 0 8px rgba(0,0,0,0.1)' },
          to: { boxShadow: '0 0 20px rgba(0,0,0,0.2)' },
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

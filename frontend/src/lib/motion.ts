/**
 * Framer Motion Variants & Animation Utilities.
 *
 * Centralized animation system for consistent micro-interactions
 * across the Cold Scout UI. All variants respect prefers-reduced-motion.
 */
import type { Variants, Transition } from 'framer-motion';

/* ── Transitions ── */

export const springTransition: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 24,
};

export const smoothTransition: Transition = {
  duration: 0.4,
  ease: [0.25, 0.1, 0.25, 1],
};

export const quickTransition: Transition = {
  duration: 0.2,
  ease: 'easeOut',
};

/* ── Fade Variants ── */

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: smoothTransition },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: smoothTransition },
};

export const fadeInDown: Variants = {
  hidden: { opacity: 0, y: -16 },
  visible: { opacity: 1, y: 0, transition: smoothTransition },
};

export const fadeInLeft: Variants = {
  hidden: { opacity: 0, x: -24 },
  visible: { opacity: 1, x: 0, transition: smoothTransition },
};

export const fadeInRight: Variants = {
  hidden: { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0, transition: smoothTransition },
};

/* ── Scale Variants ── */

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1, transition: springTransition },
};

export const scaleOut: Variants = {
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.92, transition: quickTransition },
};

/* ── Slide Variants ── */

export const slideUp: Variants = {
  hidden: { y: '100%', opacity: 0 },
  visible: { y: 0, opacity: 1, transition: smoothTransition },
  exit: { y: '100%', opacity: 0, transition: quickTransition },
};

export const slideInRight: Variants = {
  hidden: { x: '100%' },
  visible: { x: 0, transition: smoothTransition },
  exit: { x: '100%', transition: quickTransition },
};

/* ── Stagger Container ── */

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

export const staggerContainerSlow: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.15,
    },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: smoothTransition,
  },
};

export const staggerItemScale: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: springTransition,
  },
};

/* ── Page Transition ── */

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.15 },
  },
};

/* ── Hover & Tap ── */

export const hoverScale = {
  scale: 1.02,
  transition: springTransition,
};

export const hoverLift = {
  y: -4,
  transition: springTransition,
};

export const tapScale = {
  scale: 0.97,
};

export const hoverGlow = {
  boxShadow: '0 0 0 1px rgba(0,0,0,0.12), 0 8px 30px rgba(0,0,0,0.12)',
};

/* ── Card Hover (3D tilt) ── */

export const cardHover: Variants = {
  rest: {
    scale: 1,
    y: 0,
    boxShadow: '0 0 0 1px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.08)',
  },
  hover: {
    scale: 1.01,
    y: -2,
    boxShadow: '0 0 0 1px rgba(0,0,0,0.12), 0 12px 40px rgba(0,0,0,0.12)',
    transition: springTransition,
  },
};

/* ── Blur In ── */

export const blurIn: Variants = {
  hidden: { opacity: 0, filter: 'blur(8px)' },
  visible: {
    opacity: 1,
    filter: 'blur(0px)',
    transition: { duration: 0.5, ease: 'easeOut' },
  },
};

/* ── Modal / Overlay ── */

export const modalOverlay: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const modalContent: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: springTransition,
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 4,
    transition: quickTransition,
  },
};

/* ── Accordion / Collapse ── */

export const accordionContent: Variants = {
  collapsed: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] },
  },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
};

/* ── Nav Link Underline ── */

export const navUnderline: Variants = {
  rest: { scaleX: 0, originX: 0 },
  hover: {
    scaleX: 1,
    transition: { duration: 0.25, ease: 'easeOut' },
  },
};

/* ── Skeleton Shimmer ── */

export const shimmer: Variants = {
  animate: {
    backgroundPosition: ['200% 0', '-200% 0'],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

/* ── Tooltip ── */

export const tooltip: Variants = {
  hidden: { opacity: 0, scale: 0.9, y: 4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.15, ease: 'easeOut' },
  },
};

/* ── List Item (for tables, lists) ── */

export const listItem: Variants = {
  hidden: { opacity: 0, x: -8 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.04, duration: 0.3, ease: 'easeOut' },
  }),
};

/* ── Number Counter Helper ── */

export function getCountDuration(value: number): number {
  if (value < 10) return 0.5;
  if (value < 100) return 0.8;
  if (value < 1000) return 1.2;
  return 1.5;
}

/* ── Viewport detection defaults ── */

export const defaultViewport = { once: true, margin: '-60px' };

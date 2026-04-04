/**
 * Scroll Reveal Wrapper Component.
 *
 * Uses Framer Motion + Intersection Observer to animate children
 * into view when scrolled to. Configurable direction, delay, and threshold.
 */
import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';
import { defaultViewport } from '../../lib/motion';

type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

interface ScrollRevealProps {
  children: ReactNode;
  direction?: Direction;
  delay?: number;
  duration?: number;
  distance?: number;
  className?: string;
  once?: boolean;
  as?: 'div' | 'section' | 'article' | 'span';
}

const getVariants = (direction: Direction, distance: number): Variants => {
  const axis = { up: { y: distance }, down: { y: -distance }, left: { x: distance }, right: { x: -distance }, none: {} };
  return {
    hidden: { opacity: 0, ...axis[direction] },
    visible: { opacity: 1, x: 0, y: 0 },
  };
};

export default function ScrollReveal({
  children,
  direction = 'up',
  delay = 0,
  duration = 0.5,
  distance = 24,
  className = '',
  once = true,
  as = 'div',
}: ScrollRevealProps) {
  const Component = motion[as] as typeof motion.div;
  const variants = getVariants(direction, distance);

  return (
    <Component
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: defaultViewport.margin }}
      transition={{ duration, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className={className}
    >
      {children}
    </Component>
  );
}

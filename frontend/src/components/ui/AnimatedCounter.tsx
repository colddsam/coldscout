/**
 * Animated Counter Component.
 *
 * Counts up from 0 to a target value when scrolled into view.
 * Uses Framer Motion's useMotionValue and useTransform for smooth interpolation.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, animate, useInView } from 'framer-motion';
import { getCountDuration } from '../../lib/motion';

interface AnimatedCounterProps {
  value: number;
  suffix?: string;
  prefix?: string;
  className?: string;
  decimals?: number;
  duration?: number;
}

export default function AnimatedCounter({
  value,
  suffix = '',
  prefix = '',
  className = '',
  decimals = 0,
  duration,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });
  const motionValue = useMotionValue(0);
  const [displayValue, setDisplayValue] = useState('0');

  const rounded = useTransform(motionValue, (v) => {
    if (decimals > 0) return v.toFixed(decimals);
    return Math.round(v).toLocaleString();
  });

  useEffect(() => {
    const unsubscribe = rounded.on('change', (v) => setDisplayValue(v));
    return unsubscribe;
  }, [rounded]);

  useEffect(() => {
    if (!isInView) return;
    const controls = animate(motionValue, value, {
      duration: duration ?? getCountDuration(value),
      ease: [0.25, 0.1, 0.25, 1],
    });
    return controls.stop;
  }, [isInView, value, motionValue, duration]);

  return (
    <motion.span ref={ref} className={className}>
      {prefix}{displayValue}{suffix}
    </motion.span>
  );
}

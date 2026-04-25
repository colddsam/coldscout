/**
 * FadeUpBlock Animation Component.
 *
 * Generic fade-up wrapper for any content block.
 * Configurable delay and duration.
 */
import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface FadeUpBlockProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}

export default function FadeUpBlock({
  children,
  delay = 0,
  duration = 0.6,
  className = '',
}: FadeUpBlockProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{
        duration,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

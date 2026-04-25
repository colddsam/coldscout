/**
 * StaggeredCard Animation Component.
 *
 * Wraps children in a card entrance animation that scales from
 * 0.95 → 1 with a fade-in, triggered on scroll into view.
 * Multiple cards stagger at 0.12s intervals.
 */
import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface StaggeredCardProps {
  children: React.ReactNode;
  index?: number;
  className?: string;
}

export default function StaggeredCard({
  children,
  index = 0,
  className = '',
}: StaggeredCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={
        isInView
          ? { opacity: 1, scale: 1, y: 0 }
          : { opacity: 0, scale: 0.95, y: 20 }
      }
      transition={{
        duration: 0.6,
        delay: index * 0.12,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

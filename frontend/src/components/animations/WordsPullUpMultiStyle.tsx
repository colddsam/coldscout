/**
 * WordsPullUpMultiStyle Animation Component.
 *
 * Same pull-up animation as WordsPullUp, but accepts an array of
 * styled text segments allowing mixed typography within one heading.
 */
import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface Segment {
  text: string;
  className?: string;
}

interface WordsPullUpMultiStyleProps {
  segments: Segment[];
  className?: string;
  delay?: number;
}

export default function WordsPullUpMultiStyle({
  segments,
  className = '',
  delay = 0,
}: WordsPullUpMultiStyleProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  let wordIndex = 0;

  return (
    <span ref={ref} className={`inline-flex flex-wrap gap-x-[0.25em] ${className}`}>
      {segments.map((segment, segIdx) => {
        const words = segment.text.split(' ');
        return words.map((word, i) => {
          const currentIdx = wordIndex++;
          return (
            <motion.span
              key={`${segIdx}-${word}-${i}`}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{
                duration: 0.5,
                delay: delay + currentIdx * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={`inline-block ${segment.className || ''}`}
            >
              {word}
            </motion.span>
          );
        });
      })}
    </span>
  );
}

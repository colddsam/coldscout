/**
 * AnimatedLetter Component.
 *
 * Wraps each character in a motion.span that reveals from
 * low opacity to full opacity as the user scrolls through
 * the section. Creates a cinematic read-along effect.
 */
import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

interface AnimatedLetterProps {
  text: string;
  className?: string;
}

export default function AnimatedLetter({ text, className = '' }: AnimatedLetterProps) {
  const containerRef = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 0.9', 'start 0.25'],
  });

  const chars = text.split('');

  return (
    <p ref={containerRef} className={`inline ${className}`}>
      {chars.map((char, i) => {
        const start = i / chars.length;
        const end = start + 1 / chars.length;

        return (
          <AnimChar
            key={`${char}-${i}`}
            char={char}
            progress={scrollYProgress}
            start={start}
            end={end}
          />
        );
      })}
    </p>
  );
}

function AnimChar({
  char,
  progress,
  start,
  end,
}: {
  char: string;
  progress: ReturnType<typeof useScroll>['scrollYProgress'];
  start: number;
  end: number;
}) {
  const opacity = useTransform(progress, [start, end], [0.15, 1]);

  return (
    <motion.span style={{ opacity }} className="inline">
      {char}
    </motion.span>
  );
}

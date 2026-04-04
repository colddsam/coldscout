/**
 * Text Reveal Animation Component.
 *
 * Reveals text word-by-word or character-by-character with staggered
 * entrance animation. Used for hero headlines and section titles.
 */
import { motion } from 'framer-motion';

interface TextRevealProps {
  text: string;
  className?: string;
  mode?: 'words' | 'chars';
  delay?: number;
  staggerDelay?: number;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
}

export default function TextReveal({
  text,
  className = '',
  mode = 'words',
  delay = 0,
  staggerDelay = 0.04,
  as: Tag = 'span',
}: TextRevealProps) {
  const units = mode === 'words' ? text.split(' ') : text.split('');

  return (
    <Tag className={className} aria-label={text}>
      <motion.span
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-40px' }}
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: staggerDelay, delayChildren: delay } },
        }}
        className="inline"
      >
        {units.map((unit, i) => (
          <motion.span
            key={`${unit}-${i}`}
            variants={{
              hidden: { opacity: 0, y: 12, filter: 'blur(4px)' },
              visible: {
                opacity: 1,
                y: 0,
                filter: 'blur(0px)',
                transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] },
              },
            }}
            className="inline-block"
          >
            {unit}{mode === 'words' && i < units.length - 1 ? '\u00A0' : ''}
          </motion.span>
        ))}
      </motion.span>
    </Tag>
  );
}

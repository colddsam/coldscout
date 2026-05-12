/**
 * Page Header Component.
 *
 * Single source of truth for dashboard page titles. Renders an optional
 * eyebrow label, a tight title/subtitle pair and a right-aligned action
 * group. All elements stagger in with a quick reveal.
 */
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Short, uppercase label above the title. */
  eyebrow?: string;
  /** Right-aligned controls (buttons, segmented switches, etc.). */
  actions?: ReactNode;
  className?: string;
}

export default function PageHeader({ title, subtitle, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <motion.div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6 mb-6',
        className,
      )}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className="min-w-0">
        {eyebrow && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.05, duration: 0.25 }}
            className="eyebrow mb-1.5"
          >
            {eyebrow}
          </motion.p>
        )}
        <h2 className="heading-page truncate">{title}</h2>
        {subtitle && (
          <motion.p
            className="text-[13px] leading-relaxed text-tertiary mt-1.5 max-w-prose"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.3 }}
          >
            {subtitle}
          </motion.p>
        )}
      </div>
      {actions && (
        <motion.div
          className="flex flex-wrap items-center gap-2"
          initial={{ opacity: 0, x: 6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.12, duration: 0.3 }}
        >
          {actions}
        </motion.div>
      )}
    </motion.div>
  );
}

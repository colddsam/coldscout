/**
 * Page Header Component.
 *
 * Consistent animated header for all dashboard pages with
 * staggered title/subtitle/actions reveal.
 */
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <motion.div
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-black tracking-tight">{title}</h2>
        {subtitle && (
          <motion.p
            className="text-xs md:text-sm text-secondary mt-1"
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
          className="flex flex-wrap gap-2 md:gap-3"
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
        >
          {actions}
        </motion.div>
      )}
    </motion.div>
  );
}

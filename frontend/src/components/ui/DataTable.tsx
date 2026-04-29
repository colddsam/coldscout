/**
 * Generic Data Table Component.
 *
 * Type-safe tabular data display with staggered row animations,
 * shimmer loading skeletons, and interactive row hover effects.
 */
import { cn } from '../../lib/utils';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  render?: (value: unknown, row: T) => ReactNode;
  sortable?: boolean;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-white/[0.06]">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-3.5">
          <div
            className="h-3.5 rounded shimmer-bg"
            style={{ width: `${60 + ((i * 17) % 40)}%` }}
          />
        </td>
      ))}
    </tr>
  );
}

export default function DataTable<T extends object>({
  columns,
  data,
  onRowClick,
  loading = false,
  emptyMessage = 'No data available',
  className,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className={cn('overflow-x-auto rounded-xl border border-white/[0.08] bg-surface-2', className)}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.08] bg-white/[0.02]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-tertiary"
                  style={{ width: col.width }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonRow key={i} cols={columns.length} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!data.length) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-16 px-6 rounded-xl border border-white/[0.08] bg-surface-2"
      >
        <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-4">
          <span className="text-lg text-tertiary font-mono">∅</span>
        </div>
        <p className="font-sans text-sm text-secondary">{emptyMessage}</p>
      </motion.div>
    );
  }

  return (
    <div className={cn('overflow-x-auto rounded-xl border border-white/[0.08] bg-surface-2', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] bg-white/[0.02]">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-tertiary"
                style={{ width: col.width }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <motion.tr
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: Math.min(i * 0.03, 0.3),
                duration: 0.3,
                ease: 'easeOut',
              }}
              onClick={() => onRowClick?.(row)}
              className={cn(
                'border-b border-white/[0.05] last:border-0 transition-colors duration-150 text-foreground/90',
                onRowClick && 'cursor-pointer hover:bg-white/[0.035]',
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-5 py-3.5 align-middle">
                  {col.render
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ? col.render((row as any)[col.key], row)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    : String((row as any)[col.key] ?? '—')}
                </td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

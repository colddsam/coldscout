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
    <tr className="border-b border-accents-1">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-6 py-3">
          <div
            className="h-4 rounded shimmer-bg"
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
      <div className={cn('overflow-x-auto rounded-xl border border-gray-200', className)}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-accents-2 bg-accents-1">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-secondary"
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
        className="flex flex-col items-center justify-center py-16 text-secondary"
      >
        <div className="w-12 h-12 rounded-xl bg-accents-1 border border-accents-2 flex items-center justify-center mb-4">
          <span className="text-lg text-accents-3">0</span>
        </div>
        <p className="font-mono text-sm">{emptyMessage}</p>
      </motion.div>
    );
  }

  return (
    <div className={cn('overflow-x-auto rounded-xl border border-gray-200', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-accents-2 bg-accents-1">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-secondary"
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
                'border-b border-accents-1 transition-colors duration-200 text-secondary',
                onRowClick &&
                  'cursor-pointer hover:bg-gray-50/80',
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-6 py-4 text-secondary">
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

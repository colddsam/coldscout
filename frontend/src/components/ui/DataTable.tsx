/**
 * Generic Data Table Component.
 *
 * Type-safe tabular data display with staggered row reveal, shimmer
 * loading skeletons, refined empty state and an optional sticky header.
 */
import { cn } from '../../lib/utils';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { EmptyClipboard } from './Illustration';

export interface Column<T> {
  key: string;
  label: string;
  render?: (value: unknown, row: T) => ReactNode;
  sortable?: boolean;
  width?: string;
  /** Right-align the column (good for numerics). */
  numeric?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: string;
  emptyHint?: string;
  emptyIllustration?: ReactNode;
  className?: string;
  /** Stick the header to the top of the scroll container. */
  stickyHeader?: boolean;
  /** Compact row height for dense list views. */
  dense?: boolean;
}

function SkeletonRow({ cols, dense }: { cols: number; dense?: boolean }) {
  return (
    <tr className="border-b border-white/[0.05]">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className={cn('px-5', dense ? 'py-2.5' : 'py-3.5')}>
          <div
            className="h-3 rounded shimmer-bg"
            style={{ width: `${55 + ((i * 17) % 40)}%` }}
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
  emptyHint,
  emptyIllustration,
  className,
  stickyHeader = false,
  dense = false,
}: DataTableProps<T>) {
  const headerRow = (
    <tr className={cn('border-b border-white/[0.08] bg-black/40 backdrop-blur', stickyHeader && 'sticky top-0 z-[2]')}>
      {columns.map((col) => (
        <th
          key={col.key}
          className={cn(
            'px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-tertiary',
            col.numeric ? 'text-right' : 'text-left',
          )}
          style={{ width: col.width }}
        >
          {col.label}
        </th>
      ))}
    </tr>
  );

  if (loading) {
    return (
      <div className={cn('overflow-x-auto rounded-xl border border-white/[0.08] bg-surface-2', className)}>
        <table className="w-full text-sm">
          <thead>{headerRow}</thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonRow key={i} cols={columns.length} dense={dense} />
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
        className="empty-state"
      >
        <div className="text-white/55 mb-4">
          {emptyIllustration ?? <EmptyClipboard size={84} />}
        </div>
        <p className="heading-card mb-1.5">{emptyMessage}</p>
        {emptyHint && <p className="text-meta max-w-sm">{emptyHint}</p>}
      </motion.div>
    );
  }

  return (
    <div className={cn('overflow-x-auto rounded-xl border border-white/[0.08] bg-surface-2', className)}>
      <table className="w-full text-sm">
        <thead>{headerRow}</thead>
        <tbody>
          {data.map((row, i) => (
            <motion.tr
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: Math.min(i * 0.025, 0.25),
                duration: 0.25,
                ease: 'easeOut',
              }}
              onClick={() => onRowClick?.(row)}
              className={cn(
                'border-b border-white/[0.05] last:border-0 transition-colors duration-150 text-foreground/90',
                onRowClick && 'cursor-pointer hover:bg-white/[0.035]',
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-5 align-middle',
                    dense ? 'py-2.5' : 'py-3.5',
                    col.numeric && 'text-right tabular-nums font-mono',
                  )}
                >
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

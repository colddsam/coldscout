/**
 * Generic Data Table Component.
 * 
 * Provides a standardized, type-safe way to display tabular data.
 * Supports:
 * - Custom column rendering via a `render` function.
 * - Loading states with animated skeleton rows.
 * - Interactive row clicks for navigation or selection.
 * - Responsive horizontal scrolling for large data sets.
 */
import { cn } from '../../lib/utils';
import type { ReactNode } from 'react';

/**
 * Represents a column configuration for the data table.
 */
export interface Column<T> {
  /**
   * Unique key identifying the data property for this column.
   */
  key: string;
  /**
   * Display label shown in the table header.
   */
  label: string;
  /**
   * Optional function to customize the cell content rendering.
   * @param value The value to be rendered.
   * @param row The row data.
   * @returns The rendered ReactNode.
   */
  render?: (value: unknown, row: T) => ReactNode;
  /**
   * Enables visual sorting indicators (future support).
   */
  sortable?: boolean;
  /**
   * CSS width constraint for the column.
   */
  width?: string;
}

/**
 * Props for the data table component.
 */
interface DataTableProps<T> {
  /**
   * Array of column configurations.
   */
  columns: Column<T>[];
  /**
   * The raw data array to display.
   */
  data: T[];
  /**
   * Callback triggered when a row is clicked.
   * @param row The row data.
   */
  onRowClick?: (row: T) => void;
  /**
   * Visibility toggle for the loading skeleton state.
   */
  loading?: boolean;
  /**
   * Message displayed when the data array is empty.
   */
  emptyMessage?: string;
  /**
   * Additional CSS classes for the container.
   */
  className?: string;
}

/**
 * Renders a skeleton row for the data table.
 * @param props The component props.
 * @param props.cols The number of columns.
 * @returns The skeleton row ReactNode.
 */
function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-accents-1">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-6 py-3">
          <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${60 + ((i * 17) % 40)}%` }} />
        </td>
      ))}
    </tr>
  );
}

/**
 * Generic, type-safe data table component with support for custom column rendering,
 * loading skeletons, and interactive row clicks.
 */
export default function DataTable<T extends object>({
  columns,
  data,
  onRowClick,
  loading = false,
  emptyMessage = 'No data available',
  className,
}: DataTableProps<T>) {
  // Check if the component should display a loading skeleton state.
  if (loading) {
    return (
      <div className={cn('overflow-x-auto', className)}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-accents-2">
              {columns.map((col) => (
                <th key={col.key} className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-secondary" style={{ width: col.width }}>
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

  // Check if the data array is empty.
  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-secondary">
        <p className="font-mono text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-accents-2">
            {columns.map((col) => (
              <th key={col.key} className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-secondary" style={{ width: col.width }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              onClick={() => onRowClick?.(row)}
              className={cn(
                'border-b border-accents-1 transition-colors text-secondary',
                onRowClick && 'cursor-pointer hover:bg-gray-50',
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
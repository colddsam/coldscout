/**
 * HorizontalBars — compact ranked bar list.
 *
 * Used by the analytics page to show the top-N niches by reply rate.
 * Renders one row per item with a width-encoded bar plus left label
 * and right value. Pure CSS animation, no chart lib.
 */
import { motion } from 'framer-motion';

export interface HorizontalBarRow {
  key: string;
  label: string;
  value: number;
  /** Optional pre-formatted right-aligned display value. */
  display?: string;
  /** Optional secondary line under the label. */
  hint?: string;
}

interface HorizontalBarsProps {
  rows: HorizontalBarRow[];
  /** Bar accent colour. Defaults to white for monochrome theme. */
  color?: string;
  /** Maximum value used for width scaling. Defaults to max of rows. */
  max?: number;
}

export default function HorizontalBars({
  rows,
  color = '#FFFFFF',
  max,
}: HorizontalBarsProps) {
  if (!rows.length) {
    return (
      <p className="text-xs text-white/40 py-2">
        Not enough data to rank.
      </p>
    );
  }

  const cap = max ?? Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="space-y-3">
      {rows.map((row, idx) => {
        const widthPct = Math.max((row.value / cap) * 100, 4);
        return (
          <div key={row.key}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-white/85 font-medium truncate">{row.label}</span>
              <span className="text-white/70 tabular-nums font-mono">
                {row.display ?? row.value.toLocaleString()}
              </span>
            </div>
            <div className="relative h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ backgroundColor: color }}
                initial={{ width: 0 }}
                animate={{ width: `${widthPct}%` }}
                transition={{ duration: 0.5, delay: idx * 0.05, ease: 'easeOut' }}
              />
            </div>
            {row.hint && (
              <p className="text-[10px] text-white/40 mt-1">{row.hint}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * DonutChart — proportional ring with center label.
 *
 * Plain SVG (no recharts) so it stays small and animates cheaply with
 * stroke-dasharray. Designed for the analytics dashboard's sentiment
 * breakdown: positive / neutral / negative / unsubscribe.
 */
import { motion } from 'framer-motion';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  /** Number displayed in the center. */
  centerValue?: number | string;
  /** Caption under the center value. */
  centerLabel?: string;
  size?: number;
  thickness?: number;
}

export default function DonutChart({
  slices,
  centerValue,
  centerLabel,
  size = 180,
  thickness = 18,
}: DonutChartProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((s, x) => s + x.value, 0);

  let offset = 0;

  const hasData = total > 0;

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={thickness}
            fill="none"
          />

          {hasData &&
            slices.map((slice) => {
              const share = slice.value / total;
              if (share === 0) return null;
              const dash = share * circumference;
              const gap = circumference - dash;
              const rotation = (offset / circumference) * 360;
              offset += dash;
              return (
                <motion.circle
                  key={slice.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={slice.color}
                  strokeWidth={thickness}
                  fill="none"
                  strokeDasharray={`${dash} ${gap}`}
                  strokeLinecap="butt"
                  transform={`rotate(${rotation - 90} ${size / 2} ${size / 2})`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                />
              );
            })}
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-semibold text-white tabular-nums">
            {centerValue ?? total.toLocaleString()}
          </span>
          {centerLabel && (
            <span className="text-[10px] uppercase tracking-wider text-white/50 mt-0.5">
              {centerLabel}
            </span>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex-1 min-w-[140px] space-y-2">
        {slices.map((slice) => {
          const share = total ? slice.value / total : 0;
          return (
            <div key={slice.key} className="flex items-center justify-between text-xs gap-3">
              <span className="flex items-center gap-2 text-white/80">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: slice.color }}
                />
                {slice.label}
              </span>
              <span className="text-white/55 tabular-nums">
                {slice.value.toLocaleString()}
                <span className="ml-2 text-white/35">{(share * 100).toFixed(0)}%</span>
              </span>
            </div>
          );
        })}
        {!hasData && (
          <p className="text-xs text-white/40">No replies in this window yet.</p>
        )}
      </div>
    </div>
  );
}

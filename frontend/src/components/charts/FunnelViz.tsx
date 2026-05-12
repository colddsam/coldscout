/**
 * FunnelViz — discovery → reply funnel with conversion ribbons.
 *
 * Each stage is a horizontal bar whose width is proportional to its
 * count relative to the top stage. Conversion ribbons between stages
 * surface the stage-to-stage rate so a freelancer can immediately see
 * where the funnel collapses.
 */
import { motion } from 'framer-motion';

export interface FunnelStageItem {
  key: string;
  label: string;
  count: number;
}

interface FunnelVizProps {
  stages: FunnelStageItem[];
  /** Optional pre-computed stage-to-stage conversions, keyed by `${prev}_to_${next}`. */
  conversions?: Record<string, number>;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default function FunnelViz({ stages, conversions }: FunnelVizProps) {
  if (!stages.length) {
    return (
      <div className="flex items-center justify-center h-32 text-white/40 font-mono text-sm">
        No funnel data
      </div>
    );
  }

  const top = stages[0].count || 1;

  return (
    <div className="space-y-2">
      {stages.map((stage, idx) => {
        const widthPct = Math.max((stage.count / top) * 100, 4);
        const prev = stages[idx - 1];
        const conversionFromPrev =
          prev && conversions
            ? conversions[`${prev.key}_to_${stage.key}`]
            : undefined;

        return (
          <div key={stage.key}>
            {idx > 0 && (
              <div className="flex items-center pl-3 -mt-1 mb-1">
                <div className="h-3 w-px bg-white/15" />
                {conversionFromPrev !== undefined && (
                  <span className="ml-2 text-[10px] font-mono uppercase tracking-wider text-white/45">
                    {pct(conversionFromPrev)} → {stage.label.toLowerCase()}
                  </span>
                )}
              </div>
            )}

            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: `${widthPct}%`, opacity: 1 }}
              transition={{ duration: 0.5, delay: idx * 0.08, ease: 'easeOut' }}
              className="relative rounded-md overflow-hidden border border-white/10 bg-gradient-to-r from-white/15 via-white/10 to-white/[0.04]"
              style={{ minWidth: '180px' }}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs font-medium text-white tracking-wide">
                  {stage.label}
                </span>
                <span className="text-sm font-mono font-semibold text-white tabular-nums">
                  {stage.count.toLocaleString()}
                </span>
              </div>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

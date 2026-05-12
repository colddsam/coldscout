/**
 * Heatmap — weekday × hour matrix renderer for engagement timing.
 *
 * Renders a 7 × 24 grid. Cell intensity is proportional to count /
 * max(count). Hovering a cell surfaces "Weekday HH:00 — N events".
 */

interface HeatmapProps {
  /** 7 rows × 24 columns. Rows are Mon..Sun. */
  matrix: number[][];
  weekdayLabels: string[];
  /** Used in the cell aria-label / tooltip suffix. */
  metric: string;
  /** Override the default monochrome accent. */
  accent?: string;
}

export default function Heatmap({
  matrix,
  weekdayLabels,
  metric,
  accent = '255, 255, 255',
}: HeatmapProps) {
  const max = matrix.reduce(
    (m, row) => row.reduce((rm, v) => Math.max(rm, v), m),
    0,
  );

  if (!max) {
    return (
      <div className="flex items-center justify-center h-32 text-white/40 font-mono text-sm">
        No {metric.toLowerCase()} captured in this window
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        {/* Hour labels */}
        <div className="flex pl-10 mb-1">
          {Array.from({ length: 24 }).map((_, h) => (
            <div
              key={h}
              className="flex-1 text-[9px] text-white/35 font-mono text-center"
            >
              {h % 3 === 0 ? `${h.toString().padStart(2, '0')}` : ''}
            </div>
          ))}
        </div>

        {matrix.map((row, dayIdx) => (
          <div key={dayIdx} className="flex items-center mb-1">
            <div className="w-10 text-[10px] text-white/60 font-medium font-mono">
              {weekdayLabels[dayIdx]}
            </div>
            <div className="flex flex-1 gap-[2px]">
              {row.map((count, hour) => {
                const intensity = max ? count / max : 0;
                return (
                  <div
                    key={hour}
                    className="flex-1 aspect-square rounded-sm transition-transform hover:scale-125"
                    style={{
                      backgroundColor:
                        count === 0
                          ? 'rgba(255,255,255,0.03)'
                          : `rgba(${accent}, ${0.15 + intensity * 0.75})`,
                      border:
                        count === 0
                          ? '1px solid rgba(255,255,255,0.04)'
                          : `1px solid rgba(${accent}, ${0.25 + intensity * 0.4})`,
                    }}
                    title={`${weekdayLabels[dayIdx]} ${hour
                      .toString()
                      .padStart(2, '0')}:00 UTC — ${count} ${metric.toLowerCase()}`}
                    aria-label={`${weekdayLabels[dayIdx]} ${hour}:00 ${count} ${metric}`}
                  />
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-2 mt-3 text-[10px] text-white/45">
          <span>Less</span>
          <div className="flex gap-[2px]">
            {[0.15, 0.3, 0.5, 0.7, 0.9].map((alpha) => (
              <div
                key={alpha}
                className="w-3 h-3 rounded-sm"
                style={{
                  backgroundColor: `rgba(${accent}, ${alpha})`,
                  border: `1px solid rgba(${accent}, ${alpha + 0.1})`,
                }}
              />
            ))}
          </div>
          <span>More</span>
          <span className="ml-auto text-white/40">UTC hours</span>
        </div>
      </div>
    </div>
  );
}

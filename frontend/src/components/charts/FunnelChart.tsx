interface FunnelStage {
  label: string;
  value: number;
  color: string;
}

interface FunnelChartProps {
  stages: FunnelStage[];
}

export default function FunnelChart({ stages }: FunnelChartProps) {
  const maxValue = Math.max(...stages.map((s) => s.value), 1);

  return (
    <div className="flex items-end gap-1 justify-center py-4">
      {stages.map((stage, i) => {
        const widthPercent = Math.max((stage.value / maxValue) * 100, 15);
        const prevValue = i > 0 ? stages[i - 1].value : null;
        const conversionRate = prevValue && prevValue > 0
          ? ((stage.value / prevValue) * 100).toFixed(1) + '%'
          : null;

        return (
          <div key={stage.label} className="flex flex-col items-center gap-2 flex-1">
            {/* Bar */}
            <div
              className="rounded-lg transition-all duration-500 relative overflow-hidden"
              style={{
                width: `${widthPercent}%`,
                minWidth: '60px',
                height: '100px',
                backgroundColor: stage.color,
                opacity: 0.8 + (i * 0.04),
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-lg font-mono font-bold ${i < 3 ? 'text-white' : 'text-black'}`}>
                  {stage.value}
                </span>
              </div>
            </div>

            {/* Label */}
            <span className="text-xs font-mono text-gray-400 text-center">{stage.label}</span>

            {/* Conversion rate */}
            {conversionRate && (
              <span className="text-[10px] font-mono text-gray-500">{conversionRate}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

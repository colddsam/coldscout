/**
 * Sparkline — tiny inline trend chart for KPI tiles.
 *
 * Renders a closed area under a line. Auto-scales to data, falls back
 * to a flat baseline when the series is empty so the tile layout is
 * stable.
 */

interface SparklineProps {
  data: number[];
  /** Stroke colour (CSS). Defaults to white for the monochrome theme. */
  color?: string;
  /** Total width / height. Numbers are CSS pixels. */
  width?: number;
  height?: number;
  /** Optional aria-label for the SVG. */
  label?: string;
}

export default function Sparkline({
  data,
  color = '#FFFFFF',
  width = 120,
  height = 32,
  label,
}: SparklineProps) {
  if (!data.length) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
      >
        <line
          x1={0}
          y1={height - 1}
          x2={width}
          y2={height - 1}
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={1}
        />
      </svg>
    );
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = data.length > 1 ? width / (data.length - 1) : width;

  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = height - 2 - ((v - min) / range) * (height - 4);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const areaPoints = `0,${height} ${points} ${width},${height}`;
  const gradientId = `spark-${color.replace('#', '')}-${Math.round(width * 13)}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';

interface AreaSpec {
  dataKey: string;
  color: string;
  label: string;
}

interface AreaChartProps {
  data: Array<Record<string, unknown>>;
  areas: AreaSpec[];
  xKey?: string;
  height?: number;
}

export default function AreaChart({
  data,
  areas,
  xKey = 'date',
  height = 280,
}: AreaChartProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-white/40 font-mono text-sm">
        No data in this window
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsAreaChart data={data}>
        <defs>
          {areas.map((a) => (
            <linearGradient
              key={a.dataKey}
              id={`grad-${a.dataKey}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={a.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={a.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey={xKey}
          stroke="#666"
          fontSize={11}
          fontFamily="Almarai, system-ui, sans-serif"
          tickLine={false}
        />
        <YAxis
          stroke="#666"
          fontSize={11}
          fontFamily="Almarai, system-ui, sans-serif"
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#0d0d0d',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '10px',
            fontSize: '12px',
            fontFamily: 'Almarai, system-ui, sans-serif',
            color: '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        />
        <Legend
          iconType="circle"
          wrapperStyle={{
            fontSize: '11px',
            color: 'rgba(255,255,255,0.7)',
            paddingTop: '8px',
          }}
        />
        {areas.map((a) => (
          <Area
            key={a.dataKey}
            type="monotone"
            dataKey={a.dataKey}
            name={a.label}
            stroke={a.color}
            strokeWidth={2}
            fill={`url(#grad-${a.dataKey})`}
            activeDot={{ r: 4, fill: a.color, stroke: '#000', strokeWidth: 2 }}
          />
        ))}
      </RechartsAreaChart>
    </ResponsiveContainer>
  );
}

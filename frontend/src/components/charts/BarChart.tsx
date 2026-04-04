import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface BarChartProps {
  data: Array<Record<string, unknown>>;
  bars: Array<{ dataKey: string; color: string; label: string }>;
  xKey?: string;
}

export default function BarChart({ data, bars, xKey = 'date' }: BarChartProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 font-mono text-sm">
        No chart data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsBarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey={xKey}
          stroke="#999"
          fontSize={11}
          fontFamily="Inter, system-ui, sans-serif"
          tickLine={false}
        />
        <YAxis
          stroke="#999"
          fontSize={11}
          fontFamily="Inter, system-ui, sans-serif"
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#ffffff',
            border: '1px solid #eeeeee',
            borderRadius: '8px',
            fontSize: '12px',
            fontFamily: 'Inter, system-ui, sans-serif',
            color: '#000000',
          }}
        />
        {bars.map((bar) => (
          <Bar
            key={bar.dataKey}
            dataKey={bar.dataKey}
            fill={bar.color}
            radius={[3, 3, 0, 0]}
          />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}

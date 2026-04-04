import { LineChart as RechartsLineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface LineChartProps {
  data: Array<Record<string, unknown>>;
  lines: Array<{ dataKey: string; color: string; label: string }>;
  xKey?: string;
}

export default function LineChart({ data, lines, xKey = 'date' }: LineChartProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 font-mono text-sm">
        No chart data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsLineChart data={data}>
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
        {lines.map((line) => (
          <Line
            key={line.dataKey}
            type="monotone"
            dataKey={line.dataKey}
            stroke={line.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: line.color }}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}

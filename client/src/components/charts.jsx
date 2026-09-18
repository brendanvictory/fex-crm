import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Area, AreaChart, Cell
} from 'recharts';

// Brand colors
const NAVY = '#000077';
const SKY = '#98dcf5';
const GRID = '#eef0f4';
const INK = '#6b7280';

const axis = { fontSize: 12, fill: INK };

const tooltipStyle = {
  contentStyle: { borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 },
  labelStyle: { color: NAVY, fontWeight: 700 }
};

// Leads over time — single navy line with a soft sky fill.
export function TrendChart({ data, xKey = 'day', yKey = 'count', height = 240 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="skyFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SKY} stopOpacity={0.5} />
            <stop offset="100%" stopColor={SKY} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={axis} tickLine={false} axisLine={{ stroke: GRID }}
          tickFormatter={(d) => String(d).slice(5)} minTickGap={24} />
        <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <Tooltip {...tooltipStyle} />
        <Area type="monotone" dataKey={yKey} stroke={NAVY} strokeWidth={2}
          fill="url(#skyFill)" dot={false} activeDot={{ r: 4, fill: NAVY }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Horizontal magnitude bars — one navy hue; identity is carried by the labels.
export function BarList({ data, labelKey = 'label', valueKey = 'count', height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={axis} tickLine={false} axisLine={{ stroke: GRID }} allowDecimals={false} />
        <YAxis type="category" dataKey={labelKey} tick={axis} tickLine={false} axisLine={false} width={130} />
        <Tooltip {...tooltipStyle} cursor={{ fill: '#f4f8fd' }} />
        <Bar dataKey={valueKey} fill={NAVY} radius={[0, 4, 4, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export { NAVY, SKY };

'use client';

import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  LabelList,
} from 'recharts';
import { cn } from '@/lib/utils';

export interface HorizontalBarChartItem {
  name: string;
  value: number;
}

interface HorizontalBarChartProps {
  data: HorizontalBarChartItem[];
  height?: number;
  className?: string;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2 text-xs text-[var(--color-text-primary)] shadow-lg">
      <div className="text-[12px] font-semibold">{item.payload.name}</div>
      <div className="text-[10px] text-[var(--color-text-muted)]">{item.value}%</div>
    </div>
  );
}

/**
 * Custom bar label: renders the % inside the bar (white, right-aligned) when the
 * bar is wide enough, or just outside the bar (themed text color) when it is short.
 */
function BarLabel(props: any) {
  const { x, y, width, height, value } = props;
  const label = `${value}%`;
  const isShort = width < 52;

  if (isShort) {
    // Place label just to the right of the bar end
    return (
      <text
        x={x + width + 6}
        y={y + height / 2}
        dominantBaseline="middle"
        fill="var(--color-text-secondary, #6B7280)"
        fontSize={10}
        fontWeight={600}
        textAnchor="start"
      >
        {label}
      </text>
    );
  }

  // Place label inside bar, near the right end, centered vertically
  return (
    <text
      x={x + width - 10}
      y={y + height / 2}
      dominantBaseline="middle"
      fill="#ffffff"
      fontSize={10}
      fontWeight={600}
      textAnchor="end"
    >
      {label}
    </text>
  );
}

export function HorizontalBarChart({ data, height, className }: HorizontalBarChartProps) {
  const chartHeight = height ?? Math.max(170, data.length * 48);
  const formattedData = data.map(item => ({ name: item.name, value: Number(item.value ?? 0) }));

  return (
    <div className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={formattedData}
          layout="vertical"
          margin={{ top: 8, right: 48, left: 4, bottom: 8 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis type="number" axisLine={false} tickLine={false} tick={false} domain={[0, 100]} />
          <YAxis
            type="category"
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--color-text-primary)', fontSize: 11, textAnchor: 'end' }}
            width={160}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(40,69,214,0.06)' }} />
          <Bar
            dataKey="value"
            fill="#2845D6"
            radius={[0, 6, 6, 0]}
            barSize={22}
            animationDuration={1200}
            animationEasing="ease-out"
          >
            <LabelList content={<BarLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

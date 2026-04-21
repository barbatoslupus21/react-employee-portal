'use client';

/**
 * multi-series-chart.tsx
 *
 * Reusable stacked bar / multi-line chart built on Recharts + Framer Motion.
 * Shared across all dashboard modules — import CHART_ANIMATION and CHART_STYLE
 * for consistent animation settings everywhere.
 */

import React, { useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ── Shared types ──────────────────────────────────────────────────────────────

export interface ChartCategory {
  key:        string;
  label:      string;
  color:      string;
  gradId:     string;
  lightColor: string;
}

export type MultiSeriesDataPoint = Record<string, number | string>;

// ── Animation config — single source of truth across all modules ──────────────

export const CHART_ANIMATION = {
  bar:     { duration: 700,  easing: 'ease-out'    as const },
  line:    { duration: 1800, easing: 'ease-in-out' as const },
  tick:    { duration: 0.15, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  enter:   { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  overlay: { duration: 0.15 },
} as const;

// ── Shared style constants ────────────────────────────────────────────────────

export const CHART_STYLE = {
  tickProps:   { fontSize: 11, fill: 'var(--color-text-muted)' },
  gridStroke:  'var(--color-border)',
  legendStyle: { paddingTop: 8, fontSize: 11 },
  margin:      { top: 4, right: 8, left: -16, bottom: 0 },
  maxBarSize:  48,
} as const;

// ── Animated X-axis tick ──────────────────────────────────────────────────────
// When the label value changes, the old label slides upward and fades out;
// the new label fades in from slightly below. Uses AnimatePresence mode="wait"
// so the exit completes before the enter begins.

function AnimatedXTick({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  if (!payload?.value) return null;
  return (
    <g transform={`translate(${x},${y})`}>
      <AnimatePresence mode="wait">
        <motion.text
          key={payload.value}
          x={0}
          dy="0.71em"
          textAnchor="middle"
          fontSize={CHART_STYLE.tickProps.fontSize}
          fill={CHART_STYLE.tickProps.fill}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: CHART_ANIMATION.tick.duration, ease: CHART_ANIMATION.tick.ease }}
        >
          {payload.value}
        </motion.text>
      </AnimatePresence>
    </g>
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltipContent({
  active,
  payload,
  label,
  categories,
}: {
  active?:    boolean;
  payload?:   { name: string; value: number; dataKey: string }[];
  label?:     string;
  categories: ChartCategory[];
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2.5 shadow-lg text-[11px] min-w-[148px]">
      <p className="font-semibold text-[var(--color-text-primary)] mb-1.5">{label}</p>
      {categories.map(cat => {
        const entry = payload.find(p => p.dataKey === cat.key);
        if (!entry) return null;
        return (
          <div key={cat.key} className="flex items-center justify-between gap-3 mb-0.5">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
              <span className="text-[var(--color-text-muted)]">{cat.label}</span>
            </span>
            <span className="font-semibold text-[var(--color-text-primary)]">{entry.value}</span>
          </div>
        );
      })}
      <div className="mt-1.5 pt-1.5 border-t border-[var(--color-border)] flex justify-between font-bold">
        <span className="text-[var(--color-text-muted)]">Total</span>
        <span className="text-[#2845D6]">{total}</span>
      </div>
    </div>
  );
}

// ── Chart skeleton (initial load only) ───────────────────────────────────────

export function ChartSkeleton() {
  return (
    <div className="flex items-end gap-2 h-full px-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-md bg-[var(--color-bg-card)] animate-pulse"
          style={{ height: `${30 + (i * 13 % 70)}%` }}
        />
      ))}
    </div>
  );
}

// ── MultiSeriesChart ──────────────────────────────────────────────────────────

export interface MultiSeriesChartProps {
  data:          MultiSeriesDataPoint[];
  categories:    ChartCategory[];
  chartType:     'bar' | 'line';
  /** Change this key to trigger an animated view/type transition. */
  chartKey:      string;
  maxCount?:     number;
  /** True while new data loads — shows a soft overlay instead of destroying axes. */
  transitioning?: boolean;
}

export function MultiSeriesChart({
  data,
  categories,
  chartType,
  chartKey,
  maxCount,
  transitioning = false,
}: MultiSeriesChartProps) {
  const domainMax =
    (maxCount ??
      Math.max(1, ...data.map(d => categories.reduce((s, c) => s + (Number(d[c.key]) || 0), 0)))
    ) + 1;

  const tooltipContent = useCallback(
    (props: any) => <ChartTooltipContent {...props} categories={categories} />,
    [categories],
  );

  const xAxis = (
    <XAxis
      dataKey="label"
      tick={(p: any) => <AnimatedXTick {...p} />}
      axisLine={false}
      tickLine={false}
    />
  );

  const yAxis = (
    <YAxis
      allowDecimals={false}
      tick={CHART_STYLE.tickProps}
      axisLine={false}
      tickLine={false}
      domain={[0, domainMax]}
    />
  );

  return (
    <div className="relative h-full">
      {/* Soft overlay during filter-change loads — no skeleton flash */}
      <AnimatePresence>
        {transitioning && (
          <motion.div
            key="chart-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: CHART_ANIMATION.overlay.duration }}
            className="absolute inset-0 z-10 rounded-lg bg-[var(--color-bg-elevated)]/50 pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Chart — full transition when chartKey changes (view or type switch) */}
      <AnimatePresence mode="wait">
        <motion.div
          key={chartKey}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: CHART_ANIMATION.enter.duration, ease: CHART_ANIMATION.enter.ease }}
          className="h-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={data} margin={CHART_STYLE.margin} barGap={6} barCategoryGap="16%">
                <defs>
                  {categories.map(cat => (
                    <linearGradient key={`bg-${cat.gradId}`} id={`bg-${cat.gradId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={cat.color} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={cat.lightColor} stopOpacity={0.95} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_STYLE.gridStroke} vertical={false} />
                {xAxis}
                {yAxis}
                <Tooltip content={tooltipContent} cursor={{ fill: 'var(--color-bg-card)' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={CHART_STYLE.legendStyle} />
                {categories.map((cat, idx) => (
                  <Bar
                    key={cat.key}
                    dataKey={cat.key}
                    name={cat.label}
                    stackId="a"
                    fill={`url(#bg-${cat.gradId})`}
                    stroke={cat.color}
                    strokeWidth={0.75}
                    radius={idx === categories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    maxBarSize={CHART_STYLE.maxBarSize}
                    isAnimationActive
                    animationDuration={CHART_ANIMATION.bar.duration}
                    animationEasing={CHART_ANIMATION.bar.easing}
                  />
                ))}
              </BarChart>
            ) : (
              <AreaChart data={data} margin={CHART_STYLE.margin}>
                <defs>
                  {categories.map(cat => (
                    <linearGradient key={`ag-${cat.gradId}`} id={`ag-${cat.gradId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={cat.lightColor} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={cat.lightColor} stopOpacity={0}    />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_STYLE.gridStroke} vertical={false} />
                {xAxis}
                {yAxis}
                <Tooltip content={tooltipContent} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={CHART_STYLE.legendStyle} />
                {categories.map(cat => (
                  <Area
                    key={cat.key}
                    type="monotone"
                    dataKey={cat.key}
                    name={cat.label}
                    stroke={cat.lightColor}
                    strokeWidth={2.5}
                    fill={`url(#ag-${cat.gradId})`}
                    dot={{ r: 3, fill: cat.lightColor, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: cat.lightColor }}
                    isAnimationActive
                    animationDuration={CHART_ANIMATION.line.duration}
                    animationEasing={CHART_ANIMATION.line.easing}
                  />
                ))}
              </AreaChart>
            )}
          </ResponsiveContainer>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

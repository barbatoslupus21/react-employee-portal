'use client';

/**
 * AdminChartCard — reusable chart card with fiscal/monthly/weekly toolbar.
 *
 * Used by any admin page that needs a multi-series bar/line chart with
 * date-range filtering. All state lives in the parent; this component
 * is purely presentational + interaction.
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart2, TrendingUp } from 'lucide-react';
import { MultiSeriesChart, ChartSkeleton } from '@/components/ui/multi-series-chart';
import type { ChartCategory, MultiSeriesDataPoint } from '@/components/ui/multi-series-chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChartViewType    = 'fiscal' | 'monthly' | 'weekly';
export type ChartDisplayType = 'bar'    | 'line';

const DEFAULT_VIEW_LABELS: Record<ChartViewType, string> = {
  fiscal:  'Fiscal Year',
  monthly: 'Monthly',
  weekly:  'Weekly',
};

export interface AdminChartCardProps {
  // ── Data ──────────────────────────────────────────────────────────────────
  /** Chart series definitions (key, label, colour). */
  categories:   ChartCategory[];
  /**
   * Row data. Each row must contain a `label` string key plus one numeric
   * key per category. Compatible with MultiSeriesDataPoint[] without casting.
   */
  data:         Record<string, string | number>[];
  /** Show the ChartSkeleton (first-ever load). */
  loading:      boolean;
  /** Show a soft overlay while new data loads in (filter/view changes). */
  transitioning?: boolean;

  // ── View toggle ────────────────────────────────────────────────────────────
  viewType:          ChartViewType;
  onViewTypeChange:  (v: ChartViewType) => void;

  // ── Chart-type toggle (bar / line) ─────────────────────────────────────────
  chartType:         ChartDisplayType;
  onChartTypeChange: (t: ChartDisplayType) => void;

  // ── Fiscal-year secondary control ─────────────────────────────────────────
  fyStart:           number;
  onFyStartChange:   (y: number) => void;
  /** Available FY start years shown in the dropdown, e.g. [2026, 2025, …]. */
  fyOptions:         number[];

  // ── Monthly secondary control ─────────────────────────────────────────────
  /**
   * Combined "YYYY-M" string representing the selected year and month,
   * e.g. "2026-3". Must match the `value` field of `monthOptions` entries.
   */
  monthYear:         string;
  onMonthYearChange: (value: string) => void;
  /** Options for the month select. value must be "YYYY-M" format. */
  monthOptions:      { value: string; label: string }[];

  // ── Weekly secondary control ───────────────────────────────────────────────
  weekStart:         string;
  onWeekStartChange: (v: string) => void;
  weekOptions:       { value: string; label: string }[];

  // ── Customisation ─────────────────────────────────────────────────────────
  /** Override the view-tab labels. Defaults to Fiscal Year / Monthly / Weekly. */
  viewLabels?: Record<ChartViewType, string>;
  /**
   * Unique identifier used to namespace Framer Motion `layoutId` values.
   * Required if two AdminChartCards are rendered on the same page simultaneously.
   * Defaults to "default".
   */
  id?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AdminChartCard({
  categories,
  data,
  loading,
  transitioning = false,
  viewType,
  onViewTypeChange,
  chartType,
  onChartTypeChange,
  fyStart,
  onFyStartChange,
  fyOptions,
  monthYear,
  onMonthYearChange,
  monthOptions,
  weekStart,
  onWeekStartChange,
  weekOptions,
  viewLabels = DEFAULT_VIEW_LABELS,
  id = 'default',
}: AdminChartCardProps) {
  const pillId = `${id}-chart-view-pill`;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3 border-b border-[var(--color-border)]">

        {/* View selector — animated sliding pill */}
        <div className="relative flex items-center bg-[var(--color-bg)] rounded-xl p-0.5">
          {(['fiscal', 'monthly', 'weekly'] as ChartViewType[]).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => onViewTypeChange(v)}
              className="relative h-7 px-3 rounded-lg z-10 text-xs font-medium"
            >
              {viewType === v && (
                <motion.div
                  layoutId={pillId}
                  className="absolute inset-0 rounded-lg bg-[var(--color-bg-elevated)] shadow-sm"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              <span
                className={cn(
                  'relative z-10 transition-colors',
                  viewType === v
                    ? 'text-[#2845D6]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
                )}
              >
                {viewLabels[v]}
              </span>
            </button>
          ))}
        </div>

        {/* Dynamic secondary controls — animated in/out */}
        <AnimatePresence mode="wait">
          {viewType === 'fiscal' && (
            <motion.div
              key="fy"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.18 }}
            >
              <Select
                value={String(fyStart)}
                onValueChange={v => onFyStartChange(Number(v))}
              >
                <SelectTrigger className="h-8 text-xs min-w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fyOptions.map(y => (
                    <SelectItem key={y} value={String(y)}>
                      FY {y}–{y + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </motion.div>
          )}

          {viewType === 'monthly' && (
            <motion.div
              key="month"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.18 }}
            >
              <Select value={monthYear} onValueChange={onMonthYearChange}>
                <SelectTrigger className="h-8 text-xs min-w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </motion.div>
          )}

          {viewType === 'weekly' && (
            <motion.div
              key="week"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.18 }}
            >
              <Select value={weekStart} onValueChange={onWeekStartChange}>
                <SelectTrigger className="h-8 text-xs min-w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {weekOptions.map(w => (
                    <SelectItem key={w.value} value={w.value}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1" />

        {/* Bar / Line toggle */}
        <button
          type="button"
          title={chartType === 'bar' ? 'Switch to Line chart' : 'Switch to Bar chart'}
          onClick={() => onChartTypeChange(chartType === 'bar' ? 'line' : 'bar')}
          className="relative flex h-8 w-[3.5rem] items-center rounded-full bg-[var(--color-bg)] p-1"
        >
          <motion.div
            layout
            transition={{ type: 'spring', stiffness: 700, damping: 30 }}
            className={cn(
              'h-6 w-6 rounded-full bg-[#2845D6] shadow-md flex items-center justify-center text-white',
              chartType === 'line' ? 'ml-auto' : '',
            )}
          >
            {chartType === 'bar' ? <BarChart2 size={12} /> : <TrendingUp size={12} />}
          </motion.div>
        </button>
      </div>

      {/* ── Chart body ──────────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-5 h-[280px]">
        {loading ? (
          <ChartSkeleton />
        ) : (
          <MultiSeriesChart
            data={data as MultiSeriesDataPoint[]}
            categories={categories}
            chartType={chartType}
            chartKey={`${id}-${chartType}`}
            transitioning={transitioning}
          />
        )}
      </div>
    </div>
  );
}

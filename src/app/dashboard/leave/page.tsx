'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Activity,
  Ban,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  CheckCheck,
  Clock,
  Download,
  Eye,
  FileText,
  Hash,
  Info,
  Pencil,
  Plus,
  TrendingUp,
  X,
  XCircle,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminTableSection } from '@/components/ui/admin-table-section';
import { FilterListContent } from '@/components/ui/admin-table-accordion';
import type { DataTableColumn } from '@/components/ui/data-table';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { StatusPill } from '@/components/ui/status-pill';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LeaveRangePicker } from '@/components/ui/leave-range-picker';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Input } from '@/components/ui/input';
import { TextareaWithCharactersLeft } from '@/components/ui/textarea-with-characters-left';
import { RoundedTooltip } from '@/components/ui/rounded-tooltip';
import { Timeline } from '@/components/ui/timeline';
import type { TimelineItem, TimelineStatus } from '@/components/ui/timeline';
import { TwoDBarChart } from '@/components/ui/2dbar-chart';
import { EmptyState } from '@/components/ui/interactive-empty-state';
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
} from 'recharts';
import {
  ChartContainer as LineChartContainer,
  ChartTooltip as LineChartTooltip,
  ChartTooltipContent as LineChartTooltipContent,
  type ChartConfig as LineChartConfig,
} from '@/components/ui/line-chart';
import { getCsrfToken } from '@/lib/csrf';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { AdminChartCard } from '@/components/ui/admin-chart-card';
import type { ChartViewType, ChartDisplayType } from '@/components/ui/admin-chart-card';
import type { ChartCategory, MultiSeriesDataPoint } from '@/components/ui/multi-series-chart';
import { useDebounce } from '@/hooks/use-debounce';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserData {
  id: number;
  idnumber: string;
  firstname: string | null;
  lastname: string | null;
  admin: boolean;
  hr: boolean;
  clinic: boolean;
  iad: boolean;
  accounting: boolean;
  is_approver: boolean;
}

interface LeaveBalance {
  id: number;
  leave_type: string;
  leave_type_id: number;
  period_start: string;
  period_end: string;
  entitled_leave: string;
  used_leave: string;
  remaining_leave: string;
  pending_leave: string;
}

interface LeaveType {
  id: number;
  name: string;
  has_balance: boolean;
  deductible: boolean;
  requires_clinic_approval: boolean;
}

interface LeaveSubreason {
  id: number;
  title: string;
}

interface LeaveReason {
  id: number;
  title: string;
  subreasons: LeaveSubreason[];
}

interface LeaveRequest {
  id: number;
  control_number: string;
  leave_type: string;
  leave_type_id: number;
  leave_type_name: string;
  reason: string;
  reason_id: number;
  reason_title: string;
  subreason: string | null;
  subreason_id: number | null;
  subreason_title: string | null;
  date_start: string;
  date_end: string;
  hours: string;
  days_count: number;
  is_deductible: boolean;
  status: string;
  status_display: string;
  remarks: string;
  date_prepared: string;
  date_prepared_display: string;
  duration_display: string;
  can_cancel: boolean;
  can_review: boolean;
  employee_name: string;
  employee_id?: string;
  employee_id_number?: string;
  employee_department?: string;
  employee_line?: string;
}

interface ApprovalStep {
  id: number;
  role_group: string;
  role_group_display: string;
  sequence: number;
  status: string;
  status_display: string;
  approver_name: string | null;
  approver_position: string | null;
  acted_by_name: string | null;
  acted_by_position: string | null;
  acted_at: string | null;
  activated_at: string | null;
  remarks: string;
}

interface LeaveDetail extends LeaveRequest {
  approval_steps: ApprovalStep[];
  cancelled_at: string | null;
  cancelled_by_name: string | null;
}

interface PagedResponse {
  count: number;
  total_pages: number;
  results: LeaveRequest[];
}

interface CalendarLeaveRequest {
  date_start: string;
  date_end: string;
  status: string;
  leave_type_name: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(start: Date, end: Date): number {
  const ms = end.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0);
  return Math.max(Math.round(ms / 86400000) + 1, 1);
}

function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
}

function stepStatusToTimeline(s: string, isActive = true): TimelineStatus {
  if (s === 'approved') return 'approved';
  if (s === 'disapproved') return 'disapproved';
  if (s === 'cancelled') return 'canceled';
  if (s === 'pending') return isActive ? 'pending' : 'waiting';
  return 'default';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
  });
}

function formatStepTime(ts: Date): string {
  const datePart = ts.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const timePart = ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return `${datePart} ${timePart}`;
}

function formatTimeAndDays(days: number, hoursValue: string | number): string {
  const hours = Number(hoursValue);
  const dayLabel = days === 1 ? 'day' : 'days';
  const hourLabel = hours === 1 ? 'hour' : 'hours';
  const hoursFormatted = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${days} ${dayLabel} - ${hoursFormatted} ${hourLabel}`;
}

const BLOCKED = /[<>{}[\]\\|^~`"]/;

// ── Status filter options ─────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'routing', label: 'Routing' },
  { value: 'approved', label: 'Approved' },
  { value: 'disapproved', label: 'Disapproved' },
  { value: 'cancelled', label: 'Cancelled' },
];

const APPROVAL_QUEUE_STATUS_OPTIONS = STATUS_OPTIONS.filter(o => o.value !== 'all' && o.value !== 'routing');

// ── Balance cards ─────────────────────────────────────────────────────────────

function fmtDurationRange(start: string, end: string): string {
  if (start === end) {
    const d = new Date(start + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  return fmtPeriod(start, end);
}

function fmtPeriod(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const sameMonth = sameYear && startDate.getMonth() === endDate.getMonth();

  if (sameYear && sameMonth) {
    const startLabel = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const year = endDate.getFullYear();
    return `${startLabel} - ${endDate.getDate()}, ${year}`;
  }

  if (sameYear) {
    const startLabel = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endLabel = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startLabel} - ${endLabel}`;
  }

  const startLabel = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const endLabel = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startLabel} - ${endLabel}`;
}

function BalanceCards({ balances }: { balances: LeaveBalance[] }) {
  if (!balances.length) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {balances.map(b => (
        <div
          key={b.id}
          className="rounded-xl border border-border bg-card px-4 py-3 flex flex-col gap-1 min-w-[150px]"
        >
          <span className="text-xs font-medium text-muted-foreground">{b.leave_type}</span>
          <span className="text-2xl font-bold text-foreground">{b.remaining_leave}</span>
          <span className="text-[11px] text-muted-foreground">
            {b.used_leave} used / {b.entitled_leave} entitled
          </span>
          <span className="text-[10px] text-muted-foreground/70 mt-0.5">
            {fmtPeriod(b.period_start, b.period_end)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Chart colour palette ──────────────────────────────────────────────────────

const CHART_COLORS = [
  '#2845D6', '#0D1A63', '#6478e8', '#3d5aed', '#1a2fa8',
  '#4f63b8', '#9aa5e8', '#8b9fe0', '#c5cbf3', '#7986d4',
];

// ── Determine "current period" from balances ──────────────────────────────────

function getCurrentPeriodBalances(balances: LeaveBalance[]): LeaveBalance[] {
  if (!balances.length) return [];
  const today = new Date().toISOString().slice(0, 10);
  const current = balances.filter(b => b.period_start <= today && b.period_end >= today);
  if (current.length) return current;
  // Fall back to the period with the latest start date
  const sorted = [...balances].sort((a, b) => b.period_start.localeCompare(a.period_start));
  const latestPeriod = `${sorted[0].period_start}|${sorted[0].period_end}`;
  return balances.filter(b => `${b.period_start}|${b.period_end}` === latestPeriod);
}

// ── Line chart colours ───────────────────────────────────────────────────────

const LINE_COLORS = [
  '#4f86f7', '#f4a261', '#82e0aa', '#eb6b86',
  '#c77dff', '#45b7d1', '#ffd166', '#06d6a0',
  '#ef476f', '#90e0ef', '#a8dadc', '#ffc8dd',
];

// ── Mini Calendar ─────────────────────────────────────────────────────────────

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function MiniCalendar({ requests }: { requests: CalendarLeaveRequest[] }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [slideDirection, setSlideDirection] = useState(0);

  // Build a map from date string -> statuses for that date
  // Only approved, disapproved, and pending leave requests are plotted.
  const dateStatusMap = useMemo(() => {
    const map = new Map<string, string[]>();
    const allowed = new Set(['approved', 'disapproved', 'pending']);
    for (const req of requests) {
      if (!allowed.has(req.status)) continue;
      const start = new Date(req.date_start + 'T00:00:00');
      const end = new Date(req.date_end + 'T00:00:00');
      const cur = new Date(start);
      while (cur <= end) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(req.status);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [requests]);

  // Build calendar grid for viewYear/viewMonth
  const { days, startOffset } = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    return { days: daysInMonth, startOffset: firstDay };
  }, [viewYear, viewMonth]);

  function prevMonth() {
    setSlideDirection(-1);
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    setSlideDirection(1);
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const calendarKey = `${viewYear}-${viewMonth}`;
  const slideStartX = slideDirection === 1 ? -24 : slideDirection === -1 ? 24 : 0;
  const slideEndX = slideDirection === 1 ? 24 : slideDirection === -1 ? -24 : 0;

  const getStatusKey = (statuses: string[] | undefined) => {
    if (!statuses?.length) return null;
    if (statuses.includes('approved')) return 'approved';
    if (statuses.includes('disapproved')) return 'disapproved';
    if (statuses.includes('pending')) return 'pending';
    return null;
  };

  const statusClassMap: Record<string, string> = {
    approved: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
    disapproved: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400',
    routing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400',
    cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400',
  };

  const cells: (number | null)[] = [
    ...Array<null>(startOffset).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const getDateKey = (year: number, month: number, day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <AnimatePresence mode="wait">
          <motion.span
            key={calendarKey}
            className="text-xs font-semibold text-[var(--color-text-primary)]"
            initial={{ opacity: 0, x: slideStartX }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: slideEndX }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
          >
            {MONTHS[viewMonth]} {viewYear}
          </motion.span>
        </AnimatePresence>
        <button
          onClick={nextMonth}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0">
        {WEEKDAYS.map(d => (
          <div key={d} className="flex h-6 items-center justify-center text-[10px] font-medium text-[var(--color-text-muted)]">
            {d}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={calendarKey}
          initial={{ opacity: 0, x: slideStartX }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: slideEndX }}
          transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
          className="grid grid-cols-7 gap-0"
        >
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="h-8" />;

            const dateKey = getDateKey(viewYear, viewMonth, day);
            const statuses = dateStatusMap.get(dateKey);
            const status = getStatusKey(statuses);
            const isToday = dateKey === todayStr;

            // Neighbours for continuity check
            const prevDate = new Date(viewYear, viewMonth, day - 1);
            const nextDate = new Date(viewYear, viewMonth, day + 1);
            const prevKey = getStatusKey(dateStatusMap.get(getDateKey(prevDate.getFullYear(), prevDate.getMonth(), prevDate.getDate())));
            const nextKey = getStatusKey(dateStatusMap.get(getDateKey(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate())));
            const samePrev = !!status && status === prevKey;
            const sameNext = !!status && status === nextKey;

            // Column index (0=Sun … 6=Sat) drives row-boundary caps so the band
            // wraps cleanly from Saturday to the next Sunday row.
            const colIndex = i % 7;
            const isFirstCol = colIndex === 0;
            const isLastCol = colIndex === 6;

            // A cap is shown where the range starts/ends OR at the row boundary.
            const hasLeftCap = !samePrev || isFirstCol;
            const hasRightCap = !sameNext || isLastCol;

            const outerRoundClass = status
              ? hasLeftCap && hasRightCap
                ? 'rounded-full'
                : hasLeftCap
                ? 'rounded-l-full'
                : hasRightCap
                ? 'rounded-r-full'
                : ''
              : '';

            return (
              <div
                key={i}
                className={cn(
                  'h-8 flex items-center justify-center',
                  outerRoundClass,
                  status ? statusClassMap[status] : 'bg-transparent',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center text-[11px] flex-shrink-0',
                    isToday ? 'font-bold text-[#2845D6]' : 'font-medium',
                  )}
                >
                  {day}
                </span>
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── Leave Dashboard Row ───────────────────────────────────────────────────────

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const FISCAL_MONTHS = [
  { label: 'May', month: 4 },
  { label: 'Jun', month: 5 },
  { label: 'Jul', month: 6 },
  { label: 'Aug', month: 7 },
  { label: 'Sep', month: 8 },
  { label: 'Oct', month: 9 },
  { label: 'Nov', month: 10 },
  { label: 'Dec', month: 11 },
  { label: 'Jan', month: 0 },
  { label: 'Feb', month: 1 },
  { label: 'Mar', month: 2 },
  { label: 'Apr', month: 3 },
];

// ── Pinging dot for line chart ────────────────────────────────────────────────

function LeaveLineDot(props: React.SVGProps<SVGCircleElement> & { stroke?: string }) {
  const { cx, cy, stroke } = props;
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={3} fill={stroke} />
      <circle cx={cx} cy={cy} r={3} stroke={stroke} fill="none" strokeWidth="1" opacity="0.8">
        <animate attributeName="r" values="3;9" dur="1.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0" dur="1.2s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

function LeaveDashboardRow({
  balances,
  calendarRequests,
  loading = false,
}: {
  balances: LeaveBalance[];
  calendarRequests: CalendarLeaveRequest[];
  loading?: boolean;
}) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed

  // ── Balance cards: grouped by period with expand/collapse ──────────────────
  const periodGroups = useMemo(() => {
    const map = new Map<string, LeaveBalance[]>();
    for (const b of balances) {
      const key = `${b.period_start}|${b.period_end}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [balances]);

  const fiscalYearStart = currentMonth >= 4 ? currentYear : currentYear - 1;
  const fiscalYearEnd = fiscalYearStart + 1;
  const fiscalYearLabel = `FY ${fiscalYearStart}-${fiscalYearEnd}`;

  // ── Fiscal-year holiday data (for working-days calculation) ──────────────
  const [fyHolidays, setFyHolidays] = useState<Set<string>>(new Set());
  const [fySundayExemptions, setFySundayExemptions] = useState<Set<string>>(new Set());
  useEffect(() => {
    const start = `${fiscalYearStart}-05-01`;
    const end   = `${fiscalYearEnd}-04-30`;
    fetch(
      `/api/leave/holidays?date_start=${encodeURIComponent(start)}&date_end=${encodeURIComponent(end)}`,
      { credentials: 'include' },
    )
      .then(r => {
        if (!r.ok) return null;
        return r.json() as Promise<{ holidays: { date: string }[]; sunday_exemptions: string[] }>;
      })
      .then(data => {
        if (!data) return;
        setFyHolidays(new Set((data.holidays ?? []).map(h => h.date)));
        setFySundayExemptions(new Set(data.sunday_exemptions ?? []));
      })
      .catch(() => {});
  }, [fiscalYearStart, fiscalYearEnd]);

  const filteredRequests = useMemo(() => {
    const start = `${fiscalYearStart}-05-01`;
    const end = `${fiscalYearEnd}-04-30`;
    return calendarRequests.filter(r => r.date_start >= start && r.date_start <= end);
  }, [calendarRequests, fiscalYearStart, fiscalYearEnd]);

  // ── Bar chart: working days taken per fiscal-year month (approved + pending) ───
  const barChartMonthData = useMemo(() => {
    const counts = FISCAL_MONTHS.map(({ label, month }) => ({ label, month, value: 0 }));
    for (const req of filteredRequests) {
      if (req.status !== 'approved' && req.status !== 'pending') continue;
      const start = new Date(req.date_start + 'T00:00:00');
      const end   = new Date(req.date_end   + 'T00:00:00');
      const cursor = new Date(start);
      while (cursor <= end) {
        const iso = localDateStr(cursor);
        // Exclude non-exempt Sundays
        if (cursor.getDay() === 0 && !fySundayExemptions.has(iso)) {
          cursor.setDate(cursor.getDate() + 1);
          continue;
        }
        // Exclude holidays
        if (fyHolidays.has(iso)) {
          cursor.setDate(cursor.getDate() + 1);
          continue;
        }
        // Attribute this working day to its fiscal-year month
        const year  = cursor.getFullYear();
        const month = cursor.getMonth();
        const inFiscalYear =
          (year === fiscalYearStart && month >= 4) ||
          (year === fiscalYearEnd   && month <= 3);
        if (inFiscalYear) {
          const item = counts.find(c => c.month === month);
          if (item) item.value += 1;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return counts;
  }, [filteredRequests, fyHolidays, fySundayExemptions, fiscalYearStart, fiscalYearEnd]);

  const currentMonthLabel = MONTHS[currentMonth];

  // ── Line chart: leave count per week of current month per leave type ───────
  const lineChartTypes = useMemo(() => {
    const typeSet = new Set<string>();
    const monthStr = String(currentMonth + 1).padStart(2, '0');
    const monthStart = `${currentYear}-${monthStr}-01`;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const monthEnd = `${currentYear}-${monthStr}-${String(daysInMonth).padStart(2, '0')}`;
    for (const req of calendarRequests) {
      if (req.status === 'cancelled' || req.status === 'disapproved') continue;
      if (req.date_start < monthStart || req.date_start > monthEnd) continue;
      typeSet.add(req.leave_type_name || 'Other');
    }
    return [...typeSet].map((name, i) => ({
      name,
      key: name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      color: LINE_COLORS[i % LINE_COLORS.length],
    }));
  }, [calendarRequests, currentYear, currentMonth]);

  // Build week buckets: W1 = days 1-7, W2 = 8-14, W3 = 15-21, W4 = 22-end
  const lineChartWeeks = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const monthStr = String(currentMonth + 1).padStart(2, '0');
    return [
      { label: '1-7',                     start: `${currentYear}-${monthStr}-01`, end: `${currentYear}-${monthStr}-07` },
      { label: '8-14',                    start: `${currentYear}-${monthStr}-08`, end: `${currentYear}-${monthStr}-14` },
      { label: '15-21',                   start: `${currentYear}-${monthStr}-15`, end: `${currentYear}-${monthStr}-21` },
      { label: `22-${daysInMonth}`,       start: `${currentYear}-${monthStr}-22`, end: `${currentYear}-${monthStr}-${String(daysInMonth).padStart(2, '0')}` },
    ];
  }, [currentYear, currentMonth]);

  const lineChartData = useMemo(() => {
    return lineChartWeeks.map(({ label, start, end }) => {
      const entry: Record<string, string | number> = { week: label };
      for (const t of lineChartTypes) {
        entry[t.key] = calendarRequests.filter(req => {
          if (req.status === 'cancelled' || req.status === 'disapproved') return false;
          if (req.date_start < start || req.date_start > end) return false;
          return (req.leave_type_name || 'Other') === t.name;
        }).length;
      }
      return entry;
    });
  }, [calendarRequests, lineChartTypes, lineChartWeeks]);

  const lineChartConfig = useMemo<LineChartConfig>(() => {
    const cfg: LineChartConfig = {};
    for (const t of lineChartTypes) {
      cfg[t.key] = { label: t.name, color: t.color };
    }
    return cfg;
  }, [lineChartTypes]);

  const skeletonGrid = 'grid gap-4 mb-6 items-stretch grid-cols-1 max-[480px]:grid-cols-1 max-[780px]:grid-cols-2 lg:[grid-template-columns:1fr_2fr_1fr_1fr] animate-pulse';
  if (loading) {
    return (
      <div className={skeletonGrid}>
        {/* Col 1 – Balance card skeleton */}
        <div className="flex flex-col gap-4 h-full w-full max-[780px]:col-span-2 max-[480px]:col-span-full lg:order-1">
          <div className="w-full rounded-lg shadow-sm border border-[var(--color-border)] bg-[var(--color-bg-elevated)] overflow-hidden flex flex-col flex-1 min-h-0">
            <div className="px-4 py-2 border-b border-[var(--color-border)]">
              <div className="h-2.5 w-28 rounded bg-[var(--color-border)]" />
            </div>
            <div className="flex-1 flex flex-col justify-center gap-3 px-4 py-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="h-2.5 flex-1 rounded bg-[var(--color-border)]" />
                  <div className="flex gap-3 shrink-0">
                    <div className="h-2.5 w-7 rounded bg-[var(--color-border)]" />
                    <div className="h-2.5 w-7 rounded bg-[var(--color-border)]" />
                    <div className="h-2.5 w-7 rounded bg-[var(--color-border)]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Col 2 – Bar chart skeleton */}
        <div className="rounded-lg shadow-sm border border-[var(--color-border)] bg-[var(--color-bg-elevated)] flex flex-col gap-3 h-full p-4 max-[780px]:col-span-2 lg:order-2">
          <div className="h-2.5 w-32 rounded bg-[var(--color-border)] mb-1" />
          <div className="flex-1 flex items-end gap-1.5 min-h-[120px]">
            {[55, 30, 80, 45, 70, 50, 90, 38, 65, 75, 48, 60].map((h, i) => (
              <div key={i} className="flex-1 rounded-t bg-[var(--color-border)]" style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="flex gap-2 mt-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => (
              <div key={i} className="flex-1 h-2 rounded bg-[var(--color-border)]" />
            ))}
          </div>
        </div>

        {/* Col 3 – Line chart skeleton */}
        <div className="rounded-lg shadow-sm border border-[var(--color-border)] bg-[var(--color-bg-elevated)] flex flex-col h-full p-4 max-[780px]:col-start-1 max-[780px]:col-end-2 max-[480px]:hidden lg:order-3">
          <div className="h-2.5 w-24 rounded bg-[var(--color-border)] mb-3" />
          <div className="flex-1 flex items-end gap-4 min-h-[120px] pb-4 px-2">
            {[40, 70, 30, 80].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full rounded bg-[var(--color-border)] opacity-40" style={{ height: `${h}%` }} />
                <div className="h-2 w-8 rounded bg-[var(--color-border)]" />
              </div>
            ))}
          </div>
        </div>

        {/* Col 4 – Mini calendar skeleton */}
        <div className="w-full self-start rounded-lg shadow-sm border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 flex flex-col gap-2 max-[780px]:col-start-2 max-[780px]:col-end-3 max-[480px]:col-span-full lg:order-4">
          <div className="flex items-center justify-between mb-2">
            <div className="h-3 w-6 rounded bg-[var(--color-border)]" />
            <div className="h-3 w-24 rounded bg-[var(--color-border)]" />
            <div className="h-3 w-6 rounded bg-[var(--color-border)]" />
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-2.5 rounded bg-[var(--color-border)]" />
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-6 rounded bg-[var(--color-border)] opacity-50" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 mb-6 items-stretch grid-cols-1 max-[480px]:grid-cols-1 max-[780px]:grid-cols-2 lg:[grid-template-columns:1fr_2fr_1fr_1fr]">

      {/* ── Column 1: Balance Cards ───────────────────────────────────────── */}
      {/* tablet: row1 full-width | desktop: col1 */}
      <div className="flex flex-col gap-4 h-full w-full
        max-[780px]:col-span-2
        max-[780px]:flex-row max-[780px]:flex-wrap max-[780px]:items-stretch
        max-[480px]:flex flex-col max-[480px]:col-span-full
        lg:order-1">
        {periodGroups.length > 0 ? (
          periodGroups.map(([key, bals]) => {
            const [ps, pe] = key.split('|');
            return (
              <div
                key={key}
                className="w-full rounded-lg shadow-sm border border-[var(--color-border)] bg-[var(--color-bg-elevated)] overflow-hidden flex flex-col flex-1 min-h-0 max-[780px]:basis-[calc(50%-0.75rem)] max-[780px]:w-[calc(50%-0.75rem)] max-[480px]:basis-full max-[480px]:w-full">
                <div className="px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
                  <span className="text-[11px] font-semibold uppercase text-[var(--color-text-muted)]">
                    {fmtPeriod(ps, pe)}
                  </span>
                </div>
                <div className="flex-1 flex flex-col justify-center gap-2 px-4 py-3">
                  {bals.map(b => (
                    <div key={b.id} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[var(--color-text-secondary)] font-semibold truncate flex-1 min-w-0">
                        {b.leave_type}
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        <RoundedTooltip content="Total Leave Credit" className="cursor-pointer">
                          <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="shrink-0"><rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/><path d="M3 6h6M6 3v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                            {b.entitled_leave}
                          </span>
                        </RoundedTooltip>
                        <RoundedTooltip content="Total Used Credit" className="cursor-pointer">
                          <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="shrink-0"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/><path d="M4 6h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                            {b.used_leave}
                          </span>
                        </RoundedTooltip>
                        <RoundedTooltip content="Remaining Credit" className="cursor-pointer">
                          <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="shrink-0"><path d="M2 9V5l4-3 4 3v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z" stroke="currentColor" strokeWidth="1.2"/><path d="M4.5 10V7.5h3V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            {b.remaining_leave}
                          </span>
                        </RoundedTooltip>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div className="w-full rounded-lg shadow-sm border border-[var(--color-border)] bg-[var(--color-bg-elevated)] overflow-hidden flex flex-col flex-1 min-h-0 max-[780px]:basis-[calc(50%-0.75rem)] max-[780px]:w-[calc(50%-0.75rem)] max-[480px]:basis-full max-[480px]:w-full">
            <div className="px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
              <span className="text-[11px] font-semibold uppercase text-[var(--color-text-muted)]">
                Leave Balances
              </span>
            </div>
            <div className="flex-1 flex items-center justify-center px-4 py-6">
              <EmptyState
                title="No leave balances yet"
                description="You can still apply for leave. Your balance will appear here once available."
                icons={[CalendarDays, ClipboardList, Clock]}
                className="bg-transparent p-4"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Column 2: Bar Chart ───────────────────────────────────────────── */}
      {/* tablet: row2 full-width | desktop: col2 */}
      <div className="rounded-lg shadow-sm border border-[var(--color-border)] bg-[var(--color-bg-elevated)] flex min-h-0 flex-col gap-3 h-full
        max-[780px]:col-span-2
        max-[480px]:col-span-full max-[480px]:overflow-hidden
        lg:col-span-1 lg:order-2">
        <TwoDBarChart label={fiscalYearLabel} monthData={barChartMonthData} />
      </div>

      {/* ── Column 3: Line Chart (leave per month per type) ──────────────── */}
      {/* tablet: row3 left half | desktop: col3 */}
      <div className="rounded-lg w-full p-4 px-5 shadow-sm border border-[var(--color-border)] bg-[var(--color-bg-elevated)] flex flex-col h-full
        max-[780px]:col-start-1 max-[780px]:col-end-2
        max-[480px]:hidden
        lg:order-3">
        <div className="mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-muted)]">
            {currentMonthLabel} {currentYear}
          </span>
        </div>
        {lineChartTypes.length > 0 ? (
          <>
            <div className="flex-1 min-h-[160px]">
              <LineChartContainer config={lineChartConfig} className="h-full w-full">
                <LineChart
                  data={lineChartData}
                  margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.4} />
                  <XAxis
                    dataKey="week"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 10 }}
                    padding={{ left: 16, right: 16 }}
                  />
                  <LineChartTooltip
                    cursor={false}
                    content={<LineChartTooltipContent />}
                  />
                  {lineChartTypes.map(t => (
                    <Line
                      key={t.key}
                      dataKey={t.key}
                      name={t.name}
                      type="linear"
                      stroke={t.color}
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={<LeaveLineDot stroke={t.color} />}
                      activeDot={false}
                    />
                  ))}
                </LineChart>
              </LineChartContainer>
            </div>

          </>
        ) : (
          <div className="flex flex-1 items-center justify-center min-h-[120px] px-4 pb-5">
            <EmptyState
              title="No leave data yet"
              description="Leave requests will appear here once submitted."
              icons={[BarChart3, TrendingUp, Activity]}
              className="bg-transparent p-6"
            />
          </div>
        )}
      </div>

      {/* ── Column 4: Mini Calendar ───────────────────────────────────────── */}
      {/* tablet: row3 right half | desktop: col4 */}
      <div className="w-full self-start rounded-lg shadow-sm border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 flex flex-col gap-0 h-full
        max-[780px]:col-start-2 max-[780px]:col-end-3
        max-[480px]:col-span-full
        lg:order-4">
        <MiniCalendar requests={calendarRequests} />
      </div>

    </div>
  );
}

// ── InfoRow ───────────────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | null | undefined;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</span>
      <span className="text-sm text-[var(--color-text-primary)] flex items-center gap-1">
        {icon}
        {value ?? '—'}
      </span>
    </div>
  );
}

// ── ApprovalActionForm ────────────────────────────────────────────────────────

function ApprovalActionForm({
  leaveId,
  onActed,
}: {
  leaveId: number;
  onActed: (updated: LeaveDetail) => void;
}) {
  const [action, setAction] = useState<'approved' | 'disapproved' | ''>('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!action) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leave/requests/${leaveId}/action`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ action, remarks }),
      });
      const data = await res.json();
      if (res.ok) {
        const label = action === 'approved' ? 'Approved' : 'Disapproved';
        toast.success(`Leave request ${label.toLowerCase()} successfully.`, { title: label });
        onActed(data as LeaveDetail);
      } else {
        type ErrBody = { detail?: string; action?: string[]; remarks?: string[]; non_field_errors?: string[] };
        const err = data as ErrBody;
        const msg = err.detail ?? err.remarks?.[0] ?? err.action?.[0] ?? err.non_field_errors?.[0] ?? 'Failed to act on leave request.';
        toast.error(msg, { title: 'Error' });
      }
    } catch {
      toast.error('Network error. Please try again.', { title: 'Error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-4">
      <p className="text-[12px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">Your Action</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setAction('approved')}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
            action === 'approved'
              ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
              : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)]',
          )}
        >
          <CheckCircle2 className="size-3.5" />
          Approve
        </button>
        <button
          type="button"
          onClick={() => setAction('disapproved')}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
            action === 'disapproved'
              ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
              : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)]',
          )}
        >
          <XCircle className="size-3.5" />
          Disapprove
        </button>
      </div>
      <div className="space-y-1.5">
        <label className="text-[12px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
          Remarks {action === 'disapproved' && <span className="text-red-500 normal-case tracking-normal">*</span>}
        </label>
        <textarea
          value={remarks}
          onChange={e => setRemarks(e.target.value)}
          maxLength={500}
          rows={2}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] resize-none focus:outline-none"
          placeholder="Optional remarks..."
        />
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!action || saving || (action === 'disapproved' && !remarks.trim())}
          className="flex min-w-[100px] items-center justify-center gap-1.5 px-4 py-2 rounded-lg
            bg-[#2845D6] text-white text-sm font-semibold hover:bg-[#1f38c0]
            disabled:opacity-50 transition-colors"
        >
          {saving
            ? <TextShimmer duration={1.2} className="text-sm font-semibold [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">
                Saving…
              </TextShimmer>
            : <><Check size={14} /><span>Confirm</span></>
          }
        </button>
      </div>
    </form>
  );
}

// ── Apply Leave Modal ─────────────────────────────────────────────────────────

interface ApplyLeaveModalProps {
  onClose: () => void;
  onCreated: (lr: LeaveRequest) => void;
  balances: LeaveBalance[];
}

function ApplyLeaveModal({ onClose, onCreated, balances }: ApplyLeaveModalProps) {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [reasons, setReasons] = useState<LeaveReason[]>([]);
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [reasonId, setReasonId] = useState('');
  const [subreasonId, setSubreasonId] = useState('');
  const [dateStart, setDateStart] = useState<Date | undefined>(undefined);
  const [dateEnd, setDateEnd] = useState<Date | undefined>(undefined);
  const [perDateHours, setPerDateHours] = useState<Record<string, number>>({});
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [sundayExemptions, setSundayExemptions] = useState<Set<string>>(new Set());
  const [holidaysLoading, setHolidaysLoading] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [existingRequests, setExistingRequests] = useState<LeaveRequest[]>([]);

  // Live balances: re-fetched from the server every time the user picks a leave type
  // so that pending_leave always reflects only current pending requests (not cancelled etc.)
  const [liveBalances, setLiveBalances] = useState<LeaveBalance[]>(balances);
  useEffect(() => {
    if (!leaveTypeId) return;
    fetch('/api/leave/balances', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((data: LeaveBalance[]) => setLiveBalances(data))
      .catch(() => {});
  }, [leaveTypeId]);

  const selectedType = leaveTypes.find(t => String(t.id) === leaveTypeId);
  const selectedReason = reasons.find(r => String(r.id) === reasonId);
  const subreasons = selectedReason?.subreasons ?? [];
  const isOtherSubreason = subreasonId === 'other';

  // All calendar dates in range as ISO strings
  const activeDates = useMemo<string[]>(() => {
    if (!dateStart || !dateEnd) return [];
    const result: string[] = [];
    const cursor = new Date(dateStart);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(dateEnd);
    end.setHours(0, 0, 0, 0);
    while (cursor <= end) {
      result.push(localDateStr(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }, [dateStart, dateEnd]);

  // Working dates = not a non-exempt Sunday and not a holiday
  const workingDates = useMemo<string[]>(() => {
    return activeDates.filter(iso => {
      const d = new Date(iso + 'T00:00:00');
      if (d.getDay() === 0 && !sundayExemptions.has(iso)) return false;
      if (holidays.has(iso)) return false;
      return true;
    });
  }, [activeDates, holidays, sundayExemptions]);

  const workingDayCount = workingDates.length;
  const totalHours = useMemo(() => {
    if (!workingDates.length) return 0;
    return workingDates.reduce((sum, iso) => sum + (perDateHours[iso] ?? 8), 0);
  }, [workingDates, perDateHours]);

  // Per-period balance split: groups working dates into the balance period they fall under
  const balanceSplits = useMemo(() => {
    if (!leaveTypeId || !selectedType?.has_balance) return [];
    const typeBalances = liveBalances.filter(b => b.leave_type_id === Number(leaveTypeId));
    if (!typeBalances.length) return [];
    const map = new Map<number, { balance: LeaveBalance; hours: number }>();
    workingDates.forEach(iso => {
      const match = typeBalances.find(b => iso >= b.period_start && iso <= b.period_end);
      if (!match) return;
      const prev = map.get(match.id);
      if (prev) {
        prev.hours += perDateHours[iso] ?? 8;
      } else {
        map.set(match.id, { balance: match, hours: perDateHours[iso] ?? 8 });
      }
    });
    return Array.from(map.values()).map(({ balance, hours }) => {
      const days = hours / 8;
      const adjustedBalance = Number(balance.remaining_leave) - Number(balance.pending_leave ?? '0');
      return {
        balance,
        hours,
        days,
        adjustedBalance,
        isInsufficient: !!(selectedType?.deductible && days > adjustedBalance),
      };
    });
  }, [liveBalances, leaveTypeId, selectedType, workingDates, perDateHours]);

  const anyBalanceInsufficient = balanceSplits.some(s => s.isInsufficient);

  const overlapDates = useMemo<Set<string>>(() => {
    const result = new Set<string>();
    activeDates.forEach(iso => {
      const d = new Date(iso + 'T00:00:00').getTime();
      const found = existingRequests.some(r => {
        if (r.status === 'cancelled') return false;
        const rs = new Date(r.date_start + 'T00:00:00').getTime();
        const re = new Date(r.date_end + 'T00:00:00').getTime();
        return rs <= d && d <= re;
      });
      if (found) result.add(iso);
    });
    return result;
  }, [activeDates, existingRequests]);

  const overlapError = overlapDates.size > 0
    ? `${overlapDates.size} date(s) overlap with existing leave requests.`
    : null;

  useEffect(() => {
    fetch('/api/leave/types', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(setLeaveTypes)
      .catch(() => {});
    fetch('/api/leave/requests?page=1', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((data: PagedResponse) => setExistingRequests(data.results ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!leaveTypeId) { setReasons([]); return; }
    fetch(`/api/leave/reasons?leave_type=${leaveTypeId}`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(setReasons)
      .catch(() => {});
    setReasonId('');
    setSubreasonId('');
  }, [leaveTypeId]);

  useEffect(() => {
    setSubreasonId('');
    setRemarks('');
  }, [reasonId]);

  // Fetch holidays + sunday exemptions when dates change
  useEffect(() => {
    if (!dateStart || !dateEnd) {
      setHolidays(new Set());
      setSundayExemptions(new Set());
      return;
    }
    setHolidaysLoading(true);
    fetch(
      `/api/leave/holidays?date_start=${encodeURIComponent(localDateStr(dateStart))}&date_end=${encodeURIComponent(localDateStr(dateEnd))}`,
      { credentials: 'include' },
    )
      .then(r => {
        if (!r.ok) return null;
        return r.json() as Promise<{ holidays: { date: string }[]; sunday_exemptions: string[] }>;
      })
      .then(data => {
        if (!data) return;
        setHolidays(new Set((data.holidays ?? []).map((h: { date: string }) => h.date)));
        setSundayExemptions(new Set(data.sunday_exemptions ?? []));
      })
      .catch(() => {})
      .finally(() => setHolidaysLoading(false));
  }, [dateStart, dateEnd]);

  // Reset per-date hours when date range changes
  useEffect(() => {
    setPerDateHours({});
  }, [dateStart, dateEnd]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors: Record<string, string> = {};

    if (!leaveTypeId) fieldErrors.leave_type = 'Please select a leave type.';
    if (!reasonId) fieldErrors.reason = 'Please select a primary reason.';
    if (!subreasonId) fieldErrors.subreason = 'Please select a sub reason.';
    if (subreasonId === 'other' && !remarks.trim()) fieldErrors.remarks = 'Please specify your reason.';
    if (!dateStart || !dateEnd) fieldErrors.date_start = 'Please select your leave dates.';
    if (overlapError) fieldErrors.date_end = overlapError;

    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      return;
    }

    if (!leaveTypeId || !reasonId || !subreasonId || !dateStart || !dateEnd || overlapError || (isOtherSubreason && !remarks.trim())) {
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      const res = await fetch('/api/leave/requests', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
          'X-Idempotency-Key': `${leaveTypeId}-${localDateStr(dateStart)}-${Date.now()}`,
        },
        body: JSON.stringify({
          leave_type: Number(leaveTypeId),
          reason: Number(reasonId),
          subreason: subreasonId === 'other' ? remarks.trim() : Number(subreasonId),
          date_start: localDateStr(dateStart),
          date_end: localDateStr(dateEnd),
          hours: totalHours,
          remarks: remarks.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        toast.success(`Leave request ${(data as LeaveRequest).control_number} filed successfully.`, { title: 'Leave Filed' });
        onCreated(data as LeaveRequest);
        onClose();
        return;
      }

      const d = data as Record<string, unknown>;
      if (d.detail) {
        toast.error(d.detail as string, { title: 'Could Not File Leave' });
      } else {
        const fieldErrors: Record<string, string> = {};
        for (const [key, val] of Object.entries(d)) {
          fieldErrors[key] = Array.isArray(val) ? (val as string[])[0] : String(val);
        }
        setErrors(fieldErrors);
      }
    } catch {
      toast.error('Failed to submit leave request. Please try again.', { title: 'Network Error' });
    } finally {
      setSaving(false);
    }
  }

  const isValid =
    !!leaveTypeId &&
    !!reasonId &&
    !!subreasonId &&
    !!dateStart &&
    !!dateEnd &&
    workingDayCount > 0 &&
    !overlapError &&
    (subreasonId !== 'other' || !!remarks.trim());

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-3xl rounded-2xl border border-[var(--color-border)]
          bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
            Apply for Leave
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full
              text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Two-column body */}
          <div className="flex max-[480px]:flex-col max-[480px]:gap-4" style={{ maxHeight: 'calc(100vh - 14rem)' }}>

            {/* ── Left: inputs ── */}
            <div className="flex-1 min-w-0 space-y-4 p-6 overflow-y-auto [scrollbar-width:thin] max-[480px]:p-4">

              {/* Date range */}
              <LeaveRangePicker
                dateStart={dateStart}
                dateEnd={dateEnd}
                onDateStartChange={d => {
                  setDateStart(d);
                  if (!d) setDateEnd(undefined);
                }}
                onDateEndChange={setDateEnd}
                errorStart={errors.date_start}
                errorEnd={errors.date_end}
                closeOnSelect={false}
              />
              {overlapError && (
                <p className="flex items-center gap-1.5 text-xs text-red-500 -mt-2">
                  <Info className="size-3.5 shrink-0" />
                  {overlapError}
                </p>
              )}

              {/* Leave Type */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                  Leave Type { !leaveTypeId && <span className="text-red-500 normal-case tracking-normal">*</span> }
                </label>
                <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
                  <SelectTrigger className={cn(errors.leave_type && 'border-red-500')}>
                    <SelectValue placeholder="Select leave type" />
                  </SelectTrigger>
                  <SelectContent>
                    {leaveTypes.map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.leave_type && <p className="text-xs text-red-500">{errors.leave_type}</p>}
              </div>

              {/* Primary Reason */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                  Reason Category { !reasonId && <span className="text-red-500 normal-case tracking-normal">*</span> }
                </label>
                <Select
                  value={reasonId}
                  onValueChange={setReasonId}
                  disabled={!leaveTypeId}
                >
                  <SelectTrigger className={cn(errors.reason && 'border-red-500')}>
                    <SelectValue
                      placeholder={
                        !leaveTypeId
                          ? 'Select a leave type first'
                          : reasons.length
                          ? 'Select reason'
                          : 'No reasons available'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {reasons.map(r => (
                      <SelectItem key={r.id} value={String(r.id)}>{r.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.reason && <p className="text-xs text-red-500">{errors.reason}</p>}
              </div>

              {/* Sub Reason */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                  Reason{' '}
                  {!subreasonId && (
                    <span className="text-red-500 normal-case tracking-normal">*</span>
                  )}
                </label>
                <Select
                  value={subreasonId}
                  onValueChange={setSubreasonId}
                  disabled={!reasonId}
                >
                  <SelectTrigger className={cn(errors.subreason && 'border-red-500')}>
                    <SelectValue
                      placeholder={
                        !reasonId
                          ? 'Select a primary reason first'
                          : 'Select sub-reason'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {subreasons.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
                    ))}
                    <SelectItem key="other" value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                {errors.subreason && <p className="text-xs text-red-500">{errors.subreason}</p>}
              </div>

              <AnimatePresence initial={false}>
                {isOtherSubreason && (
                  <motion.div
                    key="specify-reason"
                    initial={{ opacity: 0, y: -8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -8, height: 0 }}
                    transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                    style={{ overflow: 'hidden' }}
                    className="space-y-1.5"
                  >
                    <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                      Specify your reason{' '}
                      {!remarks.trim() && (
                        <span className="text-red-500 normal-case tracking-normal">*</span>
                      )}
                    </label>
                    <TextareaWithCharactersLeft
                      value={remarks}
                      onChange={e => {
                        if (BLOCKED.test(e.target.value)) return;
                        setRemarks(e.target.value);
                      }}
                      maxLength={500}
                      placeholder="Describe your reason..."
                      className={cn(errors.remarks && 'border-red-500')}
                    />
                    {errors.remarks && <p className="text-xs text-red-500">{errors.remarks}</p>}
                  </motion.div>
                )}
              </AnimatePresence>

            </div>

            {/* ── Right: summary panel ── */}
            <motion.div
              layout
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="w-90 shrink-0 flex flex-col gap-4 p-5 overflow-y-auto [scrollbar-width:thin] m-3 border border-[var(--information-border-color)] rounded-xl bg-[var(--information-bg-color)] max-[480px]:w-full max-[480px]:m-0 max-[480px]:rounded-none max-[480px]:rounded-b-2xl max-[480px]:p-4"
            >

              {/* Row 1: Working Days / Total Hours — always mounted, dims while loading */}
              <div className="border-b border-[#2845D6]/20 pb-4">
                <div className={cn('grid grid-cols-2 gap-4 transition-opacity duration-300', holidaysLoading && 'opacity-30')}>
                  <div className="flex flex-col items-center gap-1">
                    <AnimatedNumber
                      value={workingDayCount}
                      className="mt-1 text-4xl font-bold leading-none tabular-nums text-[var(--color-text-primary)]"
                    />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Working Days</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="mt-1 flex items-baseline gap-1">
                      <AnimatedNumber
                        value={totalHours}
                        className="text-4xl font-bold leading-none tabular-nums text-[var(--color-text-primary)]"
                      />
                      {/* <span className="text-[10px] font-normal text-[var(--color-text-muted)]">hrs</span> */}
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Total Hours</span>
                  </div>
                </div>
              </div>

              {/* Row 2: Per-date list — container always mounted */}
              <div className="flex flex-col gap-0.5">
                {!dateStart || !dateEnd ? (
                  <span className="px-1 text-xs text-[var(--color-text-muted)]">Select a date range to see details.</span>
                ) : holidaysLoading ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="h-5 animate-pulse rounded bg-[var(--color-bg-elevated)]" />
                    <div className="h-5 animate-pulse rounded bg-[var(--color-bg-elevated)] opacity-60" />
                  </div>
                ) : (
                  ([localDateStr(dateStart!), localDateStr(dateEnd!)] as string[])
                    .filter((iso, index, arr) => index === 0 || iso !== arr[0])
                    .map((iso) => {
                      const dateObj = new Date(iso + 'T00:00:00');
                      const label = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      const isWorking = workingDates.includes(iso);

                      if (isWorking && overlapDates.has(iso)) {
                        return (
                          <motion.div
                            layout
                            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                            key={iso}
                            className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-700/40 px-3 py-2"
                          >
                            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-red-500" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-medium text-red-600 dark:text-red-400">{label}</span>
                              <span className="text-[10px] leading-snug text-red-500 dark:text-red-400">Overlaps with existing leave</span>
                            </div>
                          </motion.div>
                        );
                      }

                      if (!isWorking) {
                        return (
                          <motion.div
                            layout
                            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                            key={iso}
                            className="flex items-center justify-between px-3 py-1.5"
                          >
                            <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]">
                              Non working
                            </span>
                          </motion.div>
                        );
                      }

                      return (
                        <motion.div
                          layout
                          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                          key={iso}
                          className="flex items-center justify-between"
                        >
                          <span className="text-xs font-medium text-[var(--color-text-primary)]">{label}</span>
                          <Select value={String(perDateHours[iso] ?? 8)} onValueChange={value => setPerDateHours(prev => ({ ...prev, [iso]: Number(value) }))}>
                            <SelectTrigger className="w-auto min-w-[3rem] cursor-pointer rounded-md border-none bg-transparent px-2 py-1 text-[13px] text-[var(--color-accent)] outline-none">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
                              {[1, 2, 3, 4, 5, 6, 7, 8].map(h => (
                                <SelectItem key={h} value={String(h)}>
                                  {h === 4 ? 'Half day' : `${h}h`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </motion.div>
                      );
                    })
                )}
              </div>

              {/* Row 3: Leave Balance — split across periods if range spans multiple */}
              {selectedType?.has_balance && (
                <motion.div layout transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
                  {/* <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Leave Balance</span> */}
                  {balanceSplits.length > 0 ? (
                    <>
                      {balanceSplits.map(split => (
                        <motion.div
                          key={split.balance.id}
                          layout
                          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                          className="flex items-start justify-between"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-[var(--color-text-primary)]">{selectedType.name} Balance</span>
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              {fmtPeriod(split.balance.period_start, split.balance.period_end)}
                            </span>
                          </div>
                          <div className="flex items-center">
                            <span className={cn(
                              'text-lg font-bold leading-none tabular-nums',
                              (split.isInsufficient || (selectedType?.deductible && split.adjustedBalance < 0)) ? 'text-red-500' : 'text-[var(--color-text-primary)]',
                            )}>
                              {Math.max(split.adjustedBalance, 0).toFixed(1)}
                            </span>
                            {/* <span className="text-[10px] text-[var(--color-text-muted)]">days left</span> */}
                          </div>
                        </motion.div>
                      ))}
                      {anyBalanceInsufficient && (
                        <p className="text-[11px] text-red-500 leading-snug">
                          Not enough leave credits for this request.
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-[var(--color-text-muted)]">No balance record found.</span>
                  )}
                </motion.div>
              )}

              {/* Row 4: Credits to be deducted — broken down per period when split */}
              {selectedType?.deductible && workingDayCount > 0 && (
                <div className="flex flex-col gap-1 border-t border-[var(--color-border)] pt-3">
                  {balanceSplits.length > 1 ? (
                    <>
                      <span className="text-xs text-[var(--color-text-muted)]">Credits to be deducted</span>
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        {balanceSplits.map(split => (
                          <div key={split.balance.id} className="flex items-center justify-between pl-1">
                            <span className="text-[11px] text-[var(--color-text-muted)]">
                              {fmtPeriod(split.balance.period_start, split.balance.period_end)}
                            </span>
                            <span className="text-[11px] font-semibold tabular-nums text-[var(--color-text-primary)]">
                              {split.days.toFixed(1)}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between mt-1 pt-1 border-t border-[var(--color-border)]/50">
                          <span className="text-xs text-[var(--color-text-muted)]">Total</span>
                          <span className="text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">
                            {(totalHours / 8).toFixed(1)}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--color-text-muted)]">Credits to be deducted</span>
                      <span className="text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">
                        {(totalHours / 8).toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Row 5: Projected remaining balance per period */}
              {selectedType?.deductible && selectedType?.has_balance && balanceSplits.length > 0 && workingDayCount > 0 && (
                <div className="flex flex-col gap-1">
                  {balanceSplits.length > 1 ? (
                    <>
                      <span className="text-xs text-[var(--color-text-muted)]">Remaining balance</span>
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        {balanceSplits.map(split => {
                          const rawRemaining = split.adjustedBalance - split.days;
                          const remaining = Math.max(rawRemaining, 0);
                          return (
                            <div key={split.balance.id} className="flex items-center justify-between pl-1">
                              <span className="text-[11px] text-[var(--color-text-muted)]">
                                {fmtPeriod(split.balance.period_start, split.balance.period_end)}
                              </span>
                              <span className={cn(
                                'text-[11px] font-semibold tabular-nums',
                                rawRemaining < 0 ? 'text-red-500' : 'text-[var(--color-text-primary)]',
                              )}>
                                {remaining.toFixed(1)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--color-text-muted)]">Remaining balance</span>
                      {(() => {
                        const rawRemaining = balanceSplits[0].adjustedBalance - balanceSplits[0].days;
                        const remaining = Math.max(rawRemaining, 0);
                        return (
                          <span className={cn(
                            'text-sm font-semibold tabular-nums',
                            rawRemaining < 0 ? 'text-red-500' : 'text-[var(--color-text-primary)]',
                          )}>
                            {remaining.toFixed(1)}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

            </motion.div>
          </div>

          {/* Footer */}
          <div className="border-t border-[var(--color-border)] px-6 py-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--color-border)]
                text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)]
                transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || saving}
              className="flex min-w-[130px] items-center justify-center gap-1.5 px-4 py-2 rounded-lg
                bg-[#2845D6] text-white text-sm font-semibold hover:bg-[#1f38c0]
                disabled:opacity-50 transition-colors"
            >
              {saving
                ? <TextShimmer duration={1.2} className="text-sm font-semibold [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">
                    Submitting…
                  </TextShimmer>
                : <><Check size={14} /><span>Submit Leave</span></>
              }
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ── Edit Leave Modal ──────────────────────────────────────────────────────────

interface EditLeaveModalProps {
  leaveId: number;
  onClose: () => void;
  onUpdated: (lr: LeaveRequest) => void;
  balances: LeaveBalance[];
}

function EditLeaveModal({ leaveId, onClose, onUpdated, balances }: EditLeaveModalProps) {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [reasons, setReasons] = useState<LeaveReason[]>([]);
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [reasonId, setReasonId] = useState('');
  const [subreasonId, setSubreasonId] = useState('');
  const [dateStart, setDateStart] = useState<Date | undefined>(undefined);
  const [dateEnd, setDateEnd] = useState<Date | undefined>(undefined);
  const [perDateHours, setPerDateHours] = useState<Record<string, number>>({});
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [sundayExemptions, setSundayExemptions] = useState<Set<string>>(new Set());
  const [holidaysLoading, setHolidaysLoading] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [existingRequests, setExistingRequests] = useState<LeaveRequest[]>([]);
  const [liveBalances, setLiveBalances] = useState<LeaveBalance[]>(balances);
  const [detailLoading, setDetailLoading] = useState(true);

  // ── Fetch detail + bootstrap data on mount ────────────────────────────────
  // Reasons are fetched sequentially after the detail so that subreasonId
  // has its matching SelectItem available the moment the form renders.
  useEffect(() => {
    let cancelled = false;

    fetch('/api/leave/types', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(setLeaveTypes)
      .catch(() => {});

    fetch('/api/leave/requests?page=1', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((data: PagedResponse) =>
        setExistingRequests((data.results ?? []).filter(r => r.id !== leaveId))
      )
      .catch(() => {});

    ;(async () => {
      try {
        const detailRes = await fetch(`/api/leave/requests/${leaveId}`, { credentials: 'include' });
        if (!detailRes.ok) throw new Error('Failed to load');
        const d: LeaveDetail = await detailRes.json();

        // Fetch reasons for this leave type before rendering the form so that
        // the subreason SelectItem exists when the Select first renders.
        const reasonsRes = await fetch(`/api/leave/reasons?leave_type=${d.leave_type}`, { credentials: 'include' });
        const reasonsData: LeaveReason[] = await reasonsRes.json();

        if (cancelled) return;

        setReasons(reasonsData);
        setLeaveTypeId(String(d.leave_type));
        setReasonId(String(d.reason_id));
        setSubreasonId(
          d.subreason_id != null
            ? String(d.subreason_id)
            : d.remarks
            ? 'other'
            : '',
        );
        setDateStart(new Date(d.date_start + 'T00:00:00'));
        setDateEnd(new Date(d.date_end + 'T00:00:00'));
        setRemarks(d.remarks || '');
      } catch {
        if (!cancelled) toast.error('Failed to load leave details.', { title: 'Error' });
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [leaveId]);

  // Live balances refresh when leave type changes
  useEffect(() => {
    if (!leaveTypeId) return;
    fetch('/api/leave/balances', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((data: LeaveBalance[]) => setLiveBalances(data))
      .catch(() => {});
  }, [leaveTypeId]);

  // ── User-driven select change handlers ────────────────────────────────────
  // These only run when the USER changes a select, not during pre-population,
  // which avoids the stale-reset bug from useEffect-based watchers.
  function handleLeaveTypeChange(v: string) {
    setLeaveTypeId(v);
    setReasonId('');
    setSubreasonId('');
    setRemarks('');
    if (!v) { setReasons([]); return; }
    fetch(`/api/leave/reasons?leave_type=${v}`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(setReasons)
      .catch(() => {});
  }

  function handleReasonChange(v: string) {
    setReasonId(v);
    setSubreasonId('');
    setRemarks('');
  }

  // Holidays + Sunday exemptions
  useEffect(() => {
    if (!dateStart || !dateEnd) {
      setHolidays(new Set());
      setSundayExemptions(new Set());
      return;
    }
    setHolidaysLoading(true);
    fetch(
      `/api/leave/holidays?date_start=${encodeURIComponent(localDateStr(dateStart))}&date_end=${encodeURIComponent(localDateStr(dateEnd))}`,
      { credentials: 'include' },
    )
      .then(r => {
        if (!r.ok) return null;
        return r.json() as Promise<{ holidays: { date: string }[]; sunday_exemptions: string[] }>;
      })
      .then(data => {
        if (!data) return;
        setHolidays(new Set((data.holidays ?? []).map((h: { date: string }) => h.date)));
        setSundayExemptions(new Set(data.sunday_exemptions ?? []));
      })
      .catch(() => {})
      .finally(() => setHolidaysLoading(false));
  }, [dateStart, dateEnd]);

  // Reset per-date hours when date range changes
  useEffect(() => {
    setPerDateHours({});
  }, [dateStart, dateEnd]);

  // ── Derived values (identical to ApplyLeaveModal) ─────────────────────────
  const selectedType = leaveTypes.find(t => String(t.id) === leaveTypeId);
  const selectedReason = reasons.find(r => String(r.id) === reasonId);
  const subreasons = selectedReason?.subreasons ?? [];
  const isOtherSubreason = subreasonId === 'other';

  const activeDates = useMemo<string[]>(() => {
    if (!dateStart || !dateEnd) return [];
    const result: string[] = [];
    const cursor = new Date(dateStart);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(dateEnd);
    end.setHours(0, 0, 0, 0);
    while (cursor <= end) {
      result.push(localDateStr(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }, [dateStart, dateEnd]);

  const workingDates = useMemo<string[]>(() => {
    return activeDates.filter(iso => {
      const d = new Date(iso + 'T00:00:00');
      if (d.getDay() === 0 && !sundayExemptions.has(iso)) return false;
      if (holidays.has(iso)) return false;
      return true;
    });
  }, [activeDates, holidays, sundayExemptions]);

  const workingDayCount = workingDates.length;
  const totalHours = useMemo(() => {
    if (!workingDates.length) return 0;
    return workingDates.reduce((sum, iso) => sum + (perDateHours[iso] ?? 8), 0);
  }, [workingDates, perDateHours]);

  const balanceSplits = useMemo(() => {
    if (!leaveTypeId || !selectedType?.has_balance) return [];
    const typeBalances = liveBalances.filter(b => b.leave_type_id === Number(leaveTypeId));
    if (!typeBalances.length) return [];
    const map = new Map<number, { balance: LeaveBalance; hours: number }>();
    workingDates.forEach(iso => {
      const match = typeBalances.find(b => iso >= b.period_start && iso <= b.period_end);
      if (!match) return;
      const prev = map.get(match.id);
      if (prev) {
        prev.hours += perDateHours[iso] ?? 8;
      } else {
        map.set(match.id, { balance: match, hours: perDateHours[iso] ?? 8 });
      }
    });
    return Array.from(map.values()).map(({ balance, hours }) => {
      const days = hours / 8;
      const adjustedBalance = Number(balance.remaining_leave) - Number(balance.pending_leave ?? '0');
      return {
        balance,
        hours,
        days,
        adjustedBalance,
        isInsufficient: !!(selectedType?.deductible && days > adjustedBalance),
      };
    });
  }, [liveBalances, leaveTypeId, selectedType, workingDates, perDateHours]);

  const anyBalanceInsufficient = balanceSplits.some(s => s.isInsufficient);

  const overlapDates = useMemo<Set<string>>(() => {
    const result = new Set<string>();
    activeDates.forEach(iso => {
      const d = new Date(iso + 'T00:00:00').getTime();
      const found = existingRequests.some(r => {
        if (r.status === 'cancelled') return false;
        const rs = new Date(r.date_start + 'T00:00:00').getTime();
        const re = new Date(r.date_end + 'T00:00:00').getTime();
        return rs <= d && d <= re;
      });
      if (found) result.add(iso);
    });
    return result;
  }, [activeDates, existingRequests]);

  const overlapError = overlapDates.size > 0
    ? `${overlapDates.size} date(s) overlap with existing leave requests.`
    : null;

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors: Record<string, string> = {};

    if (!leaveTypeId) fieldErrors.leave_type = 'Please select a leave type.';
    if (!reasonId) fieldErrors.reason = 'Please select a primary reason.';
    if (!subreasonId) fieldErrors.subreason = 'Please select a sub reason.';
    if (subreasonId === 'other' && !remarks.trim()) fieldErrors.remarks = 'Please specify your reason.';
    if (!dateStart || !dateEnd) fieldErrors.date_start = 'Please select your leave dates.';
    if (overlapError) fieldErrors.date_end = overlapError;

    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      return;
    }

    if (!leaveTypeId || !reasonId || !subreasonId || !dateStart || !dateEnd || overlapError || (isOtherSubreason && !remarks.trim())) {
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      const res = await fetch(`/api/leave/requests/${leaveId}/edit`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify({
          leave_type: Number(leaveTypeId),
          reason: Number(reasonId),
          subreason: subreasonId === 'other' ? remarks.trim() : Number(subreasonId),
          date_start: localDateStr(dateStart),
          date_end: localDateStr(dateEnd),
          hours: totalHours,
          remarks: remarks.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        toast.success('Leave request updated successfully.', { title: 'Updated' });
        onUpdated(data as LeaveRequest);
        onClose();
        return;
      }

      const d = data as Record<string, unknown>;
      if (d.detail) {
        toast.error(d.detail as string, { title: 'Could Not Save' });
      } else {
        const fieldErrors: Record<string, string> = {};
        for (const [key, val] of Object.entries(d)) {
          fieldErrors[key] = Array.isArray(val) ? (val as string[])[0] : String(val);
        }
        setErrors(fieldErrors);
      }
    } catch {
      toast.error('Failed to update leave request. Please try again.', { title: 'Network Error' });
    } finally {
      setSaving(false);
    }
  }

  const isValid =
    !!leaveTypeId &&
    !!reasonId &&
    !!subreasonId &&
    !!dateStart &&
    !!dateEnd &&
    workingDayCount > 0 &&
    !overlapError &&
    (subreasonId !== 'other' || !!remarks.trim());

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-3xl rounded-2xl border border-[var(--color-border)]
          bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
            Edit Leave Request
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full
              text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Loading skeleton */}
        {detailLoading && (
          <div className="flex" style={{ maxHeight: 'calc(100vh - 14rem)' }}>
            <div className="flex-1 min-w-0 space-y-4 p-6">
              {[72, 56, 56, 56].map((h, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-lg bg-[var(--color-bg-card)]"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
            <div className="w-90 shrink-0 m-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] space-y-3 p-5">
              <div className="h-14 animate-pulse rounded-lg bg-[var(--color-bg-elevated)]" />
              <div className="h-5 animate-pulse rounded bg-[var(--color-bg-elevated)]" />
              <div className="h-5 animate-pulse rounded bg-[var(--color-bg-elevated)] opacity-70" />
              <div className="h-5 animate-pulse rounded bg-[var(--color-bg-elevated)] opacity-50" />
            </div>
          </div>
        )}

        {/* Form — shown only after detail loaded */}
        {!detailLoading && (
          <form onSubmit={handleSubmit}>
            {/* Two-column body */}
            <div className="flex max-[480px]:flex-col max-[480px]:gap-4" style={{ maxHeight: 'calc(100vh - 14rem)' }}>

              {/* ── Left: inputs ── */}
              <div className="flex-1 min-w-0 space-y-4 p-6 overflow-y-auto [scrollbar-width:thin] max-[480px]:p-4">

                {/* Date range */}
                <LeaveRangePicker
                  dateStart={dateStart}
                  dateEnd={dateEnd}
                  onDateStartChange={d => {
                    setDateStart(d);
                    if (!d) setDateEnd(undefined);
                  }}
                  onDateEndChange={setDateEnd}
                  errorStart={errors.date_start}
                  errorEnd={errors.date_end}
                  closeOnSelect={false}
                />
                {overlapError && (
                  <p className="flex items-center gap-1.5 text-xs text-red-500 -mt-2">
                    <Info className="size-3.5 shrink-0" />
                    {overlapError}
                  </p>
                )}

                {/* Leave Type */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                    Leave Type {!leaveTypeId && <span className="text-red-500 normal-case tracking-normal">*</span>}
                  </label>
                  <Select value={leaveTypeId} onValueChange={handleLeaveTypeChange}>
                    <SelectTrigger className={cn(errors.leave_type && 'border-red-500')}>
                      <SelectValue placeholder="Select leave type" />
                    </SelectTrigger>
                    <SelectContent>
                      {leaveTypes.map(t => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.leave_type && <p className="text-xs text-red-500">{errors.leave_type}</p>}
                </div>

                {/* Primary Reason */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                    Reason Category {!reasonId && <span className="text-red-500 normal-case tracking-normal">*</span>}
                  </label>
                  <Select value={reasonId} onValueChange={handleReasonChange} disabled={!leaveTypeId}>
                    <SelectTrigger className={cn(errors.reason && 'border-red-500')}>
                      <SelectValue
                        placeholder={
                          !leaveTypeId
                            ? 'Select a leave type first'
                            : reasons.length
                            ? 'Select reason'
                            : 'No reasons available'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {reasons.map(r => (
                        <SelectItem key={r.id} value={String(r.id)}>{r.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.reason && <p className="text-xs text-red-500">{errors.reason}</p>}
                </div>

                {/* Sub Reason */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                    Reason{' '}
                    {!subreasonId && (
                      <span className="text-red-500 normal-case tracking-normal">*</span>
                    )}
                  </label>
                  <Select value={subreasonId} onValueChange={setSubreasonId} disabled={!reasonId}>
                    <SelectTrigger className={cn(errors.subreason && 'border-red-500')}>
                      <SelectValue
                        placeholder={!reasonId ? 'Select a primary reason first' : 'Select sub-reason'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {subreasons.map(s => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
                      ))}
                      <SelectItem key="other" value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.subreason && <p className="text-xs text-red-500">{errors.subreason}</p>}
                </div>

                <AnimatePresence initial={false}>
                  {isOtherSubreason && (
                    <motion.div
                      key="specify-reason"
                      initial={{ opacity: 0, y: -8, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: 'auto' }}
                      exit={{ opacity: 0, y: -8, height: 0 }}
                      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                      style={{ overflow: 'hidden' }}
                      className="space-y-1.5"
                    >
                      <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                        Specify your reason{' '}
                        {!remarks.trim() && (
                          <span className="text-red-500 normal-case tracking-normal">*</span>
                        )}
                      </label>
                      <TextareaWithCharactersLeft
                        value={remarks}
                        onChange={e => {
                          if (BLOCKED.test(e.target.value)) return;
                          setRemarks(e.target.value);
                        }}
                        maxLength={500}
                        placeholder="Describe your reason..."
                        className={cn(errors.remarks && 'border-red-500')}
                      />
                      {errors.remarks && <p className="text-xs text-red-500">{errors.remarks}</p>}
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>

              {/* ── Right: summary panel ── */}
              <motion.div
                layout
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                className="w-90 shrink-0 flex flex-col gap-4 p-5 overflow-y-auto [scrollbar-width:thin] m-3 border border-[var(--information-border-color)] rounded-xl bg-[var(--information-bg-color)] max-[480px]:w-full max-[480px]:m-0 max-[480px]:rounded-none max-[480px]:rounded-b-2xl max-[480px]:p-4"
              >

                {/* Row 1: Working Days / Total Hours */}
                <div className="border-b border-[#2845D6]/20 pb-4">
                  <div className={cn('grid grid-cols-2 gap-4 transition-opacity duration-300', holidaysLoading && 'opacity-30')}>
                    <div className="flex flex-col items-center gap-1">
                      <AnimatedNumber
                        value={workingDayCount}
                        className="mt-1 text-4xl font-bold leading-none tabular-nums text-[var(--color-text-primary)]"
                      />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Working Days</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="mt-1 flex items-baseline gap-1">
                        <AnimatedNumber
                          value={totalHours}
                          className="text-4xl font-bold leading-none tabular-nums text-[var(--color-text-primary)]"
                        />
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Total Hours</span>
                    </div>
                  </div>
                </div>

                {/* Row 2: Per-date list */}
                <div className="flex flex-col gap-0.5">
                  {!dateStart || !dateEnd ? (
                    <span className="px-1 text-xs text-[var(--color-text-muted)]">Select a date range to see details.</span>
                  ) : holidaysLoading ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="h-5 animate-pulse rounded bg-[var(--color-bg-elevated)]" />
                      <div className="h-5 animate-pulse rounded bg-[var(--color-bg-elevated)] opacity-60" />
                    </div>
                  ) : (
                    ([localDateStr(dateStart!), localDateStr(dateEnd!)] as string[])
                      .filter((iso, index, arr) => index === 0 || iso !== arr[0])
                      .map(iso => {
                        const dateObj = new Date(iso + 'T00:00:00');
                        const label = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        const isWorking = workingDates.includes(iso);

                        if (isWorking && overlapDates.has(iso)) {
                          return (
                            <motion.div layout transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }} key={iso}
                              className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-700/40 px-3 py-2"
                            >
                              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-red-500" />
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-medium text-red-600 dark:text-red-400">{label}</span>
                                <span className="text-[10px] leading-snug text-red-500 dark:text-red-400">Overlaps with existing leave</span>
                              </div>
                            </motion.div>
                          );
                        }

                        if (!isWorking) {
                          return (
                            <motion.div layout transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }} key={iso}
                              className="flex items-center justify-between px-3 py-1.5"
                            >
                              <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
                              <span className="rounded px-1.5 py-0.5 text-[10px] font-medium border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]">
                                Non working
                              </span>
                            </motion.div>
                          );
                        }

                        return (
                          <motion.div layout transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }} key={iso}
                            className="flex items-center justify-between"
                          >
                            <span className="text-xs font-medium text-[var(--color-text-primary)]">{label}</span>
                            <Select value={String(perDateHours[iso] ?? 8)} onValueChange={value => setPerDateHours(prev => ({ ...prev, [iso]: Number(value) }))}>
                              <SelectTrigger className="w-auto min-w-[3rem] cursor-pointer rounded-md border-none bg-transparent px-2 py-1 text-[13px] text-[var(--color-accent)] outline-none">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
                                {[1, 2, 3, 4, 5, 6, 7, 8].map(h => (
                                  <SelectItem key={h} value={String(h)}>
                                    {h === 4 ? 'Half day' : `${h}h`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </motion.div>
                        );
                      })
                  )}
                </div>

                {/* Row 3: Leave Balance */}
                {selectedType?.has_balance && (
                  <motion.div layout transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
                    {balanceSplits.length > 0 ? (
                      <>
                        {balanceSplits.map(split => (
                          <motion.div key={split.balance.id} layout transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }} className="flex items-start justify-between">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-medium text-[var(--color-text-primary)]">{selectedType.name} Balance</span>
                              <span className="text-[10px] text-[var(--color-text-muted)]">
                                {fmtPeriod(split.balance.period_start, split.balance.period_end)}
                              </span>
                            </div>
                            <div className="flex items-center">
                              <span className={cn(
                                'text-lg font-bold leading-none tabular-nums',
                                (split.isInsufficient || (selectedType?.deductible && split.adjustedBalance < 0)) ? 'text-red-500' : 'text-[var(--color-text-primary)]',
                              )}>
                                {Math.max(split.adjustedBalance, 0).toFixed(1)}
                              </span>
                            </div>
                          </motion.div>
                        ))}
                        {anyBalanceInsufficient && (
                          <p className="text-[11px] text-red-500 leading-snug">
                            Not enough leave credits for this request.
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-[var(--color-text-muted)]">No balance record found.</span>
                    )}
                  </motion.div>
                )}

                {/* Row 4: Credits to be deducted */}
                {selectedType?.deductible && workingDayCount > 0 && (
                  <div className="flex flex-col gap-1 border-t border-[var(--color-border)] pt-3">
                    {balanceSplits.length > 1 ? (
                      <>
                        <span className="text-xs text-[var(--color-text-muted)]">Credits to be deducted</span>
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          {balanceSplits.map(split => (
                            <div key={split.balance.id} className="flex items-center justify-between pl-1">
                              <span className="text-[11px] text-[var(--color-text-muted)]">
                                {fmtPeriod(split.balance.period_start, split.balance.period_end)}
                              </span>
                              <span className="text-[11px] font-semibold tabular-nums text-[var(--color-text-primary)]">
                                {split.days.toFixed(1)}
                              </span>
                            </div>
                          ))}
                          <div className="flex items-center justify-between mt-1 pt-1 border-t border-[var(--color-border)]/50">
                            <span className="text-xs text-[var(--color-text-muted)]">Total</span>
                            <span className="text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">
                              {(totalHours / 8).toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--color-text-muted)]">Credits to be deducted</span>
                        <span className="text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">
                          {(totalHours / 8).toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Row 5: Projected remaining balance */}
                {selectedType?.deductible && selectedType?.has_balance && balanceSplits.length > 0 && workingDayCount > 0 && (
                  <div className="flex flex-col gap-1">
                    {balanceSplits.length > 1 ? (
                      <>
                        <span className="text-xs text-[var(--color-text-muted)]">Remaining balance</span>
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          {balanceSplits.map(split => {
                            const rawRemaining = split.adjustedBalance - split.days;
                            const remaining = Math.max(rawRemaining, 0);
                            return (
                              <div key={split.balance.id} className="flex items-center justify-between pl-1">
                                <span className="text-[11px] text-[var(--color-text-muted)]">
                                  {fmtPeriod(split.balance.period_start, split.balance.period_end)}
                                </span>
                                <span className={cn('text-[11px] font-semibold tabular-nums', rawRemaining < 0 ? 'text-red-500' : 'text-[var(--color-text-primary)]')}>
                                  {remaining.toFixed(1)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--color-text-muted)]">Remaining balance</span>
                        {(() => {
                          const rawRemaining = balanceSplits[0].adjustedBalance - balanceSplits[0].days;
                          const remaining = Math.max(rawRemaining, 0);
                          return (
                            <span className={cn('text-sm font-semibold tabular-nums', rawRemaining < 0 ? 'text-red-500' : 'text-[var(--color-text-primary)]')}>
                              {remaining.toFixed(1)}
                            </span>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}

              </motion.div>
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--color-border)] px-6 py-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--color-border)]
                  text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)]
                  transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isValid || saving}
                className="flex min-w-[140px] items-center justify-center gap-1.5 px-4 py-2 rounded-lg
                  bg-[#2845D6] text-white text-sm font-semibold hover:bg-[#1f38c0]
                  disabled:opacity-50 transition-colors"
              >
                {saving
                  ? <TextShimmer duration={1.2} className="text-sm font-semibold [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">
                      Saving…
                    </TextShimmer>
                  : <><Check size={14} /><span>Save Changes</span></>
                }
              </button>
            </div>
          </form>
        )}

        {/* Footer placeholder while loading */}
        {detailLoading && (
          <div className="border-t border-[var(--color-border)] px-6 py-4 flex items-center justify-end gap-2">
            <div className="h-9 w-20 animate-pulse rounded-lg bg-[var(--color-bg-card)]" />
            <div className="h-9 w-32 animate-pulse rounded-lg bg-[var(--color-bg-card)]" />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Leave Detail Modal ─────────────────────────────────────────────────────────

interface LeaveDetailModalProps {
  leaveId: number;
  onClose: () => void;
  canApprove?: boolean;
  isApproverView?: boolean;
  onUpdated?: (updated: LeaveDetail) => void;
  onCancelled?: (id: number) => void;
}

function LeaveDetailModal({
  leaveId,
  onClose,
  canApprove = false,
  isApproverView = false,
  onUpdated,
  onCancelled,
}: LeaveDetailModalProps) {
  const [detail, setDetail] = useState<LeaveDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // ── Inline action form state (for Review modal) ───────────────────────────
  const [pendingAction, setPendingAction] = useState<'approved' | 'disapproved' | ''>('');
  const [remarks, setRemarks] = useState('');
  const [remarksError, setRemarksError] = useState('');
  const [actionSaving, setActionSaving] = useState(false);
  const [actionDone, setActionDone] = useState(false);
  const [shimmerLabel, setShimmerLabel] = useState<string | null>(null);

  useEffect(() => {
    setShowCancelConfirm(false);
    setLoadingDetail(true);
    fetch(`/api/leave/requests/${leaveId}`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(d => setDetail(d as LeaveDetail))
      .catch(() => toast.error('Failed to load leave details.', { title: 'Error' }))
      .finally(() => setLoadingDetail(false));
  }, [leaveId]);

  async function handleCancel() {
    if (!detail) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/leave/requests/${detail.id}/cancel`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Leave request cancelled.', { title: 'Cancelled' });
        onCancelled?.(detail.id);
        onClose();
      } else {
        toast.error((data as { detail?: string }).detail ?? 'Could not cancel leave request.', { title: 'Error' });
      }
    } catch {
      toast.error('Network error. Please try again.', { title: 'Error' });
    } finally {
      setCancelling(false);
    }
  }

  function handleActed(updated: LeaveDetail) {
    setDetail(updated);
    onUpdated?.(updated);
  }

  async function handleAction(selectedAction: 'approved' | 'disapproved') {
    if (selectedAction === 'disapproved' && !remarks.trim()) {
      setRemarksError('Remarks are required when disapproving.');
      return;
    }
    setRemarksError('');
    setPendingAction(selectedAction);
    setActionSaving(true);

    // Multi-stage shimmer — timed labels while the single request is in-flight
    const stages = selectedAction === 'approved'
      ? ['Approving…', 'Deducting…', 'Sending Email…']
      : ['Disapproving…', 'Sending Email…'];
    setShimmerLabel(stages[0]);
    const timers: ReturnType<typeof setTimeout>[] = stages
      .slice(1)
      .map((label, i) => setTimeout(() => setShimmerLabel(label), (i + 1) * 1400));

    try {
      const res = await fetch(`/api/leave/requests/${detail!.id}/action`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ action: selectedAction, remarks }),
      });
      const data = await res.json();
      if (res.ok) {
        const label = selectedAction === 'approved' ? 'Approved' : 'Disapproved';
        toast.success(`Leave request ${label.toLowerCase()} successfully.`, { title: label });
        handleActed(data as LeaveDetail);
        setRemarks('');
        setActionDone(true);
      } else {
        type ErrBody = { detail?: string; action?: string[]; remarks?: string[]; non_field_errors?: string[] };
        const err = data as ErrBody;
        const msg = err.detail ?? err.remarks?.[0] ?? err.action?.[0] ?? err.non_field_errors?.[0] ?? 'Failed to act on leave request.';
        toast.error(msg, { title: 'Error' });
      }
    } catch {
      toast.error('Network error. Please try again.', { title: 'Error' });
    } finally {
      timers.forEach(clearTimeout);
      setShimmerLabel(null);
      setActionSaving(false);
      setPendingAction('');
    }
  }

  const handleBodyScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    const scrollTop = el.scrollTop;
    const maxScroll = el.scrollHeight - el.clientHeight;
    setShowScrollTop(scrollTop > 8);
    setShowScrollBottom(scrollTop < maxScroll - 8);
  };

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;

    handleBodyScroll();
    el.addEventListener('scroll', handleBodyScroll);
    window.addEventListener('resize', handleBodyScroll);

    return () => {
      el.removeEventListener('scroll', handleBodyScroll);
      window.removeEventListener('resize', handleBodyScroll);
    };
  }, [detail, loadingDetail]);

  const firstPendingIdx = (detail?.approval_steps ?? []).findIndex(s => s.status === 'pending');
  const timelineItems: TimelineItem[] = (detail?.approval_steps ?? []).map((step, idx) => {
    const isPending = step.status === 'pending';
    const displayName = isPending
      ? (step.approver_name ?? step.role_group_display)
      : (step.acted_by_name ?? step.approver_name ?? step.role_group_display);
    const displayPosition = isPending ? step.approver_position : step.acted_by_position;
    const rawTs = isPending
      ? (step.activated_at ? new Date(step.activated_at) : null)
      : (step.acted_at ? new Date(step.acted_at) : null);
    return {
      id: String(step.id),
      title: '',
      description: (
        <div className="space-y-0.3">
          {rawTs && (
            <p className="text-[11px] pb-1 text-[var(--color-text-muted)]">{formatStepTime(rawTs)}</p>
          )}
          {isPending && !rawTs && (
            <p className="text-[11px] pb-1 text-[var(--color-text-muted)]">Waiting for the current approver.</p>
          )}
          <p className="text-xs font-medium text-[var(--color-text-primary)]">{displayName}</p>
          {displayPosition && (
            <p className="text-[11px] text-[var(--color-text-muted)]">{displayPosition}</p>
          )}
          
          {!isPending && step.remarks && (
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)] italic">&ldquo;{step.remarks}&rdquo;</p>
          )}
        </div>
      ),
      timestamp: undefined,
      status: stepStatusToTimeline(step.status, idx === firstPendingIdx),
    };
  });

  if (detail?.status === 'cancelled' && detail.cancelled_at) {
    timelineItems.push({
      id: 'cancelled',
      title: '',
      description: (
        <div className="space-y-0.5">
          <p className="text-[11px] text-[var(--color-text-muted)]">{formatStepTime(new Date(detail.cancelled_at))}</p>
          {detail.cancelled_by_name && (
            <p className="text-xs font-medium text-[var(--color-text-primary)]">{detail.cancelled_by_name}</p>
          )}
        </div>
      ),
      timestamp: undefined,
      status: 'canceled',
    });
  }

  const hasPendingStep = detail?.approval_steps?.some(s => s.status === 'pending') ?? false;
  const showActionForm = canApprove && hasPendingStep && detail?.status !== 'cancelled';

  function fmtShort(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-[var(--color-border)]
          bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-4rem)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
            {canApprove && showActionForm && !actionDone ? 'Review Leave Request' : 'Leave Request Details'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full
              text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="relative flex flex-col flex-1 h-0 overflow-hidden">
          <div
            ref={bodyRef}
            className="flex-1 h-full min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {loadingDetail && (
              <div className="flex items-center justify-center py-8">
                <span className="size-6 border-2 border-[#2845D6]/30 border-t-[#2845D6] rounded-full animate-spin" />
              </div>
            )}

          {!loadingDetail && detail && (
            <>
              <div className="flex items-center justify-between px-6 pt-4 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-[var(--color-text-primary)]">
                    {detail.control_number}
                  </span>
                  <StatusPill status={detail.status} label={detail.status_display} />
                </div>
                <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                  {fmtShort(detail.date_prepared)}
                </span>
              </div>

              <div className="px-6 pt-3 pb-3">
                <div className="flex items-center gap-3">
                  <p className="text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap">
                    Leave Request Information
                  </p>
                  <div className="flex-1 h-px bg-[var(--color-border)]" />
                </div>
              </div>

              <div className="px-6 pb-2">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                  <InfoRow label="Requested By" value={detail.employee_name || '—'} />
                  <InfoRow label="Department" value={detail.employee_department || 'N/A'} />
                  <InfoRow label="Line" value={detail.employee_line || 'N/A'} />
                  <InfoRow label="Leave Type" value={detail.leave_type_name} />
                  <InfoRow label="Duration" value={fmtDurationRange(detail.date_start, detail.date_end)} />
                  <InfoRow label="Time & Days" value={formatTimeAndDays(detail.days_count, detail.hours)} />
                  <div className="col-span-2">
                    <InfoRow
                      label="Reason"
                      value={detail.reason_title + (detail.subreason_title ? ` - ${detail.subreason_title}` : '')}
                    />
                  </div>
                </div>
              </div>

              {timelineItems.length > 0 && (
                <div className="space-y-2 px-6 pt-3 pb-3">
                  <div className="flex items-center gap-3 pb-2">
                    <p className="text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap">
                      Approval Routing Information
                    </p>
                    <div className="flex-1 h-px bg-[var(--color-border)]" />
                  </div>
                  <Timeline
                    items={timelineItems}
                    showConnectors
                    showTimestamps={false}
                  />
                </div>
              )}

            </>
          )}
          </div>
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center py-3 transition-opacity duration-200',
              showScrollTop ? 'opacity-100' : 'opacity-0',
            )}
          >
            <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[rgba(255,255,255,0.88)] to-transparent dark:from-[rgba(0,0,0,0.75)]" />
            <div className="relative flex h-4 w-8 items-center justify-center rounded-full bg-[rgba(255,255,255,0.95)] text-[var(--color-text-muted)] dark:bg-transparent dark:text-white">
              <ChevronUp className="h-4 w-4" />
            </div>
          </div>
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center py-3 transition-opacity duration-200',
              showScrollBottom ? 'opacity-100' : 'opacity-0',
            )}
          >
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[rgba(255,255,255,0.88)] to-transparent dark:from-[rgba(0,0,0,0.75)]" />
            <div className="relative flex h-4 w-8 items-center justify-center rounded-full bg-[rgba(255,255,255,0.95)] text-[var(--color-text-muted)] dark:bg-transparent dark:text-white">
              <ChevronDown className="h-4 w-4" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] px-6 pt-3 pb-2">
          {canApprove && showActionForm && !actionDone ? (
            /* ── Review modal: "Your Action" section ──────────────────── */
            <div className="flex flex-col gap-1.5">
              <div>
                <p className="text-[12px] font-semibold text-[var(--color-text-muted)] mb-1.5">
                  Remarks
                </p>
                <TextareaWithCharactersLeft
                  value={remarks}
                  onChange={e => { setRemarks(e.target.value); setRemarksError(''); }}
                  maxLength={500}
                  rows={2}
                  placeholder="Optional remarks…"
                  error={remarksError}
                  wrapperClassName="gap-1"
                  className="min-h-[64px]"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => handleAction('approved')}
                  disabled={actionSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
                    text-white bg-[var(--btn-success-bg)] hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {actionSaving && pendingAction === 'approved'
                    ? <TextShimmer duration={1.2} className="text-sm font-semibold [--base-color:#a5f3c0] [--base-gradient-color:#ffffff]">{shimmerLabel ?? 'Approving…'}</TextShimmer>
                    : <><CheckCircle2 size={14} /><span>Approve</span></>
                  }
                </button>
                <button
                  type="button"
                  onClick={() => handleAction('disapproved')}
                  disabled={actionSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
                    text-white bg-[var(--btn-danger-bg)] hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {actionSaving && pendingAction === 'disapproved'
                    ? <TextShimmer duration={1.2} className="text-sm font-semibold [--base-color:#fca5a5] [--base-gradient-color:#ffffff]">{shimmerLabel ?? 'Disapproving…'}</TextShimmer>
                    : <><XCircle size={14} /><span>Disapprove</span></>
                  }
                </button>
              </div>
            </div>
          ) : (
            /* ── Normal / view footer ─────────────────────────────────── */
            <AnimatePresence mode="wait" initial={false}>
              {showCancelConfirm && !loadingDetail && detail?.can_cancel && detail.status !== 'cancelled' ? (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col gap-3"
                >
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Are you sure you want to cancel this leave request? This action cannot be undone.
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCancelConfirm(false)}
                      className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--color-border)]
                        text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors"
                    >
                      Go Back
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
                        text-white bg-[var(--btn-danger-bg)] hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {cancelling
                        ? <span className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <Ban size={14} />
                      }
                      {cancelling ? 'Cancelling…' : 'Confirm Cancel'}
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="normal"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center justify-between gap-2"
                >
                  <div>
                    {!(isApproverView || canApprove) && !loadingDetail && detail?.can_cancel && detail.status !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => setShowCancelConfirm(true)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
                          text-white bg-[var(--btn-danger-bg)] hover:opacity-90 transition-opacity"
                      >
                        <Ban size={14} />
                        Cancel Leave
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--color-border)]
                      text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors"
                  >
                    Close
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── My Requests tab ───────────────────────────────────────────────────────────

interface MyRequestsTabProps {
  user: UserData;
  balances: LeaveBalance[];
  refreshKey?: number;
  onApply: () => void;
  onViewDetail: (id: number, canApprove: boolean) => void;
  onEdit: (id: number) => void;
}

function MyRequestsTab({ user, balances, refreshKey, onApply, onViewDetail, onEdit }: MyRequestsTabProps) {
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortField, setSortField] = useState('date_prepared');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('');
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const skeletonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [calendarRequests, setCalendarRequests] = useState<CalendarLeaveRequest[]>([]);

  // Fetch calendar data (all leave requests for date highlighting, no pagination)
  useEffect(() => {
    fetch('/api/leave/requests/calendar', { credentials: 'include' })
      .then(r => {
        if (!r.ok) return null;
        return r.json() as Promise<CalendarLeaveRequest[]>;
      })
      .then(data => {
        if (Array.isArray(data)) setCalendarRequests(data);
      })
      .catch(() => {});
  }, [refreshKey]);

  useEffect(() => {
    fetch('/api/leave/types', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((data: LeaveType[]) => setLeaveTypes(data))
      .catch(() => {});
  }, []);

  const fetchRequests = useCallback(async (
    p: number,
    q: string,
    status: string,
    field: string,
    dir: 'asc' | 'desc',
    ltId = '',
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set('search', q);
      if (status !== 'all') params.set('status', status);
      if (field) params.set('ordering', dir === 'desc' ? `-${field}` : field);
      if (ltId) params.set('leave_type', ltId);
      const res = await fetch(`/api/leave/requests?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: PagedResponse = await res.json();
      const orderedRows = status === 'all'
        ? data.results.slice().sort((a, b) => {
            if (a.status === 'pending' && b.status !== 'pending') return -1;
            if (a.status !== 'pending' && b.status === 'pending') return 1;
            return 0;
          })
        : data.results;
      setRows(orderedRows);
      setTotalPages(data.total_pages);
      setTotalCount(data.count);
    } catch {
      toast.error('Could not load leave requests.', { title: 'Connection Error' });
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced fetch — shows skeleton immediately while waiting before firing
  const triggerFetch = useCallback((
    p: number,
    q: string,
    status: string,
    field: string,
    dir: 'asc' | 'desc',
    ltId = '',
  ) => {
    if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
    setLoading(true);
    skeletonTimerRef.current = setTimeout(() => {
      fetchRequests(p, q, status, field, dir, ltId).catch(() => {});
    }, 1000);
  }, [fetchRequests]);

  useEffect(() => {
    triggerFetch(1, '', 'all', 'date_prepared', 'desc', '');
    return () => { if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current); };
  }, [refreshKey, fetchRequests, triggerFetch]);

  function handleSort(field: string) {
    const nextDir = field === sortField && sortDir === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDir(nextDir);
    setPage(1);
    triggerFetch(1, search, statusFilter, field, nextDir, leaveTypeFilter);
  }

  function handlePageChange(p: number) {
    setPage(p);
    triggerFetch(p, search, statusFilter, sortField, sortDir, leaveTypeFilter);
  }

  function handleSearch(q: string) {
    setSearch(q);
    setPage(1);
    triggerFetch(1, q, statusFilter, sortField, sortDir, leaveTypeFilter);
  }

  function handleStatusFilter(val: string) {
    setStatusFilter(val);
    setPage(1);
    triggerFetch(1, search, val, sortField, sortDir, leaveTypeFilter);
  }

  function handleLeaveTypeChange(id: string) {
    setLeaveTypeFilter(id);
    setPage(1);
    triggerFetch(1, search, statusFilter, sortField, sortDir, id);
  }

  async function handleCancelRequest(id: number) {
    setCancellingId(id);
    try {
      const res = await fetch(`/api/leave/requests/${id}/cancel`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Leave request cancelled.', { title: 'Cancelled' });
        setConfirmCancelId(null);
        fetchRequests(page, search, statusFilter, sortField, sortDir, leaveTypeFilter);
      } else {
        toast.error((data as { detail?: string }).detail ?? 'Could not cancel leave request.', { title: 'Error' });
      }
    } catch {
      toast.error('Network error. Please try again.', { title: 'Error' });
    } finally {
      setCancellingId(null);
    }
  }

  const hasActiveSearchOrFilter = Boolean(search || statusFilter !== 'all' || leaveTypeFilter);
  const showApplyButton = totalCount > 0;

  const leaveTypeFilterContent = leaveTypes.length > 0 ? (
    <FilterListContent
      options={leaveTypes.map(lt => ({ value: String(lt.id), label: lt.name }))}
      value={leaveTypeFilter}
      onChange={handleLeaveTypeChange}
      allLabel="All Types"
    />
  ) : null;

  const statusFilterContent = (
    <FilterListContent
      options={STATUS_OPTIONS}
      value={statusFilter}
      onChange={handleStatusFilter}
      allLabel="All Statuses"
    />
  );

  const columns: DataTableColumn<LeaveRequest>[] = useMemo(() => [
    {
      key: 'control_number',
      label: 'Control No.',
      sortField: 'control_number',
      render: row => (
        <span className="text-xs font-semibold text-primary">{row.control_number}</span>
      ),
    },
    {
      key: 'leave_type',
      label: 'Leave Type',
      sortField: 'leave_type',
      filterContent: leaveTypeFilterContent,
      filterActive: leaveTypeFilter.length > 0,
      render: row => <span className="text-xs">{row.leave_type_name}</span>,
    },
    {
      key: 'reason',
      label: 'Reason',
      width: '500px',
      thClassName: 'max-[780px]:hidden',
      tdClassName: 'max-[780px]:hidden',
      render: row => (
        <span className="text-xs">
          {row.reason_title}{row.subreason_title ? ` - ${row.subreason_title}` : ''}
        </span>
      ),
    },
    {
      key: 'duration',
      label: 'Duration',
      sortField: 'days_count',
      thClassName: 'max-[780px]:hidden',
      tdClassName: 'max-[780px]:hidden',
      render: row => <span className="text-xs">{fmtDurationRange(row.date_start, row.date_end)}</span>,
    },
    {
      key: 'date_prepared',
      label: 'Filed On',
      sortField: 'date_prepared',
      thClassName: 'max-[780px]:hidden',
      tdClassName: 'max-[780px]:hidden',
      render: row => <span className="text-xs text-muted-foreground">{row.date_prepared_display}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      sortField: 'status',
      filterContent: statusFilterContent,
      filterActive: statusFilter !== 'all',
      render: row => <StatusPill status={row.status} label={row.status_display} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      headerAlign: 'center',
      render: row => (
        <div className="flex items-center justify-center gap-0.5">
          <button
            type="button"
            title="View details"
            onClick={() => onViewDetail(row.id, false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
          >
            <Eye size={14} />
          </button>
          {row.status === 'pending' && (
            <button
              type="button"
              title="Edit"
              onClick={() => onEdit(row.id)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
            >
              <Pencil size={13} />
            </button>
          )}
          {row.can_cancel && (
            <button
              type="button"
              title="Cancel request"
              onClick={() => setConfirmCancelId(row.id)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <XCircle size={14} />
            </button>
          )}
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [onViewDetail, onEdit, statusFilter, statusFilterContent, leaveTypeFilter, leaveTypeFilterContent, confirmCancelId]);

  return (
    <div className="flex flex-col">
      <LeaveDashboardRow balances={balances} calendarRequests={calendarRequests} loading={loading} />

      <AdminTableSection<LeaveRequest>
        search={search}
        onSearchChange={handleSearch}
        searchPlaceholder="Search leave requests…"
        actions={showApplyButton ? (
          <button
            onClick={onApply}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2845D6] text-white shadow-sm
                text-xs hover:bg-[#1f38c0] transition-colors shrink-0"
          >
            <Plus className="size-4" />
            Apply for Leave
          </button>
        ) : undefined}
        columns={columns}
        rows={rows}
        rowKey={r => r.id}
        loading={loading}
        skeletonRows={10}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        totalPages={totalPages}
        pageSize={10}
        totalCount={totalCount}
        onPageChange={handlePageChange}
        emptyTitle={hasActiveSearchOrFilter ? 'No results found' : 'No leave requests'}
        emptyDescription={hasActiveSearchOrFilter ? 'Try adjusting your search or removing filters.' : 'You have not filed any leave requests yet.'}
        emptyIcons={[CalendarDays, ClipboardList, Clock]}
        emptyAction={hasActiveSearchOrFilter ? undefined : { label: 'Apply for Leave', onClick: onApply, icon: <Plus className="size-4" /> }}
      />

      <AnimatePresence>
        {confirmCancelId !== null && (
          <ConfirmationModal
            title="Cancel Leave Request"
            message="Are you sure you want to cancel this leave request? This action cannot be undone."
            confirmLabel="Cancel Request"
            cancelLabel="Go Back"
            onConfirm={() => handleCancelRequest(confirmCancelId)}
            onCancel={() => setConfirmCancelId(null)}
            confirming={cancellingId === confirmCancelId}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Approval Queue tab ────────────────────────────────────────────────────────

// ── Chart helpers (shared with ApprovalQueueTab) ─────────────────────────────

function _currentFYStart(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

function _getCurrentWeekStart(): string {
  const now = new Date();
  const dow  = now.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon  = new Date(now);
  mon.setDate(now.getDate() + diff);
  return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
}

function _getWeekStartOptions(fyStartYear: number): { label: string; value: string }[] {
  const opts: { label: string; value: string }[] = [];
  const fyEnd = new Date(fyStartYear + 1, 5, 30);
  const jul1  = new Date(fyStartYear, 6, 1);
  const dow   = jul1.getDay();
  const cur   = new Date(jul1);
  cur.setDate(jul1.getDate() - (dow === 0 ? 6 : dow - 1));
  while (cur <= fyEnd) {
    const sun = new Date(cur);
    sun.setDate(cur.getDate() + 6);
    const value = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
    const label = `${cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    opts.push({ label, value });
    cur.setDate(cur.getDate() + 7);
  }
  return opts;
}

function _getFYMonths(fyStartYear: number): { value: number; year: number; label: string }[] {
  const MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return [7,8,9,10,11,12,1,2,3,4,5,6].map(m => ({
    value: m,
    year:  m >= 7 ? fyStartYear : fyStartYear + 1,
    label: `${MN[m - 1]} ${m >= 7 ? fyStartYear : fyStartYear + 1}`,
  }));
}

const QUEUE_CHART_COLORS = [
  { color: '#2845D6', lightColor: '#5B78E8' },
  { color: '#10B981', lightColor: '#34D399' },
  { color: '#F59E0B', lightColor: '#FCD34D' },
  { color: '#8B5CF6', lightColor: '#C084FC' },
  { color: '#EC4899', lightColor: '#F9A8D4' },
  { color: '#14B8A6', lightColor: '#5EEAD4' },
  { color: '#F97316', lightColor: '#FDBA74' },
  { color: '#0EA5E9', lightColor: '#7DD3FC' },
];

interface QueueProps {
  user: UserData;
  refreshKey?: number;
  onViewDetail: (id: number, canApprove: boolean, isApproverView?: boolean) => void;
}

function ApprovalQueueTab({ user, refreshKey = 0, onViewDetail }: QueueProps) {
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState('date_prepared');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [exporting, setExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const skeletonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingRef = useRef(false);
  const prevRefreshKey = useRef(refreshKey);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // ── Chart state ────────────────────────────────────────────────────────────
  const [chartViewType,       setChartViewType]       = useState<ChartViewType>('monthly');
  const [chartType,           setChartType]           = useState<ChartDisplayType>('bar');
  const [chartFyStart,        setChartFyStart]        = useState(_currentFYStart());
  const [chartSelectedMonth,  setChartSelectedMonth]  = useState(new Date().getMonth() + 1);
  const [chartSelectedYear,   setChartSelectedYear]   = useState(new Date().getFullYear());
  const [chartWeekStart,      setChartWeekStart]      = useState(_getCurrentWeekStart());
  const [chartData,           setChartData]           = useState<MultiSeriesDataPoint[]>([]);
  const [chartCategories,     setChartCategories]     = useState<ChartCategory[]>([]);
  const [chartLoading,        setChartLoading]        = useState(true);
  const [chartTransitioning,  setChartTransitioning]  = useState(false);
  const [leaveTypes,          setLeaveTypes]          = useState<LeaveType[]>([]);
  const [leaveTypeFilter,     setLeaveTypeFilter]     = useState('');
  const chartInitialized = useRef(false);

  const debouncedSearch = useDebounce(search, 350);

  // ── Chart fetch ────────────────────────────────────────────────────────────
  const fetchChart = useCallback(async () => {
    if (!chartInitialized.current) {
      setChartLoading(true);
    } else {
      setChartTransitioning(true);
    }
    try {
      const params = new URLSearchParams({ view_type: chartViewType });
      if (chartViewType === 'fiscal') {
        params.set('fy_start', String(chartFyStart));
      } else if (chartViewType === 'monthly') {
        params.set('month_year', `${chartSelectedYear}-${chartSelectedMonth}`);
      } else {
        params.set('week_start', chartWeekStart);
      }
      const [res] = await Promise.all([
        fetch(`/api/leave/approval-queue/chart?${params}`, { credentials: 'include' }),
        new Promise<void>(r => setTimeout(r, 1000)),
      ]);
      if (!res.ok) return;
      const data = await res.json() as { data: MultiSeriesDataPoint[]; categories: { key: string; label: string; color: string; gradId: string; lightColor: string }[] };
      // remap categories to ChartCategory shape
      const cats: ChartCategory[] = data.categories.map((c, i) => {
        const palette = QUEUE_CHART_COLORS[i % QUEUE_CHART_COLORS.length];
        return {
          key:        c.key,
          label:      c.label,
          color:      c.color ?? palette.color,
          gradId:     c.gradId ?? `qgrad_${i}`,
          lightColor: c.lightColor ?? palette.lightColor,
        };
      });
      setChartCategories(cats);
      setChartData(data.data);
      chartInitialized.current = true;
    } finally {
      setChartLoading(false);
      setChartTransitioning(false);
    }
  }, [chartViewType, chartFyStart, chartSelectedMonth, chartSelectedYear, chartWeekStart]);

  useEffect(() => { fetchChart(); }, [fetchChart]);

  useEffect(() => {
    fetch('/api/leave/types', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((data: LeaveType[]) => setLeaveTypes(data))
      .catch(() => {});
  }, []);

  // ── Derived chart options ─────────────────────────────────────────────────
  const fyMonths   = _getFYMonths(chartFyStart);
  const weekOpts   = _getWeekStartOptions(chartFyStart);

  const fetchQueue = useCallback(async (
    p: number,
    q: string,
    status: string,
    field: string,
    dir: 'asc' | 'desc',
    ltId = '',
    silent = false,
  ) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set('search', q);
      if (status !== 'all') params.set('status', status);
      if (ltId) params.set('leave_type', ltId);
      if (field) params.set('ordering', dir === 'desc' ? `-${field}` : field);
      const res = await fetch(`/api/leave/approval-queue?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: PagedResponse = await res.json();
      setRows(data.results);
      setTotalPages(data.total_pages);
      setTotalCount(data.count);
    } catch {
      if (!silent) toast.error('Could not load approval queue.', { title: 'Connection Error' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const triggerFetch = useCallback((
    p: number,
    q: string,
    status: string,
    field: string,
    dir: 'asc' | 'desc',
    ltId = '',
  ) => {
    if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
    setLoading(true);
    skeletonTimerRef.current = setTimeout(() => {
      fetchQueue(p, q, status, field, dir, ltId).catch(() => {});
    }, 1000);
  }, [fetchQueue]);

  useEffect(() => {
    triggerFetch(1, '', '', 'date_prepared', 'desc');
    return () => { if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current); };
  }, [fetchQueue, triggerFetch]);

  // ── Refresh when refreshKey changes (triggered from outside after an action) ──────
  useEffect(() => {
    if (refreshKey === prevRefreshKey.current) return;
    prevRefreshKey.current = refreshKey;
    setPage(1);
    triggerFetch(1, search, statusFilter, sortField, sortDir, leaveTypeFilter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // ── Polling: silent re-fetch every 30 s ───────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (!loadingRef.current) {
        void fetchQueue(page, debouncedSearch, statusFilter, sortField, sortDir, leaveTypeFilter, true);
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [page, debouncedSearch, statusFilter, sortField, sortDir, leaveTypeFilter, fetchQueue]);

  function handleSort(field: string) {
    const nextDir = field === sortField && sortDir === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDir(nextDir);
    setPage(1);
    triggerFetch(1, search, statusFilter, field, nextDir, leaveTypeFilter);
  }

  function handleSearch(q: string) {
    setSearch(q);
    setPage(1);
    triggerFetch(1, q, statusFilter, sortField, sortDir, leaveTypeFilter);
  }

  function handleStatusFilter(val: string) {
    setStatusFilter(val);
    setPage(1);
    triggerFetch(1, search, val, sortField, sortDir, leaveTypeFilter);
  }

  function handleLeaveTypeFilter(val: string) {
    setLeaveTypeFilter(val);
    setPage(1);
    triggerFetch(1, search, statusFilter, sortField, sortDir, val);
  }

  const leaveTypeFilterContent = leaveTypes.length > 0 ? (
    <FilterListContent
      options={leaveTypes.map(lt => ({ value: String(lt.id), label: lt.name }))}
      value={leaveTypeFilter}
      onChange={handleLeaveTypeFilter}
      allLabel="All Leave Types"
    />
  ) : null;

  const statusFilterContent = (
    <FilterListContent
      options={APPROVAL_QUEUE_STATUS_OPTIONS}
      value={statusFilter}
      onChange={handleStatusFilter}
      allLabel="All Status"
      clearOnReclick
    />
  );

  const canExport = user.admin || user.hr || user.clinic || user.iad;

  const columns: DataTableColumn<LeaveRequest>[] = useMemo(() => [
    {
      key: 'control_number',
      label: 'Control No.',
      width: '12%',
      sortField: 'control_number',
      thClassName: 'max-[780px]:!w-1/4',
      tdClassName: 'max-[780px]:!w-1/4',
      render: row => (
        <span className="text-xs font-semibold text-primary">{row.control_number}</span>
      ),
    },
    {
      key: 'employee',
      label: 'Employee',
      width: '12%',
      sortField: 'employee_name',
      thClassName: 'max-[780px]:hidden',
      tdClassName: 'max-[780px]:hidden',
      render: row => (
        <div className="flex flex-col">
          <span className="text-xs font-medium">{row.employee_name ?? '—'}</span>
          <span className="text-[10px] text-muted-foreground">{row.employee_id_number ?? row.employee_id ?? ''}</span>
        </div>
      ),
    },
    {
      key: 'leave_type',
      label: 'Leave Type',
      width: '12%',
      sortField: 'leave_type',
      filterContent: leaveTypeFilterContent,
      filterActive: Boolean(leaveTypeFilter),
      thClassName: 'max-[780px]:!w-1/4',
      tdClassName: 'max-[780px]:!w-1/4',
      render: row => <span className="text-xs">{row.leave_type_name}</span>,
    },
    {
      key: 'reason',
      label: 'Reason',
      width: '28%',
      thClassName: 'max-[780px]:hidden',
      tdClassName: 'max-[780px]:hidden',
      render: row => (
        <span className="text-xs">
          {row.reason_title}{row.subreason_title ? ` — ${row.subreason_title}` : ''}
        </span>
      ),
    },
    {
      key: 'duration',
      label: 'Duration',
      width: '12%',
      sortField: 'days_count',
      thClassName: 'max-[780px]:hidden',
      tdClassName: 'max-[780px]:hidden',
      render: row => <span className="text-xs">{fmtDurationRange(row.date_start, row.date_end)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      width: '12%',
      sortField: 'status',
      filterContent: statusFilterContent,
      filterActive: Boolean(statusFilter),
      thClassName: 'max-[780px]:!w-1/4',
      tdClassName: 'max-[780px]:!w-1/4',
      render: row => <StatusPill status={row.status} label={row.status_display} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      width: '12%',
      headerAlign: 'center',
      thClassName: 'max-[780px]:!w-1/4',
      tdClassName: 'max-[780px]:!w-1/4',
      render: row => {
        const canReview = row.can_review ?? false;
        return (
          <div className="flex items-center justify-center gap-1">
            {canReview ? (
              <button
                title="Review"
                onClick={() => onViewDetail(row.id, true, true)}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-normal bg-[#2845D6] text-white hover:bg-[#1e35b5] transition-colors"
              >
                <CheckCheck className="size-3" />
                Review
              </button>
            ) : (
              <button
                title="View details"
                onClick={() => onViewDetail(row.id, false, true)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Eye className="size-3.5" />
              </button>
            )}
          </div>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [onViewDetail, statusFilter, statusFilterContent, leaveTypeFilter, leaveTypeFilterContent]);

  return (
    <div className="flex flex-col">
      {/* Chart card */}
      <div className="pb-4">
        <AdminChartCard
          id="approval-queue-chart"
          categories={chartCategories}
          data={chartData}
          loading={chartLoading}
          transitioning={chartTransitioning}
          viewType={chartViewType}
          onViewTypeChange={setChartViewType}
          chartType={chartType}
          onChartTypeChange={setChartType}
          fyStart={chartFyStart}
          onFyStartChange={setChartFyStart}
          fyOptions={Array.from({ length: 5 }, (_, i) => _currentFYStart() - i)}
          monthYear={`${chartSelectedYear}-${chartSelectedMonth}`}
          onMonthYearChange={v => {
            const [y, m] = v.split('-');
            setChartSelectedYear(Number(y));
            setChartSelectedMonth(Number(m));
          }}
          monthOptions={fyMonths.map(mo => ({
            value: `${mo.year}-${mo.value}`,
            label: mo.label
          }))}
          weekStart={chartWeekStart}
          onWeekStartChange={setChartWeekStart}
          weekOptions={weekOpts}
        />
      </div>

      {/* Table */}
      <AdminTableSection<LeaveRequest>
        search={search}
        onSearchChange={handleSearch}
        searchPlaceholder="Search approval queue…"
        actions={canExport ? (
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            disabled={exporting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2845D6] text-white shadow-sm text-xs hover:bg-[#1f38c0] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="size-4" />
            {exporting ? (
              <TextShimmer duration={1.2} className="text-xs font-semibold [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">
                Exporting…
              </TextShimmer>
            ) : (
              'Export Report'
            )}
          </button>
        ) : undefined}
        columns={columns}
        rows={rows}
        rowKey={r => r.id}
        loading={loading}
        skeletonRows={10}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        totalPages={totalPages}
        pageSize={10}
        totalCount={totalCount}
        onPageChange={p => { setPage(p); triggerFetch(p, search, statusFilter, sortField, sortDir); }}
        emptyTitle="No requests in queue"
        emptyDescription="No pending requests require your approval at this time."
        emptyIcons={[CheckSquare, ClipboardList, Clock]}
      />

      <AnimatePresence>
        {showExportModal && (
          <ExportModal
            onClose={() => setShowExportModal(false)}
            exporting={exporting}
            setExporting={setExporting}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Export Modal ──────────────────────────────────────────────────────────────

function ExportModal({
  onClose,
  exporting,
  setExporting,
}: {
  onClose: () => void;
  exporting: boolean;
  setExporting: (v: boolean) => void;
}) {
  const [periodStart, setPeriodStart] = useState<Date | undefined>();
  const [periodEnd, setPeriodEnd] = useState<Date | undefined>();

  const canDownload = Boolean(periodStart && periodEnd) && !exporting;

  async function handleDownload() {
    if (!periodStart || !periodEnd) return;
    setExporting(true);
    try {
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const params = new URLSearchParams({
        period_start: fmt(periodStart),
        period_end: fmt(periodEnd),
      });
      const res = await fetch(`/api/leave/approval-queue/export?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}`);
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') ?? '';
      const nameMatch = cd.match(/filename="([^"]+)"/);
      const filename = nameMatch?.[1] ?? 'leave_export.xlsx';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded successfully.', { title: 'Export' });
      onClose();
    } catch {
      toast.error('Export failed. Please try again.', { title: 'Error' });
    } finally {
      setExporting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Export Leave Report</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-4">
          <LeaveRangePicker
            dateStart={periodStart}
            dateEnd={periodEnd}
            onDateStartChange={setPeriodStart}
            onDateEndChange={setPeriodEnd}
            closeOnSelect={false}
          />
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-0 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!canDownload}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2845D6] text-white text-xs font-semibold hover:bg-[#1f38c0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="size-3.5" />
            {exporting ? (
              <TextShimmer duration={1.2} className="text-xs font-semibold [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">
                Exporting…
              </TextShimmer>
            ) : (
              'Export'
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LeavePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');
  const [user, setUser] = useState<UserData | null>(null);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [applyOpen, setApplyOpen] = useState(false);
  const [refreshRequests, setRefreshRequests] = useState(0);
  const [refreshQueue, setRefreshQueue] = useState(0);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailCanApprove, setDetailCanApprove] = useState(false);
  const [detailIsApproverView, setDetailIsApproverView] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(() =>
    searchParams.get('tab') === 'approval-queue' ? 'approval-queue' : 'my-requests'
  );

  const tabParam = searchParams.get('tab');
  useEffect(() => {
    setActiveTab(tabParam === 'approval-queue' ? 'approval-queue' : 'my-requests');
  }, [tabParam]);

  useEffect(() => {
    const timer = setTimeout(() => setAuthPhase('checking'), 350);
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => { if (!r.ok) { router.push('/'); return null; } return r.json(); })
      .then((u: UserData | null) => {
        clearTimeout(timer);
        if (!u) { router.push('/'); return; }
        setUser(u);
        setAuthPhase('done');
      })
      .catch(() => { clearTimeout(timer); router.push('/'); });
    return () => clearTimeout(timer);
  }, [router]);

  useEffect(() => {
    if (authPhase !== 'done' || !user) return;
    fetch('/api/leave/balances', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((data: LeaveBalance[]) => setBalances(data))
      .catch(() => {});
  }, [authPhase, user]);

  function openDetail(id: number, canApprove: boolean, isApproverView = false) {
    setDetailId(id);
    setDetailCanApprove(canApprove);
    setDetailIsApproverView(isApproverView);
    setDetailOpen(true);
  }

  if (authPhase === 'spinner') {
    return (
      <div className="flex h-48 items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#2845D6]" />
      </div>
    );
  }

  if (authPhase === 'checking') {
    return (
      <div className="flex h-48 items-center justify-center">
        <TextShimmer className="text-sm text-muted-foreground" duration={1.4}>
          Checking permissions…
        </TextShimmer>
      </div>
    );
  }

  if (!user) return null;

  const isApprover = user.is_approver || user.admin || user.hr || user.clinic || user.iad;
  const isApprovalPage = isApprover && activeTab === 'approval-queue';

  const pageHeaderTitle = isApprovalPage
    ? 'Leave Approvals'
    : 'Leave Requests';
  const pageHeaderDescription = isApprovalPage
    ? 'Review and process leave requests assigned to you.'
    : 'Manage and track your leave applications.';

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 w-full">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{pageHeaderTitle}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pageHeaderDescription}
          </p>
        </div>
      </div>

      {isApprovalPage ? (
        <ApprovalQueueTab user={user} refreshKey={refreshQueue} onViewDetail={openDetail} />
      ) : (
        <MyRequestsTab
          user={user}
          balances={balances}
          refreshKey={refreshRequests}
          onApply={() => setApplyOpen(true)}
          onViewDetail={openDetail}
          onEdit={id => { setEditId(id); setEditOpen(true); }}
        />
      )}

      {applyOpen && (
        <ApplyLeaveModal
          onClose={() => setApplyOpen(false)}
          onCreated={() => {
            setApplyOpen(false);
            setRefreshRequests(prev => prev + 1);
          }}
          balances={balances}
        />
      )}

      {detailOpen && detailId !== null && (
        <LeaveDetailModal
          leaveId={detailId}
          onClose={() => setDetailOpen(false)}
          canApprove={detailCanApprove}
          isApproverView={detailIsApproverView}
          onUpdated={() => {
            setRefreshRequests(prev => prev + 1);
            if (detailIsApproverView) setRefreshQueue(prev => prev + 1);
          }}
          onCancelled={() => {
            setDetailOpen(false);
            setRefreshRequests(prev => prev + 1);
          }}
        />
      )}

      {editOpen && editId !== null && (
        <EditLeaveModal
          leaveId={editId}
          onClose={() => setEditOpen(false)}
          onUpdated={() => {
            setEditOpen(false);
            setRefreshRequests(prev => prev + 1);
          }}
          balances={balances}
        />
      )}
    </div>
  );
}

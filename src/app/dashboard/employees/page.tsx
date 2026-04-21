'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import type { ChartCategory } from '@/components/ui/multi-series-chart';
import { AdminChartCard } from '@/components/ui/admin-chart-card';
import type { ChartViewType, ChartDisplayType } from '@/components/ui/admin-chart-card';
import { AdminTableSection } from '@/components/ui/admin-table-section';
import type { DataTableColumn } from '@/components/ui/data-table';
import { StatusPill } from '@/components/ui/status-pill';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { FileUploadDropzone } from '@/components/ui/file-upload-dropzone';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from '@/components/ui/toast';
import { getCsrfToken } from '@/lib/csrf';
import { cn } from '@/lib/utils';
import { styledXlsx } from '@/lib/xlsx-export';
import { useDebounce } from '@/hooks/use-debounce';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTab, TabsPanel } from '@/components/ui/tabs';
import {
  MoreHorizontal,
  Upload,
  Download,
  Eye,
  UserX,
  UserCheck,
  Lock,
  Unlock,
  X,
  Users2,
  Search,
  ChevronUp,
  ChevronDown,
  ListFilter,
  KeyRound,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserData {
  id:        number;
  idnumber:  string;
  firstname: string | null;
  lastname:  string | null;
  admin:     boolean;
  hr:        boolean;
}

interface EmployeeRow {
  id:                   number;
  idnumber:             string;
  firstname:            string | null;
  lastname:             string | null;
  email:                string | null;
  avatar:               string | null;
  active:               boolean;
  locked:               boolean;
  date_joined:          string;
  department_id:        number | null;
  department_name:      string | null;
  line_id:              number | null;
  line_name:            string | null;
  employment_type_id:   number | null;
  employment_type_name: string | null;
  date_hired:           string | null;
}

interface EmployeeListResponse {
  results:   EmployeeRow[];
  count:     number;
  num_pages: number;
  page:      number;
}

interface ChartDataPoint {
  label:        string;
  total:        number;
  ojt:          number;
  regular:      number;
  probationary: number;
  female:       number;
  male:         number;
  [key: string]: number | string;
}

interface ChartResponse {
  view: string;
  data: ChartDataPoint[];
}

interface FilterOptions {
  departments: { id: number; name: string }[];
  lines:       { id: number; name: string; department_id: number }[];
}

type StatusAction = 'activate' | 'deactivate' | 'lock' | 'unlock';

interface ActionModalState {
  open:     boolean;
  action:   StatusAction | null;
  employee: EmployeeRow | null;
}

interface ResetPasswordModalState {
  open:     boolean;
  employee: EmployeeRow | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

const CHART_CATEGORIES: ChartCategory[] = [
  { key: 'total',        label: 'Total',        color: '#2845D6', gradId: 'grad_emp_total', lightColor: '#5B78E8' },
  { key: 'ojt',          label: 'OJT',          color: '#10B981', gradId: 'grad_emp_ojt',   lightColor: '#34D399' },
  { key: 'regular',      label: 'Regular',      color: '#F59E0B', gradId: 'grad_emp_reg',   lightColor: '#FCD34D' },
  { key: 'probationary', label: 'Probationary', color: '#8B5CF6', gradId: 'grad_emp_prob',  lightColor: '#A78BFA' },
  { key: 'female',       label: 'Female',       color: '#EC4899', gradId: 'grad_emp_fem',   lightColor: '#F472B6' },
  { key: 'male',         label: 'Male',         color: '#06B6D4', gradId: 'grad_emp_male',  lightColor: '#22D3EE' },
];

const STATUS_FILTER_OPTIONS = [
  { value: 'active',   label: 'Active'   },
  { value: 'inactive', label: 'Inactive' },
  { value: 'locked',   label: 'Locked'   },
  { value: 'unlocked', label: 'Unlocked' },
];

const IMPORT_COLS = [
  { col: 'A  —  ID Number',       note: undefined },
  { col: 'B  —  First Name',      note: undefined },
  { col: 'C  —  Last Name',       note: undefined },
  { col: 'D  —  Email',           note: undefined },
  { col: 'E  —  Department',      note: 'Must match an existing Department name exactly.' },
  { col: 'F  —  Line',            note: 'Must match an existing Line name exactly (if provided).' },
  { col: 'G  —  Employment Type', note: 'Must match an existing Employment Type name exactly (if provided).' },
  { col: 'H  —  Date Hired',      note: 'Format: MM/DD/YYYY (e.g. 01/15/2025) (if provided).' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function getCurrentWeekStart(): string {
  const now = new Date();
  const dow = now.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff);
  return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
}

function getWeekStartOptions(fyStartYear: number): { label: string; value: string }[] {
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

function getMonthOptions(fyStartYear: number): { value: string; label: string }[] {
  const MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return [7,8,9,10,11,12,1,2,3,4,5,6].map(m => {
    const year = m >= 7 ? fyStartYear : fyStartYear + 1;
    return { value: `${year}-${m}`, label: `${MN[m - 1]} ${year}` };
  });
}

function currentFYStart(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

function scheduleDownload(blob: Blob, filename: string) {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
}

// ── FilterContentList ─────────────────────────────────────────────────────────
// Renders the inner content of a DataTable filter popup.

function FilterContentList({
  options,
  selected,
  onSelect,
}: {
  options:  { value: string | number; label: string }[];
  selected: string | number | null;
  onSelect: (v: string | number | null) => void;
}) {
  return (
    <div className="space-y-0.5 max-h-56 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          'w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors',
          selected === null
            ? 'bg-[#2845D6]/10 font-medium text-[#2845D6]'
            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]',
        )}
      >
        All
      </button>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onSelect(o.value)}
          className={cn(
            'w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors',
            selected === o.value
              ? 'bg-[#2845D6]/10 font-medium text-[#2845D6]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── FilterTextInput ──────────────────────────────────────────────────────────
// Text-based column filter for ID Number or similar free-text column popovers.

function FilterTextInput({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value:    string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="p-1 space-y-1">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[#2845D6]/30"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors"
        >
          <X size={10} />
          Clear
        </button>
      )}
    </div>
  );
}

// ── Multi-select filter popover (ID Number) ────────────────────────────────────

function MultiSelectFilterPopover({
  label,
  options,
  selected,
  onChange,
  withSearch = false,
  disabled = false,
}: {
  label:       string;
  options:     { value: string; label: string }[];
  selected:    string[];
  onChange:    (vals: string[]) => void;
  withSearch?: boolean;
  disabled?:   boolean;
}) {
  const [open,        setOpen       ] = useState(false);
  const [innerSearch, setInnerSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp,   setCanScrollUp  ] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  function checkScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 4);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }

  useEffect(() => {
    if (open) setTimeout(checkScroll, 0);
  }, [open, options]);

  const filtered = withSearch && innerSearch
    ? options.filter(o => o.label.toLowerCase().includes(innerSearch.toLowerCase()))
    : options;

  function toggle(val: string) {
    if (selected.includes(val)) onChange(selected.filter(v => v !== val));
    else onChange([...selected, val]);
  }

  const isActive = selected.length > 0;

  return (
    <Popover open={disabled ? false : open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={disabled ? undefined : `Filter by ${label}`}
          disabled={disabled}
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors',
            disabled
              ? 'text-[var(--color-text-muted)] opacity-20 cursor-default'
              : isActive
                ? 'text-[#2845D6]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]',
          )}
        >
          <ListFilter size={10} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-2">
        {withSearch && (
          <input
            type="text"
            placeholder={`Search ${label}…`}
            value={innerSearch}
            onChange={e => { setInnerSearch(e.target.value); setTimeout(checkScroll, 0); }}
            className="mb-1.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[#2845D6]/40"
          />
        )}
        {isActive && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mb-1 w-full rounded-md px-2 py-1 text-left text-[10px] font-medium text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
          >
            Clear all ({selected.length})
          </button>
        )}
        <div className="relative">
          {canScrollUp && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center bg-gradient-to-b from-[var(--color-bg-elevated)] pb-3 pt-0.5">
              <ChevronUp size={12} className="text-[var(--color-text-muted)]" />
            </div>
          )}
          <div
            ref={scrollRef}
            onScroll={checkScroll}
            className="max-h-52 space-y-0.5 overflow-y-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {filtered.length === 0 ? (
              <p className="px-2 py-2 text-xs text-[var(--color-text-muted)]">No options.</p>
            ) : (
              filtered.map(o => {
                const checked = selected.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                      checked
                        ? 'bg-[#2845D6]/10 font-medium text-[#2845D6]'
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]',
                    )}
                  >
                    <span className={cn(
                      'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors',
                      checked
                        ? 'border-[#2845D6] bg-[#2845D6] text-white'
                        : 'border-[var(--color-border)]',
                    )}>
                      {checked && (
                        <svg viewBox="0 0 10 8" className="h-2 w-2 fill-current" aria-hidden="true">
                          <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{o.label}</span>
                  </button>
                );
              })
            )}
          </div>
          {canScrollDown && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center bg-gradient-to-t from-[var(--color-bg-elevated)] pb-0.5 pt-3">
              <ChevronDown size={12} className="text-[var(--color-text-muted)]" />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── ActionCell ─────────────────────────────────────────────────────────────────

function ActionCell({
  row,
  onView,
  onAction,
  onResetPassword,
}: {
  row:             EmployeeRow;
  onView:          () => void;
  onAction:        (action: StatusAction, row: EmployeeRow) => void;
  onResetPassword: (row: EmployeeRow) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onView}
        title="View employee profile"
        aria-label="View employee profile"
        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
      >
        <Eye size={13} />
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <MoreHorizontal size={14} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-48 p-1">
          <div className="space-y-0.5">
            {row.active ? (
              <button
                type="button"
                onClick={() => { onAction('deactivate', row); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-600 transition-colors"
              >
                <UserX size={13} />
                Deactivate
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { onAction('activate', row); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] hover:bg-green-50 dark:hover:bg-green-950/20 hover:text-green-600 transition-colors"
              >
                <UserCheck size={13} />
                Activate
              </button>
            )}
            <div className="my-1 h-px bg-[var(--color-border)]" />
            {row.locked ? (
              <button
                type="button"
                onClick={() => { onAction('unlock', row); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <Unlock size={13} />
                Unlock
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { onAction('lock', row); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] hover:bg-amber-50 dark:hover:bg-amber-950/20 hover:text-amber-600 transition-colors"
              >
                <Lock size={13} />
                Lock
              </button>
            )}
            <div className="my-1 h-px bg-[var(--color-border)]" />
            <button
              type="button"
              onClick={() => { onResetPassword(row); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] hover:bg-amber-50 dark:hover:bg-amber-950/20 hover:text-amber-600 transition-colors"
            >
              <KeyRound size={13} />
              Reset Password
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ── ExportModal ───────────────────────────────────────────────────────────────

type ExportType = 'personal_info' | 'work_info' | 'summary' | 'all';

function ExportModal({
  onClose,
  fyOptions,
  monthOptions,
  weekOptions,
}: {
  onClose:      () => void;
  fyOptions:    number[];
  monthOptions: { value: string; label: string }[];
  weekOptions:  { value: string; label: string }[];
}) {
  const [exportType,    setExportType   ] = useState<ExportType | ''>('');
  const [viewType,      setViewType     ] = useState<ChartViewType>('fiscal');
  const [tabDirection,  setTabDirection ] = useState<1 | -1>(1);
  const [fyYear,        setFyYear       ] = useState(() => currentFYStart());
  const [monthYear,     setMonthYear    ] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}`;
  });
  const [weekStart,     setWeekStart    ] = useState(getCurrentWeekStart());
  const [loading,       setLoading      ] = useState(false);

  const isSummary = exportType === 'summary';
  const viewOrder: ChartViewType[] = ['fiscal', 'monthly', 'weekly'];

  const handleViewChange = (nextView: string) => {
    const next = nextView as ChartViewType;
    const currentIndex = viewOrder.indexOf(viewType);
    const nextIndex = viewOrder.indexOf(next);
    setTabDirection(nextIndex >= currentIndex ? 1 : -1);
    setViewType(next);
  };

  async function handleExport() {
    if (!exportType) return;
    setLoading(true);

    const body: Record<string, string | number> = { type: exportType };
    if (isSummary) {
      body.view = viewType;
      if (viewType === 'fiscal') {
        body.year = fyYear;
      } else if (viewType === 'monthly') {
        const [y, m] = monthYear.split('-');
        body.year  = Number(y);
        body.month = Number(m);
      } else {
        body.week_start = weekStart;
      }
    }

    try {
      const res = await fetch('/api/auth/admin/employees/export', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body:        JSON.stringify(body),
      });

      if (res.ok) {
        const blob = await res.blob();
        const disposition = res.headers.get('Content-Disposition') ?? '';
        const match       = disposition.match(/filename="?([^"]+)"?/);
        const filename    = match ? match[1] : `employees_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
        scheduleDownload(blob, filename);
        toast.success('Export downloaded.');
        onClose();
      } else {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        toast.error(err.detail ?? 'Export failed.');
      }
    } catch {
      toast.error('Network error during export.');
    } finally {
      setLoading(false);
    }
  }

  const EXPORT_TYPE_LABELS: Record<ExportType, string> = {
    personal_info: 'Personal Information',
    work_info:     'Work Information',
    summary:       'Summary',
    all:           'All',
  };

  const VIEW_LABELS: Record<ChartViewType, string> = {
    fiscal:  'Fiscal Year',
    monthly: 'Monthly',
    weekly:  'Weekly',
  };

  const tabTransition = { duration: 0.24, ease: [0.22, 1, 0.36, 1] as unknown as any };
  const panelVariants = {
    hidden: (direction: number) => ({ opacity: 0, x: direction > 0 ? 24 : -24 }),
    visible: { opacity: 1, x: 0 },
    exit: (direction: number) => ({ opacity: 0, x: direction > 0 ? -24 : 24 }),
  };
  const fieldVariants = {
    hidden: { opacity: 0, y: -8 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={loading ? undefined : onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={{    opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Export Employees</h2>
          <button type="button" onClick={onClose} disabled={loading}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-40">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Export type */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
              Export Type
            </label>
            <Select value={exportType} onValueChange={v => setExportType(v as ExportType)}>
              <SelectTrigger className="w-full h-9 text-sm">
                <SelectValue placeholder="Select export type…" />
              </SelectTrigger>
              <SelectContent>
                {(['personal_info', 'work_info', 'summary', 'all'] as ExportType[]).map(t => (
                  <SelectItem key={t} value={t}>{EXPORT_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Summary date filter — shown only when Summary is selected */}
          <AnimatePresence mode="wait">
            {isSummary && (
              <motion.div
                key="summary-filters"
                initial={{ opacity: 0, y: -12, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -12, height: 0 }}
                transition={tabTransition}
                className="overflow-hidden space-y-4"
              >
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                    Date Range
                  </label>
                  <Tabs value={viewType} onValueChange={handleViewChange}>
                    <TabsList className="w-full flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)]">
                      {(['fiscal', 'monthly', 'weekly'] as ChartViewType[]).map(v => (
                        <TabsTab
                          key={v}
                          value={v}
                          className={cn(
                            'flex-1 rounded-md py-1 text-[11px] font-semibold transition-colors',
                            viewType === v
                              ? 'bg-white text-[var(--color-text-primary)] shadow-sm'
                              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
                          )}
                        >
                          {VIEW_LABELS[v]}
                        </TabsTab>
                      ))}
                    </TabsList>

                    <div className="relative overflow-hidden pt-3">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={viewType}
                          variants={panelVariants}
                          custom={tabDirection}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          transition={tabTransition}
                          className="space-y-1.5"
                        >
                          <motion.div
                            key={`field-${viewType}`}
                            variants={fieldVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] as unknown as any }}
                            className="space-y-1.5"
                          >
                            {viewType === 'fiscal' && (
                              <div className="space-y-1.5">
                                <label className="block text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                                  Fiscal Year Start
                                </label>
                                <Select value={String(fyYear)} onValueChange={v => setFyYear(Number(v))}>
                                  <SelectTrigger className="w-full h-9 text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {fyOptions.map(y => (
                                      <SelectItem key={y} value={String(y)}>
                                        FY {y}/{y + 1}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}

                            {viewType === 'monthly' && (
                              <div className="space-y-1.5">
                                <label className="block text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                                  Month
                                </label>
                                <Select value={monthYear} onValueChange={setMonthYear}>
                                  <SelectTrigger className="w-full h-9 text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {monthOptions.map(o => (
                                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}

                            {viewType === 'weekly' && (
                              <div className="space-y-1.5">
                                <label className="block text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                                  Week
                                </label>
                                <Select value={weekStart} onValueChange={setWeekStart}>
                                  <SelectTrigger className="w-full h-9 text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {weekOptions.map(o => (
                                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </motion.div>
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </Tabs>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Description */}
          {exportType && (
            <p className="text-xs text-[var(--color-text-muted)]">
              {exportType === 'personal_info' && 'Exports Personal Information and Emergency Contact sheets for all active employees.'}
              {exportType === 'work_info'     && 'Exports Work Information sheet for all active employees.'}
              {exportType === 'summary'       && 'Exports a Summary sheet with 3D charts and snapshot data for the selected period.'}
              {exportType === 'all'           && 'Exports Personal Information, Emergency Contact, and Work Information sheets for all active employees.'}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={loading}
            className="h-9 px-5 rounded-lg text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!exportType || loading}
            className="h-9 px-5 rounded-lg text-sm font-medium bg-[#2845D6] text-white hover:bg-[#1e35b5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {loading
              ? <TextShimmer className="text-sm [--base-color:rgba(255,255,255,0.55)] [--base-gradient-color:#ffffff]" duration={1.2}>Exporting…</TextShimmer>
              : (<><Download size={14} />Export Report</>)
            }
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── ImportModal ─────────────────────────────────────────────────────────────────

function ImportModal({
  onClose,
  onSuccess,
  filterOptions,
  employmentTypes,
}: {
  onClose:          () => void;
  onSuccess:        () => void;
  filterOptions:    FilterOptions | null;
  employmentTypes:  { id: number; name: string }[];
}) {
  const [files,    setFiles   ] = useState<File[]>([]);
  const [phase,    setPhase   ] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const busy = phase === 'uploading';

  function downloadEmployeeImportTemplate() {
    const headers = [
      'ID Number',
      'First Name',
      'Last Name',
      'Email',
      'Department',
      'Line',
      'Employment Type',
      'Date Hired',
    ];

    const departmentNames = filterOptions?.departments.map(d => d.name) ?? [];
    const lineNames = filterOptions?.lines.map(l => l.name) ?? [];
    const employmentTypeNames = employmentTypes.map(e => e.name);

    const validationLists = [
      { sqref: 'E2:E1000', list: departmentNames },
      { sqref: 'F2:F1000', list: lineNames },
      { sqref: 'G2:G1000', list: employmentTypeNames },
    ].filter(item => item.list.length > 0);

    const blob = styledXlsx(headers, [], undefined, validationLists);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'employee_import_template.xlsx';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  }

  async function handleUpload() {
    if (files.length === 0 || busy) return;
    setPhase('uploading');
    setProgress(0);

    const fd = new FormData();
    fd.append('file', files[0]);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/auth/admin/employees/import');
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-CSRFToken', getCsrfToken());
    xhr.responseType = 'blob';

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      setProgress(100);
      if (xhr.status >= 200 && xhr.status < 300) {
        // Blob response on success — parse as text then JSON
        (xhr.response as Blob).text().then((text) => {
          try {
            const data = JSON.parse(text) as { imported: number };
            toast.success(`${data.imported} account${data.imported !== 1 ? 's' : ''} imported.`);
          } catch {
            toast.success('Import completed.');
          }
        }).catch(() => toast.success('Import completed.'));
        setPhase('done');
        onSuccess();
      } else if (xhr.status === 422) {
        // Error report — auto-download the xlsx
        const blob = xhr.response as Blob;
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = 'import_errors.xlsx';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
        toast.error('Validation failed — error report downloaded.');
        setPhase('error');
      } else {
        (xhr.response as Blob).text().then((text) => {
          try {
            const err = JSON.parse(text) as { detail?: string };
            toast.error(err.detail ?? 'Import failed.');
          } catch {
            toast.error('Import failed.');
          }
        }).catch(() => toast.error('Import failed.'));
        setPhase('error');
      }
    };

    xhr.onerror = () => {
      toast.error('Network error during import.');
      setPhase('error');
    };

    xhr.send(fd);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{
          default: { type: 'spring', stiffness: 320, damping: 28 },
          layout:  { duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] },
        }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Import Employees</h2>
          <button type="button" onClick={onClose} disabled={busy}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-40">
            <X size={15} />
          </button>
        </div>

        {/* Instructions */}
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border-b border-emerald-200/70 dark:border-emerald-900/40 px-5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">Bulk create employee accounts</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                Upload an XLSX, XLS, or CSV file with one row per employee. Row 1 must be the header.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadEmployeeImportTemplate}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-emerald-300 dark:border-emerald-700 bg-transparent dark:bg-emerald-900/30 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-800/40 transition-colors"
            >
              <Download size={12} />
              Download Template
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <FileUploadDropzone
            files={files}
            onFilesChange={setFiles}
            accept=".xlsx,.xls,.csv"
            multiple={false}
            label="Click to select or drag & drop"
            helperText="XLSX, XLS, CSV format, up to 10 MB"
            disabled={busy}
          />

          {/* Column spec */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Columns (row 1 = header, all required)
            </p>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Passwords are automatically set to <span className="font-mono">Repco_&#123;ID Number&#125;</span>.
            </p>
            <ul className="space-y-1.5">
              {IMPORT_COLS.map(c => (
                <li key={c.col} className="flex items-start gap-2 text-xs text-[var(--color-text-primary)]">
                  <span className="mt-0.5 shrink-0 rounded px-1 py-0.5 text-[10px] bg-[#2845D6]/10 text-[#2845D6]">
                    REQ
                  </span>
                  <span>
                    <span className="font-mono">{c.col}</span>
                    {c.note && <span className="ml-1 text-[var(--color-text-muted)]">— {c.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Progress bar */}
        <AnimatePresence>
          {phase === 'uploading' && (
            <motion.div
              key="prog"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="overflow-hidden border-t border-[var(--color-border)]"
            >
              <div className="px-6 py-3 space-y-1.5">
                <p className="text-[11px] font-medium text-[var(--color-text-muted)]">Uploading {progress}%</p>
                <div className="h-1.5 w-full rounded-full bg-[var(--color-border)] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-[#2845D6]"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy}
            className="h-9 px-5 rounded-lg text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={files.length === 0 || busy}
            className="h-9 px-5 rounded-lg text-sm font-medium bg-[#2845D6] text-white hover:bg-[#1e35b5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {busy
              ? (
                <TextShimmer
                  className="text-sm [--base-color:rgba(255,255,255,0.55)] [--base-gradient-color:#ffffff] dark:[--base-color:rgba(255,255,255,0.55)] dark:[--base-gradient-color:#ffffff]"
                  duration={1.2}
                >
                  Uploading…
                </TextShimmer>
              )
              : (
                <>
                  <Upload size={15} />
                  Import
                </>
              )
            }
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function EmployeesAdminPage() {
  const router = useRouter();

  // ── Auth phase ─────────────────────────────────────────────────────────────
  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');
  const authTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    authTimerRef.current = setTimeout(() => setAuthPhase('checking'), 350);

    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: UserData | null) => {
        if (authTimerRef.current) clearTimeout(authTimerRef.current);
        if (!data || (!data.admin && !data.hr)) {
          router.replace('/dashboard');
          return;
        }
        setAuthPhase('done');
      })
      .catch(() => {
        if (authTimerRef.current) clearTimeout(authTimerRef.current);
        router.replace('/');
      });

    return () => {
      if (authTimerRef.current) clearTimeout(authTimerRef.current);
    };
  }, [router]);

  // ── Chart state ─────────────────────────────────────────────────────────────
  const [viewType,           setViewType          ] = useState<ChartViewType>('fiscal');
  const [chartType,          setChartType         ] = useState<ChartDisplayType>('bar');
  const [fyStart,            setFyStart           ] = useState(currentFYStart());
  const [monthYear,          setMonthYear         ] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}`;
  });
  const [weekStart,          setWeekStart         ] = useState(getCurrentWeekStart());
  const [chartData,          setChartData         ] = useState<ChartDataPoint[]>([]);
  const [chartLoading,       setChartLoading      ] = useState(true);
  const [chartTransitioning, setChartTransitioning] = useState(false);
  const chartInitialized = useRef(false);

  // ── Table state ─────────────────────────────────────────────────────────────
  const [employees,          setEmployees         ] = useState<EmployeeRow[]>([]);
  const [totalCount,         setTotalCount        ] = useState(0);
  const [totalPages,         setTotalPages        ] = useState(1);
  const [page,               setPage              ] = useState(1);
  const [tableLoading,       setTableLoading      ] = useState(true);
  const [tableTransitioning, setTableTransitioning] = useState(false);
  const [search,             setSearch            ] = useState('');
  const debouncedSearch = useDebounce(search, 350);
  const [sortField,          setSortField         ] = useState('lastname');
  const [sortDir,            setSortDir           ] = useState<'asc' | 'desc'>('asc');
  // shouldSkeletonRef: when true, next fetch shows full skeleton; false shows transitioning overlay.
  // Starts true (initial load). Reset to true on any search/filter change.
  const shouldSkeletonRef = useRef(true);

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [employmentTypes, setEmploymentTypes] = useState<{ id: number; name: string }[]>([]);
  const [deptFilter,    setDeptFilter   ] = useState<number | null>(null);
  const [lineFilter,    setLineFilter   ] = useState<number | null>(null);
  const [statusFilter,  setStatusFilter ] = useState<string | null>(null);

  // ── Action modal ─────────────────────────────────────────────────────────────
  const [actionModal,   setActionModal  ] = useState<ActionModalState>({ open: false, action: null, employee: null });
  const [actionLoading, setActionLoading] = useState(false);

  // ── Import modal ─────────────────────────────────────────────────────────────
  const [showImport, setShowImport] = useState(false);

  // ── Export modal ──────────────────────────────────────────────────────────────
  const [showExport, setShowExport] = useState(false);

  // ── Reset Password modal ──────────────────────────────────────────────────────
  const [resetModal,        setResetModal       ] = useState<ResetPasswordModalState>({ open: false, employee: null });
  const [resetLoading,      setResetLoading     ] = useState(false);

  // ── Chart fetch ──────────────────────────────────────────────────────────────
  const fetchChart = useCallback(async () => {
    if (authPhase !== 'done') return;
    if (!chartInitialized.current) {
      setChartLoading(true);
    } else {
      setChartTransitioning(true);
    }
    try {
      let url = '/api/auth/admin/employees/chart?view=' + viewType;
      if (viewType === 'fiscal') {
        url += `&year=${fyStart}`;
      } else if (viewType === 'monthly') {
        const [y, m] = monthYear.split('-');
        url += `&year=${y}&month=${m}`;
      } else {
        url += `&week_start=${weekStart}`;
      }
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data: ChartResponse = await res.json();
        setChartData(data.data);
      }
    } finally {
      chartInitialized.current = true;
      setChartLoading(false);
      setChartTransitioning(false);
    }
  }, [authPhase, viewType, fyStart, monthYear, weekStart]);

  useEffect(() => { fetchChart(); }, [fetchChart]);

  // ── Filter options fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    if (authPhase !== 'done') return;

    fetch('/api/auth/admin/employees/filters', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: FilterOptions | null) => { if (d) setFilterOptions(d); })
      .catch(() => {});

    fetch('/api/general-settings/employment-types', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { id: number; name: string }[] | null) => { if (d) setEmploymentTypes(d); })
      .catch(() => {});
  }, [authPhase]);

  // ── Employee list fetch ──────────────────────────────────────────────────────
  const fetchEmployees = useCallback(async () => {
    if (authPhase !== 'done') return;

    const useSkeleton = shouldSkeletonRef.current;
    shouldSkeletonRef.current = false;
    if (useSkeleton) {
      setTableLoading(true);
      setTableTransitioning(false);
    } else {
      setTableTransitioning(true);
    }

    try {
      const params = new URLSearchParams({ page: String(page), sort: sortField, dir: sortDir });
      if (debouncedSearch)       params.set('q',             debouncedSearch);
      if (deptFilter !== null)   params.set('department_id', String(deptFilter));
      if (lineFilter !== null)   params.set('line_id',       String(lineFilter));
      if (statusFilter)          params.set('status',        statusFilter);

      const [res] = await Promise.all([
        fetch(`/api/auth/admin/employees?${params}`, { credentials: 'include' }),
        new Promise<void>(resolve => setTimeout(resolve, 800)),
      ]);
      if (!res.ok) return;
      const data: EmployeeListResponse = await res.json();
      setEmployees(data.results);
      setTotalCount(data.count);
      setTotalPages(data.num_pages);
    } finally {
      setTableLoading(false);
      setTableTransitioning(false);
    }
  }, [authPhase, page, debouncedSearch, sortField, sortDir, deptFilter, lineFilter, statusFilter]);

  // Mark next fetch as skeleton when search or any filter changes.
  // MUST be declared before the fetchEmployees effect to run first within the same render cycle.
  useEffect(() => {
    shouldSkeletonRef.current = true;
  }, [debouncedSearch, deptFilter, lineFilter, statusFilter]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  // Reset to page 1 on search/filter changes (keep sort/pagination-driven resets separate)
  useEffect(() => { setPage(1); }, [debouncedSearch, deptFilter, lineFilter, statusFilter]);

  // ── Reset password handler ──────────────────────────────────────────────────
  async function confirmResetPassword() {
    if (!resetModal.employee) return;
    setResetLoading(true);
    const idemKey = `reset-pw-${resetModal.employee.id}-${Date.now()}`;
    try {
      const res = await fetch(`/api/auth/admin/employees/${resetModal.employee.id}/reset-password`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'X-CSRFToken': getCsrfToken(), 'X-Idempotency-Key': idemKey },
      });
      if (res.ok) {
        const { lastname, firstname } = resetModal.employee;
        const displayName = [lastname, firstname].filter(Boolean).join(', ') || resetModal.employee.idnumber;
        toast.success(`Password reset to default for ${displayName}.`);
        setResetModal({ open: false, employee: null });
      } else {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        toast.error(err.detail ?? 'Password reset failed.');
      }
    } catch {
      toast.error('Network error during password reset.');
    } finally {
      setResetLoading(false);
    }
  }

  // ── Sort handler ─────────────────────────────────────────────────────────────
  function handleSort(field: string) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setPage(1);
  }

  // ── Status action ────────────────────────────────────────────────────────────
  function openAction(action: StatusAction, employee: EmployeeRow) {
    setActionModal({ open: true, action, employee });
  }

  async function confirmAction() {
    if (!actionModal.action || !actionModal.employee) return;
    setActionLoading(true);
    try {
      const idemKey = `${actionModal.action}-${actionModal.employee.id}-${Date.now()}`;
      const res = await fetch(`/api/auth/admin/employees/${actionModal.employee.id}/status`, {
        method:      'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type':       'application/json',
          'X-CSRFToken':        getCsrfToken(),
          'X-Idempotency-Key':  idemKey,
        },
        body: JSON.stringify({ action: actionModal.action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        toast.error(err.detail ?? 'Action failed.');
        return;
      }
      const updated = await res.json() as { id: number; active: boolean; locked: boolean };
      setEmployees(prev =>
        prev.map(e => e.id === updated.id ? { ...e, active: updated.active, locked: updated.locked } : e),
      );
      const labels: Record<StatusAction, string> = {
        activate:   'Employee activated.',
        deactivate: 'Employee deactivated.',
        lock:       'Account locked.',
        unlock:     'Account unlocked.',
      };
      toast.success(labels[actionModal.action]);
      setActionModal({ open: false, action: null, employee: null });
    } finally {
      setActionLoading(false);
    }
  }

  // ── Export (current page to XLSX) ────────────────────────────────────────────
  function handleExport() {
    if (employees.length === 0) { toast.warning('No data to export.'); return; }
    try {
      const blob = styledXlsx(
        ['ID Number', 'First Name', 'Last Name', 'Department', 'Line', 'Employment Type', 'Date Hired', 'Active', 'Locked'],
        employees.map(e => [
          e.idnumber,
          e.firstname  ?? '',
          e.lastname   ?? '',
          e.department_name      ?? '',
          e.line_name            ?? '',
          e.employment_type_name ?? '',
          e.date_hired           ?? '',
          e.active  ? 'Yes' : 'No',
          e.locked  ? 'Yes' : 'No',
        ]),
        [],
      );
      scheduleDownload(blob, `employees_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Export downloaded.');
    } catch {
      toast.error('Export failed.');
    }
  }

  // ── Derived filter options ────────────────────────────────────────────────────
  const lineOptions = (filterOptions?.lines ?? []).filter(l =>
    deptFilter === null ? true : l.department_id === deptFilter,
  );

  // ── Chart options ────────────────────────────────────────────────────────────
  const fyOptions    = Array.from({ length: 5 }, (_, i) => currentFYStart() - i);
  const monthOptions = getMonthOptions(fyStart);
  const weekOptions  = getWeekStartOptions(fyStart);

  // ── Action modal helpers ──────────────────────────────────────────────────────
  function getActionLabel(): string {
    switch (actionModal.action) {
      case 'activate':   return 'Activate';
      case 'deactivate': return 'Deactivate';
      case 'lock':       return 'Lock Account';
      case 'unlock':     return 'Unlock Account';
      default:           return 'Confirm';
    }
  }

  function getActionMessage(): string {
    if (!actionModal.action || !actionModal.employee) return '';
    const { firstname, lastname, idnumber } = actionModal.employee;
    const name = [firstname, lastname].filter(Boolean).join(' ') || idnumber;
    switch (actionModal.action) {
      case 'activate':   return `Activate the account for ${name}? They will be able to log in.`;
      case 'deactivate': return `Deactivate the account for ${name}? They will not be able to log in until reactivated.`;
      case 'lock':       return `Lock the account for ${name}? They will not be able to log in until unlocked.`;
      case 'unlock':     return `Unlock the account for ${name}? They will be able to log in again.`;
      default:           return '';
    }
  }

  // ── DataTable columns ────────────────────────────────────────────────────────
  const columns: DataTableColumn<EmployeeRow>[] = [
    {
      key:          'idnumber',
      label:        'ID Number',
      sortField:    'idnumber',
      width:        '140px',
      render: row => (
        <span className="text-xs text-[var(--color-text-muted)] font-mono">{row.idnumber}</span>
      ),
    },
    {
      key:       'name',
      label:     'Employee Name',
      sortField: 'lastname',
      width:     '220px',
      render: row => {
        const name = [row.lastname, row.firstname].filter(Boolean).join(', ') || row.idnumber;
        return <span className="text-xs font-medium text-[var(--color-text-primary)]">{name}</span>;
      },
    },
    {
      key:          'department',
      label:        'Department',
      sortField:    'department',
      thClassName:  'hidden sm:table-cell',
      tdClassName:  'hidden sm:table-cell',
      filterContent: (
        <FilterContentList
          options={(filterOptions?.departments ?? []).map(d => ({ value: d.id, label: d.name }))}
          selected={deptFilter}
          onSelect={v => { setDeptFilter(v as number | null); setLineFilter(null); }}
        />
      ),
      filterActive: deptFilter !== null,
      render: row => (
        <span className="text-xs text-[var(--color-text-muted)]">{row.department_name ?? '—'}</span>
      ),
    },
    {
      key:          'line',
      label:        'Line',
      sortField:    'line',
      thClassName:  'hidden lg:table-cell',
      tdClassName:  'hidden lg:table-cell',
      filterContent: (
        <FilterContentList
          options={lineOptions.map(l => ({ value: l.id, label: l.name }))}
          selected={lineFilter}
          onSelect={v => setLineFilter(v as number | null)}
        />
      ),
      filterActive: lineFilter !== null,
      render: row => (
        <span className="text-xs text-[var(--color-text-muted)]">{row.line_name ?? '—'}</span>
      ),
    },

    {
      key:         'employment_type',
      label:       'Type',
      sortField:   'employment_type',
      thClassName: 'hidden xl:table-cell',
      tdClassName: 'hidden xl:table-cell',
      render: row => (
        <span className="text-xs text-[var(--color-text-muted)]">{row.employment_type_name ?? '—'}</span>
      ),
    },
    {
      key:          'status',
      label:        'Status',
      sortField:    'active',
      width:        '140px',
      thClassName:  'max-[480px]:hidden',
      tdClassName:  'max-[480px]:hidden',
      filterContent: (
        <FilterContentList
          options={STATUS_FILTER_OPTIONS}
          selected={statusFilter}
          onSelect={v => setStatusFilter(v as string | null)}
        />
      ),
      filterActive: statusFilter !== null,
      render: row => (
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusPill
            status={row.active ? 'approved' : 'cancelled'}
            label={row.active ? 'Active' : 'Inactive'}
          />
          {row.locked && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400">
              Locked
            </span>
          )}
        </div>
      ),
    },
    {
      key:   'actions',
      label: 'Actions',
      render: row => (
        <ActionCell
          row={row}
          onView={() => router.push(`/dashboard/employees/${row.idnumber}`)}
          onAction={openAction}
          onResetPassword={emp => setResetModal({ open: true, employee: emp })}
        />
      ),
    },
  ];

  // ── Auth loading renders ──────────────────────────────────────────────────────
  if (authPhase === 'spinner') {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#2845D6]" />
      </div>
    );
  }

  if (authPhase === 'checking') {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <TextShimmer className="text-sm" duration={1.4}>Checking permissions…</TextShimmer>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">

        {/* Page header */}
        <div>
          <h1 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2">
            Employees
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Manage employee accounts, statuses, and work information.
          </p>
        </div>

        {/* Chart */}
        <AdminChartCard
          id="employees"
          categories={CHART_CATEGORIES}
          data={chartData}
          loading={chartLoading}
          transitioning={chartTransitioning}
          viewType={viewType}
          onViewTypeChange={setViewType}
          chartType={chartType}
          onChartTypeChange={setChartType}
          fyStart={fyStart}
          onFyStartChange={setFyStart}
          fyOptions={fyOptions}
          monthYear={monthYear}
          onMonthYearChange={setMonthYear}
          monthOptions={monthOptions}
          weekStart={weekStart}
          onWeekStartChange={setWeekStart}
          weekOptions={weekOptions}
        />

        {/* Employee table */}
        <AdminTableSection<EmployeeRow>
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by name or ID number…"
          actions={
            <>
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors"
              >
                <Upload size={14} />
                Import
              </button>
              <button
                type="button"
                onClick={() => setShowExport(true)}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-medium bg-[#2845D6] text-white hover:bg-[#1e35b5] transition-colors"
              >
                <Download size={14} />
                Export
              </button>
            </>
          }
          columns={columns}
          rows={employees}
          rowKey={r => r.id}
          loading={tableLoading}
          transitioning={tableTransitioning}
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          emptyTitle="No employees found"
          emptyDescription={
            search || deptFilter !== null || lineFilter !== null || statusFilter
              ? 'Try adjusting your search or filters.'
              : 'No employee accounts have been created yet.'
          }
          emptyIcons={[Users2, Search, UserX]}
          skeletonRows={10}
          page={page}
          totalPages={totalPages}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
          onPageChange={setPage}
        />

      </div>

      {/* Export modal */}
      <AnimatePresence>
        {showExport && (
          <ExportModal
            onClose={() => setShowExport(false)}
            fyOptions={fyOptions}
            monthOptions={monthOptions}
            weekOptions={weekOptions}
          />
        )}
      </AnimatePresence>

      {/* Import modal */}
      <AnimatePresence>
        {showImport && (
          <ImportModal
            onClose={() => setShowImport(false)}
            onSuccess={() => {
              setShowImport(false);
              shouldSkeletonRef.current = true;
              fetchEmployees();
            }}
            filterOptions={filterOptions}
            employmentTypes={employmentTypes}
          />
        )}
      </AnimatePresence>

      {/* Action confirmation modal */}
      <AnimatePresence>
        {actionModal.open && (
          <ConfirmationModal
            title={getActionLabel()}
            message={getActionMessage()}
            confirmLabel={getActionLabel()}
            confirmVariant={
              actionModal.action === 'activate' || actionModal.action === 'unlock'
                ? 'success'
                : 'danger'
            }
            confirming={actionLoading}
            onConfirm={confirmAction}
            onCancel={() => setActionModal({ open: false, action: null, employee: null })}
          />
        )}
      </AnimatePresence>

      {/* Reset password confirmation modal */}
      <AnimatePresence>
        {resetModal.open && resetModal.employee && (
          <ConfirmationModal
            title="Reset Password"
            message={`Reset password for ${resetModal.employee.firstname} ${resetModal.employee.lastname} (${resetModal.employee.idnumber})? Their new password will be set to the default format: Repco_{ID Number}.`}
            confirmLabel="Reset Password"
            confirmVariant="danger"
            confirming={resetLoading}
            onConfirm={confirmResetPassword}
            onCancel={() => setResetModal({ open: false, employee: null })}
          />
        )}
      </AnimatePresence>
    </>
  );
}

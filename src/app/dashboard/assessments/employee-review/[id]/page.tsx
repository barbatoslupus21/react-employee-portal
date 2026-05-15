'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  Users,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { StatusPill } from '@/components/ui/status-pill';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { EmptyState } from '@/components/ui/interactive-empty-state';
import { AdminTableSection } from '@/components/ui/admin-table-section';
import type { DataTableColumn } from '@/components/ui/data-table';
import { FilterListContent } from '@/components/ui/admin-table-accordion';
import type { FilterOption } from '@/components/ui/admin-table-accordion';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserData {
  id: number;
  idnumber: string;
  firstname: string;
  lastname: string;
  admin: boolean;
  hr: boolean;
}

interface PeriodData {
  id: number;
  title: string;
  fiscal_year: number;
  start_date: string;
  end_date: string;
  status: string;
  frequency: string;
  created_at: string;
}

interface PeriodSummary {
  total_eligible: number;
  submitted: number;
  completed: number;
  completion_rate: number;
}

interface DeptOption {
  id: number;
  name: string;
}

interface EntryRow {
  id: number | null;
  employee_id: number;
  idnumber: string;
  employee_name: string;
  department: string | null;
  status: string;
  submitted_at: string | null;
}

interface PeriodResultsData {
  period: PeriodData;
  summary: PeriodSummary;
  departments: DeptOption[];
  results: EntryRow[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ENTRY_STATUS_META: Record<string, { status: string; label: string }> = {
  not_started:           { status: 'pending',      label: 'Not Started' },
  pending:               { status: 'pending',      label: 'Pending' },
  supervisor_review:     { status: 'routing',      label: 'Supervisor Review' },
  user_confirmation:     { status: 'routing',      label: 'User Confirmation' },
  final_approval:        { status: 'routing',      label: 'Awaiting Final Approval' },
  second_final_approval: { status: 'routing',      label: 'Under Second Review' },
  returned:              { status: 'closed',        label: 'Returned for Revision' },
  completed:             { status: 'approved',      label: 'Completed' },
  disapproved:           { status: 'disapproved',   label: 'Disapproved' },
};

const ALL_STATUS_OPTIONS: FilterOption[] = [
  { value: 'not_started',           label: 'Not Started' },
  { value: 'pending',               label: 'Pending' },
  { value: 'supervisor_review',     label: 'Supervisor Review' },
  { value: 'user_confirmation',     label: 'User Confirmation' },
  { value: 'final_approval',        label: 'Awaiting Final Approval' },
  { value: 'second_final_approval', label: 'Under Second Review' },
  { value: 'returned',              label: 'Returned for Revision' },
  { value: 'completed',             label: 'Completed' },
  { value: 'disapproved',           label: 'Disapproved' },
];

const PERIOD_STATUS_META: Record<string, { status: string; label: string }> = {
  active: { status: 'approved', label: 'Active' },
  closed: { status: 'closed',   label: 'Closed' },
};

const FREQUENCY_LABELS: Record<string, string> = {
  quarterly: 'Quarterly',
  monthly:   'Monthly',
};

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

function formatDatetime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function formatEmployeeName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-lg bg-[var(--color-bg-card)]', className)} />
  );
}

function SummaryCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 space-y-2">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="h-7 w-16" />
          <SkeletonBlock className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

// ── Summary Cards ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)]">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[var(--color-text-primary)] leading-none">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">{sub}</p>}
    </div>
  );
}

// ── Header Skeleton ───────────────────────────────────────────────────────────

function HeaderSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <SkeletonBlock className="h-5 w-64" />
      <SkeletonBlock className="h-3 w-48" />
      <SkeletonBlock className="h-3 w-36" />
    </div>
  );
}

// ── Main Content ──────────────────────────────────────────────────────────────

function PeriodResultsContent({ periodId }: { periodId: number }) {
  const router = useRouter();

  const [period, setPeriod] = useState<PeriodData | null>(null);
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, page_size: 10, total: 0, total_pages: 1 });
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [headerLoading, setHeaderLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [exportPhase, setExportPhase] = useState<'idle' | 'checking' | 'downloading'>('idle');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skeletonRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchResults = useCallback(async (
    p: number, q: string, sf: string, sd: string, dept: string, entryStatus: string,
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        page_size: '10',
        sort: sf,
        dir: sd,
      });
      if (q) params.set('search', q);
      if (dept) params.set('dept', dept);
      if (entryStatus) params.set('entry_status', entryStatus);
      const res = await fetch(
        `/api/employee-eval/admin/periods/${periodId}/results?${params}`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error();
      const data = await res.json() as PeriodResultsData;
      setPeriod(data.period);
      setSummary(data.summary);
      setRows(data.results);
      setPagination(data.pagination);
      if (data.departments?.length) setDepartments(data.departments);
      setHeaderLoading(false);
    } catch {
      toast.error('Could not load evaluation period results.', { title: 'Error' });
    } finally {
      setLoading(false);
    }
  }, [periodId]);

  useEffect(() => {
    fetchResults(1, '', 'name', 'asc', '', '');
  }, [fetchResults]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (skeletonRef.current) clearTimeout(skeletonRef.current);
    };
  }, []);

  const startSkeleton = () => {
    setShowSkeleton(true);
    if (skeletonRef.current) clearTimeout(skeletonRef.current);
    skeletonRef.current = setTimeout(() => setShowSkeleton(false), 1000);
  };

  const triggerFetch = (p: number, q: string, sf: string, sd: string, dept: string, status: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResults(p, q, sf, sd, dept, status), 300);
  };

  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(1);
    startSkeleton();
    triggerFetch(1, v, sortField, sortDir, deptFilter, statusFilter);
  };

  const handleSort = (field: string) => {
    const newDir = field === sortField && sortDir === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDir(newDir);
    setPage(1);
    startSkeleton();
    triggerFetch(1, search, field, newDir, deptFilter, statusFilter);
  };

  const handleDeptFilter = (v: string) => {
    setDeptFilter(v);
    setPage(1);
    startSkeleton();
    triggerFetch(1, search, sortField, sortDir, v, statusFilter);
  };

  const handleStatusFilter = (v: string) => {
    setStatusFilter(v);
    setPage(1);
    startSkeleton();
    triggerFetch(1, search, sortField, sortDir, deptFilter, v);
  };

  const deptOptions: FilterOption[] = departments.map(d => ({ value: String(d.id), label: d.name }));

  const handleExport = async () => {
    if (exportPhase !== 'idle') return;
    setExportPhase('checking');
    try {
      setExportPhase('downloading');
      const res = await fetch(
        `/api/employee-eval/admin/periods/${periodId}/export`,
        { credentials: 'include' },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : `Performance_Evaluation_Report.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'The report could not be generated.';
      toast.error(msg, { title: 'Export Error' });
    } finally {
      setExportPhase('idle');
    }
  };

  const columns: DataTableColumn<EntryRow>[] = [
    {
      key: 'idnumber',
      label: 'ID Number',
      sortField: 'idnumber',
      render: (row: EntryRow) => (
        <span className="text-xs font-normal text-[var(--color-text-secondary)]">{row.idnumber}</span>
      ),
    },
    {
      key: 'employee_name',
      label: 'Employee Name',
      sortField: 'name',
      render: (row: EntryRow) => (
        <span className="text-xs font-normal text-[var(--color-text-secondary)]">{formatEmployeeName(row.employee_name)}</span>
      ),
    },
    {
      key: 'department',
      label: 'Department',
      sortField: 'department',
      thClassName: 'hidden lg:table-cell',
      tdClassName: 'hidden lg:table-cell',
      filterContent: (
        <FilterListContent
          options={deptOptions}
          value={deptFilter}
          onChange={handleDeptFilter}
          allLabel="All Departments"
          clearOnReclick
        />
      ),
      filterActive: !!deptFilter,
      render: (row: EntryRow) => (
        <span className="text-xs font-normal text-[var(--color-text-secondary)]">{row.department ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortField: 'status',
      filterContent: (
        <FilterListContent
          options={ALL_STATUS_OPTIONS}
          value={statusFilter}
          onChange={handleStatusFilter}
          allLabel="All Statuses"
          clearOnReclick
        />
      ),
      filterActive: !!statusFilter,
      render: (row: EntryRow) => {
        const meta = ENTRY_STATUS_META[row.status] ?? { status: 'pending', label: row.status };
        return <StatusPill status={meta.status} label={meta.label} />;
      },
    },
    {
      key: 'submitted_at',
      label: 'Submitted',
      sortField: 'submitted_at',
      thClassName: 'hidden lg:table-cell',
      tdClassName: 'hidden lg:table-cell',
      render: (row: EntryRow) => (
        <span className="text-xs font-normal text-[var(--color-text-secondary)] whitespace-nowrap">
          {row.submitted_at ? formatDatetime(row.submitted_at) : '—'}
        </span>
      ),
    },
    {
      key: 'action',
      label: 'Action',
      headerAlign: 'center',
      thClassName: 'text-center',
      tdClassName: 'text-center flex items-center justify-center',
      render: (row: EntryRow) => (
        row.id === null ? (
          <span className="block text-center text-xs text-[var(--color-text-muted)]">—</span>
        ) : (
          <button
            type="button"
            title="View evaluation"
            onClick={() => router.push(`/dashboard/assessments/employee-review/${periodId}/${row.id}`)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[#2845D6]/10 hover:text-[#2845D6] transition-colors"
          >
            <Eye size={12} />
          </button>
        )
      ),
    },
  ];

  const periodStatusInfo = period
    ? (PERIOD_STATUS_META[period.status] ?? { status: 'pending', label: period.status })
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      {headerLoading ? (
        <HeaderSkeleton />
      ) : period ? (
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-[var(--color-text-primary)] leading-snug">
              {period.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-muted)] mt-1.5">
              <span className="flex items-center gap-1">
                <CalendarDays size={11} />
                {formatDate(period.start_date)} — {formatDate(period.end_date)}
              </span>
              <span>FY {period.fiscal_year}–{period.fiscal_year + 1}</span>
              <span>{FREQUENCY_LABELS[period.frequency] ?? period.frequency}</span>
              {periodStatusInfo && (
                <StatusPill status={periodStatusInfo.status} label={periodStatusInfo.label} />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Summary Cards */}
      {!summary ? (
        <SummaryCardsSkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            label="Total Employees"
            value={String(summary.total_eligible)}
            sub="eligible for this period"
          />
          <SummaryCard
            label="Submitted"
            value={String(summary.submitted)}
            sub={`of ${summary.total_eligible} eligible`}
          />
          <SummaryCard
            label="Completed"
            value={String(summary.completed)}
            sub={`${summary.total_eligible > 0 ? Math.round((summary.completed / summary.total_eligible) * 100) : 0}% of total`}
          />
          <SummaryCard
            label="Completion Rate"
            value={`${summary.completion_rate.toFixed(1)}%`}
            sub={`${summary.completed} of ${summary.total_eligible} completed`}
          />
        </div>
      )}

      {/* Entries Table */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Employee Submissions</h2>
        <AdminTableSection<EntryRow>
          search={search}
          onSearchChange={handleSearch}
          searchPlaceholder="Search by name or ID…"
          actions={
            <button
              type="button"
              disabled={exportPhase !== 'idle'}
              onClick={handleExport}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-normal text-white transition-all',
                'bg-[#2845D6] hover:bg-[#1f38c0] active:scale-95',
                exportPhase !== 'idle' && 'cursor-not-allowed opacity-80',
              )}
            >
              {exportPhase === 'idle' ? (
                <>
                  <Download size={14} />
                  Export Report
                </>
              ) : exportPhase === 'checking' ? (
                <TextShimmer className="text-xs font-semibold [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]" duration={1.2}>
                  Checking Report…
                </TextShimmer>
              ) : (
                <TextShimmer className="text-xs font-semibold [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]" duration={1.2}>
                  Downloading…
                </TextShimmer>
              )}
            </button>
          }
          columns={columns}
          rows={rows}
          rowKey={row => row.employee_id}
          loading={loading || showSkeleton}
          transitioning={false}
          skeletonRows={8}
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          tableClassName="max-[480px]:min-w-[580px]"
          page={page}
          totalPages={pagination.total_pages}
          pageSize={10}
          totalCount={pagination.total}
          onPageChange={p => {
            setPage(p);
            startSkeleton();
            triggerFetch(p, search, sortField, sortDir, deptFilter, statusFilter);
          }}
          emptyTitle="No submissions yet"
          emptyDescription="Employees who have started their evaluation will appear here."
          emptyIcons={[Users, ClipboardList, BarChart2]}
        />
      </section>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EvalPeriodResultsPage() {
  const router = useRouter();
  const params = useParams();
  const periodId = Number(params?.id);
  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');
  const [user, setUser] = useState<UserData | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setAuthPhase('checking'), 350);
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => { if (!r.ok) { router.push('/'); return null; } return r.json(); })
      .then((u: UserData | null) => {
        clearTimeout(timer);
        if (!u) { router.push('/'); return; }
        if (!u.admin && !u.hr) { router.push('/dashboard'); return; }
        setUser(u);
        setAuthPhase('done');
      })
      .catch(() => { clearTimeout(timer); router.push('/'); });
    return () => clearTimeout(timer);
  }, [router]);

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

  if (!user || !periodId) return null;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      <div>
        <button
          onClick={() => router.push('/dashboard/assessments/employee-review')}
          className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors mb-4"
        >
          <ArrowLeft size={13} />
          Back to Evaluation Periods
        </button>
      </div>
      <PeriodResultsContent periodId={periodId} />
    </div>
  );
}

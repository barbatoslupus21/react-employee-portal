'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye,
  ClipboardList,
  Download,
  Stethoscope,
  Ticket,
  FolderOpen,
  Loader,
  CheckCircle,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

import { AdminChartCard, type ChartDisplayType, type ChartViewType } from '@/components/ui/admin-chart-card';
import { AdminTableSection } from '@/components/ui/admin-table-section';
import type { DataTableColumn } from '@/components/ui/data-table';
import { FilterListContent } from '@/components/ui/admin-table-accordion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { RoundedTooltip } from '@/components/ui/rounded-tooltip';
import { StatusPill } from '@/components/ui/status-pill';
import { TextareaWithCharactersLeft } from '@/components/ui/textarea-with-characters-left';
import { TextShimmer } from '@/components/ui/text-shimmer';
import BasicCheckbox from '@/components/ui/checkbox-1';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';

import {
  type MISTicket,
  useAdminDiagnose,
  useAdminMISChart,
  useAdminMISStats,
  useAdminMISTickets,
} from '../_hooks/useMISTicket';

function useRequireMIS() {
  const router = useRouter();
  useEffect(() => {
    const stored = sessionStorage.getItem('mis_user');
    if (stored === 'false') router.replace('/dashboard');
  }, [router]);
}

const STATUS_CHOICES = [
  { value: '', label: 'All Statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const CATEGORY_CHOICES = [
  { value: '', label: 'All Categories' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'software', label: 'Software' },
  { value: 'network', label: 'Network' },
  { value: 'account', label: 'Account / Access' },
  { value: 'printer', label: 'Printer / Scanner' },
  { value: 'email', label: 'Email' },
  { value: 'other', label: 'Other' },
  { value: 'request_for_parts', label: 'Request for Parts' },
];

const STATUS_FILTER_OPTIONS = STATUS_CHOICES.filter((item) => item.value);
const CATEGORY_FILTER_OPTIONS = CATEGORY_CHOICES.filter((item) => item.value);

const TICKET_STATUS_MAP: Record<string, { status: string; label: string }> = {
  OPEN:        { status: 'pending',  label: 'Open' },
  IN_PROGRESS: { status: 'routing',  label: 'In Progress' },
  RESOLVED:    { status: 'approved', label: 'Resolved' },
  CLOSED:      { status: 'closed',   label: 'Closed' },
};

const PAGE_SIZE = 20;

const tableIconButtonCls = 'flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors';

const CHART_CATEGORIES = [
  { key: 'OPEN', label: 'Open', color: '#F59E0B', gradId: 'grad_open', lightColor: '#F59E0B' },
  { key: 'IN_PROGRESS', label: 'In Progress', color: '#F97316', gradId: 'grad_in_progress', lightColor: '#F97316' },
  { key: 'RESOLVED', label: 'Resolved', color: '#22C55E', gradId: 'grad_resolved', lightColor: '#22C55E' },
  { key: 'CLOSED', label: 'Closed', color: '#3B82F6', gradId: 'grad_closed', lightColor: '#3B82F6' },
];

const STATUS_OPTIONS = [
  { value: 'FOR_ASSESSMENT', label: 'For Assessment' },
  { value: 'PARTS_REQUIRED', label: 'Parts Required' },
  { value: 'PENDING_USER_ACTION', label: 'Pending User Action' },
  { value: 'FIXED_MONITORING', label: 'Fixed — Monitoring' },
  { value: 'COMPLETED', label: 'Completed' },
];

const OVERVIEW_PANEL_HEIGHT = 'lg:h-[376px]';

function currentFYStart(): number {
  const now = new Date();
  return now.getMonth() >= 4 ? now.getFullYear() : now.getFullYear() - 1;
}

function getCurrentWeekStart(): string {
  const now = new Date();
  const dow = now.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff);
  return `${mon.getFullYear()}-${mon.getMonth() + 1}-${mon.getDate()}`;
}

function getWeekStartOptions(fyStart: number): { label: string; value: string }[] {
  const opts: { label: string; value: string }[] = [];
  const fyEnd = new Date(fyStart + 1, 3, 30);
  const may1 = new Date(fyStart, 4, 1);
  const dow = may1.getDay();
  const cur = new Date(may1);
  cur.setDate(may1.getDate() - (dow === 0 ? 6 : dow - 1));
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

function getFYMonths(fyStart: number): { value: string; label: string }[] {
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return [5,6,7,8,9,10,11,12,1,2,3,4].map((month) => {
    const year = month >= 5 ? fyStart : fyStart + 1;
    return {
      value: `${year}-${month}`,
      label: `${MONTHS[month - 1]} ${year}`,
    };
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function DetailValue({ label, value, mono, multiline }: { label: string; value?: string | null; mono?: boolean; multiline?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase text-[var(--color-text-muted)]">{label}</p>
      <p className={cn('text-xs text-[var(--color-text-primary)]', mono ? 'text-xs' : '', multiline ? 'whitespace-pre-wrap leading-relaxed' : '')}>
        {value || '—'}
      </p>
    </div>
  );
}

function getChangeLabel(current: number, previous: number, betterWhenLower = false) {
  if (previous <= 0) {
    if (current <= 0) return 'No change vs last month';
    return 'New this month';
  }
  const diff = current - previous;
  const percent = Math.round((Math.abs(diff) / previous) * 100);
  const isPositive = betterWhenLower ? diff <= 0 : diff >= 0;
  const direction = betterWhenLower ? (diff <= 0 ? 'down' : 'up') : (diff >= 0 ? 'up' : 'down');
  return `${percent}% ${direction} vs last month`;
}

function StatCard({
  label,
  value,
  icon: Icon,
  iconClassName,
  change,
  positive,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClassName: string;
  change: string;
  positive: boolean;
}) {
  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="shrink-0 flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="text-xs font-medium">{label}</CardTitle>
        <Icon className={cn('h-4 w-4', iconClassName)} />
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col justify-between gap-3 p-4 pt-0">
        <div className="text-2xl font-bold leading-none">{value}</div>
        <div
          className={cn(
            'flex items-center leading-tight',
            change === 'No change vs last month' ? 'text-[10px]' : 'text-xs',
            positive ? 'text-green-600' : 'text-red-600',
          )}
        >
          {positive ? <ArrowUpRight className="mr-1 h-3 w-3" /> : <ArrowDownRight className="mr-1 h-3 w-3" />}
          <span className='text-[10px]'>{change}</span>
        </div>
      </CardContent>
    </Card>
  );
}

type DiagnoseForm = {
  status: string;
  requires_immediate_action: boolean;
  progress_note: string;
  diagnosis: string;
  action_taken: string;
  possible_reason: string;
  recommendation: string;
};

const EMPTY_DIAGNOSE_FORM: DiagnoseForm = {
  status: 'IN_PROGRESS',
  requires_immediate_action: false,
  progress_note: '',
  diagnosis: '',
  action_taken: '',
  possible_reason: '',
  recommendation: '',
};

function DiagnoseModal({ ticket, onClose }: { ticket: MISTicket; onClose: () => void }) {
  const [form, setForm] = useState<DiagnoseForm>(() => {
    const statusMap: Record<string, string> = {
      OPEN: 'FOR_ASSESSMENT',
      IN_PROGRESS: 'PENDING_USER_ACTION',
      RESOLVED: 'FIXED_MONITORING',
      CLOSED: 'COMPLETED',
    };
    return {
      status: statusMap[ticket.status] ?? 'FOR_ASSESSMENT',
      requires_immediate_action: ticket.diagnosis?.requires_immediate_action ?? false,
      progress_note: ticket.diagnosis?.progress_note ?? '',
      diagnosis: ticket.diagnosis?.diagnosis ?? '',
      action_taken: ticket.diagnosis?.action_taken ?? '',
      possible_reason: ticket.diagnosis?.possible_reason ?? '',
      recommendation: ticket.diagnosis?.recommendation ?? '',
    };
  });
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const diagnose = useAdminDiagnose();

  const statusInvalid = !form.status.trim();
  const diagnosisInvalid = !form.diagnosis.trim();
  const actionTakenInvalid = !form.action_taken.trim();
  const possibleReasonInvalid = !form.possible_reason.trim();
  const canSubmit = Boolean(
    form.status.trim() &&
    form.diagnosis.trim() &&
    form.action_taken.trim() &&
    form.possible_reason.trim(),
  );

  const setField = (key: keyof DiagnoseForm) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!canSubmit || diagnose.isPending || busy) return;

    setBusy(true);
    try {
      await diagnose.mutateAsync({
        pk: ticket.id,
        data: form,
      });
      await new Promise((resolve) => setTimeout(resolve, 600));
      onClose();
    } catch {
      // Error is handled by onError callback (toast.error). Keep modal open.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={true} onOpenChange={(open) => !open && onClose()}>
      <ModalContent className="max-w-lg bg-[var(--color-bg-elevated)]">
        <ModalHeader>
          <ModalTitle>{ticket.diagnosis ? 'Update Diagnosis' : 'Diagnose Ticket'}</ModalTitle>
        </ModalHeader>

        <ModalBody className="px-0 py-0">
          <div className="space-y-4 px-6 pb-4 pt-4">
            <div>
              <div className="flex items-center gap-3">
                <p className="text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap">
                  Ticket Information
                </p>
                <div className="h-px flex-1 bg-[var(--color-border)]" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailValue label="Ticket Number" value={ticket.ticket_number} mono />
              <DetailValue label="Requestor" value={ticket.employee_name} />
              <DetailValue label="Department" value={ticket.department} />
              <DetailValue label="Device" value={ticket.device_display || ticket.device_name} />
              <DetailValue label="Category" value={ticket.category_display} />
              <DetailValue label="Subject" value={ticket.subject} />
            </div>

            <div>
              <p className="text-[11px] font-medium uppercase text-[var(--color-text-muted)]">Problem Description</p>
              <p className="mt-2 text-xs text-[var(--color-text-primary)] whitespace-pre-wrap">{ticket.problem || '—'}</p>
            </div>

            <div>
              <div className="flex items-center gap-3">
                <p className="text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap">
                  Technician Diagnosis
                </p>
                <div className="h-px flex-1 bg-[var(--color-border)]" />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Status Update{statusInvalid && <span className="ml-1 text-red-500">*</span>}
                </label>
                <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}>
                  <SelectTrigger className="mt-2 h-9 w-full text-xs">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="py-1">
                <BasicCheckbox
                  checked={form.requires_immediate_action}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, requires_immediate_action: checked }))}
                  label="Requires Immediate Action"
                />
              </div>

              <TextareaWithCharactersLeft
                label={
                  <span className="flex items-center gap-1">
                    Diagnosis{diagnosisInvalid && <span className="text-red-500">*</span>}
                  </span>
                }
                value={form.diagnosis}
                onChange={(e) => setForm((prev) => ({ ...prev, diagnosis: e.target.value }))}
                maxLength={2000}
                required
                rows={3}
              />

              <TextareaWithCharactersLeft
                label={
                  <span className="flex items-center gap-1">
                    Action Taken{actionTakenInvalid && <span className="text-red-500">*</span>}
                  </span>
                }
                value={form.action_taken}
                onChange={(e) => setForm((prev) => ({ ...prev, action_taken: e.target.value }))}
                maxLength={2000}
                required
                rows={3}
              />

              <TextareaWithCharactersLeft
                label={
                  <span className="flex items-center gap-1">
                    Possible Reason{possibleReasonInvalid && <span className="text-red-500">*</span>}
                  </span>
                }
                value={form.possible_reason}
                onChange={(e) => setForm((prev) => ({ ...prev, possible_reason: e.target.value }))}
                maxLength={2000}
                required
                rows={3}
              />

              <TextareaWithCharactersLeft
                label="Recommendation (optional)"
                value={form.recommendation}
                onChange={(e) => setForm((prev) => ({ ...prev, recommendation: e.target.value }))}
                maxLength={2000}
                rows={2}
              />

              <TextareaWithCharactersLeft
                label="Note (optional)"
                value={form.progress_note}
                onChange={(e) => setForm((prev) => ({ ...prev, progress_note: e.target.value }))}
                maxLength={1000}
                rows={2}
              />
            </form>
          </div>
        </ModalBody>

        <ModalFooter>
          <div className="flex w-full items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy || diagnose.isPending}  className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-normal">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || busy || diagnose.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-normal text-white"
            >
              {(busy || diagnose.isPending) ? (
                <TextShimmer duration={1} className="text-xs font-normal [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">
                  Submitting…
                </TextShimmer>
              ) : (
                <>
                  <Stethoscope className="h-4 w-4" />
                  Submit Diagnosis
                </>
              )}
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function AdminTicketDetailModal({ ticket, onClose, onDiagnose }: { ticket: MISTicket; onClose: () => void; onDiagnose: () => void }) {
  const pill = TICKET_STATUS_MAP[ticket.status] ?? { status: ticket.status, label: ticket.status };

  return (
    <Modal open={true} onOpenChange={(open) => !open && onClose()}>
      <ModalContent className="max-w-lg bg-[var(--color-bg-elevated)]">
        <ModalHeader>
          <ModalTitle>Ticket Details</ModalTitle>
        </ModalHeader>

        <ModalBody className="px-0 py-0">
          <div className="px-6 pb-4 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-[var(--color-text-primary)]">{ticket.ticket_number}</span>
                <StatusPill status={pill.status} label={pill.label} />
              </div>
              <span className="text-xs text-[var(--color-text-muted)]">{fmtDate(ticket.created_at)}</span>
            </div>

            <div className='mt-2'>
              <div className="flex items-center gap-3">
                <p className="text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap">
                  Ticket Details
                </p>
                <div className="h-px flex-1 bg-[var(--color-border)]" />
              </div>
            </div>


            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <DetailValue label="Requestor" value={ticket.employee_name} />
              <DetailValue label="Department" value={ticket.department} />
              <DetailValue label="Device" value={ticket.device_display || ticket.device_name} />
              <DetailValue label="Category" value={ticket.category_display} />
              <DetailValue label="Subject" value={ticket.subject} />
              <DetailValue label="Status" value={ticket.status_display} />
            </div>

            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase text-[var(--color-text-muted)]">Problem Description</p>
              <p className="mt-2 text-xs text-[var(--color-text-primary)] whitespace-pre-wrap">{ticket.problem || '—'}</p>
            </div>

            {ticket.diagnosis && (
              <div className="mt-5">
                <div className='mb-5'>
                  <div className="flex items-center gap-3">
                    <p className="text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap">
                      Technician Diagnosis
                    </p>
                    <div className="h-px flex-1 bg-[var(--color-border)]" />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailValue label="Technician" value={ticket.diagnosis.technician_name} />
                  <DetailValue label="Diagnosed At" value={ticket.diagnosis.diagnosed_at ? fmtDate(ticket.diagnosis.diagnosed_at) : undefined} />
                  <DetailValue label="Progress Note" value={ticket.diagnosis.progress_note} multiline />
                </div>

                <div className="mt-4 space-y-4">
                  <DetailValue label="Diagnosis" value={ticket.diagnosis.diagnosis} multiline />
                  <DetailValue label="Action Taken" value={ticket.diagnosis.action_taken} multiline />
                  <DetailValue label="Possible Reason" value={ticket.diagnosis.possible_reason} multiline />
                  {ticket.diagnosis.recommendation && <DetailValue label="Recommendation" value={ticket.diagnosis.recommendation} multiline />}
                </div>
              </div>
            )}
          </div>
        </ModalBody>

        <ModalFooter>
          <div className="flex w-full items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className='inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-normal'>Close</Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default function MISTicketAdminPage() {
  useRequireMIS();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 350);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [viewType, setViewType] = useState<ChartViewType>('fiscal');
  const [chartType, setChartType] = useState<ChartDisplayType>('bar');
  const [fyStart, setFyStart] = useState<number>(currentFYStart());
  const [monthYear, setMonthYear] = useState<string>(`${new Date().getFullYear()}-${new Date().getMonth() + 1}`);
  const [weekStart, setWeekStart] = useState<string>(getCurrentWeekStart());

  const [detailTicket, setDetailTicket] = useState<MISTicket | null>(null);
  const [diagnoseTicket, setDiagnoseTicket] = useState<MISTicket | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const monthOptions = useMemo(() => getFYMonths(currentFYStart()), []);
  const weekOptions = useMemo(() => getWeekStartOptions(fyStart), [fyStart]);

  const statsQuery = useAdminMISStats();
  const stats = statsQuery.data;

  const chartQuery = useAdminMISChart({
    view: viewType,
    fyStart,
    monthYear,
    weekStart,
  });

  const ticketQuery = useAdminMISTickets({
    search: debouncedSearch,
    status: statusFilter,
    category: categoryFilter,
    page,
    sort_by: sortField,
    sort_dir: sortDir,
  });

  const [tableLoading, setTableLoading] = useState(true);
  const tableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (tableTimerRef.current) clearTimeout(tableTimerRef.current);
    setTableLoading(true);
    tableTimerRef.current = setTimeout(() => setTableLoading(false), 1000);
    return () => {
      if (tableTimerRef.current) clearTimeout(tableTimerRef.current);
    };
  }, [debouncedSearch, statusFilter, categoryFilter, page, sortField, sortDir]);

  const tableTransitioning = ticketQuery.isFetching && !ticketQuery.isLoading;

  const ticketData = ticketQuery.data;
  const rows = ticketData?.results ?? [];
  const totalCount = ticketData?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const chartData = chartQuery.data?.data ?? [];
  const chartTransitioning = chartQuery.isFetching && !chartQuery.isLoading;

  const statusFilterContent = (
    <FilterListContent
      options={STATUS_FILTER_OPTIONS}
      value={statusFilter}
      onChange={(value) => { setStatusFilter(value); setPage(1); }}
      allLabel="All Statuses"
    />
  );

  const categoryFilterContent = (
    <FilterListContent
      options={CATEGORY_FILTER_OPTIONS}
      value={categoryFilter}
      onChange={(value) => { setCategoryFilter(value); setPage(1); }}
      allLabel="All Categories"
    />
  );

  const columns: DataTableColumn<MISTicket>[] = [
    {
      key: 'ticket_number',
      label: 'Ticket #',
      sortField: 'ticket_number',
      render: (ticket) => <span className="text-xs">{ticket.ticket_number}</span>,
    },
    {
      key: 'requestor',
      label: 'Requestor',
      sortField: 'employee_name',
      render: (ticket) => <span className='text-xs'>{ticket.employee_name}</span>,
    },
    {
      key: 'department',
      label: 'Department',
      sortField: 'department',
      render: (ticket) => <span className="text-xs text-[var(--color-text-secondary)]">{ticket.department || '—'}</span>,
    },
    {
      key: 'device',
      label: 'Device',
      sortField: 'device_name',
      render: (ticket) => <span className="text-xs">{ticket.device_display || ticket.device_name || '—'}</span>,
    },
    {
      key: 'category',
      label: 'Category',
      sortField: 'category',
      filterContent: categoryFilterContent,
      filterActive: !!categoryFilter,
      render: (ticket) => <span className="capitalize text-xs">{ticket.category_display}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      sortField: 'status',
      filterContent: statusFilterContent,
      filterActive: !!statusFilter,
      render: (ticket) => {
        const pill = TICKET_STATUS_MAP[ticket.status] ?? { status: ticket.status, label: ticket.status };
        return <StatusPill status={pill.status} label={pill.label} />;
      },
    },
    {
      key: 'note',
      label: 'Note',
      sortField: 'progress_note',
      render: (ticket) => (
        <span className="block max-w-[140px] truncate text-xs text-[var(--color-text-secondary)]">{ticket.diagnosis?.progress_note || '—'}</span>
      ),
    },
    {
      key: 'created_at',
      label: 'Created At',
      sortField: 'created_at',
      render: (ticket) => <span className="text-xs text-[var(--color-text-muted)]">{fmtDate(ticket.created_at)}</span>,
    },
    {
      key: 'action',
      label: 'Action',
      headerAlign: 'center',
      tdClassName: 'text-center',
      width: 120,
      render: (ticket) => (
        <div className="flex items-center justify-center gap-2">
          {(ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS') ? (
            <RoundedTooltip content={ticket.diagnosis ? 'Update diagnosis' : 'Diagnose ticket'}>
              <button
                type="button"
                onClick={() => setDiagnoseTicket(ticket)}
                className={tableIconButtonCls}
              >
                <Stethoscope className="h-3 w-3" />
              </button>
            </RoundedTooltip>
          ) : (
            <RoundedTooltip content="View ticket details">
              <button
                type="button"
                onClick={() => setDetailTicket(ticket)}
                className={tableIconButtonCls}
              >
                <Eye className="h-3 w-3" />
              </button>
            </RoundedTooltip>
          )}
        </div>
      ),
    },
  ];

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  return (
    <div className="min-h-full space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">MIS Ticket Admin</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Manage IT support tickets, monitor trends, and submit technician diagnoses.</p>
      </div>

      <div className={cn('grid gap-4 lg:grid-cols-[70%_30%] lg:items-stretch', OVERVIEW_PANEL_HEIGHT)}>
        <div className="h-full min-h-0">
          <AdminChartCard
            id="mis-tickets"
            categories={CHART_CATEGORIES}
            data={chartData}
            loading={chartQuery.isLoading}
            transitioning={chartTransitioning}
            className="h-full"
            viewType={viewType}
            onViewTypeChange={setViewType}
            chartType={chartType}
            onChartTypeChange={setChartType}
            fyStart={fyStart}
            onFyStartChange={setFyStart}
            fyOptions={useMemo(() => Array.from({ length: 7 }, (_, i) => currentFYStart() - 3 + i), [])}
            monthYear={monthYear}
            onMonthYearChange={setMonthYear}
            monthOptions={monthOptions}
            weekStart={weekStart}
            onWeekStartChange={setWeekStart}
            weekOptions={weekOptions}
          />
        </div>

        <div className="grid h-full min-h-0 grid-cols-1 gap-3 auto-rows-fr sm:grid-cols-2 lg:grid-rows-3">
          <StatCard
            label="Total Tickets"
            value={String(stats?.total ?? 0)}
            icon={Ticket}
            iconClassName="text-[#2845D6]"
            change={getChangeLabel(stats?.total ?? 0, stats?.prev_total ?? 0)}
            positive={(stats?.total ?? 0) >= (stats?.prev_total ?? 0)}
          />
          <StatCard
            label="Open Tickets"
            value={String(stats?.open ?? 0)}
            icon={FolderOpen}
            iconClassName="text-[#F59E0B]"
            change={getChangeLabel(stats?.open ?? 0, stats?.prev_open ?? 0)}
            positive={(stats?.open ?? 0) >= (stats?.prev_open ?? 0)}
          />
          <StatCard
            label="In Progress"
            value={String(stats?.in_progress ?? 0)}
            icon={Loader}
            iconClassName="text-[#F97316]"
            change={getChangeLabel(stats?.in_progress ?? 0, stats?.prev_in_progress ?? 0)}
            positive={(stats?.in_progress ?? 0) >= (stats?.prev_in_progress ?? 0)}
          />
          <StatCard
            label="Resolved"
            value={String(stats?.resolved ?? 0)}
            icon={CheckCircle}
            iconClassName="text-[#22C55E]"
            change={getChangeLabel(stats?.resolved ?? 0, stats?.prev_resolved ?? 0)}
            positive={(stats?.resolved ?? 0) >= (stats?.prev_resolved ?? 0)}
          />
          <StatCard
            label="Closed"
            value={String(stats?.closed ?? 0)}
            icon={XCircle}
            iconClassName="text-[#3B82F6]"
            change={getChangeLabel(stats?.closed ?? 0, stats?.prev_closed ?? 0)}
            positive={(stats?.closed ?? 0) >= (stats?.prev_closed ?? 0)}
          />
          <StatCard
            label="Avg Resolution Time"
            value={`${(stats?.avg_resolution_time ?? 0).toFixed(1)}d`}
            icon={Clock}
            iconClassName="text-[#8B5CF6]"
            change={getChangeLabel(stats?.avg_resolution_time ?? 0, stats?.prev_avg_resolution_time ?? 0, true)}
            positive={(stats?.avg_resolution_time ?? 0) <= (stats?.prev_avg_resolution_time ?? 0)}
          />
        </div>
      </div>

      <div>
        <AdminTableSection<MISTicket>
          search={search}
          onSearchChange={(value) => { setSearch(value); setPage(1); }}
          searchPlaceholder="Search tickets..."
          columns={columns}
          rows={rows}
          rowKey={(ticket) => ticket.id}
          loading={tableLoading}
          transitioning={tableTransitioning}
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          page={page}
          totalPages={totalPages}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
          onPageChange={(p) => setPage(p)}
          emptyTitle="No tickets found"
          emptyDescription="No tickets match the current filters."
          emptyIcons={[ClipboardList, Stethoscope, Download]}
        />
      </div>

      {detailTicket && (
        <AdminTicketDetailModal
          ticket={detailTicket}
          onClose={() => setDetailTicket(null)}
          onDiagnose={() => { setDiagnoseTicket(detailTicket); setDetailTicket(null); }}
        />
      )}
      {diagnoseTicket && (
        <DiagnoseModal ticket={diagnoseTicket} onClose={() => setDiagnoseTicket(null)} />
      )}
    </div>
  );
}

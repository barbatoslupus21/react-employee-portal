'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Ban,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Download,
  Eye,
  FileText,
  Hash,
  Pencil,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AdminTableSection } from '@/components/ui/admin-table-section';
import { FilterListContent } from '@/components/ui/admin-table-accordion';
import type { DataTableColumn } from '@/components/ui/data-table';
import { FileUploadDropzone } from '@/components/ui/file-upload-dropzone';
import { StatusPill } from '@/components/ui/status-pill';
import { Input } from '@/components/ui/input';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { TextareaWithCharactersLeft } from '@/components/ui/textarea-with-characters-left';
import { EmptyState } from '@/components/ui/interactive-empty-state';
import { Tabs as VercelTabs } from '@/components/ui/vercel-tabs';
import { AdminChartCard } from '@/components/ui/admin-chart-card';
import type { ChartViewType, ChartDisplayType } from '@/components/ui/admin-chart-card';
import type { ChartCategory, MultiSeriesDataPoint } from '@/components/ui/multi-series-chart';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/modal';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Timeline } from '@/components/ui/timeline';
import type { TimelineItem, TimelineStatus } from '@/components/ui/timeline';
import { LeaveRangePicker } from '@/components/ui/leave-range-picker';
import { toast } from '@/components/ui/toast';
import { getCsrfToken } from '@/lib/csrf';
import { cn } from '@/lib/utils';

interface UserData {
  id: number;
  admin: boolean;
  hr: boolean;
}

interface LeaveRequest {
  id: number;
  control_number: string;
  leave_type: string;
  leave_type_name: string;
  reason_title: string;
  subreason_title: string | null;
  date_start: string;
  date_end: string;
  date_prepared_display: string;
  days_count: number;
  status: string;
  status_display: string;
  can_review?: boolean;
  can_cancel?: boolean;
  employee_name?: string;
  employee_id?: string;
  employee_id_number?: string;
}

interface ApprovalStep {
  id: number;
  role_group_display: string;
  status: string;
  approver_name: string | null;
  approver_position: string | null;
  acted_by_name: string | null;
  acted_by_position: string | null;
  acted_at: string | null;
  activated_at: string | null;
  remarks: string;
}

interface LeaveDetail {
  id: number;
  control_number: string;
  leave_type: string;
  leave_type_name: string;
  reason: string;
  reason_title: string;
  subreason: string | null;
  subreason_title: string | null;
  date_start: string;
  date_end: string;
  hours: string;
  total_hours?: string;
  total_days?: string;
  days_count: number;
  duration_display: string;
  is_deductible: boolean;
  status: string;
  status_display: string;
  remarks: string;
  date_prepared: string;
  date_prepared_display: string;
  approval_steps: ApprovalStep[];
  employee_name?: string;
  employee_id?: string;
  employee_department?: string;
  employee_line?: string;
  can_cancel: boolean;
  cancelled_at: string | null;
  cancelled_by_name: string | null;
}

interface LeaveType {
  id: number;
  name: string;
}

interface PagedResponse {
  count: number;
  total_pages: number;
  results: LeaveRequest[];
}

interface LeaveBalanceRow {
  id: number;
  employee_name: string;
  employee_id_number: string;
  department: string;
  leave_type: string;
  leave_type_id: number;
  period_start: string;
  period_end: string;
  balance_days: string;
  balance_hours: string;
  used_days: string;
  used_hours: string;
  remaining_days: string;
  remaining_hours: string;
}

interface LeaveBalanceResponse {
  count: number;
  total_pages: number;
  results: LeaveBalanceRow[];
}

const LEAVE_TABS = [
  { id: 'requests', label: 'Leave Requests' },
  { id: 'balances', label: 'Leave Balances' },
] as const;

type LeaveAdminTab = (typeof LEAVE_TABS)[number]['id'];

const APPROVAL_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'routing', label: 'Routing' },
  { value: 'approved', label: 'Approved' },
  { value: 'disapproved', label: 'Disapproved' },
  { value: 'cancelled', label: 'Cancelled' },
];

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

function formatDateForInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatStepTime(ts: Date): string {
  const datePart = ts.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const timePart = ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return `${datePart} ${timePart}`;
}

function formatTimeAndDays(days: number, hoursValue: string | number): string {
  const hours = Number(hoursValue);
  const dayLabel = Number(days) === 1 ? 'day' : 'days';
  const hourLabel = hours === 1 ? 'hour' : 'hours';
  const hoursFormatted = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${days} ${dayLabel} - ${hoursFormatted} ${hourLabel}`;
}

function toNumber(value: string | number | undefined, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmtDurationRange(dateStart: string, dateEnd: string): string {
  const s = new Date(dateStart + 'T00:00:00');
  const e = new Date(dateEnd + 'T00:00:00');
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  if (sameMonth) {
    return `${s.toLocaleDateString('en-US', { month: 'long' })} ${s.getDate()}-${e.getDate()}, ${s.getFullYear()}`;
  }
  if (sameYear) {
    return `${s.toLocaleDateString('en-US', { month: 'long', day: '2-digit' })} - ${e.toLocaleDateString('en-US', { month: 'long', day: '2-digit' })}, ${s.getFullYear()}`;
  }
  return `${s.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' })} - ${e.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' })}`;
}

function _currentFYStart(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

function _getCurrentWeekStart(): string {
  const now = new Date();
  const dow = now.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff);
  return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
}

function _getWeekStartOptions(fyStartYear: number): { label: string; value: string }[] {
  const opts: { label: string; value: string }[] = [];
  const fyEnd = new Date(fyStartYear + 1, 5, 30);
  const jul1 = new Date(fyStartYear, 6, 1);
  const dow = jul1.getDay();
  const cur = new Date(jul1);
  cur.setDate(jul1.getDate() - (dow === 0 ? 6 : dow - 1));
  while (cur <= fyEnd) {
    const sun = new Date(cur);
    sun.setDate(cur.getDate() + 6);
    const value = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
    const label = `${cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    opts.push({ label, value });
    cur.setDate(cur.getDate() + 7);
  }
  return opts;
}

function _getFYMonths(fyStartYear: number): { value: number; year: number; label: string }[] {
  const mn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6].map((m) => ({
    value: m,
    year: m >= 7 ? fyStartYear : fyStartYear + 1,
    label: `${mn[m - 1]} ${m >= 7 ? fyStartYear : fyStartYear + 1}`,
  }));
}

function formatDaysHours(days: string, hours: string): string {
  const d = Number(days);
  const h = Number(hours);
  const dText = Number.isFinite(d) ? d.toFixed(1) : '0.0';
  const hText = Number.isFinite(h) ? h.toFixed(1) : '0.0';
  return `${dText} days (${hText} hrs)`;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</span>
      <span className="text-xs text-[var(--color-text-primary)] flex items-center gap-1">{value}</span>
    </div>
  );
}

function ApprovalActionForm({ leaveId, onActed }: { leaveId: number; onActed: (updated: LeaveDetail) => void }) {
  const [pendingAction, setPendingAction] = useState<'approved' | 'disapproved' | ''>('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [remarksError, setRemarksError] = useState('');

  async function handleAction(action: 'approved' | 'disapproved') {
    if (action === 'disapproved' && !remarks.trim()) {
      setRemarksError('Remarks are required for disapproval.');
      return;
    }

    setPendingAction(action);
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
        window.dispatchEvent(new CustomEvent('leave-badge-refresh'));
        onActed(data as LeaveDetail);
        toast.success(action === 'approved' ? 'Request approved.' : 'Request disapproved.', { title: 'Success' });
      } else {
        toast.error((data as { detail?: string }).detail ?? 'Failed to submit action.', { title: 'Error' });
      }
    } catch {
      toast.error('Network error. Please try again.', { title: 'Error' });
    } finally {
      setSaving(false);
      setPendingAction('');
    }
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      <div>
        <p className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
          Remarks
          {pendingAction === 'disapproved' && (
            <span className="text-red-500 normal-case tracking-normal">*</span>
          )}
        </p>
        <TextareaWithCharactersLeft
          value={remarks}
          onChange={e => {
            setRemarks(e.target.value);
            if (remarksError) setRemarksError('');
          }}
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
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-normal text-white bg-[var(--btn-success-bg)] hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving && pendingAction === 'approved' ? (
            <TextShimmer duration={1.2} className="text-xs font-normal [--base-color:#a5f3c0] [--base-gradient-color:#ffffff]">Approving…</TextShimmer>
          ) : (
            <><CheckCircle2 size={14} /><span>Approve</span></>
          )}
        </button>
        <button
          type="button"
          onClick={() => handleAction('disapproved')}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-normal text-white bg-[var(--btn-danger-bg)] hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving && pendingAction === 'disapproved' ? (
            <TextShimmer duration={1.2} className="text-xs font-normal [--base-color:#fca5a5] [--base-gradient-color:#ffffff]">Disapproving…</TextShimmer>
          ) : (
            <><XCircle size={14} /><span>Disapprove</span></>
          )}
        </button>
      </div>
    </div>
  );
}

function LeaveDetailModal({
  leaveId,
  open,
  onClose,
  canApprove,
  onUpdated,
}: {
  leaveId: number | null;
  open: boolean;
  onClose: () => void;
  canApprove: boolean;
  onUpdated: () => void;
}) {
  const [detail, setDetail] = useState<LeaveDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [pendingAction, setPendingAction] = useState<'approved' | 'disapproved' | ''>('');
  const [remarks, setRemarks] = useState('');
  const [remarksError, setRemarksError] = useState('');
  const [actionSaving, setActionSaving] = useState(false);
  const [actionDone, setActionDone] = useState(false);
  const [shimmerLabel, setShimmerLabel] = useState<string | null>(null);
  const isApproverView = true;

  useEffect(() => {
    if (!open || !leaveId) {
      setDetail(null);
      return;
    }
    setShowCancelConfirm(false);
    setActionDone(false);
    setRemarks('');
    setRemarksError('');
    setLoading(true);
    fetch(`/api/leave/requests/${leaveId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setDetail(d as LeaveDetail))
      .catch(() => toast.error('Failed to load leave details.', { title: 'Error' }))
      .finally(() => setLoading(false));
  }, [open, leaveId]);

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;

    const updateScrollIndicators = () => {
      const { scrollTop, scrollHeight, clientHeight } = node;
      setShowScrollTop(scrollTop > 8);
      setShowScrollBottom(scrollTop + clientHeight < scrollHeight - 8);
    };

    updateScrollIndicators();
    node.addEventListener('scroll', updateScrollIndicators);
    return () => node.removeEventListener('scroll', updateScrollIndicators);
  }, [detail, loading, open]);

  async function handleCancel() {
    if (!detail) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/leave/requests/${detail.id}/cancel`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      if (res.ok) {
        window.dispatchEvent(new CustomEvent('leave-badge-refresh'));
        toast.success('Leave request cancelled.', { title: 'Cancelled' });
        onUpdated();
        onClose();
      } else {
        const data = await res.json();
        toast.error((data as { detail?: string }).detail ?? 'Could not cancel leave request.', { title: 'Error' });
      }
    } catch {
      toast.error('Network error. Please try again.', { title: 'Error' });
    } finally {
      setCancelling(false);
    }
  }

  async function handleAction(selectedAction: 'approved' | 'disapproved') {
    if (!detail) return;
    if (selectedAction === 'disapproved' && !remarks.trim()) {
      setRemarksError('Remarks are required when disapproving.');
      return;
    }

    setRemarksError('');
    setPendingAction(selectedAction);
    setActionSaving(true);

    const stages = selectedAction === 'approved'
      ? (detail.status === 'disapproved'
          // Leave is already disapproved (e.g. manager disapproved): HR recording
          // their approval step does not trigger a deduction — skip that stage.
          ? ['Approving...', 'Sending Email...']
          : ['Approving...', 'Deducting...', 'Sending Email...'])
      : ['Disapproving...', 'Sending Email...'];
    setShimmerLabel(stages[0]);
    const timers: ReturnType<typeof setTimeout>[] = stages
      .slice(1)
      .map((label, index) => setTimeout(() => setShimmerLabel(label), (index + 1) * 1400));

    try {
      const res = await fetch(`/api/leave/requests/${detail.id}/action`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ action: selectedAction, remarks }),
      });
      const data = await res.json();
      if (res.ok) {
        const label = selectedAction === 'approved' ? 'Approved' : 'Disapproved';
        toast.success(`Leave request ${label.toLowerCase()} successfully.`, { title: label });
        window.dispatchEvent(new CustomEvent('leave-badge-refresh'));
        setDetail(data as LeaveDetail);
        setRemarks('');
        setActionDone(true);
        onUpdated();
      } else {
        const err = data as { detail?: string; action?: string[]; remarks?: string[]; non_field_errors?: string[] };
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

  const firstPendingIdx = (detail?.approval_steps ?? []).findIndex(s => s.status === 'pending');
  const hasPendingStep = detail?.approval_steps?.some(s => s.status === 'pending') ?? false;
  const showActionForm = canApprove && hasPendingStep && detail?.status !== 'cancelled';
  const showCancelButton = !loading && Boolean(detail?.can_cancel) && (detail?.status === 'pending' || detail?.status === 'approved');
  function fmtShort(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

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
        <div className="space-y-0.5">
          {rawTs && <p className="text-[11px] text-[var(--color-text-muted)]">{formatStepTime(rawTs)}</p>}
          <p className="text-xs font-medium text-[var(--color-text-primary)]">{displayName}</p>
          {displayPosition && <p className="text-[11px] text-[var(--color-text-muted)]">{displayPosition}</p>}
          {!isPending && step.remarks && <p className="text-[11px] italic text-[var(--color-text-muted)]">"{step.remarks}"</p>}
        </div>
      ),
      timestamp: undefined,
      status: stepStatusToTimeline(step.status, idx === firstPendingIdx),
    };
  });

  return createPortal(
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
            {loading && (
              <div className="flex items-center justify-center py-8">
                <span className="size-6 border-2 border-[#2845D6]/30 border-t-[#2845D6] rounded-full animate-spin" />
              </div>
            )}

            {!loading && detail && (
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
                  <InfoRow
                    label="Time & Days"
                    value={formatTimeAndDays(toNumber(detail.total_days, detail.days_count), detail.total_hours ?? detail.hours)}
                  />
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
                <p className="text-[11px] font-semibold text-[var(--color-text-muted)] mb-1 uppercase tracking-wide">
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
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-normal
                    text-white bg-[var(--btn-success-bg)] hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {actionSaving && pendingAction === 'approved'
                    ? <TextShimmer duration={1.2} className="text-xs font-normal [--base-color:#a5f3c0] [--base-gradient-color:#ffffff]">{shimmerLabel ?? 'Approving…'}</TextShimmer>
                    : <><CheckCircle2 size={14} /><span>Approve</span></>
                  }
                </button>
                <button
                  type="button"
                  onClick={() => handleAction('disapproved')}
                  disabled={actionSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-normal
                    text-white bg-[var(--btn-danger-bg)] hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {actionSaving && pendingAction === 'disapproved'
                    ? <TextShimmer duration={1.2} className="text-xs font-normal [--base-color:#fca5a5] [--base-gradient-color:#ffffff]">{shimmerLabel ?? 'Disapproving…'}</TextShimmer>
                    : <><XCircle size={14} /><span>Disapprove</span></>
                  }
                </button>
              </div>
            </div>
          ) : (
            /* ── Normal / view footer ─────────────────────────────────── */
            <AnimatePresence mode="wait" initial={false}>
              {showCancelConfirm && showCancelButton ? (
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
                  className={cn('flex items-center', showCancelButton ? 'justify-between gap-2' : 'justify-end')}
                >
                  <div>
                    {!(isApproverView || canApprove) && showCancelButton && (
                      <button
                        type="button"
                        onClick={() => setShowCancelConfirm(true)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-normal
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
                    className="px-4 py-2 rounded-lg text-xs font-normal border border-[var(--color-border)]
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
  , document.body);
}

function ExportModal({ onClose, exporting, setExporting }: { onClose: () => void; exporting: boolean; setExporting: (v: boolean) => void }) {
  const [periodStart, setPeriodStart] = useState<Date | undefined>();
  const [periodEnd, setPeriodEnd] = useState<Date | undefined>();

  const canDownload = Boolean(periodStart && periodEnd) && !exporting;

  async function handleDownload() {
    if (!periodStart || !periodEnd) return;
    setExporting(true);
    try {
      const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const params = new URLSearchParams({ period_start: fmt(periodStart), period_end: fmt(periodEnd) });
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

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }} transition={{ duration: 0.18 }} className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--color-border)]">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Export Leave Report</h2>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] transition-colors"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <LeaveRangePicker dateStart={periodStart} dateEnd={periodEnd} onDateStartChange={setPeriodStart} onDateEndChange={setPeriodEnd} closeOnSelect={false} />
        </div>
        <div className="px-6 pb-5 pt-0 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-xs font-normal text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors">Cancel</button>
          <button type="button" onClick={handleDownload} disabled={!canDownload} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2845D6] text-white text-xs font-normal hover:bg-[#1f38c0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Download className="size-3" />
            {exporting ? <TextShimmer duration={1.2} className="text-xs font-normal [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">Exporting...</TextShimmer> : 'Download'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  , document.body);
}

function BalanceImportModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<'idle' | 'validating' | 'uploading' | 'done' | 'error'>('idle');
  const [checkProgress, setCheckProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorFileSet, setErrorFileSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setPhase('idle');
      setCheckProgress(0);
      setUploadProgress(0);
      setErrorFileSet(new Set());
    }
  }, [open]);

  async function downloadTemplate() {
    try {
      const res = await fetch('/api/leave/admin/balances/template/', { credentials: 'include' });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: 'Failed to download template.' }));
        throw new Error(error.detail || `${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'leave_balance_template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to download template.';
      toast.error(message, { title: 'Error' });
    }
  }

  async function handleUpload() {
    const file = files[0];
    if (!file || phase === 'validating' || phase === 'uploading') return;
    setPhase('validating');
    setCheckProgress(0);
    setUploadProgress(0);
    setErrorFileSet(new Set());

    const timer = window.setInterval(() => {
      setCheckProgress((prev) => Math.min(95, prev + 18));
    }, 120);

    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      window.clearInterval(timer);
      setCheckProgress(100);
      setPhase('uploading');

      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/leave/admin/balance-upload', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
        body: fd,
      });

      setUploadProgress(100);
      if (res.ok) {
        const d = await res.json();
        toast.success(d.detail, { title: 'Upload Successful' });
        onSuccess();
        onClose();
        return;
      }

      const contentType = res.headers.get('Content-Type') ?? '';
      const disposition = res.headers.get('Content-Disposition') ?? '';
      if (contentType.includes('spreadsheet') || disposition.includes('attachment')) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'leave_balance_upload_errors.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.error('Upload failed. Error report downloaded.', { title: 'Upload Failed' });
      } else {
        const d = await res.json().catch(() => ({ detail: 'Upload failed.' }));
        toast.error(d.detail ?? 'Upload failed.', { title: 'Upload Failed' });
      }
      setPhase('error');
    } catch {
      window.clearInterval(timer);
      toast.error('Network error. Please try again.', { title: 'Error' });
      setPhase('error');
    }
  }

  return (
    <Modal open={open} onOpenChange={v => { if (!v && phase !== 'validating' && phase !== 'uploading') onClose(); }}>
      <ModalContent className="max-w-md">
        <ModalHeader className="flex flex-row items-center justify-between gap-4 border-b border-[var(--color-border)] px-6 py-4">
          <div>
            <ModalTitle className="text-base font-semibold">Upload Balances</ModalTitle>
          </div>
        </ModalHeader>
        <ModalBody className="flex flex-col gap-4 p-0">
          <div className="bg-green-50 dark:bg-green-950/20 border-b border-green-200/70 dark:border-green-900/40 px-6 py-4 shrink-0 space-y-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-green-900 dark:text-green-200">Leave Balances</p>
              <p className="text-[12px] text-green-700 dark:text-green-400 leading-relaxed">Upload a single Excel file with leave balance rows. Any invalid row rejects the full file.</p>
            </div>
            <button
              type="button"
              onClick={downloadTemplate}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-normal border border-green-400/70 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
              >
              <Download size={13} />
              Download Template
            </button>
          </div>
          <div className="flex flex-col gap-4 px-6 pb-2">
            <FileUploadDropzone
              files={files}
              onFilesChange={(nextFiles) => {
                if (phase === 'validating' || phase === 'uploading') return;
                setFiles(nextFiles.slice(0, 1));
              }}
              accept=".xlsx"
              label="Click to select or drag & drop"
              helperText="Only one .xlsx file can be uploaded at a time"
              disabled={phase === 'validating' || phase === 'uploading'}
              errorFileNames={errorFileSet}
            />

            <AnimatePresence>
              {phase === 'validating' && (
                <motion.div
                  key="balance-validating"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-1.5"
                >
                  <p className="text-[11px] font-medium text-[var(--color-text-muted)]">Validation in progress {checkProgress}%</p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
                    <motion.div className="h-full rounded-full bg-[#2845D6]" animate={{ width: `${checkProgress}%` }} transition={{ duration: 0.15, ease: 'easeOut' }} />
                  </div>
                </motion.div>
              )}
              {phase === 'uploading' && (
                <motion.div
                  key="balance-uploading"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-1.5"
                >
                  <p className="text-[11px] font-medium text-[var(--color-text-muted)]">Uploading data {uploadProgress}%</p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
                    <motion.div className="h-full rounded-full bg-[#10B981]" animate={{ width: `${uploadProgress}%` }} transition={{ duration: 0.15, ease: 'easeOut' }} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Required Columns (xlsx, row 1 = header)</p>
              <ul className="space-y-1.5">
                {[
                  { col: 'ID Number', required: true },
                  { col: 'Employee Name', required: false, note: 'reference only' },
                  { col: 'Leave Type', required: true },
                  { col: 'Period Start', required: true, note: 'YYYY-MM-DD' },
                  { col: 'Period End', required: true, note: 'YYYY-MM-DD' },
                  { col: 'Balance (Days)', required: true },
                ].map((c) => (
                  <li key={c.col} className="flex items-start gap-2 text-xs text-[var(--color-text-primary)]">
                    <span className={cn(
                      'mt-0.5 flex-shrink-0 rounded px-1 py-0.5 text-[10px]',
                      c.required ? 'bg-[#2845D6]/10 text-[#2845D6]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
                    )}>{c.required ? 'REQ' : 'OPT'}</span>
                    <span>
                      <span className="font-mono">{c.col}</span>
                      {c.note && <span className="ml-1 text-[var(--color-text-muted)]">— {c.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            
          </div>
        </ModalBody>
        <ModalFooter className="flex items-center justify-end gap-2 px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={phase === 'validating' || phase === 'uploading'}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-xs font-normal text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={files.length === 0 || phase === 'validating' || phase === 'uploading'}
            className="flex items-center gap-1.5 rounded-lg bg-[#2845D6] px-4 py-2 text-xs font-normal text-white transition-colors hover:bg-[#1f38c0] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="size-3.5" />
            {phase === 'validating' ? 'Validating Data…' : phase === 'uploading' ? 'Uploading Data…' : 'Validate & Upload'}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function BalanceEditModal({
  balance,
  open,
  onClose,
  onSaved,
  leaveTypeOptions,
}: {
  balance: LeaveBalanceRow | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  leaveTypeOptions: { value: string; label: string }[];
}) {
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [periodStart, setPeriodStart] = useState<Date | undefined>();
  const [periodEnd, setPeriodEnd] = useState<Date | undefined>();
  const [balanceHours, setBalanceHours] = useState('');
  const [usedHours, setUsedHours] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!balance) return;
    setLeaveTypeId(String(balance.leave_type_id));
    setPeriodStart(new Date(balance.period_start));
    setPeriodEnd(new Date(balance.period_end));
    setBalanceHours(balance.balance_hours);
    setUsedHours(balance.used_hours);
  }, [balance]);

  if (!balance) return null;

  async function handleSave() {
    if (
      !balance ||
      saving ||
      leaveTypeId === '' ||
      !periodStart ||
      !periodEnd ||
      balanceHours === '' ||
      usedHours === '' 
    ) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/leave/admin/balances/${balance.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify({
          leave_type_id: parseInt(leaveTypeId, 10),
          period_start: formatDateForInput(periodStart),
          period_end: formatDateForInput(periodEnd),
          balance_hours: balanceHours,
          used_hours: usedHours,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Leave balance updated successfully.', { title: 'Saved' });
        onSaved();
        onClose();
      } else {
        const err = data as {
          detail?: string;
          leave_type_id?: string[];
          period_start?: string[];
          period_end?: string[];
          balance_hours?: string[];
          used_hours?: string[];
        };
        toast.error(
          err.detail ?? err.leave_type_id?.[0] ?? err.period_start?.[0] ?? err.period_end?.[0] ?? err.balance_hours?.[0] ?? err.used_hours?.[0] ?? 'Could not update leave balance.',
          { title: 'Error' }
        );
      }
    } catch {
      toast.error('Network error. Please try again.', { title: 'Error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={v => { if (!v && !saving) onClose(); }}>
      <ModalContent className="max-w-md overflow-hidden">
        <ModalHeader>
          <ModalTitle className="text-base font-semibold">Edit Leave Balance</ModalTitle>
        </ModalHeader>
        <ModalBody className="flex flex-col gap-2 max-h-[calc(100vh-22rem)] overflow-y-auto px-6 py-4">

          <div className="">
            <div className="flex items-center gap-3">
              <p className="text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap">
                Employee Information
              </p>
              <div className="flex-1 h-px bg-[var(--color-border)]" />
            </div>
          </div>

          <div className="pb-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow label="ID Number" value={balance.employee_id_number} />
              <InfoRow label="Employee Name" value={balance.employee_name} />
              <InfoRow label="Department" value={balance.department} />
            </div>
          </div>

          <div className="">
            <div className="flex items-center gap-3">
              <p className="text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap">
                Balances Information
              </p>
              <div className="flex-1 h-px bg-[var(--color-border)]" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-1">
            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Leave Type</span>
              <Select value={leaveTypeId} onValueChange={setLeaveTypeId} disabled={saving}>
                <SelectTrigger className="h-8 w-full rounded-lg border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-xs text-[var(--color-text-primary)]">
                  <SelectValue placeholder="Select leave type" />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypeOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <LeaveRangePicker
                dateStart={periodStart}
                dateEnd={periodEnd}
                onDateStartChange={setPeriodStart}
                onDateEndChange={setPeriodEnd}
                closeOnSelect={false}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Entitled Hours"
              type="number"
              step="0.1"
              min="0"
              value={balanceHours}
              onChange={e => setBalanceHours(e.target.value)}
              disabled={saving}
            />
            <Input
              label="Used Hours"
              type="number"
              step="0.1"
              min="0"
              value={usedHours}
              onChange={e => setUsedHours(e.target.value)}
              disabled={saving}
            />
          </div>
        </ModalBody>
        <ModalFooter className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-xs font-normal text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-card)] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || leaveTypeId === '' || !periodStart || !periodEnd || balanceHours === '' || usedHours === ''}
            className="flex items-center gap-1.5 rounded-lg bg-[#2845D6] px-4 py-2 text-xs font-normal text-white transition-colors hover:bg-[#1f38c0] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="size-3.5" />
            {saving ? <TextShimmer duration={1.2} className="text-xs font-normal [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">Saving Changes…</TextShimmer> : 'Save Changes'}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function LeaveRequestsTable({ onViewDetail, refreshKey }: {
  onViewDetail: (id: number, canApprove: boolean) => void;
  refreshKey: number;
}) {
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
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('');
  const [cancelTarget, setCancelTarget] = useState<{ id: number; controlNumber: string } | null>(null);
  const [cancellingRequest, setCancellingRequest] = useState(false);
  const skeletonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRefreshKey = useRef(refreshKey);

  useEffect(() => {
    fetch('/api/leave/types', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: LeaveType[]) => setLeaveTypes(data))
      .catch(() => {});
  }, []);

  const fetchQueue = useCallback(async (p: number, q: string, status: string, field: string, dir: 'asc' | 'desc', ltId = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set('search', q);
      if (status) params.set('status', status);
      if (ltId) params.set('leave_type', ltId);
      if (field) params.set('ordering', dir === 'desc' ? `-${field}` : field);
      const res = await fetch(`/api/leave/approval-queue?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: PagedResponse = await res.json();
      setRows(data.results);
      setTotalPages(data.total_pages);
      setTotalCount(data.count);
    } catch {
      toast.error('Could not load approval queue.', { title: 'Connection Error' });
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerFetch = useCallback((p: number, q: string, status: string, field: string, dir: 'asc' | 'desc', ltId = '') => {
    if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
    setLoading(true);
    skeletonTimerRef.current = setTimeout(() => {
      fetchQueue(p, q, status, field, dir, ltId).catch(() => {});
    }, 1000);
  }, [fetchQueue]);

  useEffect(() => {
    triggerFetch(1, '', '', 'date_prepared', 'desc');
    return () => { if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current); };
  }, [triggerFetch]);

  // External refresh trigger (e.g. after approve/disapprove from the detail modal)
  useEffect(() => {
    if (prevRefreshKey.current === refreshKey) return;
    prevRefreshKey.current = refreshKey;
    triggerFetch(page, search, statusFilter, sortField, sortDir, leaveTypeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  function handleSort(field: string) {
    const nextDir = field === sortField && sortDir === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDir(nextDir);
    setPage(1);
    triggerFetch(1, search, statusFilter, field, nextDir, leaveTypeFilter);
  }

  const leaveTypeFilterContent = leaveTypes.length > 0 ? (
    <FilterListContent options={leaveTypes.map(lt => ({ value: String(lt.id), label: lt.name }))} value={leaveTypeFilter} onChange={(val) => {
      setLeaveTypeFilter(val);
      setPage(1);
      triggerFetch(1, search, statusFilter, sortField, sortDir, val);
    }} allLabel="All Leave Types" />
  ) : null;

  const statusFilterContent = (
    <FilterListContent options={APPROVAL_STATUS_OPTIONS} value={statusFilter} onChange={(val) => {
      setStatusFilter(val);
      setPage(1);
      triggerFetch(1, search, val, sortField, sortDir, leaveTypeFilter);
    }} allLabel="All Status" clearOnReclick />
  );

  const columns: DataTableColumn<LeaveRequest>[] = useMemo(() => [
    {
      key: 'control_number',
      label: 'Control No.',
      sortField: 'control_number',
      render: row => <span className="text-xs font-semibold text-primary">{row.control_number}</span>,
    },
    {
      key: 'employee',
      label: 'Employee',
      sortField: 'employee_name',
      render: row => (
        <div className="flex flex-col">
          <span className="text-xs font-medium">{row.employee_name ?? '-'}</span>
          <span className="text-[10px] text-muted-foreground">{row.employee_id_number ?? row.employee_id ?? ''}</span>
        </div>
      ),
    },
    {
      key: 'leave_type',
      label: 'Leave Type',
      sortField: 'leave_type',
      filterContent: leaveTypeFilterContent,
      filterActive: Boolean(leaveTypeFilter),
      render: row => <span className="text-xs">{row.leave_type_name}</span>,
    },
    {
      key: 'reason',
      label: 'Reason',
      render: row => <span className="text-xs">{row.reason_title}{row.subreason_title ? ` - ${row.subreason_title}` : ''}</span>,
    },
    {
      key: 'duration',
      label: 'Duration',
      sortField: 'days_count',
      render: row => <span className="text-xs">{fmtDurationRange(row.date_start, row.date_end)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      sortField: 'status',
      filterContent: statusFilterContent,
      filterActive: Boolean(statusFilter),
      render: row => <StatusPill status={row.status} label={row.status_display} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      headerAlign: 'center',
      tdClassName: 'text-center',
      render: row => (
        <div className="flex items-center justify-center gap-1">
          {(row.can_review ?? false) ? (
            <button title="Review" onClick={() => onViewDetail(row.id, true)} className="flex items-center gap-1.5 py-1 px-2.5 rounded-md text-xs font-normal bg-[#2845D6] text-white hover:bg-[#1e35b5] transition-colors">
              <CheckCheck className="size-3" /> Review
            </button>
          ) : (
            <>
              <button title="View details" onClick={() => onViewDetail(row.id, false)} className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors">
                <Eye size={13} />
              </button>
              {row.can_cancel && (
                <button
                  type="button"
                  title="Cancel request"
                  onClick={() => setCancelTarget({ id: row.id, controlNumber: row.control_number })}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <XCircle size={12} />
                </button>
              )}
            </>
          )}
        </div>
      ),
    },
  ], [leaveTypeFilter, leaveTypeFilterContent, onViewDetail, statusFilter, statusFilterContent]);

  return (
    <>
      <AdminTableSection<LeaveRequest>
        search={search}
        onSearchChange={(q) => {
          setSearch(q);
          setPage(1);
          triggerFetch(1, q, statusFilter, sortField, sortDir, leaveTypeFilter);
        }}
        searchPlaceholder="Search approval queue..."
        actions={
          <button type="button" onClick={() => setShowExportModal(true)} disabled={exporting} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2845D6] text-white font-normal text-xs hover:bg-[#1f38c0] transition-colors disabled:cursor-not-allowed disabled:opacity-50">
            <Download className="size-3" />
            {exporting ? <TextShimmer duration={1.2} className="text-xs font-normal [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">Exporting...</TextShimmer> : 'Export Report'}
          </button>
        }
        columns={columns}
        rows={rows}
        rowKey={r => r.id}
        loading={loading}
        skeletonRows={10}
        tableClassName="text-xs font-normal"
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        totalPages={totalPages}
        pageSize={10}
        totalCount={totalCount}
        onPageChange={(p) => {
          setPage(p);
          triggerFetch(p, search, statusFilter, sortField, sortDir, leaveTypeFilter);
        }}
        emptyTitle="No requests in queue"
        emptyDescription="No pending requests require your approval at this time."
        emptyIcons={[CheckCircle2, ClipboardList, Clock]}
      />

      <AnimatePresence>
        {cancelTarget && (
          <ConfirmationModal
            title="Cancel Leave Request"
            message="Are you sure you want to cancel this leave request? This action cannot be undone."
            confirmLabel="Yes, Cancel Request"
            cancelLabel="No, Keep It"
            confirming={cancellingRequest}
            confirmVariant="danger"
            onCancel={() => setCancelTarget(null)}
            onConfirm={async () => {
              if (!cancelTarget) return;
              setCancellingRequest(true);
              try {
                const res = await fetch(`/api/leave/requests/${cancelTarget.id}/cancel`, {
                  method: 'PATCH',
                  credentials: 'include',
                  headers: { 'X-CSRFToken': getCsrfToken() },
                });
                const data = await res.json();
                if (res.ok) {
                  window.dispatchEvent(new CustomEvent('leave-badge-refresh'));
                  toast.success('Leave request cancelled.', { title: 'Cancelled' });
                  setCancelTarget(null);
                  triggerFetch(page, search, statusFilter, sortField, sortDir, leaveTypeFilter);
                } else {
                  toast.error((data as { detail?: string }).detail ?? 'Could not cancel leave request.', { title: 'Error' });
                }
              } catch {
                toast.error('Network error. Please try again.', { title: 'Error' });
              } finally {
                setCancellingRequest(false);
              }
            }}
          />
        )}
        {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} exporting={exporting} setExporting={setExporting} />}
      </AnimatePresence>
    </>
  );
}

function LeaveBalancesTab() {
  const [rows, setRows] = useState<LeaveBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [sortField, setSortField] = useState('employee_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showImport, setShowImport] = useState(false);
  const [editBalance, setEditBalance] = useState<LeaveBalanceRow | null>(null);
  const [deleteBalance, setDeleteBalance] = useState<LeaveBalanceRow | null>(null);
  const [deletingBalance, setDeletingBalance] = useState(false);
  const [leaveTypeOptions, setLeaveTypeOptions] = useState<{ value: string; label: string }[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<{ value: string; label: string }[]>([]);
  const skeletonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/leave/types', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: LeaveType[]) => setLeaveTypeOptions(data.map(d => ({ value: String(d.id), label: d.name }))))
      .catch(() => {});
  }, []);

  const fetchRows = useCallback(async (
    p: number,
    q: string,
    lt: string,
    dept: string,
    field: string,
    dir: 'asc' | 'desc',
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set('search', q);
      if (lt) params.set('leave_type', lt);
      if (dept) params.set('department', dept);
      if (field) params.set('ordering', dir === 'desc' ? `-${field}` : field);
      const res = await fetch(`/api/leave/admin/balances?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: LeaveBalanceResponse = await res.json();
      setRows(data.results);
      setTotalPages(data.total_pages);
      setTotalCount(data.count);
      const deptSet = new Set<string>();
      data.results.forEach(r => { if (r.department) deptSet.add(r.department); });
      setDepartmentOptions(Array.from(deptSet).sort().map(d => ({ value: d, label: d })));
    } catch {
      toast.error('Could not load leave balances.', { title: 'Connection Error' });
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerFetch = useCallback((
    p: number,
    q: string,
    lt: string,
    dept: string,
    field: string,
    dir: 'asc' | 'desc',
  ) => {
    if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
    setLoading(true);
    skeletonTimerRef.current = setTimeout(() => {
      fetchRows(p, q, lt, dept, field, dir).catch(() => {});
    }, 1000);
  }, [fetchRows]);

  useEffect(() => {
    triggerFetch(1, '', '', '', 'employee_name', 'asc');
    return () => { if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current); };
  }, [triggerFetch]);

  function handleSort(field: string) {
    const nextDir = field === sortField && sortDir === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDir(nextDir);
    setPage(1);
    triggerFetch(1, search, leaveTypeFilter, departmentFilter, field, nextDir);
  }

  const leaveTypeFilterContent = (
    <FilterListContent
      options={leaveTypeOptions}
      value={leaveTypeFilter}
      onChange={(val) => {
        setLeaveTypeFilter(val);
        setPage(1);
        triggerFetch(1, search, val, departmentFilter, sortField, sortDir);
      }}
      allLabel="All Leave Types"
    />
  );

  const departmentFilterContent = (
    <FilterListContent
      options={departmentOptions}
      value={departmentFilter}
      onChange={(val) => {
        setDepartmentFilter(val);
        setPage(1);
        triggerFetch(1, search, leaveTypeFilter, val, sortField, sortDir);
      }}
      allLabel="All Departments"
    />
  );

  const columns: DataTableColumn<LeaveBalanceRow>[] = useMemo(() => [
    {
      key: 'employee_name',
      label: 'Employee Name',
      sortField: 'employee_name',
      render: row => (
        <div className="flex flex-col">
          <span className="text-xs font-medium">{row.employee_name}</span>
          <span className="text-[10px] text-[var(--color-text-muted)]">{row.employee_id_number}</span>
        </div>
      ),
    },
    {
      key: 'department',
      label: 'Department',
      sortField: 'department',
      filterContent: departmentFilterContent,
      filterActive: Boolean(departmentFilter),
      render: row => <span className="text-xs text-[var(--color-text-primary)]">{row.department || '-'}</span>,
    },
    {
      key: 'leave_type',
      label: 'Leave Type',
      sortField: 'leave_type',
      filterContent: leaveTypeFilterContent,
      filterActive: Boolean(leaveTypeFilter),
      render: row => <span className="text-xs text-[var(--color-text-primary)]">{row.leave_type}</span>,
    },
    {
      key: 'period',
      label: 'Period',
      sortField: 'period',
      render: row => <span className="text-xs text-[var(--color-text-primary)]">{fmtDurationRange(row.period_start, row.period_end)}</span>,
    },
    {
      key: 'balance',
      label: 'Balance',
      sortField: 'balance',
      render: row => <span className="text-xs text-[var(--color-text-primary)]">{formatDaysHours(row.balance_days, row.balance_hours)}</span>,
    },
    {
      key: 'used',
      label: 'Used',
      sortField: 'used',
      render: row => <span className="text-xs text-[var(--color-text-primary)]">{formatDaysHours(row.used_days, row.used_hours)}</span>,
    },
    {
      key: 'remaining',
      label: 'Remaining',
      sortField: 'remaining',
      render: row => <span className="text-xs text-[var(--color-text-primary)]">{formatDaysHours(row.remaining_days, row.remaining_hours)}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      headerAlign: 'center',
      tdClassName: 'text-center',
      render: row => (
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            title="Edit balance"
            onClick={() => setEditBalance(row)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            title="Delete balance"
            onClick={() => setDeleteBalance(row)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ),
    },
  ], [departmentFilter, departmentFilterContent, leaveTypeFilter, leaveTypeFilterContent]);

  return (
    <>
      <AdminTableSection<LeaveBalanceRow>
        search={search}
        onSearchChange={(q) => {
          setSearch(q);
          setPage(1);
          triggerFetch(1, q, leaveTypeFilter, departmentFilter, sortField, sortDir);
        }}
        searchPlaceholder="Search balances..."
        actions={
          <button type="button" onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2845D6] text-white font-normal text-xs hover:bg-[#1f38c0] transition-colors">
            <Upload className="size-3" /> Import Balance
          </button>
        }
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
        onPageChange={(p) => {
          setPage(p);
          triggerFetch(p, search, leaveTypeFilter, departmentFilter, sortField, sortDir);
        }}
        emptyTitle="No leave balances"
        emptyDescription="No leave balances found for the selected filters."
        emptyIcons={[CalendarDays, ClipboardList, Clock]}
      />

      <BalanceImportModal open={showImport} onClose={() => setShowImport(false)} onSuccess={() => triggerFetch(1, search, leaveTypeFilter, departmentFilter, sortField, sortDir)} />
      <BalanceEditModal
        balance={editBalance}
        leaveTypeOptions={leaveTypeOptions}
        open={Boolean(editBalance)}
        onClose={() => setEditBalance(null)}
        onSaved={() => triggerFetch(page, search, leaveTypeFilter, departmentFilter, sortField, sortDir)}
      />
      <AnimatePresence>
        {deleteBalance && (
          <ConfirmationModal
            title="Delete Leave Balance"
            message={`Are you sure you want to delete the leave balance for ${deleteBalance.employee_name}? This action cannot be undone.`}
            confirmLabel="Yes, Delete Balance"
            cancelLabel="No, Keep It"
            confirming={deletingBalance}
            onCancel={() => setDeleteBalance(null)}
            onConfirm={async () => {
              if (deletingBalance) return;
              setDeletingBalance(true);
              try {
                const res = await fetch(`/api/leave/admin/balances/${deleteBalance.id}`, {
                  method: 'DELETE',
                  credentials: 'include',
                  headers: { 'X-CSRFToken': getCsrfToken() },
                });
                if (res.ok) {
                  toast.success('Leave balance deleted.', { title: 'Deleted' });
                  setDeleteBalance(null);
                  triggerFetch(page, search, leaveTypeFilter, departmentFilter, sortField, sortDir);
                } else {
                  const data = await res.json();
                  toast.error((data as { detail?: string }).detail ?? 'Could not delete leave balance.', { title: 'Error' });
                }
              } catch {
                toast.error('Network error. Please try again.', { title: 'Error' });
              } finally {
                setDeletingBalance(false);
              }
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export default function LeaveAdminPage() {
  const router = useRouter();
  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');
  const [user, setUser] = useState<UserData | null>(null);
  const [tab, setTab] = useState<LeaveAdminTab>(() => {
    if (typeof window === 'undefined') return 'requests';
    const saved = window.localStorage.getItem('leave-admin-tab');
    return saved === 'balances' ? 'balances' : 'requests';
  });

  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailCanApprove, setDetailCanApprove] = useState(false);
  const [requestsRefreshKey, setRequestsRefreshKey] = useState(0);

  // Chart state mirrors the approver chart behavior.
  const [chartViewType, setChartViewType] = useState<ChartViewType>('monthly');
  const [chartType, setChartType] = useState<ChartDisplayType>('bar');
  const [chartFyStart, setChartFyStart] = useState(_currentFYStart());
  const [chartSelectedMonth, setChartSelectedMonth] = useState(new Date().getMonth() + 1);
  const [chartSelectedYear, setChartSelectedYear] = useState(new Date().getFullYear());
  const [chartWeekStart, setChartWeekStart] = useState(_getCurrentWeekStart());
  const [chartData, setChartData] = useState<MultiSeriesDataPoint[]>([]);
  const [chartCategories, setChartCategories] = useState<ChartCategory[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartTransitioning, setChartTransitioning] = useState(false);
  const chartInitialized = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setAuthPhase('checking'), 350);
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => { if (!r.ok) { router.push('/'); return null; } return r.json(); })
      .then((u: UserData | null) => {
        clearTimeout(timer);
        if (!u || (!u.admin && !u.hr)) {
          router.push('/dashboard/leave');
        } else {
          setUser(u);
          setAuthPhase('done');
        }
      })
      .catch(() => { clearTimeout(timer); router.push('/'); });
    return () => clearTimeout(timer);
  }, [router]);

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
      const data = await res.json() as {
        data: MultiSeriesDataPoint[];
        categories: { key: string; label: string; color: string; gradId: string; lightColor: string }[];
      };
      const cats: ChartCategory[] = data.categories.map((c, i) => {
        const palette = QUEUE_CHART_COLORS[i % QUEUE_CHART_COLORS.length];
        return {
          key: c.key,
          label: c.label,
          color: c.color ?? palette.color,
          gradId: c.gradId ?? `qgrad_${i}`,
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
  }, [chartFyStart, chartSelectedMonth, chartSelectedYear, chartViewType, chartWeekStart]);

  useEffect(() => {
    if (authPhase !== 'done') return;
    fetchChart();
  }, [authPhase, fetchChart]);

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
          Checking permissions...
        </TextShimmer>
      </div>
    );
  }

  if (!user) return null;

  const fyMonths = _getFYMonths(chartFyStart);
  const weekOpts = _getWeekStartOptions(chartFyStart);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[var(--color-text-primary)]">Leave Management</h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Review leave requests and manage employee leave balances.</p>
        </div>
      </div>

      <div>
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
          monthOptions={fyMonths.map(mo => ({ value: `${mo.year}-${mo.value}`, label: mo.label }))}
          weekStart={chartWeekStart}
          onWeekStartChange={setChartWeekStart}
          weekOptions={weekOpts}
        />
      </div>

      <VercelTabs
        tabs={[...LEAVE_TABS]}
        activeTab={tab}
        onTabChange={id => {
          setTab(id as LeaveAdminTab);
          localStorage.setItem('leave-admin-tab', id);
        }}
      />

      {tab === 'requests' && (
        <LeaveRequestsTable
          refreshKey={requestsRefreshKey}
          onViewDetail={(id, canApprove) => {
            setDetailId(id);
            setDetailCanApprove(canApprove);
            setDetailOpen(true);
          }}
        />
      )}

      {tab === 'balances' && <LeaveBalancesTab />}

      {detailOpen && detailId !== null && (
        <LeaveDetailModal
          leaveId={detailId}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          canApprove={detailCanApprove}
          onUpdated={() => {
            window.dispatchEvent(new CustomEvent('leave-badge-refresh'));
            setDetailOpen(false);
            setRequestsRefreshKey(k => k + 1);
            fetchChart();
          }}
        />
      )}

      {tab === 'requests' && chartData.length === 0 && !chartLoading && (
        <div className="rounded-xl border border-border bg-card p-8">
          <EmptyState
            title="No approval chart data"
            description="No leave approval data is available for the selected chart period."
            icons={[CalendarDays, ClipboardList, Clock]}
          />
        </div>
      )}
    </div>
  );
}

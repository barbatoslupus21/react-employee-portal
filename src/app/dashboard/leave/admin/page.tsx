'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Ban,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  Edit2,
  FileText,
  Hash,
  Plus,
  Settings2,
  Tag,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AdminTableSection } from '@/components/ui/admin-table-section';
import type { DataTableColumn } from '@/components/ui/data-table';
import { StatusPill } from '@/components/ui/status-pill';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/modal';
import { Timeline } from '@/components/ui/timeline';
import type { TimelineItem, TimelineStatus } from '@/components/ui/timeline';
import { toast } from '@/components/ui/toast';
import { getCsrfToken } from '@/lib/csrf';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserData {
  id: number;
  admin: boolean;
  hr: boolean;
}

interface LeaveType {
  id: number;
  name: string;
  has_balance: boolean;
  deductible: boolean;
  requires_clinic_approval: boolean;
  is_active: boolean;
}

interface LeaveSubreason {
  id: number;
  title: string;
}

interface LeaveReason {
  id: number;
  leave_types: number[];
  leave_type_names: string[];
  title: string;
  subreasons: LeaveSubreason[];
}

interface LeaveRequest {
  id: number;
  control_number: string;
  leave_type: string;
  employee_name?: string;
  employee_id?: string;
  duration_display: string;
  date_prepared_display: string;
  status: string;
  status_display: string;
  can_cancel: boolean;
}

interface PagedResponse {
  count: number;
  total_pages: number;
  results: LeaveRequest[];
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
  reason: string;
  subreason: string | null;
  date_start: string;
  date_end: string;
  hours: string;
  days_count: number;
  is_deductible: boolean;
  remarks: string;
  date_prepared_display: string;
  approval_steps: ApprovalStep[];
  cancelled_at: string | null;
  cancelled_by_name: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// ── InfoRow ───────────────────────────────────────────────────────────────────

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium flex items-center gap-1">
        {icon}
        {value}
      </span>
    </div>
  );
}

// ── ApprovalActionForm ────────────────────────────────────────────────────────

function ApprovalActionForm({ leaveId, onActed }: { leaveId: number; onActed: (updated: LeaveDetail) => void }) {
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
        toast.error((data as { detail?: string }).detail ?? 'Failed to act on leave request.', { title: 'Error' });
      }
    } catch {
      toast.error('Network error. Please try again.', { title: 'Error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
      <p className="text-sm font-medium">Your Action</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setAction('approved')}
          className={cn('flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
            action === 'approved'
              ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
              : 'border-border bg-background hover:bg-muted')}
        >
          <CheckCircle2 className="size-3.5" /> Approve
        </button>
        <button
          type="button"
          onClick={() => setAction('disapproved')}
          className={cn('flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
            action === 'disapproved'
              ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
              : 'border-border bg-background hover:bg-muted')}
        >
          <XCircle className="size-3.5" /> Disapprove
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          Remarks {action === 'disapproved' && <span className="text-destructive">*</span>}
        </label>
        <textarea
          value={remarks}
          onChange={e => setRemarks(e.target.value)}
          maxLength={500}
          rows={2}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Optional remarks..."
        />
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!action || saving || (action === 'disapproved' && !remarks.trim())}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
        >
          {saving && <span className="size-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />}
          {saving ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    </form>
  );
}

// ── Leave Detail Modal (inline) ────────────────────────────────────────────────

interface LeaveDetailModalProps {
  leaveId: number | null;
  open: boolean;
  onClose: () => void;
  canApprove?: boolean;
  onUpdated?: (updated: LeaveDetail) => void;
  onCancelled?: (id: number) => void;
}

function LeaveDetailModal({ leaveId, open, onClose, canApprove = false, onUpdated, onCancelled }: LeaveDetailModalProps) {
  const [detail, setDetail] = useState<LeaveDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    if (!open || !leaveId) { setDetail(null); setShowCancelConfirm(false); return; }
    setShowCancelConfirm(false);
    setLoadingDetail(true);
    fetch(`/api/leave/requests/${leaveId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setDetail(d as LeaveDetail))
      .catch(() => toast.error('Failed to load leave details.', { title: 'Error' }))
      .finally(() => setLoadingDetail(false));
  }, [open, leaveId]);

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
        <div className="space-y-0.5">
          {rawTs && (
            <p className="text-[11px] text-[var(--color-text-muted)]">{formatStepTime(rawTs)}</p>
          )}
          <p className="text-xs font-medium text-[var(--color-text-primary)]">{displayName}</p>
          {displayPosition && (
            <p className="text-[11px] text-[var(--color-text-muted)]">{displayPosition}</p>
          )}
          {isPending && !rawTs && (
            <p className="text-[11px] text-[var(--color-text-muted)]">Waiting for the current approver to receive this request.</p>
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
      title: 'Cancelled',
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

  const hasPendingStep = detail?.approval_steps.some(s => s.status === 'pending') ?? false;
  const showActionForm = canApprove && hasPendingStep && detail?.status !== 'cancelled';

  return (
    <Modal open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <ModalContent className="max-w-lg">
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2 text-base font-semibold">
            <FileText className="size-4 text-primary" />
            Leave Request Details
          </ModalTitle>
        </ModalHeader>

        <ModalBody className="flex flex-col gap-5">
          {loadingDetail && (
            <div className="flex items-center justify-center py-8">
              <span className="size-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          )}

          {!loadingDetail && detail && (
            <>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-mono text-sm font-semibold text-primary">
                  <Hash className="size-3.5" />
                  {detail.control_number}
                </span>
                <StatusPill status={detail.status} label={detail.status_display} />
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <InfoRow label="Leave Type" value={detail.leave_type} />
                <InfoRow label="Duration" value={detail.duration_display} />
                <InfoRow label="Date From" value={formatDate(detail.date_start)} icon={<CalendarDays className="size-3.5 text-muted-foreground" />} />
                <InfoRow label="Date To" value={formatDate(detail.date_end)} icon={<CalendarDays className="size-3.5 text-muted-foreground" />} />
                <InfoRow label="Reason" value={detail.reason} />
                {detail.subreason && <InfoRow label="Sub-reason" value={detail.subreason} />}
                <InfoRow label="Hours" value={`${detail.hours} hr(s)`} />
                <InfoRow label="Deductible" value={detail.is_deductible ? 'Yes' : 'No'} />
                <InfoRow label="Filed On" value={detail.date_prepared_display} />
                {detail.employee_name && <InfoRow label="Employee" value={detail.employee_name} />}
                {detail.employee_id && <InfoRow label="ID Number" value={detail.employee_id} />}
              </div>

              {detail.remarks && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Remarks</span>
                  <p className="text-sm rounded-md bg-muted/50 border border-border px-3 py-2">{detail.remarks}</p>
                </div>
              )}

              {timelineItems.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Approval Chain</span>
                  <Timeline items={timelineItems} showConnectors showTimestamps={false} />
                </div>
              )}

              {showActionForm && <ApprovalActionForm leaveId={detail.id} onActed={handleActed} />}
            </>
          )}
        </ModalBody>

        {!loadingDetail && detail && (detail.can_cancel || detail.status === 'cancelled') && (
          <ModalFooter className="block">
            <AnimatePresence mode="wait" initial={false}>
              {showCancelConfirm ? (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col gap-3"
                >
                  <p className="text-sm text-muted-foreground">
                    Are you sure you want to cancel this leave request? This action cannot be undone.
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCancelConfirm(false)}
                      className="rounded-md border border-border bg-background px-4 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      Go Back
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium text-white bg-[var(--btn-danger-bg)] hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {cancelling
                        ? <span className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <Ban className="size-3.5" />
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
                  {detail.can_cancel && detail.status !== 'cancelled' ? (
                    <button
                      type="button"
                      onClick={() => setShowCancelConfirm(true)}
                      className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium text-white bg-[var(--btn-danger-bg)] hover:opacity-90 transition-opacity"
                    >
                      <Ban className="size-3.5" />
                      Cancel Leave
                    </button>
                  ) : <span />}
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md border border-border bg-background px-4 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    Close
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  );
}

// ── Status filter options ─────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'routing', label: 'Routing' },
  { value: 'approved', label: 'Approved' },
  { value: 'disapproved', label: 'Disapproved' },
  { value: 'cancelled', label: 'Cancelled' },
];

// ── Leave Types tab ───────────────────────────────────────────────────────────

function BoolBadge({ value, trueLabel = 'Yes', falseLabel = 'No' }: {
  value: boolean;
  trueLabel?: string;
  falseLabel?: string;
}) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
      value
        ? 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400'
        : 'bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400',
    )}>
      {value ? trueLabel : falseLabel}
    </span>
  );
}

interface TypeFormData {
  name: string;
  has_balance: boolean;
  deductible: boolean;
  requires_clinic_approval: boolean;
  is_active: boolean;
}

function defaultTypeForm(): TypeFormData {
  return {
    name: '',
    has_balance: false,
    deductible: true,
    requires_clinic_approval: false,
    is_active: true,
  };
}

function LeaveTypesTab({ isAdmin }: { isAdmin: boolean }) {
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LeaveType | null>(null);
  const [form, setForm] = useState<TypeFormData>(defaultTypeForm());
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchTypes = useCallback(async () => {
    try {
      const res = await fetch('/api/leave/admin/types', { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: LeaveType[] = await res.json();
      setTypes(data);
    } catch {
      toast.error('Could not load leave types. Is the server running?', { title: 'Connection Error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTypes(); }, [fetchTypes]);

  function openCreate() {
    setEditTarget(null);
    setForm(defaultTypeForm());
    setErrors({});
    setFormOpen(true);
  }

  function openEdit(t: LeaveType) {
    setEditTarget(t);
    setForm({
      name: t.name,
      has_balance: t.has_balance,
      deductible: t.deductible,
      requires_clinic_approval: t.requires_clinic_approval,
      is_active: t.is_active,
    });
    setErrors({});
    setFormOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setErrors({});
    try {
      const url = editTarget
        ? `/api/leave/admin/types/${editTarget.id}/`
        : '/api/leave/admin/types/';
      const method = editTarget ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(editTarget ? 'Leave type updated.' : 'Leave type created.', { title: 'Saved' });
        setFormOpen(false);
        fetchTypes();
      } else {
        const fieldErrors: Record<string, string> = {};
        for (const [k, v] of Object.entries(data)) {
          fieldErrors[k] = Array.isArray(v) ? v[0] : String(v);
        }
        setErrors(fieldErrors);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: LeaveType) {
    if (!confirm(`Delete leave type "${t.name}"? If requests exist it will be deactivated instead.`)) return;
    const res = await fetch(`/api/leave/admin/types/${t.id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-CSRFToken': getCsrfToken() },
    });
    if (res.status === 204) {
      toast.success('Leave type deleted.', { title: 'Deleted' });
    } else if (res.ok) {
      const d = await res.json();
      toast.success(d.detail, { title: 'Deactivated' });
    } else {
      toast.error('Could not delete leave type.', { title: 'Error' });
    }
    fetchTypes();
  }

  return (
    <div className="flex flex-col gap-4">
      {isAdmin && (
        <div className="flex justify-end">
          <button onClick={openCreate} className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="size-4" /> Add Leave Type
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <span className="size-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {['Name', 'Balance', 'Deductible', 'Clinic Required', 'Active', ...(isAdmin ? [''] : [])].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {types.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-6 text-sm">No leave types configured.</td></tr>
              ) : types.map(t => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5 font-medium">{t.name}</td>
                  <td className="px-3 py-2.5"><BoolBadge value={t.has_balance} /></td>
                  <td className="px-3 py-2.5"><BoolBadge value={t.deductible} /></td>
                  <td className="px-3 py-2.5"><BoolBadge value={t.requires_clinic_approval} /></td>
                  <td className="px-3 py-2.5"><BoolBadge value={t.is_active} trueLabel="Active" falseLabel="Inactive" /></td>
                  {isAdmin && (
                    <td className="px-3 py-2.5">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(t)} className="text-muted-foreground hover:text-foreground transition-colors"><Edit2 className="size-3.5" /></button>
                        <button onClick={() => handleDelete(t)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="size-3.5" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit modal */}
      <Modal open={formOpen} onOpenChange={v => { if (!v) setFormOpen(false); }}>
        <ModalContent className="max-w-md">
          <ModalHeader>
            <ModalTitle className="text-base font-semibold">
              {editTarget ? 'Edit Leave Type' : 'New Leave Type'}
            </ModalTitle>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className={cn(errors.name && 'border-destructive')}
                placeholder="e.g. Vacation Leave"
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            {(['has_balance', 'deductible', 'requires_clinic_approval', 'is_active'] as const).map(field => (
              <label key={field} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form[field]}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.checked }))}
                  className="rounded border-border"
                />
                <span className="text-sm">
                  {field === 'has_balance' && 'Track balance'}
                  {field === 'deductible' && 'Deductible from balance'}
                  {field === 'requires_clinic_approval' && 'Requires clinic approval'}
                  {field === 'is_active' && 'Active'}
                </span>
              </label>
            ))}
          </ModalBody>
          <ModalFooter className="flex justify-end gap-2">
            <button onClick={() => setFormOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted transition-colors">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {saving && <span className="size-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

// ── Reasons tab ───────────────────────────────────────────────────────────────

function ReasonsTab({ isAdmin }: { isAdmin: boolean }) {
  const [reasons, setReasons] = useState<LeaveReason[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LeaveReason | null>(null);
  const [form, setForm] = useState({ leave_types: [] as number[], title: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Sub-reason form
  const [subFormOpen, setSubFormOpen] = useState(false);
  const [subParent, setSubParent] = useState<LeaveReason | null>(null);
  const [subEditTarget, setSubEditTarget] = useState<LeaveSubreason | null>(null);
  const [subTitle, setSubTitle] = useState('');
  const [subSaving, setSubSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [rRes, tRes] = await Promise.all([
        fetch('/api/leave/admin/reasons', { credentials: 'include' }),
        fetch('/api/leave/admin/types', { credentials: 'include' }),
      ]);
      if (!rRes.ok || !tRes.ok) throw new Error(`${rRes.status}/${tRes.status}`);
      const [rData, tData] = await Promise.all([rRes.json(), tRes.json()]);
      setReasons(rData as LeaveReason[]);
      setTypes((tData as LeaveType[]).filter(t => t.is_active));
    } catch {
      toast.error('Could not load data. Is the server running?', { title: 'Connection Error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleSaveReason() {
    setSaving(true);
    setErrors({});
    try {
      const url = editTarget ? `/api/leave/admin/reasons/${editTarget.id}/` : '/api/leave/admin/reasons/';
      const method = editTarget ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ leave_types: form.leave_types, title: form.title }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(editTarget ? 'Reason updated.' : 'Reason created.', { title: 'Saved' });
        setFormOpen(false);
        fetchAll();
      } else {
        const fieldErrors: Record<string, string> = {};
        for (const [k, v] of Object.entries(data)) fieldErrors[k] = Array.isArray(v) ? v[0] : String(v);
        setErrors(fieldErrors);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteReason(r: LeaveReason) {
    if (!confirm(`Delete reason "${r.title}"?`)) return;
    const res = await fetch(`/api/leave/admin/reasons/${r.id}`, {
      method: 'DELETE', credentials: 'include',
      headers: { 'X-CSRFToken': getCsrfToken() },
    });
    if (res.status === 204) toast.success('Reason deleted.', { title: 'Deleted' });
    else { const d = await res.json(); toast.error(d.detail ?? 'Could not delete.', { title: 'Error' }); }
    fetchAll();
  }

  async function handleSaveSubreason() {
    if (!subParent || !subTitle.trim()) return;
    setSubSaving(true);
    try {
      const url = subEditTarget
        ? `/api/leave/admin/subreasons/${subEditTarget.id}/`
        : '/api/leave/admin/subreasons/';
      const method = subEditTarget ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ reason: subParent.id, title: subTitle }),
      });
      if (res.ok) {
        toast.success(subEditTarget ? 'Sub-reason updated.' : 'Sub-reason added.', { title: 'Saved' });
        setSubFormOpen(false);
        fetchAll();
      } else {
        const d = await res.json();
        toast.error(d.detail ?? d.title?.[0] ?? 'Failed to save.', { title: 'Error' });
      }
    } finally {
      setSubSaving(false);
    }
  }

  async function handleDeleteSubreason(s: LeaveSubreason) {
    if (!confirm(`Delete sub-reason "${s.title}"?`)) return;
    const res = await fetch(`/api/leave/admin/subreasons/${s.id}`, {
      method: 'DELETE', credentials: 'include',
      headers: { 'X-CSRFToken': getCsrfToken() },
    });
    if (res.status === 204) toast.success('Sub-reason deleted.', { title: 'Deleted' });
    else { const d = await res.json(); toast.error(d.detail ?? 'Could not delete.', { title: 'Error' }); }
    fetchAll();
  }

  return (
    <div className="flex flex-col gap-4">
      {isAdmin && (
        <div className="flex justify-end">
          <button onClick={() => {
            setEditTarget(null);
            setForm({ leave_types: [], title: '' });
            setErrors({});
            setFormOpen(true);
          }} className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="size-4" /> Add Reason
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <span className="size-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {['Leave Type', 'Reason', 'Sub-reasons', ...(isAdmin ? [''] : [])].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reasons.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-muted-foreground py-6 text-sm">No reasons configured.</td></tr>
              ) : reasons.map(r => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5 text-muted-foreground">{r.leave_type_names?.join(', ')}</td>
                  <td className="px-3 py-2.5 font-medium">{r.title}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {r.subreasons.map(s => (
                        <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                          {s.title}
                          {isAdmin && (
                            <>
                              <button onClick={() => {
                                setSubParent(r);
                                setSubEditTarget(s);
                                setSubTitle(s.title);
                                setSubFormOpen(true);
                              }} className="text-muted-foreground hover:text-foreground"><Edit2 className="size-2.5" /></button>
                              <button onClick={() => handleDeleteSubreason(s)} className="text-muted-foreground hover:text-destructive"><X className="size-2.5" /></button>
                            </>
                          )}
                        </span>
                      ))}
                      {isAdmin && (
                        <button onClick={() => {
                          setSubParent(r);
                          setSubEditTarget(null);
                          setSubTitle('');
                          setSubFormOpen(true);
                        }} className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20 transition-colors">
                          <Plus className="size-2.5 mr-0.5" /> Add
                        </button>
                      )}
                    </div>
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2.5">
                      <div className="flex gap-2">
                        <button onClick={() => {
                          setEditTarget(r);
                          setForm({ leave_types: r.leave_types ?? [], title: r.title });
                          setErrors({});
                          setFormOpen(true);
                        }} className="text-muted-foreground hover:text-foreground transition-colors"><Edit2 className="size-3.5" /></button>
                        <button onClick={() => handleDeleteReason(r)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="size-3.5" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reason form */}
      <Modal open={formOpen} onOpenChange={v => { if (!v) setFormOpen(false); }}>
        <ModalContent className="max-w-sm">
          <ModalHeader>
            <ModalTitle className="text-base font-semibold">{editTarget ? 'Edit Reason' : 'New Reason'}</ModalTitle>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Leave Types <span className="text-destructive">*</span></label>
              <div className="grid gap-2 sm:grid-cols-2">
                {types.map((t) => {
                  const selected = form.leave_types.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setForm((f) => ({
                          ...f,
                          leave_types: selected
                            ? f.leave_types.filter((id) => id !== t.id)
                            : [...f.leave_types, t.id],
                        }));
                      }}
                      className={cn(
                        'rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                        selected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background text-foreground hover:border-primary hover:bg-primary/5',
                      )}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
              {errors.leave_types && <p className="text-xs text-destructive">{errors.leave_types}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Title <span className="text-destructive">*</span></label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={cn(errors.title && 'border-destructive')} placeholder="Reason title" />
              {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
            </div>
          </ModalBody>
          <ModalFooter className="flex justify-end gap-2">
            <button onClick={() => setFormOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted transition-colors">Cancel</button>
            <button onClick={handleSaveReason} disabled={saving || form.leave_types.length === 0 || !form.title.trim()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2">
              {saving && <span className="size-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Sub-reason form */}
      <Modal open={subFormOpen} onOpenChange={v => { if (!v) setSubFormOpen(false); }}>
        <ModalContent className="max-w-sm">
          <ModalHeader>
            <ModalTitle className="text-base font-semibold">
              {subEditTarget ? 'Edit Sub-reason' : `Add Sub-reason to "${subParent?.title ?? ''}"`}
            </ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Title <span className="text-destructive">*</span></label>
              <Input value={subTitle} onChange={e => setSubTitle(e.target.value)} placeholder="Sub-reason title" />
            </div>
          </ModalBody>
          <ModalFooter className="flex justify-end gap-2">
            <button onClick={() => setSubFormOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted transition-colors">Cancel</button>
            <button onClick={handleSaveSubreason} disabled={subSaving || !subTitle.trim()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2">
              {subSaving && <span className="size-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />}
              {subSaving ? 'Saving…' : 'Save'}
            </button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

// ── Balance Upload tab ────────────────────────────────────────────────────────

function BalanceUploadTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/leave/admin/balance-upload', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
        body: fd,
      });
      if (res.ok) {
        const d = await res.json();
        toast.success(d.detail, { title: 'Upload Successful' });
        setFileName(null);
        if (fileRef.current) fileRef.current.value = '';
      } else if (res.headers.get('Content-Type')?.includes('spreadsheet')) {
        // Error report returned
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'leave_balance_upload_errors.xlsx';
        a.click();
        URL.revokeObjectURL(url);
        toast.error('Upload failed. An error report has been downloaded.', { title: 'Upload Failed' });
      } else {
        const d = await res.json();
        toast.error(d.detail ?? 'Upload failed.', { title: 'Upload Failed' });
      }
    } catch {
      toast.error('Network error. Please try again.', { title: 'Error' });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium text-sm">Bulk Balance Upload</h3>
          <p className="text-xs text-muted-foreground">
            Upload an Excel file to set or update employee leave balances. The file must contain columns:{' '}
            <strong>ID Number</strong>, <strong>Employee Name</strong>, <strong>Leave Type</strong>,{' '}
            <strong>Period Start</strong>, <strong>Period End</strong>, <strong>Entitled Leave</strong>.
          </p>
        </div>

        {/* Drop zone */}
        <label
          htmlFor="balance-file"
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-colors',
            fileName
              ? 'border-primary/50 bg-primary/5'
              : 'border-border hover:border-primary/40 hover:bg-muted/30',
          )}
        >
          <Upload className={cn('size-6', fileName ? 'text-primary' : 'text-muted-foreground')} />
          {fileName ? (
            <span className="text-sm font-medium text-primary">{fileName}</span>
          ) : (
            <>
              <span className="text-sm text-muted-foreground">Click or drag to upload</span>
              <span className="text-xs text-muted-foreground/70">.xlsx files only</span>
            </>
          )}
        </label>
        <input
          ref={fileRef}
          id="balance-file"
          type="file"
          accept=".xlsx"
          className="sr-only"
          onChange={e => setFileName(e.target.files?.[0]?.name ?? null)}
        />

        <button
          onClick={handleUpload}
          disabled={!fileName || uploading}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {uploading && <span className="size-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />}
          {uploading ? 'Uploading…' : 'Upload Balances'}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        If any rows contain errors, the upload is rejected and an error report Excel file will be automatically downloaded.
        Fix the errors in the report and re-upload.
      </p>
    </div>
  );
}

// ── All Requests tab ──────────────────────────────────────────────────────────

function AllRequestsTab({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortField, setSortField] = useState('date_prepared');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const skeletonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRows = useCallback(async (
    p: number,
    q: string,
    status: string,
    field: string,
    dir: 'asc' | 'desc',
    isInitial = false,
  ) => {
    if (isInitial) {
      setLoading(true);
    } else {
      if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
      skeletonTimerRef.current = setTimeout(() => setTransitioning(true), 0);
    }
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set('search', q);
      if (status !== 'all') params.set('status', status);
      if (field) params.set('ordering', dir === 'desc' ? `-${field}` : field);
      const res = await fetch(`/api/leave/admin/requests?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: PagedResponse = await res.json();
      setRows(data.results);
      setTotalPages(data.total_pages);
      setTotalCount(data.count);
    } catch {
      toast.error('Could not load leave requests.', { title: 'Connection Error' });
    } finally {
      if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
      setLoading(false);
      setTransitioning(false);
    }
  }, []);

  const triggerFetch = useCallback((
    p: number,
    q: string,
    status: string,
    field: string,
    dir: 'asc' | 'desc',
  ) => {
    if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
    setTransitioning(true);
    skeletonTimerRef.current = setTimeout(() => {
      fetchRows(p, q, status, field, dir);
    }, 1000);
  }, [fetchRows]);

  useEffect(() => {
    fetchRows(1, '', 'all', 'date_prepared', 'desc', true);
    return () => { if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current); };
  }, [fetchRows]);

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/leave/admin/export?${params}`, { credentials: 'include' });
      if (!res.ok) { toast.error('Export failed.', { title: 'Error' }); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'leave_requests_export.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  function handleSort(field: string) {
    const nextDir = field === sortField && sortDir === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDir(nextDir);
    setPage(1);
    triggerFetch(1, search, statusFilter, field, nextDir);
  }

  function handleSearch(q: string) {
    setSearch(q);
    setPage(1);
    triggerFetch(1, q, statusFilter, sortField, sortDir);
  }

  function handleStatusFilter(val: string) {
    setStatusFilter(val);
    setPage(1);
    triggerFetch(1, search, val, sortField, sortDir);
  }

  const statusFilterContent = (
    <div className="flex flex-col gap-1 min-w-[140px]">
      {STATUS_OPTIONS.map(o => (
        <button
          key={o.value}
          onClick={() => handleStatusFilter(o.value)}
          className={cn(
            'w-full text-left rounded px-2 py-1.5 text-sm transition-colors',
            statusFilter === o.value
              ? 'bg-primary/10 text-primary font-medium'
              : 'hover:bg-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  const columns: DataTableColumn<LeaveRequest>[] = useMemo(() => [
    {
      key: 'control_number',
      label: 'Control No.',
      sortField: 'control_number',
      render: row => <span className="font-mono text-xs font-semibold text-primary">{row.control_number}</span>,
    },
    {
      key: 'employee',
      label: 'Employee',
      sortField: 'employee_name',
      render: row => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{row.employee_name ?? '—'}</span>
          <span className="text-xs text-muted-foreground">{row.employee_id ?? ''}</span>
        </div>
      ),
    },
    {
      key: 'leave_type',
      label: 'Leave Type',
      sortField: 'leave_type',
      render: row => <span className="text-sm">{row.leave_type}</span>,
    },
    {
      key: 'duration',
      label: 'Duration',
      sortField: 'days_count',
      render: row => <span className="text-sm">{row.duration_display}</span>,
    },
    {
      key: 'date_prepared',
      label: 'Filed On',
      sortField: 'date_prepared',
      render: row => <span className="text-sm text-muted-foreground">{row.date_prepared_display}</span>,
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
      label: '',
      render: row => (
        <button
          onClick={() => { setDetailId(row.id); setDetailOpen(true); }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View
        </button>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [statusFilter, statusFilterContent]);

  return (
    <>
      <AdminTableSection<LeaveRequest>
        search={search}
        onSearchChange={handleSearch}
        searchPlaceholder="Search leave requests…"
        actions={
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {exporting
              ? <span className="size-3.5 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
              : <Download className="size-4" />
            }
            Export
          </button>
        }
        columns={columns}
        rows={rows}
        rowKey={r => r.id}
        loading={loading}
        transitioning={transitioning}
        skeletonRows={10}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        totalPages={totalPages}
        pageSize={10}
        totalCount={totalCount}
        onPageChange={p => { setPage(p); fetchRows(p, search, statusFilter, sortField, sortDir); }}
        emptyTitle="No leave requests"
        emptyDescription="No leave requests found for the selected filter."
        emptyIcons={[CalendarDays, ClipboardList, Clock]}
      />

      <LeaveDetailModal
        leaveId={detailId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        canApprove={isAdmin}
        onUpdated={() => fetchRows(page, search, statusFilter, sortField, sortDir)}
        onCancelled={() => { fetchRows(page, search, statusFilter, sortField, sortDir); setDetailOpen(false); }}
      />
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LeaveAdminPage() {
  const router = useRouter();
  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');
  const [user, setUser] = useState<UserData | null>(null);

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

  const isAdmin = user.admin;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 w-full">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Settings2 className="size-5 text-primary" />
            Leave Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure leave types, reasons, and manage balances
          </p>
        </div>
        <button
          onClick={() => router.push('/dashboard/leave')}
          className="text-xs font-medium text-primary hover:underline"
        >
          ← Back to Leave Requests
        </button>
      </div>

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTab value="requests">
            <ClipboardList className="size-3.5" />
            All Requests
          </TabsTab>
          <TabsTab value="types">
            <Briefcase className="size-3.5" />
            Leave Types
          </TabsTab>
          <TabsTab value="reasons">
            <Tag className="size-3.5" />
            Reasons
          </TabsTab>
          <TabsTab value="balances">
            <Upload className="size-3.5" />
            Balances
          </TabsTab>
        </TabsList>

        <TabsPanel value="requests" className="pt-4">
          <AllRequestsTab isAdmin={isAdmin} />
        </TabsPanel>

        <TabsPanel value="types" className="pt-4">
          <LeaveTypesTab isAdmin={isAdmin} />
        </TabsPanel>

        <TabsPanel value="reasons" className="pt-4">
          <ReasonsTab isAdmin={isAdmin} />
        </TabsPanel>

        <TabsPanel value="balances" className="pt-4">
          <BalanceUploadTab />
        </TabsPanel>
      </Tabs>
    </div>
  );
}

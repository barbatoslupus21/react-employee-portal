'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { MultiSeriesChart, ChartSkeleton } from '@/components/ui/multi-series-chart';
import { DataTable } from '@/components/ui/data-table';
import type { DataTableColumn } from '@/components/ui/data-table';
import { StatusPill } from '@/components/ui/status-pill';
import {
  X,
  BarChart2,
  TrendingUp,
  Eye,
  CheckCheck,
  Check,
  ShieldCheck,
  Download,
  ClipboardList,
  FileText,
  SearchIcon,
  XCircle,
  AlertTriangle,
  Ban,
  ListFilter,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import SearchBar from '@/components/ui/searchbar';
import { useDebounce } from '@/hooks/use-debounce';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { toast } from '@/components/ui/toast';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { getCsrfToken } from '@/lib/csrf';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TextareaWithCharactersLeft } from '@/components/ui/textarea-with-characters-left';


// ── Types ──────────────────────────────────────────────────────────────────────

interface UserData {
  id: number;
  idnumber: string;
  firstname: string | null;
  lastname: string | null;
  admin: boolean;
}

interface AdminPRFItem {
  id: number;
  prf_control_number: string;
  prf_category: string;
  prf_category_display: string;
  prf_type: string;
  prf_type_display: string;
  purpose: string;
  control_number: string | null;
  status: string;
  status_display: string;
  admin_remarks: string | null;
  employee_idnumber: string;
  employee_firstname: string;
  employee_lastname: string;
  created_at: string;
  updated_at: string;
}

interface AdminListResponse {
  results: AdminPRFItem[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface ChartDataPoint {
  label:      string;
  government: number;
  banking:    number;
  hr_payroll: number;
  [key: string]: number | string;
}

interface ChartResponse {
  view: string;
  fy_start: number;
  data: ChartDataPoint[];
}

type ViewType = 'fiscal' | 'monthly' | 'weekly';
type ChartType = 'bar' | 'line';
type SortField = 'prf_control_number' | 'prf_type' | 'status' | 'created_at' | 'employee__idnumber';
type SortDir = 'asc' | 'desc';

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'pending',     label: 'Pending' },
  { value: 'approved',    label: 'Approved' },
  { value: 'disapproved', label: 'Disapproved' },
  { value: 'cancelled',   label: 'Cancelled' },
];

const PAGE_SIZE = 10;

const PRF_TYPES_FLAT = [
  { value: 'pagibig_loan',              label: 'PAG-IBIG Loan' },
  { value: 'pagibig_cert_payment',      label: 'PAG-IBIG Cert of Payment' },
  { value: 'pagibig_cert_contribution', label: 'PAG-IBIG Cert of Contribution' },
  { value: 'philhealth_form',           label: 'PHILHEALTH Form' },
  { value: 'sss_loan',                  label: 'SSS Loan' },
  { value: 'sss_maternity',             label: 'SSS Maternity Benefits' },
  { value: 'sss_sickness',              label: 'SSS Sickness Benefits' },
  { value: 'bir_form',                  label: 'BIR Form (2316/1902)' },
  { value: 'rcbc_maintenance',          label: 'RCBC Maintenance Form' },
  { value: 'bank_deposit',              label: 'Bank Deposit' },
  { value: 'payroll_adjustment',        label: 'Payroll Adjustment' },
  { value: 'id_replacement',            label: 'ID Replacement' },
  { value: 'pcoe_compensation',         label: 'PCOE with Compensation' },
  { value: 'certificate_employment',    label: 'Certificate of Employment' },
  { value: 'clearance_form',            label: 'Clearance Form' },
  { value: 'emergency_loan',            label: 'Emergency Loan' },
  { value: 'medical_loan',              label: 'Medical Assistance Loan' },
  { value: 'educational_loan',          label: 'Educational Assistance Loan' },
  { value: 'coop_loan',                 label: 'Coop Loan' },
  { value: 'medicine_allowance',        label: 'Medicine Allowance' },
  { value: 'uniform_ppe',               label: 'Uniform Caps / PPE T-shirt' },
  { value: 'others',                    label: 'Others' },
];

const CHART_CATEGORIES = [
  { key: 'government' as const, label: 'Government',   color: '#2845D6', gradId: 'grad_gov',  lightColor: '#5B78E8' },
  { key: 'banking'    as const, label: 'Banking',      color: '#10B981', gradId: 'grad_bank', lightColor: '#34D399' },
  { key: 'hr_payroll' as const, label: 'HR & Payroll', color: '#F59E0B', gradId: 'grad_hr',   lightColor: '#FCD34D' },
];

const VIEW_LABELS: Record<ViewType, string> = {
  fiscal:  'Fiscal Year',
  monthly: 'Monthly',
  weekly:  'Weekly',
};

// ── Week-options helpers ──────────────────────────────────────────────────────

function getCurrentWeekStart(): string {
  const now  = new Date();
  const dow  = now.getDay(); // 0 = Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon  = new Date(now);
  mon.setDate(now.getDate() + diff);
  return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
}

function getWeekStartOptions(fyStart: number): { label: string; value: string }[] {
  const opts: { label: string; value: string }[] = [];
  const fyEnd = new Date(fyStart + 1, 3, 30);
  const may1  = new Date(fyStart, 4, 1);
  const dow   = may1.getDay();
  const cur   = new Date(may1);
  cur.setDate(may1.getDate() - (dow === 0 ? 6 : dow - 1));
  while (cur <= fyEnd) {
    const sun   = new Date(cur);
    sun.setDate(cur.getDate() + 6);
    const value = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
    const label = `${cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    opts.push({ label, value });
    cur.setDate(cur.getDate() + 7);
  }
  return opts;
}

function getFYMonths(fyStart: number): { value: number; year: number; label: string }[] {
  const MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return [5,6,7,8,9,10,11,12,1,2,3,4].map(m => ({
    value: m,
    year:  m >= 5 ? fyStart : fyStart + 1,
    label: `${MN[m - 1]} ${m >= 5 ? fyStart : fyStart + 1}`,
  }));
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function currentFYStart(): number {
  const now = new Date();
  return now.getMonth() >= 4 ? now.getFullYear() : now.getFullYear() - 1;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}



// ── Shared detail field ────────────────────────────────────────────────────────

function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className={cn('text-sm text-[var(--color-text-primary)] mt-0.5', mono ? 'font-mono text-xs' : '')}>
        {value || '—'}
      </p>
    </div>
  );
}

// ── Review PRF Modal (pending → approve / disapprove) ─────────────────────────

function ReviewPRFModal({
  item,
  onClose,
  onSuccess,
}: {
  item: AdminPRFItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [remarks,      setRemarks]      = useState('');
  const [remarksErr,   setRemarksErr]   = useState('');
  const [approving,    setApproving]    = useState(false);
  const [disapproving, setDisapproving] = useState(false);

  const busy = approving || disapproving;

  const BLOCKED = /[<>{}[\]\\|^~`"]/;
  function handleRemarksChange(val: string) {
    setRemarks(val);
    if (BLOCKED.test(val)) {
      setRemarksErr('Special characters like < > { } [ ] \\ | ^ ~ ` " are not allowed.');
    } else if (val.length > 300) {
      setRemarksErr('Remarks cannot exceed 300 characters.');
    } else {
      setRemarksErr('');
    }
  }

  async function handleAction(action: 'approved' | 'disapproved') {
    if (action === 'disapproved' && !remarks.trim()) {
      setRemarksErr('Remarks are required when disapproving.');
      return;
    }
    if (remarksErr) return;
    if (action === 'approved') setApproving(true);
    else setDisapproving(true);
    try {
      const res = await fetch(`/api/prform/admin/requests/${item.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ status: action, admin_remarks: remarks.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = (err as { admin_remarks?: string[]; detail?: string }).admin_remarks?.[0]
          ?? (err as { detail?: string }).detail
          ?? `Failed to ${action === 'approved' ? 'approve' : 'disapprove'} request.`;
        toast.error(msg);
        return;
      }
      const updated: AdminPRFItem = await res.json();
      toast.success(`Request ${action === 'approved' ? 'approved' : 'disapproved'} successfully.`);
      onSuccess();
    } finally {
      setApproving(false);
      setDisapproving(false);
    }
  }

  const employeeName = [item.employee_firstname, item.employee_lastname].filter(Boolean).join(' ') || item.employee_idnumber;
  const typeLabel = item.prf_type === 'others' && item.control_number
    ? `Others: ${item.control_number}`
    : item.prf_type_display;
  const fmtShort = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Review PRF Request</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-40">
            <X size={15} />
          </button>
        </div>

        {/* PRF No. + status + date */}
        <div className="flex items-center justify-between px-6 pt-4 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-[var(--color-text-primary)]">{item.prf_control_number}</span>
            <StatusPill status={item.status} label={item.status_display} />
          </div>
          <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">{fmtShort(item.created_at)}</span>
        </div>

        {/* Scrollable body */}
        <div className="px-6 pb-2 max-h-[calc(100vh-22rem)] overflow-y-auto [scrollbar-width:thin]">
          {/* Section: PRF Request Information */}
          <div className="flex items-center gap-3 pt-1 pb-3">
            <p className="text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap">PRF Request Information</p>
            <div className="flex-1 h-px bg-[var(--color-border)]" />
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <DetailField label="Employee" value={`${employeeName} (${item.employee_idnumber})`} />
            <DetailField label="PRF Category" value={item.prf_category_display} />
            <DetailField label="PRF Type"     value={typeLabel} />
            {item.prf_type !== 'others' && item.control_number && (
              <DetailField label="Control No." value={item.control_number} mono />
            )}
          </div>

          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Purpose of Request:</p>
            <p className="text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">{item.purpose}</p>
          </div>

          {/* Section: Approval */}
          <div className="flex items-center gap-3 pt-5 pb-3">
            <p className="text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap">Request Approval</p>
            <div className="flex-1 h-px bg-[var(--color-border)]" />
          </div>

          <div className="space-y-1.5 pb-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Admin Remarks{' '}
              <span className="font-normal normal-case tracking-normal text-[var(--color-text-muted)]">
                (required when disapproving)
              </span>
            </label>
            <TextareaWithCharactersLeft
              rows={3}
              value={remarks}
              onChange={e => handleRemarksChange(e.target.value)}
              placeholder="Enter remarks…"
              maxLength={300}
              error={remarksErr}
              className="text-sm resize-none"
              disabled={busy}
            />
          </div>
        </div>

        {/* Footer: Disapprove + Approve */}
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleAction('disapproved')}
            disabled={busy || !!remarksErr}
            className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium
              bg-[var(--btn-danger-bg)] text-[var(--btn-danger-text)]
              hover:bg-[var(--btn-danger-hover)]
              transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {disapproving
              ? <TextShimmer className="text-sm" duration={1.2}>Disapproving…</TextShimmer>
              : <><Ban size={13} /><span>Disapprove</span></>}
          </button>
          <button
            type="button"
            onClick={() => handleAction('approved')}
            disabled={busy || !!remarksErr}
            className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium
              bg-[var(--btn-success-bg)] text-[var(--btn-success-text)]
              hover:bg-[var(--btn-success-hover)]
              transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {approving
              ? <TextShimmer className="text-sm" duration={1.2}>Approving…</TextShimmer>
              : <><Check size={13} /><span>Approve</span></>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Admin View Modal (non-pending — read-only) ─────────────────────────────────

function AdminViewPRFModal({
  item,
  onClose,
}: {
  item: AdminPRFItem;
  onClose: () => void;
}) {
  const employeeName = [item.employee_firstname, item.employee_lastname].filter(Boolean).join(' ') || item.employee_idnumber;
  const typeLabel = item.prf_type === 'others' && item.control_number
    ? `Others: ${item.control_number}`
    : item.prf_type_display;
  const fmtShort = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
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
        className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">View PRF Request</h2>
          <button type="button" onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* PRF No. + status + date */}
        <div className="flex items-center justify-between px-6 pt-4 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-[var(--color-text-primary)]">{item.prf_control_number}</span>
            <StatusPill status={item.status} label={item.status_display} />
          </div>
          <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">{fmtShort(item.created_at)}</span>
        </div>

        {/* Section heading */}
        <div className="px-6 pt-1 pb-3">
          <div className="flex items-center gap-3">
            <p className="text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap">PRF Request Information</p>
            <div className="flex-1 h-px bg-[var(--color-border)]" />
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-2 max-h-[calc(100vh-16rem)] overflow-y-auto [scrollbar-width:thin]">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <DetailField label="Employee"     value={`${employeeName} (${item.employee_idnumber})`} />
            <DetailField label="PRF Category" value={item.prf_category_display} />
            <DetailField label="PRF Type"     value={typeLabel} />
            {item.prf_type !== 'others' && item.control_number && (
              <DetailField label="Control No." value={item.control_number} mono />
            )}
          </div>

          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Purpose of Request:</p>
            <p className="text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">{item.purpose}</p>
          </div>

          {item.admin_remarks && (
            <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1">Admin Remarks:</p>
              <p className="text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">{item.admin_remarks}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex justify-end border-t border-[var(--color-border)]">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors">
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Admin Cancel Confirm Modal ─────────────────────────────────────────────────

function AdminCancelConfirmModal({
  item,
  onClose,
  onSuccess,
}: {
  item: AdminPRFItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    setConfirming(true);
    try {
      const res = await fetch(`/api/prform/admin/requests/${item.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ status: 'cancelled', admin_remarks: '' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { detail?: string }).detail ?? 'Failed to cancel request.');
        return;
      }
      await res.json();
      toast.success('PRF request cancelled successfully.');
      onSuccess();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <ConfirmationModal
      title="Cancel PRF Request"
      message={`Are you sure you want to cancel PRF request ${item.prf_control_number}? This action cannot be undone.`}
      confirmLabel="Yes, cancel it"
      cancelLabel="No, keep it"
      confirming={confirming}
      onConfirm={handleConfirm}
      onCancel={onClose}
      icon={<X size={0} className="text-red-600" />}
    />
  );
}

// ── FilterListContent ─────────────────────────────────────────────────────────
// Radio-style scrollable filter list for DataTable filter popovers.
function FilterListContent({
  options,
  value,
  onChange,
  allLabel = 'All',
}: {
  options:  { value: string; label: string }[];
  value:    string;
  onChange: (v: string) => void;
  allLabel?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp,   setCanScrollUp  ] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  function checkScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 4);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }

  useEffect(() => { setTimeout(checkScroll, 0); }, []);

  return (
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
        <button
          type="button"
          onClick={() => onChange('')}
          className={cn(
            'w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors',
            !value
              ? 'bg-[#2845D6]/10 font-medium text-[#2845D6]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]',
          )}
        >
          {allLabel}
        </button>
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors',
              value === o.value
                ? 'bg-[#2845D6]/10 font-medium text-[#2845D6]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {canScrollDown && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center bg-gradient-to-t from-[var(--color-bg-elevated)] pb-0.5 pt-3">
          <ChevronDown size={12} className="text-[var(--color-text-muted)]" />
        </div>
      )}
    </div>
  );
}

// ── PRF Category map for export filter ────────────────────────────────────────
const PRF_CATEGORIES_FLAT = [
  { value: 'government', label: 'Government Transaction' },
  { value: 'banking',    label: 'Banking and Finance' },
  { value: 'hr_payroll', label: 'Human Resources and Payroll' },
];

// ── Export Modal ───────────────────────────────────────────────────────────────
function ExportModal({ onClose }: { onClose: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom,    setDateFrom]    = useState(today);
  const [dateTo,      setDateTo]      = useState(today);
  const [category,    setCategory]    = useState('all');
  const [prfType,     setPrfType]     = useState('all');
  const [status,      setStatus]      = useState('all');
  const [generating,  setGenerating]  = useState(false);

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    try {
      const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      if (category && category !== 'all') p.set('prf_category', category);
      if (prfType  && prfType  !== 'all') p.set('prf_type',     prfType);
      if (status   && status   !== 'all') p.set('status',       status);

      const res = await fetch(`/api/prform/admin/export?${p}`, { credentials: 'include' });
      if (!res.ok) {
        let detail = 'Export failed. Please try again.';
        try { const j = await res.json(); detail = j.detail ?? detail; } catch { /* ignore */ }
        toast.error(detail);
        return;
      }
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('spreadsheetml')) {
        toast.error('Export failed: unexpected server response.');
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href          = url;
      a.download      = `prf-requests-${dateFrom}-to-${dateTo}.xlsx`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      onClose();
    } catch {
      toast.error('Export failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-xl p-6 flex flex-col gap-5"
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.18 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Export PRF Requests</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--color-bg-card)] transition-colors">
            <X size={16} className="text-[var(--color-text-muted)]" />
          </button>
        </div>

        {/* Date range */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-text-muted)]">From</span>
              <input
                type="date" value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-text-muted)]">To</span>
              <input
                type="date" value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </label>
          </div>
        </div>

        {/* Optional filters */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <span className="text-xs text-[var(--color-text-muted)]">PRF Category</span>
            <Select value={category} onValueChange={v => { setCategory(v); setPrfType('all'); }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {PRF_CATEGORIES_FLAT.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <AnimatePresence initial={false}>
            {category && category !== 'all' && (
              <motion.div
                key="prf-type-filter"
                initial={{ height: 0, opacity: 0, y: -6 }}
                animate={{ height: 'auto', opacity: 1, y: 0 }}
                exit={{ height: 0, opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-2 pt-1">
                  <span className="text-xs text-[var(--color-text-muted)]">PRF Type</span>
                  <Select value={prfType} onValueChange={setPrfType}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="pagibig_loan">PAG-IBIG Loan</SelectItem>
                      <SelectItem value="pagibig_cert_payment">PAG-IBIG Certificate of Payment</SelectItem>
                      <SelectItem value="pagibig_cert_contribution">PAG-IBIG Certificate of Contribution</SelectItem>
                      <SelectItem value="philhealth_form">PHILHEALTH Form</SelectItem>
                      <SelectItem value="sss_loan">SSS Loan</SelectItem>
                      <SelectItem value="sss_maternity">SSS Maternity Benefits</SelectItem>
                      <SelectItem value="sss_sickness">SSS Sickness Benefits</SelectItem>
                      <SelectItem value="bir_form">BIR Form (2316/1902)</SelectItem>
                      <SelectItem value="rcbc_maintenance">RCBC Maintenance Form</SelectItem>
                      <SelectItem value="bank_deposit">Bank Deposit</SelectItem>
                      <SelectItem value="payroll_adjustment">Payroll Adjustment</SelectItem>
                      <SelectItem value="id_replacement">ID Replacement</SelectItem>
                      <SelectItem value="pcoe_compensation">PCOE with Compensation</SelectItem>
                      <SelectItem value="certificate_employment">Certificate of Employment</SelectItem>
                      <SelectItem value="clearance_form">Clearance Form</SelectItem>
                      <SelectItem value="emergency_loan">Emergency Loan</SelectItem>
                      <SelectItem value="medical_loan">Medical Assistance Loan</SelectItem>
                      <SelectItem value="educational_loan">Educational Assistance Loan</SelectItem>
                      <SelectItem value="coop_loan">Coop Loan</SelectItem>
                      <SelectItem value="medicine_allowance">Medicine Allowance</SelectItem>
                      <SelectItem value="uniform_ppe">Uniform / Caps / PPE / T-shirt</SelectItem>
                      <SelectItem value="others">Others</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col gap-2">
            <span className="text-xs text-[var(--color-text-muted)]">Status</span>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="disapproved">Disapproved</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end pt-1">
          <button
            type="button" onClick={handleGenerate} disabled={generating}
            className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium
              bg-[var(--btn-primary-bg)] text-[var(--btn-success-text)]
              hover:bg-[var(--btn-primary-hover)]
              transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={14} />
            {generating
              ? <TextShimmer className="text-xs" duration={1.2}>Generating…</TextShimmer>
              : <><span>Generate Excel</span></>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function PRFAdminPage() {
  const router = useRouter();

  // ── Auth ───────────────────────────────────────────────────────────────────
  const [user, setUser] = useState<UserData | null>(null);
  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');

  useEffect(() => {
    const toChecking = setTimeout(() => setAuthPhase('checking'), 300);
    let checkingShownAt = 0;
    setTimeout(() => { checkingShownAt = Date.now(); }, 300);

    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => {
        if (!r.ok) { router.replace('/'); return null; }
        return r.json() as Promise<UserData>;
      })
      .then(u => {
        if (!u) return;
        if (!u.admin) { router.replace('/dashboard/pr-form'); return; }
        setUser(u);
        const elapsed = Date.now() - checkingShownAt;
        const remaining = checkingShownAt === 0 ? 600 : Math.max(0, 600 - elapsed);
        setTimeout(() => setAuthPhase('done'), remaining);
      })
      .catch(() => router.replace('/'));

    return () => clearTimeout(toChecking);
  }, [router]);

  // ── Chart state ────────────────────────────────────────────────────────────
  const [chartView,      setChartView]      = useState<ViewType>('fiscal');
  const [chartType,      setChartType]      = useState<ChartType>('bar');
  const [fyStart,        setFyStart]        = useState<number>(currentFYStart());
  const [chartMonth,     setChartMonth]     = useState<number>(new Date().getMonth() + 1);
  const [chartWeekStart, setChartWeekStart] = useState<string>(getCurrentWeekStart());
  const [chartData,      setChartData]      = useState<ChartDataPoint[]>([]);
  const [chartLoading,   setChartLoading]   = useState(false);
  const [chartTransitioning, setChartTransitioning] = useState(false);
  const chartInitialized = useRef(false);

  // ── Table state ────────────────────────────────────────────────────────────
  const [search,       setSearch]       = useState('');
  const debouncedSearch                 = useDebounce(search, 350);
  const [statusFilter, setStatusFilter] = useState('');
  const [prfTypeFilter,setPrfTypeFilter]= useState('');
  const [sortField,    setSortField]    = useState<SortField>('created_at');
  const [sortDir,      setSortDir]      = useState<SortDir>('desc');
  const [page,         setPage]         = useState(1);
  const [rows,         setRows]         = useState<AdminPRFItem[]>([]);
  const [totalPages,   setTotalPages]   = useState(1);
  const [totalCount,   setTotalCount]   = useState(0);
  const [tableLoading, setTableLoading] = useState(false);
  const tableInitialized = useRef(false);
  const tableScrollRef   = useRef<HTMLDivElement>(null);

  // ── Modal state ────────────────────────────────────────────────────────────
  const [reviewItem,      setReviewItem]      = useState<AdminPRFItem | null>(null);
  const [viewItem,        setViewItem]        = useState<AdminPRFItem | null>(null);
  const [cancelItem,      setCancelItem]      = useState<AdminPRFItem | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  // ── Fiscal year options (current FY ± 3) ──────────────────────────────────
  const fyOptions = Array.from({ length: 7 }, (_, i) => currentFYStart() - 3 + i);

  // ── Week options for weekly view (derived from current FY) ────────────────
  const weekOptions  = getWeekStartOptions(fyStart);
  // Monthly always uses current FY — not the fiscal-view selector
  const monthOptions = getFYMonths(currentFYStart());

  // ── Fetch chart ────────────────────────────────────────────────────────────
  const fetchChart = useCallback(async () => {
    // First-ever load: show skeleton. Subsequent filter changes: soft overlay only.
    if (!chartInitialized.current) {
      setChartLoading(true);
    } else {
      setChartTransitioning(true);
    }
    try {
      const p = new URLSearchParams({ view: chartView, year: String(chartView === 'monthly' ? currentFYStart() : fyStart) });
      if (chartView === 'monthly') p.set('month', String(chartMonth));
      if (chartView === 'weekly')  p.set('week_start', chartWeekStart);
      const res = await fetch(`/api/prform/admin/chart?${p}`, { credentials: 'include' });
      if (!res.ok) return;
      const json: ChartResponse = await res.json();
      setChartData(json.data);
      chartInitialized.current = true;
    } finally {
      setChartLoading(false);
      setChartTransitioning(false);
    }
  }, [chartView, fyStart, chartMonth, chartWeekStart]);

  useEffect(() => {
    if (authPhase === 'done') fetchChart();
  }, [authPhase, fetchChart]);

  // ── Fetch table ────────────────────────────────────────────────────────────
  const fetchTable = useCallback(async (signal?: AbortSignal) => {
    setTableLoading(true);
    const minDelay = new Promise<void>(res => setTimeout(res, 1000));
    try {
      const p = new URLSearchParams({
        page:      String(page),
        sort_by:   sortField,
        sort_dir:  sortDir,
      });
      if (debouncedSearch) p.set('search', debouncedSearch);
      if (statusFilter)    p.set('status',   statusFilter);
      if (prfTypeFilter)   p.set('prf_type', prfTypeFilter);

      const res = await fetch(`/api/prform/admin/requests?${p}`, { credentials: 'include', signal });
      if (!res.ok) { await minDelay; return; }
      const json: AdminListResponse = await res.json();
      // Discard stale results from a superseded request
      if (signal?.aborted) return;
      await minDelay;
      setRows(json.results);
      setTotalPages(json.total_pages);
      setTotalCount(json.count);
      tableInitialized.current = true;
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return;
    } finally {
      if (!signal?.aborted) setTableLoading(false);
    }
  }, [page, sortField, sortDir, debouncedSearch, statusFilter, prfTypeFilter]);

  // Silent background poll — no loading state, updates rows in place
  const pollTable = useCallback(async () => {
    if (!tableInitialized.current) return;
    try {
      const p = new URLSearchParams({
        page:      String(page),
        sort_by:   sortField,
        sort_dir:  sortDir,
      });
      if (debouncedSearch) p.set('search', debouncedSearch);
      if (statusFilter)    p.set('status',   statusFilter);
      if (prfTypeFilter)   p.set('prf_type', prfTypeFilter);
      const res = await fetch(`/api/prform/admin/requests?${p}`, { credentials: 'include' });
      if (!res.ok) return;
      const json: AdminListResponse = await res.json();
      setRows(json.results);
      setTotalPages(json.total_pages);
      setTotalCount(json.count);
    } catch { /* silent */ }
  }, [page, sortField, sortDir, debouncedSearch, statusFilter, prfTypeFilter]);

  useEffect(() => {
    if (authPhase !== 'done') return;
    const ac = new AbortController();
    fetchTable(ac.signal);
    return () => ac.abort();
  }, [authPhase, fetchTable]);

  // Reset to page 1 on filter/search change
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, prfTypeFilter]);

  // Real-time: silently poll every 30 s for new records
  useEffect(() => {
    if (authPhase !== 'done') return;
    const id = setInterval(() => { pollTable(); }, 30_000);
    return () => clearInterval(id);
  }, [authPhase, pollTable]);

  // ── Sort handler ───────────────────────────────────────────────────────────
  function handleSort(field: string) {
    if (field === sortField) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field as SortField); setSortDir('desc'); }
  }

  // ── Excel export ─────────────────────────────────────────────────────────────
  function handleExport() {
    setShowExportModal(true);
  }

  // ── Modal success handlers ─────────────────────────────────────────────────
  function handleReviewSuccess() {
    setReviewItem(null);
    fetchTable();
  }

  function handleCancelSuccess() {
    setCancelItem(null);
    fetchTable();
  }

  // ── Loading / auth guard ───────────────────────────────────────────────────
  if (authPhase === 'spinner') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#2845D6]" />
      </div>
    );
  }
  if (authPhase !== 'done') {
    return (
      <div className="flex h-full items-center justify-center">
        <TextShimmer className="text-sm" duration={1.4}>Checking permissions…</TextShimmer>
      </div>
    );
  }

  const maxCount = chartData.length > 0
    ? Math.max(1, ...chartData.map(d => d.government + d.banking + d.hr_payroll))
    : 5;

  // ── Filter popovers ────────────────────────────────────────────────────────
  const typeFilterContent = (
    <FilterListContent
      options={PRF_TYPES_FLAT}
      value={prfTypeFilter}
      onChange={v => setPrfTypeFilter(v)}
      allLabel="All Types"
    />
  );

  const statusFilterContent = (
    <FilterListContent
      options={STATUS_OPTIONS}
      value={statusFilter}
      onChange={v => setStatusFilter(v)}
      allLabel="All Statuses"
    />
  );

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns: DataTableColumn<AdminPRFItem>[] = [
    {
      key: 'prf_no',
      label: 'PRF No.',
      sortField: 'prf_control_number',
      render: row => (
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">
          {row.prf_control_number || '—'}
        </span>
      ),
    },
    {
      key: 'employee',
      label: 'Employee',
      sortField: 'employee__idnumber',
      render: row => {
        const name = [row.employee_lastname, row.employee_firstname]
          .filter(Boolean).join(', ') || '—';
        return (
          <div className="flex flex-col gap-0">
            <span className="text-xs font-medium text-[var(--color-text-primary)]">{name}</span>
            <span className="text-[11px] text-[var(--color-text-muted)]">{row.employee_idnumber}</span>
          </div>
        );
      },
    },
    {
      key: 'prf_type',
      label: 'PRF Type',
      sortField: 'prf_type',
      filterContent: typeFilterContent,
      filterActive: !!prfTypeFilter,
      thClassName: 'hidden md:table-cell',
      tdClassName: 'hidden md:table-cell',
      render: row => (
        <span className="text-xs text-[var(--color-text-secondary)] max-w-[16ch] block truncate">
          {row.prf_type_display}
        </span>
      ),
    },
    {
      key: 'purpose',
      label: 'Purpose',
      thClassName: 'hidden lg:table-cell',
      tdClassName: 'hidden lg:table-cell max-w-[20ch]',
      render: row => (
        <span className="text-xs text-[var(--color-text-muted)] block truncate" title={row.purpose}>
          {row.purpose || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortField: 'status',
      filterContent: statusFilterContent,
      filterActive: !!statusFilter,
      render: row => <StatusPill status={row.status} label={row.status_display} />,
    },
    {
      key: 'submitted',
      label: 'Submitted',
      sortField: 'created_at',
      thClassName: 'hidden sm:table-cell',
      tdClassName: 'hidden sm:table-cell',
      render: row => (
        <span className="text-xs text-[var(--color-text-muted)]">{fmtDate(row.created_at)}</span>
      ),
    },
    {
      key: 'action',
      label: 'Action',
      headerAlign: 'center',
      tdClassName: 'text-center',
      render: row => row.status === 'pending' ? (
        <div className="flex items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={() => setReviewItem(row)}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg
              border border-[var(--color-border)] text-[11px] font-medium
              text-[var(--color-text-muted)] hover:text-[#2845D6] hover:border-[#2845D6]
              transition-colors"
          >
            <CheckCheck size={11} />
            Review
          </button>
          <button
            type="button"
            title="Cancel Request"
            onClick={() => setCancelItem(row)}
            className="flex h-7 w-7 items-center justify-center rounded-lg
              text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10
              transition-colors"
          >
            <XCircle size={13} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          title="View"
          onClick={() => setViewItem(row)}
          className="flex h-7 w-7 items-center justify-center rounded-lg mx-auto
            text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10
            transition-colors"
        >
          <Eye size={14} />
        </button>
      ),
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex flex-col h-full min-h-0 overflow-hidden">
      {/* ── Modals ── */}
      <AnimatePresence>
        {reviewItem && (
          <ReviewPRFModal
            item={reviewItem}
            onClose={() => setReviewItem(null)}
            onSuccess={handleReviewSuccess}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {viewItem && (
          <AdminViewPRFModal
            item={viewItem}
            onClose={() => setViewItem(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {cancelItem && (
          <AdminCancelConfirmModal
            item={cancelItem}
            onClose={() => setCancelItem(null)}
            onSuccess={handleCancelSuccess}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showExportModal && (
          <ExportModal onClose={() => setShowExportModal(false)} />
        )}
      </AnimatePresence>

      {/* Main scrollable content */}
      <div ref={tableScrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">

        {/* ── Page header ── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2">
              PRF Request Management
            </h1>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Review, approve, or disapprove all employee PRF submissions.
            </p>
          </div>
        </div>

        {/* ── Chart Card ── */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]">

          {/* Chart toolbar */}
          <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3 border-b border-[var(--color-border)]">

            {/* View selector */}
            <div className="relative flex items-center bg-[var(--color-bg)] rounded-xl p-0.5">
              {(['fiscal', 'monthly', 'weekly'] as ViewType[]).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setChartView(v)}
                  className="relative h-7 px-3 rounded-lg z-10 text-xs font-medium"
                >
                  {chartView === v && (
                    <motion.div
                      layoutId="chart-view-pill"
                      className="absolute inset-0 rounded-lg bg-[var(--color-bg-elevated)] shadow-sm"
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                  <span className={cn(
                    'relative z-10 transition-colors',
                    chartView === v
                      ? 'text-[#2845D6]'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
                  )}>
                    {VIEW_LABELS[v]}
                  </span>
                </button>
              ))}
            </div>

            {/* Dynamic secondary controls */}
            <AnimatePresence mode="wait">
              {chartView === 'fiscal' && (
                <motion.div
                  key="fy-only"
                  initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.18 }}
                >
                  <Select value={String(fyStart)} onValueChange={v => setFyStart(Number(v))}>
                    <SelectTrigger className="h-8 text-xs min-w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fyOptions.map(y => (
                        <SelectItem key={y} value={String(y)}>FY {y}–{y + 1}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </motion.div>
              )}

              {chartView === 'monthly' && (
                <motion.div
                  key="month-selects"
                  initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.18 }}
                >
                  <Select value={String(chartMonth)} onValueChange={v => setChartMonth(Number(v))}>
                    <SelectTrigger className="h-8 text-xs min-w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map(m => (
                        <SelectItem key={`${m.year}-${m.value}`} value={String(m.value)}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </motion.div>
              )}

              {chartView === 'weekly' && (
                <motion.div
                  key="week-select"
                  initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.18 }}
                >
                  <Select value={chartWeekStart} onValueChange={setChartWeekStart}>
                    <SelectTrigger className="h-8 text-xs min-w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {weekOptions.map(w => (
                        <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex-1" />

            {/* Chart type toggle */}
            <button
              type="button"
              title={chartType === 'bar' ? 'Switch to Line chart' : 'Switch to Bar chart'}
              onClick={() => setChartType(c => c === 'bar' ? 'line' : 'bar')}
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

          {/* Chart body — fixed height */}
          <div className="px-4 pt-4 pb-6 h-[300px]">
            {chartLoading ? (
              <ChartSkeleton />
            ) : chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-[var(--color-text-muted)]">No data for this period.</p>
              </div>
            ) : (
              <MultiSeriesChart
                data={chartData}
                categories={CHART_CATEGORIES}
                chartType={chartType}
                chartKey={`${chartView}-${chartType}`}
                maxCount={maxCount}
                transitioning={chartTransitioning}
              />
            )}
          </div>

        </div>

        {/* ── Search + filter chips ── */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="min-w-[200px] max-w-sm flex-1">
            <SearchBar
              value={search}
              onChange={v => setSearch(v)}
              placeholder="Search by PRF number, employee, type…"
            />
          </div>
          <AnimatePresence initial={false}>
            {prfTypeFilter && (
              <motion.span
                key="chip-type"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className="inline-flex items-center gap-1 rounded-full bg-[#2845D6]/10 text-[#2845D6]
                  px-2.5 py-0.5 text-[11px] font-medium"
              >
                {PRF_TYPES_FLAT.find(t => t.value === prfTypeFilter)?.label ?? prfTypeFilter}
                <button
                  type="button"
                  onClick={() => setPrfTypeFilter('')}
                  className="hover:opacity-60 transition-opacity"
                >
                  <X size={10} />
                </button>
              </motion.span>
            )}
            {statusFilter && (
              <motion.span
                key="chip-status"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className="inline-flex items-center gap-1 rounded-full bg-[#2845D6]/10 text-[#2845D6]
                  px-2.5 py-0.5 text-[11px] font-medium"
              >
                {STATUS_OPTIONS.find(s => s.value === statusFilter)?.label ?? statusFilter}
                <button
                  type="button"
                  onClick={() => setStatusFilter('')}
                  className="hover:opacity-60 transition-opacity"
                >
                  <X size={10} />
                </button>
              </motion.span>
            )}
          </AnimatePresence>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2845D6] text-white
                text-xs font-medium hover:bg-[#1f38c0] transition-colors shrink-0"
            title="Export Excel"
          >
            <Download size={12} />
            Export
          </button>
        </div>

        {/* ── Table ── */}
        <DataTable<AdminPRFItem>
          columns={columns}
          rows={rows}
          rowKey={row => row.id}
          loading={tableLoading}
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          emptyTitle={
            debouncedSearch || statusFilter || prfTypeFilter
              ? 'No results found'
              : 'No PRF requests yet'
          }
          emptyDescription={
            debouncedSearch || statusFilter || prfTypeFilter
              ? 'Try adjusting your search or removing filters.'
              : 'PRF submissions will appear here once employees submit requests.'
          }
          emptyIcons={[ClipboardList, SearchIcon, FileText]}
          page={page}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
          totalPages={totalPages}
          onPageChange={setPage}
        />

      </div>
    </div>
  );
}


'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  X,
  Check,
  FileText,
  ClipboardList,
  FilePlus,
  Eye,
  Pencil,
  XCircle,
  CalendarIcon,
  ListFilter,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import SearchBar from '@/components/ui/searchbar';
import { useDebounce } from '@/hooks/use-debounce';
import { DataTable } from '@/components/ui/data-table';
import type { DataTableColumn } from '@/components/ui/data-table';
import { StatusPill } from '@/components/ui/status-pill';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { toast } from '@/components/ui/toast';
import { getCsrfToken } from '@/lib/csrf';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { TextareaWithCharactersLeft } from '@/components/ui/textarea-with-characters-left';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserData {
  id: number;
  idnumber: string;
  firstname: string | null;
  lastname: string | null;
  admin: boolean;
}

interface PRFMeta {
  prf_types:      { value: string; label: string }[];
  prf_categories: { value: string; label: string }[];
  statuses:       { value: string; label: string }[];
}

interface PRFRequest {
  id: number;
  prf_control_number:  string;
  prf_category:        string;
  prf_category_display: string;
  prf_type:            string;
  prf_type_display:    string;
  purpose:             string;
  control_number:      string | null;
  status:              string;
  status_display:      string;
  admin_remarks:       string | null;
  emergency_loan?: {
    amount:               number;
    number_of_cutoff:     number;
    starting_date:        string;
    employee_full_name:   string;
    deduction_per_cutoff: string;
  } | null;
  medicine_allowance?: {
    amount:          string;
    start_date:      string;
    end_date:        string;
    coverage_period: string;
  } | null;
  created_at:          string;
  updated_at:          string;
}

interface PRFListResponse {
  results:     PRFRequest[];
  count:       number;
  page:        number;
  page_size:   number;
  total_pages: number;
}

type SortField = 'prf_control_number' | 'prf_type' | 'purpose' | 'status' | 'created_at';
type SortDir   = 'asc' | 'desc';

// ── Validation ─────────────────────────────────────────────────────────────────

const BLOCKED_CHARS_RE = /[<>{}\[\]\\|^~`"]/;

function validateFreeText(val: string): string {
  if (BLOCKED_CHARS_RE.test(val))
    return 'Special characters like < > { } [ ] \\ | ^ ~ ` " are not allowed.';
  return '';
}

// ── Sort icon ──────────────────────────────────────────────────────────────────

// ── PRF type definitions (hardcoded, not from API) ────────────────────────────

const PRF_CATEGORIES = [
  { value: 'government',  label: 'Government Transaction' },
  { value: 'banking',     label: 'Banking and Finance' },
  { value: 'hr_payroll',  label: 'Human Resources and Payroll' },
];

const PRF_TYPES_BY_CATEGORY: Record<string, { value: string; label: string; unavailable?: boolean }[]> = {
  government: [
    { value: 'pagibig_loan',              label: 'PAG-IBIG Loan' },
    { value: 'pagibig_cert_payment',      label: 'PAG-IBIG Certificate of Payment' },
    { value: 'pagibig_cert_contribution', label: 'PAG-IBIG Certificate of Contribution' },
    { value: 'philhealth_form',           label: 'PHILHEALTH Form' },
    { value: 'sss_loan',                  label: 'SSS Loan' },
    { value: 'sss_maternity',             label: 'SSS Maternity Benefits' },
    { value: 'sss_sickness',              label: 'SSS Sickness Benefits' },
    { value: 'bir_form',                  label: 'BIR Form (2316/1902)' },
  ],
  banking: [
    { value: 'rcbc_maintenance', label: 'RCBC Maintenance Form' },
    { value: 'bank_deposit',     label: 'Bank Deposit' },
  ],
  hr_payroll: [
    { value: 'payroll_adjustment',      label: 'Payroll Adjustment' },
    { value: 'id_replacement',          label: 'ID Replacement' },
    { value: 'pcoe_compensation',       label: 'PCOE with Compensation' },
    { value: 'certificate_employment',  label: 'Certificate of Employment' },
    { value: 'clearance_form',          label: 'Clearance Form' },
    { value: 'emergency_loan',          label: 'Emergency Loan' },
    { value: 'medical_loan',            label: 'Medical Assistance Loan' },
    { value: 'educational_loan',        label: 'Educational Assistance Loan' },
    { value: 'coop_loan',               label: 'Coop Loan' },
    { value: 'medicine_allowance',      label: 'Medicine Allowance' },
    { value: 'uniform_ppe',             label: 'Uniform Caps / PPE T-shirt' },
    { value: 'others',                  label: 'Others' },
  ],
};

// Types that require a loan control number
const CONTROL_NUMBER_TYPES = new Set([
  'coop_loan', 'medical_loan', 'educational_loan', 'pagibig_loan', 'sss_loan',
]);

// ── Emergency Loan constants ──────────────────────────────────────────────────

const EL_AMOUNTS = [
  { value: 5000, label: '₱5,000', disabled: false },
  { value: 4000, label: '₱4,000', disabled: true },
  { value: 3000, label: '₱3,000', disabled: true },
  { value: 2000, label: '₱2,000', disabled: true },
];

const EL_CUTOFFS: Record<number, { value: number; label: string }[]> = {
  5000: [
    { value: 1, label: '1 Cut-off (0.5 month)' },
    { value: 2, label: '2 Cut-offs (1 month)' },
    { value: 3, label: '3 Cut-offs (1.5 months)' },
    { value: 4, label: '4 Cut-offs (2 months)' },
    { value: 5, label: '5 Cut-offs (2.5 months)' },
    { value: 6, label: '6 Cut-offs (3 months)' },
  ],
  4000: [
    { value: 1, label: '1 Cut-off (0.5 month)' },
    { value: 2, label: '2 Cut-offs (1 month)' },
    { value: 4, label: '4 Cut-offs (2 months)' },
    { value: 5, label: '5 Cut-offs (2.5 months)' },
  ],
  3000: [
    { value: 1, label: '1 Cut-off (0.5 month)' },
    { value: 2, label: '2 Cut-offs (1 month)' },
    { value: 4, label: '4 Cut-offs (2 months)' },
    { value: 5, label: '5 Cut-offs (2.5 months)' },
  ],
  2000: [
    { value: 1, label: '1 Cut-off (0.5 month)' },
    { value: 2, label: '2 Cut-offs (1 month)' },
    { value: 4, label: '4 Cut-offs (2 months)' },
  ],
};

function fmtPeso(n: number) {
  return '₱' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCalDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
}

function localDateStr(d: Date) {
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${dy}`;
}

// ── Emergency Loan Modal ──────────────────────────────────────────────────────

function EmergencyLoanModal({
  draft,
  user,
  onClose,
  onCreated,
}: {
  draft:     { category: string; purpose: string };
  user:      UserData;
  onClose:   () => void;
  onCreated: (prf: PRFRequest) => void;
}) {
  const [amount,      setAmount]      = useState<number | null>(null);
  const [cutoff,      setCutoff]      = useState<number | null>(null);
  const [startDate,   setStartDate]   = useState<Date | undefined>(undefined);
  const [dateOpen,    setDateOpen]    = useState(false);
  const [calMonth,    setCalMonth]    = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d9  = new Date(today.getFullYear(), today.getMonth(), 9);
    const d24 = new Date(today.getFullYear(), today.getMonth(), 24);
    if (d9 >= today || d24 >= today) {
      return new Date(today.getFullYear(), today.getMonth(), 1);
    }
    return new Date(today.getFullYear(), today.getMonth() + 1, 1);
  });
  const [fullName,    setFullName]    = useState('');
  const [fullNameErr, setFullNameErr] = useState('');
  const [saving,      setSaving]      = useState(false);
  const [inlineError, setInlineError] = useState('');

  const cutoffOptions     = amount ? (EL_CUTOFFS[amount] ?? []) : [];
  const deductionPerCutoff = amount && cutoff ? amount / cutoff : 0;
  const expectedName       = [user.firstname, user.lastname].filter(Boolean).join(' ');
  const nameValid          = fullName.trim().toLowerCase() === expectedName.toLowerCase();
  const isValid            = amount !== null && cutoff !== null && !!startDate && nameValid && !fullNameErr && !inlineError;

  function isDateDisabled(date: Date): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return true;
    return date.getDate() !== 9 && date.getDate() !== 24;
  }

  function handleAmountChange(val: string) {
    setAmount(parseInt(val, 10));
    setCutoff(null);
    setInlineError('');
  }

  function handleFullName(val: string) {
    if (val.length > 100) return;
    const err = validateFreeText(val);
    setFullNameErr(err);
    if (!err) setFullName(val);
    setInlineError('');
  }

  async function handleConfirm() {
    if (!isValid || amount === null || cutoff === null || !startDate) return;
    setSaving(true);
    setInlineError('');
    const minWait = new Promise(r => setTimeout(r, 1000));
    try {
      const res = await fetch('/api/prform/emergency-loan', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify({
          prf_category:      draft.category,
          purpose:           draft.purpose,
          amount,
          number_of_cutoff:  cutoff,
          starting_date:     localDateStr(startDate),
          employee_full_name: fullName.trim(),
        }),
      });
      if (res.ok) {
        const data: PRFRequest = await res.json();
        await minWait;
        toast.success('Emergency Loan request submitted successfully.', { title: 'Request Submitted' });
        onCreated(data);
      } else {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        await minWait;
        if (err?.detail) {
          // Loan eligibility / business-rule error → toast
          toast.error(err.detail as string, { title: 'Request Not Allowed' });
        } else {
          // Field-level / input validation error → inline
          const fieldErrors = Object.values(err).flat() as string[];
          const msg = fieldErrors[0] ?? 'Failed to submit request.';
          setInlineError(msg);
        }
      }
    } catch {
      await minWait;
      toast.error('Network error. Please try again.', { title: 'Error' });
    } finally {
      setSaving(false);
    }
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
        animate={{ opacity: 1, scale: 1,    y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-[var(--color-border)]
          bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Emergency Loan Request
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
        <div className="space-y-4 p-6 max-h-[calc(100vh-14rem)] overflow-y-auto [scrollbar-width:thin]">

          {/* Amount */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
              Amount(₱)<span className="text-red-500 normal-case tracking-normal">*</span>
            </label>
            <Select
              value={amount !== null ? String(amount) : ''}
              onValueChange={handleAmountChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Amount" />
              </SelectTrigger>
              <SelectContent>
                {EL_AMOUNTS.map(a => (
                  <SelectItem key={a.value} value={String(a.value)} disabled={a.disabled}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Number of Cut-offs */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
              Number of Cut-Off <span className="text-red-500 normal-case tracking-normal">*</span>
            </label>
            <Select
              value={cutoff !== null ? String(cutoff) : ''}
              onValueChange={v => { setCutoff(parseInt(v, 10)); setInlineError(''); }}
              disabled={amount === null}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={amount === null ? 'Select Amount First' : 'Select Cut-Off'} />
              </SelectTrigger>
              <SelectContent>
                {cutoffOptions.map(c => (
                  <SelectItem key={c.value} value={String(c.value)}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Starting Date */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
              Starting Date <span className="text-red-500 normal-case tracking-normal">*</span>
            </label>
            <DateTimePicker
              value={startDate}
              onChange={(d) => {
                if (!isDateDisabled(d)) {
                  setStartDate(d);
                  setInlineError('');
                }
              }}
              placeholder="Select start date"
            />
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Only the 9th and 24th of each month are available.
            </p>
          </div>

          {/* Agreement */}
          <div className="rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] px-4 py-6">
            <p className="text-xs font-bold text-[var(--color-text-primary)] mb-2">Agreement</p>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              This is to authorize Finance and Accounting Department to deduct from my salary
              the amount of{' '}
              <span className="font-semibold text-[var(--color-text-primary)]">
                {fmtPeso(deductionPerCutoff)}
              </span>{' '}
              per payroll starting{' '}
              <span className="font-semibold text-[var(--color-text-primary)]">
                {startDate ? fmtCalDate(startDate) : '___________'}
              </span>{' '}
              payroll period.
            </p>
          </div>

          {/* Full Name Confirmation */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
              Enter full name to confirm transaction <span className="text-red-500 normal-case tracking-normal">*</span>
            </label>
            <Input
              placeholder="Enter your full name (case insensitive)"
              value={fullName}
              maxLength={100}
              className={cn(
                fullName.length > 0 && !nameValid && !fullNameErr && 'border-red-500',
                nameValid && 'border-green-500 focus-visible:ring-green-500/30',
              )}
              onChange={e => handleFullName(e.target.value)}
              onPaste={e => {
                const pasted = e.clipboardData.getData('text');
                if (BLOCKED_CHARS_RE.test(pasted)) {
                  e.preventDefault();
                  setFullNameErr('Special characters are not allowed.');
                }
              }}
            />
            {fullNameErr
              ? <p className="text-xs text-red-500" role="alert">{fullNameErr}</p>
              : <p className="text-[11px] text-[var(--color-text-muted)]">
                  Type your name in any format (e.g., &quot;john doe&quot;, &quot;JOHN DOE&quot;, &quot;John Doe&quot;)
                </p>
            }
          </div>

          {/* Inline input validation error */}
          {inlineError && (
            <p className="text-xs text-red-500 rounded-lg bg-red-500/10 px-3 py-2 text-center" role="alert">
              {inlineError}
            </p>
          )}

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
            type="button"
            onClick={handleConfirm}
            disabled={!isValid || saving}
            className="flex min-w-[150px] items-center justify-center gap-1.5 px-4 py-2 rounded-lg
              bg-[#2845D6] text-white text-sm font-semibold hover:bg-[#1f38c0]
              disabled:opacity-50 transition-colors"
          >
            {saving
              ? <TextShimmer duration={1.2} className="text-sm font-semibold [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">
                  Submitting…
                </TextShimmer>
              : <><Check size={14} /><span>Confirm Request</span></>
            }
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Medicine Allowance Modal ───────────────────────────────────────────────────

function MedicineAllowanceModal({
  draft,
  onClose,
  onCreated,
}: {
  draft:     { category: string; purpose: string; balance: string; coveredPeriod: string };
  onClose:   () => void;
  onCreated: (prf: PRFRequest) => void;
}) {
  const [startDate,  setStartDate]  = useState<Date | undefined>(undefined);
  const [endDate,    setEndDate]    = useState<Date | undefined>(undefined);
  const [amount,     setAmount]     = useState('');
  const [amountErr,  setAmountErr]  = useState('');
  const [periodErr,  setPeriodErr]  = useState('');
  const [saving,     setSaving]     = useState(false);

  const balanceNum = parseFloat(draft.balance) || 0;

  function toMonthVal(d: Date): number {
    return d.getFullYear() * 12 + d.getMonth();
  }

  function formatMonthYear(d: Date): string {
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function validatePeriod(start: Date | undefined, end: Date | undefined): string {
    if (!start || !end) return '';
    if (toMonthVal(end) < toMonthVal(start)) return 'Period End must not be before Period Start.';
    return '';
  }

  function handleStartDate(d: Date) {
    setStartDate(d);
    setPeriodErr(validatePeriod(d, endDate));
  }

  function handleEndDate(d: Date) {
    setEndDate(d);
    setPeriodErr(validatePeriod(startDate, d));
  }

  function handleAmountChange(val: string) {
    // Allow only digits and a single decimal point
    const filtered = val.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setAmount(filtered);
    const n = parseFloat(filtered);
    if (!filtered || isNaN(n) || n <= 0) {
      setAmountErr('');
      return;
    }
    if (n > balanceNum) {
      setAmountErr(`Entered amount exceeds your available balance of ₱${balanceNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`);
    } else {
      setAmountErr('');
    }
  }

  function handleAmountKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (
      e.key === 'Backspace' || e.key === 'Delete' ||
      e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
      e.key === 'Tab' || e.key === 'Home' || e.key === 'End' ||
      e.ctrlKey || e.metaKey
    ) return;
    if (/^[0-9]$/.test(e.key)) return;
    if (e.key === '.' && !amount.includes('.')) return;
    e.preventDefault();
  }

  function stepAmount(dir: 1 | -1) {
    const n = parseFloat(amount) || 0;
    const next = Math.max(0, n + dir);
    handleAmountChange(next % 1 === 0 ? String(next) : next.toFixed(2));
  }

  const amountNum = parseFloat(amount);
  const isValid =
    !!startDate &&
    !!endDate &&
    !periodErr &&
    !!amount &&
    !isNaN(amountNum) &&
    amountNum > 0 &&
    amountNum <= balanceNum &&
    !amountErr;

  async function handleConfirm() {
    if (!isValid || !startDate || !endDate) return;
    setSaving(true);
    const minWait = new Promise(r => setTimeout(r, 1000));
    try {
      const res = await fetch('/api/prform/medicine-allowance', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify({
          prf_category: draft.category,
          purpose:      draft.purpose,
          amount:       amount,
          start_date:   formatMonthYear(startDate),
          end_date:     formatMonthYear(endDate),
        }),
      });
      if (res.ok) {
        const data: PRFRequest = await res.json();
        await minWait;
        toast.success('Medicine Allowance request submitted successfully.', { title: 'Request Submitted' });
        onCreated(data);
      } else {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        await minWait;
        if (err?.detail) {
          toast.error(err.detail as string, { title: 'Submission Failed' });
        } else if (err?.amount) {
          const msg = Array.isArray(err.amount) ? (err.amount as string[])[0] : String(err.amount);
          setAmountErr(msg);
        } else {
          toast.error('Failed to submit request. Please try again.', { title: 'Submission Failed' });
        }
      }
    } catch {
      await minWait;
      toast.error('Network error. Please try again.', { title: 'Error' });
    } finally {
      setSaving(false);
    }
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
        animate={{ opacity: 1, scale: 1,    y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-[var(--color-border)]
          bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Medicine Allowance Request
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
        <div className="space-y-4 p-6 max-h-[calc(100vh-14rem)] overflow-y-auto [scrollbar-width:thin]">

          {/* Available Balance Card */}
          <div className="rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] px-4 py-4 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Available Balance
            </p>
            <p className="text-2xl font-bold text-[var(--color-text-primary)]">
              ₱{balanceNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            {draft.coveredPeriod && (
              <p className="text-[12px] text-[var(--color-text-muted)]">
                Covered Period: {draft.coveredPeriod}
              </p>
            )}
          </div>

          {/* Period Start + Period End — one row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
                Period Start <span className="text-red-500 normal-case tracking-normal">*</span>
              </label>
              <DateTimePicker
                value={startDate}
                onChange={handleStartDate}
                placeholder="Select month"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
                Period End <span className="text-red-500 normal-case tracking-normal">*</span>
              </label>
              <DateTimePicker
                value={endDate}
                onChange={handleEndDate}
                placeholder="Select month"
              />
            </div>
          </div>
          {periodErr && (
            <p className="text-xs text-red-500 -mt-2" role="alert">{periodErr}</p>
          )}

          {/* Amount */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
              Amount (₱) <span className="text-red-500 normal-case tracking-normal">*</span>
            </label>
            <div className="relative flex items-stretch">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onKeyDown={handleAmountKeyDown}
                onChange={e => handleAmountChange(e.target.value)}
                onPaste={e => {
                  e.preventDefault();
                  const pasted = e.clipboardData.getData('text');
                  const filtered = pasted.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
                  handleAmountChange(filtered);
                }}
                className={cn(
                  'flex h-9 w-full rounded-lg border border-[var(--color-border)]',
                  'bg-[var(--color-bg-elevated)] px-3 py-1 text-sm text-[var(--color-text-primary)]',
                  'placeholder:text-[var(--color-text-muted)]',
                  'focus:outline-none focus:border-transparent focus:shadow-sm',
                  amountErr && 'border-red-500',
                )}
              />
              {/* Custom up/down spinner buttons */}
              <div className="absolute right-0 inset-y-0 flex flex-col rounded-r-md overflow-hidden">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => stepAmount(1)}
                  className="flex flex-1 w-8 items-center justify-center
                    text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]
                    hover:bg-transparent transition-colors"
                >
                  <ChevronUp size={11} />
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => stepAmount(-1)}
                  className="flex flex-1 w-8 items-center justify-center
                    text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]
                    hover:bg-transparent transition-colors"
                >
                  <ChevronDown size={11} />
                </button>
              </div>
            </div>
            {amountErr
              ? <p className="text-xs text-red-500" role="alert">{amountErr}</p>
              : <p className="text-[11px] text-[var(--color-text-muted)]">
                  Enter an amount up to your available balance.
                </p>
            }
          </div>

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
            type="button"
            onClick={handleConfirm}
            disabled={!isValid || saving}
            className="flex min-w-[150px] items-center justify-center gap-1.5 px-4 py-2 rounded-lg
              bg-[#2845D6] text-white text-sm font-semibold hover:bg-[#1f38c0]
              disabled:opacity-50 transition-colors"
          >
            {saving
              ? <TextShimmer duration={1.2} className="text-sm font-semibold [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">
                  Submitting…
                </TextShimmer>
              : <><Check size={14} /><span>Confirm Request</span></>
            }
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Submit PRF Modal ───────────────────────────────────────────────────────────

function SubmitPRFModal({
  onClose,
  onCreated,
  onEmergencyLoan,
  onMedicineAllowance,
}: {
  onClose:             () => void;
  onCreated:           (prf: PRFRequest) => void;
  onEmergencyLoan:     (draft: { category: string; purpose: string }) => void;
  onMedicineAllowance: (draft: { category: string; purpose: string; balance: string; coveredPeriod: string }) => void;
}) {
  const [category,         setCategory]         = useState('');
  const [prfType,          setPrfType]          = useState('');
  const [otherType,        setOtherType]        = useState('');
  const [otherTypeErr,     setOtherTypeErr]     = useState('');
  const [controlNumber,    setControlNumber]    = useState('');
  const [controlNumberErr, setControlNumberErr] = useState('');
  const [purpose,          setPurpose]          = useState('');
  const [purposeErr,       setPurposeErr]       = useState('');
  const [saving,           setSaving]           = useState(false);

  const typeOptions        = category ? (PRF_TYPES_BY_CATEGORY[category] ?? []) : [];
  const isOthers           = prfType === 'others';
  const needsControlNumber = CONTROL_NUMBER_TYPES.has(prfType);
  const purposeMax         = 300;
  const otherMax           = 30;
  const controlMax         = 50;

  function handleCategoryChange(val: string) {
    setCategory(val);
    setPrfType('');
    setOtherType('');     setOtherTypeErr('');
    setControlNumber(''); setControlNumberErr('');
  }

  function handleTypeChange(val: string) {
    setPrfType(val);
    setOtherType('');     setOtherTypeErr('');
    setControlNumber(''); setControlNumberErr('');
  }

  function handleControlNumber(val: string) {
    if (val.length > controlMax) return;
    const err = validateFreeText(val);
    setControlNumberErr(err);
    if (!err) setControlNumber(val);
  }

  function handleOtherType(val: string) {
    if (val.length > otherMax) return;
    const err = validateFreeText(val);
    setOtherTypeErr(err);
    if (!err) setOtherType(val);
  }

  function handlePurpose(val: string) {
    if (val.length > purposeMax) return;
    const err = validateFreeText(val);
    setPurposeErr(err);
    if (!err) setPurpose(val);
  }

  const isValid =
    !!category &&
    !!prfType &&
    (!isOthers || (otherType.trim().length > 0 && !otherTypeErr)) &&
    (!needsControlNumber || (controlNumber.trim().length > 0 && !controlNumberErr)) &&
    purpose.trim().length > 0 &&
    !purposeErr;

  async function handleSubmit() {
    if (!isValid) return;

    // Emergency Loan: run pre-flight eligibility checks before opening the dedicated modal
    if (prfType === 'emergency_loan') {
      setSaving(true);
      const minWait = new Promise(r => setTimeout(r, 1000));
      try {
        const res = await fetch('/api/prform/emergency-loan/check', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken(),
          },
          body: JSON.stringify({}),
        });
        await minWait;
        if (res.ok) {
          onEmergencyLoan({ category, purpose: purpose.trim() });
        } else {
          const err = await res.json().catch(() => ({})) as Record<string, unknown>;
          const msg = (err?.detail as string) ?? 'Failed to check Emergency Loan eligibility.';
          toast.error(msg, { title: 'Emergency Loan Check Failed' });
        }
      } catch {
        await minWait;
        toast.error('Network error. Please try again.', { title: 'Error' });
      } finally {
        setSaving(false);
      }
      return;
    }

    // Medicine Allowance runs a pre-check then opens its own dedicated modal
    if (prfType === 'medicine_allowance') {
      setSaving(true);
      const minWait = new Promise(r => setTimeout(r, 1000));
      try {
        const res = await fetch('/api/prform/medicine-allowance/check', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken(),
          },
          body: JSON.stringify({}),
        });
        await minWait;
        if (res.ok) {
          const data: { amount: string; covered_period: string } = await res.json();
          onMedicineAllowance({
            category,
            purpose:      purpose.trim(),
            balance:      data.amount,
            coveredPeriod: data.covered_period,
          });
        } else {
          const err = await res.json().catch(() => ({})) as Record<string, unknown>;
          const msg = (err?.detail as string) ?? 'Failed to check medicine allowance eligibility.';
          toast.error(msg, { title: 'Medicine Allowance Check Failed' });
        }
      } catch {
        await minWait;
        toast.error('Network error. Please try again.', { title: 'Error' });
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    const minWait = new Promise(r => setTimeout(r, 1000));
    try {
      const res = await fetch('/api/prform/requests', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify({
          prf_category:   category,
          prf_type:       prfType,
          purpose:        purpose.trim(),
          control_number: isOthers
            ? (otherType.trim() || undefined)
            : (needsControlNumber ? controlNumber.trim() : undefined),
        }),
      });
      if (res.ok) {
        const data: PRFRequest = await res.json();
        await minWait;
        toast.success('PRF request submitted successfully.', { title: 'Request Submitted' });
        onCreated(data);
      } else {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        const msg =
          (err?.detail as string) ??
          (Array.isArray(err?.purpose) ? (err.purpose as string[])[0] : undefined) ??
          'Failed to submit request.';
        await minWait;
        toast.error(msg, { title: 'Submission Failed' });
      }
    } catch {
      await minWait;
      toast.error('Network error. Please try again.', { title: 'Error' });
    } finally {
      setSaving(false);
    }
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
        animate={{ opacity: 1, scale: 1,    y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-[var(--color-border)]
          bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            New PRF Request
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
        <div className="space-y-4 p-6 max-h-[calc(100vh-13rem)] overflow-y-auto [scrollbar-width:thin]">

          {/* PRF Category */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
              PRF Category <span className="text-red-500 normal-case tracking-normal">*</span>
            </label>
            <Select value={category} onValueChange={handleCategoryChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a category…" />
              </SelectTrigger>
              <SelectContent>
                {PRF_CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* PRF Type — slides in after category is chosen */}
          <AnimatePresence initial={false}>
            {category && (
              <motion.div
                key={`type-${category}`}
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0,  height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                style={{ overflow: 'hidden' }}
                className="space-y-1.5"
              >
                <label className="text-xs font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
                  PRF Type <span className="text-red-500 normal-case tracking-normal">*</span>
                </label>
                <Select value={prfType} onValueChange={handleTypeChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map(t => (
                      <SelectItem key={t.value} value={t.value} disabled={t.unavailable}>
                        {t.label}{t.unavailable ? ' (Not Available)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Control Number — for specific loan types */}
          <AnimatePresence initial={false}>
            {needsControlNumber && (
              <motion.div
                key="control-number"
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0,  height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                style={{ overflow: 'hidden' }}
                className="space-y-1.5"
              >
                <label className="text-xs font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
                  Control Number <span className="text-red-500 normal-case tracking-normal">*</span>
                </label>
                <Input
                  placeholder="e.g., LN-2024-001"
                  value={controlNumber}
                  maxLength={controlMax}
                  className={cn(controlNumberErr && 'border-red-500')}
                  onChange={e => handleControlNumber(e.target.value)}
                  onPaste={e => {
                    const pasted = e.clipboardData.getData('text');
                    if (BLOCKED_CHARS_RE.test(pasted)) {
                      e.preventDefault();
                      setControlNumberErr('Special characters are not allowed.');
                    }
                  }}
                />
                {controlNumberErr
                  ? <p className="text-xs text-red-500" role="alert">{controlNumberErr}</p>
                  : <p className="text-xs text-[var(--color-text-muted)] text-right">{controlNumber.length}/{controlMax}</p>
                }
              </motion.div>
            )}
          </AnimatePresence>

          {/* "Others" specify textarea — slides in when Others is selected */}
          <AnimatePresence initial={false}>
            {isOthers && (
              <motion.div
                key="others-specify"
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0,  height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                style={{ overflow: 'hidden' }}
                className="space-y-1.5"
              >
                <label className="text-xs font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
                  Specify PRF Type <span className="text-red-500 normal-case tracking-normal">*</span>
                </label>
                <TextareaWithCharactersLeft
                  placeholder="Please specify the PRF type…"
                  value={otherType}
                  maxLength={otherMax}
                  error={otherTypeErr}
                  className="min-h-[64px] resize-none"
                  onChange={e => handleOtherType(e.target.value)}
                  onPaste={e => {
                    const pasted = e.clipboardData.getData('text');
                    if (BLOCKED_CHARS_RE.test(pasted)) {
                      e.preventDefault();
                      setOtherTypeErr('Special characters are not allowed.');
                    }
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Purpose of Request */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
              Purpose of Request <span className="text-red-500 normal-case tracking-normal">*</span>
            </label>
            <TextareaWithCharactersLeft
              placeholder="Describe the purpose of this request…"
              value={purpose}
              maxLength={purposeMax}
              error={purposeErr}
              className="min-h-[90px] resize-none"
              onChange={e => handlePurpose(e.target.value)}
              onPaste={e => {
                const pasted = e.clipboardData.getData('text');
                if (BLOCKED_CHARS_RE.test(pasted)) {
                  e.preventDefault();
                  setPurposeErr('Special characters are not allowed.');
                }
              }}
            />
          </div>
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
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || saving}
            className="flex min-w-[130px] items-center justify-center gap-1.5 px-4 py-2 rounded-lg
              bg-[#2845D6] text-white text-sm font-semibold hover:bg-[#1f38c0]
              disabled:opacity-50 transition-colors"
          >
            {saving
              ? <TextShimmer duration={1.2} className="text-sm font-semibold [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">
                  {prfType === 'medicine_allowance' || prfType === 'emergency_loan' ? 'Checking…' : 'Submitting…'}
                </TextShimmer>
              : prfType === 'emergency_loan' || prfType === 'medicine_allowance'
                ? <><Check size={14} /><span>Continue</span></>
                : <><Check size={14} /><span>Submit Request</span></>
            }
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── PRF detail row (label + value) ─────────────────────────────────────────────

function DetailRow({ label, value, mono, multiline }: {
  label: string; value: string; mono?: boolean; multiline?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className={cn(
        'text-sm text-[var(--color-text-primary)]',
        mono && 'font-mono',
        multiline && 'leading-relaxed whitespace-pre-wrap',
      )}>
        {value}
      </p>
    </div>
  );
}

// ── View PRF Modal ─────────────────────────────────────────────────────────────

function ViewPRFModal({ request, onClose }: { request: PRFRequest; onClose: () => void }) {
  const typeLabel =
    request.prf_type === 'others' && request.control_number
      ? `Others: ${request.control_number}`
      : request.prf_type_display;

  function fmtShort(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1,    y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-[var(--color-border)]
          bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            View PRF Request
          </h2>
          <button type="button" onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full
              text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* ── PRF number + status + date row ── */}
        <div className="flex items-center justify-between px-6 pt-4 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-[var(--color-text-primary)]">
              {request.prf_control_number}
            </span>
            <StatusPill status={request.status} label={request.status_display} />
          </div>
          <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">
            {fmtShort(request.created_at)}
          </span>
        </div>

        {/* ── Section heading ── */}
        <div className="px-6 pt-3 pb-3">
          <div className="flex items-center gap-3">
            <p className="text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap">
              PRF Request Information
            </p>
            <div className="flex-1 h-px bg-[var(--color-border)]" />
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-6 pb-2 max-h-[calc(100vh-16rem)] overflow-y-auto [scrollbar-width:thin]">

          {/* 2-col grid for main fields */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <DetailRow label="PRF Category" value={request.prf_category_display} />
            <DetailRow label="PRF Type"     value={typeLabel} />
            {request.prf_type !== 'others' && request.control_number && (
              <DetailRow label="Control Number" value={request.control_number} mono />
            )}
          </div>

          {/* Purpose — full width */}
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Purpose of Request:
            </p>
            <p className="text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">
              {request.purpose}
            </p>
          </div>

          {/* Emergency Loan details — only for emergency_loan type */}
          {request.prf_type === 'emergency_loan' && request.emergency_loan && (() => {
            const el = request.emergency_loan;
            const [yyyy, mm, dd] = el.starting_date.split('-').map(Number);
            const fmtDate = new Date(yyyy, mm - 1, dd).toLocaleDateString('en-US', {
              month: 'long', day: '2-digit', year: 'numeric',
            });
            const fmtAmt = (v: string | number) =>
              '\u20b1' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return (
              <div className="mt-2 pt-4">
                <div className="flex items-center gap-3 mb-3">
                  <p className="text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap">
                    Emergency Loan Details
                  </p>
                  <div className="flex-1 h-px bg-[var(--color-border)]" />
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <DetailRow label="Loan Amount"        value={fmtAmt(el.amount)} />
                  <DetailRow label="Number of Cut-Offs" value={`${el.number_of_cutoff} cut-off${el.number_of_cutoff > 1 ? 's' : ''}`} />
                  <DetailRow label="Starting Date"      value={fmtDate} />
                  <DetailRow label="Deduction per Cut-Off" value={fmtAmt(el.deduction_per_cutoff)} />
                </div>
              </div>
            );
          })()}

          {/* Medicine Allowance details — only for medicine_allowance type */}
          {request.prf_type === 'medicine_allowance' && request.medicine_allowance && (() => {
            const ma = request.medicine_allowance;
            const fmtAmt = (v: string | number) =>
              '₱' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            function fmtMonthYear(dateStr: string) {
              const [y, m] = dateStr.split('-').map(Number);
              return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            }
            return (
              <div className="mt-2 pt-4">
                <div className="flex items-center gap-3 mb-3">
                  <p className="text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap">
                    Medicine Allowance Details
                  </p>
                  <div className="flex-1 h-px bg-[var(--color-border)]" />
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <DetailRow label="Period Start"      value={fmtMonthYear(ma.start_date)} />
                  <DetailRow label="Period End"        value={fmtMonthYear(ma.end_date)} />
                  <DetailRow label="Requested Amount" value={fmtAmt(ma.amount)} />
                </div>
              </div>
            );
          })()}

          {/* Admin remarks — only when present */}
          {request.admin_remarks && (
            <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
                Admin Remarks:
              </p>
              <p className="text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">
                {request.admin_remarks}
              </p>
            </div>
          )}

          

        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 flex justify-end">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--color-border)]
              text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors">
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Edit PRF Modal ─────────────────────────────────────────────────────────────

function EditPRFModal({
  request,
  onClose,
  onEdited,
}: {
  request:  PRFRequest;
  onClose:  () => void;
  onEdited: (prf: PRFRequest) => void;
}) {
  const initOtherType     = request.prf_type === 'others'             ? (request.control_number ?? '') : '';
  const initControlNumber = CONTROL_NUMBER_TYPES.has(request.prf_type)? (request.control_number ?? '') : '';

  const [category,         setCategory]         = useState(request.prf_category);
  const [prfType,          setPrfType]          = useState(request.prf_type);
  const [otherType,        setOtherType]        = useState(initOtherType);
  const [otherTypeErr,     setOtherTypeErr]     = useState('');
  const [controlNumber,    setControlNumber]    = useState(initControlNumber);
  const [controlNumberErr, setControlNumberErr] = useState('');
  const [purpose,          setPurpose]          = useState(request.purpose);
  const [purposeErr,       setPurposeErr]       = useState('');
  const [saving,           setSaving]           = useState(false);

  const typeOptions        = category ? (PRF_TYPES_BY_CATEGORY[category] ?? []) : [];
  const isOthers           = prfType === 'others';
  const needsControlNumber = CONTROL_NUMBER_TYPES.has(prfType);
  const purposeMax         = 300;
  const otherMax           = 30;
  const controlMax         = 50;

  function handleCategoryChange(val: string) {
    setCategory(val);
    setPrfType('');
    setOtherType('');     setOtherTypeErr('');
    setControlNumber(''); setControlNumberErr('');
  }
  function handleTypeChange(val: string) {
    setPrfType(val);
    setOtherType('');     setOtherTypeErr('');
    setControlNumber(''); setControlNumberErr('');
  }
  function handleControlNumber(val: string) {
    if (val.length > controlMax) return;
    const err = validateFreeText(val);
    setControlNumberErr(err);
    if (!err) setControlNumber(val);
  }
  function handleOtherType(val: string) {
    if (val.length > otherMax) return;
    const err = validateFreeText(val);
    setOtherTypeErr(err);
    if (!err) setOtherType(val);
  }
  function handlePurpose(val: string) {
    if (val.length > purposeMax) return;
    const err = validateFreeText(val);
    setPurposeErr(err);
    if (!err) setPurpose(val);
  }

  const isValid =
    !!category && !!prfType &&
    (!isOthers || (otherType.trim().length > 0 && !otherTypeErr)) &&
    (!needsControlNumber || (controlNumber.trim().length > 0 && !controlNumberErr)) &&
    purpose.trim().length > 0 && !purposeErr;

  async function handleSubmit() {
    if (!isValid) return;
    setSaving(true);
    const minWait = new Promise(r => setTimeout(r, 1000));
    try {
      const res = await fetch(`/api/prform/requests/${request.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({
          prf_category:   category,
          prf_type:       prfType,
          purpose:        purpose.trim(),
          control_number: isOthers
            ? (otherType.trim() || null)
            : (needsControlNumber ? controlNumber.trim() : null),
        }),
      });
      if (res.ok) {
        const data: PRFRequest = await res.json();
        await minWait;
        toast.success('PRF request updated successfully.', { title: 'Request Updated' });
        onEdited(data);
      } else {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        const msg = (err?.detail as string) ?? 'Failed to update request.';
        await minWait;
        toast.error(msg, { title: 'Update Failed' });
      }
    } catch {
      await minWait;
      toast.error('Network error. Please try again.', { title: 'Error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1,    y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-[var(--color-border)]
          bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Edit PRF Request</h2>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{request.prf_control_number}</p>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full
              text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-6 max-h-[calc(100vh-13rem)] overflow-y-auto [scrollbar-width:thin]">
          {/* PRF Category */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
              PRF Category <span className="text-red-500 normal-case tracking-normal">*</span>
            </label>
            <Select value={category} onValueChange={handleCategoryChange}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a category…" /></SelectTrigger>
              <SelectContent>
                {PRF_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* PRF Type */}
          <AnimatePresence initial={false}>
            {category && (
              <motion.div key={`type-${category}`}
                initial={{ opacity: 0, y: -8, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                style={{ overflow: 'hidden' }} className="space-y-1.5">
                <label className="text-[12px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
                  PRF Type <span className="text-red-500 normal-case tracking-normal">*</span>
                </label>
                <Select value={prfType} onValueChange={handleTypeChange}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select a type…" /></SelectTrigger>
                  <SelectContent>
                    {typeOptions.map(t => (
                      <SelectItem key={t.value} value={t.value} disabled={t.unavailable}>
                        {t.label}{t.unavailable ? ' (Not Available)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Control Number */}
          <AnimatePresence initial={false}>
            {needsControlNumber && (
              <motion.div key="control-number"
                initial={{ opacity: 0, y: -8, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                style={{ overflow: 'hidden' }} className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
                  Control Number <span className="text-red-500 normal-case tracking-normal">*</span>
                </label>
                <Input placeholder="e.g., LN-2024-001" value={controlNumber} maxLength={controlMax}
                  className={cn(controlNumberErr && 'border-red-500')}
                  onChange={e => handleControlNumber(e.target.value)}
                  onPaste={e => {
                    const pasted = e.clipboardData.getData('text');
                    if (BLOCKED_CHARS_RE.test(pasted)) { e.preventDefault(); setControlNumberErr('Special characters are not allowed.'); }
                  }} />
                {controlNumberErr
                  ? <p className="text-xs text-red-500" role="alert">{controlNumberErr}</p>
                  : <p className="text-xs text-[var(--color-text-muted)] text-right">{controlNumber.length}/{controlMax}</p>
                }
              </motion.div>
            )}
          </AnimatePresence>

          {/* Others specify */}
          <AnimatePresence initial={false}>
            {isOthers && (
              <motion.div key="others-specify"
                initial={{ opacity: 0, y: -8, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                style={{ overflow: 'hidden' }} className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
                  Specify PRF Type <span className="text-red-500 normal-case tracking-normal">*</span>
                </label>
                <TextareaWithCharactersLeft
                  placeholder="Please specify the PRF type…"
                  value={otherType}
                  maxLength={otherMax}
                  error={otherTypeErr}
                  className="min-h-[64px] resize-none"
                  onChange={e => handleOtherType(e.target.value)}
                  onPaste={e => {
                    const pasted = e.clipboardData.getData('text');
                    if (BLOCKED_CHARS_RE.test(pasted)) { e.preventDefault(); setOtherTypeErr('Special characters are not allowed.'); }
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Purpose */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
              Purpose of Request <span className="text-red-500 normal-case tracking-normal">*</span>
            </label>
            <TextareaWithCharactersLeft
              placeholder="Describe the purpose of this request…"
              value={purpose}
              maxLength={purposeMax}
              error={purposeErr}
              className="min-h-[90px] resize-none"
              onChange={e => handlePurpose(e.target.value)}
              onPaste={e => {
                const pasted = e.clipboardData.getData('text');
                if (BLOCKED_CHARS_RE.test(pasted)) { e.preventDefault(); setPurposeErr('Special characters are not allowed.'); }
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] px-6 py-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--color-border)]
              text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)]
              transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={!isValid || saving}
            className="flex min-w-[130px] items-center justify-center gap-1.5 px-4 py-2 rounded-lg
              bg-[#2845D6] text-white text-sm font-semibold hover:bg-[#1f38c0]
              disabled:opacity-50 transition-colors">
            {saving
              ? <TextShimmer duration={1.2} className="text-sm font-semibold [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">Saving…</TextShimmer>
              : <><Check size={14} /><span>Save Changes</span></>
            }
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Cancel Confirmation Modal ──────────────────────────────────────────────────

function CancelConfirmModal({
  request,
  onClose,
  onCancelled,
}: {
  request:     PRFRequest;
  onClose:     () => void;
  onCancelled: (prf: PRFRequest) => void;
}) {
  const [cancelling, setCancelling] = useState(false);

  async function handleConfirm() {
    setCancelling(true);
    const minWait = new Promise(r => setTimeout(r, 1000));
    try {
      const res = await fetch(`/api/prform/requests/${request.id}/cancel`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      if (res.ok) {
        const data: PRFRequest = await res.json();
        await minWait;
        toast.success('PRF request has been cancelled.', { title: 'Request Cancelled' });
        onCancelled(data);
      } else {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        const msg = (err?.detail as string) ?? 'Failed to cancel request.';
        await minWait;
        toast.error(msg, { title: 'Cancellation Failed' });
        onClose();
      }
    } catch {
      await minWait;
      toast.error('Network error. Please try again.', { title: 'Error' });
      onClose();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1,    y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-[var(--color-border)]
          bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
      >
        <div className="p-6">
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
            Are you sure you want to cancel this request? This action cannot be undone.
          </p>
        </div>
        <div className="border-t border-[var(--color-border)] px-6 py-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={cancelling}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--color-border)]
              text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)]
              transition-colors disabled:opacity-50">
            Keep Request
          </button>
          <button type="button" onClick={handleConfirm} disabled={cancelling}
            className="flex min-w-[130px] items-center justify-center gap-1.5 px-4 py-2 rounded-lg
              bg-[var(--btn-danger-bg)] text-white text-sm  hover:bg-[var(--btn-danger-hover)]
              disabled:opacity-50 transition-colors">
            {cancelling
              ? <TextShimmer duration={1.2} className="text-sm [--base-color:#fca5a5] [--base-gradient-color:#ffffff]">Cancelling…</TextShimmer>
              : <><XCircle size={14} /><span>Yes, I confirm</span></>
            }
          </button>
        </div>
      </motion.div>
    </motion.div>
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

// ── Main Page ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

export default function PRFormPage() {
  const router = useRouter();

  const [user,       setUser]       = useState<UserData | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  const [requests,    setRequests]    = useState<PRFRequest[]>([]);
  const [meta,        setMeta]        = useState<PRFMeta | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [totalPages,  setTotalPages]  = useState(1);
  const [totalCount,  setTotalCount]  = useState(0);

  const [page,         setPage]         = useState(1);
  const [search,       setSearch]       = useState('');
  const debouncedSearch = useDebounce(search, 350);
  const [sortField,    setSortField]    = useState<SortField>('created_at');
  const [sortDir,      setSortDir]      = useState<SortDir>('desc');
  const [filterType,   setFilterType]   = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLoading, setFilterLoading] = useState(false);
  const filterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [totalEver,    setTotalEver]    = useState(0);
  const [elDraft,      setElDraft]      = useState<{ category: string; purpose: string } | null>(null);
  const [maDraft,      setMaDraft]      = useState<{ category: string; purpose: string; balance: string; coveredPeriod: string } | null>(null);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [viewReq,      setViewReq]      = useState<PRFRequest | null>(null);
  const [editReq,      setEditReq]      = useState<PRFRequest | null>(null);
  const [cancelReq,    setCancelReq]    = useState<PRFRequest | null>(null);


  // ── Auth ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => {
        if (r.status === 401) { router.replace('/'); return null; }
        return r.ok ? r.json() : null;
      })
      .then((data: UserData | null) => {
        if (!data) { router.replace('/'); return; }
        if (data.admin) { router.replace('/dashboard/pr-form/admin'); return; }
        setUser(data);
        setAuthLoaded(true);
      })
      .catch(() => router.replace('/'));
  }, [router]);

  // ── Meta ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoaded) return;
    fetch('/api/prform/meta', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: PRFMeta | null) => { if (data) setMeta(data); })
      .catch(() => {});
  }, [authLoaded]);

  // ── Reset to page 1 when search query changes ───────────────────────────
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  // ── Fetch requests ─────────────────────────────────────────────────────────
  const fetchRequests = useCallback(async () => {
    if (!authLoaded) return;
    setLoading(true);
    const minDelay = new Promise<void>(res => setTimeout(res, 2000));
    try {
      const params = new URLSearchParams({
        page:     String(page),
        sort_by:  sortField,
        sort_dir: sortDir,
      });
      if (debouncedSearch) params.set('search',   debouncedSearch);
      if (filterType)      params.set('prf_type', filterType);
      if (filterStatus)    params.set('status',   filterStatus);

      const res = await fetch(`/api/prform/requests?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data: PRFListResponse = await res.json();
        await minDelay;
        setRequests(data.results);
        setTotalPages(data.total_pages);
        setTotalCount(data.count);
        if (!filterType && !filterStatus && !debouncedSearch) {
          setTotalEver(data.count);
        }
      } else {
        await minDelay;
      }
    } finally {
      setLoading(false);
    }
  }, [authLoaded, page, sortField, sortDir, filterType, filterStatus, debouncedSearch]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // ── Sort ───────────────────────────────────────────────────────────────────
  function handleSort(field: string) {
    if (field === sortField) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field as SortField); setSortDir('desc'); }
    setPage(1);
  }

  // ── Filter ─────────────────────────────────────────────────────────────────
  function applyFilter(type: 'prf_type' | 'status', value: string) {
    setPage(1);
    setFilterLoading(true);
    if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
    filterTimerRef.current = setTimeout(() => setFilterLoading(false), 2000);
    if (type === 'prf_type') setFilterType(value === '__all__' ? '' : value);
    else                     setFilterStatus(value === '__all__' ? '' : value);
  }

  // ── Created callback ───────────────────────────────────────────────────────
  function handleCreated(_prf: PRFRequest) {
    setModalOpen(false);
    setPage(1);
    fetchRequests();
  }

  function handleEdited(prf: PRFRequest) {
    setEditReq(null);
    setRequests(prev => prev.map(r => r.id === prf.id ? prf : r));
  }

  function handleCancelled(prf: PRFRequest) {
    setCancelReq(null);
    setRequests(prev => prev.map(r => r.id === prf.id ? prf : r));
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  // ── Loading / auth gate ────────────────────────────────────────────────────
  if (!authLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[#2845D6] border-t-transparent animate-spin" />
      </div>
    );
  }

  // ── Filter popovers ────────────────────────────────────────────────────────
  const typeFilterContent = meta ? (
    <FilterListContent
      options={meta.prf_types}
      value={filterType}
      onChange={v => applyFilter('prf_type', v === '' ? '__all__' : v)}
      allLabel="All Types"
    />
  ) : null;

  const statusFilterContent = meta ? (
    <FilterListContent
      options={meta.statuses}
      value={filterStatus}
      onChange={v => applyFilter('status', v === '' ? '__all__' : v)}
      allLabel="All Statuses"
    />
  ) : null;

  // ── Table columns ──────────────────────────────────────────────────────────
  const columns: DataTableColumn<PRFRequest>[] = [
    {
      key: 'prf_number',
      label: 'PRF Number',
      sortField: 'prf_control_number',
      render: req => (
        <span className="text-xs font-semibold text-[var(--color-text-primary)] whitespace-nowrap">
          {req.prf_control_number}
        </span>
      ),
    },
    {
      key: 'prf_type',
      label: 'PRF Type',
      sortField: 'prf_type',
      filterContent: typeFilterContent ?? undefined,
      filterActive: !!filterType,
      render: req => (
        <div className="text-xs text-[var(--color-text-primary)]">
          <div
            className="font-medium truncate"
            title={req.prf_type === 'others' && req.control_number ? `Others: ${req.control_number}` : req.prf_type_display}
          >
            {req.prf_type === 'others' && req.control_number ? `Others: ${req.control_number}` : req.prf_type_display}
          </div>
          <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{req.prf_category_display}</div>
        </div>
      ),
    },
    {
      key: 'purpose',
      label: 'Purpose',
      sortField: 'purpose',
      thClassName: 'hidden lg:table-cell',
      tdClassName: 'hidden lg:table-cell',
      render: req => (
        <div className="text-xs text-[var(--color-text-muted)] line-clamp-2">{req.purpose}</div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortField: 'status',
      filterContent: statusFilterContent ?? undefined,
      filterActive: !!filterStatus,
      render: req => <StatusPill status={req.status} label={req.status_display} />,
    },
    {
      key: 'date',
      label: 'Date Submitted',
      sortField: 'created_at',
      thClassName: 'hidden lg:table-cell',
      tdClassName: 'hidden lg:table-cell',
      render: req => (
        <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">{fmtDate(req.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: req => (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="View"
            onClick={() => setViewReq(req)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
          >
            <Eye size={14} />
          </button>
          {req.status === 'pending' && (
            <>
              <button
                type="button"
                title="Edit"
                onClick={() => setEditReq(req)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                title="Cancel Request"
                onClick={() => setCancelReq(req)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <XCircle size={14} />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>

      <div className="p-4 md:p-6 space-y-3">

        {/* ── Page header ── */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Personal Request Form</h1>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Manage and track your personnel request forms
            </p>
          </div>

        </div>

        {/* ── Search bar + New Request (one row, space-between) ── */}
        <div className="flex items-center justify-between gap-3 mt-6">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="min-w-[200px] max-w-sm flex-1">
              <SearchBar
                value={search}
                onChange={v => setSearch(v)}
                placeholder="Search by PRF number, type, purpose…"
              />
            </div>

            {/* Active filter chips */}
            <AnimatePresence initial={false}>
              {filterType && meta && (
                <motion.span
                  key="chip-type"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                  className="inline-flex items-center gap-1 rounded-full bg-[#2845D6]/10 text-[#2845D6]
                    px-2.5 py-0.5 text-[11px] font-medium"
                >
                  {meta.prf_types.find(t => t.value === filterType)?.label ?? filterType}
                  <button
                    type="button"
                    onClick={() => applyFilter('prf_type', '__all__')}
                    className="hover:opacity-60 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                </motion.span>
              )}
              {filterStatus && meta && (
                <motion.span
                  key="chip-status"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                  className="inline-flex items-center gap-1 rounded-full bg-[#2845D6]/10 text-[#2845D6]
                    px-2.5 py-0.5 text-[11px] font-medium"
                >
                  {meta.statuses.find(s => s.value === filterStatus)?.label ?? filterStatus}
                  <button
                    type="button"
                    onClick={() => applyFilter('status', '__all__')}
                    className="hover:opacity-60 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {!loading && totalEver > 0 && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2845D6] text-white
                text-xs hover:bg-[#1f38c0] transition-colors shrink-0"
            >
              <Plus size={14} />
              New Request
            </button>
          )}
        </div>

        {/* ── Table ── */}
        <DataTable<PRFRequest>
          columns={columns}
          rows={requests}
          rowKey={req => req.id}
          loading={loading || filterLoading}
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          skeletonRows={PAGE_SIZE}
          emptyTitle={search || filterType || filterStatus ? 'No results found' : 'No requests yet'}
          emptyDescription={search || filterType || filterStatus ? 'Try adjusting your search or removing filters.' : 'Submit your first PRF request using the button above.'}
          emptyIcons={[ClipboardList, FileText, FilePlus]}
          emptyAction={!search && !filterType && !filterStatus ? { label: 'New Request', onClick: () => setModalOpen(true), icon: <Plus size={13} /> } : undefined}
          page={page}
          pageSize={PAGE_SIZE}
          totalCount={totalEver}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>
      <AnimatePresence>
        {modalOpen && (
          <SubmitPRFModal
            onClose={() => setModalOpen(false)}
            onCreated={handleCreated}
            onEmergencyLoan={draft => {
              setModalOpen(false);
              setElDraft(draft);
            }}
            onMedicineAllowance={draft => {
              setModalOpen(false);
              setMaDraft(draft);
            }}
          />
        )}
      </AnimatePresence>

      {/* ── View Modal ── */}
      <AnimatePresence>
        {viewReq && (
          <ViewPRFModal
            request={viewReq}
            onClose={() => setViewReq(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Edit Modal ── */}
      <AnimatePresence>
        {editReq && (
          <EditPRFModal
            request={editReq}
            onClose={() => setEditReq(null)}
            onEdited={handleEdited}
          />
        )}
      </AnimatePresence>

      {/* ── Cancel Confirm Modal ── */}
      <AnimatePresence>
        {cancelReq && (
          <CancelConfirmModal
            request={cancelReq}
            onClose={() => setCancelReq(null)}
            onCancelled={handleCancelled}
          />
        )}
      </AnimatePresence>

      {/* ── Emergency Loan Modal ── */}
      <AnimatePresence>
        {elDraft && user && (
          <EmergencyLoanModal
            draft={elDraft}
            user={user}
            onClose={() => setElDraft(null)}
            onCreated={prf => {
              setElDraft(null);
              handleCreated(prf);
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Medicine Allowance Modal ── */}
      <AnimatePresence>
        {maDraft && (
          <MedicineAllowanceModal
            draft={maDraft}
            onClose={() => setMaDraft(null)}
            onCreated={prf => {
              setMaDraft(null);
              handleCreated(prf);
            }}
          />
        )}
      </AnimatePresence>

    </>
  );
}

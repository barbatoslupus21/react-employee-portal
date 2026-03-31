'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import type { ChartCategory } from '@/components/ui/multi-series-chart';
import { AdminChartCard } from '@/components/ui/admin-chart-card';
import type { ChartViewType, ChartDisplayType } from '@/components/ui/admin-chart-card';
import { EmptyState } from '@/components/ui/interactive-empty-state';
import SearchBar from '@/components/ui/searchbar';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import {
  X,
  Upload,
  Download,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Info,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Wallet,
  Receipt,
  DollarSign,
  CreditCard,
  ListFilter,
  PiggyBank,
  Minus,
  Plus,
  CloudUpload,
} from 'lucide-react';
import { Tabs } from '@/components/ui/vercel-tabs';
import { FileUploadDropzone } from '@/components/ui/file-upload-dropzone';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import { useDebounce } from '@/hooks/use-debounce';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { toast } from '@/components/ui/toast';
import { getCsrfToken } from '@/lib/csrf';
import { cn } from '@/lib/utils';
import { styledXlsx, triggerDownload } from '@/lib/xlsx-export';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';


// ── Types ──────────────────────────────────────────────────────────────────────

interface UserData {
  id: number;
  idnumber: string;
  firstname: string | null;
  lastname: string | null;
  admin: boolean;
  accounting: boolean;
}

interface AllowanceType { id: number; name: string; replace_on_upload: boolean }
interface LoanType      { id: number; name: string; stackable: boolean }
interface SavingsType   { id: number; name: string }
interface PayslipType   { id: number; name: string }

interface FinanceTypesResponse {
  allowance_types: AllowanceType[];
  loan_types:      LoanType[];
  savings_types:   SavingsType[];
  payslip_types:   PayslipType[];
}

interface FinanceEmployeeRow {
  idnumber:   string;
  firstname:  string | null;
  lastname:   string | null;
  department: string;
  line:       string;
}

interface LoanRecord {
  id:               number;
  loan_type_name:   string;
  principal_amount: string;
  current_balance:  string;
  description:      string;
  reference_number: string;
  created_at:       string;
}

interface AllowanceRecord {
  id:                  number;
  allowance_type_name: string;
  amount:              string;
  description:         string;
  created_at:          string;
}

interface SavingsRecord {
  id:                number;
  savings_type_name: string;
  amount:            string;
  description:       string;
  created_at:        string;
}

interface PayslipRecord {
  id:                number;
  payslip_type_name: string;
  period_start:      string;
  period_end:        string;
  file_url:          string | null;
  description:       string;
  created_at:        string;
}

interface EmployeeDetailRecords {
  loans:      LoanRecord[];
  allowances: AllowanceRecord[];
  savings:    SavingsRecord[];
  payslips:   PayslipRecord[];
}

type FinanceTabKey = 'payslip' | 'loans' | 'allowance' | 'savings';

interface EmployeeListResponse {
  results:     FinanceEmployeeRow[];
  count:       number;
  page:        number;
  page_size:   number;
  total_pages: number;
}

interface ChartDataPoint {
  label:      string;
  loans:      number;
  allowances: number;
  savings:    number;
  [key: string]: number | string;
}

interface ChartResponse {
  view:     string;
  fy_start?: string;
  data:     ChartDataPoint[];
}

type RecordType = 'allowance' | 'loan' | 'deduction' | 'savings' | 'payslip';
type ExportType = RecordType | 'all';
type SortField  = 'idnumber' | 'lastname' | 'department' | 'line';
type SortDir    = 'asc' | 'desc';

interface FilterOpt {
  id:   number;
  name: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

const CHART_CATEGORIES: ChartCategory[] = [
  { key: 'loans',      label: 'Loans',      color: '#2845D6', gradId: 'grad_loans',  lightColor: '#5B78E8' },
  { key: 'allowances', label: 'Allowances', color: '#10B981', gradId: 'grad_allow',  lightColor: '#34D399' },
  { key: 'savings',    label: 'Savings',    color: '#F59E0B', gradId: 'grad_sav',    lightColor: '#FCD34D' },
];

const RECORD_TYPE_OPTIONS: { value: RecordType; label: string }[] = [
  { value: 'allowance',  label: 'Allowance' },
  { value: 'loan',       label: 'Loan' },
  { value: 'deduction',  label: 'Deduction' },
  { value: 'savings',    label: 'Savings' },
  { value: 'payslip',    label: 'Payslip' },
];

const IMPORT_COLUMNS: Record<RecordType, { col: string; required: boolean; note?: string }[]> = {
  allowance: [
    { col: 'A  —  idnumber',       required: true },
    { col: 'B  —  allowance_type', required: true, note: 'Must match an existing Allowance Type name exactly.' },
    { col: 'C  —  amount',         required: true, note: 'Positive number (e.g. 1500.00).' },
    { col: 'D  —  description',    required: false },
  ],
  loan: [
    { col: 'A  —  idnumber',        required: true },
    { col: 'B  —  loan_type',       required: true, note: 'Must match an existing Loan Type name exactly.' },
    { col: 'C  —  principal_amount',required: true, note: 'Positive number.' },
    { col: 'D  —  description',     required: false },
    { col: 'E  —  reference_number',required: false },
  ],
  deduction: [
    { col: 'A  —  idnumber',   required: true },
    { col: 'B  —  loan_id',    required: true, note: 'Integer PK of the target Loan record.' },
    { col: 'C  —  amount',     required: true, note: 'Must not exceed the loan\'s current balance.' },
    { col: 'D  —  description',required: false },
  ],
  savings: [
    { col: 'A  —  idnumber',     required: true },
    { col: 'B  —  savings_type', required: true, note: 'Must match an existing Savings Type name exactly.' },
    { col: 'C  —  amount',       required: true, note: 'Positive number.' },
    { col: 'D  —  description',  required: false },
  ],
  payslip: [], // payslip uses a dedicated PDF upload form, not xlsx columns
};

// ── Week helpers ───────────────────────────────────────────────────────────────

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

function getFYMonths(fyStartYear: number): { value: number; year: number; label: string }[] {
  const MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return [7,8,9,10,11,12,1,2,3,4,5,6].map(m => ({
    value: m,
    year:  m >= 7 ? fyStartYear : fyStartYear + 1,
    label: `${MN[m - 1]} ${m >= 7 ? fyStartYear : fyStartYear + 1}`,
  }));
}

function currentFYStart(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

function fmtCurrency(val: string | null | undefined): string {
  if (!val) return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}


// ── ImportModal section definitions ───────────────────────────────────────────

type ImportSectionKey =
  | 'regular-payslip'
  | 'ojt-payslip'
  | 'principal-balance'
  | 'deductions'
  | 'allowances'
  | 'savings';

const IMPORT_SECTIONS: {
  key:         ImportSectionKey;
  label:       string;
  icon:        React.ComponentType<{ size?: number; className?: string }>;
  recordType:  RecordType;
  isPayslip:   boolean;
  description: string;
  acceptLabel: string;
}[] = [
  {
    key:         'regular-payslip',
    label:       'Regular Payslip',
    icon:        Receipt,
    recordType:  'payslip',
    isPayslip:   true,
    description: 'Upload regular payslip PDF files for individual employees.',
    acceptLabel: 'PDF format, up to 5 MB',
  },
  {
    key:         'ojt-payslip',
    label:       'OJT Payslip',
    icon:        FileText,
    recordType:  'payslip',
    isPayslip:   true,
    description: 'Upload OJT payslip PDF files for individual employees.',
    acceptLabel: 'PDF format, up to 5 MB',
  },
  {
    key:         'principal-balance',
    label:       'Principal Balance',
    icon:        CreditCard,
    recordType:  'loan',
    isPayslip:   false,
    description: 'Upload loan principal balance records. You can upload multiple files at once.',
    acceptLabel: 'XLSX, XLS, CSV formats, up to 10 MB',
  },
  {
    key:         'deductions',
    label:       'Deductions',
    icon:        Minus,
    recordType:  'deduction',
    isPayslip:   false,
    description: 'Upload deduction records. You can upload multiple files at once.',
    acceptLabel: 'XLSX, XLS, CSV formats, up to 10 MB',
  },
  {
    key:         'allowances',
    label:       'Allowances',
    icon:        Plus,
    recordType:  'allowance',
    isPayslip:   false,
    description: 'Upload allowance records. You can upload multiple files at once.',
    acceptLabel: 'XLSX, XLS, CSV formats, up to 10 MB',
  },
  {
    key:         'savings',
    label:       'Savings',
    icon:        PiggyBank,
    recordType:  'savings',
    isPayslip:   false,
    description: 'Upload savings files. You can upload multiple files at once.',
    acceptLabel: 'XLSX, XLS, CSV formats, up to 10 MB',
  },
];

// ── ImportModal ────────────────────────────────────────────────────────────────

function ImportModal({
  onClose,
  onSuccess,
  financeTypes,
}: {
  onClose:      () => void;
  onSuccess:    () => void;
  financeTypes: FinanceTypesResponse | null;
}) {
  const [activeSection, setActiveSection] = useState<ImportSectionKey>('regular-payslip');

  // ── Shared import state ───────────────────────────────────────────────────
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<'idle' | 'validating' | 'uploading' | 'done' | 'error'>('idle');
  const [checkProgress, setCheckProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [validationErrors, setValidationErrors] = useState<{ file: string; issue: string }[]>([]);
  const [result, setResult] = useState<{ imported: number; failed: number; error_report_b64: string | null } | null>(null);

  // ── Payslip metadata state (no Employee ID / Description fields per request) ──
  const [psType,        setPsType]        = useState('');
  const [psPeriodStart, setPsPeriodStart] = useState<Date | undefined>(undefined);
  const [psPeriodEnd,   setPsPeriodEnd]   = useState<Date | undefined>(undefined);
  const [psSuccess,     setPsSuccess]     = useState(false);
  const [psErrors,      setPsErrors]      = useState<Record<string, string>>({});


  // ── Derived section values ────────────────────────────────────────────────
  const section    = IMPORT_SECTIONS.find(s => s.key === activeSection)!;
  const recordType = section.recordType;
  const isPayslip  = section.isPayslip;

  function resetPayslipForm() {
    setPsType(''); setPsPeriodStart(undefined); setPsPeriodEnd(undefined);
    setFiles([]); setPsSuccess(false); setPsErrors({});
    setPhase('idle'); setCheckProgress(0); setUploadProgress(0); setValidationErrors([]); setResult(null);
  }

  const filenamePattern = /^([0-9]+)_([A-Za-z][A-Za-z ]+)\.pdf$/i;

  async function checkEmployeeExists(idnumber: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/finance/admin/employees?search=${encodeURIComponent(idnumber)}&page=1&page_size=1`, {
        credentials: 'include',
      });
      if (!res.ok) return true; // Optional check; backend can enforce required integrity.
      const data = await res.json();
      return (data?.results?.length ?? 0) > 0;
    } catch {
      return true;
    }
  }

  function downloadValidationErrorReport(errors: { file: string; issue: string }[]) {
    try {
      const blob = styledXlsx(
        ['File', 'Issue'],
        errors.map(e => [e.file, e.issue]),
      );
      triggerDownload(blob, 'validation_errors.xlsx');
    } catch (err) {
      console.error('Failed to build validation error report:', err);
      toast.error('Could not generate error report.');
    }
  }

  async function validateFiles() {
    if (files.length === 0) {
      toast.warning('No files selected for upload.');
      return false;
    }

    setPhase('validating');
    setValidationErrors([]);

    const errors: { file: string; issue: string }[] = [];

    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      const nextProgress = Math.round(((i + 1) / files.length) * 100);
      setCheckProgress(nextProgress);
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 120));

      if (recordType === 'payslip') {
        if (!f.name.toLowerCase().endsWith('.pdf')) {
          errors.push({ file: f.name, issue: 'Invalid file type (expected PDF).' });
          continue;
        }

        const match = f.name.match(filenamePattern);
        if (!match) {
          errors.push({ file: f.name, issue: 'Filename must be IDNumber_EmployeeName.pdf' });
          continue;
        }

        if (f.size > 5 * 1024 * 1024) {
          errors.push({ file: f.name, issue: 'File must not exceed 5 MB.' });
          continue;
        }

        const idNumber = match[1];
        const validEmployee = await checkEmployeeExists(idNumber);
        if (!validEmployee) {
          errors.push({ file: f.name, issue: `Employee ID ${idNumber} not found.` });
        }
      } else {
        // xlsx / csv validation
        const lower = f.name.toLowerCase();
        const validExts = ['.xlsx', '.xls', '.csv'];
        if (!validExts.some((ext) => lower.endsWith(ext))) {
          errors.push({ file: f.name, issue: `Invalid file type. Expected: ${validExts.join(', ')}` });
          continue;
        }

        if (f.size > 10 * 1024 * 1024) {
          errors.push({ file: f.name, issue: 'File must not exceed 10 MB.' });
        }
      }
    }

    setCheckProgress(100);

    if (errors.length > 0) {
      setValidationErrors(errors);
      setPhase('error');
      downloadValidationErrorReport(errors);
      toast.error('Some files failed validation. Downloaded error report.');
      return false;
    }

    setPhase('idle');
    return true;
  }

  async function uploadFiles() {
    setPhase('uploading');
    setUploadProgress(0);

    if (recordType === 'payslip') {
      let uploaded = 0;
      let failed = 0;

      for (let i = 0; i < files.length; i += 1) {
        const fileItem = files[i];
        const form = new FormData();
        form.append('file', fileItem);
        form.append('idnumber', fileItem.name.replace(/\.pdf$/i, '').split('_')[0]);
        form.append('payslip_type', psType);
        form.append('period_start', psPeriodStart?.toISOString().split('T')[0] ?? '');
        form.append('period_end', psPeriodEnd?.toISOString().split('T')[0] ?? '');

        try {
          const res = await fetch('/api/finance/admin/payslip-upload', {
            method: 'POST',
            credentials: 'include',
            headers: { 'X-CSRFToken': getCsrfToken() },
            body: form,
          });

          if (res.ok) {
            uploaded += 1;
          } else {
            failed += 1;
          }
        } catch {
          failed += 1;
        }

        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }

      setResult({ imported: uploaded, failed, error_report_b64: null });

      if (uploaded > 0) {
        setPsSuccess(true);
        toast.success(`${uploaded} payslip${uploaded !== 1 ? 's' : ''} uploaded successfully.`);
        onSuccess();
      }

      if (failed > 0) {
        toast.warning(`${failed} file${failed !== 1 ? 's' : ''} failed to upload.`);
      }

      setPhase('done');
      return;
    }

    // Generic finance import endpoint for xlsx/loan/allowance/savings/deduction
    const fd = new FormData();
    files.forEach((f) => fd.append('file', f));
    fd.append('record_type', recordType);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/finance/admin/import?record_type=${recordType}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-CSRFToken', getCsrfToken());

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    return new Promise<void>((resolve) => {
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText);
          setResult(data);
          setPhase('done');
          if (data.imported > 0) onSuccess();
          if (data.failed > 0 && data.error_report_b64) {
            try {
              const raw = atob(data.error_report_b64);
              const buf = new Uint8Array(raw.length);
              for (let j = 0; j < raw.length; j++) buf[j] = raw.charCodeAt(j);
              const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
              triggerDownload(blob, 'import_errors.xlsx');
            } catch (err) {
              console.error('Failed to trigger import error report download:', err);
              toast.error('Could not download error report.');
            }
          }
        } else {
          toast.error('Import failed.');
          setPhase('error');
        }
        resolve();
      };

      xhr.onerror = () => {
        toast.error('Network error during upload.');
        setPhase('error');
        resolve();
      };

      xhr.send(fd);
    });
  }

  async function handleSubmit() {
    if (phase === 'validating' || phase === 'uploading') return;
    const valid = await validateFiles();
    if (!valid) return;
    await uploadFiles();
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  let allowanceNote: string | null = null;
  if (recordType === 'allowance' && financeTypes) {
    const replaceTypes = financeTypes.allowance_types.filter(t => t.replace_on_upload).map(t => t.name);
    if (replaceTypes.length > 0)
      allowanceNote = `Types with replace-on-upload (existing rows will be replaced): ${replaceTypes.join(', ')}.`;
  }
  let loanNote: string | null = null;
  if (recordType === 'loan' && financeTypes) {
    const nonStack = financeTypes.loan_types.filter(t => !t.stackable).map(t => t.name);
    if (nonStack.length > 0)
      loanNote = `Non-stackable types (rejected if active balance exists): ${nonStack.join(', ')}.`;
  }

  function downloadTemplate() {
    if (isPayslip) return;
    const cols = IMPORT_COLUMNS[recordType];
    const headers = cols.map(c => {
      const parts = c.col.split('—');
      return (parts.pop()?.trim() ?? c.col).replace(/\s+/g, '');
    });
    const blob = styledXlsx(headers, [[]]);
    triggerDownload(blob, `${section.key}_template.xlsx`);
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
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Import Data</h2>
          <button type="button" onClick={onClose} disabled={phase === 'uploading' || phase === 'validating'}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-40">
            <X size={15} />
          </button>
        </div>

        {/* Two-panel body */}
        <div className="flex" style={{ minHeight: '420px', maxHeight: 'calc(100vh - 16rem)' }}>

          {/* ── Left sidebar nav ── */}
          <nav className="w-44 shrink-0 border-r border-[var(--color-border)] py-2 flex flex-col gap-0.5 overflow-y-auto [scrollbar-width:thin]">
            {IMPORT_SECTIONS.map(sec => {
              const isActive = sec.key === activeSection;
              const Icon = sec.icon;
              return (
                <button
                  key={sec.key}
                  type="button"
                  onClick={() => {
                    if (sec.key === activeSection) return;
                    setActiveSection(sec.key);
                    setFiles([]); setResult(null); setPhase('idle'); setCheckProgress(0); setUploadProgress(0);
                    resetPayslipForm();
                  }}
                  className={cn(
                    'flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-xs transition-colors',
                    isActive
                      ? 'bg-[#2845D6]/8 text-[#2845D6] font-semibold'
                      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] font-medium',
                  )}
                >
                  <Icon size={15} className={isActive ? 'text-[#2845D6]' : 'text-[var(--color-text-muted)]'} />
                  <span className="truncate">{sec.label}</span>
                </button>
              );
            })}
          </nav>

          {/* ── Right content panel ── */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">

            {/* Instruction box – light green */}
            <div className="bg-green-50 dark:bg-green-950/20 border-b border-green-200/70 dark:border-green-900/40 px-5 py-4 shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-green-900 dark:text-green-200">{section.label}</p>
                  <p className="text-xs text-green-700 dark:text-green-400 mt-0.5 leading-relaxed">{section.description}</p>
                </div>
                {!isPayslip && (
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-green-400/70 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                  >
                    <Download size={12} />
                    Download Template
                  </button>
                )}
              </div>
            </div>

            {/* Upload / form content area */}
            <div className="flex-1 overflow-y-auto px-5 py-5 [scrollbar-width:thin] space-y-4">

              {/* ── Payslip PDF form ── */}
              {isPayslip && (
                <div className="space-y-4">

                  {/* Row 1: Payslip Category */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Payslip Category</label>
                    <Select value={psType} onValueChange={setPsType}>
                      <SelectTrigger className="h-9 text-sm w-full">
                        <SelectValue placeholder="Select payslip category" />
                      </SelectTrigger>
                      <SelectContent>
                        {(financeTypes?.payslip_types ?? []).map((t) => (
                          <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {psErrors.payslip_type && <p className="text-xs text-red-500">{psErrors.payslip_type}</p>}
                  </div>

                  {/* Row 2: Period Start + Period End */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Period Start</label>
                      <DateTimePicker
                        value={psPeriodStart}
                        onChange={(d) => {
                          setPsPeriodStart(d);
                          if (psPeriodEnd && d > psPeriodEnd) setPsPeriodEnd(undefined);
                        }}
                        placeholder="Select start date"
                        disabled={phase === 'uploading' || phase === 'validating'}
                      />
                      {psErrors.period_start && <p className="text-xs text-red-500">{psErrors.period_start}</p>}
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Period End</label>
                      <DateTimePicker
                        value={psPeriodEnd}
                        onChange={(d) => {
                          if (!psPeriodStart || d >= psPeriodStart) setPsPeriodEnd(d);
                        }}
                        placeholder="Select end date"
                        disabled={phase === 'uploading' || phase === 'validating'}
                      />
                      {psErrors.period_end && <p className="text-xs text-red-500">{psErrors.period_end}</p>}
                    </div>
                  </div>

                  {/* Row 3: Drag-and-drop upload area */}
                  <FileUploadDropzone
                    files={files}
                    onFilesChange={setFiles}
                    accept=".pdf"
                    multiple
                    label="Click to select or drag & drop"
                    helperText="Filename must be IDNumber_EmployeeName.pdf"
                    disabled={phase === 'uploading'}
                  />

                  {phase === 'validating' && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-[var(--color-text-muted)]">Validation in progress {checkProgress}%</p>
                      <div className="h-2 w-full rounded-full bg-[var(--color-border)]">
                        <div className="h-full rounded-full bg-[#2845D6] transition-all" style={{ width: `${checkProgress}%` }} />
                      </div>
                    </div>
                  )}

                  {phase === 'uploading' && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-[var(--color-text-muted)]">Upload progress {uploadProgress}%</p>
                      <div className="h-2 w-full rounded-full bg-[var(--color-border)]">
                        <div className="h-full rounded-full bg-[#10B981] transition-all" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* ── xlsx import UI ── */}
              {!isPayslip && (
                <>
                  <div className="space-y-4">
                    <FileUploadDropzone
                      files={files}
                      onFilesChange={setFiles}
                      accept=".xlsx,.xls,.csv"
                      multiple
                      label="Click to select or drag & drop"
                      helperText={section.acceptLabel}
                      disabled={phase === 'uploading'}
                    />

                    {phase === 'validating' && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-[var(--color-text-muted)]">Validation in progress {checkProgress}%</p>
                        <div className="h-2 w-full rounded-full bg-[var(--color-border)] overflow-hidden">
                          <div className="h-full bg-[#2845D6] transition-all" style={{ width: `${checkProgress}%` }} />
                        </div>
                      </div>
                    )}

                    {phase === 'uploading' && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-[var(--color-text-muted)]">Uploading files {uploadProgress}%</p>
                        <div className="h-2 w-full rounded-full bg-[var(--color-border)] overflow-hidden">
                          <div className="h-full bg-[#10B981] transition-all" style={{ width: `${uploadProgress}%` }} />
                        </div>
                      </div>
                    )}

                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3 space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Required Columns (xlsx, row 1 = header)</p>
                      <ul className="space-y-1.5">
                        {IMPORT_COLUMNS[recordType].map((c) => (
                          <li key={c.col} className="flex items-start gap-2 text-xs text-[var(--color-text-primary)]">
                            <span className={cn(
                              'mt-0.5 flex-shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold',
                              c.required ? 'bg-[#2845D6]/10 text-[#2845D6]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
                            )}>{c.required ? 'REQ' : 'OPT'}</span>
                            <span>
                              <span className="font-mono">{c.col}</span>
                              {c.note && <span className="ml-1 text-[var(--color-text-muted)]">— {c.note}</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {allowanceNote && <p className="text-xs text-amber-600 dark:text-amber-400">{allowanceNote}</p>}
                      {loanNote && <p className="text-xs text-amber-600 dark:text-amber-400">{loanNote}</p>}
                    </div>

                  </div>
                </>
              )}

            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={files.length === 0 || phase === 'uploading' || phase === 'validating' || (isPayslip && (!psType || !psPeriodStart || !psPeriodEnd))}
            className="h-9 px-5 rounded-lg text-sm font-medium bg-[#2845D6] text-white hover:bg-[#1e35b5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {phase === 'uploading' || phase === 'validating' ? (
              <TextShimmer className="text-sm" duration={1.2}>{phase === 'validating' ? 'Validating…' : 'Uploading…'}</TextShimmer>
            ) : (
              <>
                <Upload size={15} />
                Validate &amp; Upload
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );

}


// ── ExportModal ────────────────────────────────────────────────────────────────

function ExportModal({ onClose }: { onClose: () => void }) {
  const [recordType, setRecordType] = useState<ExportType>('all');
  const [dateFrom,   setDateFrom]   = useState(todayISO());
  const [dateTo,     setDateTo]     = useState(todayISO());
  const [exporting,  setExporting]  = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        record_type: recordType,
        date_from:   dateFrom,
        date_to:     dateTo,
      });
      const res = await fetch(`/api/finance/admin/export?${params}`, {
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { detail?: string }).detail ?? 'Export failed.');
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `finance_${recordType}_${dateFrom}_${dateTo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded successfully.');
      onClose();
    } finally {
      setExporting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={exporting ? undefined : onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div className="flex items-center gap-2">
            <Download size={16} className="text-[#2845D6]" />
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Export Finance Records</h2>
          </div>
          <button type="button" onClick={onClose} disabled={exporting}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-40">
            <X size={15} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Record type */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Record Type</label>
            <Select value={recordType} onValueChange={v => setRecordType(v as ExportType)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types (multi-sheet)</SelectItem>
                {RECORD_TYPE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date from */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[#2845D6]/30"
            />
          </div>

          {/* Date to */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[#2845D6]/30"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} disabled={exporting}
            className="h-9 px-5 rounded-lg text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || !dateFrom || !dateTo}
            className="h-9 px-5 rounded-lg text-sm font-medium bg-[#2845D6] text-white hover:bg-[#1e35b5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting
              ? <TextShimmer className="text-sm" duration={1.2}>Exporting…</TextShimmer>
              : 'Export'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}


// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
  });
}

function buildPaginationRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  const start = Math.max(2, current - 1);
  const end   = Math.min(total - 1, current + 1);
  for (let p = start; p <= end; p++) pages.push(p);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

// ── Skeleton rows ──────────────────────────────────────────────────────────────

function SkeletonTableRows({ count = 10 }: { count?: number }) {
  const widths = [80, 144, 112, 96, 16];
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="border-b border-[var(--color-border)]">
          {widths.map((w, j) => (
            <td key={j} className="px-4 py-3">
              <div
                className="h-3 animate-pulse rounded-full bg-[var(--color-skeleton)]"
                style={{ width: w }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── Sort icon ──────────────────────────────────────────────────────────────────

function SortIconCell({ field, current, dir }: { field: string; current: string; dir: 'asc' | 'desc' }) {
  if (field !== current)
    return <ChevronsUpDown size={11} className="shrink-0 text-[var(--color-text-muted)] opacity-40" />;
  return dir === 'asc'
    ? <ChevronUp   size={11} className="shrink-0 text-[#2845D6]" />
    : <ChevronDown size={11} className="shrink-0 text-[#2845D6]" />;
}

// ── Multi-select filter popover (ID Number) ────────────────────────────────────

interface FilterOption { value: string; label: string; }

function MultiSelectFilterPopover({
  label,
  options,
  selected,
  onChange,
  withSearch = false,
  disabled = false,
}: {
  label:       string;
  options:     FilterOption[];
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

// ── Single-select filter popover (Department / Line) ───────────────────────────

function SingleSelectFilterPopover({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label:      string;
  options:    FilterOption[];
  value:      string;
  onChange:   (val: string) => void;
  disabled?:  boolean;
}) {
  const [open, setOpen] = useState(false);
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

  const isActive = value !== '';

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
              onClick={() => { onChange(''); setOpen(false); }}
              className={cn(
                'w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                !value
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
                onClick={() => { onChange(o.value); setOpen(false); }}
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
      </PopoverContent>
    </Popover>
  );
}

// ── Finance tabs config ────────────────────────────────────────────────────────

const FINANCE_TABS: { key: FinanceTabKey; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: 'payslip',   label: 'Payslip',   icon: FileText   },
  { key: 'loans',     label: 'Loans',     icon: CreditCard },
  { key: 'allowance', label: 'Allowance', icon: Wallet     },
  { key: 'savings',   label: 'Savings',   icon: DollarSign },
];

// ── Tab content — animated cert-style list ────────────────────────────────────

/** Container: staggers child rows on mount / tab switch. */
const LIST_CONTAINER_VARIANTS = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
} as const;

/** Each row: spring entrance matching animated-project-cards pattern. */
const LIST_ITEM_VARIANTS = {
  hidden:  { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 28, mass: 0.8 },
  },
} as const;

function TabContent({
  tab,
  records,
  fetchError,
}: {
  tab:        FinanceTabKey;
  records:    EmployeeDetailRecords | null;
  fetchError: boolean;
}) {
  if (fetchError) {
    return (
      <div className="flex items-center justify-center py-6">
        <p className="text-xs text-red-500">Failed to load records. Please try again.</p>
      </div>
    );
  }
  if (!records) return null;

  switch (tab) {
    case 'payslip': {
      const items = records.payslips;
      if (items.length === 0) return (
        <EmptyState
          title="No payslips"
          description="This employee has no payslip records yet."
          icons={[FileText, FileSpreadsheet, Receipt]}
          className="py-6 transition-colors hover:bg-white/10 dark:hover:bg-black/10"
        />
      );
      return (
        <motion.ul
          initial="hidden"
          animate="visible"
          variants={LIST_CONTAINER_VARIANTS}
          className="divide-y divide-[var(--color-border)]"
        >
          {items.map(p => (
            <motion.li
              key={p.id}
              variants={LIST_ITEM_VARIANTS}
              className="flex items-center gap-3 py-3"
            >
              <div className="w-1 h-5 shrink-0 rounded-full" style={{ backgroundColor: '#2845D6' }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{p.payslip_type_name}</p>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  {p.period_start} – {p.period_end}
                  {p.description && <span className="ml-2 italic">{p.description}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-[var(--color-text-muted)]">{fmtDate(p.created_at)}</span>
                {p.file_url && (
                  <a
                    href={p.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    title="View Payslip"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
                  >
                    <FileText size={12} />
                  </a>
                )}
              </div>
            </motion.li>
          ))}
        </motion.ul>
      );
    }
    case 'loans': {
      const items = records.loans;
      if (items.length === 0) return (
        <EmptyState
          title="No loans"
          description="This employee has no active loan records."
          icons={[CreditCard, Receipt, DollarSign]}
          className="py-6 transition-colors hover:bg-white/10 dark:hover:bg-black/10"
        />
      );
      return (
        <motion.ul
          initial="hidden"
          animate="visible"
          variants={LIST_CONTAINER_VARIANTS}
          className="divide-y divide-[var(--color-border)]"
        >
          {items.map(l => (
            <motion.li
              key={l.id}
              variants={LIST_ITEM_VARIANTS}
              className="flex items-center gap-3 py-3"
            >
              <div className="w-1 h-5 shrink-0 rounded-full" style={{ backgroundColor: '#F59E0B' }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{l.loan_type_name}</p>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Principal: ₱{fmtCurrency(l.principal_amount)}
                  <span className="mx-1.5">·</span>
                  Balance: ₱{fmtCurrency(l.current_balance)}
                  {l.reference_number && <span className="ml-2">Ref: {l.reference_number}</span>}
                </p>
              </div>
              <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">{fmtDate(l.created_at)}</span>
            </motion.li>
          ))}
        </motion.ul>
      );
    }
    case 'allowance': {
      const items = records.allowances;
      if (items.length === 0) return (
        <EmptyState
          title="No allowances"
          description="This employee has no allowance records."
          icons={[Wallet, DollarSign, Receipt]}
          className="py-6 transition-colors hover:bg-white/10 dark:hover:bg-black/10"
        />
      );
      return (
        <motion.ul
          initial="hidden"
          animate="visible"
          variants={LIST_CONTAINER_VARIANTS}
          className="divide-y divide-[var(--color-border)]"
        >
          {items.map(a => (
            <motion.li
              key={a.id}
              variants={LIST_ITEM_VARIANTS}
              className="flex items-center gap-3 py-3"
            >
              <div className="w-1 h-5 shrink-0 rounded-full" style={{ backgroundColor: '#10B981' }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{a.allowance_type_name}</p>
                {a.description && (
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate">{a.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  ₱{fmtCurrency(a.amount)}
                </span>
                <span className="text-[10px] text-[var(--color-text-muted)]">{fmtDate(a.created_at)}</span>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      );
    }
    case 'savings': {
      const items = records.savings;
      if (items.length === 0) return (
        <EmptyState
          title="No savings"
          description="This employee has no savings records."
          icons={[DollarSign, Wallet, CreditCard]}
          className="py-6 transition-colors hover:bg-white/10 dark:hover:bg-black/10"
        />
      );
      return (
        <motion.ul
          initial="hidden"
          animate="visible"
          variants={LIST_CONTAINER_VARIANTS}
          className="divide-y divide-[var(--color-border)]"
        >
          {items.map(s => (
            <motion.li
              key={s.id}
              variants={LIST_ITEM_VARIANTS}
              className="flex items-center gap-3 py-3"
            >
              <div className="w-1 h-5 shrink-0 rounded-full" style={{ backgroundColor: '#8B5CF6' }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{s.savings_type_name}</p>
                {s.description && (
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate">{s.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-semibold text-[#2845D6]">
                  ₱{fmtCurrency(s.amount)}
                </span>
                <span className="text-[10px] text-[var(--color-text-muted)]">{fmtDate(s.created_at)}</span>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      );
    }
  }
}

// ── Accordion row ──────────────────────────────────────────────────────────────

function FinanceAccordionRow({
  emp,
  isExpanded,
  onToggle,
  refreshKey,
}: {
  emp:        FinanceEmployeeRow;
  isExpanded: boolean;
  onToggle:   () => void;
  refreshKey: number;
}) {
  const fullName = [emp.lastname, emp.firstname].filter(Boolean).join(', ') || emp.idnumber;

  const [activeTab,  setActiveTab ] = useState<FinanceTabKey>('payslip');
  const [records,    setRecords   ] = useState<EmployeeDetailRecords | null>(null);
  const [loading,    setLoading   ] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const hasFetchedRef  = useRef(false);
  const prevRefreshKey = useRef(refreshKey);

  // Clear cache when refreshKey changes so next expand re-fetches
  useEffect(() => {
    if (prevRefreshKey.current !== refreshKey) {
      prevRefreshKey.current = refreshKey;
      hasFetchedRef.current  = false;
      setRecords(null);
      setFetchError(false);
    }
  }, [refreshKey]);

  // Fetch records on expand (lazy, once per refresh cycle)
  useEffect(() => {
    if (!isExpanded || hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    setLoading(true);
    setFetchError(false);
    fetch(`/api/finance/admin/employees/${encodeURIComponent(emp.idnumber)}/records`, {
      credentials: 'include',
    })
      .then(r => (r.ok ? (r.json() as Promise<EmployeeDetailRecords>) : Promise.reject()))
      .then(data => { setRecords(data); })
      .catch(() => { setFetchError(true); })
      .finally(() => { setLoading(false); });
  }, [isExpanded, emp.idnumber]);

  return (
    <React.Fragment>
      {/* Employee header row */}
      <tr
        className={cn(
          'border-b border-[var(--color-border)] cursor-pointer transition-colors select-none',
          isExpanded
            ? 'bg-[var(--color-bg-elevated)]'
            : 'hover:bg-[var(--color-bg-elevated)]',
        )}
        onClick={onToggle}
      >
        <td className="px-4 py-3.5 text-xs text-[var(--color-text-muted)]">
          {emp.idnumber}
        </td>
        <td className="px-4 py-3.5 text-xs font-medium text-[var(--color-text-primary)]">
          {fullName}
        </td>
        <td className="px-4 py-3.5 text-xs text-[var(--color-text-muted)] hidden sm:table-cell">
          {emp.department || '—'}
        </td>
        <td className="px-4 py-3.5 text-xs text-[var(--color-text-muted)] hidden sm:table-cell">
          {emp.line || '—'}
        </td>
        <td className="px-4 py-3.5 text-[var(--color-text-muted)] w-10">
          {isExpanded
            ? <ChevronDown  size={15} />
            : <ChevronRight size={15} />
          }
        </td>
      </tr>

      {/* Expanded records panel */}
      <AnimatePresence>
        {isExpanded && (
          <tr key={`${emp.idnumber}-expanded`}>
            <td colSpan={5} className="p-0">
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.32, ease: [0.04, 0.62, 0.23, 0.98] }}
                className="overflow-hidden bg-[var(--color-bg)] border-t border-[var(--color-border)]"
              >
                {/* ── Vercel-style tab bar ── */}
                <div
                  className="px-5 pt-3 pb-3 border-b border-[var(--color-border)]"
                  onClick={e => e.stopPropagation()}
                >
                  <Tabs
                    tabs={FINANCE_TABS.map(t => ({ id: t.key, label: t.label, icon: t.icon }))}
                    activeTab={activeTab}
                    onTabChange={id => setActiveTab(id as FinanceTabKey)}
                  />
                </div>

                {/* ── Tab content — fixed-height scrollable container ── */}
                <div className="h-64 overflow-y-auto px-5 py-3 [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]">
                  {loading ? (
                    /* Skeleton rows that match the list-item shape */
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="divide-y divide-[var(--color-border)]"
                    >
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 py-3">
                          <div className="w-1 h-5 shrink-0 rounded-full bg-[var(--color-skeleton)] animate-pulse" />
                          <div className="flex-1 space-y-1.5">
                            <div
                              className="h-3 rounded-full bg-[var(--color-skeleton)] animate-pulse"
                              style={{ width: `${60 - i * 5}%` }}
                            />
                            <div
                              className="h-2.5 rounded-full bg-[var(--color-skeleton)] animate-pulse opacity-60"
                              style={{ width: `${45 - i * 4}%` }}
                            />
                          </div>
                          <div className="h-2.5 w-16 shrink-0 rounded-full bg-[var(--color-skeleton)] animate-pulse" />
                        </div>
                      ))}
                    </motion.div>
                  ) : (
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.16 }}
                      >
                        <TabContent tab={activeTab} records={records} fetchError={fetchError} />
                      </motion.div>
                    </AnimatePresence>
                  )}
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </React.Fragment>
  );
}


// ── Main page ──────────────────────────────────────────────────────────────────

export default function FinanceAdminPage() {
  const router = useRouter();

  // ── Auth phase ─────────────────────────────────────────────────────────────
  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');
  const [user, setUser] = useState<UserData | null>(null);
  const authTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    authTimerRef.current = setTimeout(() => {
      setAuthPhase('checking');
    }, 350);

    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: UserData | null) => {
        if (authTimerRef.current) clearTimeout(authTimerRef.current);
        if (!data || !data.admin || !data.accounting) {
          router.replace('/dashboard');
          return;
        }
        setUser(data);
        setAuthPhase('done');
      })
      .catch(() => {
        if (authTimerRef.current) clearTimeout(authTimerRef.current);
        router.replace('/dashboard');
      });

    return () => {
      if (authTimerRef.current) clearTimeout(authTimerRef.current);
    };
  }, [router]);

  // ── Chart state ────────────────────────────────────────────────────────────
  const [viewType,       setViewType]       = useState<ChartViewType>('monthly');
  const [chartType,      setChartType]      = useState<ChartDisplayType>('bar');
  const [fyStart,        setFYStart]        = useState(currentFYStart());
  const [selectedMonth,  setSelectedMonth]  = useState(new Date().getMonth() + 1);
  const [selectedYear,   setSelectedYear]   = useState(new Date().getFullYear());
  const [weekStart,      setWeekStart]      = useState(getCurrentWeekStart());
  const [chartData,      setChartData]      = useState<ChartDataPoint[]>([]);
  const [chartLoading,   setChartLoading]   = useState(true);
  const [chartTransitioning, setChartTransitioning] = useState(false);
  const chartInitialized = useRef(false);

  // ── Employee list state ────────────────────────────────────────────────────
  const [employees,      setEmployees]      = useState<FinanceEmployeeRow[]>([]);
  const [totalCount,     setTotalCount]     = useState(0);
  const [totalPages,     setTotalPages]     = useState(1);
  const [page,           setPage]           = useState(1);
  const [tableLoading,   setTableLoading]   = useState(true);
  const [search,         setSearch]         = useState('');
  const debouncedSearch = useDebounce(search, 350);
  const [sortField,      setSortField]      = useState<SortField>('lastname');
  const [sortDir,        setSortDir]        = useState<SortDir>('asc');
  const [expandedIds,    setExpandedIds]    = useState<Set<string>>(new Set());
  const [refreshKey,     setRefreshKey]     = useState(0);

  // ── Column filter state ────────────────────────────────────────────────────
  const [filterOptions, setFilterOptions] = useState<{ departments: FilterOpt[]; lines: FilterOpt[]; idnumbers: string[] } | null>(null);
  const [deptFilter,    setDeptFilter   ] = useState<string>('');
  const [lineFilter,    setLineFilter   ] = useState<string>('');
  const [idFilter,      setIdFilter     ] = useState<string[]>([]);

  // ── Finance types ──────────────────────────────────────────────────────────
  const [financeTypes, setFinanceTypes] = useState<FinanceTypesResponse | null>(null);

  // ── Modal state ────────────────────────────────────────────────────────────
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // ── Chart fetch ────────────────────────────────────────────────────────────
  const fetchChart = useCallback(async () => {
    if (authPhase !== 'done') return;
    if (!chartInitialized.current) {
      setChartLoading(true);
    } else {
      setChartTransitioning(true);
    }
    try {
      let url = '/api/finance/admin/chart?view=' + viewType;
      if (viewType === 'fiscal') url += `&year=${fyStart}`;
      else if (viewType === 'monthly') url += `&year=${selectedYear}&month=${selectedMonth}`;
      else url += `&week_start=${weekStart}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return;
      const data: ChartResponse = await res.json();
      setChartData(data.data);
      chartInitialized.current = true;
    } finally {
      setChartLoading(false);
      setChartTransitioning(false);
    }
  }, [authPhase, viewType, fyStart, selectedMonth, selectedYear, weekStart]);

  useEffect(() => { fetchChart(); }, [fetchChart]);

  // ── Types fetch ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authPhase !== 'done') return;
    fetch('/api/finance/admin/types', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: FinanceTypesResponse | null) => { if (d) setFinanceTypes(d); })
      .catch(() => {});
  }, [authPhase]);

  // ── Filter options fetch ───────────────────────────────────────────────────
  useEffect(() => {
    if (authPhase !== 'done') return;
    fetch('/api/finance/admin/employee-filters', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { departments: FilterOpt[]; lines: FilterOpt[]; idnumbers: string[] } | null) => {
        if (d) setFilterOptions(d);
      })
      .catch(() => {});
  }, [authPhase]);

  // ── Employee list fetch ────────────────────────────────────────────────────
  const fetchEmployees = useCallback(async () => {
    if (authPhase !== 'done') return;
    setTableLoading(true);
    try {
      const params = new URLSearchParams({
        page:     String(page),
        search:   debouncedSearch,
        sort_by:  sortField,
        sort_dir: sortDir,
      });
      if (deptFilter)          params.set('department_id', deptFilter);
      if (lineFilter)           params.set('line_id',       lineFilter);
      if (idFilter.length > 0)  params.set('idnumbers',     idFilter.join(','));
      const [res] = await Promise.all([
        fetch(`/api/finance/admin/employees?${params}`, { credentials: 'include' }),
        new Promise<void>(resolve => setTimeout(resolve, 1000)),
      ]);
      if (!res.ok) return;
      const data: EmployeeListResponse = await res.json();
      setEmployees(data.results);
      setTotalCount(data.count);
      setTotalPages(data.total_pages);
    } finally {
      setTableLoading(false);
    }
  }, [authPhase, page, debouncedSearch, sortField, sortDir, deptFilter, lineFilter, idFilter]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  // Reset to page 1 on search/filter change
  useEffect(() => { setPage(1); }, [debouncedSearch, deptFilter, lineFilter, idFilter]);

  // ── Sort handler ───────────────────────────────────────────────────────────
  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setPage(1);
  }

  // ── Accordion toggle ───────────────────────────────────────────────────────
  function toggleExpand(idnumber: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(idnumber)) next.delete(idnumber);
      else next.add(idnumber);
      return next;
    });
  }

  // ── FY months & week options ───────────────────────────────────────────────
  const fyMonths   = getFYMonths(fyStart);
  const weekOpts   = getWeekStartOptions(fyStart);

  // ── Auth phase rendering ───────────────────────────────────────────────────
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

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">

        {/* Page header */}

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2">
              Financial Management
            </h1>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Financial records overview — loans, allowances, savings, deductions, and payslips.
            </p>
          </div>
        </div>

        {/* ── Chart card ──────────────────────────────────────────────────── */}
        <AdminChartCard
          id="finance"
          categories={CHART_CATEGORIES}
          data={chartData}
          loading={chartLoading}
          transitioning={chartTransitioning}
          viewType={viewType}
          onViewTypeChange={setViewType}
          chartType={chartType}
          onChartTypeChange={setChartType}
          fyStart={fyStart}
          onFyStartChange={setFYStart}
          fyOptions={Array.from({ length: 5 }, (_, i) => currentFYStart() - i)}
          monthYear={`${selectedYear}-${selectedMonth}`}
          onMonthYearChange={v => {
            const [y, m] = v.split('-');
            setSelectedYear(Number(y));
            setSelectedMonth(Number(m));
          }}
          monthOptions={fyMonths.map(mo => ({ value: `${mo.year}-${mo.value}`, label: mo.label }))}
          weekStart={weekStart}
          onWeekStartChange={setWeekStart}
          weekOptions={weekOpts}
        />

        {/* ── Employee accordion table ────────────────────────────────── */}

        {/* Search + action row */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="min-w-[200px] max-w-sm flex-1">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search by ID, first name, or last name…"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-4 py-1.5 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors"
            >
              <Upload size={14} />
              Import
            </button>
            <button
              type="button"
              onClick={() => setShowExport(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#2845D6] text-white text-xs font-medium hover:bg-[#1f38c0] transition-colors"
            >
              <Download size={14} />
              Export
            </button>
          </div>
        </div>

        {/* Accordion table */}
        <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]">
          <div
            className="overflow-x-auto"
            style={{ transition: 'opacity 0.2s ease', opacity: tableLoading ? 0.6 : 1 }}
          >
            <table className="w-full table-fixed border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                  <th className="px-4 py-2.5 text-left" style={{ width: 130 }}>
                    <div className="flex items-center justify-between gap-1">
                      <button type="button" onClick={() => handleSort('idnumber')}
                        className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer">
                        ID Number
                        <SortIconCell field="idnumber" current={sortField} dir={sortDir} />
                      </button>
                      <MultiSelectFilterPopover
                        label="ID Number"
                        options={(filterOptions?.idnumbers ?? []).map(id => ({ value: id, label: id }))}
                        selected={idFilter}
                        onChange={setIdFilter}
                        withSearch
                        disabled={!filterOptions}
                      />
                    </div>
                  </th>
                  <th className="px-4 py-2.5 text-left" style={{ width: 220 }}>
                    <button type="button" onClick={() => handleSort('lastname')}
                      className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer">
                      Employee Name
                      <SortIconCell field="lastname" current={sortField} dir={sortDir} />
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left hidden sm:table-cell" style={{ width: 160 }}>
                    <div className="flex items-center justify-between gap-1">
                      <button type="button" onClick={() => handleSort('department')}
                        className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer">
                        Department
                        <SortIconCell field="department" current={sortField} dir={sortDir} />
                      </button>
                      <SingleSelectFilterPopover
                        label="Department"
                        options={(filterOptions?.departments ?? []).map(d => ({ value: String(d.id), label: d.name }))}
                        value={deptFilter}
                        onChange={setDeptFilter}
                        disabled={!filterOptions}
                      />
                    </div>
                  </th>
                  <th className="px-4 py-2.5 text-left hidden sm:table-cell" style={{ width: 130 }}>
                    <div className="flex items-center justify-between gap-1">
                      <button type="button" onClick={() => handleSort('line')}
                        className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer">
                        Line
                        <SortIconCell field="line" current={sortField} dir={sortDir} />
                      </button>
                      <SingleSelectFilterPopover
                        label="Line"
                        options={(filterOptions?.lines ?? []).map(l => ({ value: String(l.id), label: l.name }))}
                        value={lineFilter}
                        onChange={setLineFilter}
                        disabled={!filterOptions}
                      />
                    </div>
                  </th>
                  <th className="px-4 py-2.5 w-10" style={{ width: 52 }} />
                </tr>
              </thead>
              <tbody>
                {tableLoading ? (
                  <SkeletonTableRows count={10} />
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12">
                      <EmptyState
                        title="No employees found"
                        description={search ? 'Try a different search term.' : 'No eligible employees with finance records.'}
                        icons={[Wallet, Receipt, DollarSign]}
                      />
                    </td>
                  </tr>
                ) : (
                  employees.map(emp => (
                    <FinanceAccordionRow
                      key={emp.idnumber}
                      emp={emp}
                      isExpanded={expandedIds.has(emp.idnumber)}
                      onToggle={() => toggleExpand(emp.idnumber)}
                      refreshKey={refreshKey}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination — only shown when data spans more than one page */}
          {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 flex-nowrap border-t border-[var(--color-border)] px-5 py-3">
            <div className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">
              Showing{' '}
              <span className="text-xs text-[var(--color-text-muted)]">
                {totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)}
              </span>
              {' '}of{' '}
              <span className="text-xs text-[var(--color-text-muted)]">{totalCount}</span>
            </div>

            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  />
                </PaginationItem>
                {buildPaginationRange(page, totalPages).map((p, i) => (
                  <PaginationItem key={`${p}-${i}`}>
                    {p === '...' ? (
                      <PaginationEllipsis />
                    ) : (
                      <PaginationLink isActive={p === page} onClick={() => setPage(p as number)}>
                        {p}
                      </PaginationLink>
                    )}
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
          )}
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showImport && (
          <ImportModal
            onClose={() => setShowImport(false)}
            onSuccess={() => {
              setExpandedIds(new Set());
              setRefreshKey(k => k + 1);
              fetchEmployees();
              fetchChart();
            }}
            financeTypes={financeTypes}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showExport && (
          <ExportModal onClose={() => setShowExport(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

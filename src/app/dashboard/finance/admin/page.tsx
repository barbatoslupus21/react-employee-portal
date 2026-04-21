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
  Settings,
  Pencil,
  Trash2,
  Check,
  Eye,
  ArrowDownLeft,
} from 'lucide-react';
import { Tabs } from '@/components/ui/vercel-tabs';
import { FileUploadDropzone } from '@/components/ui/file-upload-dropzone';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import { useDebounce } from '@/hooks/use-debounce';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { TypeCheckbox } from '@/components/ui/type-checkbox';
import { toast } from '@/components/ui/toast';
import { getCsrfToken } from '@/lib/csrf';
import { cn } from '@/lib/utils';
import { styledXlsx } from '@/lib/xlsx-export';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
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

interface AllowanceType { id: number; name: string; color: string; replace_on_upload: boolean; percentage: boolean }
interface LoanType      { id: number; name: string; color: string; stackable: boolean }
interface SavingsType   { id: number; name: string; color: string }
interface PayslipType   { id: number; name: string; color: string }

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
  id:                 number;
  loan_type_name:     string;
  principal_amount:   string;
  current_balance:    string;
  monthly_deduction:  string | null;
  description:        string;
  reference_number:   string;
  created_at:         string;
}

interface AllowanceRecord {
  id:                  number;
  allowance_type_name: string;
  amount:              string;
  description:         string;
  deposited_date:      string | null;
  covered_period:      string;
}

interface SavingsRecord {
  id:                number;
  savings_type_name: string;
  amount:            string;
  withdraw:          boolean;
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

interface DeductionDetail {
  loan_id:          number;
  loan_type_name:   string;
  principal_amount: string;
  current_balance:  string;
  deductions: {
    id:          number;
    amount:      string;
    description: string;
    cutoff_date: string | null;
    created_at:  string;
  }[];
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

interface LoanSettingsConfig {
  deduction_frequency: string;
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
    { col: 'A  —  ID Number',       required: true },
    { col: 'B  —  Employee Name',   required: true, note: 'For reference only — not validated by the system.' },
    { col: 'C  —  Allowance Type', required: true, note: 'Must match an existing Allowance Type name exactly. Use the dropdown in the template.' },
    { col: 'D  —  Amount',         required: true, note: 'Non-negative number. For Percentage types enter a percentage value (e.g. 5.00).' },
    { col: 'E  —  Deposited Date', required: false, note: 'Format: MM/DD/YYYY (e.g. 04/30/2026). Leave blank if not applicable.' },
    { col: 'F  —  Covered Period', required: false, note: 'Free text describing the period (e.g. April 2026). Leave blank if not applicable.' },
  ],
  loan: [
    { col: 'A  —  ID Number',          required: true },
    { col: 'B  —  Employee Name',      required: true, note: 'For reference only — not validated by the system.' },
    { col: 'C  —  Loan Type',          required: true,  note: 'Must match an existing Loan Type name exactly.' },
    { col: 'D  —  Principal Balance',  required: true,  note: 'Positive number.' },
    { col: 'E  —  Monthly Deduction',  required: true, note: 'Monthly deduction amount (optional).' },
  ],
  deduction: [
    { col: 'A  —  ID Number',  required: true },
    { col: 'B  —  Employee Name',      required: true, note: 'For reference only — not validated by the system.' },
    { col: 'C  —  Loan Type',  required: true, note: 'Must match an existing Loan Type name exactly.' },
    { col: 'D  —  Deduction',  required: true, note: "Must not exceed the current loan balance. Comma format accepted (e.g. 1,500.00)." },
  ],
  savings: [
    { col: 'A  —  ID Number',      required: true },
    { col: 'B  —  Employee Name',  required: true, note: 'For reference only — not validated by the system.' },
    { col: 'C  —  Savings Type',   required: true, note: 'Must match an existing Savings Type name exactly. Use the dropdown in the template.' },
    { col: 'D  —  Savings',        required: true, note: 'Non-negative number.' },
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

/** Format a Date as YYYY-MM-DD using local timezone (avoid UTC off-by-one). */
function formatLocalDate(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ── ImportModal ────────────────────────────────────────────────────────────────

const SECTION_ORDER: ImportSectionKey[] = [
  'regular-payslip', 'ojt-payslip', 'principal-balance', 'deductions', 'allowances', 'savings',
];

const SLIDE_VARIANTS = {
  enter:  (dir: number) => ({ opacity: 0, x: dir * 36 }),
  center: { opacity: 1, x: 0 },
  exit:   (dir: number) => ({ opacity: 0, x: dir * -36 }),
};

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
  const [slideDir, setSlideDir] = useState<1 | -1>(1);

  // ── Shared import state ───────────────────────────────────────────────────
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<'idle' | 'validating' | 'uploading' | 'done' | 'error'>('idle');
  const [checkProgress, setCheckProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [validationErrors, setValidationErrors] = useState<{ file: string; issue: string }[]>([]);
  const [result, setResult] = useState<{ imported: number; failed: number; error_report_b64: string | null; allowance_summary?: { updated: number; added: number; replaced: number } } | null>(null);
  // Tracks file names that failed validation or upload — shown with red styling in the file list
  const [errorFileSet, setErrorFileSet] = useState<Set<string>>(new Set());

  // ── Download helpers ─────────────────────────────────────────────────────────────────────────
  // Creates a fresh off-screen anchor every time, appends it to document.body so
  // Chrome sees it as a connected element, fires .click(), then removes after 500 ms.
  // 500 ms is conservative — gives Chrome enough time to register the download
  // before the node is removed, regardless of async context.
  function scheduleDownload(blob: Blob, filename: string) {
    if (typeof window === 'undefined') return;
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
  }

  function downloadErrorReport(errors: { file: string; issue: string }[]) {
    if (errors.length === 0) return;
    try {
      const blob = styledXlsx(
        ['File', 'Issue'],
        errors.map(e => [e.file, e.issue]),
        [1],
        undefined,
        'CC0000',
      );
      scheduleDownload(blob, 'validation_errors.xlsx');
      toast.success(`Error report downloaded — ${errors.length} file${errors.length !== 1 ? 's' : ''}.`);
    } catch {
      try {
        const lines = ['File,Issue', ...errors.map(e =>
          `"${e.file.replace(/"/g, '""')}","${e.issue.replace(/"/g, '""')}"`,
        )];
        const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        scheduleDownload(blob, 'validation_errors.csv');
        toast.success(`Error report downloaded (CSV) — ${errors.length} file${errors.length !== 1 ? 's' : ''}.`);
      } catch {
        toast.error('Could not generate error report.');
      }
    }
  }

  // ── Payslip metadata state (no Employee ID / Description fields per request) ──
  const [psType,        setPsType]        = useState('');
  const [psPeriodStart, setPsPeriodStart] = useState<Date | undefined>(undefined);
  const [psPeriodEnd,   setPsPeriodEnd]   = useState<Date | undefined>(undefined);
  const [psSuccess,     setPsSuccess]     = useState(false);
  const [psErrors,      setPsErrors]      = useState<Record<string, string>>({});

  // ── Deduction-specific state ────────────────────────────────────
  const [dcCutoffDate, setDcCutoffDate] = useState<Date | undefined>(undefined);
  const [dcErrors,     setDcErrors]     = useState<Record<string, string>>({});


  // ── Derived section values ────────────────────────────────────────────────
  const section    = IMPORT_SECTIONS.find(s => s.key === activeSection)!;
  const recordType = section.recordType;
  const isPayslip  = section.isPayslip;

  // Reset shared upload state when switching sections (handled by the nav click handler)
  // Also reset deduction-specific fields when switching sections.
  // (payslip form uses resetPayslipForm; deduction date is reset here)

  function resetPayslipForm() {
    setPsType(''); setPsPeriodStart(undefined); setPsPeriodEnd(undefined);
    setFiles([]); setPsSuccess(false); setPsErrors({});
    setPhase('idle'); setCheckProgress(0); setUploadProgress(0); setValidationErrors([]); setResult(null);
    setErrorFileSet(new Set());
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

  async function validateFiles(): Promise<{ valid: File[]; errors: { file: string; issue: string }[] }> {
    if (files.length === 0) {
      toast.warning('No files selected for upload.');
      return { valid: [], errors: [] };
    }

    setPhase('validating');
    setValidationErrors([]);

    const errors: { file: string; issue: string }[] = [];
    const valid: File[] = [];

    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      const nextProgress = Math.round(((i + 1) / files.length) * 100);
      setCheckProgress(nextProgress);
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 120));

      let hasError = false;

      if (recordType === 'payslip') {
        if (!f.name.toLowerCase().endsWith('.pdf')) {
          errors.push({ file: f.name, issue: 'Invalid file type (expected PDF).' });
          hasError = true;
        } else {
          const match = f.name.match(filenamePattern);
          if (!match) {
            errors.push({ file: f.name, issue: 'Filename must be IDNumber_EmployeeName.pdf' });
            hasError = true;
          } else if (f.size > 5 * 1024 * 1024) {
            errors.push({ file: f.name, issue: 'File must not exceed 5 MB.' });
            hasError = true;
          } else {
            const idNumber = match[1];
            const validEmployee = await checkEmployeeExists(idNumber);
            if (!validEmployee) {
              errors.push({ file: f.name, issue: `Employee ID ${idNumber} not found.` });
              hasError = true;
            }
          }
        }
      } else {
        // xlsx / csv validation
        const lower = f.name.toLowerCase();
        const validExts = ['.xlsx', '.xls', '.csv'];
        if (!validExts.some((ext) => lower.endsWith(ext))) {
          errors.push({ file: f.name, issue: `Invalid file type. Expected: ${validExts.join(', ')}` });
          hasError = true;
        } else if (f.size > 10 * 1024 * 1024) {
          errors.push({ file: f.name, issue: 'File must not exceed 10 MB.' });
          hasError = true;
        }
      }

      if (!hasError) {
        valid.push(f);
      }
    }

    setCheckProgress(100);
    return { valid, errors };
  }

  async function uploadFiles(filesToUpload: File[]): Promise<{ uploadFailedNames: Set<string>; uploadErrors: { file: string; issue: string }[] }> {
    setPhase('uploading');
    setUploadProgress(0);

    if (recordType === 'payslip') {
      let uploaded = 0;
      let failed = 0;
      const uploadFailedNames = new Set<string>();

      const payslipUploadErrors: { file: string; issue: string }[] = [];

      for (let i = 0; i < filesToUpload.length; i += 1) {
        const fileItem = filesToUpload[i];
        const form = new FormData();
        form.append('file', fileItem);
        form.append('idnumber', fileItem.name.replace(/\.pdf$/i, '').split('_')[0]);
        form.append('payslip_type', psType);
        form.append('period_start', psPeriodStart ? formatLocalDate(psPeriodStart) : '');
        form.append('period_end',   psPeriodEnd   ? formatLocalDate(psPeriodEnd)   : '');

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
            uploadFailedNames.add(fileItem.name);
            let reason = `HTTP ${res.status}`;
            try {
              const errData = await res.json();
              reason = errData.detail
                ?? (Array.isArray(Object.values(errData)[0])
                    ? (Object.values(errData)[0] as string[]).join('; ')
                    : Object.values(errData).join('; '))
                ?? reason;
            } catch { /* non-JSON body — keep HTTP status */ }
            payslipUploadErrors.push({ file: fileItem.name, issue: String(reason) });
          }
        } catch {
          failed += 1;
          uploadFailedNames.add(fileItem.name);
          payslipUploadErrors.push({ file: fileItem.name, issue: 'Network error.' });
        }

        setUploadProgress(Math.round(((i + 1) / filesToUpload.length) * 100));
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
      return { uploadFailedNames, uploadErrors: payslipUploadErrors };
    }

    // Generic finance import endpoint for xlsx/loan/allowance/savings/deduction
    const fd = new FormData();
    filesToUpload.forEach((f) => fd.append('file', f));
    fd.append('record_type', recordType);
    if (recordType === 'deduction' && dcCutoffDate) {
      fd.append('cutoff_date', formatLocalDate(dcCutoffDate));
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/finance/admin/import?record_type=${recordType}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-CSRFToken', getCsrfToken());

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    return new Promise<{ uploadFailedNames: Set<string>; uploadErrors: { file: string; issue: string }[] }>((resolve) => {
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText);
          setResult(data);
          setPhase('done');
          if (data.imported > 0) {
            onSuccess();
            if (data.allowance_summary) {
              const s = data.allowance_summary as { updated: number; added: number; replaced: number };
              const parts: string[] = [];
              if (s.replaced > 0) parts.push(`${s.replaced} record${s.replaced !== 1 ? 's' : ''} replaced`);
              if (s.added    > 0) parts.push(`${s.added} record${s.added !== 1 ? 's' : ''} added`);
              if (s.updated  > 0) parts.push(`${s.updated} balance${s.updated !== 1 ? 's' : ''} updated`);
              toast.success(parts.length > 0 ? parts.join(', ') + '.' : `${data.imported} record${data.imported !== 1 ? 's' : ''} imported successfully.`);
            } else {
              toast.success(`${data.imported} record${data.imported !== 1 ? 's' : ''} imported successfully.`);
            }
          }
          if (data.failed > 0 && data.error_report_b64) {
            try {
              const raw = atob(data.error_report_b64);
              const buf = new Uint8Array(raw.length);
              for (let j = 0; j < raw.length; j++) buf[j] = raw.charCodeAt(j);
              const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
              scheduleDownload(blob, 'import_errors.xlsx');
              toast.warning(`${data.failed} row${data.failed !== 1 ? 's' : ''} failed validation — error report downloaded.`);
            } catch (err) {
              console.error('Failed to trigger import error report download:', err);
              toast.error('Could not download error report.');
            }
            // Some rows failed — keep all uploaded files so user can review
            resolve({ uploadFailedNames: new Set(filesToUpload.map(f => f.name)), uploadErrors: [] });
          } else if (data.imported === 0) {
            toast.warning('No records were imported.');
            resolve({ uploadFailedNames: new Set(), uploadErrors: [] });
          } else {
            // All rows imported — no files to keep
            resolve({ uploadFailedNames: new Set(), uploadErrors: [] });
          }
        } else {
          toast.error('Import failed.');
          setPhase('error');
          resolve({ uploadFailedNames: new Set(filesToUpload.map(f => f.name)), uploadErrors: [] });
        }
      };

      xhr.onerror = () => {
        toast.error('Network error during upload.');
        setPhase('error');
        resolve({ uploadFailedNames: new Set(filesToUpload.map(f => f.name)), uploadErrors: [] });
      };

      xhr.send(fd);
    });
  }

  async function handleSubmit() {
    if (phase === 'validating' || phase === 'uploading') return;

    // Deduction: require cut-off date before proceeding
    if (activeSection === 'deductions') {
      if (!dcCutoffDate) {
        setDcErrors({ cutoff_date: 'Cut-off Date is required.' });
        toast.warning('Please select a Cut-off Date before uploading.');
        return;
      }
      setDcErrors({});
    }

    // Capture errors from the PREVIOUS submit before validateFiles() clears the state.
    // This is the reliable way to know which files already failed with a backend error
    // (e.g. 409 duplicate) so we can skip re-sending them to the server.
    const knownUploadErrors = new Map(
      validationErrors
        .filter(e => !e.issue.startsWith('Invalid file') && !e.issue.startsWith('Filename') && !e.issue.startsWith('File must') && !e.issue.startsWith('Employee ID'))
        .map(e => [e.file, e.issue]),
    );

    setPhase('validating');
    await new Promise<void>(r => setTimeout(r, 1000));
    const { valid, errors } = await validateFiles();

    const validationErrorNames = new Set(errors.map(e => e.file));

    if (valid.length === 0) {
      setPhase('error');
      if (errors.length > 0) {
        setValidationErrors(errors);
        setErrorFileSet(validationErrorNames);
        downloadErrorReport(errors);
        toast.error(`All files failed validation.`);
      }
      return;
    }

    if (errors.length > 0) {
      toast.warning(`${errors.length} file${errors.length !== 1 ? 's' : ''} failed validation. Uploading ${valid.length} valid file${valid.length !== 1 ? 's' : ''}...`);
    }

    // Files already rejected by the backend in a previous attempt are skipped
    // entirely — no network call, error re-used directly from knownUploadErrors.
    // NOTE: payslips are NEVER skipped this way — their 409 duplicate check is
    // period+type-specific, so stale errors from a prior period must not block
    // a fresh upload with different parameters.
    const toUpload: File[] = [];
    const previouslyFailed: { file: string; issue: string }[] = [];
    for (const f of valid) {
      const prevError = isPayslip ? undefined : knownUploadErrors.get(f.name);
      if (prevError !== undefined) {
        previouslyFailed.push({ file: f.name, issue: prevError });
      } else {
        toUpload.push(f);
      }
    }

    let uploadFailedNames = new Set<string>();
    let uploadErrors: { file: string; issue: string }[] = [];

    if (toUpload.length > 0) {
      ({ uploadFailedNames, uploadErrors } = await uploadFiles(toUpload));
    } else {
      setPhase('done');
    }

    // Merge all error sources into one list and auto-download the report
    const allErrors = [...errors, ...previouslyFailed, ...uploadErrors];
    const allErrorNames = new Set([
      ...validationErrorNames,
      ...previouslyFailed.map(e => e.file),
      ...uploadFailedNames,
    ]);
    if (allErrors.length > 0) {
      setValidationErrors(allErrors);
      downloadErrorReport(allErrors);
    }
    setErrorFileSet(allErrorNames);
    setFiles(prev => prev.filter(f => allErrorNames.has(f.name)));
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

  async function downloadTemplate() {
    if (isPayslip) return;
    if (activeSection === 'principal-balance') {
      try {
        const res = await fetch('/api/finance/admin/template/principal-balance', {
          credentials: 'include',
        });
        if (!res.ok) { toast.error('Failed to download template.'); return; }
        const blob = await res.blob();
        scheduleDownload(blob, 'principal-balance_template.xlsx');
      } catch {
        toast.error('Failed to download template.');
      }
      return;
    }
    if (activeSection === 'deductions') {
      try {
        const res = await fetch('/api/finance/admin/template/deduction', { credentials: 'include' });
        if (!res.ok) { toast.error('Failed to download template.'); return; }
        const blob = await res.blob();
        scheduleDownload(blob, 'deductions_template.xlsx');
      } catch {
        toast.error('Failed to download template.');
      }
      return;
    }
    if (activeSection === 'allowances') {
      try {
        const res = await fetch('/api/finance/admin/template/allowance', { credentials: 'include' });
        if (!res.ok) { toast.error('Failed to download template.'); return; }
        const blob = await res.blob();
        scheduleDownload(blob, 'allowances_template.xlsx');
      } catch {
        toast.error('Failed to download template.');
      }
      return;
    }
    if (activeSection === 'savings') {
      try {
        const res = await fetch('/api/finance/admin/template/savings', { credentials: 'include' });
        if (!res.ok) { toast.error('Failed to download template.'); return; }
        const blob = await res.blob();
        scheduleDownload(blob, 'savings_template.xlsx');
      } catch {
        toast.error('Failed to download template.');
      }
      return;
    }
    const cols = IMPORT_COLUMNS[recordType];
    const headers = cols.map(c => {
      const parts = c.col.split('—');
      return (parts.pop()?.trim() ?? c.col).replace(/\s+/g, '');
    });
    let exampleRows: string[][] = [[]];
    if (recordType === 'savings') exampleRows = [['10001', 'Savings Type Name', '1,500.00', '']];
    const blob = styledXlsx(headers, exampleRows);
    scheduleDownload(blob, `${section.key}_template.xlsx`);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
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
        <div className="flex max-h-[calc(100vh-16rem)]">

          {/* ── Left sidebar nav ── */}
          <nav className="w-44 shrink-0 border-r border-[var(--color-border)] py-2 flex flex-col gap-0.5 overflow-y-auto min-h-[360px] [scrollbar-width:thin]">
            {IMPORT_SECTIONS.map(sec => {
              const isActive = sec.key === activeSection;
              const Icon = sec.icon;
              return (
                <button
                  key={sec.key}
                  type="button"
                  onClick={() => {
                    if (sec.key === activeSection) return;
                    const nextIdx = SECTION_ORDER.indexOf(sec.key);
                    const currIdx = SECTION_ORDER.indexOf(activeSection);
                    setSlideDir(nextIdx > currIdx ? 1 : -1);
                    setActiveSection(sec.key);
                    setFiles([]); setResult(null); setPhase('idle'); setCheckProgress(0); setUploadProgress(0);
                    setErrorFileSet(new Set());
                    setDcCutoffDate(undefined); setDcErrors({});
                    resetPayslipForm();
                  }}
                  className={cn(
                    'relative flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-xs transition-colors',
                    isActive
                      ? 'text-[#2845D6] font-semibold'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] font-medium',
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="import-nav-bg"
                      className="absolute inset-0 bg-[#2845D6]/8 rounded-sm"
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    />
                  )}
                  <Icon size={15} className={cn('relative z-10', isActive ? 'text-[#2845D6]' : 'text-[var(--color-text-muted)]')} />
                  <span className="relative z-10 truncate">{sec.label}</span>
                </button>
              );
            })}
          </nav>

          {/* ── Right content panel ── */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">

            {/* Instruction box – light green */}
            <div className="bg-green-50 dark:bg-green-950/20 border-b border-green-200/70 dark:border-green-900/40 px-5 py-4 shrink-0">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeSection}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                  className="flex items-start justify-between gap-4"
                >
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
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Upload / form content area */}
            <div className="overflow-y-auto overflow-x-hidden min-h-[340px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeSection}
                custom={slideDir}
                variants={SLIDE_VARIANTS}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="px-5 py-5 space-y-4"
              >

              {/* ── Payslip PDF form ── */}
              {isPayslip && (
                <div className="space-y-4">

                  {/* Row 1: Payslip Category */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Payslip Category</label>
                    <Select value={psType} onValueChange={(v) => { setPsType(v); setValidationErrors([]); setErrorFileSet(new Set()); }}>
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
                          setValidationErrors([]);
                          setErrorFileSet(new Set());
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
                          if (!psPeriodStart || d >= psPeriodStart) {
                            setPsPeriodEnd(d);
                            setValidationErrors([]);
                            setErrorFileSet(new Set());
                          }
                        }}
                        minDate={psPeriodStart}
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
                    errorFileNames={errorFileSet}
                  />

                  <AnimatePresence>
                    {/* Progress bars moved to panel level — removed from here */}
                  </AnimatePresence>

                </div>
              )}

              {/* ── xlsx import UI ── */}
              {!isPayslip && (
                <>
                  <div className="space-y-4">
                    {/* Deduction: Cut-off Date picker (required) */}
                    {activeSection === 'deductions' && (
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                          Cut-off Date <span className="text-red-500">*</span>
                        </label>
                        <DateTimePicker
                          value={dcCutoffDate}
                          onChange={(d) => { setDcCutoffDate(d); if (d) setDcErrors((e) => ({ ...e, cutoff_date: '' })); }}
                          placeholder="Select cut-off date"
                          disabled={phase === 'uploading' || phase === 'validating'}
                        />
                        {dcErrors.cutoff_date && <p className="text-xs text-red-500">{dcErrors.cutoff_date}</p>}
                      </div>
                    )}
                    <FileUploadDropzone
                      files={files}
                      onFilesChange={setFiles}
                      accept=".xlsx,.xls,.csv"
                      multiple
                      label="Click to select or drag & drop"
                      helperText={section.acceptLabel}
                      disabled={phase === 'uploading'}
                      errorFileNames={errorFileSet}
                    />

                    <AnimatePresence>
                      {/* Progress bars moved to panel level — removed from here */}
                    </AnimatePresence>

                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3 space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Required Columns (xlsx, row 1 = header)</p>
                      <ul className="space-y-1.5">
                        {IMPORT_COLUMNS[recordType].map((c) => (
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
                      {allowanceNote && <p className="text-xs text-amber-600 dark:text-amber-400">{allowanceNote}</p>}
                      {loanNote && <p className="text-xs text-amber-600 dark:text-amber-400">{loanNote}</p>}
                    </div>

                  </div>
                </>
              )}

              </motion.div>
              </AnimatePresence>
            </div>

          </div>
        </div>

        {/* Progress bars — outside max-h-constrained body so the modal expands smoothly via layout animation */}
        <AnimatePresence>
          {phase === 'validating' && (
            <motion.div
              key="progress-validating"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="overflow-hidden border-t border-[var(--color-border)]"
            >
              <div className="px-6 py-3 space-y-1.5">
                <p className="text-[11px] font-medium text-[var(--color-text-muted)]">Validation in progress {checkProgress}%</p>
                <div className="h-1.5 w-full rounded-full bg-[var(--color-border)] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-[#2845D6]"
                    animate={{ width: `${checkProgress}%` }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                  />
                </div>
              </div>
            </motion.div>
          )}
          {phase === 'uploading' && (
            <motion.div
              key="progress-uploading"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="overflow-hidden border-t border-[var(--color-border)]"
            >
              <div className="px-6 py-3 space-y-1.5">
                <p className="text-[11px] font-medium text-[var(--color-text-muted)]">{isPayslip ? 'Upload progress' : 'Uploading files'} {uploadProgress}%</p>
                <div className="h-1.5 w-full rounded-full bg-[var(--color-border)] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-[#10B981]"
                    animate={{ width: `${uploadProgress}%` }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-between gap-3">
          {/* Error report download button — shown when validation found bad files */}
          <div className="flex-1 min-w-0">
            <AnimatePresence>
              {validationErrors.length > 0 && (
                <motion.div
                  key="dl-err"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Plain <button> — NOT motion.button. Framer Motion wraps handlers
                       asynchronously which breaks Chrome's user-activation window.
                       A native button onClick fires synchronously and preserves it. */}
                  <button
                    type="button"
                    onClick={() => downloadErrorReport(validationErrors)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                  >
                    Download Error Report ({validationErrors.length} file{validationErrors.length !== 1 ? 's' : ''})
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={files.length === 0 || phase === 'uploading' || phase === 'validating' || (isPayslip && (!psType || !psPeriodStart || !psPeriodEnd))}
            className="h-9 px-5 rounded-lg text-sm font-medium bg-[#2845D6] text-white hover:bg-[#1e35b5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {phase === 'uploading' || phase === 'validating' ? (
              <TextShimmer
                className="text-sm [--base-color:rgba(255,255,255,0.55)] [--base-gradient-color:#ffffff] dark:[--base-color:rgba(255,255,255,0.55)] dark:[--base-gradient-color:#ffffff]"
                duration={1.2}
              >{phase === 'validating' ? 'Validating Data…' : 'Uploading Data…'}</TextShimmer>
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


// ── TypesManageModal ───────────────────────────────────────────────────────────

const TYPE_PALETTE = [
  '#2845D6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
  '#06B6D4', '#84CC16', '#0EA5E9', '#A855F7',
];

type TypeCategory = 'allowance' | 'loan' | 'savings' | 'payslip';
type ModalTab     = TypeCategory | 'loan-settings';

interface AnyType { id: number; name: string; color: string; replace_on_upload?: boolean; stackable?: boolean }

const TYPE_TABS: { key: ModalTab; label: string }[] = [
  { key: 'allowance',     label: 'Allowance' },
  { key: 'loan',          label: 'Loan' },
  { key: 'savings',       label: 'Savings' },
  { key: 'payslip',       label: 'Payslip' },
  { key: 'loan-settings', label: 'Loan Settings' },
];

const DEDUCTION_FREQUENCY_OPTIONS: { value: string; label: string }[] = [
  { value: 'cutoff',    label: 'Cut-Off (Cut-off ×2)' },
  { value: 'monthly',   label: 'Monthly' },
  { value: 'weekly',    label: 'Weekly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly',    label: 'Yearly' },
];

function TypesManageModal({
  financeTypes,
  onClose,
  onRefresh,
  onLoanSettingsSaved,
}: {
  financeTypes:         FinanceTypesResponse;
  onClose:              () => void;
  onRefresh:            () => void;
  onLoanSettingsSaved?: (config: LoanSettingsConfig) => void;
}) {
  const [activeTab,        setActiveTab       ] = useState<ModalTab>('allowance');
  const [saving,           setSaving          ] = useState(false);
  const [deleteConfirm,    setDeleteConfirm   ] = useState<{ id: number; name: string } | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  // ── Loan settings state ──────────────────────────────────────────────────
  const [lsFreq,    setLsFreq   ] = useState('cutoff');
  const [lsSaving,  setLsSaving ] = useState(false);
  const [lsLoaded,  setLsLoaded ] = useState(false);

  useEffect(() => {
    fetch('/api/finance/admin/loan-settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: LoanSettingsConfig | null) => {
        if (d) setLsFreq(d.deduction_frequency);
        setLsLoaded(true);
      })
      .catch(() => setLsLoaded(true));
  }, []);

  async function handleSaveLoanSettings() {
    setLsSaving(true);
    const [res] = await Promise.all([
      fetch('/api/finance/admin/loan-settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ deduction_frequency: lsFreq }),
      }),
      new Promise<void>(resolve => setTimeout(resolve, 1000)),
    ]);
    setLsSaving(false);
    if ((res as Response).ok) {
      toast.success('Loan settings saved.');
      onLoanSettingsSaved?.({ deduction_frequency: lsFreq });
    } else {
      toast.error('Failed to save loan settings.');
    }
  }

  // ── New type form state ──────────────────────────────────────────────────
  const [newName,           setNewName          ] = useState('');
  const [newReplaceOnUpload,setNewReplaceOnUpload] = useState(false);
  const [newPercentage,     setNewPercentage    ] = useState(false);
  const [newStackable,      setNewStackable     ] = useState(false);
  const [nameErr,           setNameErr          ] = useState('');

  // ── Inline-edit state ────────────────────────────────────────────────────
  const [editingId,           setEditingId          ] = useState<number | null>(null);
  const [editName,            setEditName           ] = useState('');
  const [editColor,           setEditColor          ] = useState('');
  const [editNameErr,         setEditNameErr        ] = useState('');
  const [editReplaceOnUpload, setEditReplaceOnUpload] = useState(false);
  const [editPercentage,      setEditPercentage     ] = useState(false);
  const [editStackable,       setEditStackable      ] = useState(false);

  const BLOCKED = /[<>{}\[\]\\|^~`"]/;

  function currentTypes(): AnyType[] {
    if (activeTab === 'allowance') return financeTypes.allowance_types as AnyType[];
    if (activeTab === 'loan')      return financeTypes.loan_types      as AnyType[];
    if (activeTab === 'savings')   return financeTypes.savings_types   as AnyType[];
    if (activeTab === 'payslip')   return financeTypes.payslip_types   as AnyType[];
    return [];
  }

  function nextColor(types: AnyType[]): string {
    const used = new Set(types.map(t => t.color));
    for (const c of TYPE_PALETTE) if (!used.has(c)) return c;
    return TYPE_PALETTE[types.length % TYPE_PALETTE.length];
  }

  function validateName(v: string, setErr: (e: string) => void): boolean {
    if (!v.trim()) { setErr('Name is required.'); return false; }
    if (BLOCKED.test(v)) { setErr('Special characters are not allowed.'); return false; }
    if (v.length > 100) { setErr('Name must not exceed 100 characters.'); return false; }
    setErr('');
    return true;
  }

  // ── Reset form when switching tabs ───────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'loan-settings') return;
    setNewName(''); setNewReplaceOnUpload(false); setNewStackable(false); setNameErr('');
    setEditingId(null); setEditName(''); setEditColor(''); setEditNameErr('');
    setEditReplaceOnUpload(false); setEditPercentage(false); setEditStackable(false);
  }, [activeTab]);

  async function handleCreate() {
    if (!validateName(newName, setNameErr)) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        type_category: activeTab,
        name: newName.trim(),
      };
      if (activeTab === 'allowance') {
        body.replace_on_upload = newReplaceOnUpload;
        body.percentage = newPercentage;
      }
      if (activeTab === 'loan')      body.stackable = newStackable;

      const res = await fetch('/api/finance/admin/types/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { detail?: string }).detail ?? 'Failed to create type.');
      } else {
        toast.success(`${newName.trim()} created successfully.`);
        setNewName(''); setNewReplaceOnUpload(false); setNewPercentage(false); setNewStackable(false); setNameErr('');
        onRefresh();
      }
    } finally { setSaving(false); }
  }

  async function handleSaveEdit(id: number) {
    if (!validateName(editName, setEditNameErr)) return;
    setSaving(true);
    try {
      const saveBody: Record<string, unknown> = { type_category: activeTab, name: editName.trim(), color: editColor };
      if (activeTab === 'allowance') { saveBody.replace_on_upload = editReplaceOnUpload; saveBody.percentage = editPercentage; }
      if (activeTab === 'loan') saveBody.stackable = editStackable;
      const res = await fetch(`/api/finance/admin/types/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify(saveBody),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { detail?: string }).detail ?? 'Failed to update type.');
      } else {
        toast.success('Type updated.');
        setEditingId(null);
        onRefresh();
      }
    } finally { setSaving(false); }
  }

  async function handleDeleteConfirmed() {
    if (!deleteConfirm) return;
    const { id, name } = deleteConfirm;
    setDeleteConfirming(true);
    try {
      const res = await fetch(`/api/finance/admin/types/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ type_category: activeTab }),
      });
      if (!res.ok && res.status !== 204) {
        toast.error('Failed to delete type.');
      } else {
        toast.success(`${name} deleted.`);
        setDeleteConfirm(null);
        onRefresh();
      }
    } finally { setDeleteConfirming(false); }
  }

  const types = currentTypes();

  return (
    <>
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
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] shrink-0">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Manage Finance Types</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Create, rename, recolor, or delete type categories.</p>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Tab strip */}
        <div className="px-6 pt-3 border-b border-[var(--color-border)] shrink-0">
          <div className="flex gap-1">
            {TYPE_TABS.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  'px-3 py-1.5 rounded-t-md text-xs font-medium transition-colors border-b-2',
                  activeTab === t.key
                    ? 'border-[#2845D6] text-[#2845D6]'
                    : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 [scrollbar-width:thin]">

          <AnimatePresence mode="wait">
            {activeTab === 'loan-settings' ? (

              /* ── Loan Settings panel ──────────────────────────────────── */
              <motion.div
                key="loan-settings"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-4 space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-[var(--color-text-primary)]">Deduction Frequency</p>
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                      Defines how often loan deductions are applied system-wide. This drives deduction schedules and completion estimates.
                    </p>
                  </div>
                  {!lsLoaded ? (
                    <div className="h-9 rounded-lg bg-[var(--color-skeleton)] animate-pulse w-full" />
                  ) : (
                    <Select value={lsFreq} onValueChange={setLsFreq}>
                      <SelectTrigger className="w-full h-9 text-xs rounded-lg border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-primary)]">
                        <SelectValue placeholder="Select frequency…" />
                      </SelectTrigger>
                      <SelectContent>
                        {DEDUCTION_FREQUENCY_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveLoanSettings}
                    disabled={lsSaving || !lsLoaded}
                    className="h-9 px-5 rounded-lg bg-[#2845D6] text-white text-xs font-medium hover:bg-[#1e35b5] transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {lsSaving
                      ? <TextShimmer className="text-xs" duration={1.2}>Saving…</TextShimmer>
                      : 'Save Changes'
                    }
                  </button>
                </div>
              </motion.div>

            ) : (

              /* ── Type management list + create form ───────────────────── */
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                {/* Existing types list */}
                <ul className="space-y-1.5">
                  {types.length === 0 && (
                    <li className="text-center py-6 text-xs text-[var(--color-text-muted)]">
                      No types yet. Create one below.
                    </li>
                  )}
                  {types.map(t => (
                    <li
                      key={t.id}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]"
                    >
                      {/* ── Header row ── */}
                      <div className={cn('flex gap-2 px-3 py-2', editingId === t.id ? 'items-start' : 'items-center')}>
                        {/* Indicator */}
                        {editingId === t.id ? (
                          <div className="relative shrink-0 mt-1">
                            <input
                              type="color"
                              value={editColor}
                              onChange={e => setEditColor(e.target.value)}
                              className="absolute inset-0 opacity-0 cursor-pointer w-5 h-5"
                              title="Pick color"
                            />
                            <span
                              className="block w-5 h-5 rounded-full border-2 border-white shadow-sm"
                              style={{ backgroundColor: editColor }}
                            />
                          </div>
                        ) : (
                          <span
                            className="shrink-0 w-3 h-3 rounded-full"
                            style={{ backgroundColor: t.color || '#2845D6' }}
                          />
                        )}

                        {/* Name / input */}
                        {editingId === t.id ? (
                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={editName}
                              onChange={e => { setEditName(e.target.value); validateName(e.target.value, setEditNameErr); }}
                              maxLength={100}
                              className="w-full h-7 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[#2845D6]/40"
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(t.id); if (e.key === 'Escape') setEditingId(null); }}
                            />
                            {editNameErr && <p className="text-[10px] text-red-500 mt-0.5">{editNameErr}</p>}
                          </div>
                        ) : (
                          <>
                            <span className="flex-1 min-w-0 max-w-full text-xs font-medium text-[var(--color-text-primary)] truncate">{t.name}</span>
                            {activeTab === 'allowance' && (
                              <span className={cn(
                                'shrink-0 text-[10px] rounded px-1.5 py-0.5 font-medium',
                                t.replace_on_upload
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                  : 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
                              )}>
                                {t.replace_on_upload ? 'Replace' : 'Cumulative'}
                              </span>
                            )}
                            {activeTab === 'allowance' && (t as AllowanceType).percentage && (
                              <span className="shrink-0 text-[10px] rounded px-1.5 py-0.5 font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                %
                              </span>
                            )}
                            {activeTab === 'loan' && (
                              <span className={cn(
                                'shrink-0 text-[10px] rounded px-1.5 py-0.5 font-medium',
                                t.stackable
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
                              )}>
                                {t.stackable ? 'Stackable' : 'Non-stack'}
                              </span>
                            )}
                          </>
                        )}

                        {/* Actions */}
                        {editingId === t.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(t.id)}
                              disabled={saving}
                              className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors disabled:opacity-50"
                              title="Save"
                            >
                              {saving
                                ? <div className="h-3 w-3 rounded-full border-2 border-green-200 border-t-green-600 animate-spin" />
                                : <Check size={13} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                              title="Cancel"
                            >
                              <X size={13} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(t.id);
                                setEditName(t.name);
                                setEditColor(t.color || '#2845D6');
                                setEditNameErr('');
                                setEditReplaceOnUpload(!!(t.replace_on_upload));
                                setEditPercentage(!!(t as AllowanceType).percentage);
                                setEditStackable(!!(t.stackable));
                              }}
                              className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[#2845D6] transition-colors"
                              title="Edit"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirm({ id: t.id, name: t.name })}
                              className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>

                      {/* ── Animated checkbox panel ── */}
                      <AnimatePresence initial={false}>
                        {editingId === t.id && (activeTab === 'allowance' || activeTab === 'loan') && (
                          <motion.div
                            key="panel"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="px-3 pb-2 space-y-0.5">
                              {activeTab === 'allowance' && (
                                <TypeCheckbox checked={editReplaceOnUpload} onChange={setEditReplaceOnUpload} label="Replace on upload" />
                              )}
                              {activeTab === 'allowance' && (
                                <TypeCheckbox checked={editPercentage} onChange={setEditPercentage} label="Percentage" />
                              )}
                              {activeTab === 'loan' && (
                                <TypeCheckbox checked={editStackable} onChange={setEditStackable} label="Stackable" />
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </li>
                  ))}
                </ul>

                {/* Create new type form */}
                <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-3 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Add New Type</p>
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1.5 shrink-0 w-5 h-5 rounded-full border-2 border-white shadow-sm"
                      style={{ backgroundColor: nextColor(types) }}
                      title="Auto-assigned color"
                    />
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        placeholder="Type name…"
                        value={newName}
                        onChange={e => { setNewName(e.target.value); validateName(e.target.value, setNameErr); }}
                        maxLength={100}
                        className="w-full h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[#2845D6]/40 placeholder:text-[var(--color-text-muted)]"
                        onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                      />
                      {nameErr && <p className="text-[10px] text-red-500 mt-0.5">{nameErr}</p>}
                      <AnimatePresence>
                        {(activeTab === 'allowance' || activeTab === 'loan') && (
                          <motion.div
                            key={`new-${activeTab}`}
                            layout
                            initial={{ opacity: 0, height: 0, y: -12 }}
                            animate={{ opacity: 1, height: 'auto', y: 0 }}
                            exit={{ opacity: 0, height: 0, y: -12 }}
                            transition={{
                              duration: 0.32,
                              ease: [0.16, 1, 0.3, 1],
                              layout: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
                            }}
                            className="overflow-hidden"
                          >
                            <div className="mt-1.5 space-y-1">
                              {activeTab === 'allowance' && (
                                <TypeCheckbox checked={newReplaceOnUpload} onChange={setNewReplaceOnUpload} label="Replace on upload" />
                              )}
                              {activeTab === 'allowance' && (
                                <TypeCheckbox checked={newPercentage} onChange={setNewPercentage} label="Percentage" />
                              )}
                              {activeTab === 'loan' && (
                                <TypeCheckbox checked={newStackable} onChange={setNewStackable} label="Stackable" />
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={saving || !newName.trim() || !!nameErr}
                      className="shrink-0 mt-0 h-8 px-3 rounded-md bg-[#2845D6] text-white text-xs font-medium hover:bg-[#1e35b5] transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      {saving
                        ? <div className="h-3 w-3 rounded-full border border-white/60 border-t-white animate-spin" />
                        : <Plus size={13} />}
                      Add
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--color-border)] shrink-0 flex justify-end">
          <button type="button" onClick={onClose}
            className="h-8 px-5 rounded-lg text-xs font-medium border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors">
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
    <AnimatePresence>
      {deleteConfirm && (
        <ConfirmationModal
          title="Delete Type"
          message={`Delete "${deleteConfirm.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          confirming={deleteConfirming}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </AnimatePresence>
    </>
  );
}


// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day:   '2-digit',
    year:  'numeric',
  });
}

/** Format a pure YYYY-MM-DD date string as "Apr 06, 2026" without UTC shift. */
function fmtDateShort(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day:   '2-digit',
    year:  'numeric',
  });
}

/** Format a pure YYYY-MM-DD date string as "April 6, 2026" — full month, no leading zero. */
function fmtDateFull(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long',
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
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="border-b border-[var(--color-border)]">
          <td className="px-4 py-3">
            <div className="h-3 animate-pulse rounded-full bg-[var(--color-skeleton)]" style={{ width: 80 }} />
          </td>
          <td className="px-4 py-3">
            <div className="h-3 animate-pulse rounded-full bg-[var(--color-skeleton)]" style={{ width: 144 }} />
          </td>
          <td className="px-4 py-3 hidden sm:table-cell">
            <div className="h-3 animate-pulse rounded-full bg-[var(--color-skeleton)]" style={{ width: 112 }} />
          </td>
          <td className="px-4 py-3 hidden lg:table-cell">
            <div className="h-3 animate-pulse rounded-full bg-[var(--color-skeleton)]" style={{ width: 96 }} />
          </td>
          <td className="py-3" style={{ width: 1, whiteSpace: 'nowrap' }}>
            <div className="h-3 animate-pulse rounded-full bg-[var(--color-skeleton)]" style={{ width: 16 }} />
          </td>
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

/** Lookup a type's hex color by name; falls back to provided default. */
function typeColor(types: { name: string; color: string }[], name: string, fallback: string): string {
  return types.find(t => t.name === name)?.color ?? fallback;
}

/** Convert a 6-digit hex colour to an rgba() string. */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Human-readable label for a deduction frequency code. */
function freqLabel(freq: string): string {
  switch (freq) {
    case 'cutoff':    return 'Cut-Off (×2 / month)';
    case 'monthly':   return 'Monthly';
    case 'weekly':    return 'Weekly';
    case 'quarterly': return 'Quarterly';
    case 'yearly':    return 'Yearly';
    default:          return freq;
  }
}

/**
 * Estimate the loan completion date given the outstanding balance, per-period
 * deduction amount, and deduction frequency code.
 */
function estimatedCompletion(
  balance: number,
  deductionAmt: number | null,
  frequency: string,
): string {
  if (!deductionAmt || deductionAmt <= 0 || balance <= 0) return '—';
  const periodsPerYear =
    frequency === 'cutoff'    ? 24 :
    frequency === 'monthly'   ? 12 :
    frequency === 'weekly'    ? 52 :
    frequency === 'quarterly' ?  4 :
    frequency === 'yearly'    ?  1 : 12;

  const daysPerPeriod  = 365 / periodsPerYear;
  const periodsLeft    = Math.ceil(balance / deductionAmt);
  const daysLeft       = periodsLeft * daysPerPeriod;
  const completion     = new Date(Date.now() + daysLeft * 86_400_000);
  return completion.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function TabContent({
  tab,
  records,
  fetchError,
  financeTypes,
  loanSettings,
  onRefresh,
}: {
  tab:          FinanceTabKey;
  records:      EmployeeDetailRecords | null;
  fetchError:   boolean;
  financeTypes: FinanceTypesResponse | null;
  loanSettings: LoanSettingsConfig | null;
  onRefresh:    () => void;
}) {
  // ── Modal states ─────────────────────────────────────────────────────────
  const [deletePayslip,   setDeletePayslip  ] = useState<PayslipRecord | null>(null);
  const [deletingPs,      setDeletingPs     ] = useState(false);
  const [viewLoan,        setViewLoan       ] = useState<LoanRecord | null>(null);
  const [loanDetail,      setLoanDetail     ] = useState<DeductionDetail | null>(null);
  const [loadingDeducts,  setLoadingDeducts ] = useState(false);
  const [withdrawSavings, setWithdrawSavings] = useState<SavingsRecord | null>(null);
  const [withdrawing,     setWithdrawing    ] = useState(false);

  // Fetch deductions when loan modal opens
  useEffect(() => {
    if (!viewLoan) { setLoanDetail(null); return; }
    setLoadingDeducts(true);
    fetch(`/api/finance/admin/loans/${viewLoan.id}/deductions`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Request failed'); return r.json() as Promise<DeductionDetail>; })
      .then(setLoanDetail)
      .catch(() => setLoanDetail(null))
      .finally(() => setLoadingDeducts(false));
  }, [viewLoan]);

  async function handleDeletePayslip() {
    if (!deletePayslip) return;
    setDeletingPs(true);
    try {
      const [res] = await Promise.all([
        fetch(`/api/finance/admin/payslips/${deletePayslip.id}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'X-CSRFToken': getCsrfToken() },
        }),
        new Promise<void>(resolve => setTimeout(resolve, 1000)),
      ]);
      if ((res as Response).ok || (res as Response).status === 204) {
        toast.success('Payslip deleted.');
        setDeletePayslip(null);
        onRefresh();
      } else {
        toast.error('Failed to delete payslip.');
      }
    } finally {
      setDeletingPs(false);
    }
  }

  async function handleWithdrawSavings() {
    if (!withdrawSavings) return;
    setWithdrawing(true);
    try {
      const [res] = await Promise.all([
        fetch(`/api/finance/admin/savings/${withdrawSavings.id}/withdraw`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRFToken': getCsrfToken() },
        }),
        new Promise<void>(resolve => setTimeout(resolve, 1000)),
      ]);
      if ((res as Response).ok) {
        toast.success('Withdrawal recorded.');
        setWithdrawSavings(null);
        onRefresh();
      } else {
        toast.error('Failed to record withdrawal.');
      }
    } finally {
      setWithdrawing(false);
    }
  }

  const payslipTypes = financeTypes?.payslip_types  ?? [];
  const loanTypes    = financeTypes?.loan_types      ?? [];
  const allowTypes   = financeTypes?.allowance_types ?? [];
  const savingTypes  = financeTypes?.savings_types   ?? [];

  if (fetchError) {
    return (
      <div className="flex items-center justify-center py-6">
        <p className="text-xs text-red-500">Failed to load records. Please try again.</p>
      </div>
    );
  }
  if (!records) return null;

  return (
    <>
      {/* ── Payslip delete confirmation modal ─────────────────────────── */}
      <AnimatePresence>
        {deletePayslip && (
          <ConfirmationModal
            title="Delete Payslip"
            message={`Delete the ${deletePayslip.payslip_type_name} payslip for ${fmtDateShort(deletePayslip.period_start)} – ${fmtDateShort(deletePayslip.period_end)}? This cannot be undone.`}
            confirmLabel="Yes, Delete It"
            confirming={deletingPs}
            onConfirm={handleDeletePayslip}
            onCancel={() => setDeletePayslip(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Loan deductions modal ──────────────────────────────────────── */}
      <AnimatePresence>
        {viewLoan && (() => {
          const principal   = parseFloat(viewLoan.principal_amount) || 0;
          const balance     = parseFloat(viewLoan.current_balance)  || 0;
          const deductAmt   = viewLoan.monthly_deduction ? parseFloat(viewLoan.monthly_deduction) : null;
          const paidAmt     = Math.max(0, principal - balance);
          const pctPaid     = principal > 0 ? Math.min(100, Math.round((paidAmt / principal) * 100)) : 0;
          const isActive    = balance > 0;
          const freq        = loanSettings?.deduction_frequency ?? 'monthly';
          const completion  = estimatedCompletion(balance, deductAmt, freq);

          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
              onClick={() => setViewLoan(null)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 12 }}
                animate={{ scale: 1,    opacity: 1, y: 0  }}
                exit={{    scale: 0.95, opacity: 0, y: 12 }}
                transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                onClick={e => e.stopPropagation()}
                className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
              >
                {/* ── Header ──────────────────────────────────────────── */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] shrink-0">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-lg font-semibold text-[var(--color-text-primary)] truncate">
                        {viewLoan.loan_type_name}
                      </h3>
                      <span
                        className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded"
                        style={isActive
                          ? { backgroundColor: hexToRgba('#10B981', 0.12), color: '#10B981' }
                          : { backgroundColor: hexToRgba('#6B7280', 0.12), color: '#6B7280' }}
                      >
                        {isActive ? 'Active' : 'Paid Off'}
                      </span>
                    </div>
                    {viewLoan.reference_number && (
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                        Ref: {viewLoan.reference_number}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setViewLoan(null)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg)] transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* ── Scrollable body ──────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]">

                  {/* ── Repayment Progress ─────────────────────────────── */}
                  <div className="px-5 pt-4 pb-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                        Repayment Progress
                      </p>
                      <span className="text-xs font-bold text-[#2845D6]">{pctPaid}% repaid</span>
                    </div>
                    {/* 3-D track — no overflow-hidden so the fill's rounded right cap is not clipped */}
                    <div
                      className="relative h-4 w-full rounded-full"
                      style={{
                        background: 'var(--color-border)',
                        boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.22), inset 0 1px 2px rgba(0,0,0,0.14)',
                      }}
                    >
                      {/* Animated fill */}
                      <motion.div
                        initial={{ width: '0%' }}
                        animate={{ width: `${pctPaid}%` }}
                        transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          background: 'linear-gradient(90deg, #1a35c5 0%, #2845D6 40%, #5B7FFF 100%)',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-[9px] text-[var(--color-text-muted)]">
                        Paid: ₱{fmtCurrency(paidAmt.toFixed(2))}
                      </span>
                      <span className="text-[9px] text-[var(--color-text-muted)]">
                        Remaining: ₱{fmtCurrency(viewLoan.current_balance)}
                      </span>
                    </div>
                  </div>

                  {/* ── Loan Summary grid ──────────────────────────────── */}
                  <div className="px-5 pt-3 pb-3 border-t border-[var(--color-border)]">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <div className="pb-3">
                        <p className="text-[10px] text-[var(--color-text-muted)]">Principal Amount</p>
                        <p className="text-sm font-bold text-[var(--color-text-primary)] mt-0.5">
                          ₱{fmtCurrency(viewLoan.principal_amount)}
                        </p>
                      </div>
                      <div className="pb-3">
                        <p className="text-[10px] text-[var(--color-text-muted)]">Outstanding Balance</p>
                        <p className={cn(
                          'text-sm font-bold mt-0.5',
                          isActive ? 'text-amber-500' : 'text-emerald-500',
                        )}>
                          ₱{fmtCurrency(viewLoan.current_balance)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[var(--color-text-muted)]">Deduction Frequency</p>
                        <p className="text-xs font-medium text-[var(--color-text-primary)] mt-0.5">
                          {loanSettings ? freqLabel(freq) : (
                            <span className="inline-block h-3 w-24 rounded bg-[var(--color-skeleton)] animate-pulse" />
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[var(--color-text-muted)]">Per-Period Deduction</p>
                        <p className="text-xs font-medium text-[var(--color-text-primary)] mt-0.5">
                          {deductAmt ? `₱${fmtCurrency(viewLoan.monthly_deduction!)}` : '—'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ── Estimated Completion ──────────────────────────── */}
                  {isActive && (
                    <div className="px-5 py-3 border-t border-[var(--color-border)]">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                        Estimated Completion
                      </p>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                        {loanSettings ? completion : (
                          <span className="inline-block h-4 w-28 rounded bg-[var(--color-skeleton)] animate-pulse" />
                        )}
                      </p>
                      {loanSettings && completion !== '—' && (
                        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                          Based on {freqLabel(freq)} deductions of ₱{fmtCurrency(viewLoan.monthly_deduction ?? '0')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* ── Deduction History ─────────────────────────────── */}
                  <div className="border-t border-[var(--color-border)]">
                    <p className="px-5 py-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                      Deduction History
                    </p>
                    {loadingDeducts ? (
                      <div className="px-5 pb-4 space-y-2">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <div
                              className="h-3 rounded-full bg-[var(--color-skeleton)] animate-pulse"
                              style={{ width: `${50 - i * 8}%` }}
                            />
                            <div
                              className="h-3 rounded-full bg-[var(--color-skeleton)] animate-pulse ml-auto"
                              style={{ width: '18%' }}
                            />
                          </div>
                        ))}
                      </div>
                    ) : !loanDetail || loanDetail.deductions.length === 0 ? (
                      <EmptyState
                        title="No deductions yet"
                        description="No deduction records have been recorded for this loan."
                        icons={[CreditCard, Receipt, DollarSign]}
                        className="py-6"
                      />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Cut-off Date</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {loanDetail.deductions.map(d => (
                            <TableRow key={d.id}>
                              <TableCell>{d.cutoff_date ? fmtDateShort(d.cutoff_date) : '—'}</TableCell>
                              <TableCell className="text-right font-medium">
                                ₱{fmtCurrency(d.amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell className="text-xs font-medium text-[var(--color-text-muted)]">
                              Total Deductions
                            </TableCell>
                            <TableCell className="text-right text-xs font-bold text-[var(--color-text-primary)]">
                              ₱{fmtCurrency(
                                loanDetail.deductions
                                  .reduce((sum, d) => sum + parseFloat(d.amount), 0)
                                  .toFixed(2),
                              )}
                            </TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    )}
                  </div>
                </div>

                {/* ── Footer ──────────────────────────────────────────── */}
                <div className="px-5 py-3 border-t border-[var(--color-border)] text-right shrink-0">
                  <button
                    onClick={() => setViewLoan(null)}
                    className="px-4 py-1.5 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg)] transition-colors"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── Savings withdraw confirmation modal ────────────────────────── */}
      <AnimatePresence>
        {withdrawSavings && (
          <ConfirmationModal
            title="Confirm Withdrawal"
            message={`Record a withdrawal of ₱${fmtCurrency(withdrawSavings.amount)} from ${withdrawSavings.savings_type_name}? This will create a new withdrawal transaction entry.`}
            confirmLabel="Withdraw"
            confirmVariant="success"
            confirming={withdrawing}
            onConfirm={handleWithdrawSavings}
            onCancel={() => setWithdrawSavings(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Tab list ──────────────────────────────────────────────────── */}
      {(() => {
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
                {items.map(p => {
                  const color = typeColor(payslipTypes, p.payslip_type_name, '#2845D6');
                  return (
                    <motion.li
                      key={p.id}
                      variants={LIST_ITEM_VARIANTS}
                      className="flex items-center gap-3 py-3"
                    >
                      {/* Left color indicator */}
                      <div className="w-1 h-5 shrink-0 rounded-full" style={{ backgroundColor: '#8B5CF6' }} />

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{p.payslip_type_name}</p>
                        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                          {fmtDateShort(p.period_start)} – {fmtDateShort(p.period_end)}
                          {p.description && <span className="ml-2 italic">{p.description}</span>}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {p.file_url && (
                          <a
                            href={p.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            title="View Payslip"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
                          >
                            <Eye size={12} />
                          </a>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); setDeletePayslip(p); }}
                          title="Delete Payslip"
                          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </motion.li>
                  );
                })}
              </motion.ul>
            );
          }

          case 'loans': {
            const items = [...records.loans].sort((a, b) => {
              const aActive = parseFloat(a.current_balance) > 0 ? 1 : 0;
              const bActive = parseFloat(b.current_balance) > 0 ? 1 : 0;
              return bActive - aActive;
            });
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
                {items.map(l => {
                  const color = typeColor(loanTypes, l.loan_type_name, '#F59E0B');
                  return (
                    <motion.li
                      key={l.id}
                      variants={LIST_ITEM_VARIANTS}
                      className="flex items-center gap-3 py-3"
                    >
                      <div className="w-1 h-5 shrink-0 rounded-full" style={{ backgroundColor: '#2845D6' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{l.loan_type_name}</p>
                          <span className={cn(
                            'shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full',
                            parseFloat(l.current_balance) > 0
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
                          )}>
                            {parseFloat(l.current_balance) > 0 ? 'Active' : 'Paid Off'}
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                          Principal: ₱{fmtCurrency(l.principal_amount)}
                          <span className="mx-1.5">·</span>
                          Balance: ₱{fmtCurrency(l.current_balance)}
                          {l.reference_number && <span className="ml-2">Ref: {l.reference_number}</span>}
                        </p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setViewLoan(l); }}
                        title="View Deductions"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
                      >
                        <Eye size={12} />
                      </button>
                    </motion.li>
                  );
                })}
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
                {items.map(a => {
                  const color = typeColor(allowTypes, a.allowance_type_name, '#10B981');
                  return (
                    <motion.li
                      key={a.id}
                      variants={LIST_ITEM_VARIANTS}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      {/* Left color indicator */}
                      <div className="w-1 h-5 shrink-0 rounded-full" style={{ backgroundColor: '#10B981' }} />

                      {/* Type + deposited pill */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{a.allowance_type_name}</p>
                          {a.deposited_date && (
                            <span
                              className="text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                              style={{ backgroundColor: hexToRgba('#10B981', 0.12), color: '#10B981' }}
                            >
                          Deposited: {fmtDateFull(a.deposited_date)}
                            </span>
                          )}
                        </div>
                        {a.covered_period && (
                          <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate">{a.covered_period}</p>
                        )}
                      </div>

                      {/* Amount (right, larger) */}
                      <span className="text-sm font-bold shrink-0" style={{ color: '#10B981' }}>
                        ₱{fmtCurrency(a.amount)}
                      </span>
                    </motion.li>
                  );
                })}
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
                {items.map(s => {
                  const color = typeColor(savingTypes, s.savings_type_name, '#8B5CF6');
                  return (
                    <motion.li
                      key={s.id}
                      variants={LIST_ITEM_VARIANTS}
                      className="flex items-center gap-3 py-3"
                    >
                      <div className="w-1 h-5 shrink-0 rounded-full" style={{ backgroundColor: '#F59E0B' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{s.savings_type_name}</p>
                          {s.withdraw && (
                            <span
                              className="text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                              style={{ backgroundColor: hexToRgba('#F59E0B', 0.12), color: '#F59E0B' }}
                            >
                              Withdraw
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{fmtDate(s.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-semibold" style={{ color: '#F59E0B' }}>
                          ₱{fmtCurrency(s.amount)}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); setWithdrawSavings(s); }}
                          title="Record Withdrawal"
                          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                        >
                          <ArrowDownLeft size={12} />
                        </button>
                      </div>
                    </motion.li>
                  );
                })}
              </motion.ul>
            );
          }
        }
      })()}
    </>
  );
}
// ── Accordion row ──────────────────────────────────────────────────────────────

function FinanceAccordionRow({
  emp,
  isExpanded,
  onToggle,
  refreshKey,
  financeTypes,
  loanSettings,
}: {
  emp:          FinanceEmployeeRow;
  isExpanded:   boolean;
  onToggle:     () => void;
  refreshKey:   number;
  financeTypes: FinanceTypesResponse | null;
  loanSettings: LoanSettingsConfig | null;
}) {
  const fullName = [emp.lastname, emp.firstname].filter(Boolean).join(', ') || emp.idnumber;

  const [activeTab,  setActiveTab ] = useState<FinanceTabKey>('payslip');
  const [records,    setRecords   ] = useState<EmployeeDetailRecords | null>(null);
  const [loading,    setLoading   ] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const hasFetchedRef  = useRef(false);
  const prevRefreshKey = useRef(refreshKey);

  const [localRefresh, setLocalRefresh] = useState(0);

  const refreshRecords = useCallback(() => {
    hasFetchedRef.current = false;
    setLocalRefresh(k => k + 1);
  }, []);

  // Clear cache when refreshKey changes so next expand re-fetches
  useEffect(() => {
    if (prevRefreshKey.current !== refreshKey) {
      prevRefreshKey.current = refreshKey;
      hasFetchedRef.current  = false;
      setRecords(null);
      setFetchError(false);
    }
  }, [refreshKey]);

  // Fetch records on expand (lazy, once per refresh cycle or local refresh)
  useEffect(() => {
    if (!isExpanded || hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    setLoading(true);
    setFetchError(false);
    fetch(`/api/finance/admin/employees/${encodeURIComponent(emp.idnumber)}/records`, {
      credentials: 'include',
    })
      .then(r => { if (!r.ok) throw new Error('Request failed'); return r.json() as Promise<EmployeeDetailRecords>; })
      .then(data => { setRecords(data); })
      .catch(() => { setFetchError(true); })
      .finally(() => { setLoading(false); });
  }, [isExpanded, emp.idnumber, localRefresh]);

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
        <td className="px-4 py-3.5 text-xs text-[var(--color-text-muted)]" style={{ width: 140 }}>
          {emp.idnumber}
        </td>
        <td className="px-4 py-3.5 text-xs font-medium text-[var(--color-text-primary)]" style={{ width: 220 }}>
          {fullName}
        </td>
        <td className="px-4 py-3.5 text-xs text-[var(--color-text-muted)] hidden sm:table-cell" style={{ width: 160 }}>
          {emp.department || '—'}
        </td>
        <td className="px-4 py-3.5 text-xs text-[var(--color-text-muted)] hidden lg:table-cell" style={{ width: 160 }}>
          {emp.line || '—'}
        </td>
        <td className="py-3.5 pr-3 pl-2 text-[var(--color-text-muted)]" style={{ width: 1, whiteSpace: 'nowrap' }}>
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
            <td colSpan={5} className="p-0 overflow-hidden">
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.32, ease: [0.04, 0.62, 0.23, 0.98] }}
                className="overflow-hidden min-w-0 bg-[var(--color-bg)] border-t border-[var(--color-border)]"
              >
                {/* ── Vercel-style tab bar ── */}
                <div
                  className="px-5 pt-3 pb-3 border-b border-[var(--color-border)]"
                  onClick={e => e.stopPropagation()}
                >
                  <Tabs
                    tabs={FINANCE_TABS.map(t => ({ id: t.key, label: t.label }))}
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
                        <TabContent tab={activeTab} records={records} fetchError={fetchError} financeTypes={financeTypes} loanSettings={loanSettings} onRefresh={refreshRecords} />
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

  // ── Loan settings ──────────────────────────────────────────────────────────
  const [loanSettings, setLoanSettings] = useState<LoanSettingsConfig | null>(null);

  // ── Modal state ────────────────────────────────────────────────────────────
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showTypes,  setShowTypes ] = useState(false);

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
  const fetchTypes = useCallback(() => {
    if (authPhase !== 'done') return;
    fetch('/api/finance/admin/types', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: FinanceTypesResponse | null) => { if (d) setFinanceTypes(d); })
      .catch(() => {});
  }, [authPhase]);

  useEffect(() => { fetchTypes(); }, [fetchTypes]);

  // ── Loan settings fetch ────────────────────────────────────────────────────
  const fetchLoanSettings = useCallback(() => {
    if (authPhase !== 'done') return;
    fetch('/api/finance/admin/loan-settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: LoanSettingsConfig | null) => { if (d) setLoanSettings(d); })
      .catch(() => {});
  }, [authPhase]);

  useEffect(() => { fetchLoanSettings(); }, [fetchLoanSettings]);

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
          <button
            type="button"
            onClick={() => setShowTypes(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <Settings size={13} />
            Manage Types
          </button>
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
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                  <th className="px-4 py-2.5 text-left" style={{ width: 140 }}>
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
                  <th className="px-4 py-2.5 text-left hidden lg:table-cell" style={{ width: 160 }}>
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
                  <th className="py-2.5" style={{ width: 1, whiteSpace: 'nowrap' }} />
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
                      financeTypes={financeTypes}
                      loanSettings={loanSettings}
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
      <AnimatePresence>
        {showTypes && financeTypes && (
          <TypesManageModal
            financeTypes={financeTypes}
            onClose={() => setShowTypes(false)}
            onRefresh={fetchTypes}
            onLoanSettingsSaved={cfg => setLoanSettings(cfg)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

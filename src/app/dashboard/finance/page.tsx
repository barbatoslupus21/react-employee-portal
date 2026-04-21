'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Eye,
  EyeOff,
  Mail,
  Receipt,
  Wallet,
  PiggyBank,
  CreditCard,
  DollarSign,
  FileText,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/interactive-empty-state';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { toast } from '@/components/ui/toast';
import { getCsrfToken } from '@/lib/csrf';
import { cn } from '@/lib/utils';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';


// ── Types ──────────────────────────────────────────────────────────────────────

interface UserData {
  id:          number;
  idnumber:    string;
  firstname:   string | null;
  lastname:    string | null;
  admin:       boolean;
  accounting:  boolean;
}

interface LoanRecord {
  id:                number;
  loan_type_name:    string;
  loan_type_color:   string;
  principal_amount:  string;
  current_balance:   string;
  monthly_deduction: string | null;
  description:       string;
  reference_number:  string;
  created_at:        string;
}

interface AllowanceRecord {
  id:                  number;
  allowance_type_name: string;
  is_percentage:       boolean;
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
  file_name:         string | null;
  sent:              boolean;
  description:       string;
  created_at:        string;
}

interface UserFinanceRecords {
  loans:      LoanRecord[];
  allowances: AllowanceRecord[];
  savings:    SavingsRecord[];
  payslips:   PayslipRecord[];
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

interface LoanSettingsConfig {
  deduction_frequency: string;
}

type MaskKey = 'allowances' | 'savings' | 'loans';


// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCurrency(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === '') return '—';
  const n = typeof val === 'number' ? val : parseFloat(val as string);
  if (isNaN(n)) return '—';
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateShort(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric',
  });
}

function fmtDateFull(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function fmtMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

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
  const daysPerPeriod = 365 / periodsPerYear;
  const periodsLeft   = Math.ceil(balance / deductionAmt);
  const daysLeft      = periodsLeft * daysPerPeriod;
  const completion    = new Date(Date.now() + daysLeft * 86_400_000);
  return completion.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}


// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon: Icon,
  iconColor,
  masked,
  onToggleMask,
  loading,
}: {
  label:         string;
  value:         string;
  icon:          React.ComponentType<{ size?: number; className?: string }>;
  iconColor:     string;
  masked?:       boolean;
  onToggleMask?: () => void;
  loading:       boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 flex items-center justify-between gap-3 shadow-sm">
      <div className="flex-1 min-w-0">
        {loading ? (
          <div className="h-8 w-24 rounded-md bg-[var(--color-border)] animate-pulse" />
        ) : (
          <div className="h-8 flex items-center">
            <AnimatePresence mode="wait" initial={false}>
              {masked ? (
                <motion.p
                  key="masked"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="text-xl font-bold text-[var(--color-text-muted)] tracking-widest select-none"
                >
                  ● ● ● ●
                </motion.p>
              ) : (
                <motion.p
                  key="value"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="text-xl font-bold text-[var(--color-text-primary)]"
                >
                  {value}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        )}
        <div className="flex items-center gap-1 mt-0.5">
          <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
          {onToggleMask && !loading && (
            <button
              onClick={onToggleMask}
              className="flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              {masked ? <EyeOff size={11} /> : <Eye size={11} />}
            </button>
          )}
        </div>
      </div>
      <div
        className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: hexToRgba(iconColor, 0.15) }}
      >
        <div style={{ color: iconColor }}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}


// ── Loan Card ─────────────────────────────────────────────────────────────────

/** Derive gradient / border color tokens from a hex string (falls back to brand blue). */
function loanColor(hex: string) {
  const h = hex && /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : '#2845D6';
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return {
    hex,
    border:    `rgba(${r},${g},${b},0.30)`,
    iconBg:    `rgba(${r},${g},${b},0.12)`,
    gradStart: `rgba(${r},${g},${b},0.14)`,
    gradMid:   `rgba(${r},${g},${b},0.05)`,
  };
}

function LoanCard({
  loan,
  loanSettings: _loanSettings,
  onViewHistory,
  index,
}: {
  loan:          LoanRecord;
  loanSettings:  LoanSettingsConfig | null;
  onViewHistory: (loan: LoanRecord) => void;
  index?:        number;
}) {
  const principal = parseFloat(loan.principal_amount) || 0;
  const balance   = parseFloat(loan.current_balance)  || 0;
  const paidAmt   = Math.max(0, principal - balance);
  const pctPaid   = principal > 0 ? Math.min(100, Math.round((paidAmt / principal) * 100)) : 0;
  const isActive  = balance > 0;
  const deductAmt = loan.monthly_deduction ? parseFloat(loan.monthly_deduction) : null;
  const color     = loanColor(loan.loan_type_color);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8, delay: (index ?? 0) * 0.07 }}
      className="relative overflow-hidden rounded-2xl border bg-[var(--color-bg-card)] flex flex-col group hover:z-20"
      style={{ borderColor: color.border }}
    >
      {/* Diagonal gradient overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `linear-gradient(135deg, ${color.gradStart} 0%, ${color.gradMid} 45%, transparent 100%)` }}
      />

      <div className="relative p-4 flex flex-col gap-3">
        {/* Name + status pill — same row, space-between, no icon */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] leading-snug line-clamp-2 flex-1">
            {loan.loan_type_name}
          </h3>
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0"
            style={isActive
              ? { backgroundColor: hexToRgba('#10B981', 0.12), color: '#10B981' }
              : { backgroundColor: hexToRgba('#EF4444', 0.12), color: '#EF4444' }}
          >
            {isActive ? 'Active' : 'Paid Off'}
          </span>
        </div>

        {/* Balance */}
        <div>
          <p className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Balance</p>
          <p className="text-base font-bold text-[var(--color-text-primary)] mt-0.5 leading-none">₱{fmtCurrency(loan.current_balance)}</p>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1.5">
            <span className="font-semibold" style={{ color: color.hex }}>{pctPaid}% paid</span>
          </div>
          <div className="relative h-1.5 rounded-full" style={{ background: 'var(--color-border)' }}>
            <motion.div
              initial={{ width: '0%' }}
              animate={{ width: `${pctPaid}%` }}
              transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ backgroundColor: color.hex }}
            />
          </div>
        </div>

        {/* Monthly + Started */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Monthly</p>
            <p className="text-xs font-semibold text-[var(--color-text-primary)] mt-0.5">
              {deductAmt ? `₱${fmtCurrency(loan.monthly_deduction!)}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Started</p>
            <p className="text-xs font-semibold text-[var(--color-text-primary)] mt-0.5">
              {fmtMonthYear(loan.created_at)}
            </p>
          </div>
        </div>

        {/* View History CTA */}
        <button
          onClick={() => onViewHistory(loan)}
          className="mt-1 flex items-center gap-1.5 text-xs font-semibold transition-all group-hover:gap-2"
          style={{ color: color.hex }}
        >
          <Eye size={12} />
          <span>View History</span>
        </button>
      </div>
    </motion.div>
  );
}


// ── Scroll List ────────────────────────────────────────────────────

function ScrollList({ children }: { children: React.ReactNode }) {
  const listRef = useRef<HTMLUListElement>(null);
  const [canScrollUp,   setCanScrollUp  ] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const check = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 2);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }, []);

  useEffect(() => {
    check();
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [check, children]);

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      <AnimatePresence>
        {canScrollUp && (
          <motion.div
            key="up-arrow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-center bg-gradient-to-b from-[var(--color-bg-elevated)] to-transparent h-7 pt-1"
          >
            <ChevronUp size={12} className="text-[var(--color-text-muted)]" />
          </motion.div>
        )}
      </AnimatePresence>

      <ul
        ref={listRef}
        onScroll={check}
        className="h-full divide-y divide-[var(--color-border)] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>

      <AnimatePresence>
        {canScrollDown && (
          <motion.div
            key="down-arrow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-center bg-gradient-to-t from-[var(--color-bg-elevated)] to-transparent h-7 pb-1"
          >
            <ChevronDown size={12} className="text-[var(--color-text-muted)]" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ── Page Skeleton ─────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="w-full p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="space-y-1.5">
        <div className="h-7 w-36 rounded-lg bg-[var(--color-border)] animate-pulse" />
        <div className="h-4 w-72 rounded bg-[var(--color-border)] animate-pulse" />
      </div>
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[var(--color-border)] p-4 h-20 animate-pulse bg-[var(--color-border)]" />
        ))}
      </div>
      {/* 3-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[var(--color-border)] p-4 space-y-3 animate-pulse">
            <div className="h-5 w-32 rounded bg-[var(--color-border)]" />
            {Array.from({ length: 3 }).map((__, j) => (
              <div key={j} className="h-12 rounded-lg bg-[var(--color-border)]" />
            ))}
          </div>
        ))}
      </div>
      {/* Loans */}
      <div className="rounded-xl border border-[var(--color-border)] p-4 space-y-3 animate-pulse">
        <div className="h-5 w-24 rounded bg-[var(--color-border)]" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-52 rounded-xl bg-[var(--color-border)]" />
          ))}
        </div>
      </div>
    </div>
  );
}


// ── Main Page ──────────────────────────────────────────────────────────────────

export default function MyFinancePage() {
  const router = useRouter();

  // ── Auth ────────────────────────────────────────────────────────────────────
  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');
  const [user,      setUser]      = useState<UserData | null>(null);
  const authTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    authTimerRef.current = setTimeout(() => setAuthPhase('checking'), 350);

    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: UserData | null) => {
        if (authTimerRef.current) clearTimeout(authTimerRef.current);
        if (!data) { router.replace('/'); return; }
        if (data.admin && data.accounting) { router.replace('/dashboard/finance/admin'); return; }
        setUser(data);
        setAuthPhase('done');
      })
      .catch(() => {
        if (authTimerRef.current) clearTimeout(authTimerRef.current);
        router.replace('/');
      });

    return () => { if (authTimerRef.current) clearTimeout(authTimerRef.current); };
  }, [router]);

  // ── Data ─────────────────────────────────────────────────────────────────────
  const [records,      setRecords     ] = useState<UserFinanceRecords | null>(null);
  const [loanSettings, setLoanSettings] = useState<LoanSettingsConfig | null>(null);
  const [loading,      setLoading     ] = useState(true);

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/finance/my/records',      { credentials: 'include' }).then(r => r.json() as Promise<UserFinanceRecords>),
      fetch('/api/finance/my/loan-settings', { credentials: 'include' }).then(r => r.json() as Promise<LoanSettingsConfig>),
    ])
      .then(([recs, ls]) => { setRecords(recs); setLoanSettings(ls); })
      .catch(() => toast.error('Failed to load finance data.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (authPhase !== 'done') return;
    fetchData();
  }, [authPhase, fetchData]);

  // ── Mask toggles ─────────────────────────────────────────────────────────────
  const [maskedSet, setMaskedSet] = useState<Set<MaskKey>>(new Set(['allowances', 'savings', 'loans']));
  function toggleMask(key: MaskKey) {
    setMaskedSet(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // ── Active-only toggle ────────────────────────────────────────────────────
  const [activeOnly, setActiveOnly] = useState(true);

  // ── Loan deductions modal ────────────────────────────────────────────────
  const [viewLoan,       setViewLoan      ] = useState<LoanRecord | null>(null);
  const [loanDetail,     setLoanDetail    ] = useState<DeductionDetail | null>(null);
  const [loadingDeducts, setLoadingDeducts] = useState(false);

  async function handleViewHistory(loan: LoanRecord) {
    setViewLoan(loan);
    setLoanDetail(null);
    setLoadingDeducts(true);
    try {
      const res = await fetch(`/api/finance/my/loans/${loan.id}/deductions`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      setLoanDetail(await res.json() as DeductionDetail);
    } catch {
      toast.error('Failed to load deduction history.');
    } finally {
      setLoadingDeducts(false);
    }
  }

  // ── Send payslip email ────────────────────────────────────────────────────
  const [sendPayslip,  setSendPayslip ] = useState<PayslipRecord | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  async function handleSendPayslipEmail() {
    if (!sendPayslip) return;
    setSendingEmail(true);
    try {
      const [res] = await Promise.all([
        fetch(`/api/finance/my/payslips/${sendPayslip.id}/send-email`, {
          method: 'POST', credentials: 'include',
          headers: { 'X-CSRFToken': getCsrfToken() },
        }),
        new Promise<void>(r => setTimeout(r, 1000)),
      ]);
      if ((res as Response).ok) {
        toast.success('Payslip sent to your email successfully.');
        const id = sendPayslip.id;
        setRecords(prev => prev ? {
          ...prev,
          payslips: prev.payslips.map(p => p.id === id ? { ...p, sent: true } : p),
        } : prev);
        setSendPayslip(null);
      } else {
        const err = await (res as Response).json().catch(() => ({})) as { detail?: string };
        toast.error(err.detail ?? 'Failed to send email.');
      }
    } finally {
      setSendingEmail(false);
    }
  }

  // ── Auth render gates ─────────────────────────────────────────────────────
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
  if (loading) return <PageSkeleton />;

  // ── Derived values ────────────────────────────────────────────────────────
  const loans         = records?.loans      ?? [];
  const allowances    = records?.allowances ?? [];
  const savings       = records?.savings    ?? [];
  const payslips      = records?.payslips   ?? [];

  // Sort: allowances without a deposited_date float to top
  const sortedAllowances = [...allowances].sort((a, b) => {
    const aHas = a.deposited_date ? 1 : 0;
    const bHas = b.deposited_date ? 1 : 0;
    return aHas - bHas;
  });

  // Sort: active savings (withdraw=false) float to top
  const sortedSavings = [...savings].sort((a, b) => {
    const aW = a.withdraw ? 1 : 0;
    const bW = b.withdraw ? 1 : 0;
    return aW - bW;
  });

  const activeLoans      = loans.filter(l => parseFloat(l.current_balance) > 0);
  const activeLoansTotal  = activeLoans.reduce((s, l) => s + (parseFloat(l.current_balance) || 0), 0);
  const hasInactiveLoans  = loans.some(l => parseFloat(l.current_balance) <= 0);
  // Active loans first, then inactive; stable relative order within each group.
  const sortedLoans       = [...loans].sort((a, b) => {
    const aA = parseFloat(a.current_balance) > 0;
    const bA = parseFloat(b.current_balance) > 0;
    return aA === bA ? 0 : aA ? -1 : 1;
  });
  const displayedLoans    = activeOnly ? activeLoans : sortedLoans;

  const allowancesTotal = allowances.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
  const savingsTotal    = savings
    .filter(sv => !sv.withdraw)
    .reduce((s, sv) => s + (parseFloat(sv.amount) || 0), 0);

  const todayRef = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

  const displayName = user
    ? [user.firstname, user.lastname].filter(Boolean).join(' ') || user.idnumber
    : '';

  // ── Full page render ──────────────────────────────────────────────────────
  return (
    <div className="w-full p-4 sm:p-6 space-y-6">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">My Finance</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Track your payslips, allowances, savings, and loans.
        </p>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Payslips"
          value={String(payslips.length)}
          icon={Receipt}
          iconColor="#8B5CF6"
          loading={false}
        />
        <SummaryCard
          label="Allowances Balance"
          value={`₱${fmtCurrency(allowancesTotal.toFixed(2))}`}
          icon={Wallet}
          iconColor="#F59E0B"
          masked={maskedSet.has('allowances')}
          onToggleMask={() => toggleMask('allowances')}
          loading={false}
        />
        <SummaryCard
          label="Total Savings"
          value={`₱${fmtCurrency(savingsTotal.toFixed(2))}`}
          icon={PiggyBank}
          iconColor="#10B981"
          masked={maskedSet.has('savings')}
          onToggleMask={() => toggleMask('savings')}
          loading={false}
        />
        <SummaryCard
          label="Active Loans"
          value={`₱${fmtCurrency(activeLoansTotal.toFixed(2))}`}
          icon={CreditCard}
          iconColor="#EF4444"
          masked={maskedSet.has('loans')}
          onToggleMask={() => toggleMask('loans')}
          loading={false}
        />
      </div>

      {/* ── 3-column section grid ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* ── Payslips ──────────────────────────────────────────────────── */}
        <div className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-sm md:h-[500px]" style={{ minHeight: '200px', maxHeight: '500px', overflow: 'hidden' }}>
          {/* Card header */}
          <div className="flex items-center px-4 py-3 border-b border-[var(--color-border)] shrink-0">
            <div>
              <p className="text-lg pb-1.5 pt-1 font-semibold text-[var(--color-text-secondary)] leading-none">Payslips</p>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Your salary statements</p>
            </div>
          </div>

          {payslips.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                title="No payslips yet"
                description="Your salary statements will appear here once issued."
                icons={[FileText, Receipt, DollarSign]}
              />
            </div>
          ) : (
            <ScrollList>
              {payslips.map((p, i) => {
                const hasFile = !!p.file_url;
                return (
                  <motion.li
                    key={p.id}
                    initial={{ opacity: 0, y: 16, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8, delay: i * 0.07 }}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    {/* Icon */}
                    <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center" style={{ backgroundColor: hexToRgba('#8B5CF6', 0.12) }}>
                      <FileText size={13} style={{ color: '#8B5CF6' }} />
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                        {fmtDateFull(p.period_start)}
                      </p>
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate">
                        {p.file_name ?? `${p.payslip_type_name} • ${fmtDateShort(p.period_start)} – ${fmtDateShort(p.period_end)}`}
                      </p>
                    </div>
                    {/* Status + email button */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                        style={p.sent
                          ? { backgroundColor: hexToRgba('#10B981', 0.12), color: '#10B981' }
                          : { backgroundColor: hexToRgba('#6B7280', 0.10), color: '#6B7280' }}
                      >
                        {p.sent ? 'Sent' : 'For Sending'}
                      </span>
                      {hasFile && (
                        <button
                          onClick={() => setSendPayslip(p)}
                          title="Send to Email"
                          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
                        >
                          <Mail size={12} />
                        </button>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </ScrollList>
          )}
        </div>

        {/* ── Benefits (Allowances) ─────────────────────────────────────── */}
        <div className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-sm md:h-[500px]" style={{ minHeight: '200px', maxHeight: '500px', overflow: 'hidden' }}>
          <div className="flex items-center px-4 py-3 border-b border-[var(--color-border)] shrink-0">
            <div>
              <p className="text-lg pb-1.5 pt-1 font-semibold text-[var(--color-text-secondary)] leading-none">Benefits</p>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Allowances, Benefits, and Bonuses</p>
            </div>
          </div>

          {allowances.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                title="No benefits yet"
                description="Your allowances and benefits will appear here."
                icons={[Wallet, DollarSign, CreditCard]}
              />
            </div>
          ) : (
            <ScrollList>
              {sortedAllowances.map((a, i) => (
                <motion.li
                  key={a.id}
                  initial={{ opacity: 0, y: 16, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8, delay: i * 0.07 }}
                  className="flex items-center gap-3 px-4 py-3"
                >
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
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate uppercase tracking-wide">
                        {a.covered_period}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-sm font-bold" style={{ color: '#F59E0B' }}>
                    {a.is_percentage
                      ? `${parseFloat(a.amount)}%`
                      : `₱${fmtCurrency(a.amount)}`}
                  </p>
                </motion.li>
              ))}
            </ScrollList>
          )}
        </div>

        {/* ── Savings ──────────────────────────────────────────────────── */}
        <div className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-sm md:h-[500px]" style={{ minHeight: '200px', maxHeight: '500px', overflow: 'hidden' }}>
          <div className="flex items-center px-4 py-3 border-b border-[var(--color-border)] shrink-0">
            <div>
              <p className="text-lg pb-1.5 pt-1 font-semibold text-[var(--color-text-secondary)] leading-none">Savings</p>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Your financial growth</p>
            </div>
          </div>

          {savings.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                title="No Savings"
                description="Start saving to see your progress"
                icons={[PiggyBank]}
              />
            </div>
          ) : (
            <ScrollList>
              {sortedSavings.map((sv, i) => (
                <motion.li
                  key={sv.id}
                  initial={{ opacity: 0, y: 16, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8, delay: i * 0.07 }}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{sv.savings_type_name}</p>
                      {sv.withdraw && (
                        <span
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                          style={{ backgroundColor: hexToRgba('#EF4444', 0.10), color: '#EF4444' }}
                        >
                          Withdraw
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{fmtMonthYear(sv.created_at)}</p>
                  </div>
                  <p
                    className="shrink-0 text-xs font-bold"
                    style={{ color: sv.withdraw ? '#EF4444' : '#10B981' }}
                  >
                    ₱{fmtCurrency(sv.amount)}
                  </p>
                </motion.li>
              ))}
            </ScrollList>
          )}
        </div>
      </div>

      {/* ── Loans section ────────────────────────────────────────────────── */}
      <div className="relative rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-sm min-h-[200px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-h-[760px] sm:max-h-[520px] lg:max-h-[570px]">

        {/* Section header — sticky, paints above cards during scroll */}
        <div className="sticky top-0 z-10 bg-[var(--color-bg-elevated)] flex items-center justify-between gap-3 px-4 pt-4 pb-3 border-b border-[var(--color-border)]">
          <div>
            <p className="text-lg font-semibold text-[var(--color-text-primary)] leading-none">Loans</p>
            <p className="text-[10px] text-[var(--color-text-muted)] mt-1">as of {todayRef}</p>
          </div>
          {/* Active / All filter pill — hidden when all loans are active */}
          {hasInactiveLoans && (
            <div className="relative flex items-center bg-[var(--color-bg)] rounded-xl p-0.5 shrink-0">
              {(['active', 'all'] as const).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setActiveOnly(opt === 'active')}
                  className="relative h-7 px-3 rounded-lg z-10 text-xs font-medium"
                >
                  {(activeOnly ? 'active' : 'all') === opt && (
                    <motion.div
                      layoutId="loans-filter-pill"
                      className="absolute inset-0 rounded-lg bg-[var(--color-bg-elevated)] shadow-sm"
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                  <span className={cn(
                    'relative z-10 transition-colors capitalize',
                    (activeOnly ? 'active' : 'all') === opt
                      ? 'text-[#2845D6]'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
                  )}>
                    {opt === 'active' ? 'Active' : 'All'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cards area — pt-3 gives first-row cards buffer so hover y:-4 never clips */}
        <div className="px-4 pt-3 pb-4">
          {displayedLoans.length === 0 ? (
            <EmptyState
              title={activeOnly ? 'No active loans' : 'No loan records'}
              description={activeOnly ? 'Toggle "Active Only" off to see all loan history.' : 'You have no loan records on file.'}
              icons={[CreditCard, Receipt, DollarSign]}
              className="py-8"
            />
          ) : (
            <div className="loans-grid grid gap-4 grid-cols-1">
              {displayedLoans.map((loan, i) => (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  loanSettings={loanSettings}
                  onViewHistory={handleViewHistory}
                  index={i}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Loan deductions modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {viewLoan && (() => {
          const principal  = parseFloat(viewLoan.principal_amount) || 0;
          const balance    = parseFloat(viewLoan.current_balance)  || 0;
          const deductAmt  = viewLoan.monthly_deduction ? parseFloat(viewLoan.monthly_deduction) : null;
          const paidAmt    = Math.max(0, principal - balance);
          const pctPaid    = principal > 0 ? Math.min(100, Math.round((paidAmt / principal) * 100)) : 0;
          const isActive   = balance > 0;
          const freq       = loanSettings?.deduction_frequency ?? 'monthly';
          const completion = estimatedCompletion(balance, deductAmt, freq);

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
                {/* Header */}
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

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]">

                  {/* Repayment Progress */}
                  <div className="px-5 pt-4 pb-3">
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                        Repayment Progress
                      </p>
                      <span className="text-xs font-bold text-[#2845D6]">{pctPaid}% repaid</span>
                    </div>
                    <div
                      className="relative h-4 w-full rounded-full"
                      style={{
                        background: 'var(--color-border)',
                        boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.22), inset 0 1px 2px rgba(0,0,0,0.14)',
                      }}
                    >
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

                  {/* Loan Summary grid */}
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
                        <p className={cn('text-sm font-bold mt-0.5', isActive ? 'text-amber-500' : 'text-emerald-500')}>
                          ₱{fmtCurrency(viewLoan.current_balance)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[var(--color-text-muted)]">Deduction Frequency</p>
                        <p className="text-xs font-medium text-[var(--color-text-primary)] mt-0.5">
                          {loanSettings ? freqLabel(freq) : (
                            <span className="inline-block h-3 w-24 rounded bg-[var(--color-border)] animate-pulse" />
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

                  {/* Estimated Completion */}
                  {isActive && (
                    <div className="px-5 py-3 border-t border-[var(--color-border)]">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                        Estimated Completion
                      </p>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                        {loanSettings ? completion : (
                          <span className="inline-block h-4 w-28 rounded bg-[var(--color-border)] animate-pulse" />
                        )}
                      </p>
                      {loanSettings && completion !== '—' && (
                        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                          Based on {freqLabel(freq)} deductions of ₱{fmtCurrency(viewLoan.monthly_deduction ?? '0')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Deduction History */}
                  <div className="border-t border-[var(--color-border)]">
                    <p className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                      Deduction History
                    </p>
                    {loadingDeducts ? (
                      <div className="px-5 pb-4 space-y-2">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <div className="h-3 rounded-full bg-[var(--color-border)] animate-pulse" style={{ width: `${50 - i * 8}%` }} />
                            <div className="h-3 rounded-full bg-[var(--color-border)] animate-pulse ml-auto" style={{ width: '18%' }} />
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
                              <TableCell className="text-right font-medium">₱{fmtCurrency(d.amount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell className="text-xs font-medium text-[var(--color-text-muted)]">Total Deductions</TableCell>
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

                {/* Footer */}
                <div className="px-5 py-3 border-t border-[var(--color-border)] text-right shrink-0">
                  <button
                    onClick={() => setViewLoan(null)}
                    className="h-8 px-4 rounded-lg text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] transition-colors"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── Send payslip email modal ──────────────────────────────────────── */}
      <AnimatePresence>
        {sendPayslip && (
          <ConfirmationModal
            title="Send Payslip to Email"
            message={`Your payslip for ${fmtDateFull(sendPayslip.period_start)} – ${fmtDateFull(sendPayslip.period_end)} will be sent as a PDF attachment to your registered email address on file. This is a system-generated email — please do not reply to it.`}
            confirmLabel="Send Email"
            cancelLabel="Cancel"
            confirmVariant="success"
            confirming={sendingEmail}
            onConfirm={handleSendPayslipEmail}
            onCancel={() => { if (!sendingEmail) setSendPayslip(null); }}
          />
        )}
      </AnimatePresence>

    </div>
  );
}

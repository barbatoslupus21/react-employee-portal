'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
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
import { TextShimmer } from '@/components/ui/text-shimmer';
import { toast } from '@/components/ui/toast';
import { getCsrfToken } from '@/lib/csrf';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/components/ui/status-pill';
import { ChoiceboxGroup } from '@/components/ui/choicebox-1';
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';


// ── Types ──────────────────────────────────────────────────────────────────────

interface UserData {
  id:          number;
  idnumber:    string;
  email:       string;
  firstname:   string | null;
  lastname:    string | null;
  admin:       boolean;
  accounting:  boolean;
}

interface LoanRecord {
  id:                number;
  loan_type_name:    string;
  loan_type_color:   string;
  seen:              boolean;
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

interface OJTPayslipRecord {
  id:                  number;
  period_start:        string | null;
  period_end:          string | null;
  regular_day:         string;
  allowance_day:       string;
  total_allowance:     string;
  nd_allowance:        string;
  grand_total:         string;
  basic_school_share:  string;
  basic_ojt_share:     string;
  deduction:           string;
  net_ojt_share:       string;
  rice_allowance:      string;
  ot_allowance:        string;
  nd_ot_allowance:     string;
  special_holiday:     string;
  legal_holiday:       string;
  satoff_allowance:    string;
  rd_ot:               string;
  adjustment:          string;
  deduction_2:         string;
  ot_pay_allowance:    string;
  total_allow:         string;
  perfect_attendance:  string;
  holiday_date:        string;
  rd_ot_date:          string;
  sent:                boolean;
  created_at:          string;
}

interface UserFinanceRecords {
  loans:        LoanRecord[];
  allowances:   AllowanceRecord[];
  savings:      SavingsRecord[];
  payslips:     PayslipRecord[];
  ojt_payslips: OJTPayslipRecord[];
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


// ── OJT period label (e.g. "MAY 10-16, 2026") ────────────────────────────────

function fmtOJTPeriod(start: string | null, end: string | null): string {
  if (!start || !end) return '—';
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end   + 'T00:00:00');
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const sm = MONTHS[s.getMonth()];
  const em = MONTHS[e.getMonth()];
  const sd = s.getDate();
  const ed = e.getDate();
  const sy = s.getFullYear();
  const ey = e.getFullYear();
  if (s.getMonth() === e.getMonth() && sy === ey) return `${sm} ${sd}-${ed},${sy}`;
  if (sy === ey) return `${sm} ${sd} - ${em} ${ed},${sy}`;
  return `${sm} ${sd},${sy} - ${em} ${ed},${ey}`;
}

// ── OJTPayslipViewModal ────────────────────────────────────────────────────────

function OJTPayslipViewModal({
  payslip,
  user,
  lineName,
  onClose,
}: {
  payslip:  OJTPayslipRecord;
  user:     UserData;
  lineName: string;
  onClose:  () => void;
}) {
  const n = (v: string) => parseFloat(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fullName = [user.lastname, user.firstname].filter(Boolean).join(', ').toUpperCase() || user.idnumber;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl rounded-xl bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Close button */}
        <div className="flex items-center justify-end px-4 pt-2 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)]">
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto [scrollbar-width:thin] flex-1">
          <div className="px-8 pb-6 text-[var(--color-text-primary)]">

            {/* ── Company header ── */}
            <div className="flex items-center justify-center gap-3 pt-4">
              <img src="/ryonanlogo.png" alt="Ryonan Logo" className="h-20 w-20 object-contain" />
              <div className="flex flex-col items-center">
                <p className="text-lg font-bold uppercase text-center">RYONAN ELECTRIC PHILIPPINES CORPORATION</p>
                <p className="text-[10px] font-normal text-[var(--color-text-muted)] text-center">
                  105 East Main Avenue, Special Export Processing Zone
                  Laguna, Technopark, Binan, Laguna
                </p>
              </div>
            </div>

            {/* ── Employee info ── */}
            <div className="grid grid-cols-2 gap-x-6 mb-4 text-xs pt-3">
              <div>
                <p className="text-[var(--color-text-muted)] text-[10px]">ID Number:</p>
                <p className="font-medium">{user.idnumber}</p>
              </div>
              <div>
                <p className="text-[var(--color-text-muted)] text-[10px]">Period Covered:</p>
                <p className="font-medium">{fmtOJTPeriod(payslip.period_start, payslip.period_end)}</p>
              </div>
              <div className="mt-2">
                <p className="text-[var(--color-text-muted)] text-[10px]">Employee Name:</p>
                <p className="font-medium">{fullName}</p>
              </div>
              <div className="mt-2">
                <p className="text-[var(--color-text-muted)] text-[10px]">Line:</p>
                <p className="font-medium">{lineName || '—'}</p>
              </div>
            </div>

            {/* ── Two-column tables ── */}
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <table className="w-full border border-[var(--color-border)] border-collapse">
                <thead>
                  <tr><th colSpan={2} className="text-center py-1.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs font-bold">Regular Day</th></tr>
                </thead>
                <tbody>
                  {([
                    ['REGULAR # of Days Work', n(payslip.regular_day)],
                    ['ALLOWANCE/DAY',           n(payslip.allowance_day)],
                    ['Total:',                  n(payslip.total_allowance)],
                    ['REG ND ALLOWANCE',        n(payslip.nd_allowance)],
                    ['GRAND TOTAL',             n(payslip.grand_total)],
                    ['BASIC ALLOW.SCHOOL SHARE',n(payslip.basic_school_share)],
                    ['BASIC ALLOW. OJT SHARE',  n(payslip.basic_ojt_share)],
                    ['DEDUCTION',               n(payslip.deduction)],
                    ['NET BASIC ALLOW. OJT SHARE', n(payslip.net_ojt_share)],
                  ] as [string, string][]).map(([label, val], i) => (
                    <tr key={i} className={i === 2 || i === 8 ? 'font-semibold' : ''}>
                      <td className="border border-[var(--color-border)] px-2 py-0.5 text-blue-500 text-[10px]">{label}</td>
                      <td className="border border-[var(--color-border)] px-2 py-0.5 text-right">{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <table className="w-full border border-[var(--color-border)] border-collapse">
                <thead>
                  <tr><th colSpan={2} className="text-center py-1.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] text-xs font-bold">Allowances</th></tr>
                </thead>
                <tbody>
                  {([
                    ['RICE ALLOWANCE',          n(payslip.rice_allowance)],
                    ['Reg OT ALLOWANCE',         n(payslip.ot_allowance)],
                    ['REG ND OT ALLOWANCE',      n(payslip.nd_ot_allowance)],
                    ['SPECIAL HOLIDAY',          n(payslip.special_holiday)],
                    ['LEGAL HOLIDAY',            n(payslip.legal_holiday)],
                    ['SAT-OFF ALLOWANCE',        n(payslip.satoff_allowance)],
                    ['RD OT',                    n(payslip.rd_ot)],
                    ['PERFECT ATTENDANCE',       n(payslip.perfect_attendance)],
                    ['ADJUSTMENT',               n(payslip.adjustment)],
                    ['DEDUCTION 2',              n(payslip.deduction_2)],
                    ['NET OJT OT PAY ALLOWANCE', n(payslip.ot_pay_allowance)],
                  ] as [string, string][]).map(([label, val], i) => (
                    <tr key={i} className={i === 10 ? 'font-semibold' : ''}>
                      <td className="border border-[var(--color-border)] px-2 py-0.5 text-blue-500 text-[10px]">{label}</td>
                      <td className="border border-[var(--color-border)] px-2 py-0.5 text-right">{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Total ── */}
            <div className="mt-3 border border-[var(--color-border)] rounded py-2.5 px-4 text-center">
              <p className="text-sm font-bold tracking-wide">
                TOTAL ALLOWANCE: <span className="text-blue-500">₱{n(payslip.total_allow)}</span>
              </p>
            </div>

          </div>
        </div>
      </motion.div>
    </motion.div>
  , document.body);
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
    <div className="relative overflow-hidden rounded-lg border border-[var(--color-border)] p-4 flex items-center justify-between gap-3 bg-[var(--color-bg-elevated)]">
      <div className="pointer-events-none absolute -right-5 -bottom-8 opacity-15">
        <span style={{ color: iconColor }}><Icon size={120} /></span>
      </div>
      <div className="relative z-10 flex-1 min-w-0">
        {loading ? (
          <div className="h-8 w-24 rounded-md bg-white/20 animate-pulse" />
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
                  className="text-xl font-bold text-[var(--color-text-muted)] tracking-wide select-none"
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
          <p className="text-[12px] text-[var(--color-text-muted)]">{label}</p>
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
      {/* <div className="relative z-10 shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border border-white/25 bg-white/10">
        <div style={{ color: iconColor }}><Icon size={18} /></div>
      </div> */}
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
          <div className="flex items-center gap-1.5 shrink-0">
            {!loan.seen && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#2845D6]/10 text-[#2845D6]">
                New
              </span>
            )}
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={isActive
                ? { backgroundColor: hexToRgba('#10B981', 0.12), color: '#10B981' }
                : { backgroundColor: hexToRgba('#EF4444', 0.12), color: '#EF4444' }}
            >
              {isActive ? 'Active' : 'Paid Off'}
            </span>
          </div>
        </div>

        {/* Balance */}
        <div>
          <p className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Balance</p>
          <p className="text-base font-bold text-[var(--color-text-primary)] mt-0.5 leading-none">₱{fmtCurrency(loan.current_balance)}</p>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1">
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
          className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold transition-all group-hover:gap-2"
          style={{ color: color.hex }}
        >
          <Eye size={12} />
          <span>View History</span>
        </button>
      </div>
    </motion.div>
  );
}


// ── Loan History Modal ────────────────────────────────────────────────────────

function LoanHistoryModal({
  loan,
  detail,
  loadingDeducts,
  loanSettings,
  onClose,
}: {
  loan:          LoanRecord;
  detail:        DeductionDetail | null;
  loadingDeducts: boolean;
  loanSettings:  LoanSettingsConfig | null;
  onClose:       () => void;
}) {
  const principal  = parseFloat(loan.principal_amount) || 0;
  const balance    = parseFloat(loan.current_balance)  || 0;
  const deductAmt  = loan.monthly_deduction ? parseFloat(loan.monthly_deduction) : null;
  const paidAmt    = Math.max(0, principal - balance);
  const pctPaid    = principal > 0 ? Math.min(100, Math.round((paidAmt / principal) * 100)) : 0;
  const isActive   = balance > 0;
  const freq       = loanSettings?.deduction_frequency ?? 'monthly';
  const completion = estimatedCompletion(balance, deductAmt, freq);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
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
                {loan.loan_type_name}
              </h3>
              <StatusPill className='text-[9px]' status={isActive ? 'approved' : 'disapproved'} label={isActive ? 'Approved' : 'Closed'} />
            </div>
            {loan.reference_number && (
              <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                Ref: {loan.reference_number}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]">
          {/* Repayment Progress */}
          <div className="px-5 pt-4 pb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Repayment Progress
              </p>
              <span className="text-xs font-bold text-[#2845D6]">{pctPaid}% repaid</span>
            </div>
            <div className="relative h-4 w-full rounded-full" style={{ background: 'var(--color-border)' }}>
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: `${pctPaid}%` }}
                transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ background: 'linear-gradient(90deg, #1a35c5 0%, #2845D6 40%, #5B7FFF 100%)' }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-[var(--color-text-muted)]">
                Paid: ₱{fmtCurrency(paidAmt.toFixed(2))}
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                Remaining: ₱{fmtCurrency(loan.current_balance)}
              </span>
            </div>
          </div>

          {/* Loan Summary */}
          <div className="px-5 pt-3 pb-3 border-t border-[var(--color-border)]">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="pb-3">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">Principal Amount</p>
                <p className="text-xs font-bold text-[var(--color-text-primary)] mt-0.5">
                  ₱{fmtCurrency(loan.principal_amount)}
                </p>
              </div>
              <div className="pb-3">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">Outstanding Balance</p>
                <p className={cn('text-xs font-bold mt-0.5', isActive ? 'text-amber-500' : 'text-emerald-500')}>
                  ₱{fmtCurrency(loan.current_balance)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">Deduction Frequency</p>
                <p className="text-xs font-medium text-[var(--color-text-primary)] mt-0.5">
                  {loanSettings ? freqLabel(freq) : (
                    <span className="inline-block h-3 w-24 rounded bg-[var(--color-border)] animate-pulse" />
                  )}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">Per-Period Deduction</p>
                <p className="text-xs font-medium text-[var(--color-text-primary)] mt-0.5">
                  {deductAmt ? `₱${fmtCurrency(loan.monthly_deduction!)}` : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Estimated Completion */}
          {isActive && (
            <div className="px-5 py-3 border-t border-[var(--color-border)]">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
                Estimated Completion
              </p>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                {loanSettings ? completion : (
                  <span className="inline-block h-4 w-28 rounded bg-[var(--color-border)] animate-pulse" />
                )}
              </p>
              {loanSettings && completion !== '—' && (
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  Based on {freqLabel(freq)} deductions of ₱{fmtCurrency(loan.monthly_deduction ?? '0')}
                </p>
              )}
            </div>
          )}

          {/* Deduction History */}
          <div className="border-t border-[var(--color-border)]">
            <p className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
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
            ) : !detail || detail.deductions.length === 0 ? (
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
                    <TableHead className="text-[10px] uppercase tracking-wide">Cut-off Date</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wide">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.deductions.map(d => (
                    <TableRow key={d.id}>
                      <TableCell>{d.cutoff_date ? fmtDateShort(d.cutoff_date) : '—'}</TableCell>
                      <TableCell className="text-right font-medium">₱{fmtCurrency(d.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="text-[12px] font-normal text-[var(--color-text-muted)]">Total Deductions</TableCell>
                    <TableCell className="text-right text-xs font-bold text-[var(--color-text-primary)]">
                      ₱{fmtCurrency(
                        detail.deductions.reduce((sum, d) => sum + parseFloat(d.amount), 0).toFixed(2),
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
            onClick={onClose}
            className="h-8 px-4 py-2 rounded-lg text-xs font-normal border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  , document.body);
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
  const [workEmail, setWorkEmail] = useState('');
  const [userLineName, setUserLineName] = useState('');
  const authTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    authTimerRef.current = setTimeout(() => setAuthPhase('checking'), 350);

    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: UserData | null) => {
        if (authTimerRef.current) clearTimeout(authTimerRef.current);
        if (!data) { router.replace('/'); return; }
        if (data.accounting) { router.replace('/dashboard/finance/admin'); return; }
        setUser(data);
        fetch('/api/user-profile/me', { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : null))
          .then((profile: { personal_info?: { work_email?: string }; work_info?: { line_name?: string | null } } | null) => {
            setWorkEmail((profile?.personal_info?.work_email ?? '').trim());
            setUserLineName((profile?.work_info?.line_name ?? '').trim());
          })
          .catch(() => { setWorkEmail(''); setUserLineName(''); });
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
      .then(([recs, ls]) => {
        setRecords(recs);
        setLoanSettings(ls);
        window.dispatchEvent(new Event('finance-badge-refresh'));
      })
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

  // ── OJT payslip view/send ─────────────────────────────────────────────────
  const [viewOJTPayslip,    setViewOJTPayslip   ] = useState<OJTPayslipRecord | null>(null);
  const [sendOJTPayslip,    setSendOJTPayslip   ] = useState<OJTPayslipRecord | null>(null);
  const [sendingOJTEmail,   setSendingOJTEmail  ] = useState(false);
  const [sendOJTChoice,     setSendOJTChoice    ] = useState<'personal' | 'work' | ''>('');

  async function handleSendOJTPayslipEmail() {
    if (!sendOJTPayslip || !sendOJTSelectedRecipient) return;
    setSendingOJTEmail(true);
    try {
      const [res] = await Promise.all([
        fetch(`/api/finance/my/ojt-payslips/${sendOJTPayslip.id}/send-email`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
          body: JSON.stringify({ recipient_email: sendOJTSelectedRecipient }),
        }),
        new Promise<void>(r => setTimeout(r, 1000)),
      ]);
      if ((res as Response).ok) {
        toast.success('Your payslip sent to your selected email successfully.');
        const id = sendOJTPayslip.id;
        setRecords(prev => prev ? {
          ...prev,
          ojt_payslips: prev.ojt_payslips.map(o => o.id === id ? { ...o, sent: true } : o),
        } : prev);
        setSendOJTPayslip(null);
        setSendOJTChoice('');
        window.dispatchEvent(new Event('finance-badge-refresh'));
      } else {
        const err = await (res as Response).json().catch(() => ({})) as { detail?: string };
        toast.error(err.detail ?? 'Failed to send email.');
      }
    } finally {
      setSendingOJTEmail(false);
    }
  }

  // ── Send payslip email ────────────────────────────────────────────────────
  const [sendPayslip,  setSendPayslip ] = useState<PayslipRecord | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendChoice,   setSendChoice  ] = useState<'personal' | 'work' | ''>('');

  const personalEmail = (user?.email ?? '').trim();
  const workEmailValue = workEmail.trim();

  const selectedRecipient = (() => {
    if (sendChoice === 'personal') return personalEmail.toLowerCase();
    if (sendChoice === 'work') return workEmailValue.toLowerCase();
    return '';
  })();

  const sendOJTSelectedRecipient = (() => {
    if (sendOJTChoice === 'personal') return personalEmail.toLowerCase();
    if (sendOJTChoice === 'work') return workEmailValue.toLowerCase();
    return '';
  })();

  function handleRecipientChoiceChange(value: string) {
    setSendChoice(value as 'personal' | 'work' | '');
  }

  async function handleSendPayslipEmail() {
    if (!sendPayslip || !selectedRecipient) return;
    setSendingEmail(true);
    try {
      const [res] = await Promise.all([
        fetch(`/api/finance/my/payslips/${sendPayslip.id}/send-email`, {
          method: 'POST', credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken(),
          },
          body: JSON.stringify({ recipient_email: selectedRecipient }),
        }),
        new Promise<void>(r => setTimeout(r, 1000)),
      ]);
      if ((res as Response).ok) {
        toast.success('Payslip sent to your selected email successfully.');
        const id = sendPayslip.id;
        setRecords(prev => prev ? {
          ...prev,
          payslips: prev.payslips.map(p => p.id === id ? { ...p, sent: true } : p),
        } : prev);
        setSendPayslip(null);
        setSendChoice('');
        window.dispatchEvent(new Event('finance-badge-refresh'));
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
  const loans         = records?.loans        ?? [];
  const allowances    = records?.allowances   ?? [];
  const savings       = records?.savings      ?? [];
  const payslips      = records?.payslips     ?? [];
  const ojtPayslips   = records?.ojt_payslips ?? [];

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
    <div className="w-full p-4 sm:p-6 space-y-4">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="pb-2">
        <h1 className="text-lg font-bold text-[var(--color-text-primary)]">My Finance</h1>
        <p className="text-xs text-[var(--color-text-muted)]">
          Track your payslips, allowances, savings, and loans.
        </p>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Payslips"
          value={String(payslips.length + ojtPayslips.length)}
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
        <div className="flex flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] md:h-[500px]" style={{ minHeight: '200px', maxHeight: '500px', overflow: 'hidden' }}>
          {/* Card header */}
          <div className="flex items-center p-4 border-b border-[var(--color-border)] shrink-0">
            <div className="space-y-0.5">
              <p className="text-md font-semibold text-[var(--color-text-primary)] leading-none">My Payslips</p>
              <p className="text-[11px] text-[var(--color-text-muted)]">Your salary statements</p>
            </div>
          </div>

          {payslips.length === 0 && ojtPayslips.length === 0 ? (
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
                    key={`reg-${p.id}`}
                    initial={{ opacity: 0, y: 16, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8, delay: i * 0.07 }}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div className="w-7 h-7 rounded-lg shrink-0 flex items-start justify-center">
                      <FileText size={20} style={{ color: '#8B5CF6' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                        {fmtDateFull(p.period_start)}
                      </p>
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate">
                        {p.file_name ?? `${p.payslip_type_name} • ${fmtDateShort(p.period_start)} – ${fmtDateShort(p.period_end)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusPill className='text-[9px]' status={p.sent ? 'sent' : 'for_sending'} label={p.sent ? 'Sent' : 'For Sending'} />
                      {hasFile && (
                        <button
                          onClick={() => { setSendPayslip(p); setSendChoice(''); }}
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
              {ojtPayslips.map((o, i) => (
                <motion.li
                  key={`ojt-${o.id}`}
                  initial={{ opacity: 0, y: 16, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8, delay: (payslips.length + i) * 0.07 }}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div className="w-7 h-7 rounded-lg shrink-0 flex items-start justify-center">
                    <FileText size={20} style={{ color: '#8B5CF6' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                      Payslip
                    </p>
                    <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate">
                      {o.period_start && o.period_end
                        ? `${fmtDateShort(o.period_start)} – ${fmtDateShort(o.period_end)}`
                        : '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <StatusPill className='text-[9px]' status={o.sent ? 'sent' : 'for_sending'} label={o.sent ? 'Sent' : 'For Sending'} />
                    <button
                      onClick={() => setViewOJTPayslip(o)}
                      title="View OJT Payslip"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
                    >
                      <Eye size={12} />
                    </button>
                    <button
                      onClick={() => { setSendOJTPayslip(o); setSendOJTChoice(''); }}
                      title="Send to Email"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
                    >
                      <Mail size={12} />
                    </button>
                  </div>
                </motion.li>
              ))}
            </ScrollList>
          )}
        </div>

        {/* ── Benefits (Allowances) ─────────────────────────────────────── */}
        <div className="flex flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]  md:h-[500px]" style={{ minHeight: '200px', maxHeight: '500px', overflow: 'hidden' }}>
          <div className="flex items-center p-4 border-b border-[var(--color-border)] shrink-0">
            <div className="space-y-0.5">
              <p className="text-md font-semibold text-[var(--color-text-secondary)] leading-none">My Benefits</p>
              <p className="text-[11px] text-[var(--color-text-muted)]">Allowances, Benefits, and Bonuses</p>
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
                  <p className="shrink-0 text-xs font-bold" style={{ color: '#F59E0B' }}>
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
        <div className="flex flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]  md:h-[500px]" style={{ minHeight: '200px', maxHeight: '500px', overflow: 'hidden' }}>
          <div className="flex items-center p-4 border-b border-[var(--color-border)] shrink-0">
            <div className="space-y-0.5">
              <p className="text-md font-semibold text-[var(--color-text-secondary)] leading-none">My Savings</p>
              <p className="text-[11px] text-[var(--color-text-muted)]">Your financial growth</p>
            </div>
          </div>

          {savings.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                title="No Savings"
                description="Start saving to see your progress"
                icons={[PiggyBank, Wallet, DollarSign]}
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
                      
                    </div>
                    <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{fmtMonthYear(sv.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill className='text-[9px]' status={sv.withdraw ? 'disapproved' : 'approved'} label={sv.withdraw ? 'Withdraw' : 'Active'} />
                    <p
                      className="shrink-0 text-xs font-bold"
                      style={{ color: sv.withdraw ? '#EF4444' : '#10B981' }}
                    >
                      ₱{fmtCurrency(sv.amount)}
                    </p>
                    
                  </div>
                </motion.li>
              ))}
            </ScrollList>
          )}
        </div>
      </div>

      {/* ── Loans section ────────────────────────────────────────────────── */}
      <div className="relative rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]  min-h-[200px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-h-[760px] sm:max-h-[520px] lg:max-h-[570px]">

        {/* Section header — sticky, paints above cards during scroll */}
        <div className="sticky top-0 z-10 bg-[var(--color-bg-elevated)] flex items-center justify-between gap-3 px-4 pt-4 pb-3 border-b border-[var(--color-border)]">
          <div className="space-y-0.5">
            <p className="text-md font-semibold text-[var(--color-text-primary)] leading-none">My Loans</p>
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
                      className="absolute inset-0 rounded-lg bg-[var(--color-bg-elevated)] "
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
        {viewLoan && (
          <LoanHistoryModal
            key="loan-history"
            loan={viewLoan}
            detail={loanDetail}
            loadingDeducts={loadingDeducts}
            loanSettings={loanSettings}
            onClose={() => setViewLoan(null)}
          />
        )}
      </AnimatePresence>

      {/* ── OJT payslip view modal ───────────────────────────────────────── */}
      <AnimatePresence>
        {viewOJTPayslip && user && (
          <OJTPayslipViewModal
            payslip={viewOJTPayslip}
            user={user}
            lineName={userLineName}
            onClose={() => setViewOJTPayslip(null)}
          />
        )}
      </AnimatePresence>

      {/* ── OJT payslip send email modal ─────────────────────────────────── */}
      <AnimatePresence>
        {sendOJTPayslip && (
          <Modal
            open
            onOpenChange={(open) => {
              if (!open && !sendingOJTEmail) {
                setSendOJTPayslip(null);
                setSendOJTChoice('');
              }
            }}
          >
            <ModalContent className="max-w-sm">
              <ModalHeader>
                <ModalTitle>Select recipient email</ModalTitle>
              </ModalHeader>
              <ModalBody className="space-y-4">
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  Your OJT payslip for{' '}
                  {sendOJTPayslip.period_start && sendOJTPayslip.period_end
                    ? `${fmtDateFull(sendOJTPayslip.period_start)} – ${fmtDateFull(sendOJTPayslip.period_end)}`
                    : 'this period'}{' '}
                  will be sent as a PDF attachment.
                </p>
                <ChoiceboxGroup
                  direction="column"
                  type="radio"
                  value={sendOJTChoice}
                  onChange={(v: string) => setSendOJTChoice(v as 'personal' | 'work' | '')}
                >
                  <ChoiceboxGroup.Item
                    value="personal"
                    title="Personal Email"
                    description={personalEmail || 'No personal email on file'}
                    disabled={!personalEmail}
                  />
                  <ChoiceboxGroup.Item
                    value="work"
                    title="Work Email"
                    description={workEmailValue || 'No work email on file'}
                    disabled={!workEmailValue}
                  />
                </ChoiceboxGroup>
              </ModalBody>
              <ModalFooter className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { if (!sendingOJTEmail) { setSendOJTPayslip(null); setSendOJTChoice(''); } }}
                  disabled={sendingOJTEmail}
                  className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-xs font-normal text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSendOJTPayslipEmail()}
                  disabled={sendingOJTEmail || !sendOJTSelectedRecipient}
                  className="rounded-lg bg-[#2845D6] px-4 py-2 text-xs font-normal text-white hover:bg-[#1f35b0] transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  {sendingOJTEmail ? (
                    <TextShimmer className="text-xs" duration={1.2}>Sending Email...</TextShimmer>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <Mail size={14} />
                      Send Email
                    </span>
                  )}
                </button>
              </ModalFooter>
            </ModalContent>
          </Modal>
        )}
      </AnimatePresence>

      {/* ── Send payslip email modal ──────────────────────────────────────── */}
      <AnimatePresence>
        {sendPayslip && (
          <Modal
            open
            onOpenChange={(open) => {
              if (!open && !sendingEmail) {
                setSendPayslip(null);
                setSendChoice('');
              }
            }}
          >
            <ModalContent className="max-w-sm">
              <ModalHeader>
                <ModalTitle>Select recipient email</ModalTitle>
              </ModalHeader>
              <ModalBody className="space-y-4">
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  Your payslip for {fmtDateFull(sendPayslip.period_start)} - {fmtDateFull(sendPayslip.period_end)} will be sent as a PDF attachment.
                </p>
                <ChoiceboxGroup
                  direction="column"
                  type="radio"
                  value={sendChoice}
                  onChange={handleRecipientChoiceChange}
                >
                  <ChoiceboxGroup.Item
                    value="personal"
                    title="Personal Email"
                    description={personalEmail || 'No personal email on file'}
                    disabled={!personalEmail}
                  />
                  <ChoiceboxGroup.Item
                    value="work"
                    title="Work Email"
                    description={workEmailValue || 'No work email on file'}
                    disabled={!workEmailValue}
                  />
                </ChoiceboxGroup>
              </ModalBody>
              <ModalFooter className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { if (!sendingEmail) { setSendPayslip(null); setSendChoice(''); } }}
                  disabled={sendingEmail}
                  className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-xs font-normal text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSendPayslipEmail()}
                  disabled={sendingEmail || !selectedRecipient}
                  className="rounded-lg bg-[#2845D6] px-4 py-2 text-xs font-normal text-white hover:bg-[#1f35b0] transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  {sendingEmail ? (
                    <TextShimmer className="text-xs" duration={1.2}>Sending Email...</TextShimmer>
                    ) : (
                    <span className="inline-flex items-center gap-2">
                      <Mail size={14} />
                      Send Email
                    </span>
                  )}
                </button>
              </ModalFooter>
            </ModalContent>
          </Modal>
        )}
      </AnimatePresence>

    </div>
  );
}

'use client';

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  CalendarClock,
  CheckCircle2,
  RotateCcw,
  Send,
  Star,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/hooks/use-media-query';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { EmptyState } from '@/components/ui/interactive-empty-state';
import { StatusPill } from '@/components/ui/status-pill';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { Timeline } from '@/components/ui/timeline';
import type { TimelineItem, TimelineStatus } from '@/components/ui/timeline';
import { toast } from '@/components/ui/toast';
import { getCsrfToken } from '@/lib/csrf';
import { cn } from '@/lib/utils';
import { useNavigationGuard } from '@/lib/navigation-guard-context';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Task {
  id: number;
  name: string;
  order: number;
}

interface ScoreData {
  id: number;
  task: number | null;
  task_name: string;
  period_label: string;
  score: string | null;
}

interface EvaluationPeriod {
  id: number;
  title: string;
  fiscal_year: number;
  start_date: string;
  end_date: string;
  status: 'active' | 'closed';
  frequency: string;
}

interface SupervisorEvalData {
  strengths_q1: string; strengths_q2: string; strengths_q3: string; strengths_q4: string;
  weaknesses_q1: string; weaknesses_q2: string; weaknesses_q3: string; weaknesses_q4: string;
  training_required_q1: string; training_required_q2: string; training_required_q3: string; training_required_q4: string;
  supervisor_comments_q1: string; supervisor_comments_q2: string; supervisor_comments_q3: string; supervisor_comments_q4: string;
  employee_comments_q1: string; employee_comments_q2: string; employee_comments_q3: string; employee_comments_q4: string;
  cost_consciousness_q1: number | null; cost_consciousness_q2: number | null; cost_consciousness_q3: number | null; cost_consciousness_q4: number | null;
  dependability_q1: number | null; dependability_q2: number | null; dependability_q3: number | null; dependability_q4: number | null;
  communication_q1: number | null; communication_q2: number | null; communication_q3: number | null; communication_q4: number | null;
  work_ethics_q1: number | null; work_ethics_q2: number | null; work_ethics_q3: number | null; work_ethics_q4: number | null;
  attendance_q1: number | null; attendance_q2: number | null; attendance_q3: number | null; attendance_q4: number | null;
  quality_comments?: Record<string, string>;
  supervisor_scores?: Record<string, string>;
  is_complete: boolean;
  submitted_at: string | null;
}

interface EvaluationEntry {
  id: number;
  status: string;
  submitted_at: string | null;
  scores: ScoreData[];
  approval_steps: {
    id: number;
    sequence: number;
    status: string;
    approver_name: string | null;
    final_action: string | null;
    final_remarks: string;
    acted_at?: string | null;
    activated_at?: string | null;
  }[];
  supervisor_evaluation: SupervisorEvalData | null;
}

interface MyEvaluationResponse {
  period: EvaluationPeriod;
  entry: EvaluationEntry;
  tasklist: Task[];
  period_labels: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type ScoreMap = Record<string, Record<string, string>>; // task_name → period_label → score

function buildScoreMap(scores: ScoreData[]): ScoreMap {
  const map: ScoreMap = {};
  for (const s of scores) {
    if (!map[s.task_name]) map[s.task_name] = {};
    map[s.task_name][s.period_label] = s.score ?? '';
  }
  return map;
}

function parseScore(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function formatScoreCellValue(v?: string): string {
  if (!v || v.trim() === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return Number.isInteger(n) ? String(n) : String(n).replace(/\.0+$/, '');
}

function computeGroupAverage(values: (string | undefined)[]): string {
  const nums = values.map(v => parseScore(v ?? '')).filter((n): n is number => n !== null);
  if (nums.length === 0) return '—';
  return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2);
}

function computeRowTotal(values: (string | undefined)[]): string {
  return computeGroupAverage(values);
}

function formatDate(s: string) {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
}

function formatDateFull(s: string) {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[m - 1]} ${d}, ${y}`;
}

function formatDateTime(s: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}

function computeFutureLabels(period: EvaluationPeriod, labels: string[]): Set<string> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const futureSet = new Set<string>();
  const periodStart = new Date(period.start_date);
  periodStart.setHours(0, 0, 0, 0);

  if (period.frequency === 'monthly') {
    // Disable the current month AND future months — user evaluates the previous month.
    const startOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    labels.forEach((label, idx) => {
      const labelStart = new Date(periodStart);
      labelStart.setMonth(labelStart.getMonth() + idx);
      if (labelStart >= startOfCurrentMonth) futureSet.add(label);
    });
  } else if (period.frequency === 'weekly') {
    // Disable the current week AND future weeks — user evaluates the previous week.
    labels.forEach((label, idx) => {
      const labelStart = new Date(periodStart);
      labelStart.setDate(labelStart.getDate() + idx * 7);
      const labelEnd = new Date(labelStart);
      labelEnd.setDate(labelEnd.getDate() + 7);
      // If the week has not fully ended before today, it is disabled.
      if (labelEnd > today) futureSet.add(label);
    });
  } else if (period.frequency === 'quarterly') {
    // Disable the current quarter AND future quarters — user evaluates the previous quarter.
    labels.forEach((label, idx) => {
      const labelStart = new Date(periodStart);
      labelStart.setMonth(labelStart.getMonth() + idx * 3);
      const labelEnd = new Date(labelStart);
      labelEnd.setMonth(labelEnd.getMonth() + 3);
      // If the quarter has not fully ended before today, it is disabled.
      if (labelEnd > today) futureSet.add(label);
    });
  }
  // yearly: never disabled (only one label)
  return futureSet;
}

/**
 * Return labels whose period has already fully passed (the column's month/week/quarter
 * ended before today). These cells are locked once scores exist for them.
 */
function computePastLabels(period: EvaluationPeriod, labels: string[]): Set<string> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const periodStart = new Date(period.start_date);
  periodStart.setHours(0, 0, 0, 0);
  const pastSet = new Set<string>();

  if (period.frequency === 'monthly') {
    labels.forEach((label, idx) => {
      const labelStart = new Date(periodStart);
      labelStart.setMonth(labelStart.getMonth() + idx);
      // The month is "past" once the next month has started.
      const nextMonth = new Date(labelStart);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      if (nextMonth <= today) pastSet.add(label);
    });
  } else if (period.frequency === 'weekly') {
    labels.forEach((label, idx) => {
      const labelStart = new Date(periodStart);
      labelStart.setDate(labelStart.getDate() + idx * 7);
      const labelEnd = new Date(labelStart);
      labelEnd.setDate(labelEnd.getDate() + 7);
      if (labelEnd <= today) pastSet.add(label);
    });
  } else if (period.frequency === 'quarterly') {
    labels.forEach((label, idx) => {
      const labelStart = new Date(periodStart);
      labelStart.setMonth(labelStart.getMonth() + idx * 3);
      const labelEnd = new Date(labelStart);
      labelEnd.setMonth(labelEnd.getMonth() + 3);
      if (labelEnd <= today) pastSet.add(label);
    });
  }
  // yearly: only one column, never considered "past" within its own period.
  return pastSet;
}

function isScoreValid(v: string | undefined): boolean {
  if (!v || v.trim() === '') return false;
  const n = Number(v);
  return !isNaN(n) && n >= 0 && n <= 5 && Number.isInteger(n);
}

function isScoreOutOfRange(v: string | undefined): boolean {
  if (!v || v.trim() === '') return false;
  const n = Number(v);
  return isNaN(n) || n < 0 || n > 5;
}

const STATUS_META: Record<string, { status: string; label: string }> = {
  pending:                { status: 'pending',   label: 'Pending' },
  supervisor_review:      { status: 'routing',   label: 'Supervisor Review' },
  user_confirmation:      { status: 'pending',   label: 'For Confirmation' },
  final_approval:         { status: 'routing',   label: 'Final Approval' },
  second_final_approval:  { status: 'routing',   label: '2nd Final Approval' },
  returned:               { status: 'closed',    label: 'Returned' },
  completed:              { status: 'approved',  label: 'Completed' },
  disapproved:            { status: 'disapproved', label: 'Disapproved' },
};

// ── Column header structure per frequency ────────────────────────────────────

interface ColumnGroup {
  groupLabel: string | null;
  columns: string[];   // period_label values in order
  showGroupTotal: boolean;
}

function buildColumnGroups(frequency: string, labels: string[]): ColumnGroup[] {
  if (frequency === 'quarterly') {
    // Each quarter gets its own named group with a Total sub-column.
    const QUARTER_GROUP_LABELS = ['Q1', 'Q2', 'Q3', 'Q4'];
    return labels.map((label, i) => ({ groupLabel: QUARTER_GROUP_LABELS[i] ?? label, columns: [label], showGroupTotal: true }));
  }
  if (frequency === 'monthly') {
    // Group into Q1(May–Jul), Q2(Aug–Oct), Q3(Nov–Jan), Q4(Feb–Apr)
    const quarters = [
      { groupLabel: 'Q1 (May–Jul)', columns: labels.slice(0, 3) },
      { groupLabel: 'Q2 (Aug–Oct)', columns: labels.slice(3, 6) },
      { groupLabel: 'Q3 (Nov–Jan)', columns: labels.slice(6, 9) },
      { groupLabel: 'Q4 (Feb–Apr)', columns: labels.slice(9, 12) },
    ];
    return quarters.map(q => ({ ...q, showGroupTotal: true }));
  }
  if (frequency === 'weekly') {
    // Group by month label (every 4 weeks approximately)
    // labels are Wk1…Wk52; group in sets of 4
    const groups: ColumnGroup[] = [];
    const MONTH_NAMES = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];
    let wkIdx = 0;
    for (let m = 0; m < MONTH_NAMES.length && wkIdx < labels.length; m++) {
      const start = wkIdx;
      const end = Math.min(wkIdx + 4, labels.length);
      groups.push({ groupLabel: MONTH_NAMES[m], columns: labels.slice(start, end), showGroupTotal: true });
      wkIdx = end;
    }
    return groups;
  }
  if (frequency === 'yearly') {
    return [{ groupLabel: null, columns: labels, showGroupTotal: false }];
  }
  return [{ groupLabel: null, columns: labels, showGroupTotal: false }];
}

// ── ScoreTable ─────────────────────────────────────────────────────────────────

interface ScoreTableProps {
  tasks: Task[];
  scoreMap: ScoreMap;
  onChange: (taskName: string, label: string, value: string) => void;
  readOnly: boolean;
  groups: ColumnGroup[];
  frequency: string;
  period: EvaluationPeriod;
  futureLabels?: Set<string>;
  submitAttempted?: boolean;
  supervisorScores?: Record<string, string>; // task_name__period_label → score (from supervisor_evaluation.supervisor_scores)
}

function ScoreTable({ tasks, scoreMap, onChange, readOnly, groups, frequency, period, futureLabels, submitAttempted, supervisorScores }: ScoreTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const allLabels = groups.flatMap(g => g.columns);

  // Past labels — periods that have fully ended (eligible for supervisor score display)
  const pastLabels = useMemo(() => computePastLabels(period, allLabels), [period, allLabels]);

  // Whether supervisor submitted any scores at all
  const hasSupervisorScores = !!supervisorScores && Object.keys(supervisorScores).length > 0;

  // Per-group set: which group indices have at least one supervisor score (across any task)
  const groupSupScoresSet = useMemo((): Set<number> => {
    const set = new Set<number>();
    if (!supervisorScores) return set;
    groups.forEach((g, gi) => {
      outer: for (const task of tasks) {
        for (const col of g.columns) {
          const val = supervisorScores[`${task.name}__${col}`];
          if (val !== undefined && val !== '') { set.add(gi); break outer; }
        }
      }
    });
    return set;
  }, [supervisorScores, groups, tasks]);

  // Overall Evaluation column — only when ALL groups have supervisor scores
  const showOverallTotal = groups.length > 0 && groups.every((_, gi) => groupSupScoresSet.has(gi));

  const hasGroupLabels = groups.some(g => g.groupLabel);

  // Colspan per group: dual Self/Supervisor cols for past periods in groups with supervisor data + conditional Total col
  function groupColSpan(g: ColumnGroup, gi: number): number {
    const groupHasSupervisor = groupSupScoresSet.has(gi);
    const dataCols = g.columns.reduce((acc, col) => {
      return acc + (groupHasSupervisor && pastLabels.has(col) ? 2 : 1);
    }, 0);
    return dataCols + (g.showGroupTotal && groupHasSupervisor ? 1 : 0);
  }

  // Supervisor avg for a group's columns for one task (Total column value)
  function getGroupSupAvg(g: ColumnGroup, taskName: string): string {
    if (!supervisorScores) return '—';
    const nums = g.columns
      .map(col => parseFloat(supervisorScores[`${taskName}__${col}`] ?? ''))
      .filter(n => !isNaN(n));
    if (!nums.length) return '—';
    return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2);
  }

  // Supervisor avg across all periods for one task (Overall Evaluation column value)
  function getOverallSupAvg(taskName: string): string {
    if (!supervisorScores) return '—';
    const nums = allLabels
      .map(col => parseFloat(supervisorScores[`${taskName}__${col}`] ?? ''))
      .filter(n => !isNaN(n));
    if (!nums.length) return '—';
    return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2);
  }

  function focusNextInputBelow(currentTaskIndex: number, columnLabel: string) {
    if (!scrollRef.current) return;
    for (let nextTaskIndex = currentTaskIndex + 1; nextTaskIndex < tasks.length; nextTaskIndex += 1) {
      const nextInput = scrollRef.current.querySelector<HTMLInputElement>(
        `input[data-score-input="true"][data-task-index="${nextTaskIndex}"][data-label="${columnLabel}"]`,
      );
      if (nextInput && !nextInput.disabled) {
        nextInput.focus();
        nextInput.select();
        break;
      }
    }
  }

  // Auto-scroll to the current (last non-future) period column on mount
  useEffect(() => {
    if (!scrollRef.current) return;
    const nonFuture = allLabels.filter(l => !futureLabels?.has(l));
    const currentLabel = nonFuture[nonFuture.length - 1];
    if (!currentLabel) return;
    const el = scrollRef.current.querySelector(`[data-label="${currentLabel}"]`);
    if (el) (el as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'start' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (tasks.length === 0) {
    return (
      <EmptyState
        title="No tasklists assigned yet"
        description="Your self-evaluation will be available once HR assigns your tasklists."
        icons={[ClipboardList, CalendarClock, BarChart3]}
        className="py-10"
      />
    );
  }

  const thBase = 'bg-[var(--color-bg)] border-b border-r border-[var(--color-border)] px-2 py-2 text-center whitespace-nowrap';

  return (
    <div
      ref={scrollRef}
      className={cn(
        'rounded-md border border-[var(--color-border)] overflow-x-auto shadow-md',
        '[scrollbar-width:thin]',
        '[scrollbar-color:transparent_transparent]',
        'hover:[scrollbar-color:#2845D640_transparent]',
        '[&::-webkit-scrollbar]:h-[5px]',
        '[&::-webkit-scrollbar-track]:bg-transparent',
        '[&::-webkit-scrollbar-thumb]:rounded-full',
        '[&::-webkit-scrollbar-thumb]:bg-transparent',
        'hover:[&::-webkit-scrollbar-thumb]:bg-[#2845D6]/40',
      )}
    >
      <table className="text-xs border-separate border-spacing-0 shadow-md" style={{ minWidth: 'max-content', width: '100%' }}>
        <thead>
          {/* ── Row 1: Group headers (monthly quarters / quarterly Q1–Q4) ── */}
          {hasGroupLabels && (
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-20 w-[300px] lg:w-auto bg-[var(--color-bg)] border-b border-r border-[var(--color-border)] px-3 py-2 text-left font-semibold text-[var(--color-text-secondary)] align-middle"
                style={{ minWidth: 160, maxWidth: 600 }}
              >
                Tasklist
              </th>
              {groups.map((g, gi) => (
                <th
                  key={gi}
                  colSpan={groupColSpan(g, gi)}
                  className={thBase + ' font-semibold text-[var(--color-text-secondary)]'}
                >
                  {g.groupLabel}
                </th>
              ))}
              {showOverallTotal && (
                <th rowSpan={2} className="bg-[var(--color-bg)] border-b border-[var(--color-border)] px-2 py-2 text-center font-bold text-[var(--color-text-primary)] align-middle whitespace-nowrap min-w-[80px]">
                  Overall<br />Evaluation
                </th>
              )}
            </tr>
          )}

          {/* ── Row 2: Sub-column headers (period label + Self/Supervisor) ── */}
          <tr>
            {!hasGroupLabels && (
              <th
                className="sticky left-0 z-20 bg-[var(--color-bg)] border-b border-r border-[var(--color-border)] px-3 py-2 text-left font-semibold text-[var(--color-text-secondary)]"
                style={{ minWidth: 160, maxWidth: 600 }}
              >
                Tasklist
              </th>
            )}
            {groups.flatMap((g, gi) => {
              const groupHasSupervisor = groupSupScoresSet.has(gi);
              return [
                ...g.columns.flatMap(col => {
                  const isPast = pastLabels.has(col);
                  if (isPast && groupHasSupervisor) {
                    return [
                      <th key={`${col}-self`} className={thBase + ' min-w-[56px]'}>
                        {/* <div className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide opacity-60">{col}</div> */}
                        <div className="text-[10px] font-medium text-[var(--color-text-muted)]">Self</div>
                      </th>,
                      <th key={`${col}-sup`} className={thBase + ' min-w-[56px]'}>
                        {/* <div className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide opacity-60">{col}</div> */}
                        <div className="text-[10px] font-medium text-[#2845D6]">Supervisor</div>
                      </th>,
                    ];
                  }
                  if (isPast) {
                    return [
                      <th key={`${col}-self`} className={thBase + ' min-w-[56px]'}>
                        {/* <div className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide opacity-60">{col}</div> */}
                        <div className="text-[10px] font-medium text-[var(--color-text-muted)]">Self</div>
                      </th>,
                    ];
                  }
                  return [
                    <th key={`${col}-self`} data-label={col} className={thBase + ' font-medium text-[var(--color-text-muted)] min-w-[56px]'}>
                      <div className="text-[10px] font-medium text-[var(--color-text-muted)]">Self</div>
                    </th>,
                  ];
                }),
                ...(g.showGroupTotal && groupHasSupervisor ? [
                  <th key={`gt-${gi}`} className={thBase + ' font-semibold text-[var(--color-text-secondary)] min-w-[60px]'}>
                    Total
                  </th>,
                ] : []),
              ];
            })}
            {/* Overall Evaluation — only when no group row (yearly) */}
            {!hasGroupLabels && showOverallTotal && (
              <th className="bg-[var(--color-bg)] border-b border-[var(--color-border)] px-2 py-2 text-center font-bold text-[var(--color-text-primary)] whitespace-nowrap">
                Overall Evaluation
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {tasks.map((task, taskIndex) => {
            const taskScores = scoreMap[task.name] ?? {};
            const isLastRow = taskIndex === tasks.length - 1;
            return (
              <tr key={task.id}>
                <td
                  className={cn(
                    'sticky left-0 z-20 p-3 font-normal border-r border-[var(--color-border)] text-[var(--color-text-primary)] bg-[var(--color-bg-elevated)]',
                    !isLastRow ? 'border-b' : '',
                  )}
                  style={{ minWidth: 160, maxWidth: 600 }}
                >
                  {task.name}
                </td>

                {groups.flatMap((g, gi) => [
                  ...g.columns.flatMap(label => {
                    const isPast = pastLabels.has(label);
                    const isFuture = futureLabels?.has(label);
                    const selfVal = taskScores[label];
                    const supKey = `${task.name}__${label}`;
                    const supVal = supervisorScores?.[supKey];

                    if (hasSupervisorScores && isPast) {
                      // Dual: Self (read-only) + Supervisor (read-only from API)
                      return [
                        <td key={`${label}-self`} className={cn('border-r border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-2 text-center', !isLastRow && 'border-b')}>
                          <span className="text-xs text-[var(--color-text-muted)]">{formatScoreCellValue(selfVal)}</span>
                        </td>,
                        <td key={`${label}-sup`} className={cn('border-r border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-2 text-center', !isLastRow && 'border-b')}>
                          <span className="text-xs text-[var(--color-text-primary)]">{formatScoreCellValue(supVal)}</span>
                        </td>,
                      ];
                    }

                    // Single column (self input or read-only)
                    return [
                      <td key={label} className={cn('border-r border-[var(--color-border)] p-1 text-center bg-[var(--color-bg-elevated)]', !isLastRow && 'border-b')}>
                        {readOnly ? (
                          <span className="text-xs text-[var(--color-text-muted)]">{formatScoreCellValue(selfVal)}</span>
                        ) : isFuture ? null : (
                          <input
                            data-score-input="true"
                            data-task-index={taskIndex}
                            data-label={label}
                            type="number"
                            step="1"
                            min="0"
                            max="5"
                            value={selfVal ?? ''}
                            onChange={e => {
                              const raw = e.target.value;
                              if (raw === '') { onChange(task.name, label, ''); return; }
                              if (!/^[0-9]+$/.test(raw)) return;
                              const n = parseInt(raw, 10);
                              if (n < 0 || n > 5) return;
                              onChange(task.name, label, String(n));
                            }}
                            onKeyDown={e => {
                              if (e.key !== 'Enter') return;
                              e.preventDefault();
                              focusNextInputBelow(taskIndex, label);
                            }}
                            placeholder="—"
                            className={cn(
                              'rounded-sm border p-2 text-center w-full text-xs focus:outline-none focus:ring-1 focus:ring-[#CFECF3] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                              isScoreOutOfRange(selfVal)
                                ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20 focus:ring-orange-400'
                                : (submitAttempted && !isScoreValid(selfVal))
                                  ? 'border-red-500 bg-red-50 dark:bg-red-950/20 focus:ring-red-500'
                                  : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] focus:ring-[#2845D6]',
                            )}
                          />
                        )}
                      </td>,
                    ];
                  }),
                  ...(g.showGroupTotal && groupSupScoresSet.has(gi) ? [
                    <td key={`gt-${gi}`} className={cn('border-r border-[var(--color-border)] px-2 py-2 text-center bg-[var(--color-bg)]', !isLastRow && 'border-b')}>
                      <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
                        {getGroupSupAvg(g, task.name)}
                      </span>
                    </td>,
                  ] : []),
                ])}

                {showOverallTotal && (
                  <td className={cn('px-2 py-2 text-center bg-[var(--color-bg)]', !isLastRow && 'border-b border-[var(--color-border)]')}>
                    <span className="text-xs font-bold text-[var(--color-text-primary)]">{getOverallSupAvg(task.name)}</span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Supervisor evaluation constants for single-instance read-only display ─────

const SELF_EVAL_QUARTERS = ['q1', 'q2', 'q3', 'q4'] as const;

const SE_TEXT_FIELDS = [
  { key: 'strengths',           label: 'Strengths' },
  { key: 'weaknesses',          label: 'Weaknesses' },
  { key: 'training_required',   label: 'Training Required' },
  { key: 'supervisor_comments', label: "Superior's Assessment" },
  { key: 'employee_comments',   label: 'Employee Comments' },
] as const;

const SE_RATING_FIELDS = [
  { key: 'cost_consciousness', label: 'Cost Consciousness' },
  { key: 'dependability',      label: 'Dependability' },
  { key: 'communication',      label: 'Communication' },
  { key: 'work_ethics',        label: 'Work Ethics' },
  { key: 'attendance',         label: 'Attendance' },
] as const;

// ── SupervisorEvalReadOnly (single-instance, no quarterly segmentation) ───────

function SupervisorEvalReadOnly({ ev, timeline }: { ev: SupervisorEvalData; timeline?: SelfEvalTimelineEntry[] }) {
  function getLatestText(field: string): string {
    for (const q of [...SELF_EVAL_QUARTERS].reverse()) {
      const value = (ev as unknown as Record<string, string>)[`${field}_${q}`] ?? '';
      if (value.trim().length > 0) return value;
    }
    return '';
  }
  function getLatestRating(field: string): number | null {
    for (const q of [...SELF_EVAL_QUARTERS].reverse()) {
      const value = (ev as unknown as Record<string, number | null>)[`${field}_${q}`];
      if (value !== null && value !== undefined) return value;
    }
    return null;
  }
  function getLatestComment(field: string): string {
    for (const q of [...SELF_EVAL_QUARTERS].reverse()) {
      const key = `${field}_${q}_comment`;
      const value = ev.quality_comments?.[key] ?? '';
      if (value.trim().length > 0) return value;
    }
    return '';
  }

  const evaluationValues = SE_TEXT_FIELDS.map(f => ({
    ...f,
    value: getLatestText(f.key),
  })).filter(item => item.value.trim().length > 0);

  const qualityItems = SE_RATING_FIELDS.map(f => ({
    ...f,
    rating: getLatestRating(f.key),
    comment: getLatestComment(f.key),
  })).filter(item => item.rating !== null || item.comment.trim().length > 0);

  return (
    <div className="space-y-6">
      <section className="space-y-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-px flex-1 bg-[var(--color-border)]" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">Performance Evaluation</p>
          <div className="h-px flex-1 bg-[var(--color-border)]" />
        </div>
        <div className="space-y-4 bg-[var(--color-bg-elevated)] py-4 pl-3">
          {evaluationValues.length ? evaluationValues.map(field => (
            <div key={field.key} className="space-y-2 pb-3">
              <p className="text-[12px] font-medium text-[var(--color-text-secondary)] uppercase">{field.label}</p>
              <p className="text-xs pl-4 text-[var(--color-text-muted)] leading-relaxed">{field.value}</p>
            </div>
          )) : (
            <p className="text-xs text-[var(--color-text-muted)]">No evaluation details available.</p>
          )}
        </div>
      </section>

      {qualityItems.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-[var(--color-border)]" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">Professional Qualities</p>
            <div className="h-px flex-1 bg-[var(--color-border)]" />
          </div>
          <div className="space-y-3">
            {qualityItems.map(item => (
              <div key={item.key} className="bg-[var(--color-bg-elevated)] py-2 pl-3">
                <div className="flex flex-col gap-2">
                  <p className="text-[12px] font-medium text-[var(--color-text-primary)] uppercase">{item.label}</p>
                  <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] pl-4">
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star key={i} size={14} className={cn(i < (item.rating ?? 0) ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300')} />
                      ))}
                    </div>
                    <span>{item.rating !== null ? `${item.rating}/5` : 'No rating'}</span>
                  </div>
                </div>
                {item.comment && (
                  <p className="mt-3 text-xs text-[var(--color-text-muted)] pl-4 leading-relaxed">Remarks: {item.comment}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {timeline && timeline.length > 0 && (
        <section className="space-y-6 pt-4">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-[var(--color-border)]" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">Approval History</p>
            <div className="h-px flex-1 bg-[var(--color-border)]" />
          </div>
          <Timeline items={timeline.map(entry => {
            const tlStatus = SELF_TIMELINE_STATUS[entry.action_type] ?? 'pending';
            const pillStatus = tlStatus === 'waiting' ? 'routing' : tlStatus;
            const actionLabel = SELF_TIMELINE_LABEL[entry.action_type] ?? entry.action_type;
            return {
              id: String(entry.id),
              title: <p className="text-[10px] text-normal text-[var(--color-text-muted)]">{formatDateTime(entry.acted_at)}</p>,
              description: (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-[var(--color-text-primary)]">
                    {entry.actor_name ?? (entry.action_type === 'returned' || entry.action_type === 'completed' ? 'System' : 'Unknown')}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={pillStatus} label={actionLabel} />
                  </div>
                  {entry.remarks?.trim() && (
                    <p className="pt-2 text-[11px] text-[var(--color-text-muted)] italic">&ldquo;{entry.remarks}&rdquo;</p>
                  )}
                </div>
              ),
              status: tlStatus,
            };
          })} variant="spacious" showTimestamps={false} />
        </section>
      )}
    </div>
  );
}

// ── Approval History Timeline ─────────────────────────────────────────────────

type SelfApprovalStep = {
  id: number;
  sequence: number;
  status: string;
  approver_name: string | null;
  final_action: string | null;
  final_remarks: string;
  acted_at?: string | null;
  activated_at?: string | null;
};

type SelfEvalTimelineEntry = {
  id: number;
  actor_name: string | null;
  action_type: 'submitted' | 'evaluated' | 're_evaluated' | 'approved' | 'disapproved' | 'returned' | 'completed';
  remarks: string;
  acted_at: string;
  step_order: number;
};

const SELF_TIMELINE_STATUS: Record<SelfEvalTimelineEntry['action_type'], TimelineStatus> = {
  submitted:    'approved',
  evaluated:    'approved',
  re_evaluated: 'approved',
  approved:     'approved',
  disapproved:  'disapproved',
  returned:     'disapproved',
  completed:    'approved',
};

const SELF_TIMELINE_LABEL: Record<SelfEvalTimelineEntry['action_type'], string> = {
  submitted:    'Submitted',
  evaluated:    'Evaluated',
  re_evaluated: 'Re-Evaluated',
  approved:     'Approved',
  disapproved:  'Disapproved',
  returned:     'Returned for Revision',
  completed:    'Completed',
};


// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SelfEvaluationPage() {
  const router = useRouter();
  const { registerGuard } = useNavigationGuard();

  const [data, setData] = useState<MyEvaluationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evalTimeline, setEvalTimeline] = useState<SelfEvalTimelineEntry[]>([]);

  const [scoreMap, setScoreMap] = useState<ScoreMap>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // isDirty tracks whether the user has entered values that haven't been submitted yet.
  const [isDirty, setIsDirty] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  // Refs always hold the latest values to avoid stale closures in debounced callbacks.
  const scoreMapRef = useRef<ScoreMap>({});
  const dataRef = useRef<MyEvaluationResponse | null>(null);
  // Keep a ref for allValid so trySubmit (registered in navigation guard) always reads fresh value.
  const allValidRef = useRef(false);
  const futureLabelsRef = useRef(new Set<string>());

  // Keep refs in sync with state
  useEffect(() => { scoreMapRef.current = scoreMap; }, [scoreMap]);
  useEffect(() => { dataRef.current = data; }, [data]);

  // Load data
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/employee-eval/my', { credentials: 'include' });
        if (res.status === 403) { router.replace('/dashboard'); return; }
        if (res.status === 404) { setError('No active evaluation period at this time.'); setLoading(false); return; }
        if (!res.ok) throw new Error();
        const json: MyEvaluationResponse = await res.json();
        setData(json);
        setScoreMap(buildScoreMap(json.entry.scores));
        // Fetch timeline for this entry (non-blocking)
        fetch(`/api/employee-eval/entries/${json.entry.id}/timeline`, { credentials: 'include' })
          .then(r => r.ok ? r.json() : [])
          .then((tl: SelfEvalTimelineEntry[]) => setEvalTimeline(tl ?? []))
          .catch(() => {});
      } catch {
        setError('Failed to load your evaluation. Please refresh.');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const columnGroups = useMemo(() => {
    if (!data) return [];
    return buildColumnGroups(data.period.frequency, data.period_labels);
  }, [data]);

  const futureLabels = useMemo(() => {
    if (!data) return new Set<string>();
    return computeFutureLabels(data.period, data.period_labels);
  }, [data]);

  const readOnly = useMemo(() => {
    if (!data) return true;
    return data.entry.status !== 'pending';
  }, [data]);

  const allValid = useMemo(() => {
    if (!data || data.tasklist.length === 0) return false;
    for (const task of data.tasklist) {
      for (const label of data.period_labels) {
        // Skip future labels (no input)
        if (futureLabels.has(label)) continue;
        if (!isScoreValid(scoreMap[task.name]?.[label])) return false;
      }
    }
    return true;
  }, [data, futureLabels, scoreMap]);

  // Keep refs in sync for navigation guard's trySubmit closure.
  useEffect(() => { allValidRef.current = allValid; }, [allValid]);
  useEffect(() => { futureLabelsRef.current = futureLabels; }, [futureLabels]);

  // ── Navigation guard ─────────────────────────────────────────────────────────
  // trySubmit: validate + save + submit. Returns true on success (nav allowed), false on failure.
  const trySubmit = React.useCallback(async (): Promise<boolean> => {
    if (!allValidRef.current) {
      setSubmitAttempted(true);
      return false;
    }
    return doSubmit(/* fromGuard */ true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Register/unregister the navigation guard whenever dirty state changes.
  useEffect(() => {
    if (isDirty && !readOnly) {
      registerGuard({ isDirty: true, trySubmit });
    } else {
      registerGuard(null);
    }
    return () => { registerGuard(null); };
  }, [isDirty, readOnly, registerGuard, trySubmit]);

  // Prevent browser tab close / refresh when dirty.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirtyRef.current) {
        e.preventDefault();
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Debounced auto-save
  function handleScoreChange(taskName: string, label: string, value: string) {
    setScoreMap(prev => ({
      ...prev,
      [taskName]: { ...(prev[taskName] ?? {}), [label]: value },
    }));
    isDirtyRef.current = true;
    setIsDirty(true);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    // Use a stable ref-based callback so the timer always reads the latest scoreMap.
    saveTimerRef.current = setTimeout(() => autoSaveFromRef(), 500);
  }

  // Reads from refs so it is immune to stale closure issues.
  async function autoSaveFromRef() {
    const currentData = dataRef.current;
    const currentScoreMap = scoreMapRef.current;
    if (!currentData || !isDirtyRef.current) return;
    setSaving(true);
    try {
      const csrf = await getCsrfToken();
      const scores = buildScoresPayload(currentData.tasklist, currentScoreMap, currentData.period_labels);
      const res = await fetch('/api/employee-eval/my/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        credentials: 'include',
        body: JSON.stringify({ scores }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.detail ?? 'Auto-save failed.');
      } else {
        isDirtyRef.current = false;
      }
    } catch {
      toast.error('Auto-save failed.');
    } finally {
      setSaving(false);
    }
  }

  function buildScoresPayload(tasks: Task[], map: ScoreMap, labels: string[]) {
    const payload: { task_name: string; period_label: string; score: number | null }[] = [];
    for (const task of tasks) {
      for (const label of labels) {
        const raw = map[task.name]?.[label] ?? '';
        const score = raw === '' ? null : parseFloat(raw);
        payload.push({ task_name: task.name, period_label: label, score: isNaN(score as number) ? null : score });
      }
    }
    return payload;
  }

  // Core submit logic shared by the confirm modal and the navigation guard.
  // Returns true if submission succeeded.
  async function doSubmit(fromGuard = false): Promise<boolean> {
    const currentData = dataRef.current;
    if (!currentData) return false;

    // Cancel any pending debounce so we don't double-save.
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    // Always force-save using the latest scoreMap from the ref —
    // this prevents the stale-closure bug where the last entered score
    // would be missing because the debounce ran before state flushed.
    setSaving(true);
    let saveOk = false;
    try {
      const csrf = await getCsrfToken();
      const scores = buildScoresPayload(
        currentData.tasklist,
        scoreMapRef.current,
        currentData.period_labels,
      );
      const saveRes = await fetch('/api/employee-eval/my/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        credentials: 'include',
        body: JSON.stringify({ scores }),
      });
      if (saveRes.ok) {
        isDirtyRef.current = false;
        saveOk = true;
      } else {
        const body = await saveRes.json();
        toast.error(body.detail ?? 'Failed to save scores before submit.');
      }
    } catch {
      toast.error('Failed to save scores. Please try again.');
    } finally {
      setSaving(false);
    }

    if (!saveOk) return false;

    if (!fromGuard) setShowConfirm(false);
    setSubmitting(true);
    try {
      const csrf = await getCsrfToken();
      const res = await fetch('/api/employee-eval/my/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.detail ?? 'Submission failed.');
        return false;
      }
      const updated: EvaluationEntry = await res.json();
      setData(prev => prev ? { ...prev, entry: updated } : prev);
      setIsDirty(false);
      isDirtyRef.current = false;
      registerGuard(null);
      toast.success('Evaluation submitted!');
      // Notify the layout to refresh the self-evaluation badge count.
      window.dispatchEvent(new Event('self-eval-badge-refresh'));
      // Refresh timeline after submit
      fetch(`/api/employee-eval/entries/${updated.id}/timeline`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : [])
        .then((tl: SelfEvalTimelineEntry[]) => setEvalTimeline(tl ?? []))
        .catch(() => {});
      return true;
    } catch {
      toast.error('Submission failed. Please try again.');
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    await doSubmit(false);
  }

  const isMobile = useIsMobile();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="h-6 w-6 rounded-full border-2 border-[#2845D6] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-[var(--color-text-muted)]">
        <AlertTriangle size={32} className="opacity-40" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { period, entry, tasklist, period_labels } = data;
  const hasAssignedTasks = tasklist.length > 0;
  const hasEditableColumns = !readOnly && hasAssignedTasks && period_labels.some(label => !futureLabels.has(label));
  const canShowSubmitButton = entry.status === 'pending' && hasEditableColumns;
  const isReturned = entry.status === 'returned';
  const isCompleted = entry.status === 'completed' || entry.status === 'disapproved';
  const returnedRemarks = entry.approval_steps
    .filter(s => s.final_action === 'disapproved' && s.final_remarks)
    .pop();

  return (
    <div className="space-y-4 px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--color-text-primary)]">Self Evaluation</h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            FY {period.fiscal_year}–{period.fiscal_year + 1} • {formatDateFull(period.start_date)} – {formatDateFull(period.end_date)}
          </p>
        </div>
      </div>

      {/* Returned banner */}
      {isReturned && returnedRemarks && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-2 flex items-start gap-1">
          <RotateCcw size={14} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-red-700 dark:text-red-400">Returned for Re-evaluation</p>
          </div>
        </div>
      )}

      {/* Completion banner */}
      {isCompleted && (
        <div className={cn(
          'rounded-md border p-2 flex items-center gap-3',
          entry.status === 'completed'
            ? 'border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900'
            : 'border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900',
        )}>
          <CheckCircle2 size={16} className={cn('shrink-0', entry.status === 'completed' ? 'text-green-500' : 'text-red-500')} />
          <p className={cn('text-xs font-semibold', entry.status === 'completed' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400')}>
            {entry.status === 'completed' ? 'Evaluation Completed' : 'Evaluation Disapproved'}
          </p>
        </div>
      )}

      {/* Score table */}
      <div className="space-y-3">
        {hasAssignedTasks ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">Performance Scores</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  Enter a score from <span className="font-semibold text-[var(--color-text-secondary)]">1</span> (lowest) to <span className="font-semibold text-[var(--color-text-secondary)]">5</span> (highest) for each enabled period. Future periods are locked.
                </p>
              </div>
            </div>
            <ScoreTable
              tasks={tasklist}
              scoreMap={scoreMap}
              onChange={handleScoreChange}
              readOnly={readOnly}
              groups={columnGroups}
              frequency={period.frequency}
              period={period}
              futureLabels={futureLabels}
              submitAttempted={submitAttempted}
              supervisorScores={entry.supervisor_evaluation?.supervisor_scores ?? undefined}
            />

            {canShowSubmitButton && (
              <div className="flex justify-end pt-2">
                <motion.button
                  key="submit-evaluation-button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  onClick={() => {
                    setSubmitAttempted(true);
                    if (!allValid) return; // red borders are now visible; block submission
                    setShowConfirm(true);
                  }}
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-lg bg-[#2845D6] px-4 py-2 text-xs font-normal text-white hover:bg-[#1f35b0] transition-colors disabled:opacity-60"
                >
                  <Send size={14} />
                  {isReturned ? 'Re-submit Evaluation' : 'Submit Evaluation'}
                </motion.button>
              </div>
            )}
          </>
        ) : (
          <div>
            <EmptyState
              title="No tasklists assigned yet"
              description="Your self-evaluation will be available once HR assigns your tasklists."
              icons={[ClipboardList, CalendarClock, BarChart3]}
              className="py-12"
            />
          </div>
        )}
      </div>

      {/* Supervisor Evaluation & Professional Qualities — visible once supervisor has submitted */}
      {entry.supervisor_evaluation?.is_complete && (
        <>
          <div className="space-y-3 p-4 bg-[var(--color-bg-elevated)] rounded-md border border-[var(--color-border)] shadow-md">
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">Supervisor Evaluation</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Feedback provided by your supervisor. This section is read-only and cannot be edited.
              </p>
            </div>
            <SupervisorEvalReadOnly ev={entry.supervisor_evaluation} timeline={evalTimeline} />
          </div>
        </>
      )}

      {/* Confirm submit modal */}
      {showConfirm && (
        <ConfirmationModal
          title="Submit Evaluation?"
          message="Are you sure that all evaluations and scores have been reviewed and entered correctly? Once submitted, the scores can no longer be edited."
          confirmLabel="Yes, submit my evaluation"
          confirmVariant="success"
          onConfirm={handleSubmit}
          onCancel={() => setShowConfirm(false)}
          confirming={submitting}
        />
      )}
    </div>
  );
}


'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  ClipboardList,
  CalendarDays,
  GraduationCap,
  List,
  Send,
  Star,
  Users2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { StatusPill } from '@/components/ui/status-pill';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { EmptyState } from '@/components/ui/interactive-empty-state';
import { toast } from '@/components/ui/toast';
import { Rating } from '@/components/ui/rating';
import { TextareaWithCharactersLeft } from '@/components/ui/textarea-with-characters-left';
import { Timeline } from '@/components/ui/timeline';
import type { TimelineItem, TimelineStatus } from '@/components/ui/timeline';
import { getCsrfToken } from '@/lib/csrf';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserData {
  id: number;
  idnumber: string;
  firstname: string;
  lastname: string;
  admin: boolean;
  hr: boolean;
  accounting: boolean;
  is_approver: boolean;
}

interface QueueItem {
  id: number;
  employee_name: string;
  employee_id_number: string;
  department: string;
  fiscal_year: number;
  period_title: string;
  status: string;
  submitted_at: string | null;
  my_step_id: number | null;
  my_step_status: 'pending' | 'reviewed' | null;
  my_step_sequence: number | null;
  my_role: 'supervisor' | 'final_approver' | null;
  my_step_label: string;
  total_steps: number;
}

interface Task {
  id: number;
  name: string;
  order: number;
}

interface EvalTimelineEntry {
  id: number;
  entry: number;
  actor: number | null;
  actor_name: string | null;
  action_type: 'submitted' | 'evaluated' | 're_evaluated' | 'approved' | 'disapproved' | 'returned' | 'completed';
  remarks: string;
  acted_at: string;
  step_order: number;
}

interface ScoreData {
  task: number | null;
  task_name: string;
  period_label: string;
  score: string | null;
}

interface ApprovalStep {
  id: number;
  sequence: number;
  status: string;
  approver_name: string | null;
  activated_at: string | null;
  acted_at: string | null;
  final_action: string | null;
  final_remarks: string;
}

interface Period {
  id: number;
  title: string;
  fiscal_year: number;
  start_date: string;
  end_date: string;
  status: string;
  frequency: string;
  created_at: string;
}

interface SupervisorEvalData {
  id: number;
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
  quality_comments: Record<string, string>;
  supervisor_scores?: Record<string, string>;
  is_complete: boolean;
  submitted_at: string | null;
}

interface EntryDetail {
  id: number;
  employee: number;
  employee_name: string;
  employee_id_number: string;
  department: string;
  period: Period;
  period_labels: string[];
  status: string;
  submitted_at: string | null;
  scores: ScoreData[];
  approval_steps: ApprovalStep[];
  tasklist: Task[];
  my_step: ApprovalStep | null;
  my_role: 'supervisor' | 'final_approver' | null;
  can_act: boolean;
  supervisor_evaluation: SupervisorEvalData | null;
  /** First-submission snapshot — preserved as baseline for Step 1 re-evaluation. */
  baseline_evaluation?: SupervisorEvalData | null;
  disapproval_remarks: string;
}

// ── State type for supervisor eval form ───────────────────────────────────────

interface EvalFormState {
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
  quality_comments: Record<string, string>;
}

// ── Employee stats (fetched alongside entry detail) ───────────────────────────

interface EmployeeStats {
  leave_days: number;
  leave_hours: number;
  certificates: number;
  trainings_completed: number;
  prf_requests: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const QUARTERS = ['q1', 'q2', 'q3', 'q4'] as const;
const QUARTER_LABELS: Record<string, string> = {
  q1: 'Q1 — May to July',
  q2: 'Q2 — August to October',
  q3: 'Q3 — November to January',
  q4: 'Q4 — February to April',
};

const TEXT_FIELDS = [
  { key: 'strengths',           label: 'Strengths' },
  { key: 'weaknesses',          label: 'Weaknesses' },
  { key: 'training_required',   label: 'Training Required' },
  { key: 'supervisor_comments', label: "Superior's Assessment" },
  { key: 'employee_comments',   label: 'Employee Comments' },
] as const;

const RATING_FIELDS = [
  { key: 'cost_consciousness', label: 'Cost Consciousness' },
  { key: 'dependability',      label: 'Dependability' },
  { key: 'communication',      label: 'Communication' },
  { key: 'work_ethics',        label: 'Work Ethics' },
  { key: 'attendance',         label: 'Attendance' },
] as const;

const STATUS_META: Record<string, { status: string; label: string }> = {
  pending:               { status: 'pending',     label: 'Pending' },
  supervisor_review:     { status: 'routing',     label: 'Supervisor Review' },
  user_confirmation:     { status: 'pending',     label: 'User Confirmation' },
  final_approval:        { status: 'routing',     label: 'Awaiting Final Approval' },
  second_final_approval: { status: 'routing',     label: 'Under Second Review' },
  returned:              { status: 'closed',      label: 'Returned for Revision' },
  completed:             { status: 'approved',    label: 'Completed' },
  disapproved:           { status: 'disapproved', label: 'Disapproved' },
  pending_step:          { status: 'routing',     label: 'Pending Review' },
  reviewed:              { status: 'approved',    label: 'Reviewed' },
};

// Map backend step labels to formal display labels
const STEP_LABEL_MAP: Record<string, string> = {
  '1st Approver Evaluation':   'Pending Review',
  '2nd Approver Evaluation':   'Under Second Review',
  'Final Approval':             'Awaiting Final Approval',
  'Returned for Re-evaluation': 'Returned for Revision',
  'User Confirmation':          'User Confirmation',
  'Completed':                  'Completed',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

type ScoreMap = Record<string, Record<string, string>>;

function buildScoreMap(scores: ScoreData[]): ScoreMap {
  const map: ScoreMap = {};
  for (const s of scores) {
    if (!map[s.task_name]) map[s.task_name] = {};
    map[s.task_name][s.period_label] = s.score ?? '';
  }
  return map;
}

function formatSelfScoreValue(value: string | undefined): string {
  if (!value || value.trim() === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return Number.isInteger(n) ? String(n) : String(n).replace(/\.0+$/, '');
}

interface ColumnGroup { groupLabel: string | null; columns: string[]; showGroupTotal: boolean; }

function buildColumnGroups(frequency: string, labels: string[]): ColumnGroup[] {
  if (frequency === 'quarterly') {
    const QUARTER_GROUP_LABELS = ['Q1', 'Q2', 'Q3', 'Q4'];
    return labels.map((label, i) => ({ groupLabel: QUARTER_GROUP_LABELS[i] ?? label, columns: [label], showGroupTotal: true }));
  }
  if (frequency === 'monthly') {
    return [
      { groupLabel: 'Q1 (May–Jul)', columns: labels.slice(0, 3), showGroupTotal: true },
      { groupLabel: 'Q2 (Aug–Oct)', columns: labels.slice(3, 6), showGroupTotal: true },
      { groupLabel: 'Q3 (Nov–Jan)', columns: labels.slice(6, 9), showGroupTotal: true },
      { groupLabel: 'Q4 (Feb–Apr)', columns: labels.slice(9, 12), showGroupTotal: true },
    ];
  }
  return [{ groupLabel: null, columns: labels, showGroupTotal: false }];
}

function computeGroupAvg(vals: (string | undefined)[]): string {
  const nums = vals.map(v => parseFloat(v ?? '')).filter(n => !isNaN(n));
  if (!nums.length) return '—';
  return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2);
}

function formatDateTime(s: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}

function emptyEvalState(): EvalFormState {
  return {
    strengths_q1: '', strengths_q2: '', strengths_q3: '', strengths_q4: '',
    weaknesses_q1: '', weaknesses_q2: '', weaknesses_q3: '', weaknesses_q4: '',
    training_required_q1: '', training_required_q2: '', training_required_q3: '', training_required_q4: '',
    supervisor_comments_q1: '', supervisor_comments_q2: '', supervisor_comments_q3: '', supervisor_comments_q4: '',
    employee_comments_q1: '', employee_comments_q2: '', employee_comments_q3: '', employee_comments_q4: '',
    cost_consciousness_q1: null, cost_consciousness_q2: null, cost_consciousness_q3: null, cost_consciousness_q4: null,
    dependability_q1: null, dependability_q2: null, dependability_q3: null, dependability_q4: null,
    communication_q1: null, communication_q2: null, communication_q3: null, communication_q4: null,
    work_ethics_q1: null, work_ethics_q2: null, work_ethics_q3: null, work_ethics_q4: null,
    attendance_q1: null, attendance_q2: null, attendance_q3: null, attendance_q4: null,
    quality_comments: {},
  };
}

function evalStateFromData(ev: SupervisorEvalData): EvalFormState {
  return {
    strengths_q1: ev.strengths_q1, strengths_q2: ev.strengths_q2, strengths_q3: ev.strengths_q3, strengths_q4: ev.strengths_q4,
    weaknesses_q1: ev.weaknesses_q1, weaknesses_q2: ev.weaknesses_q2, weaknesses_q3: ev.weaknesses_q3, weaknesses_q4: ev.weaknesses_q4,
    training_required_q1: ev.training_required_q1, training_required_q2: ev.training_required_q2, training_required_q3: ev.training_required_q3, training_required_q4: ev.training_required_q4,
    supervisor_comments_q1: ev.supervisor_comments_q1, supervisor_comments_q2: ev.supervisor_comments_q2, supervisor_comments_q3: ev.supervisor_comments_q3, supervisor_comments_q4: ev.supervisor_comments_q4,
    employee_comments_q1: ev.employee_comments_q1, employee_comments_q2: ev.employee_comments_q2, employee_comments_q3: ev.employee_comments_q3, employee_comments_q4: ev.employee_comments_q4,
    cost_consciousness_q1: ev.cost_consciousness_q1, cost_consciousness_q2: ev.cost_consciousness_q2, cost_consciousness_q3: ev.cost_consciousness_q3, cost_consciousness_q4: ev.cost_consciousness_q4,
    dependability_q1: ev.dependability_q1, dependability_q2: ev.dependability_q2, dependability_q3: ev.dependability_q3, dependability_q4: ev.dependability_q4,
    communication_q1: ev.communication_q1, communication_q2: ev.communication_q2, communication_q3: ev.communication_q3, communication_q4: ev.communication_q4,
    work_ethics_q1: ev.work_ethics_q1, work_ethics_q2: ev.work_ethics_q2, work_ethics_q3: ev.work_ethics_q3, work_ethics_q4: ev.work_ethics_q4,
    attendance_q1: ev.attendance_q1, attendance_q2: ev.attendance_q2, attendance_q3: ev.attendance_q3, attendance_q4: ev.attendance_q4,
    quality_comments: ev.quality_comments ?? {},
  };
}

// ── Skeleton loaders ──────────────────────────────────────────────────────────

function QueueListSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 animate-pulse space-y-2">
          <div className="h-3 w-2/3 rounded bg-[var(--color-border)]" />
          <div className="h-2.5 w-1/2 rounded bg-[var(--color-border)]" />
        </div>
      ))}
    </div>
  );
}

function FormSkeletonLoader() {
  return (
    <div className="p-5 space-y-4 animate-pulse">
      <div className="h-5 w-48 rounded bg-[var(--color-border)]" />
      <div className="h-3 w-32 rounded bg-[var(--color-border)]" />
      <div className="mt-4 h-40 w-full rounded-xl bg-[var(--color-border)]" />
      <div className="h-32 w-full rounded-xl bg-[var(--color-border)]" />
    </div>
  );
}

// ── Approver score table (self read-only + supervisor editable dual cols) ─────

/**
 * Determines which period labels are "past" (eligible for dual Self/Supervisor cols).
 * Uses same logic as the self-eval page: past = period has fully ended before today.
 * For monthly: a month is past once the next month has started (same as futureLabels logic).
 */
function computePastEvalLabels(period: { start_date: string; frequency: string }, labels: string[]): Set<string> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const periodStart = new Date(period.start_date);
  periodStart.setHours(0, 0, 0, 0);
  const pastSet = new Set<string>();

  if (period.frequency === 'monthly') {
    const startOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    labels.forEach((label, idx) => {
      const labelStart = new Date(periodStart);
      labelStart.setMonth(labelStart.getMonth() + idx);
      // Past = month started before this month (i.e. not current or future)
      if (labelStart < startOfCurrentMonth) pastSet.add(label);
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
  return pastSet;
}

function ApproverScoreTable({ tasks, scoreMap, groups, frequency, period, supervisorScores, onSupervisorScoreChange, readOnly }: {
  tasks: Task[];
  scoreMap: ScoreMap;
  groups: ColumnGroup[];
  frequency: string;
  period: { start_date: string; frequency: string };
  supervisorScores: Record<string, string>;
  onSupervisorScoreChange: (key: string, value: string) => void;
  readOnly?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const allLabels = groups.flatMap(g => g.columns);
  const showOverallTotal = groups.some(g => g.showGroupTotal);
  const hasGroupLabels = groups.some(g => g.groupLabel);
  const pastLabels = useMemo(() => computePastEvalLabels(period, allLabels), [period, allLabels]);

  if (!tasks.length) return <p className="text-xs text-center text-[var(--color-text-muted)] py-4">No tasks assigned.</p>;

  function focusNextInputBelow(currentTaskIndex: number, columnLabel: string) {
    if (!scrollRef.current) return;
    for (let nextIdx = currentTaskIndex + 1; nextIdx < tasks.length; nextIdx++) {
      const next = scrollRef.current.querySelector<HTMLInputElement>(
        `input[data-score-input="true"][data-task-index="${nextIdx}"][data-label="${columnLabel}"]`,
      );
      if (next) { next.focus(); next.select(); break; }
    }
  }

  // Group total & overall total computed from supervisor scores (past months only)
  function getSupervisorGroupAvg(cols: string[], taskName: string): string {
    const vals = cols.filter(c => pastLabels.has(c)).map(c => supervisorScores[`${taskName}__${c}`]);
    const nums = vals.map(v => parseFloat(v ?? '')).filter(n => !isNaN(n));
    if (!nums.length) return '—';
    return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2);
  }
  function getSupervisorOverallAvg(taskName: string): string {
    const groupAverages = groups.map(group => {
      const vals = group.columns.filter(c => pastLabels.has(c)).map(c => supervisorScores[`${taskName}__${c}`]);
      const nums = vals.map(v => parseFloat(v ?? '')).filter(n => !isNaN(n));
      if (!nums.length) return NaN;
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    }).filter(Number.isFinite);

    if (!groupAverages.length) return '—';
    return (groupAverages.reduce((a, b) => a + b, 0) / groupAverages.length).toFixed(2);
  }

  // Each past month → 2 sub-cols (Self + Supervisor); current/future → 1 blank col
  function groupDataColSpan(g: ColumnGroup): number {
    const baseCols = g.columns.reduce((acc, col) => acc + (pastLabels.has(col) ? 2 : 1), 0);
    return baseCols + ((g.showGroupTotal && frequency !== 'quarterly') ? 1 : 0);
  }

  return (
    // Single table with sticky Tasklists column — scrollbar on this wrapper only
    <div
      ref={scrollRef}
      className={cn(
        'rounded-md border border-[var(--color-border)] overflow-x-auto',
        // Thin accent scrollbar — visible only on hover, hidden otherwise
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
      <table className="text-xs border-separate border-spacing-0" style={{ minWidth: 'max-content', width: '100%' }}>
        <thead>
          {/* ── Group header row (monthly) ── */}
          {hasGroupLabels && (
            <tr>
              {/* Tasklists spans both header rows via rowSpan=2 */}
              <th
                rowSpan={2}
                className="sticky left-0 z-20 w-[300px] lg:w-auto bg-[var(--color-bg)] border-b border-r border-[var(--color-border)] px-3 py-2 text-left font-semibold text-[var(--color-text-secondary)] align-middle"
                style={{ minWidth: 160, maxWidth: 700 }}
              >
                Tasklists
              </th>
              {groups.map((g, gi) => (
                <th
                  key={gi}
                  colSpan={groupDataColSpan(g)}
                  className="bg-[var(--color-bg)] border-b border-r border-[var(--color-border)] px-2 py-2 text-center font-semibold text-[var(--color-text-secondary)] whitespace-nowrap"
                >
                  {g.groupLabel}
                </th>
              ))}
              {/* Overall Evaluation spans both header rows via rowSpan=2 */}
              {showOverallTotal && (
                <th
                  rowSpan={2}
                  className="bg-[var(--color-bg)] border-b border-[var(--color-border)] px-2 py-2 text-center font-bold text-[var(--color-text-primary)] align-middle whitespace-nowrap min-w-[70px]"
                >
                  Overall Evaluation
                </th>
              )}
            </tr>
          )}

          {/* ── Column label row ── */}
          <tr>
            {/* Tasklists header — only when no group row (otherwise merged via rowSpan above) */}
            {!hasGroupLabels && (
              <th
                className="sticky left-0 z-20 bg-[var(--color-bg)] border-b border-r border-[var(--color-border)] px-3 py-2 text-left font-semibold text-[var(--color-text-secondary)]"
                style={{ minWidth: 160, maxWidth: 700 }}
              >
                Tasklists
              </th>
            )}
            {groups.flatMap((g, gi) => [
              ...g.columns.flatMap(col => {
                if (pastLabels.has(col)) {
                  // Past month → dual Self / Supervisor sub-columns
                  return [
                    <th key={`${col}-self`} className="bg-[var(--color-bg)] border-b border-r border-[var(--color-border)] px-2 py-2 text-center whitespace-nowrap min-w-[56px]">
                      <div className="text-[10px] font-medium text-[var(--color-text-muted)]">Self</div>
                    </th>,
                    <th key={`${col}-sup`} className="bg-[var(--color-bg)] border-b border-r border-[var(--color-border)] px-2 py-2 text-center whitespace-nowrap min-w-[56px]">
                      <div className="text-[10px] font-medium text-[#2845D6]">Supervisor</div>
                    </th>,
                  ];
                }
                // Current / future month → single blank placeholder column
                return [
                  <th key={col} className="bg-[var(--color-bg)] border-b border-r border-[var(--color-border)] px-2 py-2 text-center whitespace-nowrap min-w-[56px]">
                    {col}
                  </th>,
                ];
              }),
              ...((g.showGroupTotal && frequency !== 'quarterly') ? [
                <th key={`gt-${gi}`} className="text-[10px] bg-[var(--color-bg)] border-b border-r border-[var(--color-border)] px-2 py-2 text-center font-medium text-[var(--color-text-secondary)] whitespace-nowrap min-w-[60px]">
                  Total
                </th>,
              ] : []),
            ])}
            {/* Overall Evaluation — only when no group row */}
            {!hasGroupLabels && showOverallTotal && (
              <th className="bg-[var(--color-bg)] border-b border-[var(--color-border)] px-2 py-2 text-center font-bold text-[var(--color-text-primary)] whitespace-nowrap min-w-[70px]">
                Overall Evaluation
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {tasks.map((task, taskIndex) => {
            const ts = scoreMap[task.name] ?? {};
            return (
              <tr key={task.id}>
                {/* Sticky task name cell */}
                <td
                  className="sticky left-0 z-10 bg-[var(--color-bg-elevated)] border-b border-r border-[var(--color-border)] px-3 py-2 font-normal text-[var(--color-text-primary)]"
                  style={{ minWidth: 160, maxWidth: 500 }}
                >
                  {task.name}
                </td>

                {groups.flatMap((g, gi) => [
                  ...g.columns.flatMap(col => {
                    if (pastLabels.has(col)) {
                      const selfVal = ts[col] ?? '—';
                      const supKey = `${task.name}__${col}`;
                      const supVal = supervisorScores[supKey] ?? '';
                      return [
                        // Self — read-only display
                        <td key={`${col}-self`} className="border-b border-r border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-2 text-center">
                          <span className="text-xs text-[var(--color-text-muted)]">{formatSelfScoreValue(selfVal)}</span>
                        </td>,
                        // Supervisor — editable input (or read-only span)
                        <td key={`${col}-sup`} className="border-b border-r border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-1 py-1 text-center">
                          {readOnly ? (
                            <span className="text-xs text-[var(--color-text-primary)]">{supVal || '—'}</span>
                          ) : (
                            <input
                              type="number"
                              step="1"
                              min="0"
                              max="5"
                              value={supVal}
                              data-score-input="true"
                              data-task-index={taskIndex}
                              data-label={col}
                              onChange={e => {
                                const raw = e.target.value;
                                if (raw === '') { onSupervisorScoreChange(supKey, ''); return; }
                                if (!/^[0-9]+$/.test(raw)) return;
                                const n = parseInt(raw, 10);
                                if (n < 0 || n > 5) return;
                                onSupervisorScoreChange(supKey, String(n));
                              }}
                              onKeyDown={e => {
                                if (e.key !== 'Enter') return;
                                e.preventDefault();
                                focusNextInputBelow(taskIndex, col);
                              }}
                              placeholder="—"
                              className={cn(
                                'w-full rounded-sm border px-1 py-1.5 text-center text-xs focus:outline-none focus:ring-1 transition-colors',
                                '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                                'border-[var(--color-border)] bg-[var(--color-bg-elevated)] focus:ring-[#2845D6]',
                              )}
                            />
                          )}
                        </td>,
                      ];
                    }
                    // Current / future month — empty whitespace cell (no content, no dash)
                    return [
                      <td key={col} className="border-b border-r border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-2" />,
                    ];
                  }),
                  ...((g.showGroupTotal && frequency !== 'quarterly') ? [
                    <td key={`gt-${gi}`} className="border-b border-r border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-center">
                      <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
                        {getSupervisorGroupAvg(g.columns, task.name)}
                      </span>
                    </td>,
                  ] : []),
                ])}

                {/* Overall Total */}
                {showOverallTotal && (
                  <td className="border-b border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-center">
                    <span className="text-xs font-bold text-[var(--color-text-primary)]">
                      {getSupervisorOverallAvg(task.name)}
                    </span>
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

// ── Supervisor eval read-only display (for final approver) ────────────────────

function SupervisorEvalReadOnly({ ev }: { ev: SupervisorEvalData }) {
  function getLatestText(field: string): string {
    for (const q of [...QUARTER_SEQUENCE].reverse()) {
      const value = (ev as unknown as Record<string, string>)[`${field}_${q}`] ?? '';
      if (value.trim().length > 0) return value;
    }
    return '';
  }
  function getLatestRating(field: string): number | null {
    for (const q of [...QUARTER_SEQUENCE].reverse()) {
      const value = (ev as unknown as Record<string, number | null>)[`${field}_${q}`];
      if (value !== null && value !== undefined) return value;
    }
    return null;
  }
  function getLatestComment(field: string): string {
    for (const q of [...QUARTER_SEQUENCE].reverse()) {
      const key = `${field}_${q}_comment`;
      const value = ev.quality_comments?.[key] ?? '';
      if (value.trim().length > 0) return value;
    }
    return '';
  }

  const evaluationValues = TEXT_FIELDS.map(f => ({
    ...f,
    value: getLatestText(f.key),
  })).filter(item => item.value.trim().length > 0);

  const qualityItems = RATING_FIELDS.map(f => ({
    ...f,
    rating: getLatestRating(f.key),
    comment: getLatestComment(f.key),
  })).filter(item => item.rating !== null || item.comment.trim().length > 0);

  return (
    <div className="space-y-6">
      <section className="space-y-5">
        <div className="space-y-4 bg-[var(--color-bg-elevated)] py-4">
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

      <section className="space-y-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-px flex-1 bg-[var(--color-border)]" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">Performance Evaluation</p>
          <div className="h-px flex-1 bg-[var(--color-border)]" />
        </div>
        <div className="space-y-3">
          {qualityItems.length ? qualityItems.map(item => (
            <div key={item.key} className="bg-[var(--color-bg-elevated)] py-2">
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
          )) : (
            <p className="text-xs text-[var(--color-text-muted)]">No professional quality details available.</p>
          )}
        </div>
      </section>
    </div>
  );
}

// ── Helper: determine the active quarter (most recent past quarter not yet evaluated) ──

const QUARTER_SEQUENCE = ['q1', 'q2', 'q3', 'q4'] as const;
const QUARTER_FULL_LABELS: Record<string, string> = {
  q1: '1st Quarter',
  q2: '2nd Quarter',
  q3: '3rd Quarter',
  q4: '4th Quarter',
};

/**
 * The active quarter for the approver's form is the first quarter that doesn't have
 * ALL five rating fields filled in the current evalState.
 * This way previously submitted (non-null ratings) quarters show as read-only history.
 */
function computeActiveQuarter(state: EvalFormState): string | null {
  for (const q of QUARTER_SEQUENCE) {
    // A quarter is "submitted" if all 5 ratings are non-null
    const allRatingsSet = RATING_FIELDS.every(f => {
      const key = `${f.key}_${q}` as keyof EvalFormState;
      return (state[key] as number | null) !== null;
    });
    if (!allRatingsSet) return q;
  }
  return null; // all 4 quarters fully evaluated
}

// ── Supervisor eval form (editable, grouped by category) ─────────────────────

/**
 * Pre-fills the active quarter's text fields from the most recent non-empty
 * previous quarter so textareas carry forward saved values on re-evaluation.
 * Rating fields are NOT pre-filled into state — they are resolved at display
 * time via getFallbackRating() to avoid advancing computeActiveQuarter().
 */
function preFillTextFields(state: EvalFormState): EvalFormState {
  const activeQ = computeActiveQuarter(state);
  if (!activeQ) return state;
  const activeIdx = QUARTER_SEQUENCE.indexOf(activeQ as typeof QUARTER_SEQUENCE[number]);
  if (activeIdx === 0) return state; // Q1 — nothing to pre-fill from
  const result = { ...state } as Record<string, unknown>;
  for (const f of TEXT_FIELDS) {
    const activeKey = `${f.key}_${activeQ}`;
    if (!result[activeKey]) {
      for (let i = activeIdx - 1; i >= 0; i--) {
        const prevKey = `${f.key}_${QUARTER_SEQUENCE[i]}`;
        if (result[prevKey]) { result[activeKey] = result[prevKey]; break; }
      }
    }
  }
  return result as unknown as EvalFormState;
}

function SupervisorEvalForm({
  state,
  onChange,
  validationErrors,
  forceShowOnComplete = false,
}: {
  state: EvalFormState;
  onChange: (next: EvalFormState) => void;
  validationErrors: Set<string>;
  forceShowOnComplete?: boolean;
}) {
  let activeQ = computeActiveQuarter(state);
  if (!activeQ && forceShowOnComplete) {
    activeQ = QUARTER_SEQUENCE[QUARTER_SEQUENCE.length - 1];
  }
  if (!activeQ) return null;

  const activeIdx = QUARTER_SEQUENCE.indexOf(activeQ as typeof QUARTER_SEQUENCE[number]);

  function setField(key: string, value: string | number | null) {
    onChange({ ...state, [key]: value });
  }
  function setComment(key: string, value: string) {
    onChange({ ...state, quality_comments: { ...state.quality_comments, [key]: value } });
  }

  // Fallback helpers — resolve most recent non-empty/non-null value from previous quarters
  function getFallbackText(fieldKey: string): string {
    for (let i = activeIdx - 1; i >= 0; i--) {
      const val = (state as unknown as Record<string, string>)[`${fieldKey}_${QUARTER_SEQUENCE[i]}`] ?? '';
      if (val) return val;
    }
    return '';
  }
  function getFallbackRating(fieldKey: string): number | null {
    for (let i = activeIdx - 1; i >= 0; i--) {
      const val = (state as unknown as Record<string, number | null>)[`${fieldKey}_${QUARTER_SEQUENCE[i]}`];
      if (val !== null && val !== undefined) return val;
    }
    return null;
  }
  function getFallbackComment(fieldKey: string): string {
    for (let i = activeIdx - 1; i >= 0; i--) {
      const key = `${fieldKey}_${QUARTER_SEQUENCE[i]}_comment`;
      const val = state.quality_comments?.[key] ?? '';
      if (val) return val;
    }
    return '';
  }

  return (
    <div className="space-y-5">
      {/* ── Text fields — single persistent instance per field ── */}
      {TEXT_FIELDS.map(f => {
        const fieldKey = `${f.key}_${activeQ}`;
        const currentVal = (state as unknown as Record<string, string>)[fieldKey] || getFallbackText(f.key);
        const isRequired = ['strengths', 'weaknesses', 'training_required', 'supervisor_comments', 'employee_comments'].includes(f.key);
        const placeholderMap: Record<string, string> = {
          strengths: 'Describe key strengths and achievements.',
          weaknesses: 'Describe areas for improvement.',
          training_required: 'Note any recommended training or support.',
          supervisor_comments: 'Summarize your overall assessment.',
          employee_comments: 'Capture any employee remarks or responses.',
        };
        return (
          <div key={f.key} className="overflow-hidden">
            <div className="p-2 bg-[var(--color-bg)]">
              <p className="text-[12px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
                {f.label}
                {isRequired && <span className="text-red-500 ml-1">*</span>}
              </p>
            </div>
            <div className="pl-6 pr-4 py-4">
              <TextareaWithCharactersLeft
                value={currentVal}
                onChange={e => setField(fieldKey, e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder={placeholderMap[f.key]}
              />
            </div>
          </div>
        );
      })}

      {/* ── Performance Qualities divider ── */}
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">Performance Qualities</p>
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      {/* ── Rating fields — single persistent instance per quality ── */}
      {RATING_FIELDS.map(f => {
        const ratingKey = `${f.key}_${activeQ}`;
        const commentKey = `${f.key}_${activeQ}_comment`;
        const ratingVal = (state as unknown as Record<string, number | null>)[ratingKey] ?? getFallbackRating(f.key);
        const commentVal = state.quality_comments?.[commentKey] || getFallbackComment(f.key);
        const hasError = validationErrors.has(ratingKey);
        return (
          <div key={f.key} className="overflow-hidden">
            <div className="p-2 bg-[var(--color-bg)]">
              <p className="text-[12px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">{f.label}</p>
            </div>
            <div className="pl-6 pr-4 py-4 space-y-3">
              <div>
                <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
                  Rating<span className="text-red-500 ml-0.5">*</span>
                </p>
                <div className={cn('mb-5', hasError && 'outline outline-1 outline-red-400 rounded-md p-1')}>
                  <div className="flex items-center gap-2">
                    <Rating
                      rating={ratingVal ?? 0}
                      maxRating={5}
                      editable
                      onRatingChange={v => setField(ratingKey, v)}
                      size="sm"
                      showValue={false}
                    />
                    <span className="text-xs text-[var(--color-text-secondary)]">{ratingVal ?? 0}/5</span>
                  </div>
                </div>
                <TextareaWithCharactersLeft
                  value={commentVal}
                  label="Remarks (optional)"
                  onChange={e => setComment(commentKey, e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="Optional comment…"
                  wrapperClassName="gap-1"
                  className="min-h-[52px]"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Approval History Timeline ─────────────────────────────────────────────────

const EVAL_TIMELINE_STATUS: Record<EvalTimelineEntry['action_type'], TimelineStatus> = {
  submitted:    'approved',
  evaluated:    'approved',
  re_evaluated: 'approved',
  approved:     'approved',
  disapproved:  'disapproved',
  returned:     'disapproved',
  completed:    'approved',
};

const EVAL_TIMELINE_LABEL: Record<EvalTimelineEntry['action_type'], string> = {
  submitted:    'Submitted',
  evaluated:    'Evaluated',
  re_evaluated: 'Re-Evaluated',
  approved:     'Approved',
  disapproved:  'Disapproved',
  returned:     'Returned for Revision',
  completed:    'Completed',
};

function ApprovalHistoryTimeline({
  entries,
  loading,
}: {
  entries: EvalTimelineEntry[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-[var(--color-border)]" />
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">Approval History</p>
          <div className="h-px flex-1 bg-[var(--color-border)]" />
        </div>
        <div className="space-y-2 pl-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 rounded bg-[var(--color-bg-subtle)] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!entries.length) return null;

  const items: TimelineItem[] = entries.map(entry => {
    const tlStatus = EVAL_TIMELINE_STATUS[entry.action_type] ?? 'pending';
    const pillStatus = tlStatus === 'waiting' ? 'routing' : tlStatus;
    const actionLabel = EVAL_TIMELINE_LABEL[entry.action_type] ?? entry.action_type;

    return {
      id: String(entry.id),
      title: (
        <p className="text-xs font-medium text-[var(--color-text-primary)]">
          {entry.actor_name ?? (entry.action_type === 'returned' || entry.action_type === 'completed' ? 'System' : 'Unknown')}
        </p>
      ),
      description: (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={pillStatus} label={actionLabel} />
            <span className="text-[11px] text-[var(--color-text-muted)]">{formatDateTime(entry.acted_at)}</span>
          </div>
          {entry.remarks && entry.remarks.trim() && (
            <p className="text-[11px] text-[var(--color-text-muted)] italic">&ldquo;{entry.remarks}&rdquo;</p>
          )}
        </div>
      ),
      status: tlStatus,
    };
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">
          Approval History
        </p>
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>
      <Timeline items={items} variant="compact" showTimestamps={false} />
    </div>
  );
}


// ── Employee Stats Cards ──────────────────────────────────────────────────────

function EvalStatCard({
  icon: Icon,
  value,
  label,
  sublabel,
}: {
  icon: React.ElementType;
  value: string | number;
  label: string;
  sublabel: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
      <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
        <Icon size={12} />
        <p className="text-[10px] font-semibold uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-xl font-bold text-[var(--color-text-primary)] leading-none">{value}</p>
      <p className="text-[10px] text-[var(--color-text-muted)]">{sublabel}</p>
    </div>
  );
}

function EmployeeStatsSection({
  stats,
  loading,
}: {
  stats: EmployeeStats | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-4 gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-[72px] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] animate-pulse" />
        ))}
      </div>
    );
  }
  if (!stats) return null;

  const leaveHours = Number.isInteger(stats.leave_hours)
    ? String(stats.leave_hours)
    : stats.leave_hours.toFixed(1);

  return (
    <div className="@container">
      <div className="grid grid-cols-1 @[481px]:grid-cols-2 @[780px]:grid-cols-4 gap-2">
        <EvalStatCard
          icon={CalendarDays}
          value={stats.leave_days}
          label="Leave Taken"
          sublabel={`${stats.leave_days} ${stats.leave_days === 1 ? 'day' : 'days'} · ${leaveHours} ${stats.leave_hours === 1 ? 'hour' : 'hours'}`}
        />
        <EvalStatCard
          icon={GraduationCap}
          value={stats.certificates}
          label="Certificates"
          sublabel="Company-issued"
        />
        <EvalStatCard
          icon={ClipboardList}
          value={stats.trainings_completed}
          label="Trainings Attended"
          sublabel="Training attendance"
        />
        <EvalStatCard
          icon={List}
          value={stats.prf_requests}
          label="PRF Requests"
          sublabel="Filed this fiscal year"
        />
      </div>
    </div>
  );
}



// ── Detail panel (right column) ───────────────────────────────────────────────

function DetailPanel({
  entryId,
  onReviewed,
}: {
  entryId: number;
  onReviewed: (entryId: number) => void;
}) {
  const [detail, setDetail] = useState<EntryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [evalState, setEvalState] = useState<EvalFormState>(emptyEvalState());
  const [supervisorScores, setSupervisorScores] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [actioning, setActioning] = useState(false);
  const [employeeStats, setEmployeeStats] = useState<EmployeeStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [evalTimeline, setEvalTimeline] = useState<EvalTimelineEntry[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const submittingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    setEvalState(emptyEvalState());
    setSupervisorScores({});
    setValidationErrors(new Set());
    setRemarks('');
    setEmployeeStats(null);
    setLoadingStats(true);
    setEvalTimeline([]);
    setLoadingTimeline(true);

    const entryPromise = fetch(`/api/employee-eval/approver/entries/${entryId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: EntryDetail | null) => {
        if (!data) { toast.error('Failed to load entry.'); return; }
        setDetail(data);
        if (data.supervisor_evaluation) {
          if (data.my_role === 'supervisor') {
            // When the evaluation was returned for re-evaluation, use the first-submission
            // baseline so the Step 1 approver always starts from their original values,
            // not any intermediate auto-saved draft.
            const source = (data.status === 'returned' && data.baseline_evaluation)
              ? data.baseline_evaluation
              : data.supervisor_evaluation;
            setEvalState(preFillTextFields(evalStateFromData(source)));
          }
          // Load saved supervisor scores from the JSON field
          if (data.supervisor_evaluation.supervisor_scores) {
            setSupervisorScores(data.supervisor_evaluation.supervisor_scores as Record<string, string>);
          }
        }
      });

    const statsPromise = fetch(`/api/employee-eval/approver/entries/${entryId}/stats`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: EmployeeStats | null) => { if (data) setEmployeeStats(data); })
      .catch(() => { /* stats are optional — silently ignore failures */ })
      .finally(() => setLoadingStats(false));

    const timelinePromise = fetch(`/api/employee-eval/entries/${entryId}/timeline`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: EvalTimelineEntry[]) => setEvalTimeline(data ?? []))
      .catch(() => setEvalTimeline([]))
      .finally(() => setLoadingTimeline(false));

    void statsPromise;
    void timelinePromise;

    entryPromise
      .catch(() => toast.error('Failed to load entry.'))
      .finally(() => setLoading(false));
  }, [entryId]);

  const columnGroups = useMemo(() => {
    if (!detail) return [];
    return buildColumnGroups(detail.period.frequency, detail.period_labels);
  }, [detail]);

  const scoreMap = useMemo(() => {
    if (!detail) return {};
    return buildScoreMap(detail.scores);
  }, [detail]);

  // Past labels for completion check
  const pastLabels = useMemo(() => {
    if (!detail) return new Set<string>();
    const allLabels = columnGroups.flatMap(g => g.columns);
    return computePastEvalLabels(detail.period, allLabels);
  }, [detail, columnGroups]);

  // Check if all supervisor score inputs (past months × tasks) are filled
  const allSupervisorScoresFilled = useMemo(() => {
    if (!detail) return false;
    for (const task of detail.tasklist) {
      for (const label of pastLabels) {
        const key = `${task.name}__${label}`;
        const val = supervisorScores[key];
        if (!val || val.trim() === '') return false;
      }
    }
    return true;
  }, [detail, pastLabels, supervisorScores]);

  // Check active quarter text fields are filled (all evaluation text sections are required)
  const activeQ = computeActiveQuarter(evalState);
  const allTextFieldsFilled = useMemo(() => {
    if (!activeQ) return true;
    const activeIdx = QUARTER_SEQUENCE.indexOf(activeQ as typeof QUARTER_SEQUENCE[number]);
    return ['strengths', 'weaknesses', 'training_required', 'supervisor_comments', 'employee_comments'].every(key => {
      const activeVal = (evalState as unknown as Record<string, string>)[`${key}_${activeQ}`] ?? '';
      if (activeVal.trim().length > 0) return true;
      for (let i = activeIdx - 1; i >= 0; i--) {
        const prevVal = (evalState as unknown as Record<string, string>)[`${key}_${QUARTER_SEQUENCE[i]}`] ?? '';
        if (prevVal.trim().length > 0) return true;
      }
      return false;
    });
  }, [evalState, activeQ]);

  // Check active quarter rating fields are filled — accepts a previous-quarter fallback value
  const allRatingsFilled = useMemo(() => {
    if (!activeQ) return true;
    const activeIdx = QUARTER_SEQUENCE.indexOf(activeQ as typeof QUARTER_SEQUENCE[number]);
    return RATING_FIELDS.every(f => {
      const key = `${f.key}_${activeQ}` as keyof EvalFormState;
      if ((evalState[key] as number | null) !== null) return true;
      // Accept if a previous quarter has a value (will be used as fallback on submit)
      for (let i = activeIdx - 1; i >= 0; i--) {
        const prevKey = `${f.key}_${QUARTER_SEQUENCE[i]}` as keyof EvalFormState;
        if ((evalState[prevKey] as number | null) !== null) return true;
      }
      return false;
    });
  }, [evalState, activeQ]);

  // Show submit button only when all required fields are filled
  const showSubmitButton = allSupervisorScoresFilled && allTextFieldsFilled && allRatingsFilled;

  function triggerAutoSave(nextState: EvalFormState, nextScores: Record<string, string>, stepId: number) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const csrf = await getCsrfToken();
        await fetch(`/api/employee-eval/approver/steps/${stepId}/eval/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
          credentials: 'include',
          body: JSON.stringify({ ...nextState, supervisor_scores: nextScores }),
        });
      } catch { /* silent auto-save */ }
    }, 800);
  }

  function handleEvalChange(next: EvalFormState) {
    setEvalState(next);
    if (detail?.my_step) triggerAutoSave(next, supervisorScores, detail.my_step.id);
  }

  function handleSupervisorScoreChange(key: string, value: string) {
    setSupervisorScores(prev => {
      const next = { ...prev, [key]: value };
      if (detail?.my_step) triggerAutoSave(evalState, next, detail.my_step.id);
      return next;
    });
  }

  async function refreshTimeline(entryId: number) {
    setLoadingTimeline(true);
    try {
      const res = await fetch(`/api/employee-eval/entries/${entryId}/timeline`, { credentials: 'include' });
      const data: EvalTimelineEntry[] = res.ok ? await res.json() : [];
      setEvalTimeline(data ?? []);
    } catch {
      /* silently ignore timeline refresh failures */
    } finally {
      setLoadingTimeline(false);
    }
  }

  async function handleSubmitEval() {
    if (!detail || detail.my_role !== 'supervisor' || submittingRef.current) return;
    const activeQuarter = computeActiveQuarter(evalState);

    // Build submission payload: fill null ratings from the most recent previous quarter
    // so that values pre-filled only at display time are persisted correctly.
    const submitPayload = { ...evalState } as Record<string, unknown>;
    if (activeQuarter) {
      const activeIdx = QUARTER_SEQUENCE.indexOf(activeQuarter as typeof QUARTER_SEQUENCE[number]);
      for (const f of RATING_FIELDS) {
        const key = `${f.key}_${activeQuarter}`;
        if (submitPayload[key] === null) {
          for (let i = activeIdx - 1; i >= 0; i--) {
            const prevKey = `${f.key}_${QUARTER_SEQUENCE[i]}`;
            if (submitPayload[prevKey] !== null) { submitPayload[key] = submitPayload[prevKey]; break; }
          }
        }
      }
      // Also carry forward quality comments if the active quarter's comment is empty
      const qc = { ...((submitPayload.quality_comments as Record<string, string>) ?? {}) };
      for (const f of RATING_FIELDS) {
        const commentKey = `${f.key}_${activeQuarter}_comment`;
        if (!qc[commentKey]) {
          for (let i = activeIdx - 1; i >= 0; i--) {
            const prevKey = `${f.key}_${QUARTER_SEQUENCE[i]}_comment`;
            if (qc[prevKey]) { qc[commentKey] = qc[prevKey]; break; }
          }
        }
      }
      submitPayload.quality_comments = qc;
    }

    // Validate: ratings must be non-null in the final payload
    const missing = new Set<string>();
    if (activeQuarter) {
      RATING_FIELDS.forEach(f => {
        const key = `${f.key}_${activeQuarter}`;
        if (submitPayload[key] == null) missing.add(key);
      });
    }
    if (missing.size > 0) {
      setValidationErrors(missing);
      toast.error('Please complete all required fields before submitting.');
      return;
    }
    setValidationErrors(new Set());
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const csrf = await getCsrfToken();
      const res = await fetch(`/api/employee-eval/approver/steps/${detail.my_step!.id}/eval/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        credentials: 'include',
        body: JSON.stringify({ ...submitPayload, supervisor_scores: supervisorScores }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail ?? 'Submit failed.'); }
      toast.success('Supervisor evaluation submitted!');
      void refreshTimeline(entryId);
      setDetail(prev => {
        if (!prev) return prev;
        const existing = prev.supervisor_evaluation;
        const nextSupervisorEvaluation: SupervisorEvalData = {
          id: existing?.id ?? 0,
          strengths_q1: evalState.strengths_q1,
          strengths_q2: evalState.strengths_q2,
          strengths_q3: evalState.strengths_q3,
          strengths_q4: evalState.strengths_q4,
          weaknesses_q1: evalState.weaknesses_q1,
          weaknesses_q2: evalState.weaknesses_q2,
          weaknesses_q3: evalState.weaknesses_q3,
          weaknesses_q4: evalState.weaknesses_q4,
          training_required_q1: evalState.training_required_q1,
          training_required_q2: evalState.training_required_q2,
          training_required_q3: evalState.training_required_q3,
          training_required_q4: evalState.training_required_q4,
          supervisor_comments_q1: evalState.supervisor_comments_q1,
          supervisor_comments_q2: evalState.supervisor_comments_q2,
          supervisor_comments_q3: evalState.supervisor_comments_q3,
          supervisor_comments_q4: evalState.supervisor_comments_q4,
          employee_comments_q1: evalState.employee_comments_q1,
          employee_comments_q2: evalState.employee_comments_q2,
          employee_comments_q3: evalState.employee_comments_q3,
          employee_comments_q4: evalState.employee_comments_q4,
          cost_consciousness_q1: evalState.cost_consciousness_q1,
          cost_consciousness_q2: evalState.cost_consciousness_q2,
          cost_consciousness_q3: evalState.cost_consciousness_q3,
          cost_consciousness_q4: evalState.cost_consciousness_q4,
          dependability_q1: evalState.dependability_q1,
          dependability_q2: evalState.dependability_q2,
          dependability_q3: evalState.dependability_q3,
          dependability_q4: evalState.dependability_q4,
          communication_q1: evalState.communication_q1,
          communication_q2: evalState.communication_q2,
          communication_q3: evalState.communication_q3,
          communication_q4: evalState.communication_q4,
          work_ethics_q1: evalState.work_ethics_q1,
          work_ethics_q2: evalState.work_ethics_q2,
          work_ethics_q3: evalState.work_ethics_q3,
          work_ethics_q4: evalState.work_ethics_q4,
          attendance_q1: evalState.attendance_q1,
          attendance_q2: evalState.attendance_q2,
          attendance_q3: evalState.attendance_q3,
          attendance_q4: evalState.attendance_q4,
          quality_comments: { ...evalState.quality_comments },
          supervisor_scores: existing?.supervisor_scores ?? supervisorScores,
          is_complete: true,
          submitted_at: new Date().toISOString(),
        };
        return { ...prev, supervisor_evaluation: nextSupervisorEvaluation };
      });
      window.dispatchEvent(new CustomEvent('employee-eval-approver-badge-refresh'));
      onReviewed(entryId);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Submit failed.');
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }

  async function handleFinalAction(action: 'approved' | 'disapproved') {
    if (!detail || detail.my_role !== 'final_approver' || submittingRef.current) return;
    if (action === 'disapproved' && !remarks.trim()) {
      toast.error('Remarks are required when disapproving.');
      return;
    }
    submittingRef.current = true;
    setActioning(true);
    try {
      const csrf = await getCsrfToken();
      const res = await fetch(`/api/employee-eval/approver/steps/${detail.my_step!.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        credentials: 'include',
        body: JSON.stringify({ action, remarks }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail ?? 'Action failed.'); }
      toast.success(action === 'approved' ? 'Evaluation approved!' : 'Evaluation returned for re-evaluation.');
      void refreshTimeline(entryId);
      window.dispatchEvent(new CustomEvent('employee-eval-approver-badge-refresh'));
      setDetail(prev => prev ? {
        ...prev,
        can_act: false,
        status: action === 'disapproved' ? 'returned' : prev.status,
        my_step: prev.my_step ? { ...prev.my_step, status: 'reviewed' } : prev.my_step,
      } : prev);
      onReviewed(entryId);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setActioning(false);
      submittingRef.current = false;
    }
  }

  if (loading) {
    return <FormSkeletonLoader />;
  }

  if (!detail) return null;

  const isSupervisor = detail.my_role === 'supervisor';
  const isFinalApprover = detail.my_role === 'final_approver';
  const canAct = detail.can_act;
  const isReviewed = detail.my_step?.status === 'reviewed';
  const evalIsComplete = detail.supervisor_evaluation?.is_complete ?? false;
  // Returned entries are re-evaluations by the Step 1 supervisor, so they should
  // show the editable supervisor form even if the current step is not yet marked
  // active in the same way as a fresh pending entry.
  const isSupervisorReadOnly = detail.status === 'returned'
    ? !isSupervisor || isReviewed
    : !canAct || evalIsComplete || isReviewed;
  const statusMeta = STATUS_META[detail.status] ?? { status: 'pending', label: detail.status };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin] p-5 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-base font-bold text-[var(--color-text-primary)]">{detail.employee_name}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {detail.department} · {detail.period.title} · FY {detail.period.fiscal_year}–{detail.period.fiscal_year + 1}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <StatusPill status={statusMeta.status} label={statusMeta.label} />
            {detail.supervisor_evaluation?.submitted_at && (
              <div className="rounded-2xl bg-emerald-50 px-2 text-[10px] font-medium text-emerald-800 flex items-center gap-2">
                <span>Submitted {formatDateTime(detail.supervisor_evaluation.submitted_at)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Disapproval notice */}
        {detail.status === 'returned' && (
          <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 px-2 py-1">
            <p className="text-[12px] font-semibold text-amber-700 dark:text-amber-400">Returned for Re-evaluation</p>
          </div>
        )}

        {/* Employee Stats Cards — above the score table */}
        <EmployeeStatsSection stats={employeeStats} loading={loadingStats} />

        {/* Performance scores table — ApproverScoreTable with dual columns */}
        <section>
          <ApproverScoreTable
            tasks={detail.tasklist}
            scoreMap={scoreMap}
            groups={columnGroups}
            frequency={detail.period.frequency}
            period={detail.period}
            supervisorScores={supervisorScores}
            onSupervisorScoreChange={handleSupervisorScoreChange}
            readOnly={isSupervisorReadOnly || isFinalApprover}
          />
        </section>

        {/* ── Supervisor: editable eval form ── */}
        {isSupervisor && !isSupervisorReadOnly && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-[var(--color-border)]" />
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">Performance Evaluation</p>
              <div className="h-px flex-1 bg-[var(--color-border)]" />
            </div>
            <SupervisorEvalForm
              state={evalState}
              onChange={handleEvalChange}
              validationErrors={validationErrors}
              forceShowOnComplete={detail.status === 'returned'}
            />
          </section>
        )}

        {/* ── Supervisor: submitted (read-only) ── */}
        {isSupervisor && evalIsComplete && detail.supervisor_evaluation && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-[var(--color-border)]" />
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">Performance Evaluation</p>
              <div className="h-px flex-1 bg-[var(--color-border)]" />
            </div>
            <SupervisorEvalReadOnly ev={
              (detail.status === 'returned' && detail.baseline_evaluation)
                ? detail.baseline_evaluation
                : detail.supervisor_evaluation
            } />
          </section>
        )}

        {/* ── Final approver: read-only supervisor eval ── */}
        {isFinalApprover && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-[var(--color-border)]" />
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">Supervisor&apos;s Evaluation</p>
              <div className="h-px flex-1 bg-[var(--color-border)]" />
            </div>
            {detail.supervisor_evaluation ? (
              <SupervisorEvalReadOnly ev={detail.supervisor_evaluation} />
            ) : (
              <p className="text-xs text-center text-[var(--color-text-muted)] py-4">No supervisor evaluation submitted yet.</p>
            )}
          </section>
        )}

        {/* Approval History Timeline — below Performance Qualities */}
        <ApprovalHistoryTimeline entries={evalTimeline} loading={loadingTimeline} />

      </div>

      {/* Footer actions */}
      <AnimatePresence initial={false}>
        {/* Supervisor submit — slides up from below only when all required inputs are filled */}
        {isSupervisor && !isSupervisorReadOnly && showSubmitButton && (
          <motion.div
            key="supervisor-footer"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 32 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            className="shrink-0 px-4 pb-4 pt-3 border-t border-[var(--color-border)] flex justify-end"
          >
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmitEval}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2 text-xs font-normal text-white transition-all',
                submitting ? 'bg-[#2845D6]/70 cursor-not-allowed' : 'bg-[#2845D6] hover:bg-[#1f37b9]',
              )}
            >
              {submitting ? (
                <TextShimmer duration={1.2} className="text-xs font-normal [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">Submitting…</TextShimmer>
              ) : (
                <><Send size={14} /> Submit Evaluation</>
              )}
            </button>
          </motion.div>
        )}

        {/* Final approver action */}
        {isFinalApprover && !isReviewed && canAct && (
          <motion.div
            key="final-footer"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="shrink-0 px-4 pb-4 pt-3 border-t border-[var(--color-border)] space-y-3 overflow-hidden"
          >
            <p className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Your Action</p>
            <TextareaWithCharactersLeft
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              maxLength={1000}
              placeholder="Remarks (required when disapproving)…"
              className="w-full"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={actioning}
                onClick={() => handleFinalAction('disapproved')}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-normal text-white transition-all',
                  actioning ? 'bg-red-300 cursor-not-allowed' : 'bg-[var(--btn-danger-bg)] hover:bg-[var(--btn-danger-hover)]',
                )}
              >
                <X size={14} /> Disapprove
              </button>
              <button
                type="button"
                disabled={actioning}
                onClick={() => handleFinalAction('approved')}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-normal text-white transition-all',
                  actioning ? 'bg-green-600/70 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700',
                )}
              >
                {actioning ? (
                  <TextShimmer duration={1.2} className="text-xs font-normal [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">Processing…</TextShimmer>
                ) : (
                  <><Check size={14} /> Approve</>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main approval view ─────────────────────────────────────────────────────────

function EvalApprovalView() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [showFormSkeleton, setShowFormSkeleton] = useState(false);
  const skeletonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNarrow = useMediaQuery('(max-width: 780px)');

  useEffect(() => { if (!isNarrow) setLeftPanelOpen(false); }, [isNarrow]);

  const fetchQueue = useCallback(async (withSkeleton = false) => {
    if (withSkeleton) setLoadingQueue(true);
    try {
      const res = await fetch('/api/employee-eval/approver/queue', { credentials: 'include' });
      const data = await res.json();
      const allItems: QueueItem[] = Array.isArray(data) ? data : (data.results ?? []);
      // Deduplicate by entry id — one card per employee per evaluation period.
      // A completed-then-resubmitted entry must update its existing card in-place.
      const seen = new Map<string, QueueItem>();
      for (const item of allItems) {
        const key = String(item.id);
        if (!seen.has(key)) seen.set(key, item);
      }
      setQueue(Array.from(seen.values()));
    } catch { /* silent */ }
    finally { if (withSkeleton) setLoadingQueue(false); }
  }, []);

  useEffect(() => { fetchQueue(true); }, [fetchQueue]);

  useEffect(() => {
    const interval = setInterval(() => fetchQueue(), 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') fetchQueue(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [fetchQueue]);

  const handleReviewed = useCallback((entryId: number) => {
    setQueue(prev => prev.map(item =>
      item.id === entryId ? { ...item, my_step_status: 'reviewed' } : item,
    ));
    fetchQueue();
  }, [fetchQueue]);

  function handleCardClick(item: QueueItem) {
    setSelectedId(prev => {
      if (prev !== item.id) {
        setShowFormSkeleton(true);
        if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
        skeletonTimerRef.current = setTimeout(() => setShowFormSkeleton(false), 1000);
      }
      return item.id;
    });
    if (isNarrow) setLeftPanelOpen(false);
  }

  const groups = [
    { label: 'Re-evaluate',  items: queue.filter(i => i.status === 'returned') },
    { label: 'For Approval', items: queue.filter(i => i.my_step_status === 'pending' && i.status !== 'returned') },
    { label: 'Reviewed',     items: queue.filter(i => i.my_step_status === 'reviewed') },
  ].filter(g => g.items.length > 0);

  const isEmpty = !loadingQueue && queue.length === 0;
  const selectedItem = queue.find(i => i.id === selectedId) ?? null;

  const listContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[var(--color-border)] shrink-0">
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">Approval Queue</p>
        {isNarrow && (
          <button
            onClick={() => setLeftPanelOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors"
            aria-label="Close queue"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {loadingQueue ? (
          <QueueListSkeleton />
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Users2 size={28} className="text-[var(--color-text-muted)] mb-2 opacity-40" />
            <p className="text-xs text-[var(--color-text-muted)]">No evaluations in your approval queue.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5 p-4">
            {groups.map(group => (
              <div key={group.label} className="flex flex-col gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] px-1">
                  {group.label}
                </p>
                <div className="flex flex-col gap-2">
                  {group.items.map(item => {
                    const isSelected = item.id === selectedId;
                    const isPending = item.my_step_status === 'pending';
                    const isReturned = item.status === 'returned';
                    const labelMeta = isPending ? { status: 'routing' as const } : { status: 'approved' as const };
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleCardClick(item)}
                        className={cn(
                          'w-full rounded-xl border p-4 text-left transition duration-200',
                          'hover:-translate-y-0.5 hover:shadow-sm outline-none',
                          isSelected
                            ? 'border-[#2845D6]/10 bg-[#eef2ff] dark:bg-[#2845D6]/10 shadow-md'
                            : 'border-transparent bg-[var(--color-bg-elevated)] shadow-sm',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn(
                            'text-sm font-semibold leading-snug truncate flex-1',
                            isSelected ? 'text-[#2845D6]' : 'text-[var(--color-text-primary)]',
                          )}>
                            {item.employee_name}
                          </p>
                          <div className="flex flex-wrap items-center gap-1 shrink-0">
                            {isReturned && !isPending && <StatusPill status="closed" label="Returned for Revision" />}
                            <StatusPill
                              status={labelMeta.status}
                              label={isPending ? (isReturned ? 'Re-evaluate' : (STEP_LABEL_MAP[item.my_step_label] ?? item.my_step_label)) : 'Reviewed'}
                            />
                          </div>
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--color-text-muted)] truncate">
                          FY {item.fiscal_year}–{item.fiscal_year + 1}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)] truncate">{item.period_title}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="shrink-0 px-4 sm:px-6 pt-5 pb-4 border-b border-[var(--color-border)] flex items-center gap-3">
        {isNarrow && (
          <button
            onClick={() => setLeftPanelOpen(v => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors shrink-0"
            aria-label="Toggle queue"
          >
            <List size={20} />
          </button>
        )}
        <div>
          <h1 className="text-lg font-bold text-[var(--color-text-primary)]">Employee Evaluation</h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Review and approve employee evaluations.</p>
        </div>
      </div>

      {/* Two-column body */}
      <div className="relative flex flex-1 overflow-hidden">

        {/* Backdrop — narrow only */}
        <AnimatePresence>
          {isNarrow && leftPanelOpen && (
            <motion.div
              key="eval-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-20 bg-black/40"
              onClick={() => setLeftPanelOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Left column */}
        <motion.div
          initial={false}
          animate={{ x: isNarrow && !leftPanelOpen ? '-100%' : 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className={cn(
            'shrink-0 border-r border-[var(--color-border)] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
            isNarrow
              ? 'absolute left-0 top-0 h-full w-[85%] max-w-[320px] z-30 bg-[var(--color-bg-elevated)]'
              : 'w-[30%]',
          )}
        >
          {listContent}
        </motion.div>

        {/* Right column */}
        <div className="flex-1 overflow-y-auto bg-[var(--color-bg-elevated)] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <AnimatePresence mode="wait" initial={false}>
            {isEmpty ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full items-center justify-center">
                <EmptyState
                  title="No evaluations to approve"
                  description="You will be notified when employee evaluations require your review."
                  icons={[Users2, ClipboardList, GraduationCap]}
                />
              </motion.div>
            ) : !selectedId ? (
              <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full items-center justify-center">
                <EmptyState
                  title="Select an evaluation to review"
                  description={isNarrow ? 'Tap the Queue button above to choose an evaluation.' : 'Choose an evaluation from the left panel to review it.'}
                  icons={[Users2, ClipboardList, GraduationCap]}
                />
              </motion.div>
            ) : showFormSkeleton ? (
              <FormSkeletonLoader key={`skel-${selectedId}`} />
            ) : selectedItem ? (
              <motion.div
                key={`panel-${selectedId}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                <DetailPanel
                  entryId={selectedId}
                  onReviewed={handleReviewed}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

export default function EmployeeEvaluationPage() {
  const router = useRouter();
  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');

  const fetchUser = useCallback(async () => {
    const timer = setTimeout(() => setAuthPhase('checking'), 350);
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      clearTimeout(timer);
      if (res.status === 401) { router.replace('/'); return; }
      if (!res.ok) { router.replace('/'); return; }
      const user: UserData = await res.json();
      if (!user.is_approver && !user.admin && !user.hr) {
        router.replace('/dashboard');
        return;
      }
      setAuthPhase('done');
    } catch {
      clearTimeout(timer);
      router.replace('/');
    }
  }, [router]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  if (authPhase === 'spinner') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#2845D6]" />
      </div>
    );
  }

  if (authPhase === 'checking') {
    return (
      <div className="flex h-full items-center justify-center">
        <TextShimmer className="text-sm" duration={1.4}>Checking permissions…</TextShimmer>
      </div>
    );
  }

  return <EvalApprovalView />;
}

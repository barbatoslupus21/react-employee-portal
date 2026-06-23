'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  List,
  Star,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { StatusPill } from '@/components/ui/status-pill';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { Rating } from '@/components/ui/rating';
import { Timeline } from '@/components/ui/timeline';
import type { TimelineItem, TimelineStatus } from '@/components/ui/timeline';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

// ── Types (mirrors employee-evaluation/page.tsx) ───────────────────────────────

interface UserData {
  id: number;
  idnumber: string;
  firstname: string;
  lastname: string;
  admin: boolean;
  hr: boolean;
}

interface Task {
  id: number;
  name: string;
  order: number;
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
  my_role: string | null;
  can_act: boolean;
  supervisor_evaluation: SupervisorEvalData | null;
  baseline_evaluation?: SupervisorEvalData | null;
  disapproval_remarks: string;
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

interface EmployeeStats {
  leave_days: number;
  leave_hours: number;
  certificates: number;
  trainings_completed: number;
  prf_requests: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

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

const QUARTER_SEQUENCE = ['q1', 'q2', 'q3', 'q4'] as const;

const STATUS_META: Record<string, { status: string; label: string }> = {
  pending:               { status: 'pending',     label: 'Pending' },
  supervisor_review:     { status: 'routing',     label: 'Supervisor Review' },
  user_confirmation:     { status: 'pending',     label: 'User Confirmation' },
  final_approval:        { status: 'routing',     label: 'Awaiting Final Approval' },
  second_final_approval: { status: 'routing',     label: 'Under Second Review' },
  returned:              { status: 'closed',      label: 'Returned for Revision' },
  completed:             { status: 'approved',    label: 'Completed' },
  disapproved:           { status: 'disapproved', label: 'Disapproved' },
};

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

function formatDateTime(s: string | null) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return s; }
}

function formatSelfScoreValue(value: string | undefined): string {
  if (!value || value.trim() === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return Number.isInteger(n) ? String(n) : String(n).replace(/\.0+$/, '');
}

// ── Score table (read-only, dual Self/Supervisor columns for past periods) ────

function ApproverScoreTableReadOnly({
  tasks,
  scoreMap,
  groups,
  frequency,
  period,
  supervisorScores,
}: {
  tasks: Task[];
  scoreMap: ScoreMap;
  groups: ColumnGroup[];
  frequency: string;
  period: { start_date: string; frequency: string };
  supervisorScores: Record<string, string>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const allLabels = groups.flatMap(g => g.columns);
  const showOverallTotal = groups.some(g => g.showGroupTotal);
  const hasGroupLabels = groups.some(g => g.groupLabel);
  const pastLabels = useMemo(() => computePastEvalLabels(period, allLabels), [period, allLabels]);

  if (!tasks.length) return <p className="text-xs text-center text-[var(--color-text-muted)] py-4">No tasks assigned.</p>;

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
  function groupDataColSpan(g: ColumnGroup): number {
    const baseCols = g.columns.reduce((acc, col) => acc + (pastLabels.has(col) ? 2 : 1), 0);
    return baseCols + ((g.showGroupTotal && frequency !== 'quarterly') ? 1 : 0);
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        'rounded-md border border-[var(--color-border)] overflow-x-auto shadow-[var(--shadow-sm)]',
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
          {hasGroupLabels && (
            <tr>
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
                  className="border-b border-r border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-center font-semibold text-[var(--color-text-secondary)] whitespace-nowrap"
                >
                  {g.groupLabel}
                </th>
              ))}
              {showOverallTotal && (
                <th
                  rowSpan={2}
                  className="border-b border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-center font-semibold text-[var(--color-text-secondary)] whitespace-nowrap align-middle"
                >
                  Overall Avg
                </th>
              )}
            </tr>
          )}
          <tr>
            {!hasGroupLabels && (
              <th className="sticky left-0 z-20 bg-[var(--color-bg)] border-b border-r border-[var(--color-border)] px-3 py-2 text-left font-semibold text-[var(--color-text-secondary)]">
                Tasklists
              </th>
            )}
            {groups.map((g) =>
              g.columns.map(col => {
                const isPast = pastLabels.has(col);
                return isPast ? (
                  <React.Fragment key={col}>
                    <th className="border-b border-r border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-center font-medium text-[var(--color-text-muted)] whitespace-nowrap">
                      <span className="text-[10px]">Self</span>
                      {/* <span className="ml-1 text-[9px] text-[var(--color-text-muted)]">({col})</span> */}
                    </th>
                    <th className="border-b border-r border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-center font-medium text-[#2845D6] whitespace-nowrap">
                      <span className="text-[10px]">Supervisor</span>
                      {/* <span className="ml-1 text-[9px] text-[#2845D6]/70">({col})</span> */}
                    </th>
                  </React.Fragment>
                ) : (
                  <th key={col} className="border-b border-r border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-center font-medium text-[var(--color-text-muted)] whitespace-nowrap">
                    <span className="text-[10px]">{col}</span>
                  </th>
                );
              })
            )}
            {groups.map((g, gi) =>
              g.showGroupTotal && frequency !== 'quarterly' ? (
                <th key={`gt-${gi}`} className="border-b border-r border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-center font-semibold text-[var(--color-text-secondary)] whitespace-nowrap text-[10px]">
                  Avg
                </th>
              ) : null
            )}
            {!hasGroupLabels && showOverallTotal && (
              <th className="border-b border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-center font-semibold text-[var(--color-text-secondary)] whitespace-nowrap">
                Overall Avg
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td
                className="sticky left-0 z-10 bg-[var(--color-bg-elevated)] border-b border-r border-[var(--color-border)] px-3 py-2 font-medium text-[var(--color-text-primary)] align-middle"
                style={{ minWidth: 160, maxWidth: 700 }}
              >
                {task.name}
              </td>
              {groups.flatMap((g, gi) => [
                ...g.columns.flatMap(col => {
                  const isPast = pastLabels.has(col);
                  if (isPast) {
                    const selfVal = formatSelfScoreValue(scoreMap[task.name]?.[col]);
                    const supKey = `${task.name}__${col}`;
                    const supVal = formatSelfScoreValue(supervisorScores[supKey]);
                    return [
                      <td key={`${col}-self`} className="border-b border-r border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-2 text-center">
                        <span className="text-xs text-[var(--color-text-muted)]">{selfVal}</span>
                      </td>,
                      <td key={`${col}-sup`} className="border-b border-r border-[var(--color-border)] bg-[#2845D6]/5 px-2 py-2 text-center">
                        <span className="text-xs font-medium text-[#2845D6]">{supVal}</span>
                      </td>,
                    ];
                  }
                  return [
                    <td key={col} className="border-b border-r border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-2" />,
                  ];
                }),
                ...(g.showGroupTotal && frequency !== 'quarterly' ? [
                  <td key={`gt-${gi}`} className="border-b border-r border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-center">
                    <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
                      {getSupervisorGroupAvg(g.columns, task.name)}
                    </span>
                  </td>,
                ] : []),
              ])}
              {showOverallTotal && (
                <td className="border-b border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-center">
                  <span className="text-xs font-bold text-[var(--color-text-primary)]">
                    {getSupervisorOverallAvg(task.name)}
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Supervisor eval read-only display ─────────────────────────────────────────

function EvalReadOnlySection({ ev }: { ev: SupervisorEvalData }) {
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
  }));

  return (
    <div className="space-y-6 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)]">
      <section className="space-y-4 bg-[var(--color-bg-elevated)] py-4">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-[var(--color-border)]" />
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">Performance Evaluation</p>
          <div className="h-px flex-1 bg-[var(--color-border)]" />
        </div>

        {evaluationValues.length ? evaluationValues.map(field => (
          <div key={field.key} className="space-y-1 px-4 pb-3">
            <p className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">{field.label}</p>
            <p className="text-xs pl-3 text-[var(--color-text-muted)] leading-relaxed">{field.value}</p>
          </div>
        )) : (
          <p className="text-xs text-[var(--color-text-muted)] px-4">No evaluation details available.</p>
        )}
      </section>

      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">Performance Qualities</p>
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <section className="space-y-3">
        {qualityItems.map(item => (
          <div key={item.key} className="px-4 py-3 space-y-2">
            <p className="text-[11px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">{item.label}</p>
            <div className="flex items-center gap-2 pl-3">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} size={14} className={cn(i < (item.rating ?? 0) ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300')} />
                ))}
              </div>
              <span className="text-xs text-[var(--color-text-muted)]">{item.rating !== null ? `${item.rating}/5` : 'No rating'}</span>
            </div>
            {item.comment && (
              <p className="text-xs pl-3 text-[var(--color-text-muted)] leading-relaxed italic">{item.comment}</p>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

// ── Approval History Timeline ─────────────────────────────────────────────────

function ApprovalHistoryTimeline({
  entries,
  loading,
  approvalSteps,
}: {
  entries: EvalTimelineEntry[];
  loading: boolean;
  approvalSteps: ApprovalStep[];
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
            <div key={i} className="h-8 rounded bg-[var(--color-bg-elevated)] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Find the current active (pending + activated) approver step to show as the current step in the timeline
  const currentStep = approvalSteps.find(
    s => s.status === 'pending' && s.activated_at !== null,
  ) ?? null;

  if (!entries.length && !currentStep) return null;

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
            <p className="text-xs text-[var(--color-text-muted)] italic">&ldquo;{entry.remarks}&rdquo;</p>
          )}
        </div>
      ),
      status: tlStatus,
    };
  });

  // Append current pending approver as the last timeline item (yellow)
  if (currentStep) {
    items.push({
      id: `current-step-${currentStep.id}`,
      title: (
        <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400">
          {currentStep.approver_name ?? 'Pending Approver'}
        </p>
      ),
      description: (
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status="pending" label="Awaiting Review" />
          {currentStep.activated_at && (
            <span className="text-[11px] text-[var(--color-text-muted)]">
              Since {formatDateTime(currentStep.activated_at)}
            </span>
          )}
        </div>
      ),
      status: 'pending',
    });
  }

  return (
    <div className="space-y-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">Approval History</p>
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>
      <Timeline items={items} variant="compact" showTimestamps={false} />
    </div>
  );
}

// ── Employee Stats ─────────────────────────────────────────────────────────────

function EvalStatCard({ icon: Icon, value, label, sublabel }: {
  icon: React.ElementType;
  value: string | number;
  label: string;
  sublabel: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
        <Icon size={12} />
        <p className="text-[10px] font-semibold uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-xl font-bold text-[var(--color-text-primary)] leading-none">{value}</p>
      <p className="text-[10px] text-[var(--color-text-muted)]">{sublabel}</p>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-[var(--color-bg-card)]', className)} />;
}

function ContentSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <SkeletonBlock key={i} className="h-20" />)}
      </div>
      <SkeletonBlock className="h-64" />
      <SkeletonBlock className="h-48" />
      <SkeletonBlock className="h-32" />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminEvalEntryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const periodId = Number(params?.id);
  const entryId = Number(params?.entryId);

  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');
  const [user, setUser] = useState<UserData | null>(null);
  const [detail, setDetail] = useState<EntryDetail | null>(null);
  const [stats, setStats] = useState<EmployeeStats | null>(null);
  const [timeline, setTimeline] = useState<EvalTimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTimeline, setLoadingTimeline] = useState(true);

  // Auth check
  useEffect(() => {
    const timer = setTimeout(() => setAuthPhase('checking'), 350);
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => { if (!r.ok) { router.push('/'); return null; } return r.json(); })
      .then((u: UserData | null) => {
        clearTimeout(timer);
        if (!u) { router.push('/'); return; }
        if (!u.admin && !u.hr) { router.push('/dashboard'); return; }
        setUser(u);
        setAuthPhase('done');
      })
      .catch(() => { clearTimeout(timer); router.push('/'); });
    return () => clearTimeout(timer);
  }, [router]);

  // Fetch data after auth
  useEffect(() => {
    if (authPhase !== 'done' || !entryId) return;

    setLoading(true);
    setLoadingTimeline(true);

    Promise.all([
      fetch(`/api/employee-eval/admin/entries/${entryId}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
      fetch(`/api/employee-eval/approver/entries/${entryId}/stats`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
    ]).then(([entryData, statsData]) => {
      if (!entryData) {
        toast.error('Could not load evaluation entry.', { title: 'Error' });
      } else {
        setDetail(entryData as EntryDetail);
        setStats(statsData as EmployeeStats | null);
      }
      setLoading(false);
    }).catch(() => {
      toast.error('Failed to load evaluation details.', { title: 'Error' });
      setLoading(false);
    });

    fetch(`/api/employee-eval/entries/${entryId}/timeline`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: EvalTimelineEntry[]) => setTimeline(data))
      .catch(() => setTimeline([]))
      .finally(() => setLoadingTimeline(false));
  }, [authPhase, entryId]);

  // Auth phase gates
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
  if (!user || !periodId || !entryId) return null;

  const backHref = `/dashboard/assessments/employee-review/${periodId}`;

  // Build derived data
  const scoreMap: ScoreMap = detail ? buildScoreMap(detail.scores) : {};
  const supervisorScores: Record<string, string> = detail?.supervisor_evaluation?.supervisor_scores ?? {};
  const groups: ColumnGroup[] = detail ? buildColumnGroups(detail.period.frequency, detail.period_labels) : [];
  const tasks: Task[] = detail?.tasklist ?? [];

  const statusMeta = detail ? (STATUS_META[detail.status] ?? { status: 'pending', label: detail.status }) : null;

  const leaveHours = stats
    ? (Number.isInteger(stats.leave_hours) ? String(stats.leave_hours) : stats.leave_hours.toFixed(1))
    : '0';

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.push(backHref)}
        className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
      >
        <ArrowLeft size={13} />
        Back to Period Results
      </button>

      {/* Header */}
      {detail && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold text-[var(--color-text-primary)]">{detail.employee_name}</h1>
            {statusMeta && <StatusPill status={statusMeta.status} label={statusMeta.label} />}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-muted)]">
            <span>{detail.employee_id_number}</span>
            {detail.department && <span>{detail.department}</span>}
            <span>{detail.period.title}</span>
            <span>FY {detail.period.fiscal_year}–{detail.period.fiscal_year + 1}</span>
          </div>
        </div>
      )}

      {loading ? <ContentSkeleton /> : detail ? (
        <div className="space-y-8">
          {/* Section 1: Employee Stats */}
          {stats && (
            <section>
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Employee Overview</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <EvalStatCard
                  icon={CalendarDays}
                  value={stats.leave_days}
                  label="Leave Taken"
                  sublabel={`${stats.leave_days} ${stats.leave_days === 1 ? 'day' : 'days'} · ${leaveHours} ${stats.leave_hours === 1 ? 'hour' : 'hours'}`}
                />
                <EvalStatCard
                  icon={ClipboardList}
                  value={stats.certificates}
                  label="Certificates"
                  sublabel="Company-issued"
                />
                <EvalStatCard
                  icon={GraduationCap}
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
            </section>
          )}

          {/* Section 2: Score Table */}
          {tasks.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Performance Scores</h2>
              <ApproverScoreTableReadOnly
                tasks={tasks}
                scoreMap={scoreMap}
                groups={groups}
                frequency={detail.period.frequency}
                period={detail.period}
                supervisorScores={supervisorScores}
              />
            </section>
          )}

          {/* Section 3 & 4: Performance Evaluation + Qualities */}
          {detail.supervisor_evaluation && (
            <section>
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Supervisor Evaluation</h2>
              <EvalReadOnlySection ev={detail.supervisor_evaluation} />
            </section>
          )}

          {/* Section 5: Approval History Timeline */}
          <section>
            <ApprovalHistoryTimeline
              entries={timeline}
              loading={loadingTimeline}
              approvalSteps={detail.approval_steps}
            />
          </section>
        </div>
      ) : (
        <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">Entry not found.</div>
      )}
    </div>
  );
}

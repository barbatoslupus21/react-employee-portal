'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  ClipboardList,
  FileText,
  GraduationCap,
  List,
  Send,
  X,
  RotateCcw,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { StatusPill } from '@/components/ui/status-pill';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { EmptyState } from '@/components/ui/interactive-empty-state';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import BasicCheckbox from '@/components/ui/checkbox-1';
import { Rating } from '@/components/ui/rating';
import { getCsrfToken } from '@/lib/csrf';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import { RatingInteraction } from '@/components/ui/emoji-rating';
import { TextareaWithCharactersLeft } from '@/components/ui/textarea-with-characters-left';

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

interface ApproverQueueItem {
  id: number;
  employee_name: string;
  employee_idnumber: string;
  training_title: string;
  training_date: string;
  speaker: string;
  my_step_id: number;
  my_step_status: 'pending' | 'reviewed';
  can_review: boolean;
  evaluation_submitted: boolean;
  submitted_at: string;
  submission_status: string;
  my_role: 'supervisor' | 'final_approver';
  final_remarks: string;
}

interface TrainingQuestion {
  id: number;
  question_text: string;
  question_type: string;
  order: number;
  is_required: boolean;
  allow_other: boolean;
  options: { id: number; option_text: string; order: number }[];
  rating_config: {
    min_value: number;
    max_value: number;
    min_label: string;
    max_label: string;
  } | null;
}

interface AnswerRaw {
  id: number;
  question_id: number;
  text_value: string;
  number_value: number | null;
  selected_options: { id: number; option_text: string; order: number }[];
  other_text: string;
}

interface ApproverStepInfo {
  id: number;
  sequence: number;
  status: string;
  approver_name: string | null;
  approver_position: string | null;
  acted_at: string | null;
  activated_at: string | null;
}

interface SupervisorEvaluationData {
  result_and_impact: string;
  recommendation: string;
  overall_assessment: number | null;
  is_complete: boolean;
  submitted_at: string | null;
}

interface FinalApproverRemark {
  approver_name: string | null;
  action: string;
  acted_at: string | null;
  remarks: string;
}

interface SubmissionDetail {
  training_title: string;
  training_date: string;
  training_objective: string;
  employee_name: string;
  questions: TrainingQuestion[];
  user_answers: AnswerRaw[];
  submission_status: string;
  my_role: 'supervisor' | 'final_approver';
  supervisor_evaluation: SupervisorEvaluationData | null;
  my_evaluation: SupervisorEvaluationData | null;
  step: ApproverStepInfo;
  step1_info: ApproverStepInfo | null;
  can_review: boolean;
  final_remarks: string | null;
  final_approver_remarks: FinalApproverRemark[];
}

type AnswerValue = {
  text_value?: string;
  number_value?: string;
  other_text?: string;
  selected_option_ids?: number[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CHOICE_BASED_TYPES = new Set(['single_choice', 'multiple_choice', 'dropdown']);
const INSTRUCTION_Q_TYPES = new Set(['section', 'subsection', 'statement']);

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTrainingDate(dateStr: string): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

function answerToValue(raw: AnswerRaw): AnswerValue {
  return {
    text_value: raw.text_value,
    number_value: raw.number_value != null ? String(raw.number_value) : undefined,
    other_text: raw.other_text,
    selected_option_ids: raw.selected_options.map(o => o.id),
  };
}

// ── QuestionInput ─────────────────────────────────────────────────────────────

function QuestionInput({
  q,
  answer,
  onChange,
  readOnly,
}: {
  q: TrainingQuestion;
  answer: AnswerValue;
  onChange: (a: AnswerValue) => void;
  readOnly: boolean;
}) {
  function sanitize(v: string): string {
    return v.replace(/[<>{}\[\]\\|^~`"]/g, '');
  }

  if (INSTRUCTION_Q_TYPES.has(q.question_type)) {
    return (
      <p className={cn(
        'leading-snug',
        q.question_type === 'section' ? 'text-sm font-bold text-[var(--color-text-primary)]' :
        q.question_type === 'subsection' ? 'text-[15px] font-normal text-[var(--color-text-secondary)]' :
        'text-[15px] italic text-[var(--color-text-secondary)]',
      )}>
        {q.question_type === 'statement' ? `"${q.question_text}"` : q.question_text}
      </p>
    );
  }

  const sel = answer.selected_option_ids ?? [];

  if (q.question_type === 'single_choice') {
    return (
      <div className="flex flex-col gap-2 pl-6">
        {q.options.map(opt => (
          <label key={opt.id} className={cn('flex items-center gap-2 transition-colors', readOnly && 'cursor-default')}>
            <span className={cn(
              'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all',
              sel[0] === opt.id ? 'border-[#2b7fff] bg-[#2b7fff] text-white' : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)]',
            )}>
              <span className="text-[10px]">{sel[0] === opt.id ? '●' : ''}</span>
            </span>
            <input type="radio" className="hidden" checked={sel[0] === opt.id} disabled={readOnly}
              onChange={() => !readOnly && onChange({ ...answer, selected_option_ids: [opt.id] })} />
            <span className="text-xs font-normal text-[var(--color-text-muted)]">{opt.option_text}</span>
          </label>
        ))}
        {q.allow_other && (
          <div className={cn('flex flex-col gap-3 transition-colors', readOnly && 'opacity-60')}>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className={cn(
                'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all',
                sel.includes(-1) ? 'border-[#2b7fff] bg-[#2b7fff] text-white' : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)]',
              )}>
                <span className="text-[10px]">{sel.includes(-1) ? '●' : ''}</span>
              </span>
              <input type="radio" className="hidden" checked={sel.includes(-1)} disabled={readOnly}
                onChange={() => !readOnly && onChange({ ...answer, selected_option_ids: [-1] })} />
              <span className="text-xs font-normal text-[var(--color-text-muted)]">Other:</span>
            </label>
            {sel.includes(-1) && (
              <div className="w-1/2">
                <Input type="text" value={answer.other_text ?? ''} disabled={readOnly} placeholder="Please specify…"
                  onChange={e => !readOnly && onChange({ ...answer, other_text: sanitize(e.target.value) })} />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (q.question_type === 'multiple_choice') {
    return (
      <div className="flex flex-col gap-2 pl-6">
        {q.options.map(opt => (
          <BasicCheckbox
            key={opt.id}
            checked={sel.includes(opt.id)}
            disabled={false}
            label={opt.option_text}
            onCheckedChange={checked => {
              if (readOnly) return;
              const next = checked ? [...sel, opt.id] : sel.filter(x => x !== opt.id);
              onChange({ ...answer, selected_option_ids: next });
            }}
            className={cn('rounded-xl transition-colors', readOnly && 'pointer-events-none')}
          />
        ))}
        {q.allow_other && (
          <div className="space-y-2">
            <BasicCheckbox
              checked={sel.includes(-1)}
              disabled={false}
              label="Other"
              onCheckedChange={checked => {
                if (readOnly) return;
                const next = checked ? [...sel, -1] : sel.filter(x => x !== -1);
                onChange({ ...answer, selected_option_ids: next });
              }}
              className={cn('rounded-xl transition-colors', readOnly && 'pointer-events-none')}
            />
            {sel.includes(-1) && (
              readOnly ? (
                <div className="pl-6 text-xs text-[var(--color-text-muted)]">{answer.other_text ?? ''}</div>
              ) : (
                <input
                  type="text"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#2845D6]"
                  value={answer.other_text ?? ''}
                  maxLength={500}
                  placeholder="Please specify…"
                  onChange={e => !readOnly && onChange({ ...answer, other_text: sanitize(e.target.value) })}
                />
              )
            )}
          </div>
        )}
      </div>
    );
  }

  if (q.question_type === 'dropdown') {
    const sv = sel[0] ? String(sel[0]) : '';
    const selOpt = q.options.find(o => o.id === sel[0]);
    if (readOnly) return (
      <div className="pl-6">
        <p className="text-xs font-normal text-[var(--color-text-muted)]">Answer: {selOpt?.option_text ?? '—'}</p>
      </div>
    );
    return (
      <div className="pl-6 w-1/2">
        <Select value={sv} onValueChange={v => onChange({ ...answer, selected_option_ids: v ? [parseInt(v, 10)] : [] })}>
          <SelectTrigger><SelectValue placeholder="Select an option" /></SelectTrigger>
          <SelectContent>
            {q.options.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.option_text}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (q.question_type === 'yes_no') {
    return (
      <div className="flex flex-col gap-2 pl-6">
        {['Yes', 'No'].map(opt => (
          <label key={opt} className={cn('flex items-center gap-2', readOnly && 'cursor-default')}>
            <span className={cn(
              'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all',
              answer.text_value === opt ? 'border-[#2b7fff] bg-[#2b7fff] text-white' : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)]',
            )}>
              <span className="text-[10px]">{answer.text_value === opt ? '●' : ''}</span>
            </span>
            <input type="radio" className="hidden" checked={answer.text_value === opt} disabled={readOnly}
              onChange={() => !readOnly && onChange({ ...answer, text_value: opt })} />
            <span className="text-xs font-normal text-[var(--color-text-muted)]">{opt}</span>
          </label>
        ))}
      </div>
    );
  }

  if (q.question_type === 'rating') {
    const cfg = q.rating_config ?? { min_value: 1, max_value: 5, min_label: '', max_label: '' };
    const selected = answer.number_value ? parseInt(answer.number_value, 10) : 0;
    return (
      <div className="flex flex-col items-start gap-2 pl-6">
        <Rating
          rating={selected}
          maxRating={cfg.max_value}
          editable={!readOnly}
          onRatingChange={v => !readOnly && onChange({ ...answer, number_value: String(v) })}
          className="w-full justify-start"
          size="lg"
        />
        {(cfg.min_label || cfg.max_label) && (
          <div className="flex w-full justify-between text-[10px] text-[var(--color-text-muted)] mt-1">
            <span>{cfg.min_label}</span>
            <span>{cfg.max_label}</span>
          </div>
        )}
      </div>
    );
  }

  if (q.question_type === 'likert') {
    return (
      <div className="bg-transparent pl-6">
        <RatingInteraction
          value={answer.number_value ? parseInt(answer.number_value, 10) : 0}
          disabled={readOnly}
          onChange={value => !readOnly && onChange({ ...answer, number_value: String(value) })}
          className="bg-transparent"
        />
      </div>
    );
  }

  if (q.question_type === 'linear_scale') {
    const cfg = q.rating_config ?? { min_value: 1, max_value: 10, min_label: '', max_label: '' };
    const steps = Array.from({ length: cfg.max_value - cfg.min_value + 1 }, (_, i) => i + cfg.min_value);
    const selNum = answer.number_value ? parseInt(answer.number_value, 10) : null;
    return (
      <div className="pl-6 flex flex-col gap-2">
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
          {steps.map(v => (
            <button
              key={v}
              type="button"
              disabled={readOnly}
              onClick={() => !readOnly && onChange({ ...answer, number_value: String(v) })}
              className={cn(
                'h-9 w-full rounded-lg border text-sm font-semibold transition-colors',
                selNum === v
                  ? 'border-[#2845D6] bg-[#2845D6] text-white'
                  : 'border-[var(--color-border)] hover:border-[#2845D6] text-[var(--color-text-primary)]',
                readOnly && 'cursor-default',
              )}
            >
              {v}
            </button>
          ))}
        </div>
        {(cfg.min_label || cfg.max_label) && (
          <div className="flex justify-between text-[10px] text-[var(--color-text-muted)]">
            <span>{cfg.min_label}</span>
            <span>{cfg.max_label}</span>
          </div>
        )}
      </div>
    );
  }

  if (q.question_type === 'number') {
    if (readOnly) return (
      <div className="pl-6">
        <p className="text-xs font-normal text-[var(--color-text-muted)]">Answer: {answer.number_value ?? ''}</p>
      </div>
    );
    return (
      <div className="pl-6 w-1/2">
        <Input
          type="number"
          value={answer.number_value ?? ''}
          disabled={readOnly}
          placeholder="0"
          onChange={e => !readOnly && onChange({ ...answer, number_value: e.target.value })}
        />
      </div>
    );
  }

  if (q.question_type === 'date') {
    const dateValue = answer.text_value ? new Date(`${answer.text_value}T00:00:00`) : undefined;
    if (readOnly) return (
      <div className="pl-6">
        <p className="text-xs font-normal text-[var(--color-text-muted)]">Answer: {answer.text_value ?? ''}</p>
      </div>
    );
    return (
      <div className="pl-6 w-1/2">
        <DateTimePicker
          value={dateValue}
          disabled={readOnly}
          onChange={date => !readOnly && onChange({ ...answer, text_value: date.toISOString().slice(0, 10) })}
          placeholder="Select a date"
          displayFormat="MMM d, yyyy"
          className="w-full"
        />
      </div>
    );
  }

  if (q.question_type === 'short_text') {
    if (readOnly) return (
      <div className="pl-6">
        <p className="text-xs font-normal text-[var(--color-text-muted)]">Answer: {answer.text_value ?? ''}</p>
      </div>
    );
    return (
      <div className="pl-6 w-1/2">
        <Input
          type="text"
          value={answer.text_value ?? ''}
          disabled={readOnly}
          maxLength={500}
          placeholder="Your answer…"
          onChange={e => !readOnly && onChange({ ...answer, text_value: sanitize(e.target.value) })}
        />
      </div>
    );
  }

  if (q.question_type === 'long_text') {
    if (readOnly) return (
      <div className="pl-6">
        <p className="text-xs font-normal text-[var(--color-text-muted)]">Answer: {answer.text_value ?? ''}</p>
      </div>
    );
    return (
      <div className="pl-6">
        <TextareaWithCharactersLeft
          value={answer.text_value ?? ''}
          onChange={e => !readOnly && onChange({ ...answer, text_value: sanitize(e.target.value) })}
          disabled={readOnly}
          maxLength={5000}
          placeholder="Your answer…"
          className="w-full"
        />
      </div>
    );
  }

  return (
    <div className="pl-6 w-1/2">
      <Input
        type="text"
        value={answer.text_value ?? ''}
        disabled={readOnly}
        onChange={e => !readOnly && onChange({ ...answer, text_value: sanitize(e.target.value) })}
        placeholder="Your answer…"
        maxLength={1000}
      />
    </div>
  );
}

// ── Skeleton loaders ──────────────────────────────────────────────────────────

function FormSkeletonLoader() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="flex flex-col"
    >
      <div className="px-5 pt-4 pb-3 border-b border-[var(--color-border)] space-y-2">
        <div className="h-4 w-2/3 rounded bg-[var(--color-bg-card)] animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-[var(--color-bg-card)] animate-pulse" />
      </div>
      <div className="p-4 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 animate-pulse space-y-3">
            <div className="h-3 w-3/4 rounded bg-[var(--color-bg-card)]" />
            <div className="h-8 w-full rounded bg-[var(--color-bg-card)]" />
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function QueueListSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-xl bg-[var(--color-bg-elevated)] p-4 animate-pulse space-y-2">
          <div className="h-3 w-3/4 rounded bg-[var(--color-bg-card)]" />
          <div className="h-2.5 w-1/2 rounded bg-[var(--color-bg-card)]" />
          <div className="h-2.5 w-1/3 rounded bg-[var(--color-bg-card)]" />
        </div>
      ))}
    </div>
  );
}

// ── Question section renderer ─────────────────────────────────────────────────

function QuestionSection({
  questions,
  answerMap,
  onChange,
  readOnly,
  canEdit,
}: {
  questions: TrainingQuestion[];
  answerMap: Record<number, AnswerValue>;
  onChange?: (qId: number, val: AnswerValue) => void;
  readOnly: boolean;
  canEdit?: boolean;
}) {
  if (questions.length === 0) {
    return (
      <p className="text-xs text-[var(--color-text-muted)] italic text-center py-4">
        No questions for this section.
      </p>
    );
  }

  type RenderItem =
    | { type: 'question'; question: TrainingQuestion }
    | { type: 'instruction-group'; questions: TrainingQuestion[] };

  const items: RenderItem[] = [];
  let currentGroup: TrainingQuestion[] = [];

  for (const q of questions) {
    if (INSTRUCTION_Q_TYPES.has(q.question_type)) {
      currentGroup.push(q);
    } else {
      if (currentGroup.length > 0) {
        items.push({ type: 'instruction-group', questions: currentGroup });
        currentGroup = [];
      }
      items.push({ type: 'question', question: q });
    }
  }
  if (currentGroup.length > 0) items.push({ type: 'instruction-group', questions: currentGroup });

  let qCounter = 0;

  return (
    <div className="space-y-3">
      {items.map((item, idx) => {
        if (item.type === 'instruction-group') {
          return (
            <div key={`instr-${idx}`} className="rounded-xl bg-[var(--color-bg-elevated)] p-4 space-y-2">
              {item.questions.map(q => (
                <p key={q.id} className={cn(
                  q.question_type === 'section'
                    ? 'text-sm font-bold leading-snug text-[var(--color-text-primary)]'
                    : q.question_type === 'subsection'
                    ? 'text-[15px] font-normal leading-snug text-[var(--color-text-secondary)]'
                    : 'text-[15px] italic leading-snug text-[var(--color-text-secondary)]',
                )}>
                  {q.question_type === 'statement' ? `"${q.question_text}"` : q.question_text}
                </p>
              ))}
            </div>
          );
        }
        const q = item.question;
        qCounter += 1;
        return (
          <div key={q.id} className="rounded-xl bg-[var(--color-bg-elevated)] p-4 space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-[15px] font-normal leading-snug text-[var(--color-text-secondary)] shrink-0">
                Q{qCounter}.
              </span>
              <p className="text-[15px] font-normal text-[var(--color-text-secondary)] leading-snug">
                {q.question_text}
                {canEdit && q.is_required && <span className="text-red-500 ml-0.5">*</span>}
              </p>
            </div>
            <QuestionInput
              q={q}
              answer={answerMap[q.id] ?? {}}
              onChange={val => onChange?.(q.id, val)}
              readOnly={readOnly}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Submission Detail Panel ───────────────────────────────────────────────────

function SubmissionDetailPanel({
  submissionId,
  queueItem,
  onReviewed,
}: {
  submissionId: number;
  queueItem: ApproverQueueItem;
  onReviewed: (submissionId: number) => void;
}) {
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Supervisor form state
  const [resultAndImpact, setResultAndImpact] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [overallAssessment, setOverallAssessment] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Final approver form state
  const [remarks, setRemarks] = useState('');
  const [actioning, setActioning] = useState(false);

  const fetchDetail = useCallback(async () => {
    const r = await fetch(`/api/training/approver/submissions/${submissionId}`, { credentials: 'include' });
    const d: SubmissionDetail = await r.json();
    setDetail(d);
    // Pre-populate supervisor form if my_evaluation exists
    if (d.my_role === 'supervisor' && d.my_evaluation) {
      setResultAndImpact(d.my_evaluation.result_and_impact);
      setRecommendation(d.my_evaluation.recommendation);
      setOverallAssessment(d.my_evaluation.overall_assessment ?? 0);
    }
    return d;
  }, [submissionId]);

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    setResultAndImpact('');
    setRecommendation('');
    setOverallAssessment(0);
    setRemarks('');
    fetchDetail()
      .catch(() => toast.error('Failed to load submission.', { title: 'Error' }))
      .finally(() => setLoading(false));
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [submissionId, fetchDetail]);

  // Debounced auto-save for supervisor eval
  function triggerAutoSave(rai: string, rec: string, oa: number) {
    if (!detail || detail.my_role !== 'supervisor') return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/training/approver/steps/${detail.step.id}/eval/save`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
          body: JSON.stringify({
            result_and_impact: rai,
            recommendation: rec,
            overall_assessment: oa || null,
          }),
        });
      } catch { /* silent */ }
    }, 800);
  }

  async function handleSupervisorSubmit() {
    if (!detail || submitting) return;
    if (!resultAndImpact.trim() || !recommendation.trim() || !overallAssessment) {
      toast.error('Please fill in all fields and provide a rating.', { title: 'Incomplete' });
      return;
    }
    setSubmitting(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    try {
      const res = await fetch(`/api/training/approver/steps/${detail.step.id}/eval/submit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({
          result_and_impact: resultAndImpact,
          recommendation: recommendation,
          overall_assessment: overallAssessment,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.detail ?? 'Submission failed.', { title: 'Error' });
        return;
      }
      toast.success('Evaluation submitted. Awaiting employee confirmation.', { title: 'Submitted' });
      window.dispatchEvent(new CustomEvent('training-approval-badge-refresh'));
      onReviewed(submissionId);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFinalAction(action: 'approved' | 'disapproved') {
    if (!detail || actioning) return;
    if (action === 'disapproved' && !remarks.trim()) {
      toast.error('Remarks are required when disapproving.', { title: 'Required' });
      return;
    }
    setActioning(true);
    try {
      const res = await fetch(`/api/training/approver/steps/${detail.step.id}/action`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ action, remarks }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.detail ?? 'Action failed.', { title: 'Error' });
        return;
      }
      toast.success(
        action === 'approved' ? 'Training evaluation approved and completed.' : 'Returned for re-evaluation.',
        { title: action === 'approved' ? 'Approved' : 'Returned' },
      );
      window.dispatchEvent(new CustomEvent('training-approval-badge-refresh'));
      onReviewed(submissionId);
    } finally {
      setActioning(false);
    }
  }

  if (loading) return <FormSkeletonLoader />;
  if (!detail) return null;

  const myRole = detail.my_role;
  const isReviewed = queueItem.my_step_status === 'reviewed';
  const isSupervisorReadOnly = isReviewed || !detail.can_review;
  const isReturned = detail.submission_status === 'returned';

  const userAnswerMap: Record<number, AnswerValue> = {};
  for (const ans of detail.user_answers) {
    userAnswerMap[ans.question_id] = answerToValue(ans);
  }

  return (
    <motion.div
      key={`detail-${submissionId}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-[var(--color-border)] shrink-0">
        {isReturned && (
          <div className="mb-2 rounded-lg bg-red-100 dark:bg-red-950/40 px-3 py-2 flex flex-row gap-1 items-center">
            <RotateCcw size={13} className="text-red-500 dark:text-red-400 shrink-0" />
            <p className="text-xs font-medium text-red-500 dark:text-red-400">Returned for Re-evaluation, See below for the final approver&apos;s remarks.</p>
          </div>
        )}
        {/* {isReviewed && myRole === 'supervisor' && !isReturned && (
          <div className="mb-2 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-2 flex items-center gap-2">
            <Check size={13} className="text-green-600 dark:text-green-400 shrink-0" />
            <span className="text-xs font-medium text-green-700 dark:text-green-400">You have submitted your evaluation. Awaiting employee confirmation.</span>
          </div>
        )} */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[var(--color-text-primary)] truncate">{detail.employee_name}</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
              {detail.training_title} · {formatTrainingDate(detail.training_date)}
            </p>
          </div>
          <StatusPill
            status={isReviewed ? 'approved' : 'pending'}
            label={isReviewed ? 'Reviewed' : 'For Approval'}
          />
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden p-4 space-y-6">

        {/* Employee's Evaluation */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-[var(--color-border)]" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">Employee&apos;s Evaluation</p>
            <div className="h-px flex-1 bg-[var(--color-border)]" />
          </div>
          {detail.questions.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)] italic text-center py-4">No questions in this training.</p>
          ) : (
            <QuestionSection questions={detail.questions} answerMap={userAnswerMap} readOnly={true} />
          )}
        </section>

        {/* Supervisor evaluation section */}
        {myRole === 'supervisor' && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-[var(--color-border)]" />
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">Your Evaluation</p>
              <div className="h-px flex-1 bg-[var(--color-border)]" />
            </div>
            <div className="space-y-1">
              <div className="rounded-xl bg-[var(--color-bg-elevated)] p-4 space-y-3">
                <p className="text-[15px] font-normal text-[var(--color-text-secondary)]">
                  Result and Impact{!isSupervisorReadOnly && <span className="text-red-500"> *</span>}
                </p>
                {isSupervisorReadOnly ? (
                  <p className="pl-6 text-xs font-normal text-[var(--color-text-muted)] leading-relaxed">{resultAndImpact || '—'}</p>
                ) : (
                  <TextareaWithCharactersLeft
                    value={resultAndImpact}
                    onChange={e => {
                      setResultAndImpact(e.target.value);
                      triggerAutoSave(e.target.value, recommendation, overallAssessment);
                    }}
                    maxLength={2000}
                    placeholder="Describe the result and impact of this training…"
                    className="w-full"
                  />
                )}
              </div>
              <div className="rounded-xl bg-[var(--color-bg-elevated)] p-4 space-y-3">
                <p className="text-[15px] font-normal text-[var(--color-text-secondary)]">
                  Recommendation{!isSupervisorReadOnly && <span className="text-red-500"> *</span>}
                </p>
                {isSupervisorReadOnly ? (
                  <p className="pl-6 text-xs font-normal text-[var(--color-text-muted)] leading-relaxed">{recommendation || '—'}</p>
                ) : (
                  <TextareaWithCharactersLeft
                    value={recommendation}
                    onChange={e => {
                      setRecommendation(e.target.value);
                      triggerAutoSave(resultAndImpact, e.target.value, overallAssessment);
                    }}
                    maxLength={2000}
                    placeholder="Your recommendation for this employee…"
                    className="w-full"
                  />
                )}
              </div>
              <div className="rounded-xl bg-[var(--color-bg-elevated)] p-4 space-y-3">
                <p className="text-[15px] font-normal text-[var(--color-text-secondary)]">
                  Overall Assessment{!isSupervisorReadOnly && <span className="text-red-500"> *</span>}
                </p>
                <div className="pl-6">
                  <Rating
                    rating={overallAssessment}
                    maxRating={5}
                    editable={!isSupervisorReadOnly}
                    onRatingChange={v => {
                      if (isSupervisorReadOnly) return;
                      setOverallAssessment(v);
                      triggerAutoSave(resultAndImpact, recommendation, v);
                    }}
                    size="lg"
                    className="justify-start"
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Final approver: show supervisor's evaluation read-only */}
        {myRole === 'final_approver' && detail.supervisor_evaluation && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-[var(--color-border)]" />
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">Supervisor&apos;s Evaluation</p>
              <div className="h-px flex-1 bg-[var(--color-border)]" />
            </div>
            <div className="space-y-3 rounded-xl bg-[var(--color-bg-elevated)] p-4">
              <div className='py-3'>
                <p className="text-sm font-normal text-[var(--color-text-secondary)] mb-2">Result and Impact</p>
                <p className="pl-6 text-xs font-normal text-[var(--color-text-muted)] leading-relaxed">{detail.supervisor_evaluation.result_and_impact || '—'}</p>
              </div>
              <div className='py-3'>
                <p className="text-sm font-normal text-[var(--color-text-secondary)] mb-2">Recommendation</p>
                <p className="pl-6 text-xs font-normal text-[var(--color-text-muted)] leading-relaxed">{detail.supervisor_evaluation.recommendation || '—'}</p>
              </div>
              <div className='py-3'>
                <p className="text-sm font-normal text-[var(--color-text-secondary)] mb-2">Overall Assessment</p>
                <div className="pl-6">
                  <Rating
                    rating={detail.supervisor_evaluation.overall_assessment ?? 0}
                    maxRating={5}
                    editable={false}
                    size="lg"
                    className="justify-start"
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {detail.final_approver_remarks?.filter(remark => remark.remarks?.trim()).length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-[var(--color-border)]" />
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">Final Approver&apos;s Remarks</p>
              <div className="h-px flex-1 bg-[var(--color-border)]" />
            </div>
            <div className="space-y-3">
              {detail.final_approver_remarks.filter(remark => remark.remarks?.trim()).map((remark, idx) => (
                <div key={idx} className="rounded-xl bg-[var(--color-bg-elevated)] p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-medium text-[var(--color-text-secondary)]">{remark.approver_name || '—'}</p>
                    <div className="flex items-center gap-2">
                      <StatusPill
                        status={remark.action === 'approved' ? 'approved' : 'disapproved'}
                        label={remark.action === 'approved' ? 'Approved' : 'Disapproved'}
                      />
                      {remark.acted_at && (
                        <p className="text-[10px] text-[var(--color-text-muted)]">
                          {new Date(remark.acted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="pl-6 text-xs text-[var(--color-text-muted)] leading-relaxed pl-1">{remark.remarks}</p>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>

      {/* Footer */}
      <AnimatePresence initial={false}>
        {/* Supervisor submit — only visible once all 3 fields are filled */}
        {myRole === 'supervisor' && !isSupervisorReadOnly && resultAndImpact.trim() && recommendation.trim() && overallAssessment > 0 && (
          <motion.div
            key="supervisor-footer"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="shrink-0 px-4 pb-4 pt-3 border-t border-[var(--color-border)] flex justify-end overflow-hidden"
          >
            <button
              type="button"
              disabled={submitting}
              onClick={handleSupervisorSubmit}
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
        {myRole === 'final_approver' && !isReviewed && detail?.can_review && (
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
                  actioning
                    ? 'bg-red-300 text-white cursor-not-allowed'
                    : 'bg-[var(--btn-danger-bg)] hover:bg-[var(--btn-danger-hover)]',
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
                  actioning ? 'bg-[#2845D6]/70 cursor-not-allowed' : 'bg-[#2845D6] hover:bg-[#1f37b9]',
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
    </motion.div>
  );
}

// ── Main approval view ─────────────────────────────────────────────────────────

function TrainingApprovalView() {
  const [queue, setQueue] = useState<ApproverQueueItem[]>([]);
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
      const res = await fetch('/api/training/approver/queue', { credentials: 'include' });
      const data = await res.json();
      const items: ApproverQueueItem[] = Array.isArray(data) ? data : (data.results ?? []);
      setQueue(items);
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

  const handleReviewed = useCallback((submissionId: number) => {
    setQueue(prev => prev.map(item =>
      item.id === submissionId
        ? { ...item, my_step_status: 'reviewed', can_review: false, evaluation_submitted: true }
        : item,
    ));
    fetchQueue();
  }, [fetchQueue]);

  function handleCardClick(item: ApproverQueueItem) {
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
    { label: 'For Approval', items: queue.filter(i => i.my_step_status === 'pending') },
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
            <GraduationCap size={28} className="text-[var(--color-text-muted)] mb-2 opacity-40" />
            <p className="text-xs text-[var(--color-text-muted)]">No training evaluations in your approval queue.</p>
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
                    const isReturned = item.submission_status === 'returned';
                    const isSecondFinal = item.submission_status === 'second_final_approval';
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
                            {isReturned && <StatusPill status="closed" label="Returned" />}
                            {isSecondFinal && !isPending && <StatusPill status="routing" label="2nd Approval" />}
                            <StatusPill
                              status={isPending ? 'pending' : 'approved'}
                              label={isPending ? 'For Approval' : 'Reviewed'}
                            />
                          </div>
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--color-text-muted)] truncate">{item.training_title}</p>
                        <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)] truncate">
                          {formatTrainingDate(item.training_date)} · {item.speaker}
                        </p>
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
          <h1 className="text-lg font-bold text-[var(--color-text-primary)]">Training Approval</h1>
          <p className="text-xs text-[var(--color-text-muted)]">Review and approve employee training evaluations.</p>
        </div>
      </div>

      {/* Two-column body */}
      <div className="relative flex flex-1 overflow-hidden">

        {/* Backdrop — narrow only */}
        <AnimatePresence>
          {isNarrow && leftPanelOpen && (
            <motion.div
              key="approval-backdrop"
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
                  description="You will be notified when training evaluations require your review."
                  icons={[GraduationCap, ClipboardList, FileText]}
                />
              </motion.div>
            ) : !selectedId ? (
              <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full items-center justify-center">
                <EmptyState
                  title="Select a submission to review"
                  description={isNarrow ? 'Tap the Queue button above to choose a submission.' : 'Choose a submission from the left panel to review it.'}
                  icons={[GraduationCap, ClipboardList, FileText]}
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
                <SubmissionDetailPanel
                  submissionId={selectedId}
                  queueItem={selectedItem}
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

export default function TrainingApprovalPage() {
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

  return <TrainingApprovalView />;
}

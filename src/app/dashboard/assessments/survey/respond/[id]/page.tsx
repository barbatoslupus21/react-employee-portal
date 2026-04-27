'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Loader2,
  Send,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { getCsrfToken } from '@/lib/csrf';
import { useDebounce } from '@/hooks/use-debounce';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuestionOption {
  id: number;
  option_text: string;
  order: number;
}

interface RatingConfig {
  min_value: number;
  max_value: number;
  min_label: string;
  max_label: string;
}

interface SurveyQuestion {
  id: number;
  question_text: string;
  question_type: string;
  order: number;
  is_required: boolean;
  allow_other: boolean;
  options: QuestionOption[];
  rating_config: RatingConfig | null;
  existing_answer?: {
    text_value: string;
    number_value: string | null;
    other_text: string;
    selected_option_ids: number[];
  };
}

interface SurveyData {
  id: number;
  title: string;
  description: string;
  is_anonymous: boolean;
  status: string;
  start_date: string | null;
  end_date: string | null;
  questions: SurveyQuestion[];
  response_id: number | null;
  is_complete: boolean;
}

// ── Answer state ───────────────────────────────────────────────────────────────

interface AnswerState {
  text_value: string;
  number_value: string;
  other_text: string;
  selected_option_ids: number[];
}

function blankAnswer(): AnswerState {
  return { text_value: '', number_value: '', other_text: '', selected_option_ids: [] };
}

function hydrate(existing?: SurveyQuestion['existing_answer']): AnswerState {
  if (!existing) return blankAnswer();
  return {
    text_value: existing.text_value ?? '',
    number_value: existing.number_value ?? '',
    other_text: existing.other_text ?? '',
    selected_option_ids: existing.selected_option_ids ?? [],
  };
}

function isAnswered(q: SurveyQuestion, ans: AnswerState): boolean {
  const type = q.question_type;
  if (['single_choice', 'multiple_choice', 'dropdown', 'yes_no', 'likert', 'linear_scale'].includes(type)) {
    return ans.selected_option_ids.length > 0 || (q.allow_other && !!ans.other_text.trim());
  }
  if (['rating', 'number'].includes(type)) return ans.number_value !== '';
  return ans.text_value.trim() !== '';
}

// ── Question renderers ─────────────────────────────────────────────────────────

interface QRendererProps {
  question: SurveyQuestion;
  answer: AnswerState;
  onChange: (update: Partial<AnswerState>) => void;
  disabled: boolean;
  isMobile: boolean;
}

function SingleChoiceRenderer({ question, answer, onChange, disabled }: QRendererProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {question.options.map(opt => (
        <label
          key={opt.id}
          className={cn(
            'flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors',
            answer.selected_option_ids.includes(opt.id)
              ? 'border-primary bg-primary/5 dark:bg-primary/10'
              : 'border-border hover:border-primary/40 hover:bg-muted/30',
            disabled && 'pointer-events-none opacity-70',
          )}
        >
          <input
            type="radio"
            name={`q${question.id}`}
            value={opt.id}
            checked={answer.selected_option_ids.includes(opt.id)}
            onChange={() => onChange({ selected_option_ids: [opt.id] })}
            disabled={disabled}
            className="sr-only"
          />
          <span className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            answer.selected_option_ids.includes(opt.id)
              ? 'border-primary bg-primary'
              : 'border-border',
          )}>
            {answer.selected_option_ids.includes(opt.id) && (
              <span className="size-1.5 rounded-full bg-white" />
            )}
          </span>
          <span className="text-sm">{opt.option_text}</span>
        </label>
      ))}
      {question.allow_other && (
        <div className="flex flex-col gap-1.5">
          <label className={cn(
            'flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors',
            answer.other_text.trim()
              ? 'border-primary bg-primary/5 dark:bg-primary/10'
              : 'border-border hover:border-primary/40 hover:bg-muted/30',
            disabled && 'pointer-events-none opacity-70',
          )}>
            <span className={cn(
              'flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
              answer.other_text.trim() ? 'border-primary bg-primary' : 'border-border',
            )}>
              {answer.other_text.trim() && <span className="size-1.5 rounded-full bg-white" />}
            </span>
            <span className="text-sm text-muted-foreground">Other</span>
          </label>
          {(answer.other_text.trim() || answer.selected_option_ids.length === 0) && (
            <Input
              value={answer.other_text}
              onChange={e => onChange({ other_text: e.target.value, selected_option_ids: [] })}
              disabled={disabled}
              placeholder="Please specify…"
              maxLength={500}
              className="ml-7"
            />
          )}
        </div>
      )}
    </div>
  );
}

function MultipleChoiceRenderer({ question, answer, onChange, disabled }: QRendererProps) {
  function toggle(id: number) {
    const next = answer.selected_option_ids.includes(id)
      ? answer.selected_option_ids.filter(s => s !== id)
      : [...answer.selected_option_ids, id];
    onChange({ selected_option_ids: next });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {question.options.map(opt => (
        <label
          key={opt.id}
          className={cn(
            'flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors',
            answer.selected_option_ids.includes(opt.id)
              ? 'border-primary bg-primary/5 dark:bg-primary/10'
              : 'border-border hover:border-primary/40 hover:bg-muted/30',
            disabled && 'pointer-events-none opacity-70',
          )}
        >
          <span className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
            answer.selected_option_ids.includes(opt.id)
              ? 'border-primary bg-primary'
              : 'border-border',
          )}>
            {answer.selected_option_ids.includes(opt.id) && (
              <CheckCircle2 className="size-3 text-white" />
            )}
          </span>
          <span className="text-sm">{opt.option_text}</span>
          <input
            type="checkbox"
            checked={answer.selected_option_ids.includes(opt.id)}
            onChange={() => toggle(opt.id)}
            disabled={disabled}
            className="sr-only"
          />
        </label>
      ))}
      {question.allow_other && (
        <div className="flex flex-col gap-1.5">
          <label className={cn(
            'flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors',
            answer.other_text.trim()
              ? 'border-primary bg-primary/5 dark:bg-primary/10'
              : 'border-border hover:border-primary/40 hover:bg-muted/30',
          )}>
            <span className="size-4 shrink-0 rounded-md border-2 border-border" />
            <span className="text-sm text-muted-foreground">Other</span>
          </label>
          <Input
            value={answer.other_text}
            onChange={e => onChange({ other_text: e.target.value })}
            disabled={disabled}
            placeholder="Please specify…"
            maxLength={500}
            className="ml-7"
          />
        </div>
      )}
    </div>
  );
}

function DropdownRenderer({ question, answer, onChange, disabled }: QRendererProps) {
  return (
    <Select
      value={answer.selected_option_ids[0] ? String(answer.selected_option_ids[0]) : ''}
      onValueChange={v => onChange({ selected_option_ids: [parseInt(v, 10)] })}
      disabled={disabled}
    >
      <SelectTrigger className="max-w-sm">
        <SelectValue placeholder="Select an option…" />
      </SelectTrigger>
      <SelectContent>
        {question.options.map(opt => (
          <SelectItem key={opt.id} value={String(opt.id)}>{opt.option_text}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RatingRenderer({ question, answer, onChange, disabled }: QRendererProps) {
  const cfg = question.rating_config ?? { min_value: 1, max_value: 5, min_label: '', max_label: '' };
  const nums = Array.from({ length: cfg.max_value - cfg.min_value + 1 }, (_, i) => cfg.min_value + i);
  const current = answer.number_value ? parseInt(answer.number_value, 10) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        {nums.map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange({ number_value: String(n) })}
            disabled={disabled}
            className={cn(
              'flex size-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors',
              current === n
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:border-primary/60 hover:bg-muted',
              disabled && 'opacity-60 cursor-not-allowed',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      {(cfg.min_label || cfg.max_label) && (
        <div className="flex justify-between text-xs text-muted-foreground max-w-xs">
          <span>{cfg.min_label}</span>
          <span>{cfg.max_label}</span>
        </div>
      )}
    </div>
  );
}

function LikertRenderer({ question, answer, onChange, disabled, isMobile }: QRendererProps) {
  // Options are the column headers (e.g., Strongly Disagree … Strongly Agree)
  // For Likert, there's typically one group of options (the scale), applied per "row" question.
  // Here we treat the question itself as the single item and options as the scale columns.
  const options = question.options;
  const selectedId = answer.selected_option_ids[0] ?? null;

  if (isMobile) {
    // Stacked cards on mobile (R16)
    return (
      <div className="flex flex-col gap-2">
        {options.map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange({ selected_option_ids: [opt.id] })}
            disabled={disabled}
            className={cn(
              'flex items-center justify-between rounded-xl border px-4 py-3 text-sm text-left transition-colors',
              selectedId === opt.id
                ? 'border-primary bg-primary/5 text-primary font-medium'
                : 'border-border hover:border-primary/40 hover:bg-muted/30',
              disabled && 'opacity-60 cursor-not-allowed',
            )}
          >
            {opt.option_text}
            {selectedId === opt.id && <CheckCircle2 className="size-4 text-primary shrink-0" />}
          </button>
        ))}
      </div>
    );
  }

  // Desktop: horizontal option buttons
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-2 min-w-max">
        {options.map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange({ selected_option_ids: [opt.id] })}
            disabled={disabled}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-xl border px-3 py-2.5 min-w-[80px] text-center transition-colors',
              selectedId === opt.id
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border hover:border-primary/40 hover:bg-muted/30',
              disabled && 'opacity-60 cursor-not-allowed',
            )}
          >
            <span className={cn(
              'flex size-5 items-center justify-center rounded-full border-2 transition-colors',
              selectedId === opt.id ? 'border-primary bg-primary' : 'border-border',
            )}>
              {selectedId === opt.id && <span className="size-2 rounded-full bg-white" />}
            </span>
            <span className="text-xs leading-tight">{opt.option_text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function LinearScaleRenderer({ question, answer, onChange, disabled }: QRendererProps) {
  // Options represent the scale points; each option has option_text = the number label
  const options = question.options;
  const selectedId = answer.selected_option_ids[0] ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5 flex-wrap">
        {options.map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange({ selected_option_ids: [opt.id] })}
            disabled={disabled}
            className={cn(
              'flex size-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors',
              selectedId === opt.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:border-primary/60 hover:bg-muted',
              disabled && 'opacity-60 cursor-not-allowed',
            )}
          >
            {opt.option_text}
          </button>
        ))}
      </div>
    </div>
  );
}

function YesNoRenderer({ question, answer, onChange, disabled }: QRendererProps) {
  const yesOpt = question.options.find(o => o.option_text.toLowerCase() === 'yes') ?? question.options[0];
  const noOpt = question.options.find(o => o.option_text.toLowerCase() === 'no') ?? question.options[1];
  const selectedId = answer.selected_option_ids[0] ?? null;

  return (
    <div className="flex gap-3">
      {[yesOpt, noOpt].filter(Boolean).map(opt => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange({ selected_option_ids: [opt.id] })}
          disabled={disabled}
          className={cn(
            'flex-1 rounded-xl border py-3 text-sm font-medium transition-colors max-w-[120px]',
            selectedId === opt.id
              ? opt.option_text.toLowerCase() === 'yes'
                ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                : 'border-red-400 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
              : 'border-border hover:border-primary/40 hover:bg-muted/30',
            disabled && 'opacity-60 cursor-not-allowed',
          )}
        >
          {opt.option_text}
        </button>
      ))}
    </div>
  );
}

function ShortTextRenderer({ answer, onChange, disabled }: QRendererProps) {
  return (
    <Input
      value={answer.text_value}
      onChange={e => onChange({ text_value: e.target.value })}
      disabled={disabled}
      placeholder="Your answer…"
      maxLength={500}
      className="max-w-lg"
    />
  );
}

function LongTextRenderer({ answer, onChange, disabled }: QRendererProps) {
  const maxLen = 5000;
  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={answer.text_value}
        onChange={e => onChange({ text_value: e.target.value })}
        disabled={disabled}
        placeholder="Your answer…"
        maxLength={maxLen}
        rows={5}
        className="w-full max-w-lg rounded-lg border border-border bg-[var(--color-bg-elevated)] px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring transition-colors disabled:opacity-60"
      />
      <p className="text-xs text-muted-foreground text-right max-w-lg">
        {answer.text_value.length}/{maxLen}
      </p>
    </div>
  );
}

function NumberRenderer({ answer, onChange, disabled }: QRendererProps) {
  return (
    <Input
      type="number"
      value={answer.number_value}
      onChange={e => onChange({ number_value: e.target.value })}
      disabled={disabled}
      placeholder="Enter a number…"
      className="max-w-[200px]"
    />
  );
}

function DateRenderer({ answer, onChange, disabled }: QRendererProps) {
  return (
    <Input
      type="date"
      value={answer.text_value}
      onChange={e => onChange({ text_value: e.target.value })}
      disabled={disabled}
      className="max-w-[240px]"
    />
  );
}

const RENDERERS: Record<string, React.ComponentType<QRendererProps>> = {
  single_choice: SingleChoiceRenderer,
  multiple_choice: MultipleChoiceRenderer,
  dropdown: DropdownRenderer,
  rating: RatingRenderer,
  likert: LikertRenderer,
  linear_scale: LinearScaleRenderer,
  yes_no: YesNoRenderer,
  short_text: ShortTextRenderer,
  long_text: LongTextRenderer,
  number: NumberRenderer,
  date: DateRenderer,
};

// ── Auto-save hook ─────────────────────────────────────────────────────────────

function buildPayload(question: SurveyQuestion, ans: AnswerState): Record<string, unknown> {
  const type = question.question_type;
  if (['single_choice', 'multiple_choice', 'dropdown', 'yes_no', 'likert', 'linear_scale'].includes(type)) {
    return { selected_option_ids: ans.selected_option_ids, other_text: ans.other_text };
  }
  if (['rating', 'number'].includes(type)) {
    return { number_value: ans.number_value !== '' ? parseFloat(ans.number_value) : null };
  }
  return { text_value: ans.text_value };
}

// ── Question card ──────────────────────────────────────────────────────────────

interface QuestionCardProps {
  question: SurveyQuestion;
  index: number;
  total: number;
  answer: AnswerState;
  onChange: (update: Partial<AnswerState>) => void;
  saving: boolean;
  disabled: boolean;
  isMobile: boolean;
}

function QuestionCard({ question, index, total, answer, onChange, saving, disabled, isMobile }: QuestionCardProps) {
  const Renderer = RENDERERS[question.question_type] ?? ShortTextRenderer;
  const answered = isAnswered(question, answer);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-4 shadow-sm">
      {/* Question header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">
              {index + 1} / {total}
            </span>
            {question.is_required && (
              <span className="text-xs rounded-full bg-red-100 text-red-600 dark:bg-red-950/30 dark:text-red-400 px-2 py-0.5 font-medium">
                Required
              </span>
            )}
            {answered && (
              <CheckCircle2 className="size-3.5 text-green-500" />
            )}
          </div>
          <p className="text-base font-medium leading-snug">
            {question.question_text}
            {question.is_required && <span className="text-destructive ml-0.5">*</span>}
          </p>
        </div>
        {saving && <Loader2 className="size-4 text-muted-foreground animate-spin shrink-0 mt-0.5" />}
      </div>

      {/* Renderer */}
      <Renderer
        question={question}
        answer={answer}
        onChange={onChange}
        disabled={disabled}
        isMobile={isMobile}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SurveyRespondPage() {
  const params = useParams();
  const router = useRouter();
  const surveyId = params?.id as string;

  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');
  const [survey, setSurvey] = useState<SurveyData | null>(null);
  const [loadingSurvey, setLoadingSurvey] = useState(true);
  const [surveyError, setSurveyError] = useState<{ detail: string; code?: string } | null>(null);

  // Answers keyed by question ID
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({});
  // Track which questions are currently being auto-saved
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  // Track modified (dirty) answers since last save
  const dirtyRef = useRef<Record<number, AnswerState>>({});

  const [responseId, setResponseId] = useState<number | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const isMobile = useMediaQuery('(max-width: 640px)');

  // ── Auth + load ────────────────────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => setAuthPhase('checking'), 350);
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => { if (!r.ok) { router.push('/'); return null; } return r.json(); })
      .then(u => {
        clearTimeout(timer);
        if (!u) return;
        setAuthPhase('done');
      })
      .catch(() => { clearTimeout(timer); router.push('/'); });
    return () => clearTimeout(timer);
  }, [router]);

  // Load survey + create/get response once auth is done
  useEffect(() => {
    if (authPhase !== 'done' || !surveyId) return;
    setLoadingSurvey(true);

    // First get survey details
    fetch(`/api/survey/surveys/${surveyId}`, { credentials: 'include' })
      .then(async r => {
        const d = await r.json();
        if (!r.ok) { setSurveyError(d as { detail: string; code?: string }); return; }
        const sd = d as SurveyData;
        setSurvey(sd);

        // Hydrate existing answers
        const initial: Record<number, AnswerState> = {};
        for (const q of sd.questions) {
          initial[q.id] = hydrate(q.existing_answer);
        }
        setAnswers(initial);
        setResponseId(sd.response_id);
        setIsComplete(sd.is_complete);

        // If no response yet, create one
        if (!sd.response_id && sd.status === 'active') {
          const rRes = await fetch('/api/survey/responses', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
            body: JSON.stringify({ survey_id: surveyId }),
          });
          if (rRes.ok) {
            const rData = await rRes.json();
            setResponseId((rData as { id: number }).id);
          }
        }
      })
      .catch(() => setSurveyError({ detail: 'Failed to load survey. Please try again.' }))
      .finally(() => setLoadingSurvey(false));
  }, [authPhase, surveyId]);

  // ── Auto-save ──────────────────────────────────────────────────────────────

  // We use a separate per-question auto-save mechanism using a ref + timeout approach
  const saveTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const scheduleAutoSave = useCallback((questionId: number, ans: AnswerState) => {
    if (!responseId || isComplete) return;
    // Store latest dirty value
    dirtyRef.current[questionId] = ans;
    // Clear existing timer
    if (saveTimersRef.current[questionId]) clearTimeout(saveTimersRef.current[questionId]);
    // Schedule save after 1000ms
    saveTimersRef.current[questionId] = setTimeout(async () => {
      const latestAns = dirtyRef.current[questionId];
      if (!latestAns || !responseId) return;
      const question = survey?.questions.find(q => q.id === questionId);
      if (!question) return;

      setSavingIds(prev => new Set([...prev, questionId]));
      try {
        await fetch(`/api/survey/responses/${responseId}/answers/${questionId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
          body: JSON.stringify(buildPayload(question, latestAns)),
        });
        delete dirtyRef.current[questionId];
      } catch {
        // Silently fail auto-save; user will see the error on submit
      } finally {
        setSavingIds(prev => { const next = new Set(prev); next.delete(questionId); return next; });
      }
    }, 1000);
  }, [responseId, isComplete, survey]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const t of Object.values(saveTimersRef.current)) clearTimeout(t);
    };
  }, []);

  function handleAnswerChange(questionId: number, update: Partial<AnswerState>) {
    setAnswers(prev => {
      const next = { ...prev, [questionId]: { ...prev[questionId], ...update } };
      scheduleAutoSave(questionId, next[questionId]);
      return next;
    });
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!responseId || !survey) return;

    // Check required questions
    const missing = survey.questions.filter(
      q => q.is_required && !isAnswered(q, answers[q.id] ?? blankAnswer()),
    );
    if (missing.length > 0) {
      toast.error(`Please answer all required questions (${missing.length} remaining).`, { title: 'Incomplete' });
      return;
    }

    // Flush any pending dirty saves first
    for (const timer of Object.values(saveTimersRef.current)) clearTimeout(timer);
    const pendingIds = Object.keys(dirtyRef.current).map(Number);
    if (pendingIds.length > 0) {
      const flushPromises = pendingIds.map(async qId => {
        const q = survey.questions.find(x => x.id === qId);
        if (!q) return;
        await fetch(`/api/survey/responses/${responseId}/answers/${qId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
          body: JSON.stringify(buildPayload(q, dirtyRef.current[qId])),
        }).catch(() => {});
      });
      await Promise.all(flushPromises);
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/survey/responses/${responseId}/submit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
      });
      const d = await res.json();
      if (res.ok) {
        setIsComplete(true);
        setShowSuccess(true);
      } else if ((d as { code?: string }).code === 'survey_closed') {
        toast.error('This survey is no longer accepting responses.', { title: 'Survey Closed' });
        setSurvey(s => s ? { ...s, status: 'closed' } : s);
      } else {
        toast.error((d as { detail?: string }).detail ?? 'Submission failed.', { title: 'Error' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render states ──────────────────────────────────────────────────────────

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
          Loading survey…
        </TextShimmer>
      </div>
    );
  }

  if (loadingSurvey) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (surveyError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <div className="flex flex-col items-center gap-2 text-center max-w-sm">
          <AlertCircle className="size-10 text-muted-foreground/50" />
          <p className="font-medium">{surveyError.detail}</p>
          {surveyError.code === 'survey_not_active' && (
            <p className="text-sm text-muted-foreground">This survey may have ended or not yet started.</p>
          )}
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="size-3.5" /> Return to dashboard
        </button>
      </div>
    );
  }

  if (!survey) return null;

  // Success state
  if (showSuccess) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <div className="flex size-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/30">
            <CheckCircle2 className="size-8 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-xl font-semibold">Thank you!</h2>
          <p className="text-sm text-muted-foreground">
            Your responses for <strong>{survey.title}</strong> have been submitted successfully.
          </p>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const questions = [...survey.questions].sort((a, b) => a.order - b.order);
  const answeredCount = questions.filter(q => isAnswered(q, answers[q.id] ?? blankAnswer())).length;
  const requiredCount = questions.filter(q => q.is_required).length;
  const answeredRequiredCount = questions.filter(q => q.is_required && isAnswered(q, answers[q.id] ?? blankAnswer())).length;
  const progressPct = questions.length > 0 ? Math.round(answeredCount / questions.length * 100) : 0;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 w-full max-w-2xl mx-auto">
      {/* Back link */}
      <button
        onClick={() => router.push('/dashboard')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="size-4" /> Dashboard
      </button>

      {/* Survey header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold">{survey.title}</h1>
        {survey.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{survey.description}</p>
        )}

        {/* Banners */}
        <div className="flex flex-col gap-2 mt-1">
          {survey.is_anonymous && (
            <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 dark:bg-blue-950/20 dark:border-blue-800">
              <EyeOff className="size-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-400">
                This is an anonymous survey. Your identity will not be recorded.
              </p>
            </div>
          )}
          {survey.status !== 'active' && (
            <div className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 dark:bg-yellow-950/20 dark:border-yellow-800">
              <AlertCircle className="size-3.5 text-yellow-600 dark:text-yellow-400 shrink-0" />
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                This survey is {survey.status === 'closed' ? 'closed' : 'not currently active'} and responses are no longer accepted.
              </p>
            </div>
          )}
          {isComplete && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 dark:bg-green-950/20 dark:border-green-800">
              <CheckCircle2 className="size-3.5 text-green-600 dark:text-green-400 shrink-0" />
              <p className="text-xs text-green-700 dark:text-green-400">
                You have already submitted this survey.
              </p>
            </div>
          )}
        </div>

        {/* Progress */}
        {!isComplete && survey.status === 'active' && (
          <div className="flex flex-col gap-1.5 mt-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{answeredCount} of {questions.length} answered</span>
              {requiredCount > 0 && (
                <span>{answeredRequiredCount}/{requiredCount} required</span>
              )}
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Questions */}
      {questions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          This survey has no questions yet.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {questions.map((q, i) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={i}
              total={questions.length}
              answer={answers[q.id] ?? blankAnswer()}
              onChange={update => handleAnswerChange(q.id, update)}
              saving={savingIds.has(q.id)}
              disabled={isComplete || survey.status !== 'active'}
              isMobile={isMobile}
            />
          ))}
        </div>
      )}

      {/* Submit */}
      {!isComplete && survey.status === 'active' && questions.length > 0 && (
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {submitting ? 'Submitting…' : 'Submit Survey'}
          </button>
        </div>
      )}
    </div>
  );
}

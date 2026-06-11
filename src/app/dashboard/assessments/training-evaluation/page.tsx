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
  BarChart2,
  Check,
  ClipboardList,
  Edit2,
  Eye,
  FileText,
  GraduationCap,
  List,
  Loader2,
  Lock,
  Menu,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AdminTableSection } from '@/components/ui/admin-table-section';
import type { DataTableColumn } from '@/components/ui/data-table';
import { StatusPill } from '@/components/ui/status-pill';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/interactive-empty-state';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/modal';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { toast } from '@/components/ui/toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChoiceboxGroup } from '@/components/ui/choicebox-1';
import BasicCheckbox from '@/components/ui/checkbox-1';
import { Rating } from '@/components/ui/rating';
import { getCsrfToken } from '@/lib/csrf';
import { useNavigationGuard } from '@/lib/navigation-guard-context';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import { RatingInteraction } from '@/components/ui/emoji-rating';
import { TextareaWithCharactersLeft } from '@/components/ui/textarea-with-characters-left';
import { format } from 'date-fns';

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

interface TrainingListItem {
  id: number;
  title: string;
  speaker: string;
  training_date: string;
  objective: string;
  target_type: string;
  template_id?: number | null;
  created_by_id: number | null;
  created_at: string;
  submitted_count: number;
  total_participants: number;
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

interface TrainingAnswerRaw {
  id: number;
  question_id: number;
  text_value: string;
  number_value: number | null;
  selected_options: { id: number; option_text: string; order: number }[];
  other_text: string;
}

interface SupervisorEvaluationData {
  result_and_impact: string;
  recommendation: string;
  overall_assessment: number | null;
}

interface FinalApproverRemark {
  approver_name: string | null;
  action: string;
  acted_at: string | null;
  remarks: string;
}

interface TrainingDetail {
  id: number;
  title: string;
  speaker: string;
  training_date: string;
  objective: string;
  questions: TrainingQuestion[];
  submission: {
    id: number;
    is_complete: boolean;
    submitted_at: string | null;
    status: string;
  } | null;
  answers: TrainingAnswerRaw[];
  approval_status: string | null;
  requires_action: boolean;
  supervisor_evaluation: SupervisorEvaluationData | null;
  final_approver_remarks: FinalApproverRemark[];
}

interface MyTrainingItem {
  id: number;
  title: string;
  speaker: string;
  training_date: string;
  objective: string;
  is_seen: boolean;
  is_complete: boolean;
  submission_id: number | null;
  status: string | null;
  requires_action: boolean;
}

interface TemplateOption {
  id: number;
  title: string;
  description: string;
}

interface TrainingUser {
  id: number;
  idnumber: string;
  firstname: string | null;
  lastname: string | null;
  avatar: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
];

const CHOICE_BASED_TYPES = new Set(['single_choice', 'multiple_choice', 'checkboxes', 'dropdown']);
const INSTRUCTION_Q_TYPES = new Set(['section', 'subsection', 'statement']);

type AnswerValue = {
  text_value?: string;
  number_value?: string;
  other_text?: string;
  selected_option_ids?: number[];
};

function isQuestionAnswered(question: TrainingQuestion, answer: AnswerValue | undefined): boolean {
  if (!answer) return false;

  if (['short_text', 'long_text', 'date', 'yes_no'].includes(question.question_type)) {
    return Boolean(answer.text_value?.trim());
  }

  if (['number', 'rating', 'linear_scale', 'likert'].includes(question.question_type)) {
    return answer.number_value != null && answer.number_value !== '';
  }

  if (CHOICE_BASED_TYPES.has(question.question_type)) {
    const hasSelectedOption = (answer.selected_option_ids?.length ?? 0) > 0;
    const hasOtherText = question.allow_other && Boolean(answer.other_text?.trim());
    return hasSelectedOption || hasOtherText;
  }

  return false;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTrainingDate(dateStr: string): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

function getTrainingStatus(dateStr: string): 'scheduled' | 'active' | 'closed' {
  if (!dateStr) return 'closed';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split('-').map(Number);
  const trainingDate = new Date(y, m - 1, d);
  if (trainingDate > today) return 'scheduled';
  return 'active';
}

function getTrainingStatusLabel(dateStr: string): string {
  const s = getTrainingStatus(dateStr);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const TRAINING_BLOCKED_CHARS_RE = /[<>{}\[\]\\|^~`\"]/;

function validateTrainingText(value: string, fieldName: string, required = true): string {
  const trimmed = value.trim();
  if (required && !trimmed) {
    return `${fieldName} is required.`;
  }
  if (trimmed && TRAINING_BLOCKED_CHARS_RE.test(trimmed)) {
    return 'Special characters like < > { } [ ] \\ | ^ ~ ` " are not allowed.';
  }
  return '';
}

type UserPillKey = 'for_confirmation' | 'action_required' | 'in_progress' | 'returned' | 'completed' | 'scheduled' | 'closed';

function getUserPillKey(item: MyTrainingItem): UserPillKey {
  // Status-based groups always take precedence over date-based
  if (item.status === 'user_confirmation') return 'for_confirmation';
  if (!item.is_complete && item.status === null && getTrainingStatus(item.training_date) !== 'scheduled') {
    return 'action_required';
  }
  if (item.status === 'supervisor_review' || item.status === 'final_approval' || item.status === 'second_final_approval') return 'in_progress';
  if (item.status === 'returned') return 'returned';
  if (item.status === 'completed') return 'completed';
  if (!item.is_complete && getTrainingStatus(item.training_date) === 'scheduled') return 'scheduled';
  if (!item.is_complete && getTrainingStatus(item.training_date) === 'closed') return 'closed';
  // Submitted but no active approval status (shouldn't normally happen)
  if (item.is_complete) return 'in_progress';
  return 'action_required';
}

const PILL_STATUS_MAP: Record<UserPillKey, { status: string; label: string }> = {
  for_confirmation: { status: 'pending',   label: 'For Confirmation' },
  action_required: { status: 'pending',   label: 'Action Required' },
  in_progress:     { status: 'routing',   label: 'In Progress' },
  returned:        { status: 'closed',    label: 'Returned' },
  completed:       { status: 'approved',  label: 'Completed' },
  scheduled:       { status: 'scheduled', label: 'Scheduled' },
  closed:          { status: 'closed',    label: 'Closed' },
};

function trainingUserName(u: TrainingUser): string {
  return [u.lastname, u.firstname].filter(Boolean).join(', ') || u.idnumber;
}

// ── MemberPicker ──────────────────────────────────────────────────────────────

function MemberPicker({
  value,
  onChange,
  users,
  loading,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  users: TrainingUser[];
  loading: boolean;
}) {
  const [search, setSearch] = useState('');
  const filtered = search.trim()
    ? users.filter(u => {
        const name = trainingUserName(u).toLowerCase();
        const q = search.toLowerCase();
        return name.includes(q) || u.idnumber.toLowerCase().includes(q);
      })
    : users;
  const toggle = (id: number) =>
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);

  if (loading) {
    return (
      <div className="flex justify-center py-5">
        <span className="h-5 w-5 rounded-full border-2 border-[#2845D6] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
      <div className="border-b border-[var(--color-border)] p-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search employees…"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="max-h-[200px] overflow-y-auto [scrollbar-width:thin]">
        {filtered.length === 0 ? (
          <EmptyState
            title={search.trim() ? 'No results found.' : 'No employees found.'}
            description="Add employees to target them in this training."
            icons={[GraduationCap, ClipboardList, FileText]}
            className="bg-transparent shadow-none p-0 py-5"
          />
        ) : (
          filtered.map(u => {
            const sel = value.includes(u.id);
            const name = trainingUserName(u);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 transition-colors text-left border-b border-[var(--color-border)] last:border-b-0',
                  sel ? 'bg-[#2845D6]/8' : 'hover:bg-[var(--color-bg-card)]',
                )}
              >
                <img
                  src={u.avatar ?? '/default-avatar.png'}
                  alt={name}
                  className="w-7 h-7 rounded-full object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[var(--color-text-primary)] truncate">{name}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">{u.idnumber}</p>
                </div>
                <span className={cn(
                  'shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                  sel ? 'bg-[#2845D6] border-[#2845D6]' : 'border-[var(--color-border-strong)] bg-transparent',
                )}>
                  {sel && <Check size={10} className="text-white" />}
                </span>
              </button>
            );
          })
        )}
      </div>
      {value.length > 0 && (
        <div className="border-t border-[var(--color-border)] px-3 py-1.5 flex items-center justify-between">
          <span className="text-[10px] text-[var(--color-text-muted)]">{value.length} selected</span>
          <button type="button" onClick={() => onChange([])} className="text-[10px] text-red-500 hover:text-red-600 transition-colors">Clear all</button>
        </div>
      )}
    </div>
  );
}

// ── QuestionInput ─────────────────────────────────────────────────────────────

interface QuestionInputProps {
  q: TrainingQuestion;
  answer: AnswerValue;
  onChange: (a: AnswerValue) => void;
  readOnly: boolean;
  savingQId?: number | null;
}

function QuestionInput({ q, answer, onChange, readOnly }: QuestionInputProps) {
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
          <label key={opt.id} className={cn('flex items-center gap-2 transition-colors cursor-pointer', readOnly && 'cursor-default')}>
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
                <div className="pl-6 text-xs font-normal text-[var(--color-text-muted)]">Answer: {answer.other_text ?? ''}</div>
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
          <label key={opt} className={cn('flex items-center gap-2 transition-colors', readOnly && 'cursor-default')}>
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
        <div className="w-full">
          <Rating
            rating={selected}
            maxRating={cfg.max_value}
            editable={!readOnly}
            onRatingChange={v => !readOnly && onChange({ ...answer, number_value: String(v) })}
            className="w-full justify-start"
            size="lg"
          />
        </div>
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
          <div className="flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
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
          onChange={date => !readOnly && onChange({ ...answer, text_value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` })}
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

// ── Form Skeleton Loader (right column) ─────────────────────────────────────

function FormSkeletonLoader() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="flex flex-col"
    >
      {/* Header skeleton */}
      <div className="px-5 pt-4 pb-3 border-b border-[var(--color-border)] space-y-2">
        <div className="h-4 w-2/3 rounded bg-[var(--color-bg-card)] animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-[var(--color-bg-card)] animate-pulse" />
      </div>
      {/* Card skeletons */}
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

// ── Training List Skeleton ────────────────────────────────────────────────────

function TrainingListSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-sm animate-pulse">
        <div className="h-3 w-28 rounded bg-[var(--color-bg-card)] mb-3" />
        <div className="h-3 w-16 rounded bg-[var(--color-bg-card)]" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-sm animate-pulse">
          <div className="h-3 w-3/4 rounded bg-[var(--color-bg-card)] mb-3" />
          <div className="h-3 w-full rounded bg-[var(--color-bg-card)] mb-3" />
          <div className="flex flex-wrap gap-2">
            <div className="h-6 w-20 rounded-full bg-[var(--color-bg-card)]" />
            <div className="h-6 w-24 rounded-full bg-[var(--color-bg-card)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Training Card (user view) ─────────────────────────────────────────────────

function TrainingCard({
  item,
  isSelected,
  onClick,
}: {
  item: MyTrainingItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const pillStatus = getUserPillKey(item);
  const pill = PILL_STATUS_MAP[pillStatus];
  const showNew = !item.is_seen && (pillStatus === 'action_required' || pillStatus === 'for_confirmation');

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-sm',
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
          {item.title}
        </p>
        <div className="flex flex-wrap gap-1 shrink-0">
          <StatusPill status={pill.status} label={pill.label} />
          {showNew && <StatusPill status="approved" label="New" />}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
        {item.speaker} · {formatTrainingDate(item.training_date)}
      </p>
      <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
        <span className={cn(
          'inline-block h-1.5 w-1.5 rounded-full mr-1 align-middle',
          getTrainingStatus(item.training_date) === 'active' ? 'bg-green-500' :
          getTrainingStatus(item.training_date) === 'scheduled' ? 'bg-yellow-500' : 'bg-gray-400',
        )} />
        {getTrainingStatusLabel(item.training_date)}
      </p>
    </button>
  );
}

// ── Training Form Panel (user view) ──────────────────────────────────────────

function TrainingFormPanel({
  trainingId,
  onSubmitted,
}: {
  trainingId: number;
  onSubmitted: () => void;
}) {
  const [detail, setDetail] = useState<TrainingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [savingQId, setSavingQId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [hasSubmittedThisSession, setHasSubmittedThisSession] = useState(false);
  const saveTimerRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  // Holds the current submit logic so the nav-guard can call it without stale closures
  const submitFnRef = useRef<() => Promise<boolean>>(async () => false);
  const { registerGuard } = useNavigationGuard();

  // ── Fix 2: allRequiredAnswered as useMemo so it's available before early-returns ──
  const allRequiredAnswered = useMemo(() => {
    if (!detail) return false;
    const reqIds = detail.questions
      .filter(q => q.is_required && !INSTRUCTION_Q_TYPES.has(q.question_type))
      .map(q => q.id);
    if (reqIds.length === 0) return true;
    return reqIds.every(qId => {
      const q = detail.questions.find(q => q.id === qId)!;
      return isQuestionAnswered(q, answers[qId]);
    });
  }, [detail, answers]);

  // Derived guard condition — computable before early-returns
  const submitVisible = useMemo(() => {
    if (!detail || loading) return false;
    const isReadOnlyLocal = !!(detail.submission?.is_complete);
    const ts = getTrainingStatus(detail.training_date);
    const isClosed = ts === 'closed' && !isReadOnlyLocal;
    const effectiveRO = isReadOnlyLocal || ts === 'scheduled';
    const hasQs = detail.questions.length > 0;
    const approval = detail.approval_status;
    return !effectiveRO && !isClosed && hasQs && allRequiredAnswered && !approval;
  }, [detail, loading, allRequiredAnswered]);

  const guardActive = submitVisible && !hasSubmittedThisSession;

  // ── Fix 3: Register / deregister the navigation guard ────────────────────────
  useEffect(() => {
    if (!guardActive) {
      registerGuard(null);
      return;
    }
    registerGuard({
      isDirty: true,
      trySubmit: () => submitFnRef.current(),
    });
    return () => { registerGuard(null); };
  }, [guardActive, registerGuard]);

  // beforeunload — browser tab / window close
  useEffect(() => {
    if (!guardActive) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [guardActive]);

  const fetchDetail = useCallback(async () => {
    const r = await fetch(`/api/training/my/${trainingId}`, { credentials: 'include' });
    const d: TrainingDetail = await r.json();
    setDetail(d);
    // Initialize answers with all pre-loaded DB data so allRequiredAnswered
    // evaluates correctly on first render — mirrors the survey page pattern.
    const initAnswers: Record<number, AnswerValue> = {};
    for (const ans of d.answers ?? []) {
      initAnswers[ans.question_id] = {
        text_value: ans.text_value,
        number_value: ans.number_value != null ? String(ans.number_value) : undefined,
        other_text: ans.other_text,
        selected_option_ids: ans.selected_options.map(o => o.id),
      };
    }
    setAnswers(initAnswers);
    return d;
  }, [trainingId]);

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    setAnswers({});
    fetchDetail()
      .catch(() => toast.error('Failed to load training details.', { title: 'Error' }))
      .finally(() => setLoading(false));
    return () => { Object.values(saveTimerRef.current).forEach(clearTimeout); };
  }, [trainingId, fetchDetail]);

  const isReadOnly = !!(detail?.submission?.is_complete);

  function buildPayload(qId: number, answerVal: AnswerValue) {
    return {
      question_id: qId,
      text_value: answerVal.text_value ?? '',
      number_value: answerVal.number_value != null && answerVal.number_value !== ''
        ? parseFloat(answerVal.number_value)
        : null,
      selected_option_ids: (answerVal.selected_option_ids ?? []).filter(id => id !== -1),
      other_text: answerVal.other_text ?? '',
    };
  }

  function handleAnswerChange(qId: number, val: AnswerValue) {
    if (effectiveReadOnly) return;
    setAnswers(prev => ({ ...prev, [qId]: val }));
    if (saveTimerRef.current[qId]) clearTimeout(saveTimerRef.current[qId]);
    saveTimerRef.current[qId] = setTimeout(async () => {
      setSavingQId(qId);
      try {
        await fetch(`/api/training/my/${trainingId}/answer`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
          body: JSON.stringify(buildPayload(qId, val)),
        });
      } catch { /* silent */ }
      finally { setSavingQId(q => (q === qId ? null : q)); }
    }, 800);
  }

  async function handleSubmit() {
    await submitFnRef.current();
  }

  async function handleConfirm() {
    if (confirming) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/training/my/${trainingId}/confirm`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.detail ?? 'Confirmation failed.', { title: 'Error' });
        return;
      }
      toast.success(
        data.status === 'completed'
          ? 'Your training evaluation has been completed.'
          : 'Evaluation confirmed. Awaiting final approval.',
        { title: 'Confirmed' },
      );
      window.dispatchEvent(new Event('training-eval-badge-refresh'));
      onSubmitted();
      await fetchDetail();
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 animate-pulse space-y-3">
            <div className="h-3 w-3/4 rounded bg-[var(--color-bg-card)]" />
            <div className="h-8 w-full rounded bg-[var(--color-bg-card)]" />
          </div>
        ))}
      </div>
    );
  }

  if (!detail) return null;

  const hasQuestions = detail.questions.length > 0;

  const trainingStatus = getTrainingStatus(detail.training_date);
  const isClosed = trainingStatus === 'closed' && !isReadOnly;
  const isScheduled = trainingStatus === 'scheduled';
  // Scheduled trainings are fully non-interactive (same as read-only)
  const effectiveReadOnly = isReadOnly || isScheduled;
  const approvalStatus = detail.approval_status;
  const isUserConfirmation = approvalStatus === 'user_confirmation';
  const isInProgress = approvalStatus === 'supervisor_review' || approvalStatus === 'final_approval' || approvalStatus === 'second_final_approval';
  const isSecondFinalApproval = approvalStatus === 'second_final_approval';
  const isReturned = approvalStatus === 'returned';
  const isCompleted = approvalStatus === 'completed';

  // ── Keep submitFnRef current with the latest closure values ────────────────
  submitFnRef.current = async () => {
    if (submitting || effectiveReadOnly) return false;
    setSubmitting(true);
    try {
      const pendingIds = Object.keys(saveTimerRef.current).map(Number);
      pendingIds.forEach(qId => {
        clearTimeout(saveTimerRef.current[qId]);
        delete saveTimerRef.current[qId];
      });
      const currentAnswers = Object.entries(answers);
      if (currentAnswers.length > 0) {
        for (const [qIdStr, val] of currentAnswers) {
          try {
            await fetch(`/api/training/my/${trainingId}/answer`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
              body: JSON.stringify(buildPayload(Number(qIdStr), val)),
            });
          } catch { /* silent */ }
        }
      }
      const res = await fetch(`/api/training/my/${trainingId}/submit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.detail ?? 'Submission failed.', { title: 'Error' });
        return false;
      }
      toast.success('Training evaluation submitted successfully.', { title: 'Submitted' });
      window.dispatchEvent(new Event('training-eval-badge-refresh'));
      setHasSubmittedThisSession(true);
      onSubmitted();
      await fetchDetail();
      return true;
    } catch {
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  let questionCounter = 0;

  return (
    <motion.div
      key={`form-${trainingId}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="flex flex-col h-full"
    >
      {/* Banners */}
      {isClosed && (
        <div className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20 p-2 flex items-center gap-2">
          <Lock size={15} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400 font-medium">This training has ended and is no longer accepting responses.</p>
        </div>
      )}
      {isScheduled && (
        <div className="mx-4 mt-4 rounded-xl border border-yellow-200 bg-yellow-50 dark:border-yellow-900/40 dark:bg-yellow-950/20 p-2 flex items-center gap-2">
          <ClipboardList size={15} className="text-yellow-600 shrink-0" />
          <p className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">This training has not started yet. Check back when it opens.</p>
        </div>
      )}
      {isReturned && (
        <div className="mx-4 mt-4 rounded-xl border border-orange-200 bg-orange-50 dark:border-orange-900/40 dark:bg-orange-950/20 p-2 flex items-center gap-2">
          <ClipboardList size={15} className="text-orange-600 shrink-0" />
          <p className="text-xs text-orange-700 dark:text-orange-400 font-medium">Your submission was returned for re-evaluation. Your supervisor is currently reviewing it again.</p>
        </div>
      )}
      {isInProgress && !isUserConfirmation && (
        <div className="mx-4 mt-4 rounded-xl bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20 p-2 flex items-center gap-2">
          <ClipboardList size={15} className="text-blue-600 shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-400 font-medium">
            {approvalStatus === 'supervisor_review'
              ? 'Awaiting supervisor review.'
              : approvalStatus === 'second_final_approval'
              ? 'Awaiting second-level final approval.'
              : 'Awaiting final approval.'}
          </p>
        </div>
      )}
      {isCompleted && (
        <div className="mx-4 mt-4 rounded-xl bg-green-50 dark:border-green-900/40 dark:bg-green-950/20 p-2 flex items-center gap-2">
          <Check size={15} className="text-green-600 shrink-0" />
          <p className="text-xs text-green-700 dark:text-green-400 font-medium">Your training evaluation has been fully approved and completed.</p>
        </div>
      )}

      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-[var(--color-border)] shrink-0">
        {isReadOnly && !approvalStatus && (
          <div className="mt-2 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 mb-2 p-2 flex items-center gap-2">
            <Check size={13} className="text-green-600 dark:text-green-400 shrink-0" />
            <span className="text-xs font-medium text-green-700 dark:text-green-400">You have submitted this evaluation.</span>
          </div>
        )}
        <h2 className="text-base font-bold text-[var(--color-text-primary)]">{detail.title}</h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          {detail.speaker} · {formatTrainingDate(detail.training_date)}
        </p>
      </div>

      {/* Questions */}
      <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden p-4 space-y-4">
        {!hasQuestions ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardList size={28} className="text-[var(--color-text-muted)] mb-2" />
            <p className="text-xs text-[var(--color-text-muted)]">This training has no evaluation questions yet.</p>
          </div>
        ) : (
          (() => {
            type TrainingItem =
              | { type: 'question'; question: TrainingQuestion }
              | { type: 'instruction-group'; questions: TrainingQuestion[] };
            const items: TrainingItem[] = [];
            let currentGroup: TrainingQuestion[] = [];
            detail.questions.forEach(q => {
              if (INSTRUCTION_Q_TYPES.has(q.question_type)) {
                currentGroup.push(q);
              } else {
                if (currentGroup.length > 0) {
                  items.push({ type: 'instruction-group', questions: currentGroup });
                  currentGroup = [];
                }
                items.push({ type: 'question', question: q });
              }
            });
            if (currentGroup.length > 0) items.push({ type: 'instruction-group', questions: currentGroup });

            return items.map((item, idx) => {
              if (item.type === 'instruction-group') {
                return (
                  <div key={`instr-${idx}`} className="rounded-xl bg-[var(--color-bg-elevated)] p-4 space-y-2">
                    {item.questions.map(q => (
                      <div key={q.id}>
                        <p className={cn(
                          q.question_type === 'section'
                            ? 'text-sm leading-snug font-bold text-[var(--color-text-primary)]'
                            : q.question_type === 'subsection'
                            ? 'text-[15px] leading-snug font-normal text-[var(--color-text-secondary)]'
                            : 'text-[15px] leading-snug italic text-[var(--color-text-secondary)]',
                        )}>
                          {q.question_type === 'statement' ? `"${q.question_text}"` : q.question_text}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              }
              const q = item.question;
              questionCounter += 1;
              return (
                <div key={q.id} className="rounded-xl bg-[var(--color-bg-elevated)] p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <span className="text-[15px] font-normal leading-snug text-[var(--color-text-secondary)] shrink-0">Q{questionCounter}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-normal text-[var(--color-text-secondary)] leading-snug">
                        {q.question_text}
                        {!isReadOnly && q.is_required && <span className="text-red-500 ml-0.5">*</span>}
                      </p>

                    </div>
                  </div>
                  <QuestionInput
                    q={q}
                    answer={answers[q.id] ?? {}}
                    onChange={val => handleAnswerChange(q.id, val)}
                    readOnly={effectiveReadOnly}
                  />
                </div>
              );
            });
          })()
        )}
      {(isUserConfirmation || isCompleted || isInProgress) && detail.supervisor_evaluation && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-[var(--color-border)]" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">Superior&apos;s Evaluation</p>
            <div className="h-px flex-1 bg-[var(--color-border)]" />
          </div>
          <div className="space-y-3">
            <div className="rounded-xl bg-[var(--color-bg-elevated)] p-4 space-y-3">
              <p className="text-[15px] font-normal text-[var(--color-text-secondary)] mb-1">Result and Impact</p>
              <p className="pl-6 text-xs font-normal text-[var(--color-text-muted)] leading-relaxed">{detail.supervisor_evaluation.result_and_impact || '—'}</p>
            </div>
            <div className="rounded-xl bg-[var(--color-bg-elevated)] p-4 space-y-3">
              <p className="text-[15px] font-normal text-[var(--color-text-secondary)] mb-1">Recommendation</p>
              <p className="pl-6 text-xs font-normal text-[var(--color-text-muted)] leading-relaxed">{detail.supervisor_evaluation.recommendation || '—'}</p>
            </div>
            <div className="rounded-xl bg-[var(--color-bg-elevated)] p-4 space-y-3">
              <p className="text-[15px] font-normal text-[var(--color-text-secondary)] mb-1">Overall Assessment</p>
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
      {detail.final_approver_remarks && detail.final_approver_remarks.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-[var(--color-border)]" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] shrink-0">Final Approver&apos;s Remarks</p>
            <div className="h-px flex-1 bg-[var(--color-border)]" />
          </div>
          <div className="space-y-3">
            {detail.final_approver_remarks.map((remark, idx) => (
              <div key={idx} className="rounded-xl bg-[var(--color-bg-elevated)] p-4 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs font-medium text-[var(--color-text-secondary)]">{remark.approver_name || '—'}</p>
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
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed pl-1">{remark.remarks}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      </div>

      <AnimatePresence initial={false}>
        {!effectiveReadOnly && !isClosed && hasQuestions && allRequiredAnswered && !approvalStatus && (
          <motion.div
            key="submit-footer"
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 10, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="shrink-0 px-4 pb-4 pt-3 border-t border-[var(--color-border)] flex justify-end overflow-hidden"
          >
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-normal text-white transition-all',
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
        {isUserConfirmation && (
          <motion.div
            key="confirm-footer"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="shrink-0 px-4 pb-4 pt-3 border-t border-[var(--color-border)] flex items-center justify-between gap-3 overflow-hidden"
          >
            <p className="text-xs text-[var(--color-text-muted)]">Review your supervisor&apos;s evaluation below, then confirm to proceed.</p>
            <button
              type="button"
              disabled={confirming}
              onClick={handleConfirm}
              className={cn(
                'shrink-0 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-normal text-white transition-all',
                confirming ? 'bg-[#2845D6]/70 cursor-not-allowed' : 'bg-[#2845D6] hover:bg-[#1f37b9]',
              )}
            >
              {confirming ? (
                <TextShimmer duration={1.2} className="text-xs font-normal [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">Confirming…</TextShimmer>
              ) : (
                <><Check size={14} /> Confirm</>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── User view ─────────────────────────────────────────────────────────────────

function TrainingUserView() {
  const [trainings, setTrainings] = useState<MyTrainingItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showFormSkeleton, setShowFormSkeleton] = useState(false);
  const skeletonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trainingListFetchRef = useRef<Promise<void> | null>(null);
  const isNarrow = useMediaQuery('(max-width: 780px)');

  useEffect(() => { if (!isNarrow) setLeftPanelOpen(false); }, [isNarrow]);

  const fetchTrainings = useCallback(async (showLoading = false) => {
    if (trainingListFetchRef.current) {
      return trainingListFetchRef.current;
    }

    const request = (async () => {
      if (showLoading) setLoadingList(true);
      try {
        const res = await fetch('/api/training/my', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        const items: MyTrainingItem[] = Array.isArray(data) ? data : (data.results ?? []);
        setTrainings(items);
      } catch { /* silent */ }
      finally {
        if (showLoading) setLoadingList(false);
        trainingListFetchRef.current = null;
      }
    })();

    trainingListFetchRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    void fetchTrainings(true);
  }, [fetchTrainings]);

  useEffect(() => {
    const interval = setInterval(fetchTrainings, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') fetchTrainings(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [fetchTrainings]);

  function handleSubmitted() {
    fetchTrainings();
    setRefreshKey(k => k + 1);
  }

  function handleCardClick(item: MyTrainingItem) {
    setSelectedId(prev => {
      if (prev !== item.id) {
        // Show 1-second skeleton every time a different training is selected
        setShowFormSkeleton(true);
        if (skeletonTimerRef.current) clearTimeout(skeletonTimerRef.current);
        skeletonTimerRef.current = setTimeout(() => setShowFormSkeleton(false), 1000);
      }
      return item.id;
    });
    if (isNarrow) setLeftPanelOpen(false);
    if (!item.is_seen) {
      setTrainings(prev => prev.map(t => t.id === item.id ? { ...t, is_seen: true } : t));
    }
  }

  const isEmpty = !loadingList && trainings.length === 0;

  const groups = [
    { label: 'For Confirmation', items: trainings.filter(t => getUserPillKey(t) === 'for_confirmation') },
    { label: 'Action Required',  items: trainings.filter(t => getUserPillKey(t) === 'action_required') },
    { label: 'In Progress',      items: trainings.filter(t => getUserPillKey(t) === 'in_progress') },
    { label: 'Returned',         items: trainings.filter(t => getUserPillKey(t) === 'returned') },
    { label: 'Scheduled',        items: trainings.filter(t => getUserPillKey(t) === 'scheduled') },
    { label: 'Completed',        items: trainings.filter(t => getUserPillKey(t) === 'completed') },
    { label: 'Closed',           items: trainings.filter(t => getUserPillKey(t) === 'closed') },
  ].filter(g => g.items.length > 0);

  const trainingListContent = (
    <>
      {loadingList ? (
        <TrainingListSkeleton />
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
          <GraduationCap size={28} className="text-[var(--color-text-muted)] mb-2" />
          <p className="text-xs text-[var(--color-text-muted)]">No trainings assigned to you yet.</p>
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
                  const ps = getUserPillKey(item);
                  const pill = PILL_STATUS_MAP[ps];
                  const isSelected = item.id === selectedId;
                  const showNew = !item.is_seen && (ps === 'action_required' || ps === 'for_confirmation');
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
                      <div className="flex items-start justify-between gap-3">
                        <p className={cn(
                          'text-sm font-semibold leading-snug truncate',
                          isSelected ? 'text-[#2845D6]' : 'text-[var(--color-text-primary)]',
                        )}>
                          {item.title}
                        </p>
                        <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                          <StatusPill status={pill.status} label={pill.label} />
                          {showNew && <StatusPill status="approved" label="New" />}
                        </div>
                      </div>
                      {item.objective && (
                        <p className="mt-2 text-[11px] leading-[1.5] text-[var(--color-text-muted)] line-clamp-2">
                          {item.objective}
                        </p>
                      )}
                      <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">
                        {item.speaker} · {formatTrainingDate(item.training_date)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="shrink-0 px-4 sm:px-6 pt-5 pb-4 border-b border-[var(--color-border)] flex items-center gap-3">
        {isNarrow && (
          <button
            onClick={() => setLeftPanelOpen(v => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors shrink-0"
            aria-label="Toggle training list"
          >
            <List size={20} />
          </button>
        )}
        <div>
          <h1 className="text-lg font-bold text-[var(--color-text-primary)]">My Training Evaluations</h1>
          <p className="text-xs text-[var(--color-text-muted)]">View and submit evaluations for your assigned trainings.</p>
        </div>
      </div>

      {/* Two-column body */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Backdrop — narrow only */}
        <AnimatePresence>
          {isNarrow && leftPanelOpen && (
            <motion.div
              key="training-backdrop"
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
          {isNarrow && (
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] shrink-0">
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">Trainings</span>
              <button
                onClick={() => setLeftPanelOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors"
                aria-label="Close training list"
              >
                <X size={15} />
              </button>
            </div>
          )}
          {trainingListContent}
        </motion.div>

        {/* Right column */}
        <div className="flex-1 overflow-y-auto bg-[var(--color-bg-elevated)] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <AnimatePresence mode="wait" initial={false}>
            {isEmpty ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full items-center justify-center">
                <EmptyState
                  title="No trainings assigned yet"
                  description="You will be notified when trainings are assigned to you."
                  icons={[GraduationCap, ClipboardList, FileText]}
                />
              </motion.div>
            ) : !selectedId ? (
              <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full items-center justify-center">
                <EmptyState
                  title="Select a training to begin"
                  description={isNarrow ? 'Tap the Trainings button above to choose a training.' : 'Choose a training from the list on the left to view its questions and submit your evaluation.'}
                  icons={[GraduationCap, ClipboardList, FileText]}
                />
              </motion.div>
            ) : showFormSkeleton ? (
              <FormSkeletonLoader key={`skel-${selectedId}`} />
            ) : (
              <motion.div
                key={`panel-${selectedId}-${refreshKey}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                <TrainingFormPanel
                  key={`${selectedId}-${refreshKey}`}
                  trainingId={selectedId}
                  onSubmitted={handleSubmitted}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
// ── FilterContentList ─────────────────────────────────────────────────────────

function FilterContentList({
  options,
  selected,
  onSelect,
}: {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="space-y-0.5 max-h-56 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={() => onSelect('all')}
        className={cn(
          'w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors',
          selected === 'all'
            ? 'bg-[#2845D6]/10 font-medium text-[#2845D6]'
            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]',
        )}
      >
        All
      </button>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() => onSelect(option.value)}
          className={cn(
            'w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors',
            selected === option.value
              ? 'bg-[#2845D6]/10 font-medium text-[#2845D6]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TrainingFormFields({
  modalTitle,
  formTitle,
  speaker,
  trainingDate,
  objective,
  templateId,
  targetType,
  memberIds,
  errors,
  templates,
  allUsers,
  usersLoading,
  onTitleChange,
  onSpeakerChange,
  onTrainingDateChange,
  onObjectiveChange,
  onTemplateChange,
  onTargetTypeChange,
  onMemberIdsChange,
  templateDisabled = false,
}: {
  modalTitle: string;
  formTitle: string;
  speaker: string;
  trainingDate: Date | undefined;
  objective: string;
  templateId: string;
  targetType: 'all_users' | 'specific_users';
  memberIds: number[];
  errors: Record<string, string>;
  templates: TemplateOption[];
  allUsers: TrainingUser[];
  usersLoading: boolean;
  onTitleChange: (value: string) => void;
  onSpeakerChange: (value: string) => void;
  onTrainingDateChange: (value: Date | undefined) => void;
  onObjectiveChange: (value: string) => void;
  onTemplateChange: (value: string) => void;
  onTargetTypeChange: (value: 'all_users' | 'specific_users') => void;
  onMemberIdsChange: (value: number[]) => void;
  templateDisabled?: boolean;
}) {
  return (
    <ModalBody className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
          Training Title {!formTitle.trim() && <span className="text-red-500 normal-case tracking-normal">*</span>}
        </label>
        <Input
          value={formTitle}
          onChange={e => onTitleChange(e.target.value)}
          maxLength={200}
          placeholder="e.g. First Aid Training"
          className={cn(errors.title && 'border-destructive')}
        />
        {errors.title && <p className="text-[10px] text-red-500">{errors.title}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
          Speaker {!speaker.trim() && <span className="text-red-500 normal-case tracking-normal">*</span>}
        </label>
        <Input
          value={speaker}
          onChange={e => onSpeakerChange(e.target.value)}
          maxLength={200}
          placeholder="Speaker name"
          className={cn(errors.speaker && 'border-destructive')}
        />
        {errors.speaker && <p className="text-[10px] text-red-500">{errors.speaker}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
          Training Date {!trainingDate && <span className="text-red-500 normal-case tracking-normal">*</span>}
        </label>
        <DateTimePicker
          value={trainingDate}
          onChange={date => onTrainingDateChange(date)}
          placeholder="Select training date"
          className={cn(errors.training_date && 'border-destructive')}
          portal={false}
        />
        {errors.training_date && <p className="text-[10px] text-red-500">{errors.training_date}</p>}
      </div>

      <TextareaWithCharactersLeft
        value={objective}
        onChange={e => onObjectiveChange(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder="Training objective"
        error={errors.objective}
        label={<>
          Objective {!objective.trim() && <span className="text-red-500 normal-case tracking-normal">*</span>}
        </>}
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
          Evaluation Template {!templateId && <span className="text-red-500 normal-case tracking-normal">*</span>}
        </label>
        <Select value={templateId} onValueChange={onTemplateChange} disabled={templateDisabled}>
          <SelectTrigger>
            <SelectValue placeholder="Select template" />
          </SelectTrigger>
          <SelectContent>
            {templates.map(t => (
              <SelectItem key={t.id} value={String(t.id)}>{t.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <ChoiceboxGroup
          direction="row"
          label="Participants"
          showLabel
          type="radio"
          value={targetType}
          onChange={(value: string) => onTargetTypeChange(value as 'all_users' | 'specific_users')}
        >
          <ChoiceboxGroup.Item title="All Employees" description="Sent to every active employee" value="all_users" />
          <ChoiceboxGroup.Item title="Specific Users" description="Manually select participants" value="specific_users" />
        </ChoiceboxGroup>
        <AnimatePresence initial={false}>
          {targetType === 'specific_users' && (
            <motion.div
              key={`${modalTitle.toLowerCase().replace(/\s+/g, '-')}-picker`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: 'hidden' }}
            >
              <MemberPicker
                value={memberIds}
                onChange={onMemberIdsChange}
                users={allUsers}
                loading={usersLoading}
              />
              {errors.members && <p className="mt-1 text-[10px] text-red-500">{errors.members}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ModalBody>
  );
}

// ── Admin view ─────────────────────────────────────────────────────────────────

function TrainingAdminView({ user }: { user: UserData }) {
  const router = useRouter();
  const [rows, setRows] = useState<TrainingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [hasAny, setHasAny] = useState<boolean | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState<TrainingListItem | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [allUsers, setAllUsers] = useState<TrainingUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [cTitle, setCTitle] = useState('');
  const [cSpeaker, setCSpeaker] = useState('');
  const [cDate, setCDate] = useState<Date | undefined>(undefined);
  const [cObjective, setCObjective] = useState('');
  const [cTemplateId, setCTemplateId] = useState('');
  const [cTargetType, setCTargetType] = useState<'all_users' | 'specific_users'>('all_users');
  const [cMemberIds, setCMemberIds] = useState<number[]>([]);
  const [cErrors, setCErrors] = useState<Record<string, string>>({});

  const [eTitle, setETitle] = useState('');
  const [eSpeaker, setESpeaker] = useState('');
  const [eDate, setEDate] = useState<Date | undefined>(undefined);
  const [eObjective, setEObjective] = useState('');
  const [eTemplateId, setETemplateId] = useState('');
  const [eTargetType, setETargetType] = useState<'all_users' | 'specific_users'>('all_users');
  const [eMemberIds, setEMemberIds] = useState<number[]>([]);
  const [eErrors, setEErrors] = useState<Record<string, string>>({});
  const [eHasResponses, setEHasResponses] = useState(false);
  const [eResponseCount, setEResponseCount] = useState(0);

  const isCreateFormValid = Boolean(
    cTitle.trim() &&
    cSpeaker.trim() &&
    cDate &&
    cObjective.trim() &&
    cTemplateId &&
    (cTargetType !== 'specific_users' || cMemberIds.length > 0) &&
    !TRAINING_BLOCKED_CHARS_RE.test(cTitle) &&
    !TRAINING_BLOCKED_CHARS_RE.test(cSpeaker) &&
    !TRAINING_BLOCKED_CHARS_RE.test(cObjective),
  );

  const isEditFormValid = Boolean(
    eTitle.trim() &&
    eSpeaker.trim() &&
    eDate &&
    eObjective.trim() &&
    eTemplateId &&
    (eTargetType !== 'specific_users' || eMemberIds.length > 0) &&
    !TRAINING_BLOCKED_CHARS_RE.test(eTitle) &&
    !TRAINING_BLOCKED_CHARS_RE.test(eSpeaker) &&
    !TRAINING_BLOCKED_CHARS_RE.test(eObjective),
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRows = useCallback(async (
    p: number,
    q: string,
    status: string,
    sortBy: string,
    sortDirection: 'asc' | 'desc',
    isInitial = false,
    showSkeleton = false,
  ) => {
    const startTime = Date.now();
    const minSkeletonMs = (isInitial || showSkeleton) ? 500 : 0;
    if (isInitial || showSkeleton) {
      setLoading(true);
      setTransitioning(false);
    } else {
      setTransitioning(true);
    }
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set('search', q);
      if (status !== 'all') params.set('status', status);
      if (sortBy) params.set('sort_by', sortBy);
      if (sortDirection) params.set('sort_dir', sortDirection);
      const res = await fetch(`/api/training/admin?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows(data.results as TrainingListItem[]);
      const total = data.count ?? 0;
      setTotalCount(total);
      setTotalPages(Math.ceil(total / (data.page_size ?? 10)));
      if (!q && status === 'all') setHasAny(total > 0);
    } catch {
      toast.error('Could not load trainings.', { title: 'Error' });
    } finally {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, minSkeletonMs - elapsed);
      if (remaining > 0) await new Promise<void>(r => setTimeout(r, remaining));
      setLoading(false);
      setTransitioning(false);
    }
  }, []);

  useEffect(() => {
    fetchRows(1, '', 'all', 'created_at', 'desc', true);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchRows]);

  const triggerFetch = useCallback((
    p: number,
    q: string,
    status: string,
    sortBy: string,
    sortDirection: 'asc' | 'desc',
    showSkeleton = false,
  ) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (showSkeleton) {
      setLoading(true);
      setTransitioning(false);
    } else {
      setTransitioning(true);
    }
    debounceRef.current = setTimeout(() => fetchRows(p, q, status, sortBy, sortDirection, false, showSkeleton), 300);
  }, [fetchRows]);

  async function fetchModalData() {
    setUsersLoading(true);
    try {
      const [tmplRes, usrRes] = await Promise.all([
        fetch('/api/survey/admin/templates?page=1', { credentials: 'include' }),
        fetch('/api/auth/users', { credentials: 'include' }),
      ]);
      if (tmplRes.ok) {
        const tmplData = await tmplRes.json();
        setTemplates(Array.isArray(tmplData) ? tmplData : (tmplData.results ?? []));
      }
      if (usrRes.ok) {
        const data = await usrRes.json();
        setAllUsers(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
    finally { setUsersLoading(false); }
  }

  function openCreate() {
    setCTitle(''); setCSpeaker(''); setCDate(undefined); setCObjective('');
    setCTemplateId(''); setCTargetType('all_users'); setCMemberIds([]); setCErrors({});
    setCreateOpen(true);
    fetchModalData();
  }

  async function handleCreate() {
    const errors: Record<string, string> = {};
    const titleError = validateTrainingText(cTitle, 'Title');
    const speakerError = validateTrainingText(cSpeaker, 'Speaker');
    const objectiveError = validateTrainingText(cObjective, 'Objective', true);
    if (titleError) errors.title = titleError;
    if (speakerError) errors.speaker = speakerError;
    if (objectiveError) errors.objective = objectiveError;
    if (!cDate) errors.training_date = 'Training date is required.';
    if (cTargetType === 'specific_users' && cMemberIds.length === 0) errors.members = 'Select at least one participant.';
    if (Object.keys(errors).length) { setCErrors(errors); return; }

    // Duplicate check — same title + speaker + date already exists
    const cDateStr = cDate ? format(cDate, 'yyyy-MM-dd') : '';
    const isDuplicateCreate = rows.some(row =>
      row.title.trim().toLowerCase() === cTitle.trim().toLowerCase() &&
      row.speaker.trim().toLowerCase() === cSpeaker.trim().toLowerCase() &&
      row.training_date === cDateStr
    );
    if (isDuplicateCreate) {
      toast.error('A training with the same title, speaker, and date already exists.', { title: 'Duplicate Training' });
      return;
    }

    setCreateSaving(true);
    setCErrors({});
    try {
      const body = {
        title: cTitle.trim(),
        speaker: cSpeaker.trim(),
        training_date: cDate ? format(cDate, 'yyyy-MM-dd') : '',
        objective: cObjective.trim(),
        template_id: cTemplateId ? parseInt(cTemplateId, 10) : null,
        target_type: cTargetType,
        target_user_ids: cTargetType === 'specific_users' ? cMemberIds : [],
      };
      const res = await fetch('/api/training/admin', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fe: Record<string, string> = {};
        if (data && typeof data === 'object') {
          for (const [k, v] of Object.entries(data)) {
            fe[k] = Array.isArray(v) ? (v as string[])[0] : String(v);
          }
        }
        if (Object.keys(fe).length) {
          setCErrors(fe);
          return;
        }
        toast.error((data as any)?.detail ?? 'Failed to create training.', { title: 'Error' });
        return;
      }
      toast.success('Training created.', { title: 'Created' });
      setHasAny(true);
      setCreateOpen(false);
      fetchRows(page, search, statusFilter, sortField, sortDir, false, true);
    } finally {
      setCreateSaving(false);
    }
  }

  async function openEdit(row: TrainingListItem) {
    setETitle(row.title); setESpeaker(row.speaker);
    setEDate(row.training_date ? new Date(row.training_date + 'T00:00:00') : undefined); setEObjective(row.objective);
    setETemplateId(row.template_id ? String(row.template_id) : '');
    setETargetType(row.target_type as 'all_users' | 'specific_users');
    setEMemberIds([]); setEErrors({});
    setEHasResponses(row.submitted_count > 0);
    setEResponseCount(row.submitted_count);
    setEditId(row.id);
    setEditOpen(true);
    await fetchModalData();

    try {
      const detailRes = await fetch(`/api/training/admin/${row.id}`, { credentials: 'include' });
      if (detailRes.ok) {
        const detailData = await detailRes.json();
        if (detailData?.template_id != null) {
          setETemplateId(detailData.template_id ? String(detailData.template_id) : '');
        }
      }
    } catch { /* ignore */ }

    try {
      const res = await fetch(`/api/training/admin/${row.id}/participants`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const ids = ((data.results ?? data) as { user_id: number }[]).map(p => p.user_id);
        setEMemberIds(ids);
      }
    } catch { /* ignore */ }
  }

  async function handleEdit() {
    const errors: Record<string, string> = {};
    const titleError = validateTrainingText(eTitle, 'Title');
    const speakerError = validateTrainingText(eSpeaker, 'Speaker');
    const objectiveError = validateTrainingText(eObjective, 'Objective', true);
    if (titleError) errors.title = titleError;
    if (speakerError) errors.speaker = speakerError;
    if (objectiveError) errors.objective = objectiveError;
    if (!eDate) errors.training_date = 'Training date is required.';
    if (eTargetType === 'specific_users' && eMemberIds.length === 0) errors.members = 'Select at least one participant.';
    if (Object.keys(errors).length) { setEErrors(errors); return; }

    // Duplicate check — same title + speaker + date exists on a different training
    const eDateStr = eDate ? format(eDate, 'yyyy-MM-dd') : '';
    const isDuplicateEdit = rows.some(row =>
      row.id !== editId &&
      row.title.trim().toLowerCase() === eTitle.trim().toLowerCase() &&
      row.speaker.trim().toLowerCase() === eSpeaker.trim().toLowerCase() &&
      row.training_date === eDateStr
    );
    if (isDuplicateEdit) {
      toast.error('A training with the same title, speaker, and date already exists.', { title: 'Duplicate Training' });
      return;
    }

    setEditSaving(true);
    setEErrors({});
    try {
      const body: Record<string, unknown> = {
        title: eTitle.trim(),
        speaker: eSpeaker.trim(),
        training_date: eDate ? format(eDate, 'yyyy-MM-dd') : '',
        objective: eObjective.trim(),
        target_type: eTargetType,
        target_user_ids: eTargetType === 'specific_users' ? eMemberIds : [],
      };
      if (eTemplateId !== '') {
        body.template_id = parseInt(eTemplateId, 10);
      }
      const res = await fetch(`/api/training/admin/${editId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fe: Record<string, string> = {};
        if (data && typeof data === 'object') {
          for (const [k, v] of Object.entries(data)) {
            fe[k] = Array.isArray(v) ? (v as string[])[0] : String(v);
          }
        }
        if (Object.keys(fe).length) {
          setEErrors(fe);
          return;
        }
        toast.error((data as any)?.detail ?? 'Failed to update training.', { title: 'Error' });
        return;
      }
      toast.success('Training updated.', { title: 'Updated' });
      setEditOpen(false);
      fetchRows(page, search, statusFilter, sortField, sortDir, false, true);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteItem) return;
    setDeleting(true);
    setDeletingId(deleteItem.id);
    try {
      const res = await fetch(`/api/training/admin/${deleteItem.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      if (res.status === 204) {
        toast.success('Training deleted.', { title: 'Deleted' });
        setLoading(true);
        setDeleteItem(null);
        fetchRows(page, search, statusFilter, sortField, sortDir, false, true);
      } else {
        const data = await res.json();
        toast.error(data.detail ?? 'Could not delete training.', { title: 'Error' });
        setDeleteItem(null);
      }
    } finally {
      setDeleting(false);
      setDeletingId(null);
    }
  }

  const showHeaderButton = hasAny === true;
  const showEmptyStateAction = !search && statusFilter === 'all' && rows.length === 0 && !loading;

  const columns = useMemo<DataTableColumn<TrainingListItem>[]>(() => [
    {
      key: 'title',
      label: 'Training Title',
      sortField: 'title',
      render: row => (
        <span className="font-medium text-xs leading-snug">{row.title}</span>
      ),
    },
    {
      key: 'speaker',
      label: 'Speaker',
      sortField: 'speaker',
      thClassName: 'max-[780px]:hidden',
      tdClassName: 'max-[780px]:hidden',
      render: row => (
        <span className="text-xs text-[var(--color-text-muted)]">{row.speaker}</span>
      ),
    },
    {
      key: 'training_date',
      label: 'Training Date',
      sortField: 'training_date',
      render: row => (
        <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">
          {formatTrainingDate(row.training_date)}
        </span>
      ),
    },
    {
      key: 'responses',
      label: 'Responses',
      thClassName: 'max-[780px]:hidden',
      tdClassName: 'max-[780px]:hidden',
      render: row => {
        const total = row.total_participants;
        const done = row.submitted_count;
        const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
        const barColor = pct === 0 ? 'bg-gray-400 dark:bg-gray-600' : 'bg-emerald-500 dark:bg-emerald-400';
        return (
          <div className="min-w-[110px]" title={`${pct}% completed`}>
            <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-medium text-gray-500 dark:text-gray-400">
              <span>{done} / {total}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 shadow-[inset_0_0_0_1px] shadow-gray-200 dark:shadow-gray-700">
              <div
                className={`block h-full rounded-full transition-[width] duration-700 ease-out ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      headerAlign: 'center',
      thClassName: 'text-center',
      tdClassName: 'text-center',
      filterContent: (
        <FilterContentList
          options={STATUS_OPTIONS.filter(o => o.value !== 'all')}
          selected={statusFilter}
          onSelect={value => {
            setStatusFilter(value);
            setPage(1);
            triggerFetch(1, search, value, sortField, sortDir, true);
          }}
        />
      ),
      filterActive: statusFilter !== 'all',
      render: row => (
        <StatusPill
          status={getTrainingStatus(row.training_date)}
          label={getTrainingStatusLabel(row.training_date)}
        />
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      headerAlign: 'center',
      thClassName: 'text-center',
      tdClassName: 'text-center',
      render: row => {
        const pct = row.total_participants > 0 ? row.submitted_count / row.total_participants : 0;
        const canDelete = pct <= 0.10;
        return (
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={() => router.push(`/dashboard/assessments/training-evaluation/${row.id}`)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
              title="View"
            >
              <Eye size={12} />
            </button>
            <button
              onClick={() => openEdit(row)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
              title="Edit"
            >
              <Edit2 size={12} />
            </button>
            {canDelete && (
              <button
                onClick={() => setDeleteItem(row)}
                disabled={deletingId === row.id}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-600 transition-colors"
                title="Delete"
              >
                {deletingId === row.id
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Trash2 size={12} />}
              </button>
            )}
          </div>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [statusFilter, sortField, sortDir, triggerFetch, deletingId, search]);

  return (
    <>
      <AdminTableSection<TrainingListItem>
        search={search}
        onSearchChange={q => {
          setSearch(q);
          setPage(1);
          triggerFetch(1, q, statusFilter, sortField, sortDir, true);
        }}
        searchPlaceholder="Search trainings by title or speaker…"
        actions={showHeaderButton ? (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--btn-primary-bg,#2845D6)] px-4 py-2 text-xs font-normal text-white hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <Plus className="size-3" /> New Training
          </button>
        ) : undefined}
        columns={columns}
        rows={rows}
        rowKey={r => r.id}
        loading={loading}
        transitioning={transitioning}
        skeletonRows={8}
        sortField={sortField}
        sortDir={sortDir}
        onSort={field => {
          const nextDir = sortField === field ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc';
          setSortField(field);
          setSortDir(nextDir);
          setPage(1);
          fetchRows(1, search, statusFilter, field, nextDir);
        }}
        page={page}
        totalPages={totalPages}
        pageSize={10}
        totalCount={totalCount}
        onPageChange={p => { setPage(p); fetchRows(p, search, statusFilter, sortField, sortDir, false, true); }}
        emptyTitle="No trainings yet"
        emptyDescription="Create your first training to start collecting evaluations."
        emptyIcons={[GraduationCap, ClipboardList, FileText]}
        emptyAction={showEmptyStateAction ? { label: 'New Training', onClick: openCreate, icon: <Plus className="size-4" /> } : undefined}
      />

      <Modal open={createOpen} onOpenChange={open => !createSaving && !open && setCreateOpen(false)} mobileVariant="dialog">
        <ModalContent className="max-w-lg">
          <ModalHeader>
            <ModalTitle>New Training</ModalTitle>
          </ModalHeader>
          <TrainingFormFields
            modalTitle="New Training"
            formTitle={cTitle}
            speaker={cSpeaker}
            trainingDate={cDate}
            objective={cObjective}
            templateId={cTemplateId}
            targetType={cTargetType}
            memberIds={cMemberIds}
            errors={cErrors}
            templates={templates}
            allUsers={allUsers}
            usersLoading={usersLoading}
            onTitleChange={setCTitle}
            onSpeakerChange={setCSpeaker}
            onTrainingDateChange={setCDate}
            onObjectiveChange={setCObjective}
            onTemplateChange={setCTemplateId}
            onTargetTypeChange={value => {
              setCTargetType(value);
              if (value === 'all_users') setCMemberIds([]);
            }}
            onMemberIdsChange={setCMemberIds}
          />
          <ModalFooter className="flex justify-end">
            <button
              onClick={handleCreate}
              disabled={createSaving || !isCreateFormValid}
              className={cn(
                'min-w-[130px] inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-normal text-white transition-all bg-[#2845D6]',
                (createSaving || !isCreateFormValid) && 'opacity-70 cursor-not-allowed',
              )}
            >
              {!createSaving && <Plus size={14} />}
              {createSaving ? (
                <TextShimmer duration={1.2} className="text-xs font-normal [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">
                  Creating…
                </TextShimmer>
              ) : 'Create Training'}
            </button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal open={editOpen} onOpenChange={open => !editSaving && !open && setEditOpen(false)} mobileVariant="dialog">
        <ModalContent className="max-w-lg">
          <ModalHeader>
            <ModalTitle>Edit Training</ModalTitle>
          </ModalHeader>
          <TrainingFormFields
            modalTitle="Edit Training"
            formTitle={eTitle}
            speaker={eSpeaker}
            trainingDate={eDate}
            objective={eObjective}
            templateId={eTemplateId}
            targetType={eTargetType}
            memberIds={eMemberIds}
            errors={eErrors}
            templates={templates}
            allUsers={allUsers}
            usersLoading={usersLoading}
            onTitleChange={setETitle}
            onSpeakerChange={setESpeaker}
            onTrainingDateChange={setEDate}
            onObjectiveChange={setEObjective}
            onTemplateChange={setETemplateId}
            onTargetTypeChange={setETargetType}
            onMemberIdsChange={setEMemberIds}
            templateDisabled={eResponseCount > 1}
          />
          <ModalFooter className="flex justify-end">
            <button
              onClick={handleEdit}
              disabled={editSaving || !isEditFormValid}
              className={cn(
                'min-w-[130px] inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-normal text-white transition-all bg-[#2845D6]',
                (editSaving || !isEditFormValid) && 'opacity-70 cursor-not-allowed',
              )}
            >
              {!editSaving && <Check size={14} />}
              {editSaving ? (
                <TextShimmer duration={1.2} className="text-xs font-normal [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">
                  Saving…
                </TextShimmer>
              ) : <span>Save Changes</span>}
            </button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete Confirmation */}
      <AnimatePresence>
        {deleteItem && (
          <ConfirmationModal
            title="Delete Training"
            message={`Delete "${deleteItem.title}"? This action cannot be undone.`}
            confirmLabel="Yes, Delete It"
            confirming={deleting}
            onConfirm={handleDelete}
            onCancel={() => setDeleteItem(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

export default function TrainingEvaluationPage() {
  const router = useRouter();
  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');
  const [user, setUser] = useState<UserData | null>(null);

  const fetchUser = useCallback(async () => {
    const timer = setTimeout(() => setAuthPhase('checking'), 350);
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      clearTimeout(timer);
      if (res.status === 401) { router.replace('/'); return; }
      if (!res.ok) { router.replace('/'); return; }
      const u: UserData = await res.json();
      if (u.accounting && !u.admin && !u.hr) { router.replace('/dashboard'); return; }
      setUser(u);
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

  if (!user) return null;

  const isAdminOrHr = user.admin || user.hr;

  if (isAdminOrHr) {
    return (
      <div className="p-6 h-full flex flex-col">
        <div className="mb-5">
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Training Evaluations</h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Manage training sessions and track participant evaluation responses.</p>
        </div>
        <TrainingAdminView user={user} />
      </div>
    );
  }

  return <TrainingUserView />;
}

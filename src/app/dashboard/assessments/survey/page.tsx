'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  BarChart2,
  Check,
  CheckSquare,
  ChevronDown,
  ClipboardList,
  Copy,
  Download,
  Edit2,
  Eye,
  FileText,
  GripVertical,
  Layout,
  Loader2,
  Lock,
  Plus,
  Search,
  Send,
  Settings2,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AdminTableSection } from '@/components/ui/admin-table-section';
import type { DataTableColumn } from '@/components/ui/data-table';
import { StatusPill } from '@/components/ui/status-pill';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { Tabs as VercelTabs } from '@/components/ui/vercel-tabs';
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
import { toast } from '@/components/ui/toast';
import { MultiSelectCombobox, type ComboboxOption } from '@/components/ui/multi-select-combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LeaveRangePicker } from '@/components/ui/leave-range-picker';
import { ChoiceboxGroup } from '@/components/ui/choicebox-1';
import { TextareaWithCharactersLeft } from '@/components/ui/textarea-with-characters-left';
import BasicCheckbox from '@/components/ui/checkbox-1';
import { getCsrfToken } from '@/lib/csrf';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserData {
  id: number;
  idnumber: string;
  firstname: string;
  lastname: string;
  admin: boolean;
  hr: boolean;
  iad: boolean;
}

interface SurveyListItem {
  id: number;
  title: string;
  description: string;
  status: string;
  created_by_name: string;
  target_type: string;
  is_anonymous: boolean;
  start_date: string | null;
  end_date: string | null;
  response_count: number;
  total_targeted: number;
}

interface SurveyUser {
  id: number;
  idnumber: string;
  firstname: string | null;
  lastname: string | null;
  avatar: string | null;
}

interface SurveyQuestionOption {
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
  show_percentage_summary: boolean;
  allow_other: boolean;
  options: SurveyQuestionOption[];
  rating_config: RatingConfig | null;
}

interface SurveyDetail {
  id: number;
  title: string;
  description: string;
  status: string;
  is_anonymous: boolean;
  start_date: string | null;
  end_date: string | null;
  target_type: string;
  target_user_ids: number[];
  questions: SurveyQuestion[];
  response_count: number;
  created_by_name: string;
  is_editable: boolean;
  updated_at: string | null;
}

interface TemplateListItem {
  id: number;
  title: string;
  description: string;
  created_by_name: string;
  created_by_id: number | null;
  created_at: string;
  question_count: number;
}

interface TemplateDetail {
  id: number;
  title: string;
  description: string;
  questions: SurveyQuestion[];
}

interface Pagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const QUESTION_TYPE_OPTIONS = [
  { value: 'single_choice', label: 'Single Choice' },
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'rating', label: 'Rating Scale' },
  { value: 'likert', label: 'Likert Scale' },
  { value: 'short_text', label: 'Short Text' },
  { value: 'long_text', label: 'Long Text' },
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'linear_scale', label: 'Linear Scale' },
];

const CHOICE_BASED_TYPES = new Set(['single_choice', 'multiple_choice', 'dropdown']);
const ALLOW_OTHER_TYPES = new Set(['single_choice', 'multiple_choice', 'dropdown']);

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
];

const STATUS_TRANSITIONS: Record<string, { label: string; next: string } | null> = {
  draft: { label: 'Activate', next: 'active' },
  active: { label: 'Close', next: 'closed' },
  closed: null,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatSurveyDuration(start: string | null, end: string | null): string {
  if (!start || !end) return '—';
  // Parse as local dates to avoid UTC shift
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const sMonth = MONTH_NAMES[sm - 1];
  const eMonth = MONTH_NAMES[em - 1];
  if (sy === ey && sm === em && sd === ed) {
    // Same day
    return `${sMonth} ${sd}, ${sy}`;
  }
  if (sy === ey && sm === em) {
    // Same month & year, different day
    return `${sMonth} ${sd} - ${ed}, ${sy}`;
  }
  if (sy === ey) {
    // Same year, different month
    return `${sMonth} ${String(sd).padStart(2, '0')} - ${eMonth} ${String(ed).padStart(2, '0')}, ${sy}`;
  }
  // Different year
  return `${sMonth} ${String(sd).padStart(2, '0')}, ${sy} - ${eMonth} ${String(ed).padStart(2, '0')}, ${ey}`;
}

function formatLongDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ── SurveyMemberPicker ────────────────────────────────────────────────────────

function surveyUserName(u: SurveyUser): string {
  return [u.firstname, u.lastname].filter(Boolean).join(' ') || u.idnumber;
}

function SurveyMemberPicker({
  value,
  onChange,
  users,
  loading,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  users: SurveyUser[];
  loading: boolean;
}) {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? users.filter(u => {
        const name = surveyUserName(u).toLowerCase();
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
      <div className="max-h-[220px] overflow-y-auto [scrollbar-width:thin]">
        {filtered.length === 0 ? (
          <EmptyState
            title={search.trim() ? 'No results found.' : 'No employees found.'}
            description={search.trim() ? 'Try another search term.' : 'Add employees to the system to target them in this survey.'}
            icons={[ClipboardList, FileText, BarChart2]}
            className="bg-transparent shadow-none p-0 py-6"
          />
        ) : (
          filtered.map(u => {
            const selected = value.includes(u.id);
            const name = surveyUserName(u);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 transition-colors text-left border-b border-[var(--color-border)] last:border-b-0',
                  selected ? 'bg-[#2845D6]/8' : 'hover:bg-[var(--color-bg-card)]',
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
                  selected ? 'bg-[#2845D6] border-[#2845D6]' : 'border-[var(--color-border-strong)] bg-transparent',
                )}>
                  {selected && <Check size={10} className="text-white" />}
                </span>
              </button>
            );
          })
        )}
      </div>
      {value.length > 0 && (
        <div className="border-t border-[var(--color-border)] px-3 py-1.5 flex items-center justify-between">
          <span className="text-[10px] text-[var(--color-text-muted)]">{value.length} selected</span>
          <button type="button" onClick={() => onChange([])} className="text-[10px] text-red-500 hover:text-red-600 transition-colors">
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

function typeLabel(t: string): string {
  return QUESTION_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t;
}

// ── BoolBadge ─────────────────────────────────────────────────────────────────

function BoolBadge({ value, trueLabel = 'Yes', falseLabel = 'No' }: { value: boolean; trueLabel?: string; falseLabel?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
      value
        ? 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400'
        : 'bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400',
    )}>
      {value ? trueLabel : falseLabel}
    </span>
  );
}

// ── Sortable Question Card ─────────────────────────────────────────────────────

interface SortableQuestionCardProps {
  question: SurveyQuestion;
  index: number;
  isEditable: boolean;
  onEdit: (q: SurveyQuestion) => void;
  onDelete: (id: number) => void;
}

function SortableQuestionCard({ question, index, isEditable, onEdit, onDelete }: SortableQuestionCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-xl border border-border bg-card p-4 flex gap-3',
        isDragging && 'shadow-lg',
      )}
    >
      {isEditable && (
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </button>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">Q{index + 1}</span>
            <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">
              {typeLabel(question.question_type)}
            </span>
            {question.is_required && (
              <span className="text-xs rounded-full bg-red-100 text-red-600 dark:bg-red-950/30 dark:text-red-400 px-2 py-0.5 font-medium">Required</span>
            )}
            {question.show_percentage_summary && (
              <span className="text-xs rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 px-2 py-0.5 font-medium">% Summary</span>
            )}
          </div>
          {isEditable && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onEdit(question)}
                className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Edit question"
              >
                <Edit2 className="size-3.5" />
              </button>
              <button
                onClick={() => onDelete(question.id)}
                className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label="Delete question"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        <p className="mt-1.5 text-sm font-medium leading-snug">{question.question_text}</p>

        {CHOICE_BASED_TYPES.has(question.question_type) && question.options.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {question.options.slice(0, 4).map(opt => (
              <li key={opt.id} className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                {opt.option_text}
              </li>
            ))}
            {question.options.length > 4 && (
              <li className="text-xs text-muted-foreground italic">+{question.options.length - 4} more…</li>
            )}
            {question.allow_other && (
              <li className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                Other (open text)
              </li>
            )}
          </ul>
        )}

        {question.question_type === 'rating' && question.rating_config && (
          <p className="mt-2 text-xs text-muted-foreground">
            Scale: {question.rating_config.min_value}–{question.rating_config.max_value}
            {question.rating_config.min_label && ` · "${question.rating_config.min_label}"`}
            {question.rating_config.max_label && ` → "${question.rating_config.max_label}"`}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Question Editor Modal ──────────────────────────────────────────────────────

interface QuestionEditorProps {
  open: boolean;
  question: SurveyQuestion | null;
  isEditable: boolean;
  surveyOrTemplateId: number;
  mode: 'survey' | 'template';
  onClose: () => void;
  onSaved: (q: SurveyQuestion) => void;
}

function QuestionEditor({ open, question, isEditable, surveyOrTemplateId, mode, onClose, onSaved }: QuestionEditorProps) {
  const [form, setForm] = useState({
    question_text: '',
    question_type: 'single_choice',
    is_required: false,
    show_percentage_summary: false,
    allow_other: false,
  });
  const [ratingConfig, setRatingConfig] = useState({ min_value: 1, max_value: 5, min_label: '', max_label: '' });
  const [options, setOptions] = useState<SurveyQuestionOption[]>([]);
  const [newOptionText, setNewOptionText] = useState('');
  const [saving, setSaving] = useState(false);
  const [addingOption, setAddingOption] = useState(false);
  const [deletingOptionId, setDeletingOptionId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    if (question) {
      setForm({
        question_text: question.question_text,
        question_type: question.question_type,
        is_required: question.is_required,
        show_percentage_summary: question.show_percentage_summary,
        allow_other: question.allow_other,
      });
      setOptions(question.options ?? []);
      setRatingConfig(question.rating_config ?? { min_value: 1, max_value: 5, min_label: '', max_label: '' });
    } else {
      setForm({ question_text: '', question_type: 'single_choice', is_required: false, show_percentage_summary: false, allow_other: false });
      setOptions([]);
      setRatingConfig({ min_value: 1, max_value: 5, min_label: '', max_label: '' });
    }
    setErrors({});
    setNewOptionText('');
  }, [open, question]);

  const isChoiceType = CHOICE_BASED_TYPES.has(form.question_type);
  const isRatingType = form.question_type === 'rating';

  const baseUrl = mode === 'survey'
    ? `/api/survey/admin/surveys/${surveyOrTemplateId}/questions`
    : `/api/survey/admin/templates/${surveyOrTemplateId}/questions`;

  async function handleSaveQuestion() {
    if (!form.question_text.trim()) {
      setErrors({ question_text: 'Question text is required.' });
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const payload: Record<string, unknown> = { ...form };
      if (form.question_type === 'rating') {
        payload.rating_min = ratingConfig.min_value;
        payload.rating_max = ratingConfig.max_value;
      }

      let url = question ? `/api/survey/admin/questions/${question.id}` : baseUrl;
      const method = question ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(data)) fe[k] = Array.isArray(v) ? v[0] : String(v);
        setErrors(fe);
        return;
      }

      // If rating type and we have a rating config to save
      if (isRatingType && data.id) {
        await fetch(`/api/survey/admin/questions/${data.id}/rating-config`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
          body: JSON.stringify(ratingConfig),
        }).catch(() => {}); // best-effort
      }

      // Re-fetch full question to get updated rating_config + options
      const refetch = await fetch(
        mode === 'survey'
          ? `/api/survey/admin/surveys/${surveyOrTemplateId}/questions`
          : `/api/survey/admin/templates/${surveyOrTemplateId}/questions`,
        { credentials: 'include' }
      );
      if (refetch.ok) {
        const all: SurveyQuestion[] = await refetch.json();
        const updated = all.find(q => q.id === data.id) ?? data;
        onSaved(updated as SurveyQuestion);
      } else {
        onSaved(data as SurveyQuestion);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleAddOption() {
    if (!newOptionText.trim() || !question) return;
    setAddingOption(true);
    try {
      const res = await fetch(`/api/survey/admin/questions/${question.id}/options`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ option_text: newOptionText.trim() }),
      });
      if (res.ok) {
        const opt = await res.json() as SurveyQuestionOption;
        setOptions(prev => [...prev, opt]);
        setNewOptionText('');
      } else {
        const d = await res.json();
        toast.error(d.detail ?? 'Failed to add option.', { title: 'Error' });
      }
    } finally {
      setAddingOption(false);
    }
  }

  async function handleDeleteOption(optId: number) {
    setDeletingOptionId(optId);
    try {
      const res = await fetch(`/api/survey/admin/options/${optId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      if (res.status === 204) {
        setOptions(prev => prev.filter(o => o.id !== optId));
      } else {
        const d = await res.json();
        toast.error(d.detail ?? 'Failed to delete option.', { title: 'Error' });
      }
    } finally {
      setDeletingOptionId(null);
    }
  }

  return (
    <Modal open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <ModalContent className="max-w-lg">
        <ModalHeader>
          <ModalTitle className="text-base font-semibold">
            {question ? 'Edit Question' : 'Add Question'}
          </ModalTitle>
        </ModalHeader>
        <ModalBody className="flex flex-col gap-4">
          {/* Question type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Question Type</label>
            <Select
              value={form.question_type}
              onValueChange={v => setForm(f => ({ ...f, question_type: v, allow_other: ALLOW_OTHER_TYPES.has(v) ? f.allow_other : false }))}
              disabled={!isEditable}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_TYPE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Question text */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
              Question Text {!form.question_text.trim() && <span className="text-red-500 normal-case tracking-normal">*</span>}
            </label>
            <textarea
              value={form.question_text}
              onChange={e => setForm(f => ({ ...f, question_text: e.target.value }))}
              disabled={!isEditable}
              maxLength={1000}
              rows={3}
              className={cn(
                'w-full rounded-lg border border-border bg-[var(--color-bg-elevated)] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring transition-colors',
                errors.question_text && 'border-destructive',
              )}
              placeholder="Enter your question…"
            />
            {errors.question_text && <p className="text-xs text-destructive">{errors.question_text}</p>}
          </div>

          {/* Options (choice-based) */}
          {isChoiceType && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Options</label>
              <div className="flex flex-col gap-1.5">
                {options.map(opt => (
                  <div key={opt.id} className="flex items-center gap-2 rounded-md bg-muted/40 border border-border px-3 py-1.5">
                    <span className="flex-1 text-sm">{opt.option_text}</span>
                    {isEditable && (
                      <button
                        onClick={() => handleDeleteOption(opt.id)}
                        disabled={deletingOptionId === opt.id}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        {deletingOptionId === opt.id
                          ? <Loader2 className="size-3.5 animate-spin" />
                          : <X className="size-3.5" />}
                      </button>
                    )}
                  </div>
                ))}
                {options.length === 0 && !question && (
                  <p className="text-xs text-muted-foreground italic">Save the question first, then add options.</p>
                )}
              </div>
              {isEditable && question && (
                <div className="flex gap-2">
                  <Input
                    value={newOptionText}
                    onChange={e => setNewOptionText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddOption(); } }}
                    placeholder="Type option text and press Enter…"
                    maxLength={500}
                    className="flex-1"
                  />
                  <button
                    onClick={handleAddOption}
                    disabled={!newOptionText.trim() || addingOption}
                    className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {addingOption ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                    Add
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Rating config */}
          {isRatingType && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-sm font-medium">Rating Scale</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Min Value</label>
                  <Input
                    type="number"
                    value={ratingConfig.min_value}
                    onChange={e => setRatingConfig(c => ({ ...c, min_value: parseInt(e.target.value, 10) || 1 }))}
                    disabled={!isEditable}
                    min={1}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Max Value</label>
                  <Input
                    type="number"
                    value={ratingConfig.max_value}
                    onChange={e => setRatingConfig(c => ({ ...c, max_value: parseInt(e.target.value, 10) || 5 }))}
                    disabled={!isEditable}
                    min={2}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Min Label (optional)</label>
                  <Input
                    value={ratingConfig.min_label}
                    onChange={e => setRatingConfig(c => ({ ...c, min_label: e.target.value }))}
                    disabled={!isEditable}
                    placeholder="e.g. Very Poor"
                    maxLength={100}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Max Label (optional)</label>
                  <Input
                    value={ratingConfig.max_label}
                    onChange={e => setRatingConfig(c => ({ ...c, max_label: e.target.value }))}
                    disabled={!isEditable}
                    placeholder="e.g. Excellent"
                    maxLength={100}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Toggles */}
          <div className="flex flex-col gap-2 pt-1">
            {[
              { key: 'is_required', label: 'Required question' },
              { key: 'show_percentage_summary', label: 'Show percentage summary in results' },
              ...(ALLOW_OTHER_TYPES.has(form.question_type) ? [{ key: 'allow_other', label: 'Allow "Other" text input' }] : []),
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form[key as keyof typeof form] as boolean}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                  disabled={!isEditable}
                  className="rounded border-border"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>

          {!isEditable && (
            <div className="flex items-center gap-2 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 dark:bg-yellow-950/20 dark:border-yellow-800">
              <Lock className="size-3.5 text-yellow-600 dark:text-yellow-400 shrink-0" />
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                This survey is not in Draft status. Questions cannot be edited.
              </p>
            </div>
          )}
        </ModalBody>
        <ModalFooter className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted transition-colors">
            {isEditable ? 'Cancel' : 'Close'}
          </button>
          {isEditable && (
            <button
              onClick={handleSaveQuestion}
              disabled={saving || !form.question_text.trim()}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving && <span className="size-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />}
              {saving ? 'Saving…' : question ? 'Update' : 'Add Question'}
            </button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ── Survey Builder View ────────────────────────────────────────────────────────

interface SurveyBuilderViewProps {
  surveyId: number | null; // null = create new
  onBack: () => void;
  onSaved: () => void;
}

function SurveyBuilderView({ surveyId, onBack, onSaved }: SurveyBuilderViewProps) {
  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [loading, setLoading] = useState(!!surveyId);
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [questionEditorOpen, setQuestionEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<SurveyQuestion | null>(null);
  const [reordering, setReordering] = useState(false);
  const [deletingQId, setDeletingQId] = useState<number | null>(null);
  const [statusChanging, setStatusChanging] = useState(false);
  const [targetUsers, setTargetUsers] = useState<ComboboxOption[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userOptions, setUserOptions] = useState<ComboboxOption[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    target_type: 'all_users',
    is_anonymous: false,
    start_date: '',
    end_date: '',
    target_user_ids: [] as number[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Load survey if editing
  useEffect(() => {
    if (!surveyId) { setLoading(false); return; }
    fetch(`/api/survey/admin/surveys/${surveyId}`, { credentials: 'include' })
      .then(r => r.json())
      .then((d: SurveyDetail) => {
        setSurvey(d);
        setForm({
          title: d.title,
          description: d.description,
          target_type: d.target_type,
          is_anonymous: d.is_anonymous,
          start_date: d.start_date ?? '',
          end_date: d.end_date ?? '',
          target_user_ids: d.target_user_ids ?? [],
        });
        const sortedQ = [...(d.questions ?? [])].sort((a, b) => a.order - b.order);
        setQuestions(sortedQ);
        // Prefill user options for selected target users
        if (d.target_user_ids?.length) {
          setTargetUsers(
            d.target_user_ids.map(id => ({
              value: String(id),
              label: `User #${id}`,
            }))
          );
        }
      })
      .catch(() => toast.error('Failed to load survey.', { title: 'Error' }))
      .finally(() => setLoading(false));
  }, [surveyId]);

  // User search for specific_users targeting
  useEffect(() => {
    if (userSearch.length < 2) { setUserOptions([]); return; }
    const controller = new AbortController();
    setUserSearchLoading(true);
    fetch(`/api/survey/admin/users?search=${encodeURIComponent(userSearch)}`, { credentials: 'include', signal: controller.signal })
      .then(r => r.json())
      .then(d => {
        setUserOptions((d.results as { id: number; idnumber: string; full_name: string }[]).map(u => ({
          value: String(u.id),
          label: `${u.full_name} (${u.idnumber})`,
        })));
      })
      .catch(() => {})
      .finally(() => setUserSearchLoading(false));
    return () => controller.abort();
  }, [userSearch]);

  const isEditable = !survey || survey.is_editable;

  async function handleSaveMeta() {
    if (!form.title.trim()) { setErrors({ title: 'Title is required.' }); return; }
    setSaving(true);
    setErrors({});
    try {
      const payload = {
        ...form,
        target_user_ids: form.target_type === 'specific_users'
          ? targetUsers.map(u => parseInt(u.value, 10))
          : [],
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      };

      const url = surveyId ? `/api/survey/admin/surveys/${surveyId}` : '/api/survey/admin/surveys';
      const method = surveyId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify(payload),
      });
      const rawData = await res.json();
      if (!res.ok) {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(rawData as Record<string, unknown>))
          fe[k] = Array.isArray(v) ? (v as string[])[0] : String(v);
        setErrors(fe);
        return;
      }
      const data = rawData as SurveyDetail;
      toast.success(surveyId ? 'Survey updated.' : 'Survey created.', { title: 'Saved' });
      setSurvey(data);
      setQuestions([...(data.questions ?? [])].sort((a, b) => a.order - b.order));
      if (!surveyId) {
        // Navigate to the edit view of the newly created survey
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange() {
    if (!survey) return;
    const transition = STATUS_TRANSITIONS[survey.status];
    if (!transition) return;
    if (!confirm(`Are you sure you want to ${transition.label.toLowerCase()} this survey?`)) return;
    setStatusChanging(true);
    try {
      const res = await fetch(`/api/survey/admin/surveys/${survey.id}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ status: transition.next }),
      });
      if (res.ok) {
        toast.success(`Survey ${transition.label.toLowerCase()}d.`, { title: transition.label });
        setSurvey(s => s ? { ...s, status: transition.next, is_editable: transition.next === 'draft' } : s);
        onSaved();
      } else {
        const d = await res.json();
        toast.error(d.detail ?? 'Status change failed.', { title: 'Error' });
      }
    } finally {
      setStatusChanging(false);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = questions.findIndex(q => q.id === active.id);
    const newIndex = questions.findIndex(q => q.id === over.id);
    const reordered = arrayMove(questions, oldIndex, newIndex).map((q, i) => ({ ...q, order: i + 1 }));
    setQuestions(reordered);
    // Persist to server
    setReordering(true);
    fetch(`/api/survey/admin/surveys/${survey?.id}/questions/reorder`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
      body: JSON.stringify({
        order: reordered.map(q => ({ id: q.id, order: q.order })),
        last_updated: survey?.updated_at,
      }),
    })
      .then(r => r.json())
      .then(d => {
        if (!Array.isArray(d)) {
          toast.error((d as { detail?: string }).detail ?? 'Reorder failed.', { title: 'Error' });
        }
      })
      .catch(() => toast.error('Reorder failed.', { title: 'Error' }))
      .finally(() => setReordering(false));
  }

  function handleQuestionSaved(q: SurveyQuestion) {
    setQuestions(prev => {
      const idx = prev.findIndex(pq => pq.id === q.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = q;
        return next;
      }
      return [...prev, q];
    });
  }

  async function handleDeleteQuestion(id: number) {
    if (!confirm('Delete this question?')) return;
    setDeletingQId(id);
    try {
      const res = await fetch(`/api/survey/admin/questions/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      if (res.status === 204) {
        setQuestions(prev => prev.filter(q => q.id !== id));
        toast.success('Question deleted.', { title: 'Deleted' });
      } else {
        const d = await res.json();
        toast.error(d.detail ?? 'Could not delete question.', { title: 'Error' });
      }
    } finally {
      setDeletingQId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="size-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const transition = survey ? STATUS_TRANSITIONS[survey.status] : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <span className="text-muted-foreground/30">/</span>
        <h2 className="text-base font-semibold">
          {survey ? `Editing: ${survey.title}` : 'New Survey'}
        </h2>
        {survey && (
          <StatusPill status={survey.status} label={survey.status.charAt(0).toUpperCase() + survey.status.slice(1)} />
        )}
        {transition && (
          <button
            onClick={handleStatusChange}
            disabled={statusChanging}
            className="ml-auto flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {statusChanging ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            {transition.label}
          </button>
        )}
      </div>

      {/* Metadata form */}
      <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Survey Details</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
              Title {!form.title.trim() && <span className="text-red-500 normal-case tracking-normal">*</span>}
            </label>
            <Input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              disabled={!isEditable}
              maxLength={200}
              placeholder="Survey title…"
              className={cn(errors.title && 'border-destructive')}
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>

          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              disabled={!isEditable}
              maxLength={1000}
              rows={3}
              className="w-full rounded-lg border border-border bg-[var(--color-bg-elevated)] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring transition-colors disabled:opacity-60"
              placeholder="Optional description…"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
              Start Date {!form.start_date && <span className="text-red-500 normal-case tracking-normal">*</span>}
            </label>
            <Input
              type="date"
              value={form.start_date}
              onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
              disabled={!isEditable}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
              End Date {!form.end_date && <span className="text-red-500 normal-case tracking-normal">*</span>}
            </label>
            <Input
              type="date"
              value={form.end_date}
              onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
              disabled={!isEditable}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Target Audience</label>
            <Select
              value={form.target_type}
              onValueChange={v => setForm(f => ({ ...f, target_type: v }))}
              disabled={!isEditable}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_users">All Users</SelectItem>
                <SelectItem value="specific_users">Specific Users</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 justify-end">
            <label className="flex items-center gap-2 cursor-pointer mt-5">
              <input
                type="checkbox"
                checked={form.is_anonymous}
                onChange={e => setForm(f => ({ ...f, is_anonymous: e.target.checked }))}
                disabled={!isEditable}
                className="rounded border-border"
              />
              <span className="text-xs font-normal">Anonymous responses</span>
            </label>
          </div>

          {form.target_type === 'specific_users' && (
            <div className="sm:col-span-2 flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                Select Target Users {(form.target_type === 'specific_users' && form.target_user_ids.length === 0) && <span className="text-red-500 normal-case tracking-normal">*</span>}
              </label>
              <Input
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Search users by name or ID (min 2 chars)…"
                disabled={!isEditable}
              />
              {userSearchLoading && <p className="text-xs text-muted-foreground">Searching…</p>}
              <MultiSelectCombobox
                options={[...userOptions, ...targetUsers.filter(tu => !userOptions.find(uo => uo.value === tu.value))]}
                selected={targetUsers.map(u => u.value)}
                onChange={sel => {
                  const allOptions = [...userOptions, ...targetUsers];
                  setTargetUsers(allOptions.filter(o => sel.includes(o.value)));
                  setForm(f => ({ ...f, target_user_ids: sel.map(s => parseInt(s, 10)) }));
                }}
                placeholder="Selected users will appear here…"
                disabled={!isEditable}
              />
              {errors.target_user_ids && <p className="text-xs text-destructive">{errors.target_user_ids}</p>}
            </div>
          )}
        </div>

        {isEditable && (
          <div className="flex justify-end pt-2 border-t border-border">
            <button
              onClick={handleSaveMeta}
              disabled={saving}
              className="flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving && <span className="size-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />}
              {saving ? 'Saving…' : surveyId ? 'Save Changes' : 'Create Survey'}
            </button>
          </div>
        )}
      </div>

      {/* Questions section */}
      {survey && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Questions
              <span className="ml-2 text-muted-foreground font-normal">({questions.length})</span>
              {reordering && <Loader2 className="inline ml-2 size-3.5 animate-spin text-muted-foreground" />}
            </h3>
            {isEditable && (
              <button
                onClick={() => { setEditingQuestion(null); setQuestionEditorOpen(true); }}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="size-3.5" /> Add Question
              </button>
            )}
          </div>

          {questions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 rounded-xl border border-dashed border-border text-muted-foreground">
              <ClipboardList className="size-8 opacity-40" />
              <p className="text-sm">No questions yet. {isEditable && 'Add your first question above.'}</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={questions.map(q => q.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-3">
                  {questions.map((q, i) => (
                    <SortableQuestionCard
                      key={q.id}
                      question={q}
                      index={i}
                      isEditable={isEditable}
                      onEdit={q => { setEditingQuestion(q); setQuestionEditorOpen(true); }}
                      onDelete={handleDeleteQuestion}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}

      <QuestionEditor
        open={questionEditorOpen}
        question={editingQuestion}
        isEditable={isEditable}
        surveyOrTemplateId={survey?.id ?? 0}
        mode="survey"
        onClose={() => setQuestionEditorOpen(false)}
        onSaved={handleQuestionSaved}
      />
    </div>
  );
}

// ── Surveys Tab ────────────────────────────────────────────────────────────────

function SurveysTab({ user }: { user: UserData }) {
  const [rows, setRows] = useState<SurveyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [builderSurveyId, setBuilderSurveyId] = useState<number | null | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [hasAnySurvey, setHasAnySurvey] = useState<boolean | null>(null);

  // New Survey modal state
  const [newSurveyOpen, setNewSurveyOpen] = useState(false);
  const [newSurveySaving, setNewSurveySaving] = useState(false);
  const [survTitle, setSurvTitle] = useState('');
  const [survStartDate, setSurvStartDate] = useState<Date | undefined>(undefined);
  const [survEndDate, setSurvEndDate] = useState<Date | undefined>(undefined);
  const [survIsAnonymous, setSurvIsAnonymous] = useState(false);
  const [survTemplateId, setSurvTemplateId] = useState('');
  const [survTargetScope, setSurvTargetScope] = useState<'all' | 'selected'>('all');
  const [survMemberIds, setSurvMemberIds] = useState<number[]>([]);
  const [survErrors, setSurvErrors] = useState<Record<string, string>>({});
  const [modalTemplates, setModalTemplates] = useState<TemplateListItem[]>([]);
  const [allUsers, setAllUsers] = useState<SurveyUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRows = useCallback(async (p: number, q: string, status: string, isInitial = false) => {
    const startTime = Date.now();
    if (isInitial) setLoading(true);
    else setTransitioning(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set('search', q);
      if (status !== 'all') params.set('status', status);
      const res = await fetch(`/api/survey/admin/surveys?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setRows(data.results as SurveyListItem[]);
      setTotalPages(data.pagination.total_pages);
      setTotalCount(data.pagination.total);
      if (!q && status === 'all') {
        setHasAnySurvey(data.pagination.total > 0);
      }
    } catch {
      toast.error('Could not load surveys.', { title: 'Error' });
    } finally {
      // Enforce minimum 1 second skeleton display
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 1000 - elapsed);
      if (remaining > 0) await new Promise<void>(r => setTimeout(r, remaining));
      setLoading(false);
      setTransitioning(false);
    }
  }, []);

  const triggerFetch = useCallback((p: number, q: string, status: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setTransitioning(true);
    debounceRef.current = setTimeout(() => fetchRows(p, q, status), 300);
  }, [fetchRows]);

  useEffect(() => {
    fetchRows(1, '', 'all', true);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchRows]);

  const fetchModalTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/survey/admin/templates?page=1', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setModalTemplates(data.results as TemplateListItem[]);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchAllUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch('/api/auth/users', { credentials: 'include' });
      const data = await res.json();
      setAllUsers(Array.isArray(data) ? (data as SurveyUser[]) : []);
    } catch {
      setAllUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  function openNewSurvey() {
    setSurvTitle('');
    setSurvStartDate(undefined);
    setSurvEndDate(undefined);
    setSurvIsAnonymous(false);
    setSurvTemplateId('');
    setSurvTargetScope('all');
    setSurvMemberIds([]);
    setSurvErrors({});
    setNewSurveyOpen(true);
    fetchModalTemplates();
    fetchAllUsers();
  }

  const isNewSurveyTitleEmpty = !survTitle.trim();
  const isNewSurveyTemplateEmpty = !survTemplateId;
  const isNewSurveyTargetInvalid = survTargetScope === 'selected' && survMemberIds.length === 0;
  const isCreateSurveyDisabled = newSurveySaving || isNewSurveyTitleEmpty || !survStartDate || !survEndDate || isNewSurveyTemplateEmpty || isNewSurveyTargetInvalid;

  async function handleCreateSurvey() {
    const errors: Record<string, string> = {};
    if (isNewSurveyTitleEmpty) errors.title = 'Survey title is required.';
    if (!survStartDate) errors.start_date = 'Start date is required.';
    if (!survEndDate) errors.end_date = 'End date is required.';
    if (isNewSurveyTemplateEmpty) errors.template = 'Template is required.';
    if (isNewSurveyTargetInvalid) errors.target = 'Select at least one user.';
    if (Object.keys(errors).length) { setSurvErrors(errors); return; }

    setNewSurveySaving(true);
    setSurvErrors({});
    try {
      const body: Record<string, unknown> = {
        title: survTitle.trim(),
        description: '',
        start_date: survStartDate!.toISOString().split('T')[0],
        end_date: survEndDate!.toISOString().split('T')[0],
        is_anonymous: survIsAnonymous,
        target_type: survTargetScope === 'all' ? 'all_users' : 'specific_users',
        target_user_ids: survTargetScope === 'selected' ? survMemberIds : [],
        status: 'draft',
        template_id: Number(survTemplateId),
      };
      const res = await fetch('/api/survey/admin/surveys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify(body),
      });
      const raw = await res.json();
      if (!res.ok) {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw as Record<string, unknown>))
          fe[k] = Array.isArray(v) ? (v as string[])[0] : String(v);
        setSurvErrors(fe);
        return;
      }
      toast.success('Survey created.', { title: 'Created' });
      setHasAnySurvey(true);
      setNewSurveyOpen(false);
      await fetchRows(page, search, statusFilter);
    } finally {
      setNewSurveySaving(false);
    }
  }

  async function handleDelete(row: SurveyListItem) {
    if (!confirm(`Delete survey "${row.title}"? This cannot be undone.`)) return;
    setDeletingId(row.id);
    try {
      const res = await fetch(`/api/survey/admin/surveys/${row.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      if (res.status === 204) {
        toast.success('Survey deleted.', { title: 'Deleted' });
        fetchRows(page, search, statusFilter);
      } else {
        const d = await res.json();
        toast.error(d.detail ?? 'Could not delete survey.', { title: 'Error' });
      }
    } finally {
      setDeletingId(null);
    }
  }

  const statusFilterContent = (
    <div className="flex flex-col gap-1 min-w-[130px]">
      {STATUS_OPTIONS.map(o => (
        <button
          key={o.value}
          onClick={() => {
            setStatusFilter(o.value);
            setPage(1);
            triggerFetch(1, search, o.value);
          }}
          className={cn(
            'w-full text-left rounded px-2 py-1.5 text-sm transition-colors',
            statusFilter === o.value ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  const columns: DataTableColumn<SurveyListItem>[] = useMemo(() => [
    {
      key: 'title',
      label: 'Survey Title',
      render: row => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-sm leading-snug">{row.title}</span>
          {row.is_anonymous && (
            <span className="text-[10px] text-muted-foreground">Anonymous</span>
          )}
          <StatusPill
            status={row.status}
            label={row.status.charAt(0).toUpperCase() + row.status.slice(1)}
            className="mt-0.5 w-fit"
          />
        </div>
      ),
    },
    {
      key: 'duration',
      label: 'Duration',
      render: row => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatSurveyDuration(row.start_date, row.end_date)}
        </span>
      ),
    },
    {
      key: 'responses',
      label: 'Responses',
      render: row => {
        const total = row.total_targeted ?? 0;
        const completed = row.response_count;
        const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
        return (
          <div className="flex flex-col gap-1 min-w-[110px]">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{completed} / {total}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'actions',
      label: '',
      render: row => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => setBuilderSurveyId(row.id)}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Edit"
          >
            <Edit2 className="size-3.5" />
          </button>
          {row.status === 'draft' && (
            <button
              onClick={() => handleDelete(row)}
              disabled={deletingId === row.id}
              className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Delete"
            >
              {deletingId === row.id
                ? <Loader2 className="size-3.5 animate-spin" />
                : <Trash2 className="size-3.5" />}
            </button>
          )}
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [statusFilter, deletingId]);

  if (builderSurveyId !== undefined) {
    return (
      <SurveyBuilderView
        surveyId={builderSurveyId}
        onBack={() => { setBuilderSurveyId(undefined); fetchRows(page, search, statusFilter); }}
        onSaved={() => fetchRows(page, search, statusFilter)}
      />
    );
  }

  const showHeaderButton = hasAnySurvey === true;

  return (
    <>
      <AdminTableSection<SurveyListItem>
        search={search}
        onSearchChange={q => { setSearch(q); setPage(1); triggerFetch(1, q, statusFilter); }}
        searchPlaceholder="Search surveys…"
        actions={showHeaderButton ? (
          <button
            onClick={openNewSurvey}
            className="flex items-center gap-1.5 rounded-md bg-[var(--btn-primary-bg,#2845D6)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <Plus className="size-4" /> New Survey
          </button>
        ) : undefined}
        columns={columns}
        rows={rows}
        rowKey={r => r.id}
        loading={loading}
        transitioning={transitioning}
        skeletonRows={8}
        sortField=""
        sortDir="asc"
        onSort={() => {}}
        page={page}
        totalPages={totalPages}
        pageSize={20}
        totalCount={totalCount}
        onPageChange={p => { setPage(p); fetchRows(p, search, statusFilter); }}
        emptyTitle="No surveys yet"
        emptyDescription="Create your first survey to start collecting responses."
        emptyIcons={[ClipboardList, FileText, BarChart2]}
        emptyAction={hasAnySurvey === false ? { label: 'New Survey', onClick: openNewSurvey, icon: <Plus className="size-4" /> } : undefined}
      />

      {/* New Survey Modal */}
      <Modal open={newSurveyOpen} onOpenChange={open => !newSurveySaving && !open && setNewSurveyOpen(false)}>
        <ModalContent className="max-w-lg">
          <ModalHeader>
            <ModalTitle>New Survey</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-4">
              {/* Title */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                Survey Title {isNewSurveyTitleEmpty && <span className="text-red-500 normal-case tracking-normal">*</span>}
              </label>
              <Input
                value={survTitle}
                onChange={e => setSurvTitle(e.target.value)}
                maxLength={200}
                placeholder="Enter survey title…"
                className={cn(survErrors.title && 'border-destructive')}
              />
              {survErrors.title && <p className="text-xs text-destructive">{survErrors.title}</p>}
            </div>

            {/* Date Range */}
            <div className="flex flex-col gap-1.5">
              <LeaveRangePicker
                dateStart={survStartDate}
                dateEnd={survEndDate}
                onDateStartChange={d => {
                  setSurvStartDate(d);
                  if (!d) setSurvEndDate(undefined);
                }}
                onDateEndChange={setSurvEndDate}
                errorStart={survErrors.start_date}
                errorEnd={survErrors.end_date}
                closeOnSelect={false}
              />
            </div>

            {/* Anonymous toggle */}
            <BasicCheckbox
              checked={survIsAnonymous}
              onCheckedChange={setSurvIsAnonymous}
              label="Anonymous Response"
              className="justify-end"
            />

            {/* Template selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                Template {isNewSurveyTemplateEmpty && <span className="text-red-500 normal-case tracking-normal">*</span>}
              </label>
              <Select value={survTemplateId} onValueChange={setSurvTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  {modalTemplates.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {survErrors.template && <p className="text-xs text-destructive">{survErrors.template}</p>}
            </div>

            {/* Target Users */}
            <div className="flex flex-col gap-2">
              <ChoiceboxGroup
                direction="row"
                label="Target Users"
                showLabel
                onChange={(v: string) => {
                  const scope = v as 'all' | 'selected';
                  setSurvTargetScope(scope);
                  if (scope === 'all') setSurvMemberIds([]);
                }}
                type="radio"
                value={survTargetScope}
              >
                <ChoiceboxGroup.Item
                  title="All Users"
                  description="Survey sent to every employee"
                  value="all"
                />
                <ChoiceboxGroup.Item
                  title="Specific Users"
                  description="Manually pick target employees"
                  value="selected"
                />
              </ChoiceboxGroup>
              <AnimatePresence initial={false}>
                {survTargetScope === 'selected' && (
                  <motion.div
                    key="member-picker"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                    <SurveyMemberPicker
                      value={survMemberIds}
                      onChange={setSurvMemberIds}
                      users={allUsers}
                      loading={usersLoading}
                    />
                    {survErrors.target && (
                      <p className="text-xs text-destructive mt-1">{survErrors.target}</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <div className="flex justify-end">
            <button
              onClick={handleCreateSurvey}
              disabled={isCreateSurveyDisabled}
              className={cn(
                'min-w-[130px] inline-flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all',
                'bg-[var(--btn-primary-bg,#2845D6)] text-white',
                isCreateSurveyDisabled && 'opacity-60 cursor-not-allowed',
              )}
            >
              <Plus className="size-4" />
              {newSurveySaving ? (
                <TextShimmer duration={1.2} className="text-sm font-semibold text-white [--base-color:#a5b4fc] [--base-gradient-color:#ffffff] dark:[--base-color:#a5b4fc] dark:[--base-gradient-color:#ffffff]">
                  Creating…
                </TextShimmer>
              ) : 'Create Survey'}
            </button>
          </div>
        </ModalFooter>
      </ModalContent>
      </Modal>
    </>
  );
}

// ── Template Builder View ──────────────────────────────────────────────────────

interface TemplateBuilderViewProps {
  templateId: number | null;
  onBack: () => void;
  onSaved: () => void;
}

function TemplateBuilderView({ templateId, onBack, onSaved }: TemplateBuilderViewProps) {
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(!!templateId);
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [questionEditorOpen, setQuestionEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<SurveyQuestion | null>(null);
  const [form, setForm] = useState({ title: '', description: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!templateId) { setLoading(false); return; }
    fetch(`/api/survey/admin/templates/${templateId}`, { credentials: 'include' })
      .then(r => r.json())
      .then((d: TemplateDetail) => {
        setTemplate(d);
        setForm({ title: d.title, description: d.description });
        setQuestions([...(d.questions ?? [])].sort((a, b) => a.order - b.order));
      })
      .catch(() => toast.error('Failed to load template.', { title: 'Error' }))
      .finally(() => setLoading(false));
  }, [templateId]);

  async function handleSave() {
    if (!form.title.trim()) { setErrors({ title: 'Title is required.' }); return; }
    setSaving(true);
    setErrors({});
    try {
      const url = templateId ? `/api/survey/admin/templates/${templateId}` : '/api/survey/admin/templates';
      const method = templateId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify(form),
      });
      const rawData = await res.json();
      if (!res.ok) {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(rawData as Record<string, unknown>))
          fe[k] = Array.isArray(v) ? (v as string[])[0] : String(v);
        setErrors(fe);
        return;
      }
      const data = rawData as TemplateDetail;
      toast.success(templateId ? 'Template updated.' : 'Template created.', { title: 'Saved' });
      setTemplate(data);
      setQuestions([...(data.questions ?? [])].sort((a, b) => a.order - b.order));
      if (!templateId) onSaved();
    } finally {
      setSaving(false);
    }
  }

  function handleQuestionSaved(q: SurveyQuestion) {
    setQuestions(prev => {
      const idx = prev.findIndex(pq => pq.id === q.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = q; return next; }
      return [...prev, q];
    });
  }

  async function handleDeleteQuestion(id: number) {
    if (!confirm('Delete this question?')) return;
    const res = await fetch(`/api/survey/admin/questions/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-CSRFToken': getCsrfToken() },
    });
    if (res.status === 204) {
      setQuestions(prev => prev.filter(q => q.id !== id));
      toast.success('Question deleted.', { title: 'Deleted' });
    } else {
      const d = await res.json();
      toast.error(d.detail ?? 'Could not delete question.', { title: 'Error' });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="size-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" /> Back
        </button>
        <span className="text-muted-foreground/30">/</span>
        <h2 className="text-base font-semibold">{template ? `Template: ${template.title}` : 'New Template'}</h2>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
            Title {!form.title.trim() && <span className="text-red-500 normal-case tracking-normal">*</span>}
          </label>
          <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} maxLength={200} placeholder="Template name…" className={cn(errors.title && 'border-destructive')} />
          {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Description</label>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            maxLength={1000}
            rows={2}
            className="w-full rounded-lg border border-border bg-[var(--color-bg-elevated)] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            placeholder="Optional description…"
          />
        </div>
        <div className="flex justify-end border-t border-border pt-2">
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {saving && <span className="size-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />}
            {saving ? 'Saving…' : templateId ? 'Save Changes' : 'Create Template'}
          </button>
        </div>
      </div>

      {template && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Questions <span className="ml-1 font-normal text-muted-foreground">({questions.length})</span></h3>
            <button
              onClick={() => { setEditingQuestion(null); setQuestionEditorOpen(true); }}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="size-3.5" /> Add Question
            </button>
          </div>

          {questions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 rounded-xl border border-dashed border-border text-muted-foreground">
              <ClipboardList className="size-8 opacity-40" />
              <p className="text-sm">No questions yet. Add your first question above.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {questions.map((q, i) => (
                <SortableQuestionCard
                  key={q.id}
                  question={q}
                  index={i}
                  isEditable
                  onEdit={q => { setEditingQuestion(q); setQuestionEditorOpen(true); }}
                  onDelete={handleDeleteQuestion}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <QuestionEditor
        open={questionEditorOpen}
        question={editingQuestion}
        isEditable
        surveyOrTemplateId={template?.id ?? 0}
        mode="template"
        onClose={() => setQuestionEditorOpen(false)}
        onSaved={handleQuestionSaved}
      />
    </div>
  );
}

// ── Templates Tab ──────────────────────────────────────────────────────────────

const TEMPLATE_CARD_COLORS: [string, string][] = [
  ['#4F46E5', '#7C3AED'],
  ['#1E293B', '#0F172A'],
  ['#7C3AED', '#DB2777'],
  ['#D97706', '#EA580C'],
  ['#059669', '#0D9488'],
  ['#E11D48', '#BE123C'],
  ['#0EA5E9', '#0284C7'],
  ['#8B5CF6', '#6D28D9'],
];

const TEMPLATE_CATEGORIES = [
  'All', 'Leadership Alignment', 'Engagement', 'Effectiveness', 'Experience', 'Onboarding',
];

function TemplateCardPreview({ template, colorIdx }: { template: TemplateListItem; colorIdx: number }) {
  const [from, to] = TEMPLATE_CARD_COLORS[colorIdx % TEMPLATE_CARD_COLORS.length];
  const mockLines = Math.min(template.question_count, 3);
  return (
    <div
      className="relative h-44 overflow-hidden flex items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      <div className="w-full max-w-[180px] bg-white/90 rounded-lg p-3 shadow-md mx-auto">
        <div className="text-[8px] font-bold text-gray-800 mb-1 truncate">{template.title}</div>
        <div className="text-[7px] text-gray-500 mb-2 truncate">{template.description || 'No description'}</div>
        {[...Array(mockLines)].map((_, i) => (
          <div key={i} className="mb-1.5">
            <div className="h-[5px] bg-gray-200 rounded w-4/5 mb-1" />
            <div className="flex gap-1">
              <div className="h-[5px] w-2 bg-gray-300 rounded-sm shrink-0" />
              <div className="h-[5px] bg-gray-100 rounded flex-1" />
            </div>
          </div>
        ))}
        {template.question_count > 0 && (
          <div className="mt-1.5 flex justify-center">
            <div className="h-4 px-3 bg-gray-800 rounded text-white text-[6px] flex items-center justify-center">
              Submit
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface TemplateCardProps {
  template: TemplateListItem;
  colorIdx: number;
  duplicatingId: number | null;
  deletingId: number | null;
  userId: number;
  onView: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function TemplateCard({ template, colorIdx, duplicatingId, deletingId, userId, onView, onDuplicate, onDelete }: TemplateCardProps) {
  const estMins = Math.max(1, Math.ceil(template.question_count * 30 / 60));
  const isDeleting = deletingId === template.id;
  const isDuplicating = duplicatingId === template.id;
  const isOwner = template.created_by_id === userId;
  return (
    <motion.div
      className="group relative rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] overflow-hidden cursor-pointer"
      whileHover={{ y: -3, boxShadow: '0 10px 24px -4px rgba(0,0,0,0.12)' }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      onClick={onView}
    >
      <TemplateCardPreview template={template} colorIdx={colorIdx} />
      {/* Action buttons revealed on hover */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
        <button
          onClick={e => { e.stopPropagation(); onView(); }}
          className="h-7 w-7 flex items-center justify-center rounded-md bg-white/90 text-gray-700 hover:bg-white shadow-sm transition-colors"
          title="View / Edit"
        ><Eye size={13} /></button>
        <button
          onClick={e => { e.stopPropagation(); onView(); }}
          className="h-7 w-7 flex items-center justify-center rounded-md bg-white/90 text-gray-700 hover:bg-white shadow-sm transition-colors"
          title="Edit"
        ><Edit2 size={13} /></button>
        <button
          onClick={e => { e.stopPropagation(); onDuplicate(); }}
          disabled={isDuplicating}
          className="h-7 w-7 flex items-center justify-center rounded-md bg-white/90 text-gray-700 hover:bg-white shadow-sm transition-colors disabled:opacity-50"
          title="Duplicate"
        >{isDuplicating ? <Loader2 size={13} className="animate-spin" /> : <Copy size={13} />}</button>
        {isOwner && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            disabled={isDeleting}
            className="h-7 w-7 flex items-center justify-center rounded-md bg-white/90 text-red-500 hover:bg-white shadow-sm transition-colors disabled:opacity-50"
            title="Delete"
          >{isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}</button>
        )}
      </div>
      <div className="p-4">
        <p className="font-semibold text-sm text-[var(--color-text-primary)] truncate leading-snug">{template.title}</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          {template.question_count} Questions • {estMins} min{estMins !== 1 ? 's' : ''}
        </p>
      </div>
    </motion.div>
  );
}

function CreateNewTemplateCard({ onClick }: { onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group rounded-xl border-2 border-dashed border-[var(--color-border)] hover:border-[#2845D6]/50 bg-transparent hover:bg-[var(--color-bg-card)] transition-colors duration-200 cursor-pointer flex flex-col items-center justify-center gap-2 min-h-[220px]"
    >
      <div className="w-10 h-10 rounded-full group-hover:border-[#2845D6] flex items-center justify-center text-[var(--color-text-muted)] group-hover:text-[#2845D6] transition-colors duration-200">
        <Plus size={20} />
      </div>
      <p className="text-xs font-medium text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors duration-200 text-center px-4">
        Create New Template
      </p>
    </div>
  );
}

function TemplatesTab({ user }: { user: UserData }) {
  const [rows, setRows] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [builderTemplateId, setBuilderTemplateId] = useState<number | null | undefined>(undefined);
  const [hasAnyTemplate, setHasAnyTemplate] = useState<boolean | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // New Template modal state
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [newTemplateSaving, setNewTemplateSaving] = useState(false);
  const [tmplTitle, setTmplTitle] = useState('');
  const [tmplDescription, setTmplDescription] = useState('');
  const [tmplErrors, setTmplErrors] = useState<Record<string, string>>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRows = useCallback(async (p: number, q: string, isInitial = false) => {
    const startTime = Date.now();
    if (isInitial) setLoading(true);
    else setTransitioning(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set('search', q);
      const res = await fetch(`/api/survey/admin/templates?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setRows(data.results as TemplateListItem[]);
      setTotalPages(data.pagination.total_pages);
      setTotalCount(data.pagination.total);
      if (!q) setHasAnyTemplate(data.pagination.total > 0);
    } catch {
      toast.error('Could not load templates.', { title: 'Error' });
    } finally {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 1000 - elapsed);
      if (remaining > 0) await new Promise<void>(r => setTimeout(r, remaining));
      setLoading(false);
      setTransitioning(false);
    }
  }, []);

  const triggerFetch = useCallback((p: number, q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setTransitioning(true);
    debounceRef.current = setTimeout(() => fetchRows(p, q), 300);
  }, [fetchRows]);

  useEffect(() => {
    fetchRows(1, '', true);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchRows]);

  function openNewTemplate() {
    setTmplTitle('');
    setTmplDescription('');
    setTmplErrors({});
    setNewTemplateOpen(true);
  }

  async function handleCreateTemplate() {
    const errors: Record<string, string> = {};
    if (!tmplTitle.trim()) errors.title = 'Template title is required.';
    if (!tmplDescription.trim()) errors.description = 'Description is required.';
    if (Object.keys(errors).length) { setTmplErrors(errors); return; }

    const startTime = Date.now();
    setNewTemplateSaving(true);
    setTmplErrors({});
    try {
      const res = await fetch('/api/survey/admin/templates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ title: tmplTitle.trim(), description: tmplDescription.trim() }),
      });
      const raw = await res.json();
      if (!res.ok) {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw as Record<string, unknown>))
          fe[k] = Array.isArray(v) ? (v as string[])[0] : String(v);
        setTmplErrors(fe);
        return;
      }
      const newTmpl = raw as TemplateDetail;
      toast.success('Template created.', { title: 'Created' });
      setHasAnyTemplate(true);
      const elapsed = Date.now() - startTime;
      const minimumMs = 500;
      if (elapsed < minimumMs) await new Promise<void>(r => setTimeout(r, minimumMs - elapsed));
      setNewTemplateOpen(false);
      // Navigate directly to the template builder for the new template
      setBuilderTemplateId(newTmpl.id);
    } finally {
      setNewTemplateSaving(false);
    }
  }

  async function handleDuplicate(row: TemplateListItem) {
    setDuplicatingId(row.id);
    try {
      const res = await fetch(`/api/survey/admin/templates/${row.id}/duplicate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      if (res.ok) {
        toast.success('Template duplicated.', { title: 'Duplicated' });
        fetchRows(page, search);
      } else {
        const d = await res.json();
        toast.error(d.detail ?? 'Failed to duplicate template.', { title: 'Error' });
      }
    } finally {
      setDuplicatingId(null);
    }
  }

  async function handleDelete(row: TemplateListItem) {
    if (!confirm(`Delete template "${row.title}"?`)) return;
    setDeletingId(row.id);
    try {
      const res = await fetch(`/api/survey/admin/templates/${row.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      if (res.status === 204) {
        toast.success('Template deleted.', { title: 'Deleted' });
        fetchRows(page, search);
      } else {
        const d = await res.json();
        toast.error(d.detail ?? 'Could not delete.', { title: 'Error' });
      }
    } finally {
      setDeletingId(null);
    }
  }

  if (builderTemplateId !== undefined) {
    return (
      <TemplateBuilderView
        templateId={builderTemplateId}
        onBack={() => { setBuilderTemplateId(undefined); fetchRows(page, search); }}
        onSaved={() => fetchRows(page, search)}
      />
    );
  }

  const filteredRows = selectedCategory === 'All'
    ? rows
    : rows.filter(r =>
        r.title.toLowerCase().includes(selectedCategory.toLowerCase()) ||
        r.description.toLowerCase().includes(selectedCategory.toLowerCase())
      );

  return (
    <>
      <div className="w-full">
        {/* Heading */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">Explore Survey Templates</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-1.5">
            Create, select, or personalize survey templates to perfectly fit your needs
          </p>
        </div>

        {/* Search */}
        <div className="flex justify-center mb-6">
          <div className="relative w-full max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); triggerFetch(1, e.target.value); }}
              placeholder="Search templates"
              className="w-full h-9 pl-9 pr-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[#2845D6]/40"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--color-text-muted)] border border-[var(--color-border)] px-1.5 rounded">/</kbd>
          </div>
        </div>

        {/* Category pills */}
        <div className="flex justify-center flex-wrap gap-2 mb-8">
          {TEMPLATE_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium transition-colors duration-150',
                selectedCategory === cat
                  ? 'bg-[var(--color-text-primary)] text-[var(--color-bg)] shadow-sm'
                  : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)]',
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading ? (
          <div className="flex justify-center py-20">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#2845D6]" />
          </div>
        ) : hasAnyTemplate === false ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)]">
              <Layout size={24} />
            </div>
            <div className="text-center">
              <p className="font-semibold text-[var(--color-text-primary)]">No templates yet</p>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">Create a template to reuse question sets across surveys.</p>
            </div>
            <button
              onClick={openNewTemplate}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              <Plus size={15} /> New Template
            </button>
          </div>
        ) : (
          /* Card grid — auto-fill responsive: 5 cols desktop → 1 col mobile */
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}
          >
            <CreateNewTemplateCard onClick={openNewTemplate} />
            {filteredRows.map((tmpl, idx) => (
              <TemplateCard
                key={tmpl.id}
                template={tmpl}
                colorIdx={idx}
                duplicatingId={duplicatingId}
                deletingId={deletingId}
                userId={user.id}
                onView={() => setBuilderTemplateId(tmpl.id)}
                onDuplicate={() => handleDuplicate(tmpl)}
                onDelete={() => handleDelete(tmpl)}
              />
            ))}
          </div>
        )}
      </div>

      {/* New Template Modal */}
      <Modal open={newTemplateOpen} onOpenChange={open => !newTemplateSaving && !open && setNewTemplateOpen(false)}>
        <ModalContent className="max-w-2xl">
          <ModalHeader>
            <ModalTitle>New Template</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-4">
              {/* Title */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                Template Title {!tmplTitle.trim() && <span className="text-red-500 normal-case tracking-normal">*</span>}
              </label>
              <Input
                value={tmplTitle}
                onChange={e => setTmplTitle(e.target.value)}
                maxLength={200}
                placeholder="Enter template title…"
                className={cn(tmplErrors.title && 'border-destructive')}
              />
              {tmplErrors.title && <p className="text-xs text-destructive">{tmplErrors.title}</p>}
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <TextareaWithCharactersLeft
                label={<>Description {!tmplDescription.trim() && <span className="text-red-500 normal-case tracking-normal">*</span>}</>}
                maxLength={1000}
                value={tmplDescription}
                onChange={e => setTmplDescription(e.target.value)}
                placeholder="Describe this template…"
                rows={3}
                wrapperClassName={cn(tmplErrors.description && '[&_textarea]:border-destructive')}
              />
              {tmplErrors.description && (
                <p className="text-xs text-destructive">{tmplErrors.description}</p>
              )}
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCreateTemplate}
              disabled={newTemplateSaving}
              className="min-w-[140px] flex items-center justify-center px-5 py-2 rounded-lg bg-[var(--btn-primary-bg,#2845D6)] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {newTemplateSaving ? (
                <TextShimmer duration={1.2} className="text-sm font-semibold text-white [--base-color:#a5b4fc] [--base-gradient-color:#ffffff] dark:[--base-color:#a5b4fc] dark:[--base-gradient-color:#ffffff]">
                  Creating…
                </TextShimmer>
              ) : 'Create Template'}
            </button>
          </div>
        </ModalFooter>
      </ModalContent>
      </Modal>
    </>
  );
}

// ── Results Tab ────────────────────────────────────────────────────────────────

interface SurveyResult {
  survey_id: number;
  survey_title: string;
  is_anonymous: boolean;
  total_targeted: number;
  total_responses: number;
  completion_rate: number;
  questions: {
    question_id: number;
    question_text: string;
    question_type: string;
    show_percentage: boolean;
    total_responses: number;
    options?: { option_id: number; option_text: string; count: number; percentage: number }[];
    average?: number | null;
    distribution?: { value: number; count: number; percentage: number }[];
    text_answers?: string[];
  }[];
}

function ResultsTab() {
  const [surveys, setSurveys] = useState<SurveyListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [results, setResults] = useState<SurveyResult | null>(null);
  const [loadingSurveys, setLoadingSurveys] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch('/api/survey/admin/surveys?page_size=100', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setSurveys((d.results as SurveyListItem[]).filter(s => s.status !== 'draft')))
      .catch(() => toast.error('Could not load surveys.', { title: 'Error' }))
      .finally(() => setLoadingSurveys(false));
  }, []);

  useEffect(() => {
    if (!selectedId) { setResults(null); return; }
    setLoadingResults(true);
    fetch(`/api/survey/admin/surveys/${selectedId}/results`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setResults(d as SurveyResult))
      .catch(() => toast.error('Could not load results.', { title: 'Error' }))
      .finally(() => setLoadingResults(false));
  }, [selectedId]);

  async function handleExport() {
    if (!selectedId) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/survey/admin/surveys/${selectedId}/export`, { credentials: 'include' });
      if (!res.ok) { toast.error('Export failed.', { title: 'Error' }); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `survey_${selectedId}_responses.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Survey selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] max-w-sm">
          {loadingSurveys ? (
            <div className="h-9 animate-pulse rounded-lg bg-muted" />
          ) : (
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a survey…" />
              </SelectTrigger>
              <SelectContent>
                {surveys.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.title} <span className="ml-1 text-muted-foreground text-xs">({s.status})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {selectedId && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Export XLSX
          </button>
        )}
      </div>

      {/* Results */}
      {loadingResults && (
        <div className="flex items-center justify-center py-12">
          <span className="size-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {!loadingResults && results && (
        <div className="flex flex-col gap-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Targeted', value: results.total_targeted, icon: Users },
              { label: 'Responses', value: results.total_responses, icon: CheckSquare },
              { label: 'Completion', value: `${results.completion_rate}%`, icon: BarChart2 },
              { label: 'Questions', value: results.questions.length, icon: ClipboardList },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-border bg-card px-4 py-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Icon className="size-3.5" />
                  <span className="text-xs">{label}</span>
                </div>
                <span className="text-2xl font-bold">{value}</span>
              </div>
            ))}
          </div>

          {results.is_anonymous && (
            <div className="flex items-center gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 dark:bg-blue-950/20 dark:border-blue-800">
              <Lock className="size-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-400">
                This is an anonymous survey. Respondent identities are not available.
              </p>
            </div>
          )}

          {/* Per-question results */}
          <div className="flex flex-col gap-4">
            {results.questions.map((q, i) => (
              <div key={q.question_id} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-mono text-muted-foreground mt-0.5">Q{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{q.question_text}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{typeLabel(q.question_type)}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{q.total_responses} response{q.total_responses !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>

                {/* Options with bar chart */}
                {q.options && q.options.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {q.options.map(opt => (
                      <div key={opt.option_id} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-xs">
                          <span>{opt.option_text}</span>
                          <span className="text-muted-foreground">{opt.count} {q.show_percentage && `(${opt.percentage}%)`}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${opt.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Numeric average */}
                {q.average !== undefined && q.average !== null && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Average:</span>
                    <span className="text-sm font-semibold">{q.average}</span>
                  </div>
                )}

                {/* Distribution */}
                {q.distribution && q.distribution.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {q.distribution.map(d => (
                      <div key={d.value} className="flex flex-col items-center gap-1 min-w-[36px]">
                        <div className="text-xs font-medium">{d.count}</div>
                        <div className="w-8 bg-muted rounded overflow-hidden" style={{ height: '40px' }}>
                          <div
                            className="bg-primary rounded transition-all"
                            style={{ height: `${d.percentage}%`, marginTop: `${100 - d.percentage}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-muted-foreground">{d.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Open text answers */}
                {q.text_answers && q.text_answers.length > 0 && (
                  <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                    {q.text_answers.map((ans, j) => (
                      <p key={j} className="text-xs rounded-md bg-muted/50 border border-border px-2.5 py-1.5">{ans}</p>
                    ))}
                  </div>
                )}

                {q.total_responses === 0 && (
                  <p className="text-xs text-muted-foreground italic">No responses yet.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loadingResults && !results && !selectedId && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <BarChart2 className="size-10 opacity-30" />
          <p className="text-sm">Select a survey above to view its results.</p>
        </div>
      )}
    </div>
  );
}

interface MySurveyItem {
  id: number;
  title: string;
  description: string;
  is_anonymous: boolean;
  start_date: string | null;
  end_date: string | null;
  status: string;
  is_complete: boolean;
  response_id: number | null;
}

interface RespondentQuestion {
  id: number;
  question_text: string;
  question_type: string;
  order: number;
  is_required: boolean;
  allow_other: boolean;
  options: { id: number; option_text: string; order: number }[];
  rating_config: { min_value: number; max_value: number; min_label: string; max_label: string } | null;
  existing_answer: {
    text_value: string | null;
    number_value: string | null;
    other_text: string | null;
    selected_option_ids: number[];
  } | null;
}

interface RespondentSurveyDetail {
  id: number;
  title: string;
  description: string;
  is_anonymous: boolean;
  status: string;
  start_date: string | null;
  end_date: string | null;
  questions: RespondentQuestion[];
  response_id: number | null;
  is_complete: boolean;
}

type SurveyPillStatus = 'closed' | 'scheduled' | 'pending' | 'responded';

function computeSurveyPillStatus(item: MySurveyItem): SurveyPillStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = item.start_date ? new Date(item.start_date + 'T00:00:00') : null;
  const end = item.end_date ? new Date(item.end_date + 'T23:59:59') : null;

  if (item.status === 'closed') return 'closed';
  if (end && today > end) return 'closed';
  if (start && today < start) return 'scheduled';
  if (item.is_complete) return 'responded';
  return 'pending';
}

const PILL_STATUS_MAP: Record<SurveyPillStatus, { status: string; label: string }> = {
  closed: { status: 'closed', label: 'Closed' },
  scheduled: { status: 'scheduled', label: 'Scheduled' },
  pending: { status: 'pending', label: 'Pending' },
  responded: { status: 'approved', label: 'Responded' },
};

const INSTRUCTION_Q_TYPES = new Set(['section', 'subsection', 'statement']);

// ── Survey Answer State ───────────────────────────────────────────────────────

type AnswerValue = {
  text_value?: string;
  number_value?: string;
  other_text?: string;
  selected_option_ids?: number[];
};

// ── Survey List Skeleton ──────────────────────────────────────────────────────

function SurveyListSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 animate-pulse flex flex-col gap-2">
          <div className="h-3 w-3/4 rounded bg-[var(--color-bg-card)]" />
          <div className="h-3 w-16 rounded-full bg-[var(--color-bg-card)]" />
        </div>
      ))}
    </div>
  );
}

// ── Survey Question Form (respondent) ─────────────────────────────────────────

interface QuestionInputProps {
  q: RespondentQuestion;
  answer: AnswerValue;
  onChange: (a: AnswerValue) => void;
  readOnly: boolean;
}

function QuestionInput({ q, answer, onChange, readOnly }: QuestionInputProps) {
  const BLOCKED_CHARS_RE = /[<>{}\[\]\\|^~`"='^*]/;

  function sanitize(v: string): string {
    return v.replace(/[<>{}\[\]\\|^~`"='^*]/g, '');
  }

  if (INSTRUCTION_Q_TYPES.has(q.question_type)) {
    const typeLabels: Record<string, string> = {
      section: 'Section', subsection: 'Subsection', statement: 'Statement',
    };
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle,var(--color-bg-card))] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#2845D6] mb-1">{typeLabels[q.question_type] ?? q.question_type}</p>
        <p className="text-sm font-medium text-[var(--color-text-primary)] leading-snug">{q.question_text}</p>
      </div>
    );
  }

  const sel = answer.selected_option_ids ?? [];

  if (q.question_type === 'single_choice' || q.question_type === 'dropdown') {
    return (
      <div className="flex flex-col gap-2">
        {q.options.map(opt => (
          <label key={opt.id} className={cn('flex items-center gap-2.5 rounded-lg border border-[var(--color-border)] px-3 py-2 cursor-pointer transition-colors', sel.includes(opt.id) ? 'border-[#2845D6] bg-[#2845D6]/5' : 'hover:bg-[var(--color-bg-elevated)]', readOnly && 'cursor-default')}>
            <input
              type="radio"
              className="accent-[#2845D6] shrink-0"
              checked={sel.includes(opt.id)}
              readOnly={readOnly}
              disabled={readOnly}
              onChange={() => !readOnly && onChange({ ...answer, selected_option_ids: [opt.id] })}
            />
            <span className="text-sm text-[var(--color-text-primary)]">{opt.option_text}</span>
          </label>
        ))}
        {q.allow_other && (
          <label className={cn('flex items-center gap-2.5 rounded-lg border border-[var(--color-border)] px-3 py-2 cursor-pointer transition-colors', sel.includes(-1) ? 'border-[#2845D6] bg-[#2845D6]/5' : 'hover:bg-[var(--color-bg-elevated)]', readOnly && 'cursor-default')}>
            <input type="radio" className="accent-[#2845D6] shrink-0" checked={sel.includes(-1)} disabled={readOnly} onChange={() => !readOnly && onChange({ ...answer, selected_option_ids: [-1] })} />
            <span className="text-sm text-[var(--color-text-primary)]">Other:</span>
            {sel.includes(-1) && !readOnly && (
              <input
                type="text"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-text-muted)]"
                value={answer.other_text ?? ''}
                placeholder="Please specify…"
                onChange={e => onChange({ ...answer, other_text: sanitize(e.target.value) })}
                maxLength={500}
              />
            )}
            {sel.includes(-1) && readOnly && <span className="text-sm text-[var(--color-text-muted)]">{answer.other_text || '—'}</span>}
          </label>
        )}
      </div>
    );
  }

  if (q.question_type === 'multiple_choice') {
    return (
      <div className="flex flex-col gap-2">
        {q.options.map(opt => (
          <label key={opt.id} className={cn('flex items-center gap-2.5 rounded-lg border border-[var(--color-border)] px-3 py-2 cursor-pointer transition-colors', sel.includes(opt.id) ? 'border-[#2845D6] bg-[#2845D6]/5' : 'hover:bg-[var(--color-bg-elevated)]', readOnly && 'cursor-default')}>
            <input
              type="checkbox"
              className="accent-[#2845D6] shrink-0"
              checked={sel.includes(opt.id)}
              disabled={readOnly}
              onChange={() => {
                if (readOnly) return;
                const next = sel.includes(opt.id) ? sel.filter(x => x !== opt.id) : [...sel, opt.id];
                onChange({ ...answer, selected_option_ids: next });
              }}
            />
            <span className="text-sm text-[var(--color-text-primary)]">{opt.option_text}</span>
          </label>
        ))}
        {q.allow_other && (
          <label className={cn('flex items-center gap-2.5 rounded-lg border border-[var(--color-border)] px-3 py-2 cursor-pointer transition-colors', sel.includes(-1) ? 'border-[#2845D6] bg-[#2845D6]/5' : 'hover:bg-[var(--color-bg-elevated)]', readOnly && 'cursor-default')}>
            <input type="checkbox" className="accent-[#2845D6] shrink-0" checked={sel.includes(-1)} disabled={readOnly} onChange={() => { if (!readOnly) { const n = sel.includes(-1) ? sel.filter(x => x !== -1) : [...sel, -1]; onChange({ ...answer, selected_option_ids: n }); } }} />
            <span className="text-sm text-[var(--color-text-primary)]">Other:</span>
            {sel.includes(-1) && !readOnly && (
              <input type="text" className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-text-muted)]" value={answer.other_text ?? ''} placeholder="Please specify…" onChange={e => onChange({ ...answer, other_text: sanitize(e.target.value) })} maxLength={500} />
            )}
            {sel.includes(-1) && readOnly && <span className="text-sm text-[var(--color-text-muted)]">{answer.other_text || '—'}</span>}
          </label>
        )}
      </div>
    );
  }

  if (q.question_type === 'yes_no') {
    return (
      <div className="flex gap-3">
        {['Yes', 'No'].map(opt => (
          <label key={opt} className={cn('flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-4 py-2 cursor-pointer transition-colors', answer.text_value === opt ? 'border-[#2845D6] bg-[#2845D6]/5' : 'hover:bg-[var(--color-bg-elevated)]', readOnly && 'cursor-default')}>
            <input type="radio" className="accent-[#2845D6] shrink-0" checked={answer.text_value === opt} disabled={readOnly} onChange={() => !readOnly && onChange({ ...answer, text_value: opt })} />
            <span className="text-sm text-[var(--color-text-primary)]">{opt}</span>
          </label>
        ))}
      </div>
    );
  }

  if (q.question_type === 'rating') {
    const cfg = q.rating_config ?? { min_value: 1, max_value: 5, min_label: '', max_label: '' };
    const range = Array.from({ length: cfg.max_value - cfg.min_value + 1 }, (_, i) => i + cfg.min_value);
    const selected = answer.number_value ? parseInt(answer.number_value) : null;
    return (
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 flex-wrap">
          {range.map(v => (
            <button key={v} type="button" disabled={readOnly} onClick={() => !readOnly && onChange({ ...answer, number_value: String(v) })}
              className={cn('w-10 h-10 rounded-lg border text-sm font-semibold transition-colors', selected === v ? 'border-[#2845D6] bg-[#2845D6] text-white' : 'border-[var(--color-border)] hover:border-[#2845D6] text-[var(--color-text-primary)]', readOnly && 'cursor-default')}>
              {v}
            </button>
          ))}
        </div>
        {(cfg.min_label || cfg.max_label) && (
          <div className="flex justify-between text-[10px] text-[var(--color-text-muted)] mt-1">
            <span>{cfg.min_label}</span>
            <span>{cfg.max_label}</span>
          </div>
        )}
      </div>
    );
  }

  if (q.question_type === 'likert') {
    const likertOpts = ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'];
    return (
      <div className="flex gap-2 flex-wrap">
        {likertOpts.map(opt => (
          <button key={opt} type="button" disabled={readOnly} onClick={() => !readOnly && onChange({ ...answer, text_value: opt })}
            className={cn('px-3 py-2 rounded-lg border text-xs font-medium transition-colors', answer.text_value === opt ? 'border-[#2845D6] bg-[#2845D6] text-white' : 'border-[var(--color-border)] hover:border-[#2845D6] text-[var(--color-text-primary)]', readOnly && 'cursor-default')}>
            {opt}
          </button>
        ))}
      </div>
    );
  }

  if (q.question_type === 'linear_scale') {
    const range = Array.from({ length: 10 }, (_, i) => i + 1);
    const selected = answer.number_value ? parseInt(answer.number_value) : null;
    return (
      <div className="flex gap-2 flex-wrap">
        {range.map(v => (
          <button key={v} type="button" disabled={readOnly} onClick={() => !readOnly && onChange({ ...answer, number_value: String(v) })}
            className={cn('w-9 h-9 rounded-lg border text-sm font-semibold transition-colors', selected === v ? 'border-[#2845D6] bg-[#2845D6] text-white' : 'border-[var(--color-border)] hover:border-[#2845D6] text-[var(--color-text-primary)]', readOnly && 'cursor-default')}>
            {v}
          </button>
        ))}
      </div>
    );
  }

  if (q.question_type === 'number') {
    return (
      <input
        type="number"
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#2845D6] disabled:opacity-60"
        value={answer.number_value ?? ''}
        disabled={readOnly}
        onChange={e => !readOnly && onChange({ ...answer, number_value: e.target.value })}
      />
    );
  }

  if (q.question_type === 'date') {
    return (
      <input
        type="date"
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#2845D6] disabled:opacity-60"
        value={answer.text_value ?? ''}
        disabled={readOnly}
        onChange={e => !readOnly && onChange({ ...answer, text_value: e.target.value })}
      />
    );
  }

  if (q.question_type === 'long_text') {
    return (
      <textarea
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#2845D6] disabled:opacity-60"
        rows={4}
        maxLength={5000}
        value={answer.text_value ?? ''}
        disabled={readOnly}
        onChange={e => !readOnly && onChange({ ...answer, text_value: sanitize(e.target.value) })}
        placeholder={readOnly ? '' : 'Your answer…'}
      />
    );
  }

  // short_text and fallback
  return (
    <input
      type="text"
      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#2845D6] disabled:opacity-60"
      maxLength={1000}
      value={answer.text_value ?? ''}
      disabled={readOnly}
      onChange={e => !readOnly && onChange({ ...answer, text_value: sanitize(e.target.value) })}
      placeholder={readOnly ? '' : 'Your answer…'}
    />
  );
}

// ── Survey Right Panel ────────────────────────────────────────────────────────

interface SurveyRightPanelProps {
  surveyId: number;
  pillStatus: SurveyPillStatus;
  onSubmitted: () => void;
}

function SurveyRightPanel({ surveyId, pillStatus, onSubmitted }: SurveyRightPanelProps) {
  const [detail, setDetail] = useState<RespondentSurveyDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [savingQId, setSavingQId] = useState<number | null>(null);
  const responseIdRef = useRef<number | null>(null);

  const readOnly = pillStatus === 'closed' || pillStatus === 'scheduled' || pillStatus === 'responded';

  useEffect(() => {
    setLoadingDetail(true);
    setDetail(null);
    setAnswers({});
    responseIdRef.current = null;

    fetch(`/api/survey/surveys/${surveyId}`, { credentials: 'include' })
      .then(r => r.json())
      .then((data: RespondentSurveyDetail) => {
        setDetail(data);
        responseIdRef.current = data.response_id;
        // Populate existing answers
        const initial: Record<number, AnswerValue> = {};
        for (const q of data.questions) {
          if (q.existing_answer) {
            initial[q.id] = {
              text_value: q.existing_answer.text_value ?? undefined,
              number_value: q.existing_answer.number_value ?? undefined,
              other_text: q.existing_answer.other_text ?? undefined,
              selected_option_ids: q.existing_answer.selected_option_ids,
            };
          } else {
            initial[q.id] = {};
          }
        }
        setAnswers(initial);
      })
      .catch(() => {})
      .finally(() => setLoadingDetail(false));
  }, [surveyId]);

  // Auto-save a single question answer (debounced on answer change for active surveys)
  const autoSave = useCallback(async (questionId: number, ans: AnswerValue) => {
    if (readOnly || !responseIdRef.current) return;
    setSavingQId(questionId);
    try {
      const body: Record<string, unknown> = {};
      if (ans.text_value !== undefined) body.text_value = ans.text_value;
      if (ans.number_value !== undefined) body.number_value = ans.number_value || null;
      if (ans.other_text !== undefined) body.other_text = ans.other_text;
      if (ans.selected_option_ids !== undefined) {
        // filter out -1 (other sentinel)
        body.selected_option_ids = ans.selected_option_ids.filter(x => x !== -1);
      }
      await fetch(`/api/survey/responses/${responseIdRef.current}/answers/${questionId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify(body),
      });
    } finally {
      setSavingQId(null);
    }
  }, [readOnly]);

  async function ensureResponse(): Promise<number | null> {
    if (responseIdRef.current) return responseIdRef.current;
    const res = await fetch('/api/survey/responses', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
      body: JSON.stringify({ survey_id: surveyId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    responseIdRef.current = data.id;
    return data.id;
  }

  async function handleAnswerChange(questionId: number, ans: AnswerValue) {
    setAnswers(prev => ({ ...prev, [questionId]: ans }));
    const rid = await ensureResponse();
    if (!rid) return;
    autoSave(questionId, ans);
  }

  async function handleSubmit() {
    if (!detail || readOnly) return;
    setSubmitting(true);
    try {
      const rid = await ensureResponse();
      if (!rid) { toast.error('Failed to initialize response.', { title: 'Error' }); return; }
      const res = await fetch(`/api/survey/responses/${rid}/submit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
      });
      if (res.ok) {
        toast.success('Survey submitted successfully.', { title: 'Submitted' });
        onSubmitted();
      } else {
        const body = await res.json();
        toast.error(body.detail ?? 'Submission failed.', { title: 'Error' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingDetail) {
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

  if (!detail) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-[var(--color-text-muted)]">Failed to load survey. Please try again.</p>
      </div>
    );
  }

  let banner: React.ReactNode = null;
  if (pillStatus === 'closed') {
    banner = (
      <div className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20 px-4 py-3 flex items-center gap-3">
        <Lock size={15} className="text-red-500 shrink-0" />
        <p className="text-sm text-red-700 dark:text-red-400 font-medium">This survey has ended and is no longer accepting responses.</p>
      </div>
    );
  } else if (pillStatus === 'scheduled') {
    banner = (
      <div className="mx-4 mt-4 rounded-xl border border-yellow-200 bg-yellow-50 dark:border-yellow-900/40 dark:bg-yellow-950/20 px-4 py-3 flex items-center gap-3">
        <ClipboardList size={15} className="text-yellow-600 shrink-0" />
        <p className="text-sm text-yellow-700 dark:text-yellow-400 font-medium">This survey has not started yet. Check back when it opens.</p>
      </div>
    );
  } else if (pillStatus === 'responded') {
    banner = (
      <div className="mx-4 mt-4 rounded-xl border border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/20 px-4 py-3 flex items-center gap-3">
        <Check size={15} className="text-green-600 shrink-0" />
        <p className="text-sm text-green-700 dark:text-green-400 font-medium">You have already submitted a response to this survey. Shown below is a read-only view of your answers.</p>
      </div>
    );
  }

  let questionCounter = 0;
  const questionTypes = new Set(['single_choice', 'multiple_choice', 'dropdown', 'rating', 'likert', 'short_text', 'long_text', 'yes_no', 'number', 'date', 'linear_scale']);

  return (
    <div className="flex flex-col h-full">
      {banner}

      {/* Survey title + description */}
      <div className="px-5 pt-4 pb-3 border-b border-[var(--color-border)] shrink-0">
        <h2 className="text-base font-bold text-[var(--color-text-primary)]">{detail.title}</h2>
        {detail.description && (
          <p className="text-xs text-[var(--color-text-muted)] mt-1">{detail.description}</p>
        )}
      </div>

      {/* Questions */}
      <div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden p-4 space-y-4">
        {detail.questions.map(q => {
          const isInstruction = INSTRUCTION_Q_TYPES.has(q.question_type);
          if (!isInstruction && questionTypes.has(q.question_type)) questionCounter += 1;

          if (isInstruction) {
            return <QuestionInput key={q.id} q={q} answer={{}} onChange={() => {}} readOnly={true} />;
          }

          return (
            <div key={q.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 space-y-3">
              <div className="flex items-start gap-2">
                <span className="text-xs font-mono text-[var(--color-text-muted)] shrink-0 mt-0.5">Q{questionCounter}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)] leading-snug">
                    {q.question_text}
                    {q.is_required && <span className="text-red-500 ml-0.5">*</span>}
                  </p>
                  {savingQId === q.id && (
                    <span className="text-[10px] text-[var(--color-text-muted)] flex items-center gap-1 mt-0.5">
                      <Loader2 size={10} className="animate-spin" /> Saving…
                    </span>
                  )}
                </div>
              </div>
              <QuestionInput
                q={q}
                answer={answers[q.id] ?? {}}
                onChange={ans => handleAnswerChange(q.id, ans)}
                readOnly={readOnly}
              />
            </div>
          );
        })}
      </div>

      {/* Submit button (only when pending) */}
      {pillStatus === 'pending' && (
        <div className="shrink-0 px-4 pb-4 pt-3 border-t border-[var(--color-border)]">
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className={cn(
              'w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all',
              submitting ? 'bg-[#2845D6]/70 cursor-not-allowed' : 'bg-[#2845D6] hover:bg-[#1f37b9]',
            )}
          >
            {submitting ? (
              <TextShimmer duration={1.2} className="text-sm font-semibold [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">
                Submitting…
              </TextShimmer>
            ) : (
              <><Send size={14} /> Submit Survey</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ── SurveyUserPage ────────────────────────────────────────────────────────────

function SurveyUserPage() {
  const [surveys, setSurveys] = useState<MySurveyItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchSurveys = useCallback(() => {
    setLoadingList(true);
    fetch('/api/survey/my-surveys', { credentials: 'include' })
      .then(r => r.json())
      .then((data: MySurveyItem[]) => setSurveys(data))
      .catch(() => {})
      .finally(() => setLoadingList(false));
  }, []);

  useEffect(() => { fetchSurveys(); }, [fetchSurveys]);

  const selectedSurvey = surveys.find(s => s.id === selectedId) ?? null;
  const pillStatus = selectedSurvey ? computeSurveyPillStatus(selectedSurvey) : null;

  function handleSubmitted() {
    // Refresh list to update is_complete state, then trigger right panel reload
    fetchSurveys();
    setRefreshKey(k => k + 1);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="shrink-0 px-4 sm:px-6 pt-5 pb-4 border-b border-[var(--color-border)]">
        <h1 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2">
          <ClipboardList size={18} className="text-[#2845D6]" />
          My Surveys
        </h1>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">View and respond to surveys assigned to you.</p>
      </div>

      {/* Two-column body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column — 30% */}
        <div className="w-[30%] shrink-0 border-r border-[var(--color-border)] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {loadingList ? (
            <SurveyListSkeleton />
          ) : surveys.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
              <ClipboardList size={28} className="text-[var(--color-text-muted)] mb-2" />
              <p className="text-xs text-[var(--color-text-muted)]">No surveys assigned to you yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 p-3">
              {surveys.map(s => {
                const ps = computeSurveyPillStatus(s);
                const pill = PILL_STATUS_MAP[ps];
                const isSelected = s.id === selectedId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      'w-full text-left rounded-xl border px-3 py-2.5 transition-colors flex flex-col gap-1.5',
                      isSelected
                        ? 'border-[#2845D6] bg-[#2845D6]/8 border-l-4 border-l-[#2845D6]'
                        : 'border-[var(--color-border)] hover:bg-[var(--color-bg-elevated)]',
                    )}
                  >
                    <p className={cn('text-xs font-semibold leading-snug', isSelected ? 'text-[#2845D6]' : 'text-[var(--color-text-primary)]')}>
                      {s.title}
                    </p>
                    <StatusPill status={pill.status} label={pill.label} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column — 70% */}
        <div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {!selectedId ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                title="Select a survey to begin"
                description="Choose a survey from the list on the left to view its questions and submit your response."
                icons={[ClipboardList, FileText, BarChart2]}
              />
            </div>
          ) : pillStatus !== null ? (
            <SurveyRightPanel
              key={`${selectedId}-${refreshKey}`}
              surveyId={selectedId}
              pillStatus={pillStatus}
              onSubmitted={handleSubmitted}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SurveyAdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');
  const [user, setUser] = useState<UserData | null>(null);
  const [activeTab, setActiveTab] = useState<'surveys' | 'templates' | 'results'>('surveys');

  const requestedView = searchParams?.get('view');
  const hasAdminAccess = user?.admin || user?.hr || user?.iad;
  const shouldShowUserPage = requestedView === 'my' || !hasAdminAccess;

  useEffect(() => {
    const timer = setTimeout(() => setAuthPhase('checking'), 350);
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => { if (!r.ok) { router.push('/'); return null; } return r.json(); })
      .then((u: UserData | null) => {
        clearTimeout(timer);
        if (!u) {
          router.push('/dashboard');
        } else {
          setUser(u);
          setAuthPhase('done');
        }
      })
      .catch(() => { clearTimeout(timer); router.push('/'); });
    return () => clearTimeout(timer);
  }, [router]);

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

  if (!user) return null;

  if (shouldShowUserPage) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <SurveyUserPage />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 w-full">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            Survey Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create and manage surveys, templates, and view results
          </p>
        </div>
      </div>

      <VercelTabs
        tabs={[
          { id: 'surveys', label: 'Surveys' },
          { id: 'templates', label: 'Templates' },
          { id: 'results', label: 'Results' },
        ]}
        activeTab={activeTab}
        onTabChange={tabId => setActiveTab(tabId as 'surveys' | 'templates' | 'results')}
      />

      {activeTab === 'surveys' && (
        <div className="pt-2">
          <SurveysTab user={user} />
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="pt-2">
          <TemplatesTab user={user} />
        </div>
      )}

      {activeTab === 'results' && (
        <div className="pt-2">
          <ResultsTab />
        </div>
      )}
    </div>
  );
}

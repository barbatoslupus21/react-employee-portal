'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AnimatePresence,
  LayoutGroup,
  motion,
} from 'framer-motion';
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronUp,
  CircleDot,
  ClipboardList,
  GripVertical,
  Hash,
  List,
  Loader2,
  MessageSquare,
  Minus,
  MoreHorizontal,
  MoveVertical,
  Plus,
  Save,
  Settings2,
  SquareCheck,
  Star,
  ThumbsUp,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TextareaWithCharactersLeft } from '@/components/ui/textarea-with-characters-left';
import BasicCheckbox from '@/components/ui/checkbox-1';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { toast } from '@/components/ui/toast';
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

interface TemplateDetail {
  id: number;
  title: string;
  description: string;
  template_type?: string;
  questions: SurveyQuestion[];
}

// ── Field Types ───────────────────────────────────────────────────────────────

interface FieldTypeDef {
  type: string;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const FIELD_TYPES: FieldTypeDef[] = [
  { type: 'single_choice', label: 'Single Choice', icon: <CircleDot size={16} />, description: 'One option from many' },
  { type: 'multiple_choice', label: 'Multiple Choice', icon: <SquareCheck size={16} />, description: 'Multiple options allowed' },
  { type: 'dropdown', label: 'Dropdown', icon: <ChevronDown size={16} />, description: 'Compact select field' },
  { type: 'rating', label: 'Rating Scale', icon: <Star size={16} />, description: 'Numeric rating' },
  { type: 'likert', label: 'Likert Scale', icon: <MoveVertical size={16} />, description: 'Agreement levels' },
  { type: 'short_text', label: 'Short Text', icon: <Type size={16} />, description: 'Single-line answer' },
  { type: 'long_text', label: 'Long Text', icon: <MessageSquare size={16} />, description: 'Multi-line answer' },
  { type: 'yes_no', label: 'Yes / No', icon: <ThumbsUp size={16} />, description: 'Binary choice' },
  { type: 'number', label: 'Number', icon: <Hash size={16} />, description: 'Numeric input' },
  { type: 'date', label: 'Date', icon: <Calendar size={16} />, description: 'Date picker' },
  { type: 'linear_scale', label: 'Linear Scale', icon: <Minus size={16} />, description: 'Range from 1–10' },
  { type: 'section', label: 'Section', icon: <List size={16} />, description: 'Group questions' },
  { type: 'subsection', label: 'Subsection', icon: <MoreHorizontal size={16} />, description: 'Sub-grouping' },
  { type: 'statement', label: 'Statement', icon: <ClipboardList size={16} />, description: 'Display-only text' },
];

const CHOICE_BASED_TYPES = new Set(['single_choice', 'multiple_choice', 'dropdown']);
const QUESTION_TYPE_OPTIONS = FIELD_TYPES.map(f => ({ value: f.type, label: f.label }));

function typeLabel(t: string): string {
  return QUESTION_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t;
}

// ── Spring configs ────────────────────────────────────────────────────────────

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 35 };
const SPRING_GENTLE = { type: 'spring' as const, stiffness: 280, damping: 28 };

// Drag prefix for field-type items from the panel
const FIELD_DRAG_PREFIX = 'field-type::';

// Transient id prefix for unsaved (pending) questions
const PENDING_ID_PREFIX = 'pending-';
let pendingCounter = 0;
function newPendingId() { return `${PENDING_ID_PREFIX}${++pendingCounter}`; }
function isPendingId(id: string | number) { return String(id).startsWith(PENDING_ID_PREFIX); }

// Stable IDs for option rows (for AnimatePresence keying)
let optionIdCounter = 0;
function newOptId() { return `oi-${++optionIdCounter}`; }

// ── Ghost Card (DragOverlay content when dragging from panel) ─────────────────

function GhostFieldCard({ field }: { field: FieldTypeDef }) {
  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0.8 }}
      animate={{ scale: 1.06, opacity: 0.92 }}
      transition={SPRING}
      className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-[#2845D6]/60 bg-[var(--color-bg-card)] shadow-[0_8px_32px_rgba(40,69,214,0.22)] text-[#2845D6] text-center w-32 cursor-grabbing"
    >
      <span>{field.icon}</span>
      <span className="text-[11px] font-semibold leading-tight">{field.label}</span>
    </motion.div>
  );
}

// ── Dashed Drop Zone indicator ────────────────────────────────────────────────

function DropZoneIndicator({ fieldType, isEmpty }: { fieldType: string; isEmpty?: boolean }) {
  const field = FIELD_TYPES.find(f => f.type === fieldType);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scaleY: 0.4 }}
      animate={{ opacity: 1, scaleY: 1 }}
      exit={{ opacity: 0, scaleY: 0.4 }}
      transition={SPRING_GENTLE}
      style={{ originY: 0 }}
      className={cn(
        'rounded-xl border-2 border-dashed border-[#2845D6]/50 bg-[#2845D6]/5 flex flex-col items-center justify-center gap-2 py-6',
        isEmpty && 'min-h-[160px]',
      )}
    >
      <span className="text-[#2845D6]/60">{field?.icon ?? <Type size={18} />}</span>
      <span className="text-xs font-semibold text-[#2845D6]/70">{field?.label ?? 'Drop here'}</span>
    </motion.div>
  );
}

// ── Read Mode Answer Preview ────────────────────────────────────────────────────

const LIKERT_SCALE_LABELS = ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'];

const LIKERT_EMOJI_OPTIONS = [
  { emoji: '😔', label: 'Terrible', color: 'from-red-400 to-red-500', shadow: 'shadow-red-500/30' },
  { emoji: '😕', label: 'Poor', color: 'from-orange-400 to-orange-500', shadow: 'shadow-orange-500/30' },
  { emoji: '😐', label: 'Okay', color: 'from-yellow-400 to-yellow-500', shadow: 'shadow-yellow-500/30' },
  { emoji: '🙂', label: 'Good', color: 'from-lime-400 to-lime-500', shadow: 'shadow-lime-500/30' },
  { emoji: '😍', label: 'Amazing', color: 'from-emerald-400 to-emerald-500', shadow: 'shadow-emerald-500/30' },
];

function ReadModePreview({ card }: { card: QuestionCardItem }) {
  const { question_type: qt, options, rating_config: rc } = card;

  if (qt === 'single_choice') {
    return (
      <div className="flex flex-col gap-1.5 pointer-events-none select-none pl-4">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2 opacity-80">
            <span className="size-4 rounded-full border-2 border-[var(--color-border)] shrink-0" />
            <span className="text-xs text-[var(--color-text-primary)]">{opt.option_text}</span>
          </div>
        ))}
      </div>
    );
  }

  if (qt === 'multiple_choice') {
    return (
      <div className="flex flex-col gap-1.5 pointer-events-none select-none pl-4">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2 opacity-80">
            <span className="size-4 rounded border border-[var(--color-border)] shrink-0" />
            <span className="text-xs text-[var(--color-text-primary)]">{opt.option_text}</span>
          </div>
        ))}
      </div>
    );
  }

  if (qt === 'yes_no') {
    return (
      <div className="flex flex-col gap-1.5 pointer-events-none select-none pl-4">
        {['Yes', 'No'].map((label, i) => (
          <div key={i} className="flex items-center gap-2 opacity-80">
            <span className="size-4 rounded-full border-2 border-[var(--color-border)] shrink-0" />
            <span className="text-xs text-[var(--color-text-primary)]">{label}</span>
          </div>
        ))}
      </div>
    );
  }

  if (qt === 'dropdown') {
    return (
      <div className="flex h-9 ml-4 w-full max-w-xs items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm text-[var(--color-text-muted)] opacity-50 cursor-not-allowed select-none">
        <span>Select an option…</span>
        <ChevronDown className="h-4 w-4 shrink-0" />
      </div>
    );
  }

  if (qt === 'short_text') {
    return (
      <div className="pl-4">
        <Input disabled placeholder="Short answer…" wrapperClassName="max-w-sm" />
      </div>
    );
  }

  if (qt === 'number') {
    return (
      <div className="pl-4">
        <Input type="number" disabled placeholder="0" wrapperClassName="max-w-[120px]" />
      </div>
    );
  }

  if (qt === 'long_text') {
    return (
      <div className="pl-4">
        <TextareaWithCharactersLeft
          disabled
          value=""
          placeholder="Long answer…"
          maxLength={500}
          rows={2}
          wrapperClassName="max-w-full [&>div:last-child>span]:text-[var(--color-text-muted)] [&>div:last-child>span]:opacity-70"
        />
      </div>
    );
  }

  if (qt === 'section') {
    return (
      <div className="pl-4">
        <p className="text-xs font-medium leading-snug text-[var(--color-text-primary)]">
          {card.question_text || <span className="italic text-[var(--color-text-muted)]">No content</span>}
        </p>
      </div>
    );
  }

  if (qt === 'subsection') {
    return (
      <div className="pl-4">
        <p className="text-xs font-medium leading-snug text-[var(--color-text-primary)]">
          {card.question_text || <span className="italic text-[var(--color-text-muted)]">No content</span>}
        </p>
      </div>
    );
  }

  if (qt === 'statement') {
    return (
      <div className="pl-4">
        <p className="text-xs font-medium leading-snug text-[var(--color-text-primary)]">
          {card.question_text || <span className="italic text-[var(--color-text-muted)]">No content</span>}
        </p>
      </div>
    );
  }

  if (qt === 'date') {
    return (
      <div className="pl-4">
        <Input type="date" disabled wrapperClassName="max-w-[180px]" />
      </div>
    );
  }

  if (qt === 'rating') {
    const max = Math.min(Math.max(rc?.max_value ?? 5, 1), 10);
    return (
      <div className="pl-4">
        <div className="flex gap-1 pointer-events-none select-none">
          {Array.from({ length: max }, (_, i) => (
            <Star key={i} className="size-5 text-[var(--color-text-muted)]/30" />
          ))}
        </div>
      </div>
    );
  }

  if (qt === 'linear_scale') {
    const min = rc?.min_value ?? 1;
    const max = rc?.max_value ?? 10;
    const count = Math.min(max - min + 1, 10);
    return (
      <div className="pl-4">
        <div className="flex flex-col gap-1 pointer-events-none select-none">
          <div className="flex gap-1 flex-wrap">
            {Array.from({ length: count }, (_, i) => (
              <span
                key={i}
                className="size-7 rounded-md border border-[var(--color-border)] bg-transparent flex items-center justify-center text-xs text-[var(--color-text-muted)] opacity-60"
              >
                {min + i}
              </span>
            ))}
          </div>
          {(rc?.min_label || rc?.max_label) && (
            <div className="flex justify-between text-[10px] text-[var(--color-text-muted)] opacity-60">
              <span>{rc?.min_label}</span>
              <span>{rc?.max_label}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (qt === 'likert') {
    return (
      <div className="pl-4">
        <div className="flex items-center justify-evenly gap-2 pointer-events-none select-none">
          {LIKERT_EMOJI_OPTIONS.map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-transparent p-0 transition-all duration-300 ease-out">
                <span className="text-lg text-[var(--color-text-muted)] opacity-60">{item.emoji}</span>
              </div>
              <span className="text-[9px] text-[var(--color-text-muted)] text-center leading-tight">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

// ── Unified Question Card (read + edit mode) ──────────────────────────────────

interface QuestionCardItem {
  /** Real DB id (number) or transient pending id (string) */
  uid: number | string;
  question_text: string;
  question_type: string;
  is_required: boolean;
  show_percentage_summary: boolean;
  allow_other: boolean;
  options: SurveyQuestionOption[];
  rating_config: RatingConfig | null;
  order: number;
  /** True when the card was just added — triggers entrance animation */
  isNew?: boolean;
  /** Non-blocking save error string shown in read mode */
  saveError?: string;
}

interface QuestionCardProps {
  card: QuestionCardItem;
  index: number;
  questionNumber?: number | null;
  isActive: boolean;
  templateId: number;
  onActivate: (uid: number | string) => void;
  onDeactivate: (uid: number | string, updatedCard: QuestionCardItem) => void;
  onDelete: (uid: number | string) => void;
  onSaved: (uid: number | string, saved: SurveyQuestion) => void;
  onSaveError: (uid: number | string, err: string) => void;
  /** Called when the card becomes active, passing a save-and-deactivate fn the parent can call.
   *  Returns true if the card was successfully saved and can transition to read mode. */
  onRegisterValidate: (fn: (() => Promise<boolean>) | null) => void;
  /** When true, the card just landed from a drag — skip layout animation so it snaps instantly. */
  isJustDropped?: boolean;
  /** dnd-kit sortable props — omitted for pending (unsaved) cards */
  sortableProps?: {
    setNodeRef: (el: HTMLElement | null) => void;
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown> | undefined;
    style: React.CSSProperties;
    isDragging: boolean;
  };
}

function QuestionCard({
  card,
  index,
  isActive,
  templateId,
  onActivate,
  onDeactivate,
  onDelete,
  onSaved,
  onSaveError,
  onRegisterValidate,
  sortableProps,
  questionNumber = null,
  isJustDropped = false,
}: QuestionCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const optionRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [form, setForm] = useState({
    question_text: card.question_text,
    question_type: card.question_type,
    is_required: card.is_required,
    show_percentage_summary: card.show_percentage_summary,
    allow_other: card.allow_other,
  });
  // Always-fresh ref — updated synchronously in every setter so save() never reads stale state
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }); // no deps — syncs after every render
  const [options, setOptions] = useState<{ id: string; text: string }[]>(
    card.options.length
      ? card.options.map(o => ({ id: `opt-${o.id}`, text: o.option_text }))
      : [{ id: newOptId(), text: '' }, { id: newOptId(), text: '' }],
  );
  const [ratingMin, setRatingMin] = useState(card.rating_config?.min_value ?? 1);
  const [ratingMax, setRatingMax] = useState(card.rating_config?.max_value ?? 5);
  const [ratingMinLabel, setRatingMinLabel] = useState(card.rating_config?.min_label ?? '');
  const [ratingMaxLabel, setRatingMaxLabel] = useState(card.rating_config?.max_label ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const needsOptions = CHOICE_BASED_TYPES.has(form.question_type);
  const needsRating = form.question_type === 'rating' || form.question_type === 'linear_scale';
  const fieldDef = FIELD_TYPES.find(f => f.type === form.question_type);
  const isInstructionType = ['section', 'subsection', 'statement'].includes(form.question_type);
  const questionTextLabel = form.question_type === 'section'
    ? 'Section text'
    : form.question_type === 'subsection'
      ? 'Subsection text'
      : form.question_type === 'statement'
        ? 'Statement text'
        : 'Question Text';
  const showRequiredAsterisk = !isInstructionType;

  const wasActive = useRef(isActive);

  // Sync form when card data changes from outside (e.g. server response)
  useEffect(() => {
    if (!isActive) {
      setForm({
        question_text: card.question_text,
        question_type: card.question_type,
        is_required: card.is_required,
        show_percentage_summary: card.show_percentage_summary,
        allow_other: card.allow_other,
      });
      setOptions(card.options.length
        ? card.options.map(o => ({ id: `opt-${o.id}`, text: o.option_text }))
        : [{ id: newOptId(), text: '' }, { id: newOptId(), text: '' }]);
      setRatingMin(card.rating_config?.min_value ?? 1);
      setRatingMax(card.rating_config?.max_value ?? 5);
      setRatingMinLabel(card.rating_config?.min_label ?? '');
      setRatingMaxLabel(card.rating_config?.max_label ?? '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.question_text, card.question_type, isActive]);

  useEffect(() => {
    wasActive.current = isActive;
  }, [isActive]);

  // Always-fresh ref to deactivateAndSave — avoids stale closure when the parent calls it
  const deactivateAndSaveRef = useRef<(force?: boolean) => Promise<boolean>>(() => Promise.resolve(true));
  useEffect(() => { deactivateAndSaveRef.current = deactivateAndSave; }); // runs after every render

  // Register an async save-and-deactivate fn with the parent while the card is active
  useEffect(() => {
    if (isActive) {
      onRegisterValidate(() => deactivateAndSaveRef.current(true));
      return () => { onRegisterValidate(null); };
    }
    onRegisterValidate(null);
    return undefined;
  }, [isActive, onRegisterValidate]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isActive) {
      const t = setTimeout(() => textareaRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [isActive]);

  async function save(): Promise<boolean> {
    // Use formRef.current (always fresh) so stale closures never cause wrong data to be sent
    const f = formRef.current;
    const currentNeedsOptions = CHOICE_BASED_TYPES.has(f.question_type);
    const currentNeedsRating = f.question_type === 'rating' || f.question_type === 'linear_scale';
    const errs: Record<string, string> = {};
    if (!f.question_text.trim()) errs.question_text = 'Question text is required.';
    if (currentNeedsOptions && options.filter(o => o.text.trim()).length < 2) errs.options = 'At least 2 options required.';
    if (Object.keys(errs).length) { setErrors(errs); return false; }
    setErrors({});
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        ...f,
        question_text: f.question_text.trim(),
      };
      if (currentNeedsOptions)
        body.options = options.filter(o => o.text.trim()).map((o, i) => ({ option_text: o.text.trim(), order: i }));
      if (currentNeedsRating)
        body.rating_config = {
          min_value: f.question_type === 'rating' ? 1 : ratingMin,
          max_value: ratingMax,
          min_label: ratingMinLabel,
          max_label: ratingMaxLabel,
        };

      const isNew = isPendingId(card.uid);
      const url = isNew
        ? `/api/survey/admin/templates/${templateId}/questions`
        : `/api/survey/admin/questions/${card.uid}`;
      const method = isNew ? 'POST' : 'PATCH';

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify(body),
      });
      const raw = await res.json();
      if (!res.ok) {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw as Record<string, unknown>))
          fe[k] = Array.isArray(v) ? (v as string[])[0] : String(v);
        setErrors(fe);
        onSaveError(card.uid, 'Save failed. Check fields above.');
        return false;
      }
      onSaved(card.uid, raw as SurveyQuestion);
      return true;
    } catch {
      onSaveError(card.uid, 'Network error — changes not saved.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function deactivateAndSave(force = false): Promise<boolean> {
    if (!isActive && !force) return true; // already inactive
    const f = formRef.current;
    const currentNeedsRating = f.question_type === 'rating' || f.question_type === 'linear_scale';
    const updatedCard: QuestionCardItem = {
      ...card,
      question_text: f.question_text,
      question_type: f.question_type,
      is_required: f.is_required,
      show_percentage_summary: f.show_percentage_summary,
      allow_other: f.allow_other,
      options: options
        .filter(o => o.text.trim())
        .map((o, i) => ({ id: card.options[i]?.id ?? 0, option_text: o.text.trim(), order: i })),
      rating_config: currentNeedsRating
        ? { min_value: ratingMin, max_value: ratingMax, min_label: ratingMinLabel, max_label: ratingMaxLabel }
        : null,
    };

    const saved = await save();
    if (!saved) return false;

    onDeactivate(card.uid, updatedCard);
    return true;
  }

  function addOption() {
    const newIdx = options.length;
    setOptions(prev => [...prev, { id: newOptId(), text: '' }]);
    setTimeout(() => { optionRefs.current[newIdx]?.focus(); }, 50);
  }

  const isDragging = sortableProps?.isDragging ?? false;

  return (
    <motion.div
      data-card-uid={String(card.uid)}
      ref={(el) => {
        cardRef.current = el;
        sortableProps?.setNodeRef(el);
      }}
      style={sortableProps?.style}
      layout={!isJustDropped}
      layoutId={`qcard-${card.uid}`}
      initial={card.isNew ? { opacity: 0, scale: 0.97, y: -8 } : false}
      animate={{ opacity: isDragging ? 0.3 : 1, scale: isDragging ? 0.98 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.93, transition: { duration: 0.18 } }}
      transition={isJustDropped ? { duration: 0 } : SPRING}
      onClick={() => { if (!isActive) onActivate(card.uid); }}
      className={cn(
        'group rounded-lg border bg-[var(--color-bg-elevated)] overflow-hidden',
        isActive
          ? 'border-[#2845D6]/50 shadow-[0_4px_24px_rgba(40,69,214,0.12)] ring-1 ring-[#2845D6]/15'
          : 'border-[var(--color-border)] cursor-pointer hover:border-[#2845D6]/30 hover:shadow-sm',
        isDragging && 'shadow-xl ring-2 ring-[#2845D6]/25 z-10',
      )}
    >
      {/* Card header — always visible */}
      <div
        className={cn(
          'flex items-center justify-between gap-2 px-4 py-2.5 border-b',
          isActive ? 'border-[#2845D6]/20 bg-[#2845D6]/5' : 'border-transparent bg-transparent',
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* Drag handle — only for saved questions */}
          {!isPendingId(card.uid) && (
            <button
              {...(sortableProps?.attributes as React.ButtonHTMLAttributes<HTMLButtonElement>)}
              {...(sortableProps?.listeners as React.ButtonHTMLAttributes<HTMLButtonElement>)}
              className="text-[var(--color-text-muted)] hover:text-[#2845D6] cursor-grab active:cursor-grabbing touch-none shrink-0 transition-colors"
              aria-label="Drag to reorder"
            >
              <GripVertical className="size-3.5" />
            </button>
          )}
          {/* <span className="text-[#2845D6] shrink-0">{fieldDef?.icon}</span> */}
          <span className={cn('text-[11px] font-semibold text-[#2845D6] truncate max-w-[10rem]', !isActive && 'opacity-70')}>{fieldDef?.label ?? typeLabel(form.question_type)}</span>
          {isActive && card.is_required && (
            <span className="text-[10px] rounded-full bg-red-100 text-red-600 dark:bg-red-950/30 dark:text-red-400 px-2 py-0.5 font-medium shrink-0">
              Required
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {saving && <Loader2 className="size-3.5 animate-spin text-[#2845D6]" />}
          <button
            onClick={(e) => { e.stopPropagation(); setShowDeleteModal(true); }}
            className="rounded p-1 text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors opacity-0 group-hover:opacity-100"
            title="Delete"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* READ MODE — compact summary */}
      <AnimatePresence initial={false} mode="wait">
        {!isActive && (
          <motion.div
            key="read"
            layout
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1, transition: { duration: 0.18, ease: 'easeOut' } }}
            exit={{ height: 0, opacity: 0, transition: { duration: 0.12, ease: 'easeIn' } }}
            className="px-4 overflow-hidden pb-5 pt-0 flex flex-col gap-2.5"
          >
            {['section', 'subsection', 'statement'].includes(card.question_type) ? (
              <ReadModePreview card={card} />
            ) : (
              <>
                <p className="text-xs font-medium leading-snug text-[var(--color-text-primary)]">
                  {questionNumber !== null && (
                    <span className="text-[var(--color-text-muted)] font-mono text-xs mr-1.5">Q{questionNumber}</span>
                  )}
                  {card.question_text
                    ? <>{card.question_text}{card.is_required && questionNumber !== null && <span className="text-red-500 ml-[1px]">*</span>}</>
                    : <span className="italic text-[var(--color-text-muted)]">No question text</span>
                  }
                </p>
                <ReadModePreview card={card} />
              </>
            )}
            {card.saveError && (
              <p className="text-xs text-red-500 mt-0.5">{card.saveError}</p>
            )}
          </motion.div>
        )}

        {/* EDIT MODE — full interactive form */}
        {isActive && (
          <motion.div
            key="edit"
            layout
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1, transition: { duration: 0.2, ease: 'easeOut' } }}
            exit={{ height: 0, opacity: 0, transition: { duration: 0.12, ease: 'easeIn' } }}
            className="overflow-hidden p-4 flex flex-col gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Question text */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                {questionTextLabel}{showRequiredAsterisk && !form.question_text.trim() && <span className="text-red-500 normal-case tracking-normal">*</span>}
              </label>
              <Textarea
                ref={textareaRef}
                value={form.question_text}
                onChange={e => setForm(f => ({ ...f, question_text: e.target.value }))}
                rows={2}
                maxLength={500}
                showCharacterCount={false}
                placeholder={
                  needsOptions || needsRating
                    ? 'Enter your question…'
                    : 'Enter your question…'
                }
                onKeyDown={e => {
                  if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); deactivateAndSave(); }
                  if (e.key === 'Escape') { deactivateAndSave(); }
                }}
                className={cn(
                  errors.question_text ? 'border-transparent ring-1 ring-[var(--btn-danger-bg)]' : '',
                )}
              />
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <p className={cn(
                  errors.question_text ? 'text-[var(--btn-danger-bg)]' : 'invisible',
                  'min-h-[1em]',
                )}>{errors.question_text || ' '}</p>
                <p className="text-[var(--color-text-muted)]">{form.question_text.length}/500</p>
              </div>
            </div>

            {/* Field type is fixed from the Add a New Field panel */}

            {/* Options */}
            {needsOptions && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                  Options{options.filter(o => o.text.trim()).length < 2 && <span className="text-red-500 normal-case tracking-normal">*</span>}
                </label>
                <div className="flex flex-col">
                  <AnimatePresence initial={false}>
                    {options.map((opt, i) => (
                      <motion.div
                        key={opt.id}
                        layout
                        initial={false}
                        exit={{
                          opacity: 0,
                          height: 0,
                          marginBottom: 0,
                          transition: {
                            opacity: { duration: 0.15 },
                            height: { duration: 0.15, delay: 0.12 },
                            marginBottom: { duration: 0.15, delay: 0.12 },
                          },
                        }}
                        className="flex items-center gap-2 mb-1.5 overflow-hidden"
                      >
                        {form.question_type === 'single_choice' && (
                          <span className="size-4 rounded-full border-2 border-[var(--color-border)] shrink-0 pointer-events-none" />
                        )}
                        {form.question_type === 'multiple_choice' && (
                          <span className="size-4 rounded border border-[var(--color-border)] shrink-0 pointer-events-none" />
                        )}
                        <div className="flex-1 min-w-0">
                          <Input
                            ref={(el) => { optionRefs.current[i] = el; }}
                            value={opt.text}
                            onChange={e => {
                              const next = [...options];
                              next[i] = { ...next[i], text: e.target.value };
                              setOptions(next);
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); deactivateAndSave(); return; }
                              if (e.key === 'Enter') { e.preventDefault(); addOption(); }
                            }}
                            placeholder={`Option ${i + 1}`}
                            maxLength={300}
                            className="w-full"
                          />
                        </div>
                        <button
                          onClick={() => setOptions(options.filter((_, j) => j !== i))}
                          disabled={options.length <= 2}
                          className="text-[var(--color-text-muted)] hover:text-red-500 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <X className="size-4" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <button
                    onClick={addOption}
                    className="text-xs text-[#2845D6] hover:underline flex font-medium justify-center items-center gap-1 mt-0.5"
                  >
                    <Plus className="size-3" /> Add option
                  </button>
                </div>
                {errors.options && <p className="text-xs text-[var(--btn-danger-bg)]">{errors.options}</p>}
              </div>
            )}

            {/* Rating config */}
            {needsRating && (
              <div className="space-y-3">
                {form.question_type === 'rating' ? (
                  <div className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-muted)] p-2">
                    <button
                      type="button"
                      onClick={() => setRatingMax(prev => Math.max(2, prev - 1))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-transparent text-[var(--color-text-primary)] transition hover:bg-[#2845D6]/10"
                      aria-label="Decrease stars"
                    >
                      <Minus className="size-4" />
                    </button>

                    <div className="flex items-center justify-center gap-1 overflow-hidden">
                      <AnimatePresence initial={false} mode="popLayout">
                        {Array.from({ length: ratingMax }, (_, idx) => (
                          <motion.span
                            key={idx}
                            layout
                            initial={{ opacity: 0, x: 8, scale: 0.88 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: -8, scale: 0.88 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                            className="text-yellow-400 fill-yellow-400"
                          >
                            <Star className="size-4" />
                          </motion.span>
                        ))}
                      </AnimatePresence>
                    </div>

                    <button
                      type="button"
                      onClick={() => setRatingMax(prev => Math.min(10, prev + 1))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-transparent text-[var(--color-text-primary)] transition hover:bg-[#2845D6]/10"
                      aria-label="Increase stars"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Min</label>
                      <Input type="number" value={String(ratingMin)} onChange={e => setRatingMin(Number(e.target.value))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Max</label>
                      <Input type="number" value={String(ratingMax)} onChange={e => setRatingMax(Number(e.target.value))} />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Min Label</label>
                    <Input value={ratingMinLabel} onChange={e => setRatingMinLabel(e.target.value)} placeholder="e.g. Not satisfied" maxLength={50} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Max Label</label>
                    <Input value={ratingMaxLabel} onChange={e => setRatingMaxLabel(e.target.value)} placeholder="e.g. Very satisfied" maxLength={50} />
                  </div>
                </div>
              </div>
            )}

            {/* Toggles */}
            {!isInstructionType && (
              // stopPropagation here prevents Ark UI checkbox label clicks from bubbling
              // to the outer canvas click-away handler, which would trigger a premature save
              // with stale form state before React has flushed the onCheckedChange update.
              <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                <BasicCheckbox
                  checked={form.is_required}
                  onCheckedChange={value => {
                    formRef.current = { ...formRef.current, is_required: value };
                    setForm(f => ({ ...f, is_required: value }));
                  }}
                  label="Required"
                />
                {needsOptions && (
                  <BasicCheckbox
                    checked={form.allow_other}
                    onCheckedChange={v => {
                      formRef.current = { ...formRef.current, allow_other: v };
                      setForm(f => ({ ...f, allow_other: v }));
                    }}
                    label='Allow "Other" option'
                  />
                )}
                <BasicCheckbox
                  checked={form.show_percentage_summary}
                  onCheckedChange={v => {
                    formRef.current = { ...formRef.current, show_percentage_summary: v };
                    setForm(f => ({ ...f, show_percentage_summary: v }));
                  }}
                  label="Show percentage"
                />
              </div>
            )}

            {/* Inline save errors */}
            {card.saveError && (
              <p className="text-xs text-red-500">{card.saveError}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {showDeleteModal && (
          <ConfirmationModal
            key={`delete-modal-${card.uid}`}
            title="Delete question"
            message="Are you sure you want to delete this question? This action cannot be undone."
            confirmLabel="Delete"
            cancelLabel="Cancel"
            confirming={confirmingDelete}
            onCancel={() => setShowDeleteModal(false)}
            onConfirm={async () => {
              setConfirmingDelete(true);
              try {
                await onDelete(card.uid);
                setShowDeleteModal(false);
              } finally {
                setConfirmingDelete(false);
              }
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Sortable wrapper for QuestionCard ─────────────────────────────────────────

function SortableQuestionCard(props: Omit<QuestionCardProps, 'sortableProps'>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.card.uid as number });

  return (
    <QuestionCard
      {...props}
      sortableProps={{
        setNodeRef,
        attributes: attributes as unknown as Record<string, unknown>,
        listeners: listeners as Record<string, unknown>,
        style: {
          transform: CSS.Transform.toString(transform),
          transition: props.isJustDropped ? 'none' : transition,
        },
        isDragging,
      }}
    />
  );
}

// ── Draggable Field Type Button ───────────────────────────────────────────────

function DraggableFieldTypeButton({
  field,
  onClick,
}: {
  field: FieldTypeDef;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${FIELD_DRAG_PREFIX}${field.type}`,
    data: { fieldType: field.type },
  });

  return (
    <motion.button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      animate={{ opacity: isDragging ? 0.4 : 1 }}
      transition={{ duration: 0.15 }}
      className="w-full flex flex-col items-center gap-1.5 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[#2845D6]/40 hover:bg-[#2845D6]/5 text-[var(--color-text-muted)] hover:text-[#2845D6] transition-colors duration-150 group text-center"
      title={field.description}
    >
      <span className="text-[var(--color-text-muted)] group-hover:text-[#2845D6] transition-colors">
        {field.icon}
      </span>
      <span className="text-[11px] font-medium leading-tight">{field.label}</span>
    </motion.button>
  );
}

// ── Canvas Drop Target wrapper ────────────────────────────────────────────────

function CanvasDropTarget({ children }: { children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: 'canvas-droppable' });
  return (
    <div ref={setNodeRef} className="w-full">
      {children}
    </div>
  );
}

// ── Template Builder Content ──────────────────────────────────────────────────

function TemplateBuilderContent({ templateId }: { templateId: number }) {
  const router = useRouter();
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // cards replaces both questions[] and inlineNewQuestion — unified ordered list
  const [cards, setCards] = useState<QuestionCardItem[]>([]);
  const [activeCardUid, setActiveCardUid] = useState<number | string | null>(null);
  // Async save-and-deactivate fn exposed by the active QuestionCard
  const validateActiveCard = useRef<(() => Promise<boolean>) | null>(null);

  const [form, setForm] = useState({ title: '', description: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [reordering, setReordering] = useState(false);
  const [justDroppedUid, setJustDroppedUid] = useState<number | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [isOffCanvasOpen, setIsOffCanvasOpen] = useState(false);

  // Scroll state
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [canScrollUpCanvas, setCanScrollUpCanvas] = useState(false);
  const [canScrollDownCanvas, setCanScrollDownCanvas] = useState(false);
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // Drag state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDraggingFromPanel, setIsDraggingFromPanel] = useState(false);
  const [isOverCanvas, setIsOverCanvas] = useState(false);

  const activeDragField = activeDragId?.startsWith(FIELD_DRAG_PREFIX)
    ? FIELD_TYPES.find(f => f.type === activeDragId.slice(FIELD_DRAG_PREFIX.length)) ?? null
    : null;

  // Saved questions only (exclude pending) — for sortable IDs
  const savedCards = cards.filter(c => !isPendingId(c.uid));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    fetch(`/api/survey/admin/templates/${templateId}`, { credentials: 'include' })
      .then(r => r.json())
      .then((d: TemplateDetail) => {
        setTemplate(d);
        setForm({ title: d.title, description: d.description });
        setTitleDraft(d.title);
        const sorted = [...(d.questions ?? [])].sort((a, b) => a.order - b.order);
        setCards(sorted.map(q => ({
          uid: q.id,
          question_text: q.question_text,
          question_type: q.question_type,
          is_required: q.is_required,
          show_percentage_summary: q.show_percentage_summary,
          allow_other: q.allow_other,
          options: q.options,
          rating_config: q.rating_config,
          order: q.order,
        })));
      })
      .catch(() => toast.error('Failed to load template.', { title: 'Error' }))
      .finally(() => setLoading(false));
  }, [templateId]);

  async function handleSaveMeta() {
    if (!form.title.trim()) { setErrors({ title: 'Title is required.' }); return; }
    setSaving(true);
    setErrors({});
    try {
      const res = await fetch(`/api/survey/admin/templates/${templateId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify(form),
      });
      const raw = await res.json();
      if (!res.ok) {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw as Record<string, unknown>))
          fe[k] = Array.isArray(v) ? (v as string[])[0] : String(v);
        setErrors(fe);
        return;
      }
      setTemplate(raw as TemplateDetail);
      setTitleDraft((raw as TemplateDetail).title);
      setLastSaved(new Date());
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success('Template saved.', { title: 'Saved' });
      router.push('/dashboard/assessments/survey-templates');
    } finally {
      setSaving(false);
    }
  }

  async function handleTitleSave() {
    if (!titleDraft.trim()) { setErrors({ title: 'Title is required.' }); return; }
    if (!template) return;
    if (titleDraft.trim() === template.title) { setIsEditingTitle(false); return; }
    setSaving(true);
    setErrors({});
    try {
      const res = await fetch(`/api/survey/admin/templates/${templateId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ title: titleDraft.trim() }),
      });
      const raw = await res.json();
      if (!res.ok) {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw as Record<string, unknown>))
          fe[k] = Array.isArray(v) ? (v as string[])[0] : String(v);
        setErrors(fe);
        return;
      }
      const updated = raw as TemplateDetail;
      setTemplate(updated);
      setForm(prev => ({ ...prev, title: updated.title }));
      setTitleDraft(updated.title);
      setLastSaved(new Date());
      setIsEditingTitle(false);
      toast.success('Title saved.', { title: 'Saved' });
    } finally {
      setSaving(false);
    }
  }

  // Called by QuestionCard after a successful server save
  const handleCardSaved = useCallback((uid: number | string, saved: SurveyQuestion) => {
    setCards(prev => prev.map(c =>
      c.uid === uid
        ? {
            uid: saved.id,
            question_text: saved.question_text,
            question_type: saved.question_type,
            is_required: saved.is_required,
            show_percentage_summary: saved.show_percentage_summary,
            allow_other: saved.allow_other,
            options: saved.options,
            rating_config: saved.rating_config,
            order: saved.order,
            isNew: c.isNew,
            saveError: undefined,
          }
        : c,
    ));
    // If uid was pending, activeCardUid may still reference pending — update it
    if (isPendingId(uid)) {
      setActiveCardUid(prev => prev === uid ? saved.id : prev);
    }
    setLastSaved(new Date());
  }, []);

  const handleCardSaveError = useCallback((uid: number | string, err: string) => {
    setCards(prev => prev.map(c => c.uid === uid ? { ...c, saveError: err } : c));
  }, []);

  // Called when a card goes from active to read-only mode and its latest form state should be saved in parent state.
  const handleCardDeactivate = useCallback((uid: number | string, updatedCard: QuestionCardItem) => {
    setCards(prev => prev.map(c => c.uid === uid ? { ...updatedCard, saveError: c.saveError } : c));
  }, []);

  const handleRegisterValidate = useCallback((fn: (() => Promise<boolean>) | null) => {
    validateActiveCard.current = fn;
  }, []);

  // Called when a card is clicked to activate — saves & deactivates the active card first
  const handleCardActivate = useCallback(async (uid: number | string) => {
    if (validateActiveCard.current) {
      const ok = await validateActiveCard.current();
      if (!ok) return;
    }
    setActiveCardUid(uid);
  }, []);

  async function handleDeleteCard(uid: number | string) {
    if (isPendingId(uid)) {
      setCards(prev => prev.filter(c => c.uid !== uid));
      if (activeCardUid === uid) {
        validateActiveCard.current = null;
        setActiveCardUid(null);
      }
      return;
    }
    const res = await fetch(`/api/survey/admin/questions/${uid}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-CSRFToken': getCsrfToken() },
    });
    if (res.status === 204) {
      setCards(prev => prev.filter(c => c.uid !== uid));
      if (activeCardUid === uid) setActiveCardUid(null);
      setLastSaved(new Date());
      toast.success('Question deleted.', { title: 'Deleted' });
    } else {
      const d = await res.json();
      toast.error(d.detail ?? 'Could not delete question.', { title: 'Error' });
    }
  }

  async function insertNewCard(fieldType: string, insertIndex: number, fromDrag = false) {
    if (validateActiveCard.current) {
      const ok = await validateActiveCard.current();
      if (!ok) {
        const activeCard = cards.find(c => c.uid === activeCardUid);
        const label = activeCard ? (FIELD_TYPES.find(f => f.type === activeCard.question_type)?.label ?? activeCard.question_type) : 'current question';
        toast.error(`Complete the "${label}" question form before adding a new question.`, { title: 'Incomplete question' });
        return;
      }
    }
    const uid = newPendingId();
    const newCard: QuestionCardItem = {
      uid,
      question_text: '',
      question_type: fieldType,
      is_required: true,
      show_percentage_summary: false,
      allow_other: false,
      options: [],
      rating_config: null,
      order: insertIndex,
      isNew: !fromDrag,
    };
    setCards(prev => {
      const next = [...prev];
      next.splice(insertIndex, 0, newCard);
      return next;
    });
    setActiveCardUid(uid);
  }

  // ── DnD handlers ────────────────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveDragId(id);
    if (id.startsWith(FIELD_DRAG_PREFIX)) setIsDraggingFromPanel(true);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) { setIsOverCanvas(false); setDragOverIndex(null); return; }
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith(FIELD_DRAG_PREFIX)) {
      if (overId === 'canvas-droppable') {
        setIsOverCanvas(true);
        setDragOverIndex(cards.length);
        return;
      }
      const overCardIdx = cards.findIndex(c => String(c.uid) === overId);
      if (overCardIdx >= 0) {
        setIsOverCanvas(true);
        setDragOverIndex(overCardIdx);
        return;
      }
      setIsOverCanvas(false);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const activeId = String(active.id);
    const savedDragOverIndex = dragOverIndex;

    setActiveDragId(null);
    setIsDraggingFromPanel(false);
    setIsOverCanvas(false);
    setDragOverIndex(null);

    if (activeId.startsWith(FIELD_DRAG_PREFIX)) {
      if (over) {
        const fieldType = activeId.slice(FIELD_DRAG_PREFIX.length);
        await insertNewCard(fieldType, savedDragOverIndex ?? cards.length, true);
      }
      return;
    }

    // Reorder existing (saved) questions
    if (!over || active.id === over.id) return;
    const oldIdx = cards.findIndex(c => c.uid === Number(active.id));
    const newIdx = cards.findIndex(c => c.uid === Number(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(cards, oldIdx, newIdx);
    setCards(reordered);
    setJustDroppedUid(Number(active.id));
    setReordering(true);
    try {
      await fetch(`/api/survey/admin/templates/${templateId}/questions/reorder`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({
          order: reordered
            .filter(c => !isPendingId(c.uid))
            .map((c, i) => ({ id: c.uid, order: i })),
        }),
      });
      setLastSaved(new Date());
    } catch {
      toast.error('Could not save order.', { title: 'Error' });
    } finally {
      setReordering(false);
    }
  }

  function handleDragCancel() {
    setActiveDragId(null);
    setIsDraggingFromPanel(false);
    setIsOverCanvas(false);
    setDragOverIndex(null);
  }

  // Real-time cursor tracking during panel drag — continuously resolve the nearest insertion gap
  useEffect(() => {
    if (!isDraggingFromPanel) return;

    function onPointerMove(e: PointerEvent) {
      const cardEls = [...document.querySelectorAll<HTMLElement>('[data-card-uid]')];
      if (cardEls.length === 0) {
        setIsOverCanvas(true);
        setDragOverIndex(0);
        return;
      }

      // Check whether the pointer is within the canvas bounds
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const inside = e.clientX >= rect.left && e.clientX <= rect.right
          && e.clientY >= rect.top && e.clientY <= rect.bottom;
        setIsOverCanvas(inside);
        if (!inside) { setDragOverIndex(null); return; }
      }

      let newIdx = cardEls.length;
      for (let i = 0; i < cardEls.length; i++) {
        const r = cardEls[i].getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { newIdx = i; break; }
      }
      setDragOverIndex(prev => prev === newIdx ? prev : newIdx);
    }

    document.addEventListener('pointermove', onPointerMove);
    return () => document.removeEventListener('pointermove', onPointerMove);
  }, [isDraggingFromPanel]);

  function updateRightScrollState() {
    const el = rightPanelRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 8);
    setCanScrollDown(el.scrollHeight > el.clientHeight + 8 && el.scrollTop + el.clientHeight < el.scrollHeight - 8);
  }

  function updateCanvasScrollState() {
    const el = canvasRef.current;
    if (!el) return;
    setCanScrollUpCanvas(el.scrollTop > 8);
    setCanScrollDownCanvas(el.scrollHeight > el.clientHeight + 8 && el.scrollTop + el.clientHeight < el.scrollHeight - 8);
  }

  useEffect(() => {
    updateRightScrollState();
    updateCanvasScrollState();
  }, [loading, cards.length]);

  // Clear the just-dropped flag after two animation frames so only the snap render skips animation
  useEffect(() => {
    if (justDroppedUid === null) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setJustDroppedUid(null));
    });
    return () => cancelAnimationFrame(id);
  }, [justDroppedUid]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="size-6 border-2 border-[#2845D6]/30 border-t-[#2845D6] rounded-full animate-spin" />
      </div>
    );
  }

  const formatLastSaved = (d: Date) => {
    const now = new Date();
    const diff = Math.round((now.getTime() - d.getTime()) / 1000);
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    return `${Math.round(diff / 60)}m ago`;
  };

  // Build interleaved list with drop zone indicator at dragOverIndex
  const canvasItems: Array<
    | { type: 'card'; card: QuestionCardItem; displayIndex: number; questionNumber: number | null }
    | { type: 'dropzone'; key: string }
  > = [];

  let displayIndex = 0;
  let questionNumber = 0;
  const isInstructionBlock = (type: string) => ['section', 'subsection', 'statement'].includes(type);
  cards.forEach((card, i) => {
    if (isDraggingFromPanel && isOverCanvas && dragOverIndex === i) {
      canvasItems.push({ type: 'dropzone', key: 'dz' });
    }
    const qNum = isInstructionBlock(card.question_type) ? null : ++questionNumber;
    canvasItems.push({ type: 'card', card, displayIndex: displayIndex++, questionNumber: qNum });
  });
  if (isDraggingFromPanel && isOverCanvas && (dragOverIndex === cards.length || dragOverIndex === null)) {
    canvasItems.push({ type: 'dropzone', key: 'dz-end' });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        className="flex flex-col h-full min-h-0"
        // Click outside all cards → save active card then deactivate
        onClick={async () => {
          if (activeCardUid !== null) {
            if (validateActiveCard.current) {
              const ok = await validateActiveCard.current();
              if (!ok) return;
            }
            setActiveCardUid(null);
          }
        }}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3.5 border-b border-[var(--color-border)]">
          <button
            onClick={() => router.push('/dashboard/assessments/survey-templates')}
            className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <ArrowLeft className="size-4" /> Back
          </button>
          <span className="text-[var(--color-border)]">/</span>
          <div className="flex-1 min-w-0">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleTitleSave(); }
                  if (e.key === 'Escape') { setIsEditingTitle(false); setTitleDraft(form.title); }
                }}
                onBlur={() => setIsEditingTitle(false)}
                className="w-[400px] px-2 py-0.5 rounded-sm bg-transparent text-sm font-semibold text-[var(--color-text-primary)] truncate focus:border-primary focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => { setTitleDraft(form.title || template?.title || ''); setIsEditingTitle(true); }}
                className="w-full text-left text-sm font-semibold text-[var(--color-text-primary)] truncate"
              >
                {template?.title ?? 'Template Builder'}
              </button>
            )}
          </div>
          {reordering && <Loader2 className="size-4 animate-spin text-[var(--color-text-muted)]" />}
        </div>

        {/* ── 2-Column Layout ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Canvas */}
          <div
            ref={canvasRef}
            onScroll={updateCanvasScrollState}
            className="relative flex-1 min-h-0 overflow-y-auto bg-[var(--color-bg)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="p-4 sm:p-6 flex flex-col items-center">
              <div className="flex flex-col gap-3 w-full md:w-[50%] max-w-full md:max-w-[720px]">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[var(--color-text-primary)]">Questions</h3>
                </div>

                <CanvasDropTarget>
                  {cards.length === 0 && !isDraggingFromPanel ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 rounded-xl border-2 border-dashed border-[var(--color-border)] text-[var(--color-text-muted)]">
                      <Settings2 className="size-9 opacity-30" />
                      <p className="text-xs font-medium">No questions yet</p>
                      <p className="text-[11px] opacity-70">Drag a field type here or click it to add a question</p>
                    </div>
                  ) : cards.length === 0 && isDraggingFromPanel ? (
                    <AnimatePresence>
                      {isOverCanvas && activeDragField && (
                        <DropZoneIndicator key="dz-empty" fieldType={activeDragField.type} isEmpty />
                      )}
                    </AnimatePresence>
                  ) : (
                    <SortableContext
                      items={savedCards.map(c => c.uid as number)}
                      strategy={verticalListSortingStrategy}
                    >
                      <LayoutGroup>
                        <div
                          className="flex flex-col gap-3"
                          onClick={e => e.stopPropagation()}
                        >
                          <AnimatePresence initial={false} mode="popLayout">
                            {canvasItems.map(item => {
                              if (item.type === 'dropzone') {
                                return activeDragField ? (
                                  <DropZoneIndicator key={item.key} fieldType={activeDragField.type} />
                                ) : null;
                              }
                              const { card, displayIndex: di, questionNumber } = item;
                              if (isPendingId(card.uid)) {
                                return (
                                  <QuestionCard
                                    key={String(card.uid)}
                                    card={card}
                                    index={di}
                                    questionNumber={questionNumber}
                                    isActive={activeCardUid === card.uid}
                                    templateId={template?.id ?? templateId}
                                    onActivate={handleCardActivate}
                                    onDeactivate={handleCardDeactivate}
                                    onDelete={handleDeleteCard}
                                    onSaved={handleCardSaved}
                                    onSaveError={handleCardSaveError}
                                    onRegisterValidate={handleRegisterValidate}
                                  />
                                );
                              }
                              return (
                                <SortableQuestionCard
                                  key={String(card.uid)}
                                  card={card}
                                  index={di}
                                  questionNumber={questionNumber}
                                  isActive={activeCardUid === card.uid}
                                  isJustDropped={justDroppedUid === card.uid}
                                  templateId={template?.id ?? templateId}
                                  onActivate={handleCardActivate}
                                  onDeactivate={handleCardDeactivate}
                                  onDelete={handleDeleteCard}
                                  onSaved={handleCardSaved}
                                  onSaveError={handleCardSaveError}
                                  onRegisterValidate={handleRegisterValidate}
                                />
                              );
                            })}
                          </AnimatePresence>
                        </div>
                      </LayoutGroup>
                    </SortableContext>
                  )}
                </CanvasDropTarget>
              </div>
            </div>

          </div>

          {/* Right: Add Fields Panel */}
          <aside
            className="hidden md:flex w-72 shrink-0 min-h-0 border-l border-[var(--color-border)] bg-[var(--color-bg-elevated)] md:flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[var(--color-border)]">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">Add a new field</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Click or drag a field type onto the canvas</p>
            </div>

            <div className="relative flex flex-1 min-h-0 overflow-hidden">
              <div
                ref={rightPanelRef}
                onScroll={updateRightScrollState}
                className="h-full w-full min-h-0 overflow-y-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <div className="grid grid-cols-2 gap-2 w-full">
                  {FIELD_TYPES.map(field => (
                    <DraggableFieldTypeButton
                      key={field.type}
                      field={field}
                      onClick={() => insertNewCard(field.type, cards.length)}
                    />
                  ))}
                </div>
              </div>

              {canScrollUp && (
                <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[var(--color-bg-elevated)] to-transparent flex items-start justify-center">
                  <div className="mt-2 inline-flex items-center px-2 py-1 text-[11px] text-[var(--color-text-muted)]">
                    <ChevronUp className="size-3" />
                  </div>
                </div>
              )}
              {canScrollDown && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--color-bg-elevated)] to-transparent flex items-end justify-center">
                  <div className="mb-2 inline-flex items-center px-2 py-1 text-[11px] text-[var(--color-text-muted)]">
                    <ChevronDown className="size-3" />
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[var(--color-border)] flex flex-col gap-2">
              <button
                onClick={handleSaveMeta}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#2845D6] px-4 py-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
              >
                {saving ? (
                  <TextShimmer duration={1} className="text-xs font-semibold text-white [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">
                    Saving…
                  </TextShimmer>
                ) : (
                  <>
                    <Save className="size-3.5" />
                    Save Template
                  </>
                )}
              </button>
              <button
                onClick={() => router.push('/dashboard/assessments/survey-templates')}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] px-4 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors"
              >
                Back to Templates
              </button>
            </div>
          </aside>
        </div>

        {/* Floating Add Button — tablet/mobile only */}
        <button
          onClick={() => setIsOffCanvasOpen(true)}
          className="md:hidden fixed top-20 right-4 z-50 size-12 rounded-full bg-[#2845D6] text-white shadow-lg shadow-[#2845D6]/30 flex items-center justify-center hover:opacity-90 active:scale-95 transition-all"
          aria-label="Add a new field"
        >
          <Plus className="size-5" />
        </button>
      </div>

      {/* DragOverlay — ghost card follows the cursor */}
      <DragOverlay dropAnimation={null}>
        {activeDragField ? (
          <GhostFieldCard field={activeDragField} />
        ) : activeDragId && !activeDragId.startsWith(FIELD_DRAG_PREFIX) ? (
          (() => {
            const card = cards.find(c => c.uid === Number(activeDragId));
            if (!card) return null;
            const idx = cards.findIndex(c => c.uid === Number(activeDragId));
            return (
              <motion.div
                initial={{ scale: 1, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                animate={{ scale: 1.03, boxShadow: '0 16px 48px rgba(40,69,214,0.18)' }}
                transition={SPRING}
                className="rounded-xl border border-[#2845D6]/30 bg-[var(--color-bg-elevated)] p-4 flex gap-3 ring-2 ring-[#2845D6]/20 opacity-95 cursor-grabbing"
              >
                <GripVertical className="size-4 text-[var(--color-text-muted)] mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-[var(--color-text-muted)]">Q{idx + 1}</span>
                    <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">
                      {typeLabel(card.question_type)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium leading-snug text-[var(--color-text-primary)] truncate">
                    {card.question_text}
                  </p>
                </div>
              </motion.div>
            );
          })()
        ) : null}
      </DragOverlay>

      {/* Off-canvas field panel — tablet/mobile only */}
      <AnimatePresence>
        {isOffCanvasOpen && (
          <>
            <motion.div
              key="offcanvas-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 z-40 bg-black/40"
              onClick={() => setIsOffCanvasOpen(false)}
            />
            <motion.aside
              key="offcanvas-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="md:hidden fixed right-0 top-0 bottom-0 z-50 w-72 bg-[var(--color-bg-elevated)] border-l border-[var(--color-border)] flex flex-col overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">Add a new field</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Tap a field type to insert it</p>
                </div>
                <button
                  onClick={() => setIsOffCanvasOpen(false)}
                  className="rounded p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="grid grid-cols-2 gap-2 w-full">
                  {FIELD_TYPES.map(field => (
                    <button
                      key={field.type}
                      onClick={() => insertNewCard(field.type, cards.length)}
                      className="w-full flex flex-col items-center gap-1.5 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[#2845D6]/40 hover:bg-[#2845D6]/5 text-[var(--color-text-muted)] hover:text-[#2845D6] transition-colors duration-150 text-center"
                      title={field.description}
                    >
                      <span>{field.icon}</span>
                      <span className="text-[11px] font-medium leading-tight">{field.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-4 border-t border-[var(--color-border)] flex flex-col gap-2">
                <button
                  onClick={handleSaveMeta}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#2845D6] px-4 py-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  {saving ? (
                    <TextShimmer duration={2} className="text-xs font-semibold text-white [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">
                      Saving…
                    </TextShimmer>
                  ) : 'Save Template'}
                </button>
                <button
                  onClick={() => setIsOffCanvasOpen(false)}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] px-4 py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors"
                >
                  Done
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </DndContext>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TemplateBuilderPage() {
  const router = useRouter();
  const params = useParams();
  const templateId = Number(params?.id);

  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');
  const [user, setUser] = useState<UserData | null>(null);

  useEffect(() => {
    if (!templateId || isNaN(templateId)) {
      router.push('/dashboard/assessments/survey-templates');
      return;
    }
    const timer = setTimeout(() => setAuthPhase('checking'), 350);
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => { if (!r.ok) { router.push('/'); return null; } return r.json(); })
      .then((u: UserData | null) => {
        clearTimeout(timer);
        if (!u) { router.push('/dashboard'); return; }
        const hasAccess = u.admin || u.hr || u.iad;
        if (!hasAccess) { router.push('/dashboard'); return; }
        setUser(u);
        setAuthPhase('done');
      })
      .catch(() => { clearTimeout(timer); router.push('/'); });
    return () => clearTimeout(timer);
  }, [router, templateId]);

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

  if (!user || !templateId) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] min-h-0 overflow-hidden">
      <TemplateBuilderContent templateId={templateId} />
    </div>
  );
}
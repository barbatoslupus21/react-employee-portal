'use client';

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  X,
  Check,
  Calendar,
  CalendarDays,
  Clock,
  Search,
  Users,
  Info,
} from 'lucide-react';
import { ChoiceboxGroup } from '@/components/ui/choicebox-1';
import SearchBar from '@/components/ui/searchbar';
import { getCsrfToken } from '@/lib/csrf';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TextareaWithCharactersLeft } from '@/components/ui/textarea-with-characters-left';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { EmptyState } from '@/components/ui/interactive-empty-state';
import { AvatarGroup } from '@/components/ui/avatar-group';
import { Upload, Download, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '@/components/ui/pagination';

// ── Types ──────────────────────────────────────────────────────────────────────

type EventType = 'important' | 'meeting' | 'task' | 'reminder' | 'deadline' | 'legal' | 'special' | 'day_off' | 'company';

interface CalendarMember {
  id: number;
  idnumber: string;
  firstname: string | null;
  lastname: string | null;
  avatar: string | null;
}

interface CalendarEvent {
  id: number;
  title: string;
  date: string;        // YYYY-MM-DD
  start_time?: string;  // HH:MM(:SS) — not persisted by backend
  end_time?: string;    // HH:MM(:SS) — not persisted by backend
  event_type: EventType;
  repetition: string;
  note: string;
  owner: number;
  owner_detail?: CalendarMember;
  members: number[];
  members_detail: CalendarMember[];
}

type RepetitionType = 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly';

interface FormState {
  title: string;
  date: string;
  event_type: EventType;
  repetition: RepetitionType;
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
  note: string;
  memberScope: 'all' | 'selected';
  memberIds: number[];
}

type TimelogStatus = 'no_time_out' | 'no_time_in' | 'absent';
type TimelogStatusMap = Record<string, TimelogStatus>;

// ── Constants ──────────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAYS_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const EVENT_TYPE_CONFIG: Record<EventType, { label: string; color: string }> = {
  important: { label: 'Important', color: '#F59E0B' },
  meeting:   { label: 'Meeting',   color: '#2845D6' },
  task:      { label: 'Task',      color: '#8B5CF6' },
  reminder:  { label: 'Reminder',  color: '#14B8A6' },
  deadline:  { label: 'Deadline',  color: '#F63049' },
  legal:     { label: 'Legal Holiday', color: '#EE6983' },
  special:   { label: 'Special Holiday', color: '#FF7F11' },
  day_off:   { label: 'Day Off', color: '#9CCFFF' },
  company:   { label: 'Company Holiday', color: '#237227' },
};

// ── Pure helpers ───────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmt5(t: string): string {
  // "HH:MM:SS" → "HH:MM"
  return t.slice(0, 5);
}

function durationLabel(start: string, end: string): string {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) return '';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h} hour${h > 1 ? 's' : ''}`;
}

function buildCells(year: number, month: number) {
  const firstWd    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { day: number | null; date: Date | null }[] = [];
  for (let i = 0; i < firstWd; i++) cells.push({ day: null, date: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: new Date(year, month, d) });
  const tail = cells.length % 7;
  if (tail > 0) for (let i = 0; i < 7 - tail; i++) cells.push({ day: null, date: null });
  return cells;
}

function memberName(m: CalendarMember): string {
  return `${m.firstname ?? ''} ${m.lastname ?? ''}`.trim() || m.idnumber;
}

/**
 * Returns true when a recurring event should appear on the given date.
 * - once:    only the original date
 * - daily:   every day except Sunday (getDay() === 0), on or after the start date
 * - weekly:  same day-of-week as the start date, on or after the start date
 * - monthly: same day-of-month as the start date, on or after the start date
 * - yearly:  same month+day as the start date, on or after the start date
 */
function eventOccursOn(event: CalendarEvent, date: Date): boolean {
  const dateStr   = toDateStr(date);
  if (dateStr < event.date) return false;          // never before the start date
  const startDate = new Date(event.date + 'T00:00:00');
  switch (event.repetition) {
    case 'once':
      return dateStr === event.date;
    case 'daily':
      return date.getDay() !== 0;                  // every day except Sunday
    case 'weekly':
      return date.getDay() === startDate.getDay();
    case 'monthly':
      return date.getDate() === startDate.getDate();
    case 'yearly':
      return (
        date.getMonth() === startDate.getMonth() &&
        date.getDate()  === startDate.getDate()
      );
    default:
      return dateStr === event.date;
  }
}

const REPETITION_OPTIONS: { value: RepetitionType; label: string }[] = [
  { value: 'once',    label: 'Does not repeat' },
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly',  label: 'Yearly' },
];

function defaultForm(date: string): FormState {
  return { title: '', date, event_type: 'meeting', repetition: 'once', start_time: '09:00', end_time: '10:00', note: '', memberScope: 'selected', memberIds: [] };
} /* start_time/end_time retained in type but ignored by backend */

// ── Validation helpers ─────────────────────────────────────────────────────────

/**
 * Block characters that have no business in free-text fields and could
 * enable XSS / injection vectors: < > { } [ ] \ | ^ ~ ` "
 * Everything else (letters incl. accented, digits, spaces, -',.:()
 * !?&@#/_ etc.) is allowed.
 */
const BLOCKED_CHARS_RE = /[<>{}\[\]\\|^~`"]/;

function validateText(val: string): string {
  if (BLOCKED_CHARS_RE.test(val)) return 'Special characters like < > { } [ ] \\ | ^ ~ ` " are not allowed.';
  return '';
}

// ── EventChip ──────────────────────────────────────────────────────────────────

function EventChip({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: (e: React.MouseEvent) => void;
}) {
  const cfg = EVENT_TYPE_CONFIG[event.event_type] ?? EVENT_TYPE_CONFIG.meeting;
  return (
    <button
      onClick={onClick}
      title={event.title}
      className="group w-full flex items-center gap-1 px-1 py-[2px] pl text-[10px]
        font-medium leading-none truncate text-left transition-opacity hover:opacity-70"
    >
      <span
        className="inline-block w-[3px] shrink-0 self-stretch rounded-full"
        style={{ backgroundColor: cfg.color }}
      />
      <span className="truncate text-[var(--color-text-primary)]">{event.title}</span>
    </button>
  );
}

// ── Avatar stack ───────────────────────────────────────────────────────────────

function AvatarStack({
  members,
  max = 4,
  size = 22,
}: {
  members: CalendarMember[];
  max?: number;
  size?: number;
}) {
  if (!members.length) return null;
  const visible = members.slice(0, max);
  const rest    = members.length - max;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex -space-x-1.5">
        {visible.map((m) => (
          <img
            key={m.id}
            title={memberName(m)}
            src={m.avatar ?? "/default-avatar.png"}
            alt={memberName(m)}
            className="rounded-full border-2 border-[var(--color-bg-card)] object-cover shrink-0"
            style={{ width: size, height: size }}
          />
        ))}
      </div>
      {rest > 0 && (
        <span className="text-[10px] text-[var(--color-text-muted)]">+{rest} more</span>
      )}
    </div>
  );
}

// ── MemberPicker ───────────────────────────────────────────────────────────────

function MemberPicker({
  value,
  onChange,
  users,
  loading,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  users: CalendarMember[];
  loading: boolean;
}) {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? users.filter(u => {
        const name = memberName(u).toLowerCase();
        const q = search.toLowerCase();
        return name.includes(q) || u.idnumber.toLowerCase().includes(q);
      })
    : users;

  const toggle = (id: number) => {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-5">
        <div className="h-5 w-5 rounded-full border-2 border-[#2845D6] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
      {/* Search input (global SearchBar) */}
      <div className="border-b border-[var(--color-border)] p-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Search employees…" />
      </div>

      {/* User list */}
      <div className="max-h-[240px] overflow-y-auto [scrollbar-width:thin]">
        {filtered.length === 0 ? (
          <EmptyState
            title={search.trim() ? 'No results found' : 'No employees'}
            description={
              search.trim()
                ? 'Try a different name or ID number'
                : 'There are no employees to display'
            }
            icons={search.trim() ? [Search] : [Users]}
            className="py-4 border-0"
          />
        ) : (
          filtered.map((u, idx) => {
            const selected = value.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 transition-colors text-left border-b border-[var(--color-border)] last:border-b-0
                  ${selected ? 'bg-[#2845D6]/8' : 'hover:bg-[var(--color-bg-card)]'}`}
              >
                {/* Avatar (use image if available; otherwise match sidebar avatar style) */}
                <img
                  src={u.avatar ?? "/default-avatar.png"}
                  alt={memberName(u)}
                  className="w-8 h-8 rounded-full object-cover shrink-0"
                />

                {/* Name + ID */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[var(--color-text-primary)] truncate">
                    {memberName(u)}
                  </p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    {u.idnumber}
                  </p>
                </div>

                {/* Checkbox indicator */}
                <span
                  className={`shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors
                    ${selected ? 'bg-[#2845D6] border-[#2845D6]' : 'border-[var(--color-border-strong)] bg-transparent'}`}
                >
                  {selected && <Check size={10} className="text-white" />}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Footer: count + clear */}
      {value.length > 0 && (
        <div className="border-t border-[var(--color-border)] px-3 py-1.5 flex items-center justify-between">
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {value.length} selected
          </span>
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[10px] text-red-500 hover:text-red-600 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

// ── Event Modal ────────────────────────────────────────────────────────────────

interface ModalProps {
  event: CalendarEvent | null;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onClose: () => void;
  onSave: () => Promise<void>;
  onDelete?: () => Promise<void>;
  saving: boolean;
  isAdmin?: boolean;
  isOwner?: boolean;
  allUsers: CalendarMember[];
  usersLoading: boolean;
}

function EventModal({ event, form, setForm, onClose, onSave, onDelete, saving, isAdmin, isOwner = true, allUsers, usersLoading }: ModalProps) {
  const isNew = event === null;
  const [titleError,      setTitleError]      = useState('');
  const [noteError,       setNoteError]       = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const dateLabel = useMemo(() => {
    if (!form.date) return '';
    const d = new Date(form.date + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }, [form.date]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-[var(--color-border)]
          bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            {isNew ? 'New Event' : isOwner ? 'Edit Event' : 'View Event'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full
              text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className={`space-y-5 p-6 max-h-[calc(100vh-16rem)] overflow-y-auto${!isOwner && !isNew ? ' pointer-events-none select-none opacity-70' : ''}`}>

          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Event Title</label>
            <Input
              autoFocus
              placeholder="e.g., Team Standup"
              value={form.title}
              title={titleError || undefined}
              className={titleError ? 'border-red-500' : ''}
              onChange={e => {
                const val = e.target.value;
                const err = validateText(val);
                if (err) { setTitleError(err); return; }
                if (val.length > 100) { setTitleError('Maximum 100 characters allowed'); return; }
                setTitleError('');
                setForm(f => ({ ...f, title: val }));
              }}
              onPaste={e => {
                const paste = e.clipboardData.getData('text');
                if (BLOCKED_CHARS_RE.test(paste)) {
                  e.preventDefault();
                  setTitleError('Special characters like < > { } [ ] \\ | ^ ~ ` " are not allowed.');
                  return;
                }
                if (form.title.length + paste.length > 100) {
                  e.preventDefault();
                  setTitleError('Maximum 100 characters allowed');
                }
              }}
              maxLength={100}
            />
            {titleError && (
              <p className="text-xs text-red-500 mt-1" role="alert">
                {titleError}
              </p>
            )}
          </div>

          {/* Date (display-only) */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Date</label>
            <div className="flex h-9 items-center rounded-lg border border-[var(--color-border-strong)]
              bg-[var(--color-bg-elevated)] px-3 text-sm text-[var(--color-text-muted)]">
              {dateLabel}
            </div>
          </div>

          {/* Type + Repetition */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Event Type</label>
              <Select
                value={form.event_type}
                onValueChange={v => setForm(f => ({ ...f, event_type: v as EventType }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(EVENT_TYPE_CONFIG) as [EventType, { label: string; color: string }][]).map(
                    ([val, cfg]) => (
                      <SelectItem key={val} value={val}>
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: cfg.color }}
                          />
                          {cfg.label}
                        </span>
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Repeat</label>
              <Select
                value={form.repetition}
                onValueChange={v => setForm(f => ({ ...f, repetition: v as RepetitionType }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPETITION_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <TextareaWithCharactersLeft
              label="Note"
              placeholder="Optional: Add an agenda or notes..."
              value={form.note}
              maxLength={300}
              error={noteError}
              className="min-h-[80px] resize-none"
              onChange={e => {
                const val = e.target.value;
                const err = validateText(val);
                if (err) { setNoteError(err); return; }
                setNoteError('');
                setForm(f => ({ ...f, note: val }));
              }}
              onPaste={e => {
                const paste = e.clipboardData.getData('text');
                if (BLOCKED_CHARS_RE.test(paste)) {
                  e.preventDefault();
                  setNoteError('Special characters like < > { } [ ] \\ | ^ ~ ` " are not allowed.');
                }
              }}
            />
          </div>

          {/* Members scope */}
          <div className="space-y-3">
            <ChoiceboxGroup
              direction="row"
              label="Members"
              showLabel
              onChange={(v: string) => {
                const scope = v as 'all' | 'selected';
                setForm(f => ({
                  ...f,
                  memberScope: scope,
                  // When switching to 'all', clear manual selections
                  memberIds: scope === 'all' ? [] : f.memberIds,
                }));
              }}
              type="radio"
              value={form.memberScope}
            >
              <ChoiceboxGroup.Item
                title="All"
                description="All employees will be included as members"
                value="all"
                disabled={!isAdmin}
              />
              <ChoiceboxGroup.Item
                title="Selected Employees"
                description="Manually choose which employees to include"
                value="selected"
              />
            </ChoiceboxGroup>

            {/* Member picker — expands/collapses when scope changes */}
            <AnimatePresence initial={false}>
              {form.memberScope === 'selected' && (
                <motion.div
                  key="member-picker"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <MemberPicker
                    value={form.memberIds}
                    onChange={ids => setForm(f => ({ ...f, memberIds: ids }))}
                    users={allUsers}
                    loading={usersLoading}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-[var(--color-border)] p-4 overflow-hidden">
          {/* Read-only footer — shown when the current user is just a member */}
          {!isOwner && !isNew ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--color-border-strong)]
                  text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
          <AnimatePresence mode="wait" initial={false}>
            {confirmingDelete ? (
              /* ── Confirm-delete state ── */
              <motion.div
                key="confirm"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-between gap-3"
              >
                <p className="text-sm text-[var(--color-text-primary)] leading-snug">
                  <span className="font-semibold">Delete this event?</span>
                  <span className="text-[var(--color-text-muted)] ml-1.5">This cannot be undone.</span>
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--color-border-strong)]
                      text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={saving}
                    className="min-w-[96px] flex items-center justify-center px-3 py-1.5 rounded-lg text-sm font-semibold
                      text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    {saving
                      ? <TextShimmer duration={1.2} className="text-sm font-semibold">Deleting…</TextShimmer>
                      : 'Yes, Delete'
                    }
                  </button>
                </div>
              </motion.div>
            ) : (
              /* ── Normal-actions state ── */
              <motion.div
                key="actions"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-between"
              >
                <div>
                  {!isNew && onDelete && (
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(true)}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white
                        bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
                    >
                      <X size={14} />Delete
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={saving || !form.title.trim() || !!titleError || !!noteError || (form.memberScope === 'selected' && form.memberIds.length === 0)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2845D6] text-white text-sm font-semibold
                      hover:bg-[#1f38c0] disabled:opacity-50 transition-colors"
                  >
                    {saving
                      ? <TextShimmer duration={1.2} className="text-sm font-semibold text-white [--base-color:#a5b4fc] [--base-gradient-color:#ffffff] dark:[--base-color:#a5b4fc] dark:[--base-gradient-color:#ffffff]">{isNew ? 'Creating…' : 'Saving…'}</TextShimmer>
                      : <><Check size={14} /><span>{isNew ? 'Create Event' : 'Save changes'}</span></>
                    }
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Timelog types ─────────────────────────────────────────────────────────────

interface TimelogEmployee {
  idnumber: string;
  firstname: string;
  lastname: string;
  department: string;
  line: string;
  completeness: number; // 0–100
}

interface UserTimelog {
  date: string;       // YYYY-MM-DD
  time_in: string | null;
  time_out: string | null;
  is_complete: boolean;
}

// ── UserTimelogsModal ──────────────────────────────────────────────────────────

function UserTimelogsModal({
  employee,
  onClose,
}: {
  employee: TimelogEmployee;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<UserTimelog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/timelogs/user-logs?idnumber=${encodeURIComponent(employee.idnumber)}`, {
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : [])
      .then(data => setLogs(Array.isArray(data) ? data : []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [employee.idnumber]);

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-[var(--color-border)]
          bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              {employee.lastname}, {employee.firstname}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {employee.idnumber} · Current Week Timelogs
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full
              text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-y-auto max-h-[420px] [scrollbar-width:thin]">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="h-5 w-5 rounded-full border-2 border-[#2845D6] border-t-transparent animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              title="No timelogs this week"
              description="No timelog records found for the current week."
              icons={[Clock]}
              className="py-10"
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--color-bg-elevated)] z-10">
                <tr className="border-b border-[var(--color-border)]">
                  {['Date', 'Time-In', 'Time-Out', 'Remarks'].map(h => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {logs.map(log => (
                  <tr key={log.date} className="hover:bg-[var(--color-bg-card)] transition-colors">
                    <td className="px-4 py-2.5 text-xs text-[var(--color-text-primary)] whitespace-nowrap">
                      {formatDate(log.date)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-text-primary)] tabular-nums">
                      {log.time_in ?? <span className="text-[var(--color-text-muted)]">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-text-primary)] tabular-nums">
                      {log.time_out ?? <span className="text-[var(--color-text-muted)]">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="text-xs font-semibold"
                        style={{ color: log.is_complete ? '#22c55e' : '#ef4444' }}
                      >
                        {log.is_complete ? 'Complete' : 'Incomplete'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] px-5 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-sm font-medium border border-[var(--color-border-strong)]
              text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}



function TimelogsModal({ onClose }: { onClose: () => void }) {
  const [employees,    setEmployees]    = useState<TimelogEmployee[]>([]);
  const [loadingEmps,  setLoadingEmps]  = useState(true);
  const [search,       setSearch]       = useState('');
  const [uploadOpen,   setUploadOpen]   = useState(false);
  const [selectedEmp,  setSelectedEmp]  = useState<TimelogEmployee | null>(null);
  // upload states
  const [phase,        setPhase]        = useState<'idle' | 'checking' | 'uploading' | 'done'>('idle');
  const [uploadError,  setUploadError]  = useState('');
  const [uploadPct,    setUploadPct]    = useState(0);
  const [isDragging,   setIsDragging]   = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  const isBusy = phase === 'checking' || phase === 'uploading';

  useEffect(() => { setPage(1); }, [search]);

  useEffect(() => {
    setLoadingEmps(true);
    fetch('/api/timelogs/completeness', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setEmployees(Array.isArray(data) ? data : []))
      .catch(() => setEmployees([]))
      .finally(() => setLoadingEmps(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return employees;
    return employees.filter(e =>
      e.idnumber.toLowerCase().includes(q) ||
      e.firstname.toLowerCase().includes(q) ||
      e.lastname.toLowerCase().includes(q) ||
      e.department.toLowerCase().includes(q) ||
      e.line.toLowerCase().includes(q),
    );
  }, [employees, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function getPageRange(current: number, total: number): (number | '...')[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
    if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '...', current - 1, current, current + 1, '...', total];
  }

  async function handleUpload(file: File) {
    setPhase('checking');
    setUploadError('');
    setUploadPct(0);

    const csrf = getCsrfToken();
    const fd = new FormData();
    fd.append('file', file);

    try {
      // Short simulated checking delay so "Checking files…" is visible
      await new Promise(res => setTimeout(res, 600));

      setPhase('uploading');
      setUploadPct(0);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/timelogs/upload');
        xhr.setRequestHeader('X-CSRFToken', csrf);
        xhr.withCredentials = true;

        xhr.upload.onprogress = (e) => {
          // Scale upload-send progress to 0–80% so the bar is always visible
          if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 80));
        };

        xhr.onload = () => {
          setUploadPct(100);
          if (xhr.status === 200) {
            // Check if the server flagged validation errors
            const hasErrors = xhr.getResponseHeader('X-Validation-Errors') === 'true';
            if (hasErrors) {
              // Error workbook — trigger download then reject
              const blob = new Blob([xhr.response], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'timelogs_errors.xlsx';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              reject(new Error('Validation errors found. An error report has been downloaded.'));
            } else {
              resolve();
            }
          } else {
            let detail = 'Upload failed.';
            try { detail = JSON.parse(xhr.responseText)?.detail ?? detail; } catch { /* ignore */ }
            reject(new Error(detail));
          }
        };

        xhr.onerror = () => reject(new Error('Network error. Please try again.'));
        xhr.responseType = 'arraybuffer';
        xhr.send(fd);
      });

      // Success
      setPhase('done');
      toast.success('Timelogs uploaded successfully.', { title: 'Upload Complete' });
      setUploadOpen(false);
      setSelectedFile(null);
      setPhase('idle');
      // Refresh table
      setLoadingEmps(true);
      fetch('/api/timelogs/completeness', { credentials: 'include' })
        .then(r => r.ok ? r.json() : [])
        .then(data => setEmployees(Array.isArray(data) ? data : []))
        .catch(() => {})
        .finally(() => setLoadingEmps(false));

    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
      setPhase('idle');
    }
  }

  function handleDownloadTemplate() {
    const csrf = getCsrfToken();
    fetch('/api/timelogs/template', {
      credentials: 'include',
      headers: { 'X-CSRFToken': csrf },
    })
      .then(res => {
        if (!res.ok) return;
        return res.blob();
      })
      .then(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'timelogs_template.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      })
      .catch(() => {});
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      /* No onClick on backdrop — modal only closes via X */
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        layout
        className="w-full max-w-3xl rounded-2xl border border-[var(--color-border)]
          bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden flex flex-col
          min-h-[520px] max-h-[calc(100vh-4rem)]"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] shrink-0">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Timelogs</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="flex h-7 w-7 items-center justify-center rounded-full
              text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Search bar + Upload button ── */}
        <div className="px-6 py-3 border-[var(--color-border)] shrink-0 flex items-center gap-2">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Search by name, ID, department or line…" />
          </div>
          {!loadingEmps && employees.length > 0 && (
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium shrink-0
                border border-[var(--color-border-strong)] text-[var(--color-text-primary)]
                hover:bg-[var(--color-bg-card)] transition-colors"
            >
              <Upload size={13} />
              Upload
            </button>
          )}
        </div>

        {/* ── Table ── */}
        <div className="flex-1 overflow-y-auto [scrollbar-width:thin] px-4 pb-4">
          {loadingEmps ? (
            <div className="flex justify-center items-center py-16">
              <div className="h-5 w-5 rounded-full border-2 border-[#2845D6] border-t-transparent animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={search ? 'No results found' : 'No timelogs yet'}
              description={search ? 'Try a different search term.' : 'Upload a timelog file to see employee completeness.'}
              icons={[FileSpreadsheet, Clock, Upload]}
              action={!search ? { label: 'Upload', onClick: () => setUploadOpen(true), icon: <Upload size={13} /> } : undefined}
              className="py-16 mx-auto max-w-md"
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--color-bg-elevated)] z-10">
                <tr className="border-b border-[var(--color-border)]">
                  {['ID Number', 'Employee', 'Department', 'Line', 'Completeness'].map(h => (
                    <th
                      key={h}
                      className={cn(
                        'px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]',
                        h === 'Completeness' ? 'text-center' : 'text-left',
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                <AnimatePresence initial={false}>
                  {paginated.map((emp, idx) => {
                    const pct = Math.min(100, Math.max(0, emp.completeness));
                    const pctColor =
                      pct === 100 ? '#22c55e' :   // green
                      pct >= 70   ? '#2845D6' :   // blue
                      pct >= 40   ? '#f59e0b' :   // amber
                                    '#ef4444';    // red
                    return (
                      <motion.tr
                        key={emp.idnumber}
                        initial={{ opacity: 0, x: -14 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 14, transition: { duration: 0.14, ease: 'easeIn' } }}
                        transition={{ duration: 0.22, ease: 'easeOut', delay: idx * 0.03 }}
                        onClick={() => setSelectedEmp(emp)}
                        className="hover:bg-[var(--color-bg-card)] transition-colors cursor-pointer"
                        title={`View ${emp.firstname} ${emp.lastname}'s timelogs`}
                      >
                        <td className="px-4 py-2.5 text-xs text-[var(--color-text-primary)]">{emp.idnumber}</td>
                        <td className="px-4 py-2.5 text-xs text-[var(--color-text-primary)]">
                          {emp.lastname}, {emp.firstname}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-[var(--color-text-primary)]">{emp.department}</td>
                        <td className="px-4 py-2.5 text-xs text-[var(--color-text-primary)]">{emp.line}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="text-xs font-semibold tabular-nums" style={{ color: pctColor }}>
                            {pct}%
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination ── */}
        {!loadingEmps && filtered.length > PAGE_SIZE && (
          <div className="shrink-0 border-t border-[var(--color-border)] px-4 py-2.5 flex items-center justify-between gap-4">
            <span className="text-xs text-[var(--color-text-muted)] shrink-0">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <Pagination className="w-auto mx-0 justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className={page === 1 ? 'pointer-events-none opacity-40' : undefined}
                  />
                </PaginationItem>
                {getPageRange(page, totalPages).map((p, i) =>
                  p === '...' ? (
                    <PaginationItem key={`ellipsis-${i}`}><PaginationEllipsis /></PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink isActive={page === (p as number)} onClick={() => setPage(p as number)}>
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  )
                )}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className={page === totalPages ? 'pointer-events-none opacity-40' : undefined}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </motion.div>

      {/* ── User timelogs sub-modal ── */}
      <AnimatePresence>
        {selectedEmp && (
          <UserTimelogsModal
            employee={selectedEmp}
            onClose={() => setSelectedEmp(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Upload sub-modal ── */}
      <AnimatePresence>
        {uploadOpen && (          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="w-full max-w-sm rounded-2xl border border-[var(--color-border)]
                bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Upload Timelogs</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">.xlsx, .xls, or .csv</p>
                </div>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => { setUploadOpen(false); setUploadError(''); setSelectedFile(null); setPhase('idle'); setUploadPct(0); }}
                  className="flex h-7 w-7 items-center justify-center rounded-full
                    text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Hidden file input */}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) { setSelectedFile(f); setUploadError(''); }
                  }}
                />

                {/* Template alert */}
                <div className="flex items-start gap-2.5 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3">
                  <Info size={14} className="text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-green-800 dark:text-green-200 leading-relaxed">
                    Don&apos;t have a timelog template?{' '}
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="font-semibold hover:text-green-900 dark:hover:text-green-100 transition-colors inline-flex items-center gap-1"
                    >
                      Click here.
                    </button>
                    <br/> Strictly follow the format and the exact sequence of columns — do not add, remove, or reorder any column.
                  </p>
                </div>

                {/* Drop zone — shows file confirmation once selected */}
                {!selectedFile ? (
                  <div
                    onClick={() => !isBusy && fileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                    onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
                    onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
                    onDrop={e => {
                      e.preventDefault(); e.stopPropagation(); setIsDragging(false);
                      if (isBusy) return;
                      const f = e.dataTransfer.files?.[0];
                      if (f) { setSelectedFile(f); setUploadError(''); }
                    }}
                    className={cn(
                      'flex h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl',
                      'border-[3px] border-dashed transition-colors',
                      isBusy ? 'pointer-events-none opacity-60' : '',
                      isDragging
                        ? 'border-[#2845D6] bg-[#2845D6]/5'
                        : 'border-[var(--color-border-strong)] hover:border-[#2845D6]/50 hover:bg-[var(--color-bg-elevated)]',
                    )}
                  >
                    <div className="bg-transparent">
                      <FileSpreadsheet size={36} className={cn('transition-colors', isDragging ? 'text-[#2845D6]' : 'text-[var(--color-text-muted)]')} />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">Click to select or drag &amp; drop</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">.xlsx, .xls, or .csv</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-xl py-8
                    border-2 border-[#2845D6]/40 bg-[#2845D6]/5">
                    <div className="rounded-full bg-[var(--color-bg-card)] p-3 shadow-sm ring-1 ring-[#2845D6]/30">
                      <FileSpreadsheet size={22} className="text-[#2845D6]" />
                    </div>
                    <div className="flex items-center gap-2 max-w-[220px]">
                      <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">{selectedFile.name}</span>
                      {!isBusy && (
                        <button
                          type="button"
                          onClick={() => { setSelectedFile(null); setUploadError(''); if (fileRef.current) fileRef.current.value = ''; }}
                          className="shrink-0 rounded-full p-0.5 hover:bg-[var(--color-bg-card)] transition-colors"
                        >
                          <X size={14} className="text-[var(--color-text-muted)]" />
                        </button>
                      )}
                    </div>
                    {!isBusy && (
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="text-xs text-[#2845D6] hover:underline"
                      >
                        Change file
                      </button>
                    )}
                  </div>
                )}

                {/* Checking / progress feedback */}
                {phase === 'checking' && (
                  <p className="text-xs text-center text-[var(--color-text-muted)] animate-pulse">
                    Checking files…
                  </p>
                )}
                {phase === 'uploading' && (
                  <div className="space-y-1.5">
                    <div className="w-full h-2 rounded-full bg-[var(--color-border)] overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-[#2845D6]"
                        initial={{ width: '0%' }}
                        animate={{ width: `${uploadPct}%` }}
                        transition={{ ease: 'easeOut', duration: 0.4 }}
                      />
                    </div>
                    <p className="text-xs text-center text-[var(--color-text-muted)]">
                      Uploading… {uploadPct}%
                    </p>
                  </div>
                )}

                {uploadError && (
                  <p className="text-xs text-red-500 text-center" role="alert">{uploadError}</p>
                )}

                {/* Upload action */}
                <button
                  type="button"
                  onClick={() => selectedFile && handleUpload(selectedFile)}
                  disabled={isBusy || !selectedFile}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                    bg-[#2845D6] text-white text-sm font-semibold
                    hover:bg-[#1f38c0] disabled:opacity-50 transition-colors"
                >
                  {isBusy
                    ? <TextShimmer duration={1.2} className="text-sm font-semibold text-white [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">
                        {phase === 'checking' ? 'Checking…' : 'Uploading…'}
                      </TextShimmer>
                    : <><Upload size={14} />Upload File</>
                  }
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Scheduled Panel ────────────────────────────────────────────────────────────

function ScheduledPanel({
  selectedDate,
  events,
  onPrevDay,
  onNextDay,
  onNewEvent,
  onEventClick,
  isAdmin = false,
  isHr = false,
}: {
  selectedDate: Date;
  events: CalendarEvent[];
  onPrevDay: () => void;
  onNextDay: () => void;
  onNewEvent: () => void;
  onEventClick: (e: CalendarEvent) => void;
  isAdmin?: boolean;
  isHr?: boolean;
}) {
  const dateLabel = selectedDate.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const [timelogsOpen, setTimelogsOpen] = useState(false);

  // No start_time on backend — events displayed in the order they are provided

  return (
    <div className="flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-[var(--color-border)]">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-text-primary)]">Scheduled</h2>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-1">
          {isHr && (
            <button
              onClick={() => setTimelogsOpen(true)}
              title="Timelogs"
              className="flex h-7 w-7 items-center justify-center rounded-lg
                text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]
                hover:text-[#2845D6] transition-colors border border-[var(--color-border)]"
            >
              <Clock size={14} />
            </button>
          )}
          <button
            onClick={onNewEvent}
            title="Add event"
            className="flex h-7 w-7 items-center justify-center rounded-lg
              text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]
              hover:text-[#2845D6] transition-colors border border-[var(--color-border)]"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={onPrevDay}
            className="flex h-7 w-7 items-center justify-center rounded-lg
              text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={onNextDay}
            className="flex h-7 w-7 items-center justify-center rounded-lg
              text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {events.length === 0 ? (
          <EmptyState
            title="No events today"
            description="Your schedule is clear. Add an event to get started."
            icons={[CalendarDays, Calendar, Clock]}
            action={{
              label: 'New Event',
              onClick: onNewEvent,
              icon: <Plus size={14} />,
            }}
            className="flex-1 py-12"
          />
        ) : (
          <div className="py-3 px-3 flex flex-col gap-2">
            {events.map(ev => {
              const cfg = EVENT_TYPE_CONFIG[ev.event_type] ?? EVENT_TYPE_CONFIG.meeting;
              return (
                <div
                  key={ev.id}
                  className="w-full rounded-lg border border-[var(--color-border)]
                    bg-[var(--color-bg-elevated)] p-3
                    hover:shadow-md transition-all duration-150
                    hover:bg-[var(--color-bg)"
                >
                  {/* Top row: type badge + members avatar group */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium tabular-nums"
                      style={{ color: cfg.color }}>
                      <span
                        className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: cfg.color }}
                      />
                      {cfg.label}
                    </span>
                    {(() => {
                      const avatarItems = [
                        ...(ev.owner_detail ? [ev.owner_detail] : []),
                        ...(ev.members_detail ?? []).filter(m => m.id !== ev.owner_detail?.id),
                      ].map(m => ({
                        id: m.id,
                        name: memberName(m),
                        image: m.avatar ?? '/default-avatar.png',
                      }));
                      return avatarItems.length > 0 ? (
                        <AvatarGroup items={avatarItems} maxVisible={5} size="sm" />
                      ) : null;
                    })()}
                  </div>

                  {/* Title */}
                  <p className="text-sm font-bold text-[var(--color-text-primary)] leading-snug line-clamp-2 cursor-pointer mt-1.5"
                    onClick={() => onEventClick(ev)}>
                    {ev.title}
                  </p>

                  {/* Note */}
                  {ev.note && (
                    <p className="text-xs text-[var(--color-text-muted)] mt-1 line-clamp-2">
                      {ev.note}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Timelogs Modal ── */}
      <AnimatePresence>
        {timelogsOpen && (
          <TimelogsModal onClose={() => setTimelogsOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Calendar Page ──────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);

  const [viewDate,     setViewDate]     = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [events,       setEvents]       = useState<CalendarEvent[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [form,         setForm]         = useState<FormState>(defaultForm(toDateStr(today)));
  const [saving,       setSaving]       = useState(false);
  const [monthOpen,    setMonthOpen]    = useState(false);
  const [yearOpen,     setYearOpen]     = useState(false);
  const [isAdmin,      setIsAdmin]      = useState(false);
  const [isHr,         setIsHr]         = useState(false);
  const [isPrivileged, setIsPrivileged] = useState(false); // admin | hr | accounting
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [allUsers,     setAllUsers]     = useState<CalendarMember[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [timelogStatus, setTimelogStatus] = useState<TimelogStatusMap>({});

  const monthRef  = useRef<HTMLDivElement>(null);
  const yearRef   = useRef<HTMLDivElement>(null);
  const slideDir  = useRef<1 | -1>(1); // 1 = forward, -1 = backward

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // ── Fetch current user to determine admin status ───────────────────────────
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.admin) setIsAdmin(true);
        if (data?.hr)    setIsHr(true);
        const privileged = !!(data?.admin || data?.hr || data?.accounting);
        setIsPrivileged(privileged);
        if (data?.id) setCurrentUserId(data.id);
      })
      .catch(() => {});
  }, []);

  // ── Fetch timelog daily status ─────────────────────────────────────────────
  const fetchTimelogStatus = useCallback(async () => {
    if (isPrivileged) return;
    try {
      const res = await fetch(
        `/api/timelogs/daily-status?year=${year}&month=${month + 1}`,
        { credentials: 'include' },
      );
      if (res.ok) {
        const data = await res.json();
        setTimelogStatus(data ?? {});
      }
    } catch {
      // silently ignore — pills are non-critical
    }
  }, [year, month, isPrivileged]);

  useEffect(() => { fetchTimelogStatus(); }, [fetchTimelogStatus]);

  // ── Fetch users list when modal opens ──────────────────────────────────────
  useEffect(() => {
    if (!modalOpen) return;
    setUsersLoading(true);
    fetch('/api/auth/users', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setAllUsers(Array.isArray(data) ? data : []))
      .catch(() => setAllUsers([]))
      .finally(() => setUsersLoading(false));
  }, [modalOpen]);

  // ── Close dropdowns on outside click ──────────────────────────────────────
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (monthRef.current && !monthRef.current.contains(e.target as Node)) setMonthOpen(false);
      if (yearRef.current  && !yearRef.current.contains(e.target as Node))  setYearOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // ── Fetch events ───────────────────────────────────────────────────────────
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/calendar/events?year=${year}&month=${month + 1}`,
        { credentials: 'include' },
      );
      if (res.ok) {
        const data = await res.json();
        setEvents(Array.isArray(data) ? data : (data.results ?? []));
      }
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // ── Calendar cells ─────────────────────────────────────────────────────────
  const cells = useMemo(() => buildCells(year, month), [year, month]);

  const eventsForDate = useCallback(
    (date: Date) => events.filter(e => eventOccursOn(e, date)),
    [events],
  );

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goPrev = () => { slideDir.current = -1; setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)); };
  const goNext = () => { slideDir.current =  1; setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)); };

  function shiftSelectedDay(delta: number) {
    setSelectedDate(d => {
      const next = new Date(d.getTime() + delta * 86_400_000);
      // If next date falls outside current view-month, shift the calendar too
      if (next.getMonth() !== month || next.getFullYear() !== year) {
        setViewDate(new Date(next.getFullYear(), next.getMonth(), 1));
      }
      return next;
    });
  }

  // ── Modal helpers ──────────────────────────────────────────────────────────
  function openCreate(date: Date) {
    setEditingEvent(null);
    setForm({ ...defaultForm(toDateStr(date)), memberScope: isAdmin ? 'all' : 'selected' });
    setModalOpen(true);
  }

  function openEdit(ev: CalendarEvent) {
    // Block non-owners from opening the modal entirely
    if (currentUserId !== null && ev.owner !== currentUserId) return;
    setEditingEvent(ev);
    const hasMembers = ev.members && ev.members.length > 0;
    setForm({
      title:       ev.title,
      date:        ev.date,
      event_type:  ev.event_type,
      repetition:  (ev.repetition as RepetitionType) ?? 'once',
      start_time:  fmt5(ev.start_time ?? '09:00'),
      end_time:    fmt5(ev.end_time ?? '10:00'),
      note:        ev.note,
      memberScope: hasMembers ? 'selected' : (isAdmin ? 'all' : 'selected'),
      memberIds:   ev.members ?? [],
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    const csrf = getCsrfToken();

    // Determine members payload: 'all' = every fetched user, 'selected' = chosen IDs
    const membersPayload: number[] =
      form.memberScope === 'all'
        ? allUsers.map(u => u.id)
        : form.memberIds;

    const payload = {
      title:      form.title.trim(),
      date:       form.date,
      event_type: form.event_type,
      repetition: form.repetition,
      note:       form.note,
      members:    membersPayload,
    };
    try {
      if (editingEvent) {
        const res = await fetch(`/api/calendar/events/${editingEvent.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated: CalendarEvent = await res.json();
          setEvents(evts => evts.map(e => e.id === updated.id ? updated : e));
          setModalOpen(false);
        }
      } else {
        const res = await fetch('/api/calendar/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const created: CalendarEvent = await res.json();
          // Only add to state if it belongs to the currently viewed month
          if (
            created.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)
          ) {
            setEvents(evts => [...evts, created]);
          }
          setModalOpen(false);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingEvent) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/calendar/events/${editingEvent.id}`, {
        method: 'DELETE',
        headers: { 'X-CSRFToken': getCsrfToken() },
        credentials: 'include',
      });
      if (res.ok || res.status === 204) {
        setEvents(evts => evts.filter(e => e.id !== editingEvent.id));
        setModalOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const scheduledEvents = useMemo(
    () =>
      events
        .filter(e => eventOccursOn(e, selectedDate))
        .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '')),
    [events, selectedDate],
  );

  const yearOptions = useMemo(() => {
    const cy = today.getFullYear();
    return Array.from({ length: 10 }, (_, i) => cy - 3 + i);
  }, [today]);

  const todayStr    = toDateStr(today);
  const selectedStr = toDateStr(selectedDate);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6">
      {/*
        Two-column responsive layout:
        - mobile   (<640px)  → single column (calendar then scheduled below)
        - tablet   (<1024px) → single column (calendar then scheduled below)
        - desktop  (≥1024px) → side by side, calendar takes remaining space
      */}
      <div className="flex flex-col lg:flex-row gap-5 lg:items-start lg:h-[calc(100vh-var(--header-height)-3rem)]">

        {/* ── LEFT: Monthly Calendar ── */}
        <div className="flex-1 min-w-0 lg:h-full flex flex-col min-h-0">

          {/* Calendar nav header */}
          <div className="flex items-center justify-between mb-4 shrink-0">

            {/* Month dropdown */}
            <div className="flex items-center gap-1.5">
              <div ref={monthRef} className="relative">
                <button
                  onClick={() => { setMonthOpen(v => !v); setYearOpen(false); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold
                    text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)]
                    transition-colors border border-transparent hover:border-[var(--color-border)]"
                >
                  {MONTHS[month]}
                  <ChevronDown size={13} className="text-[var(--color-text-muted)]" />
                </button>
                <AnimatePresence>
                  {monthOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.96 }}
                      transition={{ duration: 0.1 }}
                      className="absolute top-full left-0 mt-1 z-30 w-40 rounded-xl
                        border border-[var(--color-border)] bg-[var(--color-bg-elevated)]
                        shadow-xl overflow-hidden py-1"
                    >
                      {MONTHS.map((m, i) => (
                        <button
                          key={m}
                          onClick={() => { slideDir.current = i >= month ? 1 : -1; setViewDate(new Date(year, i, 1)); setMonthOpen(false); }}
                          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--color-bg-card)]
                            transition-colors ${i === month ? 'text-[#2845D6] font-semibold' : 'text-[var(--color-text-primary)]'}`}
                        >
                          {m}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Year dropdown */}
              <div ref={yearRef} className="relative">
                <button
                  onClick={() => { setYearOpen(v => !v); setMonthOpen(false); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold
                    text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)]
                    transition-colors border border-transparent hover:border-[var(--color-border)]"
                >
                  {year}
                  <ChevronDown size={13} className="text-[var(--color-text-muted)]" />
                </button>
                <AnimatePresence>
                  {yearOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.96 }}
                      transition={{ duration: 0.1 }}
                      className="absolute top-full left-0 mt-1 z-30 w-24 rounded-xl
                        border border-[var(--color-border)] bg-[var(--color-bg-elevated)]
                        shadow-xl overflow-hidden py-1"
                    >
                      {yearOptions.map(y => (
                        <button
                          key={y}
                          onClick={() => { slideDir.current = y >= year ? 1 : -1; setViewDate(new Date(y, month, 1)); setYearOpen(false); }}
                          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--color-bg-card)]
                            transition-colors ${y === year ? 'text-[#2845D6] font-semibold' : 'text-[var(--color-text-primary)]'}`}
                        >
                          {y}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Prev / Next month arrows */}
            <div className="flex items-center gap-1">
              <button
                onClick={goPrev}
                className="flex h-8 w-8 items-center justify-center rounded-lg
                  text-[var(--color-text-muted)] border border-[var(--color-border)]
                  hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={goNext}
                className="flex h-8 w-8 items-center justify-center rounded-lg
                  text-[var(--color-text-muted)] border border-[var(--color-border)]
                  hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1 shrink-0">
            {WEEKDAYS_FULL.map((wd, i) => (
              <div key={wd} className="py-2 text-center">
                <span className="hidden sm:inline text-[11px] font-semibold tracking-wide text-[var(--color-text-muted)] uppercase">
                  {wd}
                </span>
                <span className="sm:hidden text-[11px] font-semibold tracking-wide text-[var(--color-text-muted)] uppercase">
                  {WEEKDAYS_SHORT[i]}
                </span>
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="flex-1 min-h-0 overflow-hidden relative">
          <AnimatePresence mode="wait" custom={slideDir.current}>
          <motion.div
            key={`${year}-${month}`}
            custom={slideDir.current}
            variants={{
              enter: (dir: number) => ({ x: dir * 48, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit:  (dir: number) => ({ x: dir * -48, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="grid grid-cols-7 gap-1 rounded-2xl h-full bg-[var(--color-bg)]"
          >
            {cells.map((cell, idx) => {
              const col = idx % 7;
              const rowIdx = Math.floor(idx / 7);
              const leftBorder = col !== 0 ? 'border-[var(--color-border)]' : '';
              const topBorder = rowIdx !== 0 ? 'border-[var(--color-border)]' : '';

              if (!cell.date) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className={`border border-[var(--color-border)] min-h-[88px] md:min-h-[104px] bg-[var(--color-bg)] opacity-30 rounded-2xl`}
                  />
                );
              }

              const dateStr   = toDateStr(cell.date);
              const isToday   = dateStr === todayStr;
              const isSelected = dateStr === selectedStr;
              const dayEvents = eventsForDate(cell.date);

              const cellBgClass = isSelected
                ? 'border-dashed border-2 rounded-2xl border-[var(--color-accent-mid)] bg-[var(--color-accent-mid)]/20'
                : isToday
                ? 'bg-[var(--color-bg-elevated)]'
                : 'bg-[var(--color-bg-elevated)] border border-[var(--color-border)]';

              const dayNumClass = isSelected
                ? 'text-[var(--color-text-primary)]'
                : isToday
                ? 'text-[var(--color-accent)] font-semibold'
                : 'text-[var(--color-text-muted)]';

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDate(cell.date!)}
                  className={`border border-[var(--color-border)] min-h-[88px] md:min-h-[104px] cursor-pointer p-1.5 pt-1.5
                    flex flex-col transition-colors duration-100 select-none rounded-lg hover:border-dashed hover:border-2 hover:rounded-2xl hover:border-[var(--color-accent-mid)] hover:bg-[var(--color-accent-mid)]/20 ${cellBgClass}`}>
                  {/* Day number */}
                  <div className="flex items-start justify-between mb-1">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full
                        text-xs font-bold transition-colors ${dayNumClass}`}
                    >
                      {cell.day}
                    </span>
                  {/* Quick-add button — visible on hover */}
                  <button
                    onClick={e => { e.stopPropagation(); openCreate(cell.date!); }}
                    className="opacity-0 hover:opacity-100 group-hover:opacity-100
                      flex h-5 w-5 items-center justify-center rounded-full
                      text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[#2845D6]
                      transition-all"
                    title="Add event"
                  >
                    <Plus size={11} />
                  </button>
                  </div>

                  {/* Events + timelog pill container */}
                  <div className="mt-auto flex flex-col gap-[2px] overflow-hidden">
                    {/* Timelog status pill — top of list, only for non-privileged users */}
                    {!isPrivileged && timelogStatus[dateStr] && (
                      <span
                        className={`self-start inline-block rounded-full px-[6px] py-[1px] text-[9px] font-semibold leading-tight text-white ${
                          timelogStatus[dateStr] === 'absent'
                            ? 'bg-[#F63049]'
                            : 'bg-[#F59E0B]'
                        }`}
                      >
                        {timelogStatus[dateStr] === 'absent'
                          ? 'Absent'
                          : timelogStatus[dateStr] === 'no_time_out'
                          ? 'No Time-out'
                          : 'No Time-in'}
                      </span>
                    )}
                    {dayEvents.slice(0, 2).map(ev => (
                      <EventChip
                        key={ev.id}
                        event={ev}
                        onClick={e => { e.stopPropagation(); openEdit(ev); }}
                      />
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="pl-[6px] text-[10px] text-[var(--color-text-muted)] leading-none">
                        +{dayEvents.length - 2}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </motion.div>
          </AnimatePresence>
          </div>

          {/* Loading indicator */}
          {loading && (
            <div className="flex justify-center pt-5">
              <div className="h-5 w-5 rounded-full border-2 border-[#2845D6] border-t-transparent animate-spin" />
            </div>
          )}
        </div>

        {/* ── RIGHT: Scheduled Panel ──
            On mobile/tablet: renders BELOW the calendar (flex-col default)
            On desktop (lg+): renders as a fixed-width side column
        */}
        <div className="w-full lg:w-[360px] xl:w-[420px] shrink-0 lg:h-full">
          <ScheduledPanel
            selectedDate={selectedDate}
            events={scheduledEvents}
            onPrevDay={() => shiftSelectedDay(-1)}
            onNextDay={() => shiftSelectedDay(1)}
            onNewEvent={() => openCreate(selectedDate)}
            onEventClick={openEdit}
            isAdmin={isAdmin}
            isHr={isHr}
          />
        </div>
      </div>

      {/* ── Event Modal ── */}
      <AnimatePresence>
        {modalOpen && (
          <EventModal
            event={editingEvent}
            form={form}
            setForm={setForm}
            onClose={() => setModalOpen(false)}
            onSave={handleSave}
            onDelete={editingEvent ? handleDelete : undefined}
            saving={saving}
            isAdmin={isAdmin}
            isOwner={editingEvent === null || currentUserId === null || editingEvent.owner === currentUserId}
            allUsers={allUsers}
            usersLoading={usersLoading}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

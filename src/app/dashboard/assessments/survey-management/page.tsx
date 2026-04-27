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
  BarChart2,
  Check,
  ClipboardList,
  Edit2,
  Eye,
  FileText,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AdminTableSection } from '@/components/ui/admin-table-section';
import type { DataTableColumn } from '@/components/ui/data-table';
import { StatusPill } from '@/components/ui/status-pill';
import { TextShimmer } from '@/components/ui/text-shimmer';
import ResponseProgress from '@/components/ui/progress-1';
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
import { LeaveRangePicker } from '@/components/ui/leave-range-picker';
import { ChoiceboxGroup } from '@/components/ui/choicebox-1';
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
  template_type?: string;
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

interface TemplateListItem {
  id: number;
  title: string;
  description: string;
  template_type: string;
  created_by_name: string;
  created_by_id: number | null;
  created_at: string;
  question_count: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
];

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'Leadership Alignment', label: 'Leadership Alignment' },
  { value: 'Engagement', label: 'Engagement' },
  { value: 'Effectiveness', label: 'Effectiveness' },
  { value: 'Experience', label: 'Experience' },
  { value: 'Onboarding', label: 'Onboarding' },
];

const STATUS_TRANSITIONS: Record<string, { label: string; next: string } | null> = {
  draft: { label: 'Activate', next: 'active' },
  active: { label: 'Close', next: 'closed' },
  closed: null,
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSurveyDuration(start: string | null, end: string | null): string {
  if (!start || !end) return '—';
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const sMonth = MONTH_NAMES[sm - 1];
  const eMonth = MONTH_NAMES[em - 1];
  if (sy === ey && sm === em && sd === ed) return `${sMonth} ${sd}, ${sy}`;
  if (sy === ey && sm === em) return `${sMonth} ${sd} - ${ed}, ${sy}`;
  if (sy === ey) return `${sMonth} ${String(sd).padStart(2, '0')} - ${eMonth} ${String(ed).padStart(2, '0')}, ${sy}`;
  return `${sMonth} ${String(sd).padStart(2, '0')}, ${sy} - ${eMonth} ${String(ed).padStart(2, '0')}, ${ey}`;
}

function surveyUserName(u: SurveyUser): string {
  return [u.firstname, u.lastname].filter(Boolean).join(' ') || u.idnumber;
}

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

// ── SurveyMemberPicker ────────────────────────────────────────────────────────

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
                <img src={u.avatar ?? '/default-avatar.png'} alt={name} className="w-7 h-7 rounded-full object-cover shrink-0" />
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
          <button type="button" onClick={() => onChange([])} className="text-[10px] text-red-500 hover:text-red-600 transition-colors">Clear all</button>
        </div>
      )}
    </div>
  );
}

// ── SurveysTab (promoted to full page) ───────────────────────────────────────

function SurveysPage({ user }: { user: UserData }) {
  const router = useRouter();
  const [rows, setRows] = useState<SurveyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [hasAnySurvey, setHasAnySurvey] = useState<boolean | null>(null);

  const [newSurveyOpen, setNewSurveyOpen] = useState(false);
  const [newSurveySaving, setNewSurveySaving] = useState(false);
  const [editSurveyId, setEditSurveyId] = useState<number | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<SurveyListItem | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [survTitle, setSurvTitle] = useState('');
  const [survStartDate, setSurvStartDate] = useState<Date | undefined>(undefined);
  const [survEndDate, setSurvEndDate] = useState<Date | undefined>(undefined);
  const [survIsAnonymous, setSurvIsAnonymous] = useState(false);
  const [survTemplateId, setSurvTemplateId] = useState('');
  const [survTemplateType, setSurvTemplateType] = useState('');
  const [survHasResponses, setSurvHasResponses] = useState(false);
  const [survTargetScope, setSurvTargetScope] = useState<'all' | 'selected'>('all');
  const [survMemberIds, setSurvMemberIds] = useState<number[]>([]);
  const [survErrors, setSurvErrors] = useState<Record<string, string>>({});
  const [modalTemplates, setModalTemplates] = useState<TemplateListItem[]>([]);
  const [allUsers, setAllUsers] = useState<SurveyUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRows = useCallback(async (
    p: number,
    q: string,
    status: string,
    category: string,
    sortBy: string,
    sortDirection: 'asc' | 'desc',
    isInitial = false,
    showSkeleton = false,
  ) => {
    const startTime = Date.now();
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
      if (category !== 'all') params.set('category', category);
      if (sortBy) params.set('sort_by', sortBy);
      if (sortDirection) params.set('sort_dir', sortDirection);
      const res = await fetch(`/api/survey/admin/surveys?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setRows(data.results as SurveyListItem[]);
      setTotalPages(data.pagination.total_pages);
      setTotalCount(data.pagination.total);
      if (!q && status === 'all') setHasAnySurvey(data.pagination.total > 0);
    } catch {
      toast.error('Could not load surveys.', { title: 'Error' });
    } finally {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 1000 - elapsed);
      if (remaining > 0) await new Promise<void>(r => setTimeout(r, remaining));
      setLoading(false);
      setTransitioning(false);
    }
  }, []);

  const triggerFetch = useCallback((
    p: number,
    q: string,
    status: string,
    category: string,
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
    debounceRef.current = setTimeout(() => fetchRows(p, q, status, category, sortBy, sortDirection, false, showSkeleton), 300);
  }, [fetchRows]);

  useEffect(() => {
    fetchRows(1, '', 'all', 'all', sortField, sortDir, true);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchRows, sortField, sortDir]);

  const fetchModalTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/survey/admin/templates?page=1', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setModalTemplates(data.results as TemplateListItem[]);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (
      editSurveyId !== null &&
      !survHasResponses &&
      !survTemplateId &&
      survTemplateType &&
      modalTemplates.length > 0
    ) {
      const match = modalTemplates.find(t => t.template_type === survTemplateType);
      if (match) {
        setSurvTemplateId(String(match.id));
      }
    }
  }, [editSurveyId, survHasResponses, survTemplateId, survTemplateType, modalTemplates]);

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
    setEditSurveyId(null);
    setSurvTitle('');
    setSurvStartDate(undefined);
    setSurvEndDate(undefined);
    setSurvIsAnonymous(false);
    setSurvTemplateId('');
    setSurvTemplateType('');
    setSurvHasResponses(false);
    setSurvTargetScope('all');
    setSurvMemberIds([]);
    setSurvErrors({});
    setNewSurveyOpen(true);
    fetchModalTemplates();
    fetchAllUsers();
  }

  async function openEditSurvey(row: SurveyListItem) {
    setEditSurveyId(row.id);
    setSurvTitle('');
    setSurvStartDate(undefined);
    setSurvEndDate(undefined);
    setSurvIsAnonymous(false);
    setSurvTemplateId('');
    setSurvTemplateType(row.template_type ?? '');
    setSurvHasResponses(false);
    setSurvTargetScope('all');
    setSurvMemberIds([]);
    setSurvErrors({});
    setNewSurveyOpen(true);
    fetchModalTemplates();
    fetchAllUsers();

    try {
      const res = await fetch(`/api/survey/admin/surveys/${row.id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Could not load survey details');
      const data = await res.json();
      setSurvTitle(data.title ?? '');
      setSurvStartDate(data.start_date ? new Date(data.start_date) : undefined);
      setSurvEndDate(data.end_date ? new Date(data.end_date) : undefined);
      setSurvIsAnonymous(Boolean(data.is_anonymous));
      setSurvTemplateType(data.template_type ?? '');
      setSurvHasResponses(Boolean(data.has_responses));
      setSurvTargetScope(data.target_type === 'specific_users' ? 'selected' : 'all');
      setSurvMemberIds(Array.isArray(data.target_user_ids) ? data.target_user_ids : []);
    } catch {
      toast.error('Could not load survey details.', { title: 'Error' });
      setNewSurveyOpen(false);
      setEditSurveyId(null);
    }
  }

  const isNewSurveyTitleEmpty = !survTitle.trim();
  const isNewSurveyTemplateEmpty = !survTemplateId && editSurveyId === null;
  const isNewSurveyTargetInvalid = survTargetScope === 'selected' && survMemberIds.length === 0;
  const isCreateSurveyDisabled = newSurveySaving || isNewSurveyTitleEmpty || !survStartDate || !survEndDate || isNewSurveyTemplateEmpty || isNewSurveyTargetInvalid;

  async function handleSaveSurvey() {
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
      };

      let res: Response;
      if (editSurveyId !== null) {
        res = await fetch(`/api/survey/admin/surveys/${editSurveyId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch('/api/survey/admin/surveys', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
          body: JSON.stringify({ ...body, status: 'draft', template_id: Number(survTemplateId) }),
        });
      }

      const start = Date.now();
      const raw = await res.json();
      const elapsed = Date.now() - start;
      if (!res.ok) {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw as Record<string, unknown>))
          fe[k] = Array.isArray(v) ? (v as string[])[0] : String(v);
        setSurvErrors(fe);
        return;
      }

      if (elapsed < 1000) await new Promise<void>(r => setTimeout(r, 1000 - elapsed));
      if (editSurveyId !== null) {
        toast.success('Survey updated.', { title: 'Saved' });
      } else {
        toast.success('Survey created.', { title: 'Created' });
        setHasAnySurvey(true);
      }
      setNewSurveyOpen(false);
      setEditSurveyId(null);
      await fetchRows(page, search, statusFilter, categoryFilter, sortField, sortDir, false, true);
    } finally {
      setNewSurveySaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteCandidate) return;
    setConfirmingDelete(true);
    setDeletingId(deleteCandidate.id);
    try {
      const res = await fetch(`/api/survey/admin/surveys/${deleteCandidate.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      if (res.status === 204) {
        toast.success('Survey deleted.', { title: 'Deleted' });
        await fetchRows(page, search, statusFilter, categoryFilter, sortField, sortDir, false, true);
      } else {
        const d = await res.json();
        toast.error(d.detail ?? 'Could not delete survey.', { title: 'Error' });
      }
    } catch {
      toast.error('Could not delete survey.', { title: 'Error' });
    } finally {
      setConfirmingDelete(false);
      setDeleteCandidate(null);
      setDeletingId(null);
    }
  }

  const getSurveyStatus = (row: SurveyListItem) => {
    const today = new Date();
    const start = row.start_date ? new Date(row.start_date) : null;
    const end = row.end_date ? new Date(row.end_date) : null;

    if (row.status === 'closed') return { status: 'closed', label: 'Closed' };
    if (start && today < start) return { status: 'scheduled', label: 'Scheduled' };
    if (end && today > end) return { status: 'closed', label: 'Closed' };
    if (start && end && today >= start && today <= end) return { status: 'active', label: 'Active' };
    if (start && !end && today >= start) return { status: 'active', label: 'Active' };
    if (row.status === 'draft') return { status: 'draft', label: 'Draft' };
    return { status: 'active', label: 'Active' };
  };

  const columns: DataTableColumn<SurveyListItem>[] = useMemo(() => [
    {
      key: 'title',
      label: 'Survey Title',
      sortField: 'title',
      render: row => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-xs leading-snug">{row.title}</span>
        </div>
      ),
    },
    {
      key: 'category',
      label: 'Survey Category',
      sortField: 'template_type',
      filterContent: (
        <FilterContentList
          options={CATEGORY_OPTIONS.filter(option => option.value !== 'all')}
          selected={categoryFilter}
          onSelect={value => {
            setCategoryFilter(value);
            setPage(1);
            triggerFetch(1, search, statusFilter, value, sortField, sortDir);
          }}
        />
      ),
      filterActive: categoryFilter !== 'all',
      render: row => (
        <span className="text-xs text-muted-foreground">
          {row.template_type || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortField: 'status',
      filterContent: (
        <FilterContentList
          options={STATUS_OPTIONS.filter(option => option.value !== 'all')}
          selected={statusFilter}
          onSelect={value => {
            setStatusFilter(value);
            setPage(1);
            triggerFetch(1, search, value, categoryFilter, sortField, sortDir);
          }}
        />
      ),
      filterActive: statusFilter !== 'all',
      render: row => {
        const status = getSurveyStatus(row);
        return <StatusPill status={status.status} label={status.label} />;
      },
    },
    {
      key: 'duration',
      label: 'Duration',
      render: row => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
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

        return (
          <div className="min-w-[110px]">
            <ResponseProgress completed={completed} total={total} />
          </div>
        );
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      headerAlign: 'center',
      thClassName: 'text-center',
      tdClassName: 'text-center',
      render: row => (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => router.push(`/dashboard/assessments/survey-management/${row.id}`)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
            title="View"
          >
            <Eye size={12} />
          </button>
          <button
            onClick={() => openEditSurvey(row)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
            title="Edit"
          >
            <Edit2 size={12} />
          </button>
          {row.status === 'draft' && (
            <button
              onClick={() => setDeleteCandidate(row)}
              disabled={deletingId === row.id}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-600 transition-colors"
              title="Delete"
            >
              {deletingId === row.id
                ? <Loader2 size={12} />
                : <Trash2 size={12} />}
            </button>
          )}
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [categoryFilter, statusFilter, sortField, sortDir, triggerFetch, deletingId]);

  const showHeaderButton = hasAnySurvey === true;

  return (
    <>
      <AdminTableSection<SurveyListItem>
        search={search}
        onSearchChange={q => {
          setSearch(q);
          setPage(1);
          triggerFetch(1, q, statusFilter, categoryFilter, sortField, sortDir, true);
        }}
        searchPlaceholder="Search surveys…"
        actions={showHeaderButton ? (
          <button
            onClick={openNewSurvey}
            className="flex items-center gap-1.5 rounded-md bg-[var(--btn-primary-bg,#2845D6)] px-4 py-2 text-xs font-normal text-white hover:opacity-90 transition-opacity whitespace-nowrap"
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
        sortField={sortField}
        sortDir={sortDir}
        onSort={field => {
          const nextDir = sortField === field ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc';
          setSortField(field);
          setSortDir(nextDir);
          setPage(1);
          fetchRows(1, search, statusFilter, categoryFilter, field, nextDir);
        }}
        page={page}
        totalPages={totalPages}
        pageSize={20}
        totalCount={totalCount}
        onPageChange={p => { setPage(p); fetchRows(p, search, statusFilter, categoryFilter, sortField, sortDir); }}
        emptyTitle="No surveys yet"
        emptyDescription="Create your first survey to start collecting responses."
        emptyIcons={[ClipboardList, FileText, BarChart2]}
        emptyAction={hasAnySurvey === false ? { label: 'New Survey', onClick: openNewSurvey, icon: <Plus className="size-4" /> } : undefined}
      />

      {/* New Survey Modal */}
      {deleteCandidate && (
        <ConfirmationModal
          title="Delete survey?"
          message={`Delete survey "${deleteCandidate.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={handleDelete}
          onCancel={() => setDeleteCandidate(null)}
          confirming={confirmingDelete}
        />
      )}

      <Modal open={newSurveyOpen} onOpenChange={open => {
          if (!newSurveySaving && !open) {
            setNewSurveyOpen(false);
            setEditSurveyId(null);
          }
        }}>
        <ModalContent className="max-w-lg">
          <ModalHeader>
            <ModalTitle>{editSurveyId !== null ? 'Edit Survey' : 'New Survey'}</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                  Survey Title {isNewSurveyTitleEmpty && <span className="text-red-500 normal-case tracking-normal">*</span>}
                </label>
                <Input value={survTitle} onChange={e => setSurvTitle(e.target.value)} maxLength={200} placeholder="Enter survey title…" className={cn(survErrors.title && 'border-destructive')} />
                {survErrors.title && <p className="text-xs text-destructive">{survErrors.title}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <LeaveRangePicker
                  dateStart={survStartDate}
                  dateEnd={survEndDate}
                  onDateStartChange={d => { setSurvStartDate(d); if (!d) setSurvEndDate(undefined); }}
                  onDateEndChange={setSurvEndDate}
                  errorStart={survErrors.start_date}
                  errorEnd={survErrors.end_date}
                  closeOnSelect={false}
                />
              </div>

              <BasicCheckbox checked={survIsAnonymous} onCheckedChange={setSurvIsAnonymous} label="Anonymous Response" className="justify-end" />

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                  Template {isNewSurveyTemplateEmpty && <span className="text-red-500 normal-case tracking-normal">*</span>}
                </label>
                {editSurveyId !== null && survHasResponses ? (
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2 text-sm text-[var(--color-text-muted)]">
                    {survTemplateType || 'No template available'}
                  </div>
                ) : (
                  <>
                    <Select value={survTemplateId} onValueChange={setSurvTemplateId}>
                      <SelectTrigger>
                        <SelectValue placeholder={survTemplateType || 'Select template'} />
                      </SelectTrigger>
                      <SelectContent>
                        {modalTemplates.map(t => (
                          <SelectItem key={t.id} value={String(t.id)}>{t.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {survErrors.template && <p className="text-xs text-destructive">{survErrors.template}</p>}
                  </>
                )}
              </div>

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
                  <ChoiceboxGroup.Item title="All Users" description="Survey sent to every employee" value="all" />
                  <ChoiceboxGroup.Item title="Specific Users" description="Manually pick target employees" value="selected" />
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
                      <SurveyMemberPicker value={survMemberIds} onChange={setSurvMemberIds} users={allUsers} loading={usersLoading} />
                      {survErrors.target && <p className="text-xs text-destructive mt-1">{survErrors.target}</p>}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <div className="flex justify-end">
              <button
                onClick={handleSaveSurvey}
                disabled={isCreateSurveyDisabled}
                className={cn(
                  'min-w-[130px] inline-flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all',
                  'bg-[var(--btn-primary-bg,#2845D6)] text-white',
                  isCreateSurveyDisabled && 'opacity-60 cursor-not-allowed',
                )}
              >
                <Plus className="size-4" />
                {newSurveySaving ? (
                  <TextShimmer duration={1.2} className="text-sm font-semibold text-white [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">
                    {editSurveyId !== null ? 'Saving…' : 'Creating…'}
                  </TextShimmer>
                ) : (editSurveyId !== null ? 'Save Changes' : 'Create Survey')}
              </button>
            </div>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SurveyManagementPage() {
  const router = useRouter();
  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');
  const [user, setUser] = useState<UserData | null>(null);

  useEffect(() => {
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

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2">Survey Management</h1>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Create and manage surveys and collect responses</p>
      </div>
      <div>
        <SurveysPage user={user} />
      </div>
    </div>
  );
}

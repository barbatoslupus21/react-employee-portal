'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  BarChart2,
  Calendar,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Download,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Users,
  X,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { StatusPill } from '@/components/ui/status-pill';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { EmptyState } from '@/components/ui/interactive-empty-state';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/modal';
import { HorizontalBarChart } from '@/components/ui/horizontal-bar-chart';
import { Rating } from '@/components/ui/rating';
import { AdminTableSection } from '@/components/ui/admin-table-section';
import type { DataTableColumn } from '@/components/ui/data-table';
import { toast } from '@/components/ui/toast';
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

interface QuestionOptionResult {
  option_id: number;
  option_text: string;
  count: number;
  percentage: number;
}

interface QuestionDistributionItem {
  value: number;
  count: number;
  percentage: number;
}

interface QuestionResult {
  question_id: number;
  question_text: string;
  question_type: string;
  total_responses: number;
  options?: QuestionOptionResult[];
  average?: number | null;
  distribution?: QuestionDistributionItem[];
  text_answers?: string[];
}

interface SurveyResultsData {
  survey_id: number;
  survey_title: string;
  survey_description: string;
  survey_status: string;
  start_date: string | null;
  end_date: string | null;
  is_anonymous: boolean;
  total_targeted: number;
  total_responses: number;
  completion_rate: number;
  last_response_at: string | null;
  avg_completion_seconds: number | null;
  questions: QuestionResult[];
}

interface IndividualResponse {
  id: number | string;
  response_id?: number | null;
  firstname: string;
  lastname: string;
  idnumber: string;
  submitted_at: string | null;
  is_complete: boolean;
  status?: 'Complete' | 'Partial' | 'Not started';
}

interface ResponseDetailAnswer {
  question_id: number;
  question_text: string;
  question_type: string;
  order: number;
  selected_options?: { id: number; text: string }[];
  other_text?: string;
  number_value?: number | null;
  text_value?: string;
}

interface ResponseDetail {
  id: number;
  respondent_name: string;
  idnumber: string;
  submitted_at: string | null;
  is_complete: boolean;
  answers: ResponseDetailAnswer[];
}

interface IndividualResponsePagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

interface IndividualResponsesData {
  results: IndividualResponse[];
  pagination: IndividualResponsePagination;
  is_anonymous: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const QUESTION_TYPE_LABELS: Record<string, string> = {
  single_choice: 'Single Choice',
  multiple_choice: 'Multiple Choice',
  dropdown: 'Dropdown',
  rating: 'Rating Scale',
  likert: 'Likert Scale',
  short_text: 'Short Text',
  long_text: 'Long Text',
  yes_no: 'Yes / No',
  number: 'Number',
  date: 'Date',
  linear_scale: 'Linear Scale',
};

const CHART_COLORS = ['#2845D6', '#0D1A63', '#6B7AE8', '#8B99F0', '#A8B3F4', '#C5CBF8'];
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

function formatDatetime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function getSurveyStatus(data: SurveyResultsData): { status: string; label: string } {
  const today = new Date();
  const start = data.start_date ? new Date(data.start_date) : null;
  const end = data.end_date ? new Date(data.end_date) : null;
  if (data.survey_status === 'closed') return { status: 'closed', label: 'Closed' };
  if (start && today < start) return { status: 'scheduled', label: 'Scheduled' };
  if (end && today > end) return { status: 'closed', label: 'Closed' };
  if (start && end && today >= start && today <= end) return { status: 'active', label: 'Active' };
  if (data.survey_status === 'draft') return { status: 'draft', label: 'Draft' };
  return { status: 'active', label: 'Active' };
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-lg bg-[var(--color-bg-card)]', className)} />
  );
}

function SummaryCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 space-y-2">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="h-7 w-16" />
          <SkeletonBlock className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

function QuestionSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 space-y-4">
      <SkeletonBlock className="h-4 w-3/4" />
      <SkeletonBlock className="h-3 w-20" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-6 w-full" />
        ))}
      </div>
    </div>
  );
}

function ResponseTableSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
      <div className="bg-[var(--color-bg-card)] border-b border-[var(--color-border)] px-4 py-3">
        <SkeletonBlock className="h-4 w-32" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-[var(--color-border)] last:border-0">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-4 w-20 ml-auto" />
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-6 w-16" />
          <SkeletonBlock className="h-7 w-20" />
        </div>
      ))}
    </div>
  );
}

// ── Summary Cards ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[var(--color-text-primary)] leading-none">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">{sub}</p>}
    </div>
  );
}

// ── Question Charts ───────────────────────────────────────────────────────────

const CHOICE_BASED_TYPES = new Set(['single_choice', 'multiple_choice', 'dropdown']);
const CHART_TYPES = new Set([...CHOICE_BASED_TYPES, 'yes_no', 'likert', 'linear_scale']);

function HorizontalBarQuestion({ q }: { q: QuestionResult }) {
  const chartData = (q.options ?? []).map(opt => ({
    name: opt.option_text,
    value: opt.percentage,
  }));

  if (chartData.length === 0) {
    return <p className="text-xs text-[var(--color-text-muted)] mt-3">No responses yet.</p>;
  }

  return (
    <div className="mt-3">
      <HorizontalBarChart data={chartData} />
    </div>
  );
}

function YesNoChart({ q }: { q: QuestionResult }) {
  const chartData = (q.options ?? []).map(opt => ({
    name: opt.option_text,
    value: opt.percentage,
  }));

  if (chartData.length === 0 || q.total_responses === 0) {
    return <p className="text-xs text-[var(--color-text-muted)] mt-3">No responses yet.</p>;
  }

  return (
    <div className="mt-3">
      <HorizontalBarChart data={chartData} />
    </div>
  );
}

/** Rating Scale — star-row summary (1…maxRating rows with count + percentage) */
function RatingStarSummary({ q }: { q: QuestionResult }) {
  const dist = q.distribution ?? [];
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(t);
  }, []);

  if (dist.length === 0) return <p className="text-xs text-[var(--color-text-muted)] mt-3">No responses yet.</p>;

  const sorted = [...dist].sort((a, b) => b.value - a.value);
  const totalResponses = q.total_responses || 1;
  const maxStars = Math.max(5, ...sorted.map(item => item.value));

  return (
    <div className="mt-4 space-y-3">
      {q.average !== null && q.average !== undefined && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl font-bold text-[var(--color-text-primary)] leading-none">
            {Number(q.average).toFixed(1)}
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">
            avg
          </span>
        </div>
      )}
      <div className="space-y-2">
        {sorted.map(item => {
          const pct = totalResponses > 0 ? Math.round((item.count / totalResponses) * 100) : (item.percentage ?? 0);
          return (
            <div key={item.value} className="flex items-center gap-2.5">
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs font-medium text-[var(--color-text-secondary)] w-4 text-right shrink-0">{item.value}</span>
                <Rating rating={item.value} maxRating={5} size="sm" showValue={false} />
              </div>
              <div className="flex-1 h-2 rounded-full bg-[var(--color-bg-card)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-yellow-400"
                  style={{
                    width: animated ? `${pct}%` : '0%',
                    transition: animated ? 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
                  }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-[10px] text-[var(--color-text-muted)]">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Linear Scale / Numeric — vertical bar chart */
function LinearScaleBarChart({ q }: { q: QuestionResult }) {
  const dist = q.distribution ?? [];
  if (dist.length === 0) return <p className="text-xs text-[var(--color-text-muted)] mt-3">No responses yet.</p>;
  const chartData = dist.map(d => ({ name: String(d.value), count: d.count }));
  const max = Math.max(1, ...dist.map(d => d.count));
  return (
    <div className="mt-3 space-y-1">
      {q.average !== null && q.average !== undefined && (
        <p className="text-xs text-[var(--color-text-muted)] mb-2">Average: <strong className="text-[var(--color-text-primary)]">{q.average}</strong></p>
      )}
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={chartData} margin={{ top: 0, right: 0, left: -32, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, max]} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Bar dataKey="count" fill="#2845D6" radius={[3, 3, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TextAnswersList({ q }: { q: QuestionResult }) {
  const [showAll, setShowAll] = useState(false);
  const answers = q.text_answers ?? [];
  const visible = showAll ? answers : answers.slice(0, 3);
  if (answers.length === 0) return <p className="text-xs text-[var(--color-text-muted)] mt-3">No text responses yet.</p>;
  return (
    <div className="mt-3 space-y-2">
      {visible.map((text, i) => (
        <div key={i} className="rounded-lg bg-[var(--color-bg-card)] px-3 py-2 text-xs text-[var(--color-text-primary)]">
          {text}
        </div>
      ))}
      {answers.length > 3 && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="flex items-center gap-1 text-xs text-[#2845D6] hover:underline mt-1"
        >
          {showAll ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all ({answers.length})</>}
        </button>
      )}
    </div>
  );
}

function InstructionBlock({ items }: { items: QuestionResult[] }) {
  return (
    <div className="rounded-xl bg-[var(--color-bg-subtle)] p-5">
      <div className="space-y-4">
        {items.map((item, index) => {
          if (item.question_type === 'section') {
            return (
              <div key={item.question_id} className="space-y-1">
                <p className="text-xs font-bold text-[var(--color-text-primary)] leading-snug">{item.question_text}</p>
              </div>
            );
          }

          if (item.question_type === 'statement') {
            return (
              <div key={item.question_id} className="space-y-1">
                <p className="text-xs italic text-[var(--color-text-primary)] leading-snug">“{item.question_text}”</p>
              </div>
            );
          }

          return (
            <div key={item.question_id} className="space-y-1">
              <p className="text-xs font-medium text-[var(--color-text-primary)] leading-snug">{item.question_text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuestionBlock({ q, index }: { q: QuestionResult; index: number }) {
  const typeLabel = QUESTION_TYPE_LABELS[q.question_type] ?? q.question_type;

  const renderBody = () => {
    if (q.total_responses === 0) {
      return <p className="text-xs text-[var(--color-text-muted)] mt-3">No responses yet.</p>;
    }
    switch (q.question_type) {
      case 'rating':
        return <RatingStarSummary q={q} />;
      case 'linear_scale':
        return <LinearScaleBarChart q={q} />;
      case 'likert':
      case 'single_choice':
      case 'multiple_choice':
      case 'yes_no':
        return <HorizontalBarQuestion q={q} />;
      default:
        return <p className="text-xs text-[var(--color-text-muted)] mt-3">No visualization for this question type.</p>;
    }
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#2845D6] mb-1">Q{index + 1}</p>
          <p className="text-xs font-medium text-[var(--color-text-primary)] leading-snug">{q.question_text}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="inline-flex rounded-full bg-[var(--color-bg-card)] border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">
            {typeLabel}
          </span>
          <span className="text-[10px] text-[var(--color-text-muted)]">{q.total_responses} response{q.total_responses !== 1 ? 's' : ''}</span>
        </div>
      </div>
      {renderBody()}
    </div>
  );
}

// ── Response Detail Modal ─────────────────────────────────────────────────────

function AnswerDisplay({ ans }: { ans: ResponseDetailAnswer }) {
  if (ans.selected_options !== undefined) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {ans.selected_options.length === 0
          ? <span className="text-xs text-[var(--color-text-muted)]">No answer</span>
          : ans.selected_options.map(o => (
            <span key={o.id} className="inline-flex items-center rounded-full bg-[#2845D6]/10 text-[#2845D6] px-2 py-0.5 text-xs font-medium">{o.text}</span>
          ))
        }
        {ans.other_text && (
          <span className="inline-flex items-center rounded-full bg-[var(--color-bg-card)] border border-[var(--color-border)] px-2 py-0.5 text-xs">
            Other: {ans.other_text}
          </span>
        )}
      </div>
    );
  }
  if (ans.number_value !== undefined && ans.number_value !== null) {
    return <span className="text-sm font-semibold text-[var(--color-text-primary)]">{ans.number_value}</span>;
  }
  if (ans.text_value !== undefined) {
    return <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">{ans.text_value || <span className="text-[var(--color-text-muted)]">No answer</span>}</p>;
  }
  return <span className="text-xs text-[var(--color-text-muted)]">No answer</span>;
}

function ResponseDetailModal({
  open,
  onClose,
  detail,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  detail: ResponseDetail | null;
  loading: boolean;
}) {
  return (
    <Modal open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <ModalContent className="max-w-lg max-h-[80vh] flex flex-col">
        <ModalHeader>
          <ModalTitle>
            {loading ? 'Loading…' : detail ? `Response — ${detail.respondent_name}` : 'Response Details'}
          </ModalTitle>
        </ModalHeader>
        <ModalBody className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center py-10">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#2845D6]" />
            </div>
          ) : !detail ? (
            <p className="text-sm text-[var(--color-text-muted)]">Could not load response.</p>
          ) : (
            <div className="space-y-1 mb-4">
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] mb-4">
                <span>Submitted: {formatDatetime(detail.submitted_at)}</span>
                <span>·</span>
                <span className={cn('font-semibold', detail.is_complete ? 'text-emerald-600' : 'text-amber-600')}>
                  {detail.is_complete ? 'Complete' : 'Partial'}
                </span>
              </div>
              <div className="space-y-4">
                {detail.answers.map((ans, i) => (
                  <div key={ans.question_id} className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-[#2845D6] uppercase tracking-wide">Q{i + 1}</p>
                    <p className="text-xs font-medium text-[var(--color-text-primary)]">{ans.question_text}</p>
                    <AnswerDisplay ans={ans} />
                    {i < detail.answers.length - 1 && (
                      <div className="border-b border-[var(--color-border)] pt-2" />
                    )}
                  </div>
                ))}
                {detail.answers.length === 0 && (
                  <p className="text-sm text-[var(--color-text-muted)]">No answers recorded.</p>
                )}
              </div>
            </div>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

// ── Individual Responses Table ─────────────────────────────────────────────────

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

function IndividualResponsesSection({
  surveyId,
  isAnonymous,
}: {
  surveyId: number;
  isAnonymous: boolean;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<IndividualResponsesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<ResponseDetail | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skeletonRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchResponses = useCallback(async (p: number, q: string, status: string, sf: string, sd: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), page_size: '10', sort: sf, dir: sd });
      if (q) params.set('search', q);
      if (status !== 'all') params.set('status', status);
      const res = await fetch(`/api/survey/admin/surveys/${surveyId}/responses?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      setData(await res.json() as IndividualResponsesData);
    } catch {
      toast.error('Could not load responses.', { title: 'Error' });
    } finally {
      setLoading(false);
    }
  }, [surveyId]);

  useEffect(() => {
    fetchResponses(1, '', 'all', 'name', 'asc');
  }, [fetchResponses]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (skeletonRef.current) clearTimeout(skeletonRef.current);
    };
  }, []);

  const startSkeleton = () => {
    setShowSkeleton(true);
    if (skeletonRef.current) clearTimeout(skeletonRef.current);
    skeletonRef.current = setTimeout(() => setShowSkeleton(false), 1000);
  };

  const triggerFetch = (p: number, q: string, status: string, sf: string, sd: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResponses(p, q, status, sf, sd), 300);
  };

  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(1);
    startSkeleton();
    triggerFetch(1, v, statusFilter, sortField, sortDir);
  };

  const handleStatusFilter = (v: string) => {
    setStatusFilter(v);
    setPage(1);
    startSkeleton();
    triggerFetch(1, search, v, sortField, sortDir);
  };

  const handleSort = (field: string) => {
    const newDir = field === sortField && sortDir === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDir(newDir);
    setPage(1);
    startSkeleton();
    triggerFetch(1, search, statusFilter, field, newDir);
  };

  async function openDetail(responseId: number) {
    setModalOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/survey/admin/responses/${responseId}`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      setDetail(await res.json() as ResponseDetail);
    } catch {
      toast.error('Could not load response details.', { title: 'Error' });
    } finally {
      setDetailLoading(false);
    }
  }

  const pagination = data?.pagination;
  const rows = data?.results ?? [];

  const columns: DataTableColumn<IndividualResponse>[] = [
    {
      key: 'idnumber',
      label: 'ID Number',
      sortField: 'idnumber',
      render: (row: IndividualResponse) => (
        <span className="text-xs font-mono text-[var(--color-text-muted)]">{row.idnumber}</span>
      ),
    },
    {
      key: 'name',
      label: 'Employee Name',
      sortField: 'name',
      render: (row: IndividualResponse) => isAnonymous
        ? <span className="text-xs italic text-[var(--color-text-muted)]">Anonymous</span>
        : (
          <span className="text-xs font-medium">
            {row.lastname ? `${row.lastname}, ${row.firstname}` : row.firstname}
          </span>
        ),
    },
    {
      key: 'submitted_at',
      label: 'Submitted Date',
      sortField: 'submitted_at',
      render: (row: IndividualResponse) => (
        <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">
          {row.submitted_at ? formatDate(row.submitted_at.split('T')[0]) : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortField: 'status',
      filterContent: (
        <FilterContentList
          options={[
            { value: 'complete', label: 'Complete' },
            { value: 'partial', label: 'Partial' },
            { value: 'not_started', label: 'Not Started' },
          ]}
          selected={statusFilter}
          onSelect={handleStatusFilter}
        />
      ),
      filterActive: statusFilter !== 'all',
      render: (row: IndividualResponse) => (
        <span className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
          row.status === 'Complete'
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
            : row.status === 'Partial'
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
              : 'bg-slate-100 text-slate-700 dark:bg-slate-950/30 dark:text-slate-300',
        )}>
          {row.status}
        </span>
      ),
    },
    {
      key: 'action',
      label: 'Action',
      render: (row: IndividualResponse) => row.response_id ? (
        <div className="group relative inline-flex">
          <button
            onClick={() => openDetail(row.response_id!)}
            className="inline-flex items-center justify-center rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[#2845D6]/10 hover:text-[#2845D6] transition-colors"
            aria-label="View response details"
          >
            <Eye size={14} />
          </button>
          <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-md bg-[var(--color-text-primary)] px-2 py-1 text-[10px] text-[var(--color-bg)] opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
            View Details
          </span>
        </div>
      ) : (
        <span className="text-[10px] text-[var(--color-text-muted)]">—</span>
      ),
      headerAlign: 'center',
      tdClassName: 'text-center',
    },
  ];

  return (
    <>
      <div className="space-y-3">
        <AdminTableSection<IndividualResponse>
          search={search}
          onSearchChange={handleSearch}
          searchPlaceholder={isAnonymous ? 'Search unavailable for anonymous surveys' : 'Search by name or ID…'}
          columns={columns}
          rows={rows}
          rowKey={row => row.id}
          loading={loading || showSkeleton}
          transitioning={false}
          skeletonRows={8}
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          page={page}
          totalPages={pagination?.total_pages ?? 1}
          pageSize={10}
          totalCount={pagination?.total ?? 0}
          onPageChange={p => { setPage(p); startSkeleton(); triggerFetch(p, search, statusFilter, sortField, sortDir); }}
          emptyTitle="No responses yet"
          emptyDescription="Once respondents submit answers, they will appear here."
          emptyIcons={[Users, ClipboardList, BarChart2]}
        />
      </div>

      <ResponseDetailModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setDetail(null); }}
        detail={detail}
        loading={detailLoading}
      />
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function SurveyViewContent({ surveyId, user }: { surveyId: number; user: UserData }) {
  const [results, setResults] = useState<SurveyResultsData | null>(null);
  const [loadingResults, setLoadingResults] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchResults = useCallback(async (silent = false) => {
    if (!silent) setLoadingResults(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`/api/survey/admin/surveys/${surveyId}/results`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      setResults(await res.json() as SurveyResultsData);
    } catch {
      if (!silent) toast.error('Could not load survey results.', { title: 'Error' });
    } finally {
      setLoadingResults(false);
      setRefreshing(false);
    }
  }, [surveyId]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // Auto-refresh every 60s for active surveys
  useEffect(() => {
    if (!results) return;
    const { status } = getSurveyStatus(results);
    if (status === 'active') {
      autoRefreshRef.current = setInterval(() => fetchResults(true), 60_000);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [results, fetchResults]);

  if (loadingResults) {
    return (
      <div className="space-y-6">
        <SummaryCardsSkeleton />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <QuestionSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <EmptyState
        title="Survey not found"
        description="This survey does not exist or you don't have access."
        icons={[ClipboardList, BarChart2, FileText]}
        className="py-20"
      />
    );
  }

  const statusInfo = getSurveyStatus(results);
  const isActive = statusInfo.status === 'active';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-[var(--color-text-primary)] leading-snug">{results.survey_title}</h1>
          {results.survey_description && (
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-relaxed">{results.survey_description}</p>
          )}
          {(results.start_date || results.end_date) && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)] mt-1">
              <span className="flex items-center gap-1">
                <Calendar size={11} />
                {formatDate(results.start_date)} – {formatDate(results.end_date)}
              </span>
              <StatusPill status={statusInfo.status} label={statusInfo.label} />
            </div>
          )}
        </div>
        <button
          onClick={() => window.open(`/api/survey/admin/surveys/${surveyId}/export`, '_blank')}
          className="flex items-center gap-1.5 rounded-md bg-[#2845D6] px-3 py-1.5 text-xs font-normal text-white shadow-sm shadow-[#2845D6]/20 hover:bg-[#1d3fae] transition-colors"
        >
          <Download size={13} />
          Export
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Responses"
          value={String(results.total_responses)}
          sub={`of ${results.total_targeted} targeted`}
        />
        <SummaryCard
          label="Completion Rate"
          value={`${results.completion_rate}%`}
          sub={`${results.total_responses} completed`}
        />
        <SummaryCard
          label="Avg Completion Time"
          value={formatDuration(results.avg_completion_seconds)}
          sub={results.avg_completion_seconds !== null ? 'per respondent' : 'Not tracked yet'}
        />
        <SummaryCard
          label="Last Response"
          value={results.last_response_at ? formatDatetime(results.last_response_at).split(',')[0] : '—'}
          sub={results.last_response_at ? formatDatetime(results.last_response_at) : 'No submissions yet'}
        />
      </div>

      {/* Per-Question Summaries */}
      {results.total_responses > 0 && results.questions.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Question Summaries</h2>
          {(() => {
            const instructionTypes = new Set(['section', 'subsection', 'statement']);
            const visibleQuestionTypes = new Set(['single_choice', 'multiple_choice', 'yes_no', 'rating', 'likert', 'linear_scale']);
            const summaryElements: React.ReactNode[] = [];
            let instructionGroup: QuestionResult[] = [];
            let questionIndex = 0;

            const flushInstructionGroup = () => {
              if (instructionGroup.length > 0) {
                summaryElements.push(
                  <InstructionBlock key={`instruction-${instructionGroup[0].question_id}`} items={instructionGroup} />
                );
                instructionGroup = [];
              }
            };

            for (const q of results.questions) {
              if (instructionTypes.has(q.question_type)) {
                instructionGroup.push(q);
              } else if (visibleQuestionTypes.has(q.question_type)) {
                flushInstructionGroup();
                summaryElements.push(<QuestionBlock key={q.question_id} q={q} index={questionIndex} />);
                questionIndex += 1;
              }
              // other types (short_text, long_text, dropdown, number, date) are intentionally skipped
            }

            flushInstructionGroup();

            const leftCount = Math.ceil(summaryElements.length / 2);
            const leftItems = summaryElements.slice(0, leftCount);
            const rightItems = summaryElements.slice(leftCount);

            return (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="flex flex-col gap-4">
                  {leftItems}
                </div>
                <div className="flex flex-col gap-4">
                  {rightItems}
                </div>
              </div>
            );
          })()}
        </section>
      )}

      {/* Individual Responses */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Employee Responses</h2>
        <IndividualResponsesSection surveyId={surveyId} isAnonymous={results.is_anonymous} />
      </section>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SurveyViewPage() {
  const router = useRouter();
  const params = useParams();
  const surveyId = Number(params?.id);
  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');
  const [user, setUser] = useState<UserData | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setAuthPhase('checking'), 350);
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => { if (!r.ok) { router.push('/'); return null; } return r.json(); })
      .then((u: UserData | null) => {
        clearTimeout(timer);
        if (!u) { router.push('/'); return; }
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

  if (!user || !surveyId) return null;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* Back navigation */}
      <div>
        <button
          onClick={() => router.push('/dashboard/assessments/survey-management')}
          className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors mb-4"
        >
          <ArrowLeft size={13} />
          Back to Survey Management
        </button>
      </div>
      <SurveyViewContent surveyId={surveyId} user={user} />
    </div>
  );
}

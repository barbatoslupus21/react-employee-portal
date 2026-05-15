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
  Users,
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
}

interface QuestionOptionResult {
  option_id: number | null;
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

interface TrainingResultsData {
  training_id: number;
  training_title: string;
  training_date: string;
  training_status: 'scheduled' | 'active' | 'closed';
  speaker: string;
  objective: string | null;
  total_participants: number;
  total_responses: number;
  completion_rate: number;
  last_response_at: string | null;
  questions: QuestionResult[];
}

interface IndividualResponse {
  submission_id: number;
  idnumber: string;
  firstname: string;
  lastname: string;
  submitted_at: string | null;
}

interface ResponseDetailAnswer {
  question_id: number;
  question_text: string;
  question_type: string;
  order: number;
  selected_options?: { id: number; text: string }[] | null;
  other_text?: string | null;
  number_value?: number | null;
  text_value?: string | null;
}

interface ResponseDetail {
  submission_id: number;
  respondent_name: string;
  idnumber: string;
  submitted_at: string | null;
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

function getTrainingStatus(dateStr: string): { status: string; label: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const td = new Date(dateStr + 'T00:00:00');
  if (td > today) return { status: 'scheduled', label: 'Scheduled' };
  if (td.getTime() === today.getTime()) return { status: 'active', label: 'Active' };
  return { status: 'closed', label: 'Closed' };
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
          <span className="text-xs text-[var(--color-text-muted)]">avg</span>
        </div>
      )}
      <div className="space-y-2">
        {sorted.map(item => {
          const pct = totalResponses > 0 ? Math.round((item.count / totalResponses) * 100) : (item.percentage ?? 0);
          return (
            <div key={item.value} className="flex items-center gap-2.5">
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs font-medium text-[var(--color-text-secondary)] w-4 text-right shrink-0">{item.value}</span>
                <Rating rating={item.value} maxRating={maxStars} size="sm" showValue={false} />
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

function LinearScaleBarChart({ q }: { q: QuestionResult }) {
  const dist = q.distribution ?? [];
  if (dist.length === 0) return <p className="text-xs text-[var(--color-text-muted)] mt-3">No responses yet.</p>;
  const chartData = dist.map(d => ({ name: String(d.value), count: d.count }));
  const max = Math.max(1, ...dist.map(d => d.count));
  return (
    <div className="mt-3 space-y-1">
      {q.average !== null && q.average !== undefined && (
        <p className="text-xs text-[var(--color-text-muted)] mb-2">
          Average: <strong className="text-[var(--color-text-primary)]">{q.average}</strong>
        </p>
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
        {items.map((item) => {
          if (item.question_type === 'section') {
            return (
              <div key={item.question_id}>
                <p className="text-xs font-bold text-[var(--color-text-primary)] leading-snug">{item.question_text}</p>
              </div>
            );
          }
          if (item.question_type === 'statement') {
            return (
              <div key={item.question_id}>
                <p className="text-xs italic text-[var(--color-text-primary)] leading-snug">"{item.question_text}"</p>
              </div>
            );
          }
          return (
            <div key={item.question_id}>
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
        return <TextAnswersList q={q} />;
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
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {q.total_responses} response{q.total_responses !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      {renderBody()}
    </div>
  );
}

// ── Response Detail Modal ─────────────────────────────────────────────────────

function AnswerDisplay({ ans }: { ans: ResponseDetailAnswer }) {
  if (ans.selected_options !== undefined && ans.selected_options !== null) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {ans.selected_options.length === 0
          ? <span className="text-xs text-[var(--color-text-muted)]">No answer</span>
          : ans.selected_options.map(o => (
            <span key={o.id} className="inline-flex items-center rounded-full bg-[#2845D6]/10 text-[#2845D6] px-2 py-0.5 text-xs font-medium">
              {o.text}
            </span>
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
  if (ans.text_value !== undefined && ans.text_value !== null) {
    return (
      <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">
        {ans.text_value || <span className="text-[var(--color-text-muted)]">No answer</span>}
      </p>
    );
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

// ── Individual Responses Section ──────────────────────────────────────────────

function IndividualResponsesSection({ trainingId }: { trainingId: number }) {
  const [search, setSearch] = useState('');
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

  const fetchResponses = useCallback(async (p: number, q: string, sf: string, sd: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), page_size: '10', sort: sf, dir: sd });
      if (q) params.set('search', q);
      const res = await fetch(`/api/training/admin/${trainingId}/responses?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      setData(await res.json() as IndividualResponsesData);
    } catch {
      toast.error('Could not load responses.', { title: 'Error' });
    } finally {
      setLoading(false);
    }
  }, [trainingId]);

  useEffect(() => {
    fetchResponses(1, '', 'name', 'asc');
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
    skeletonRef.current = setTimeout(() => setShowSkeleton(false), 500);
  };

  const triggerFetch = (p: number, q: string, sf: string, sd: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResponses(p, q, sf, sd), 300);
  };

  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(1);
    startSkeleton();
    triggerFetch(1, v, sortField, sortDir);
  };

  const handleSort = (field: string) => {
    const newDir = field === sortField && sortDir === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDir(newDir);
    setPage(1);
    startSkeleton();
    triggerFetch(1, search, field, newDir);
  };

  async function openDetail(submissionId: number) {
    setModalOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/training/admin/responses/${submissionId}`, { credentials: 'include' });
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
        <span className="text-xs text-normal text-[var(--color-text-secondary)] whitespace-nowrap">{row.idnumber}</span>
      ),
    },
    {
      key: 'name',
      label: 'Employee Name',
      sortField: 'name',
      render: (row: IndividualResponse) => (
        <span className="text-xs text-normal text-[var(--color-text-secondary)] whitespace-nowrap">
          {row.lastname ? `${row.lastname}, ${row.firstname}` : row.firstname}
        </span>
      ),
    },
    {
      key: 'submitted_at',
      label: 'Submitted Date',
      sortField: 'submitted_at',
      render: (row: IndividualResponse) => (
        <span className="text-xs text-normal text-[var(--color-text-secondary)] whitespace-nowrap">
          {row.submitted_at ? formatDate(row.submitted_at.split('T')[0]) : '—'}
        </span>
      ),
    },
    {
      key: 'action',
      label: 'Action',
      headerAlign: 'center',
      tdClassName: 'text-center',
      render: (row: IndividualResponse) => (
        <div className="group relative">
          <button
            onClick={() => openDetail(row.submission_id)}
            className="inline-flex items-center justify-center rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[#2845D6]/10 hover:text-[#2845D6] transition-colors"
            aria-label="View response details"
          >
            <Eye size={14} />
          </button>
          <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-md bg-[var(--color-text-primary)] px-2 py-1 text-[10px] text-[var(--color-bg)] opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
            View Details
          </span>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="space-y-3">
        <AdminTableSection<IndividualResponse>
          search={search}
          onSearchChange={handleSearch}
          searchPlaceholder="Search by name or ID…"
          columns={columns}
          rows={rows}
          rowKey={row => row.submission_id}
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
          onPageChange={p => { setPage(p); startSkeleton(); triggerFetch(p, search, sortField, sortDir); }}
          emptyTitle="No responses yet"
          emptyDescription="Once participants submit their evaluations, they will appear here."
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

// ── Main Content ──────────────────────────────────────────────────────────────

function TrainingViewContent({ trainingId, user }: { trainingId: number; user: UserData }) {
  const [results, setResults] = useState<TrainingResultsData | null>(null);
  const [loadingResults, setLoadingResults] = useState(true);

  const fetchResults = useCallback(async () => {
    setLoadingResults(true);
    try {
      const res = await fetch(`/api/training/admin/${trainingId}/results`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      setResults(await res.json() as TrainingResultsData);
    } catch {
      toast.error('Could not load training results.', { title: 'Error' });
    } finally {
      setLoadingResults(false);
    }
  }, [trainingId]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

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
        title="Training not found"
        description="This training does not exist or you don't have access."
        icons={[ClipboardList, BarChart2, FileText]}
        className="py-20"
      />
    );
  }

  const statusInfo = getTrainingStatus(results.training_date);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-[var(--color-text-primary)] leading-snug">{results.training_title}</h1>
          {results.speaker && (
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Speaker: {results.speaker}</p>
          )}
          {results.objective && (
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-relaxed">{results.objective}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)] mt-1.5">
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              {formatDate(results.training_date)}
            </span>
            <StatusPill status={statusInfo.status} label={statusInfo.label} />
          </div>
        </div>
        <button
          onClick={() => window.open(`/api/training/admin/${trainingId}/export`, '_blank')}
          className="flex items-center gap-1.5 rounded-md bg-[#2845D6] px-3 py-1.5 text-xs font-normal text-white shadow-sm shadow-[#2845D6]/20 hover:bg-[#1d3fae] transition-colors"
        >
          <Download size={13} />
          Export
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Participants"
          value={String(results.total_participants)}
          sub="enrolled in training"
        />
        <SummaryCard
          label="Total Responses"
          value={String(results.total_responses)}
          sub={`of ${results.total_participants} participants`}
        />
        <SummaryCard
          label="Completion Rate"
          value={`${results.completion_rate}%`}
          sub={`${results.total_responses} completed`}
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
            const visibleQuestionTypes = new Set([
              'single_choice', 'multiple_choice', 'yes_no', 'rating', 'likert', 'linear_scale',
            ]);
            const summaryElements: React.ReactNode[] = [];
            let instructionGroup: QuestionResult[] = [];
            let questionIndex = 0;

            const flushInstructionGroup = () => {
              if (instructionGroup.length > 0) {
                summaryElements.push(
                  <InstructionBlock
                    key={`instruction-${instructionGroup[0].question_id}`}
                    items={instructionGroup}
                  />
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
              // short_text, long_text, dropdown, number, date skipped from charts
            }

            flushInstructionGroup();

            if (summaryElements.length === 0) return null;

            const leftCount = Math.ceil(summaryElements.length / 2);
            const leftItems = summaryElements.slice(0, leftCount);
            const rightItems = summaryElements.slice(leftCount);

            return (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="flex flex-col gap-4">{leftItems}</div>
                <div className="flex flex-col gap-4">{rightItems}</div>
              </div>
            );
          })()}
        </section>
      )}

      {/* Individual Responses */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Employee Responses</h2>
        <IndividualResponsesSection trainingId={trainingId} />
      </section>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TrainingViewPage() {
  const router = useRouter();
  const params = useParams();
  const trainingId = Number(params?.id);
  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');
  const [user, setUser] = useState<UserData | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setAuthPhase('checking'), 350);
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => { if (!r.ok) { router.push('/'); return null; } return r.json(); })
      .then((u: UserData | null) => {
        clearTimeout(timer);
        if (!u) { router.push('/'); return; }
        const hasAccess = u.admin || u.hr;
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

  if (!user || !trainingId) return null;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      <div>
        <button
          onClick={() => router.push('/dashboard/assessments/training-evaluation')}
          className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors mb-4"
        >
          <ArrowLeft size={13} />
          Back to Training Evaluation
        </button>
      </div>
      <TrainingViewContent trainingId={trainingId} user={user} />
    </div>
  );
}

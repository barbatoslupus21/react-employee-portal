'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, MessageSquare, Star, Users } from 'lucide-react';

import { AdminTableSection } from '@/components/ui/admin-table-section';
import { FilterListContent } from '@/components/ui/admin-table-accordion';
import type { DataTableColumn } from '@/components/ui/data-table';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/modal';
import { Rating } from '@/components/ui/rating';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

type FeedbackRecord = {
  id: number;
  employee_name: string;
  department: string | null;
  rating: number;
  feedback_text: string;
  submitted_at: string;
};

type FeedbackResponse = {
  results: FeedbackRecord[];
  count: number;
  page: number;
  page_size: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatSubmittedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof body.detail === 'string' ? body.detail : 'Request failed.';
    throw new Error(msg);
  }
  return body as T;
}

const RATING_FILTER_OPTIONS = [
  { value: '1', label: '1 Star' },
  { value: '2', label: '2 Stars' },
  { value: '3', label: '3 Stars' },
  { value: '4', label: '4 Stars' },
  { value: '5', label: '5 Stars' },
];

const PAGE_SIZE = 20;
const SKELETON_MIN_MS = 1000;

const tableIconBtnCls =
  'flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors';

// ── Page ───────────────────────────────────────────────────────────────────────

export default function FeedbackAdminPage() {
  const router = useRouter();

  // auth
  const [ready, setReady] = useState(false);

  // table state
  const [records, setRecords] = useState<FeedbackRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState('submitted_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const loadGenRef = useRef(0);

  // view modal
  const [viewRecord, setViewRecord] = useState<FeedbackRecord | null>(null);

  const debouncedSearch = useDebounce(search, 350);

  // ── Auth check ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) { router.replace('/'); return; }
        const data = (await res.json()) as { admin: boolean };
        if (!data.admin) { router.replace('/dashboard'); return; }
        setReady(true);
      } catch {
        router.replace('/');
      }
    };
    void check();
  }, [router]);

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchRecords = useCallback(async (opts: {
    page: number;
    sortField: string;
    sortDir: 'asc' | 'desc';
    search: string;
    rating: string;
    isInitial: boolean;
  }) => {
    const gen = ++loadGenRef.current;
    const start = Date.now();

    if (opts.isInitial) {
      setLoading(true);
    } else {
      setTransitioning(true);
    }

    try {
      const params = new URLSearchParams({
        page: String(opts.page),
        page_size: String(PAGE_SIZE),
        sort: opts.sortField,
        dir: opts.sortDir,
      });
      if (opts.search) params.set('search', opts.search);
      if (opts.rating) params.set('rating', opts.rating);

      const data = await apiFetch<FeedbackResponse>(`/api/feedback/records?${params.toString()}`);

      if (gen !== loadGenRef.current) return;

      // Enforce 1-second minimum skeleton on initial load
      if (opts.isInitial) {
        const elapsed = Date.now() - start;
        if (elapsed < SKELETON_MIN_MS) {
          await new Promise((r) => setTimeout(r, SKELETON_MIN_MS - elapsed));
        }
        if (gen !== loadGenRef.current) return;
      }

      setRecords(data.results);
      setTotalCount(data.count);
    } catch {
      if (gen !== loadGenRef.current) return;
      setRecords([]);
      setTotalCount(0);
    } finally {
      if (gen === loadGenRef.current) {
        setLoading(false);
        setTransitioning(false);
      }
    }
  }, []);

  // Initial fetch after auth
  useEffect(() => {
    if (!ready) return;
    void fetchRecords({ page, sortField, sortDir, search: debouncedSearch, rating: ratingFilter, isInitial: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Re-fetch on filter/sort/page changes (non-initial)
  useEffect(() => {
    if (!ready) return;
    void fetchRecords({ page, sortField, sortDir, search: debouncedSearch, rating: ratingFilter, isInitial: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortField, sortDir, debouncedSearch, ratingFilter]);

  const handleSort = (field: string) => {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(1);
  };

  const handleSearchChange = (v: string) => {
    setSearch(v);
    setPage(1);
  };

  const handleRatingChange = (v: string) => {
    setRatingFilter(v);
    setPage(1);
  };

  // ── Columns ──────────────────────────────────────────────────────────────────

  const columns: DataTableColumn<FeedbackRecord>[] = [
    {
      key: 'employee_name',
      label: 'Employee Name',
      sortField: 'employee_name',
      render: (row) => (
        <span className="text-xs font-medium text-[var(--color-text-primary)]">
          {row.employee_name}
        </span>
      ),
    },
    {
      key: 'department',
      label: 'Department',
      sortField: 'department',
      render: (row) => (
        <span className="text-xs text-[var(--color-text-muted)]">
          {row.department ?? '—'}
        </span>
      ),
    },
    {
      key: 'rating',
      label: 'Rating',
      sortField: 'rating',
      filterActive: Boolean(ratingFilter),
      filterContent: (
        <FilterListContent
          options={RATING_FILTER_OPTIONS}
          value={ratingFilter}
          onChange={handleRatingChange}
          allLabel="All Ratings"
        />
      ),
      thClassName: 'text-center',
      tdClassName: 'text-center',
      render: (row) => (
        <div className="flex justify-center">
          <Rating rating={row.rating} showValue={false} size="sm" />
        </div>
      ),
    },
    {
      key: 'feedback_text',
      label: 'Feedback',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span
            className="max-w-[260px] truncate text-xs text-[var(--color-text-muted)]"
            title={row.feedback_text || undefined}
          >
            {row.feedback_text || <span className="italic opacity-50">No text</span>}
          </span>
          {row.feedback_text && (
            <button
              type="button"
              className={tableIconBtnCls}
              onClick={() => setViewRecord(row)}
              title="View full feedback"
            >
              <Eye size={13} />
            </button>
          )}
        </div>
      ),
    },
    {
      key: 'submitted_at',
      label: 'Submitted At',
      sortField: 'submitted_at',
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-[var(--color-text-muted)]">
          {formatSubmittedAt(row.submitted_at)}
        </span>
      ),
    },
  ];

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  if (!ready) return null;

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Feedback</h1>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          View all employee feedback submissions.
        </p>
      </div>

      <AdminTableSection<FeedbackRecord>
        search={search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search by employee name…"
        columns={columns}
        rows={records}
        rowKey={(r) => r.id}
        loading={loading}
        transitioning={transitioning}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        totalPages={totalPages}
        pageSize={PAGE_SIZE}
        totalCount={totalCount}
        onPageChange={(p) => setPage(p)}
        emptyTitle="No feedback yet"
        emptyDescription="Submitted feedback records will appear here."
        emptyIcons={[MessageSquare, Star, Users]}
      />

      {/* View full feedback modal */}
      <Modal
        open={Boolean(viewRecord)}
        onOpenChange={(open) => { if (!open) setViewRecord(null); }}
        mobileVariant="dialog"
      >
        <ModalContent className="max-w-md">
          <ModalHeader>
            <ModalTitle>
              {viewRecord?.employee_name ?? 'Feedback'}
            </ModalTitle>
          </ModalHeader>
          <ModalBody className="py-4">
            {viewRecord && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Rating rating={viewRecord.rating} showValue={false} size="sm" />
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {viewRecord.rating} / 5
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">
                  {viewRecord.feedback_text}
                </p>
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  {formatSubmittedAt(viewRecord.submitted_at)}
                </p>
              </div>
            )}
          </ModalBody>
          <ModalFooter className="flex justify-end">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2 text-xs font-normal text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]"
              onClick={() => setViewRecord(null)}
            >
              Close
            </button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

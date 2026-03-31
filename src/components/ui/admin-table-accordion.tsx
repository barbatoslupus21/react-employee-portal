'use client';

/**
 * AdminTableAccordion — Reusable accordion data-table component.
 *
 * Exports
 * ───────
 *  FilterOption            – { value: string; label: string }
 *  FilterListContent       – Single-select radio filter panel (use inside column.filterContent)
 *  FilterMultiListContent  – Multi-select checkbox filter panel (use inside column.filterContent)
 *  AdminTableColumn<TRow>  – Per-column configuration interface
 *  AdminTableAccordionProps<TRow>
 *  AdminTableAccordion<TRow> – Main component
 *
 * Usage
 * ─────
 *  <AdminTableAccordion
 *    columns={cols}
 *    rows={rows}
 *    rowKey={r => r.id}
 *    loading={loading}
 *    sortField={sortField}
 *    sortDir={sortDir}
 *    onSort={handleSort}
 *    page={page}
 *    totalPages={totalPages}
 *    totalCount={totalCount}
 *    onPageChange={setPage}
 *    renderExpandedContent={row => <MyExpandedPanel row={row} />}
 *    emptyTitle="No records found"
 *    emptyDescription="…"
 *    emptyIcons={[Wallet, Receipt, DollarSign]}
 *  />
 */

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  ListFilter,
} from 'lucide-react';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EmptyState } from '@/components/ui/interactive-empty-state';
import { cn } from '@/lib/utils';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

const ACCORDION_EASE = [0.04, 0.62, 0.23, 0.98] as const;
const ACCORDION_DURATION = 0.32;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * Per-column configuration.
 * Set `sortField` to enable the clickable sort button on that column header.
 * Set `filterContent` (typically <FilterListContent> or <FilterMultiListContent>)
 * to show a filter popover icon on the right side of the header.
 */
export interface AdminTableColumn<TRow> {
  /** Stable React key. */
  key: string;
  /** Header label text. */
  label: string;
  /**
   * Backend sort field name. When provided, the header renders as a sort button.
   * When omitted, the header is plain text.
   */
  sortField?: string;
  /** Filter popover content. Rendered inside a <Popover> trigger on the right side of the header. */
  filterContent?: React.ReactNode;
  /** Whether the filter is currently active (highlights the filter icon in blue). */
  filterActive?: boolean;
  /** Extra className applied to the `<th>` element. */
  thClassName?: string;
  /** Extra className applied to the `<td>` element. */
  tdClassName?: string;
  /** Optional fixed width (e.g. '120px' or 120). Applied via inline style. */
  width?: string | number;
  /** Renders the cell content for a given row. */
  render: (row: TRow) => React.ReactNode;
}

// ── FilterListContent ─────────────────────────────────────────────────────────
// Single-select radio-style filter panel. Use as the `filterContent` prop of a column.

export function FilterListContent({
  options,
  value,
  onChange,
  allLabel = 'All',
}: {
  options: FilterOption[];
  value: string;
  onChange: (v: string) => void;
  allLabel?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  function checkScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 4);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }

  useEffect(() => {
    const id = setTimeout(checkScroll, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  return (
    <div className="relative">
      {canScrollUp && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center bg-gradient-to-b from-[var(--color-bg-elevated)] pb-3 pt-0.5">
          <ChevronUp size={12} className="text-[var(--color-text-muted)]" />
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="max-h-52 space-y-0.5 overflow-y-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* "All" / clear option */}
        <button
          type="button"
          onClick={() => onChange('')}
          className={cn(
            'w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors',
            !value
              ? 'bg-[#2845D6]/10 font-medium text-[#2845D6]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]',
          )}
        >
          {allLabel}
        </button>

        {options.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors',
              value === o.value
                ? 'bg-[#2845D6]/10 font-medium text-[#2845D6]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {canScrollDown && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center bg-gradient-to-t from-[var(--color-bg-elevated)] pb-0.5 pt-3">
          <ChevronDown size={12} className="text-[var(--color-text-muted)]" />
        </div>
      )}
    </div>
  );
}

// ── FilterMultiListContent ────────────────────────────────────────────────────
// Multi-select checkbox filter panel with optional search input.

export function FilterMultiListContent({
  options,
  selected,
  onChange,
  withSearch = false,
  searchPlaceholder = 'Search…',
}: {
  options: FilterOption[];
  selected: string[];
  onChange: (vals: string[]) => void;
  withSearch?: boolean;
  searchPlaceholder?: string;
}) {
  const [innerSearch, setInnerSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  function checkScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 4);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }

  useEffect(() => {
    const id = setTimeout(checkScroll, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const visible =
    withSearch && innerSearch.trim()
      ? options.filter(o => o.label.toLowerCase().includes(innerSearch.toLowerCase()))
      : options;

  function toggle(val: string) {
    if (selected.includes(val)) onChange(selected.filter(v => v !== val));
    else onChange([...selected, val]);
  }

  return (
    <>
      {withSearch && (
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={innerSearch}
          onChange={e => {
            setInnerSearch(e.target.value);
            setTimeout(checkScroll, 0);
          }}
          className="mb-1.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[#2845D6]/40"
        />
      )}

      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="mb-1 w-full rounded-md px-2 py-1 text-left text-[10px] font-medium text-[#2845D6] transition-colors hover:bg-[#2845D6]/10"
        >
          Clear all ({selected.length})
        </button>
      )}

      <div className="relative">
        {canScrollUp && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center bg-gradient-to-b from-[var(--color-bg-elevated)] pb-3 pt-0.5">
            <ChevronUp size={12} className="text-[var(--color-text-muted)]" />
          </div>
        )}

        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="max-h-52 space-y-0.5 overflow-y-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {visible.length === 0 ? (
            <p className="px-2 py-2 text-xs text-[var(--color-text-muted)]">No options.</p>
          ) : (
            visible.map(o => {
              const checked = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                    checked
                      ? 'bg-[#2845D6]/10 font-medium text-[#2845D6]'
                      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors',
                      checked ? 'border-[#2845D6] bg-[#2845D6] text-white' : 'border-[var(--color-border)]',
                    )}
                  >
                    {checked && (
                      <svg viewBox="0 0 10 8" className="h-2 w-2 fill-none stroke-current" aria-hidden="true">
                        <path d="M1 4l3 3 5-6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })
          )}
        </div>

        {canScrollDown && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center bg-gradient-to-t from-[var(--color-bg-elevated)] pb-0.5 pt-3">
            <ChevronDown size={12} className="text-[var(--color-text-muted)]" />
          </div>
        )}
      </div>
    </>
  );
}

// ── Internal: SortIcon ────────────────────────────────────────────────────────

function SortIcon({
  field,
  current,
  dir,
  disabled,
}: {
  field: string;
  current: string;
  dir: 'asc' | 'desc';
  disabled?: boolean;
}) {
  if (disabled)
    return <ChevronsUpDown size={11} className="shrink-0 text-[var(--color-text-muted)] opacity-20" />;
  if (field !== current)
    return <ChevronsUpDown size={11} className="shrink-0 text-[var(--color-text-muted)] opacity-40" />;
  return dir === 'asc' ? (
    <ChevronUp size={11} className="shrink-0 text-[#2845D6]" />
  ) : (
    <ChevronDown size={11} className="shrink-0 text-[#2845D6]" />
  );
}

// ── Internal: ColHeader ───────────────────────────────────────────────────────

function ColHeader<TRow>({
  col,
  currentSortField,
  sortDir,
  onSort,
  hasData,
}: {
  col: AdminTableColumn<TRow>;
  currentSortField: string;
  sortDir: 'asc' | 'desc';
  onSort: (f: string) => void;
  hasData: boolean;
}) {
  const sortable = Boolean(col.sortField);

  const labelNode = sortable ? (
    <button
      type="button"
      onClick={() => { if (hasData && col.sortField) onSort(col.sortField); }}
      disabled={!hasData}
      className={cn(
        'flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition-colors',
        hasData
          ? 'cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
          : 'cursor-default text-[var(--color-text-muted)] opacity-40',
      )}
    >
      {col.label}
      <SortIcon field={col.sortField!} current={currentSortField} dir={sortDir} disabled={!hasData} />
    </button>
  ) : (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
      {col.label}
    </span>
  );

  return (
    <th
      className={cn('px-4 py-2.5 text-left', col.thClassName)}
      style={{ width: col.width }}
    >
      <div className="flex items-center justify-between gap-1">
        {labelNode}

        {col.filterContent && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                title={`Filter by ${col.label}`}
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors',
                  col.filterActive
                    ? 'text-[#2845D6]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]',
                )}
              >
                <ListFilter size={10} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-2">
              {col.filterContent}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </th>
  );
}

// ── Internal: SkeletonRows ────────────────────────────────────────────────────

// Widths cycle for visual variety across skeleton cells.
const SKELETON_WIDTHS = [80, 144, 112, 96, 80, 120, 64, 100];

function SkeletonRows({ cols, count = PAGE_SIZE }: { cols: number; count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, ri) => (
        <tr key={ri} className="border-b border-[var(--color-border)]">
          {Array.from({ length: cols }).map((_, ci) => (
            <td key={ci} className="px-4 py-3.5">
              <div
                className="h-3 animate-pulse rounded-full bg-[var(--color-skeleton)]"
                style={{ width: SKELETON_WIDTHS[(ri + ci) % SKELETON_WIDTHS.length] }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── Internal: PaginationBar ───────────────────────────────────────────────────

function getPageRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
  if (current >= total - 3)
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}

function PaginationBar({
  page,
  totalPages,
  totalCount,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const from = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <div className="flex flex-nowrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-3">
      <span className="whitespace-nowrap text-xs text-[var(--color-text-muted)]">
        Showing {from}–{to} of {totalCount}
      </span>

      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
            />
          </PaginationItem>

          {getPageRange(page, totalPages).map((p, i) => (
            <PaginationItem key={`${p}-${i}`}>
              {p === '...' ? (
                <PaginationEllipsis />
              ) : (
                <PaginationLink isActive={p === page} onClick={() => onPageChange(p as number)}>
                  {p}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}

          <PaginationItem>
            <PaginationNext
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

// ── Internal: AccordionRow ────────────────────────────────────────────────────

function AccordionRow<TRow>({
  row,
  keyVal,
  columns,
  isExpanded,
  onToggle,
  renderExpandedContent,
}: {
  row: TRow;
  keyVal: string;
  columns: AdminTableColumn<TRow>[];
  isExpanded: boolean;
  onToggle: () => void;
  renderExpandedContent: (row: TRow) => React.ReactNode;
}) {
  const colSpan = columns.length + 1; // +1 for the chevron column

  return (
    <React.Fragment>
      <tr
        onClick={onToggle}
        className={cn(
          'cursor-pointer select-none border-b border-[var(--color-border)] transition-colors',
          isExpanded
            ? 'bg-[var(--color-bg-elevated)]'
            : 'hover:bg-[var(--color-bg-elevated)]',
        )}
      >
        {columns.map(col => (
          <td
            key={col.key}
            style={{ width: col.width }}
            className={cn('break-words px-4 py-3.5', col.tdClassName)}
          >
            {col.render(row)}
          </td>
        ))}
        {/* Chevron indicator */}
        <td className="w-10 px-4 py-3.5 text-[var(--color-text-muted)]">
          {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </td>
      </tr>

      <AnimatePresence>
        {isExpanded && (
          <tr key={`${keyVal}-expanded`}>
            <td colSpan={colSpan} className="p-0">
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: ACCORDION_DURATION, ease: ACCORDION_EASE }}
                className="overflow-hidden border-t border-[var(--color-border)] bg-[var(--color-bg)]"
              >
                {renderExpandedContent(row)}
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </React.Fragment>
  );
}

// ── AdminTableAccordion ───────────────────────────────────────────────────────

export interface AdminTableAccordionProps<TRow> {
  /** Column definitions. */
  columns: AdminTableColumn<TRow>[];
  /** Current page of rows to display. */
  rows: TRow[];
  /** Returns a stable unique string key for a row (used as React key and expand-state key). */
  rowKey: (row: TRow) => string;

  // Loading ──────────────────────────────────────────────────────────────────
  /**
   * When true, renders animated skeleton rows instead of data.
   * The table wrapper also fades to 60% opacity to signal a transition.
   */
  loading: boolean;

  // Sorting (server-side — parent manages state & fetching) ──────────────────
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSort: (field: string) => void;

  // Pagination (server-side — parent manages state & fetching) ───────────────
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (p: number) => void;

  // Accordion ────────────────────────────────────────────────────────────────
  /** Returns the expanded panel content for a given row. */
  renderExpandedContent: (row: TRow) => React.ReactNode;
  /**
   * Changing this value collapses all expanded rows.
   * Useful for resetting accordion state when the dataset changes (e.g. after
   * applying a new search/filter).
   */
  resetKey?: number | string;

  // Empty state ──────────────────────────────────────────────────────────────
  emptyTitle: string;
  emptyDescription?: string;
  /** Ideally 3 Lucide icon components. */
  emptyIcons?: LucideIcon[];

  /** Extra className applied to the outermost wrapper. */
  className?: string;
}

export function AdminTableAccordion<TRow>({
  columns,
  rows,
  rowKey,
  loading,
  sortField,
  sortDir,
  onSort,
  page,
  totalPages,
  totalCount,
  onPageChange,
  renderExpandedContent,
  resetKey,
  emptyTitle,
  emptyDescription,
  emptyIcons,
  className,
}: AdminTableAccordionProps<TRow>) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const prevResetKey = useRef(resetKey);

  // Collapse all rows whenever resetKey changes.
  useEffect(() => {
    if (prevResetKey.current !== resetKey) {
      prevResetKey.current = resetKey;
      setExpandedKeys(new Set());
    }
  }, [resetKey]);

  function toggle(key: string) {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const hasData = !loading && rows.length > 0;
  const totalCols = columns.length + 1; // data columns + chevron

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]',
        className,
      )}
    >
      {/* Table wrapper — dims during loading/transitioning */}
      <div
        className="overflow-x-auto transition-opacity duration-200"
        style={{ opacity: loading ? 0.6 : 1 }}
      >
        <table className="w-full table-fixed border-collapse text-sm">
          {/* ── Head ── */}
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              {columns.map(col => (
                <ColHeader
                  key={col.key}
                  col={col}
                  currentSortField={sortField}
                  sortDir={sortDir}
                  onSort={onSort}
                  hasData={hasData}
                />
              ))}
              {/* Chevron column — no header label */}
              <th className="px-4 py-2.5" style={{ width: 52 }} />
            </tr>
          </thead>

          {/* ── Body ── */}
          <tbody>
            {loading ? (
              <SkeletonRows cols={totalCols} count={PAGE_SIZE} />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={totalCols} className="py-12">
                  <EmptyState
                    title={emptyTitle}
                    description={emptyDescription}
                    icons={emptyIcons}
                    className="mx-auto max-w-sm"
                  />
                </td>
              </tr>
            ) : (
              rows.map(row => {
                const key = rowKey(row);
                return (
                  <AccordionRow
                    key={key}
                    row={row}
                    keyVal={key}
                    columns={columns}
                    isExpanded={expandedKeys.has(key)}
                    onToggle={() => toggle(key)}
                    renderExpandedContent={renderExpandedContent}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination — only rendered when totalPages > 1 ── */}
      <PaginationBar
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        onPageChange={onPageChange}
      />
    </div>
  );
}

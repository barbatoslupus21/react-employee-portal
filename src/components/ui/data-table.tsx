'use client';

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ListFilter } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui/interactive-empty-state';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DataTableColumn<TRow> {
  /** Unique key for this column (used as React key). */
  key: string;
  /** Header label text. */
  label: string;
  /**
   * Backend sort field name. When provided, the column header renders as a
   * clickable sort button. When omitted the header is plain text.
   */
  sortField?: string;
  /** Optional filter popover content rendered next to the header label. */
  filterContent?: React.ReactNode;
  /** Whether the filter is currently active (highlights the filter icon). */
  filterActive?: boolean;
  /** Extra className applied to the `<th>` element. */
  thClassName?: string;
  /** Extra className applied to the `<td>` element. */
  tdClassName?: string;
  /** Optional fixed width for the column (e.g. '120px'). Applied via inline style. */
  width?: string | number;
  /**
   * Alignment of the header text when no sortField is provided.
   * Defaults to 'left'.
   */
  headerAlign?: 'left' | 'center' | 'right';
  /** Renders the cell content for a given row. */
  render: (row: TRow) => React.ReactNode;
}

export interface DataTableProps<TRow> {
  columns: DataTableColumn<TRow>[];
  rows: TRow[];
  /** Returns a stable unique key for a row (used as React key). */
  rowKey: (row: TRow) => string | number;
  /**
   * When true, shows animated skeleton rows instead of row data.
   * Use this for initial loads and filter/search-triggered fetches.
   */
  loading: boolean;
  /**
   * When true, shows a translucent overlay over existing rows while
   * new data is being fetched (e.g. sort/pagination changes).
   * Has no effect when loading is also true.
   */
  transitioning?: boolean;
  /** Number of skeleton rows to render while loading. Default: 8. */
  skeletonRows?: number;
  /** Currently active sort field. */
  sortField: string;
  /** Currently active sort direction. */
  sortDir: 'asc' | 'desc';
  /** Called when the user clicks a sortable column header. */
  onSort: (field: string) => void;
  /** Title shown in the empty state when rows is empty and loading is false. */
  emptyTitle: string;
  /** Description shown below the empty-state title. */
  emptyDescription: string;
  /** Icons shown in the empty-state illustration (ideally 3 Lucide icons). */
  emptyIcons?: LucideIcon[];
  /** Optional action button shown in the empty state. */
  emptyAction?: {
    label:   string;
    onClick: () => void;
    icon?:   React.ReactNode;
  };
  /** Current page number (1-based). */
  page: number;
  /** Total number of pages. */
  totalPages: number;
  /** Current page size (number of items per page). */
  pageSize: number;
  /** Total number of rows in current filtered dataset. */
  totalCount: number;
  /** Called when the user requests a different page. */
  onPageChange: (p: number) => void;
  /** Extra className applied to the outermost wrapper div. */
  className?: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function getPageRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
  if (current >= total - 3)
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}

// ── Internal sub-components ───────────────────────────────────────────────────

function SortIcon({
  field,
  current,
  dir,
  disabled,
}: {
  field: string;
  current: string;
  dir: 'asc' | 'desc';
  disabled: boolean;
}) {
  if (disabled)
    return (
      <ChevronsUpDown
        size={11}
        className="shrink-0 text-[var(--color-text-muted)] opacity-20"
      />
    );
  if (field !== current)
    return (
      <ChevronsUpDown
        size={11}
        className="shrink-0 text-[var(--color-text-muted)] opacity-40"
      />
    );
  return dir === 'asc' ? (
    <ChevronUp size={11} className="shrink-0 text-[#2845D6]" />
  ) : (
    <ChevronDown size={11} className="shrink-0 text-[#2845D6]" />
  );
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-[var(--color-border)]">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div
            className="h-3 animate-pulse rounded-full bg-[var(--color-skeleton)]"
            style={{ width: 40 + (i * 17 % 80) }}
          />
        </td>
      ))}
    </tr>
  );
}

function ColHeader({
  label,
  field,
  sortField,
  sortDir,
  onSort,
  hasData,
  filterContent,
  filterActive,
  width,
  className,
}: {
  label: string;
  field: string;
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSort: (f: string) => void;
  hasData: boolean;
  filterContent?: React.ReactNode;
  filterActive?: boolean;
  width?: string | number;
  className?: string;
}) {
  return (
    <th style={{ width }} className={cn('px-4 py-2.5 text-left', className)}>
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => { if (hasData) onSort(field); }}
          disabled={!hasData}
          className={cn(
            'flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition-colors',
            hasData
              ? 'cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
              : 'cursor-default text-[var(--color-text-muted)] opacity-40',
          )}
        >
          {label}
          <SortIcon field={field} current={sortField} dir={sortDir} disabled={!hasData} />
        </button>

        {filterContent && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                title={`Filter by ${label}`}
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors',
                  filterActive
                    ? 'text-[#2845D6]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]',
                )}
              >
                <ListFilter size={10} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-2">
              {filterContent}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </th>
  );
}

// ── DataTable ─────────────────────────────────────────────────────────────────

export function DataTable<TRow>({
  columns,
  rows,
  rowKey,
  loading,
  transitioning = false,
  skeletonRows = 8,
  sortField,
  sortDir,
  onSort,
  emptyTitle,
  emptyDescription,
  emptyIcons,
  emptyAction,
  page,
  totalPages,
  pageSize,
  totalCount,
  onPageChange,
  className,
}: DataTableProps<TRow>) {
  const colCount = columns.length;
  // Sort buttons are only active when data is visible (not during skeleton load).
  const hasData = !loading && rows.length > 0;

  return (
    <div className={cn('relative', className)}>
      {/* Translucent overlay during sort/pagination transitions */}
      <AnimatePresence>
        {transitioning && !loading && (
          <motion.div
            key="dt-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-0 z-10 rounded-2xl bg-[var(--color-bg-elevated)]/60"
          />
        )}
      </AnimatePresence>

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]">

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-xs max-[480px]:table-auto max-[480px]:w-auto max-[480px]:min-w-[580px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                {columns.map(col =>
                  col.sortField ? (
                    <ColHeader
                      key={col.key}
                      label={col.label}
                      field={col.sortField}
                      sortField={sortField}
                      sortDir={sortDir}
                      onSort={onSort}
                      hasData={hasData}
                      filterContent={col.filterContent}
                      filterActive={col.filterActive}
                      width={col.width}
                      className={col.thClassName}
                    />
                  ) : (
                    <th
                      key={col.key}
                      style={{ width: col.width }}
                      className={cn('px-4 py-2.5 break-words', col.thClassName)}
                    >
                      <div
                        className={cn(
                          'flex items-center gap-1',
                          col.filterContent
                            ? 'justify-between'
                            : col.headerAlign === 'center'
                              ? 'justify-center'
                              : col.headerAlign === 'right'
                                ? 'justify-end'
                                : 'justify-start',
                        )}
                      >
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                          {col.label}
                        </span>
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
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: skeletonRows }).map((_, i) => (
                  <SkeletonRow key={i} cols={colCount} />
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="py-4">
                    <EmptyState
                      title={emptyTitle}
                      description={emptyDescription}
                      icons={emptyIcons}
                      action={emptyAction}
                      className="mx-auto max-w-sm py-12"
                    />
                  </td>
                </tr>
              ) : (
                rows.map(row => (
                  <tr
                    key={rowKey(row)}
                    className="border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-card)]"
                  >
                    {columns.map(col => (
                      <td
                        key={col.key}
                        style={{ width: col.width }}
                        className={cn('px-4 py-3 break-words', col.tdClassName)}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex justify-between border-t border-[var(--color-border)] px-5 py-3">
          <div className="flex items-center text-xs text-[var(--color-text-muted)]">
            Showing {totalCount === 0 ? 0 : (page - 1) * pageSize + 1}
            –{Math.min(page * pageSize, totalCount)} of {totalCount}
          </div>
          <div>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                    aria-disabled={page === 1}
                    className={cn(page === 1 && 'pointer-events-none opacity-40')}
                  />
                </PaginationItem>
                {getPageRange(page, totalPages).map((p, i) =>
                  p === '...' ? (
                    <PaginationItem key={`ell-${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink
                        isActive={page === p}
                        onClick={() => onPageChange(p as number)}
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                    aria-disabled={page === totalPages}
                    className={cn(page === totalPages && 'pointer-events-none opacity-40')}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

/**
 * AdminTable — Reusable flat (non-accordion) data-table component.
 *
 * Derived from AdminTableAccordion: shares all the same building blocks
 * (ColHeader, SkeletonRows, PaginationBar, filter panels) but renders plain
 * rows instead of expandable accordion rows, and appends an optional
 * Actions column as the final column.
 *
 * Exports
 * ───────
 *  AdminTableAction<TRow>  – Single action-button configuration
 *  AdminTableProps<TRow>
 *  AdminTable<TRow>         – Main component
 *
 * Re-exports from admin-table-accordion (for convenience)
 * ────────────────────────────────────────────────────────
 *  FilterOption
 *  FilterListContent
 *  FilterMultiListContent
 *  AdminTableColumn<TRow>
 *
 * Usage
 * ─────
 *  <AdminTable
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
 *    emptyTitle="No records found"
 *    emptyDescription="…"
 *    emptyIcons={[FileText, Inbox, LayoutList]}
 *    actions={[
 *      { icon: Pencil,  label: 'Edit',   onClick: r => openEdit(r) },
 *      { icon: Trash2,  label: 'Delete', onClick: r => confirmDelete(r), variant: 'danger' },
 *    ]}
 *  />
 */

import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronDown,
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

// Re-export shared filter components and column type so callers only need one import.
export type { FilterOption, AdminTableColumn } from './admin-table-accordion';
export { FilterListContent, FilterMultiListContent } from './admin-table-accordion';

import type { AdminTableColumn } from './admin-table-accordion';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * An action button shown in the Actions column.
 * `variant: 'danger'` renders a red hover state (for destructive actions like Delete).
 */
export interface AdminTableAction<TRow> {
  /** Lucide icon component. */
  icon: LucideIcon;
  /** Accessible label and tooltip text. */
  label: string;
  onClick: (row: TRow) => void;
  /** When true for a row, the button is rendered disabled. */
  disabled?: (row: TRow) => boolean;
  /** 'default' = blue hover (default). 'danger' = red hover. */
  variant?: 'default' | 'danger';
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

// ── AdminTable ────────────────────────────────────────────────────────────────

export interface AdminTableProps<TRow> {
  /** Column definitions. */
  columns: AdminTableColumn<TRow>[];
  /** Current page of rows to display. */
  rows: TRow[];
  /** Returns a stable unique string key for a row (used as React key). */
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

  // Empty state ──────────────────────────────────────────────────────────────
  emptyTitle: string;
  emptyDescription?: string;
  /** Ideally 3 Lucide icon components. */
  emptyIcons?: LucideIcon[];

  // Actions column (optional) ────────────────────────────────────────────────
  /**
   * When provided, an "Actions" column is appended as the final column.
   * Each entry renders as an icon button. Use `variant: 'danger'` for
   * destructive actions (e.g. Delete) to get a red hover state.
   */
  actions?: AdminTableAction<TRow>[];

  /** Extra className applied to the outermost wrapper. */
  className?: string;
}

export function AdminTable<TRow>({
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
  emptyTitle,
  emptyDescription,
  emptyIcons,
  actions,
  className,
}: AdminTableProps<TRow>) {
  const hasActions = Boolean(actions && actions.length > 0);
  const hasData = !loading && rows.length > 0;
  const totalCols = columns.length + (hasActions ? 1 : 0);

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

              {hasActions && (
                <th className="px-4 py-2.5 text-right" style={{ width: 80 }}>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Actions
                  </span>
                </th>
              )}
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
              rows.map(row => (
                <tr
                  key={rowKey(row)}
                  className="border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-elevated)]"
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

                  {hasActions && (
                    <td className="px-4 py-3.5 text-right" style={{ width: 80 }}>
                      <div className="flex items-center justify-end gap-1">
                        {actions!.map(action => {
                          const isDisabled = action.disabled?.(row) ?? false;
                          const Icon = action.icon;
                          return (
                            <button
                              key={action.label}
                              type="button"
                              aria-label={action.label}
                              title={action.label}
                              disabled={isDisabled}
                              onClick={e => {
                                e.stopPropagation();
                                if (!isDisabled) action.onClick(row);
                              }}
                              className={cn(
                                'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                                isDisabled
                                  ? 'cursor-not-allowed text-[var(--color-text-muted)] opacity-30'
                                  : action.variant === 'danger'
                                    ? 'text-[var(--color-text-muted)] hover:bg-red-500/10 hover:text-red-500 active:bg-red-500/20'
                                    : 'text-[var(--color-text-muted)] hover:bg-[#2845D6]/10 hover:text-[#2845D6] active:bg-[#2845D6]/20',
                              )}
                            >
                              <Icon size={14} />
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  )}
                </tr>
              ))
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

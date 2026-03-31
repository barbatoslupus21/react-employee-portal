'use client';

/**
 * AdminTableSection — reusable search + actions row + DataTable.
 *
 * Combines a SearchBar, optional action buttons, and a DataTable into one
 * composable block. Spacing between the controls row and the table matches
 * the PRF Admin page convention (mb-3 between row and DataTable).
 *
 * Usage:
 *   <AdminTableSection<MyRow>
 *     search={search}
 *     onSearchChange={setSearch}
 *     searchPlaceholder="Search by name…"
 *     actions={<>
 *       <button onClick={openImport}>Import</button>
 *       <button onClick={openExport}>Export</button>
 *     </>}
 *     columns={columns}
 *     rows={rows}
 *     rowKey={r => r.id}
 *     loading={loading}
 *     ... (all DataTableProps)
 *   />
 */

import React from 'react';
import SearchBar from '@/components/ui/searchbar';
import { DataTable } from '@/components/ui/data-table';
import type { DataTableProps } from '@/components/ui/data-table';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminTableSectionProps<TRow> extends DataTableProps<TRow> {
  /** Current search query string. */
  search: string;
  /** Called when the user types in the search bar. */
  onSearchChange: (v: string) => void;
  /** Placeholder text for the search input. Defaults to "Search…". */
  searchPlaceholder?: string;
  /**
   * Content rendered to the right of the search bar.
   * Typically Import / Export action buttons.
   * Wrap in a fragment if passing multiple buttons.
   */
  actions?: React.ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AdminTableSection<TRow>({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  actions,
  ...tableProps
}: AdminTableSectionProps<TRow>) {
  return (
    <>
      {/* Controls row — search left, actions right */}
      <div className="flex items-center mb-3">
        <div className="min-w-[200px] max-w-sm flex-1">
          <SearchBar
            value={search}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
          />
        </div>
        {actions && (
          <div className="ml-auto flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {/* DataTable — handles skeleton, pagination, sorting, empty state */}
      <DataTable<TRow> {...tableProps} />
    </>
  );
}

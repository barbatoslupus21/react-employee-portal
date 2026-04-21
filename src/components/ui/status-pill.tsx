/**
 * status-pill.tsx
 *
 * Single global source of truth for status badge colours.
 * Import this component in every module — never define status colours locally.
 *
 * Colour conventions:
 *   approved    → green   (success)
 *   disapproved → red     (hard rejection)
 *   rejected    → red     (hard rejection, alias)
 *   pending     → yellow  (awaiting action)
 *   routing     → yellow  (in-transit, alias for pending)
 *   cancelled   → gray    (void / withdrawn — not an error, not a rejection)
 *   [unknown]   → muted   (CSS variable fallback)
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

const STATUS_CLASSES: Record<string, string> = {
  approved:    'bg-green-100  text-green-700  dark:bg-green-950/40  dark:text-green-400',
  disapproved: 'bg-red-100    text-red-700    dark:bg-red-950/40    dark:text-red-400',
  rejected:    'bg-red-100    text-red-700    dark:bg-red-950/40    dark:text-red-400',
  pending:     'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400',
  routing:     'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400',
  cancelled:   'bg-gray-100   text-gray-500   dark:bg-gray-800/50   dark:text-gray-400',
};

export interface StatusPillProps {
  status: string;
  label:  string;
  className?: string;
}

export function StatusPill({ status, label, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5',
        'text-[11px] font-semibold leading-tight whitespace-nowrap',
        STATUS_CLASSES[status] ?? 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)]',
        className,
      )}
    >
      {label}
    </span>
  );
}

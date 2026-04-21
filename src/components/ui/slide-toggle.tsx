'use client';

import React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

// ── Shared iOS-style sliding-dot toggle ───────────────────────────────────────
// Used by AdminChartCard (bar/line) and the finance loans section (active-only).

export interface SlideToggleProps {
  /** Whether the toggle is in the "on" (right) position. */
  checked:          boolean;
  onCheckedChange:  (checked: boolean) => void;
  /** Icon shown inside the dot when checked (right). */
  checkedIcon?:     React.ReactNode;
  /** Icon shown inside the dot when unchecked (left). */
  uncheckedIcon?:   React.ReactNode;
  title?:           string;
  className?:       string;
  disabled?:        boolean;
}

export function SlideToggle({
  checked,
  onCheckedChange,
  checkedIcon,
  uncheckedIcon,
  title,
  className,
  disabled,
}: SlideToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
      className={cn(
        // w-14 = 3.5rem, matches the original h-8 w-[3.5rem] in AdminChartCard
        'relative flex h-8 w-14 items-center rounded-full bg-[var(--color-bg)] p-1',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 30 }}
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2845D6] text-white shadow-md',
          checked && 'ml-auto',
        )}
      >
        {checked ? checkedIcon : uncheckedIcon}
      </motion.div>
    </button>
  );
}

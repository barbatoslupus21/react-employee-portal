'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { CheckCircle2 } from 'lucide-react';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { cn } from '@/lib/utils';

export interface ConfirmationModalProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
  confirming: boolean;
  icon?: React.ReactNode;
  /** Controls the colour of the confirm button. Defaults to 'danger' (red). */
  confirmVariant?: 'danger' | 'success';
}

export function ConfirmationModal({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  confirming,
  icon,
  confirmVariant = 'danger',
}: ConfirmationModalProps) {
  const loadingLabel = confirmVariant === 'danger' && /delete/i.test(confirmLabel)
    ? 'Deleting..'
    : `${confirmLabel}...`;

  const content = (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={confirming ? undefined : onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
      >
        <div className="p-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-950/30">
                {icon}
              </div>
            )}
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</p>
              <p className="text-sm text-[var(--color-text-muted)]">{message}</p>
            </div>
          </div>
        </div>
        <div className="p-4 pb-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="px-4 py-2 rounded-lg text-xs font-medium border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className={cn(
              'px-4 py-2 rounded-lg text-xs font-normal text-white transition-colors disabled:opacity-50 flex items-center justify-center',
              confirmVariant === 'success'
                ? 'bg-[var(--btn-success-bg)] hover:bg-[var(--btn-success-hover)]'
                : 'bg-[var(--btn-danger-bg)] hover:bg-red-700',
            )}
          >
            {confirming
              ? <TextShimmer className="text-xs" duration={1.2}>{loadingLabel}</TextShimmer>
              : <span className="inline-flex items-center gap-2"><CheckCircle2 size={14}/> {confirmLabel}</span>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );

  // Always portal to document.body so z-index is relative to the root stacking
  // context — this ensures the confirmation sits above any triggering modal.
  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}


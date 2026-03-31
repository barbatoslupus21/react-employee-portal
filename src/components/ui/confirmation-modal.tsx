'use client';

import React from 'react';
import { motion } from 'motion/react';
import { X, CheckCircle2 } from 'lucide-react';
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
}: ConfirmationModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
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
        <div className="px-6 py-4">
          <div className="mb- flex items-center gap-3">
            {icon ?? <CheckCircle2 size={20} className="text-[#2845D6]" />}
            <p className="text-sm text-[var(--color-text-muted)]">{message}</p>
          </div>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 h-9 rounded-lg text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="flex-1 h-9 rounded-lg text-sm font-medium bg-[var(--btn-danger-bg)] text-white hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {confirming
              ? <TextShimmer className="text-sm" duration={1.2}>{`${confirmLabel}…`}</TextShimmer>
              : <span className="inline-flex items-center gap-2"><CheckCircle2 size={14}/> {confirmLabel}</span>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAnnouncementReactions } from '@/app/dashboard/announcements/_hooks/useAnnouncements';
import { UserAvatar } from './UserAvatar';

type ReactionsViewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  announcementId: number;
};

export function ReactionsViewModal({ open, onOpenChange, announcementId }: ReactionsViewModalProps) {
  const { data: reactions = [], isLoading } = useAnnouncementReactions(announcementId, open);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  return (
    <AnimatePresence>
      {open && createPortal(
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Reactions</h2>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-full p-1.5 hover:bg-[var(--color-bg-subtle)] transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-[var(--color-text-muted)]" />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-80 overflow-y-auto px-5 py-3">
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-[var(--color-border)] animate-pulse" />
                      <div className="h-3 w-32 rounded bg-[var(--color-border)] animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : reactions.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">No reactions yet.</p>
              ) : (
                <ul className="space-y-3">
                  {reactions.map((r: { id: number; user_name: string; user_avatar: string | null; emoji: string }) => (
                    <li key={r.id} className="flex items-center gap-3">
                      <UserAvatar src={r.user_avatar} alt={r.user_name} className="h-8 w-8" />
                      <span className="flex-1 text-sm text-[var(--color-text-primary)]">{r.user_name}</span>
                      <span className="text-lg">{r.emoji}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      , document.body)}
    </AnimatePresence>
  );
}

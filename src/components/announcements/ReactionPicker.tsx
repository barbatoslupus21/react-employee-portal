'use client';

import { motion, AnimatePresence } from 'motion/react';

type Emoji = { emoji: string; label: string };

const REACTIONS: Emoji[] = [
  { emoji: '❤️', label: 'Like' },
  { emoji: '😂', label: 'Haha' },
  { emoji: '😮', label: 'Wow' },
  { emoji: '😢', label: 'Sad' },
  { emoji: '👏', label: 'Clap' },
];

type ReactionPickerProps = {
  open: boolean;
  onSelect: (emoji: string) => void;
};

/**
 * Lightweight inline emoji picker — 5 hardcoded reactions, no third-party lib (Risk 12).
 */
export function ReactionPicker({ open, onSelect }: ReactionPickerProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 6 }}
          transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="absolute bottom-full left-0 mb-2 z-30 flex gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 shadow-lg"
        >
          {REACTIONS.map(({ emoji, label }) => (
            <button
              key={emoji}
              type="button"
              title={label}
              onClick={() => onSelect(emoji)}
              className="flex flex-col items-center gap-0.5 rounded-full px-1 py-0.5 text-xl transition-transform hover:scale-125 focus:outline-none"
            >
              <span>{emoji}</span>
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

'use client';

import { motion } from 'motion/react';
import { LogOut } from 'lucide-react';

interface Props {
  secondsLeft: number;
  onCancel:    () => void;
}

/**
 * Full-screen overlay warning modal shown during the final 30 seconds of inactivity.
 * Intentionally has no close button and cannot be dismissed by clicking the backdrop —
 * only the "Stay Logged In" button or actual user activity cancels the countdown.
 */
export function InactivityWarningModal({ secondsLeft, onCancel }: Props) {
  const pct = secondsLeft / 30;

  // SVG ring progress (runs from full → empty)
  const RADIUS      = 28;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const strokeDash  = CIRCUMFERENCE * (1 - pct);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      /* Intentionally NOT onClick={onCancel} — backdrop is inert */
      className="fixed inset-0 z-[200] flex items-center justify-center
        bg-black/60 backdrop-blur-sm"
      aria-modal="true"
      role="alertdialog"
      aria-labelledby="inactivity-title"
      aria-describedby="inactivity-desc"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={{ opacity: 0, scale: 0.92, y: 10 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="w-full max-w-sm mx-4 rounded-2xl border border-[var(--color-border)]
          bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
      >
        {/* ── Top colour bar ── */}
        <div className="h-1 w-full bg-[var(--color-border)]">
          <motion.div
            className="h-full bg-red-500"
            initial={{ width: '100%' }}
            animate={{ width: `${pct * 100}%` }}
            transition={{ duration: 0.95, ease: 'linear' }}
          />
        </div>

        <div className="px-6 pt-7 pb-6 flex flex-col items-center text-center gap-5">

          {/* ── Countdown ring ── */}
          <div className="relative flex items-center justify-center">
            <svg width={72} height={72} className="-rotate-90">
              {/* Track */}
              <circle
                cx={36} cy={36} r={RADIUS}
                fill="none"
                stroke="var(--color-border)"
                strokeWidth={5}
              />
              {/* Progress */}
              <motion.circle
                cx={36} cy={36} r={RADIUS}
                fill="none"
                stroke={secondsLeft <= 10 ? '#ef4444' : '#2845D6'}
                strokeWidth={5}
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={strokeDash}
                transition={{ duration: 0.95, ease: 'linear' }}
              />
            </svg>
            {/* Number in the middle */}
            <span
              className="absolute text-2xl font-bold tabular-nums"
              style={{ color: secondsLeft <= 10 ? '#ef4444' : 'var(--color-text-primary)' }}
            >
              {secondsLeft}
            </span>
          </div>

          {/* ── Text ── */}
          <div className="space-y-1.5">
            <h2
              id="inactivity-title"
              className="text-base font-semibold text-[var(--color-text-primary)]"
            >
              Are you still there?
            </h2>
            <p
              id="inactivity-desc"
              className="text-sm text-[var(--color-text-muted)] leading-relaxed"
            >
              You&apos;ve been inactive for a while. For your security, you will be
              automatically logged out in{' '}
              <span className="font-semibold text-[var(--color-text-primary)]">
                {secondsLeft} second{secondsLeft !== 1 ? 's' : ''}
              </span>
              .
            </p>
          </div>

          {/* ── Actions ── */}
          <div className="w-full flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="flex w-full items-center justify-center gap-2 px-4 py-2.5
                rounded-lg bg-[#2845D6] text-white text-sm font-semibold
                hover:bg-[#1f38c0] active:scale-[0.98]
                transition-all duration-150 focus:outline-none focus-visible:ring-2
                focus-visible:ring-[#2845D6] focus-visible:ring-offset-2"
            >
              Stay Logged In
            </button>

            <div className="flex items-center gap-2 justify-center px-1">
              <LogOut size={12} className="text-[var(--color-text-muted)] shrink-0" />
              <p className="text-[11px] text-[var(--color-text-muted)]">
                You will be logged out automatically when the timer reaches 0.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

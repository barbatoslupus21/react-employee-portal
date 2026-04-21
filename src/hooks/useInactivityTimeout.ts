'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const IDLE_MS        = 5 * 60 * 1000;   // 5 minutes total idle
const WARN_BEFORE_MS = 30 * 1000;        // show warning 30 s before logout
const ACTIVE_MS      = IDLE_MS - WARN_BEFORE_MS; // 4 min 30 s of pure idle → warn

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'keypress',
  'touchstart',
  'touchmove',
  'scroll',
  'wheel',
  'pointerdown',
  'pointermove',
  'focus',
];

export interface InactivityState {
  /** True when the 30-second warning modal should be shown. */
  showWarning: boolean;
  /** Countdown value (30 → 0). Only meaningful when showWarning is true. */
  secondsLeft: number;
  /** Call this when the user clicks "Stay Logged In" / Cancel. */
  resetTimer: () => void;
}

/**
 * Detects 5-minute user inactivity.
 * At 4:30 elapsed, sets showWarning = true and starts a 30-second countdown.
 * If the countdown reaches 0, calls onTimeout() (which should perform logout).
 * Any user activity before the countdown ends cancels the warning and resets the timer.
 */
export function useInactivityTimeout(onTimeout: () => void): InactivityState {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(30);

  // Stable ref to the latest onTimeout so intervals/timers don't capture stale closures.
  const onTimeoutRef    = useRef(onTimeout);
  const activeTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const showWarningRef  = useRef(false);  // mirrors state for use inside event listeners

  useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);

  const clearTimers = useCallback(() => {
    if (activeTimerRef.current)  clearTimeout(activeTimerRef.current);
    if (countdownRef.current)    clearInterval(countdownRef.current);
    activeTimerRef.current = null;
    countdownRef.current   = null;
  }, []);

  const startCountdown = useCallback(() => {
    setShowWarning(true);
    showWarningRef.current = true;
    setSecondsLeft(30);

    let remaining = 30;

    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(remaining);

      if (remaining <= 0) {
        clearInterval(countdownRef.current!);
        countdownRef.current = null;
        Promise.resolve(onTimeoutRef.current()).catch(() => {});
      }
    }, 1000);
  }, []);

  const resetTimer = useCallback(() => {
    clearTimers();
    setShowWarning(false);
    showWarningRef.current = false;
    setSecondsLeft(30);

    // Restart the main idle timer
    activeTimerRef.current = setTimeout(startCountdown, ACTIVE_MS);
  }, [clearTimers, startCountdown]);

  useEffect(() => {
    // While the warning IS showing, ignore ALL activity events — the timer is
    // already counting down and should only be cancelled by the explicit
    // "Stay Logged In" button (direct resetTimer() call).
    // Continuous activity (typing, scrolling, mouse movement) resets the main
    // idle timer only BEFORE the warning appears.
    function handleActivity() {
      if (showWarningRef.current) {
        // Warning is visible — do NOT auto-dismiss here.
        // Only the "Stay Logged In" button (onCancel → resetTimer) may cancel it.
        return;
      }
      // Otherwise restart the main idle timer so any interaction extends the session.
      if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
      activeTimerRef.current = setTimeout(startCountdown, ACTIVE_MS);
    }

    // Attach all activity listeners — passive where possible to avoid scroll jank.
    const options: AddEventListenerOptions = { passive: true, capture: true };
    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, handleActivity, options));

    // Kick off the initial timer.
    activeTimerRef.current = setTimeout(startCountdown, ACTIVE_MS);

    return () => {
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, handleActivity, options));
      clearTimers();
    };
  }, [resetTimer, startCountdown, clearTimers]);

  return { showWarning, secondsLeft, resetTimer };
}

"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as React from "react";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  format,
  isValid,
  isSameDay,
  isSameMonth,
  isToday,
} from "date-fns";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildCalendarDays(currentMonth: Date): Date[] {
  const days: Date[] = [];
  let day = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
  while (day <= end) {
    days.push(day);
    day = addDays(day, 1);
  }
  return days;
}

/**
 * Build the MM/DD/YYYY display string from a raw digit string (up to 8 chars).
 * "0430"  → "04/30"  |  "04301997" → "04/30/1997"
 */
function formatDigitsToDate(digits: string): string {
  const d = digits.slice(0, 8);
  if (!d) return "";
  let result = "";
  for (let i = 0; i < d.length; i++) {
    if (i === 2 || i === 4) result += "/";
    result += d[i];
  }
  return result;
}

/**
 * Parse MM/DD/YYYY string → LOCAL-midnight Date.
 * Uses new Date(y, m-1, d) — always local, never UTC-shifted.
 */
function parseLocalDate(str: string): Date | null {
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mo, dy, yr] = m.map(Number);
  if (mo < 1 || mo > 12 || dy < 1 || dy > 31 || yr < 1900 || yr > 2100) return null;
  const d = new Date(yr, mo - 1, dy); // local midnight — no UTC offset issues
  // Roll-over check: Feb 30 → March, etc.
  if (d.getMonth() !== mo - 1 || d.getDate() !== dy) return null;
  return d;
}

/** Parse MM/DD/YYYY HH:mm string → local Date. */
function parseLocalDateTime(str: string): Date | null {
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    const [, mo, dy, yr, h, min] = m.map(Number);
    if (mo < 1 || mo > 12 || dy < 1 || dy > 31 || yr < 1900) return null;
    const d = new Date(yr, mo - 1, dy, h, min, 0, 0);
    if (d.getMonth() !== mo - 1 || d.getDate() !== dy) return null;
    return d;
  }
  return parseLocalDate(str);
}

/** Number of digit chars before position `pos` in a formatted date string. */
function digitCountBefore(str: string, pos: number): number {
  let count = 0;
  for (let i = 0; i < pos && i < str.length; i++) {
    if (/\d/.test(str[i])) count++;
  }
  return count;
}

/**
 * Given a digit count, return the corresponding cursor position in the
 * formatted string (skipping over '/' separators).
 */
function posFromDigitCount(count: number, formatted: string): number {
  let digits = 0;
  for (let i = 0; i <= formatted.length; i++) {
    if (digits === count) {
      // Skip any leading separator at this position
      while (formatted[i] === "/") i++;
      return Math.min(i, formatted.length);
    }
    if (i < formatted.length && /\d/.test(formatted[i])) digits++;
  }
  return formatted.length;
}

// ── DateTimePicker ─────────────────────────────────────────────────────────────
interface DateTimePickerProps {
  value?: Date;
  onChange?: (date: Date) => void;
  placeholder?: string;
  showTimeInput?: boolean;
  displayFormat?: string;
  disabled?: boolean;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
  portal?: boolean;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "MM/DD/YYYY",
  showTimeInput = false,
  disabled = false,
  className,
  minDate,
  maxDate,
  portal = true,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [currentMonth, setCurrentMonth] = React.useState<Date>(value ?? new Date());
  const [timeInput, setTimeInput] = React.useState(value ? format(value, "HH:mm") : "00:00");

  const inputFmt = showTimeInput ? "MM/dd/yyyy HH:mm" : "MM/dd/yyyy";

  // ── Text input state ──────────────────────────────────────────────────────
  const [inputValue, setInputValue] = React.useState<string>(
    value ? format(value, inputFmt) : ""
  );
  // Prevents value→inputValue sync when we just fired onChange
  const internalChangeRef = React.useRef(false);
  // Desired cursor position, applied via useLayoutEffect
  const nextCursorRef = React.useRef<number | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Apply cursor position after each render (avoids RAF race with React re-renders)
  React.useLayoutEffect(() => {
    if (nextCursorRef.current !== null && inputRef.current) {
      const pos = nextCursorRef.current;
      nextCursorRef.current = null;
      inputRef.current.setSelectionRange(pos, pos);
    }
  });

  // Sync inputValue when value changes externally
  React.useEffect(() => {
    if (internalChangeRef.current) { internalChangeRef.current = false; return; }
    setInputValue(value ? format(value, inputFmt) : "");
  }, [value, inputFmt]);

  React.useEffect(() => {
    if (value) setCurrentMonth(value);
  }, [value]);

  React.useEffect(() => {
    if (open) setTimeInput(value ? format(value, "HH:mm") : "00:00");
  }, [open, value]);

  // ── Emit parsed date ──────────────────────────────────────────────────────
  function emitDate(str: string) {
    const parsed = showTimeInput ? parseLocalDateTime(str) : parseLocalDate(str);
    if (!parsed || !isValid(parsed)) return;
    internalChangeRef.current = true;
    setCurrentMonth(parsed);
    if (showTimeInput) setTimeInput(format(parsed, "HH:mm"));
    onChange?.(parsed);
  }

  // ── Masked keyboard handler ────────────────────────────────────────────────
  function handleMaskedKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const inp = inputRef.current;
    if (!inp) return;

    const key = e.key;

    // Pass navigation / clipboard shortcuts through
    if (e.ctrlKey || e.metaKey) return;
    if (["Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key)) return;

    if (key === "Escape") { e.preventDefault(); setOpen(false); return; }
    if (key === "Enter")  { e.preventDefault(); if (parseLocalDate(inputValue)) setOpen(false); return; }

    e.preventDefault(); // take full control of the input

    const selStart = inp.selectionStart ?? 0;
    const selEnd   = inp.selectionEnd   ?? selStart;
    const cur      = inputValue;

    // ── Backspace ──────────────────────────────────────────────────────────
    if (key === "Backspace") {
      if (selStart !== selEnd) {
        // Delete selection
        const digits    = (cur.slice(0, selStart) + cur.slice(selEnd)).replace(/\D/g, "");
        const formatted = formatDigitsToDate(digits);
        setInputValue(formatted);
        nextCursorRef.current = posFromDigitCount(digitCountBefore(cur, selStart), formatted);
        return;
      }
      if (selStart === 0) return;
      // If cursor is just after a '/', skip over it
      const delPos = cur[selStart - 1] === "/" ? selStart - 2 : selStart - 1;
      if (delPos < 0) return;
      const digits    = (cur.slice(0, delPos) + cur.slice(delPos + 1)).replace(/\D/g, "");
      const formatted = formatDigitsToDate(digits);
      setInputValue(formatted);
      nextCursorRef.current = posFromDigitCount(digitCountBefore(cur, delPos), formatted);
      return;
    }

    // ── Delete ────────────────────────────────────────────────────────────
    if (key === "Delete") {
      if (selStart !== selEnd) {
        const digits    = (cur.slice(0, selStart) + cur.slice(selEnd)).replace(/\D/g, "");
        const formatted = formatDigitsToDate(digits);
        setInputValue(formatted);
        nextCursorRef.current = posFromDigitCount(digitCountBefore(cur, selStart), formatted);
        return;
      }
      const delPos = cur[selStart] === "/" ? selStart + 1 : selStart;
      if (delPos >= cur.length) return;
      const digits    = (cur.slice(0, delPos) + cur.slice(delPos + 1)).replace(/\D/g, "");
      const formatted = formatDigitsToDate(digits);
      setInputValue(formatted);
      nextCursorRef.current = posFromDigitCount(digitCountBefore(cur, selStart), formatted);
      return;
    }

    // ── Digit input ───────────────────────────────────────────────────────
    if (!/^\d$/.test(key)) return;

    // Skip over separator if cursor is on one, then overwrite the next digit
    let insertAt = selStart;
    if (cur[insertAt] === "/") insertAt++;
    // Don't go past 10 chars (MM/DD/YYYY = 10)
    if (insertAt >= 10 && selStart === selEnd) return;

    const raw = selStart !== selEnd
      ? cur.slice(0, selStart) + key + cur.slice(selEnd)
      : cur.slice(0, insertAt) + key + cur.slice(insertAt + 1);

    const digits    = raw.replace(/\D/g, "").slice(0, 8);
    const formatted = formatDigitsToDate(digits);
    setInputValue(formatted);

    // Advance cursor past the typed digit (and past any following separator)
    const dAfter = digitCountBefore(cur, insertAt) + 1;
    nextCursorRef.current = posFromDigitCount(dAfter, formatted);

    if (digits.length === 8) emitDate(formatted);
  }

  // ── Fallback: paste / autocomplete / mobile IME ───────────────────────────
  function handleMaskedChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits    = e.target.value.replace(/\D/g, "").slice(0, 8);
    const formatted = formatDigitsToDate(digits);
    setInputValue(formatted);
    if (digits.length === 8) emitDate(formatted);
  }

  // ── Date-time input (no mask) ─────────────────────────────────────────────
  function handleDateTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value);
    emitDate(e.target.value);
  }
  function handleDateTimeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter")  { if (parseLocalDateTime(inputValue)) setOpen(false); }
    if (e.key === "Escape") setOpen(false);
  }

  // ── Calendar day click ────────────────────────────────────────────────────
  const handleDayClick = (day: Date) => {
    if (minDate && day < minDate) return;
    if (maxDate && day > maxDate) return;
    const next = new Date(day);
    if (showTimeInput) {
      const [h, m] = timeInput.split(":").map(Number);
      next.setHours(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);
    }
    internalChangeRef.current = true;
    setInputValue(format(next, inputFmt));
    onChange?.(next);
    setOpen(false);
  };

  const days = buildCalendarDays(currentMonth);

  const contentClasses = cn(
    "z-[60] w-[272px] rounded-xl border border-[var(--color-border)]",
    "bg-[var(--color-bg-elevated)] p-3 text-[var(--color-text-primary)] shadow-[var(--shadow-xl)] outline-none"
  );

  const handleAutoFocus = (e: Event) => e.preventDefault();

  // ── Popover body ──────────────────────────────────────────────────────────
  const popoverBody = (
    <div data-datetime-picker-popover>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-[var(--color-text-primary)]">
          {format(currentMonth, "MMMM yyyy")}
        </span>
        <div className="flex gap-0.5">
          <button type="button" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center mb-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {days.map((day) => {
          const isSelected  = value ? isSameDay(day, value) : false;
          const isCurrMonth = isSameMonth(day, currentMonth);
          const isTodayDay  = isToday(day);
          const isDisabled  = (minDate ? day < minDate : false) || (maxDate ? day > maxDate : false);
          return (
            <div key={day.toISOString()} className={cn("flex items-center justify-center", !isCurrMonth && "opacity-30")}>
              <button type="button" disabled={isDisabled} onClick={() => handleDayClick(day)}
                className={cn(
                  "h-8 w-8 flex items-center justify-center rounded-md text-xs transition-colors focus:outline-none",
                  isSelected   ? "bg-[var(--color-text-primary)] text-[var(--color-bg-elevated)] font-medium"
                  : isTodayDay ? "bg-[var(--color-accent)] text-white font-medium"
                  : isDisabled ? "cursor-not-allowed opacity-30"
                  : "hover:bg-[var(--color-bg-card)] text-[var(--color-text-primary)] cursor-pointer"
                )}>
                {format(day, "d")}
              </button>
            </div>
          );
        })}
      </div>

      {showTimeInput && (
        <div className="mt-3 -mx-3 px-3 pt-2.5 border-t border-[var(--color-border)]">
          <div className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wide mb-1">Time</div>
          <input value={timeInput} onChange={(e) => setTimeInput(e.target.value)} placeholder="HH:mm"
            className="w-full h-8 px-2.5 rounded-lg border text-xs bg-[var(--color-bg-elevated)] border-[var(--color-border)] text-[var(--color-text-primary)]"
            style={{ outline: "none", boxShadow: "none" }} />
        </div>
      )}

      <p className="mt-2 text-[10px] text-[var(--color-text-muted)] text-center">
        {showTimeInput ? "Format: MM/DD/YYYY HH:mm" : "Format: MM/DD/YYYY"}
      </p>
    </div>
  );

  // ── Input trigger ─────────────────────────────────────────────────────────
  const inputTrigger = (
    <div
      className={cn(
        "flex h-9 w-full items-center rounded-lg border border-[var(--color-border)] transition-colors",
        "bg-[var(--color-bg-elevated)]",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <CalendarIcon className="ml-3 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={showTimeInput ? handleDateTimeChange : handleMaskedChange}
        onKeyDown={showTimeInput ? handleDateTimeKeyDown : handleMaskedKeyDown}
        onFocus={() => !open && setOpen(true)}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className={cn(
          "flex-1 min-w-0 bg-transparent px-2 py-1 text-xs",
          "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] placeholder:italic",
          "disabled:cursor-not-allowed"
        )}
        /* Remove ALL browser focus indicators via inline style — Tailwind
           classes alone cannot fully override some browser agents.      */
        style={{ outline: "none", boxShadow: "none", border: "none" }}
      />
      <button
        type="button"
        disabled={disabled}
        tabIndex={-1}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="h-full px-2.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors disabled:cursor-not-allowed"
        aria-label="Open calendar"
      >
        <ChevronLeft className={cn("h-3 w-3 transition-transform", open ? "rotate-90" : "-rotate-90")} />
      </button>
    </div>
  );

  if (!portal) {
    return (
      <div className={cn("relative", className)}>
        <PopoverPrimitive.Root open={open} onOpenChange={setOpen} modal={false}>
          <PopoverPrimitive.Anchor asChild>{inputTrigger}</PopoverPrimitive.Anchor>
          <PopoverPrimitive.Content data-datetime-picker-popover side="bottom" align="start"
            sideOffset={4} avoidCollisions onOpenAutoFocus={handleAutoFocus} onCloseAutoFocus={handleAutoFocus}
            className={contentClasses}>
            {popoverBody}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Root>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen} modal={false}>
        <PopoverPrimitive.Anchor asChild>{inputTrigger}</PopoverPrimitive.Anchor>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content data-datetime-picker-popover align="start" side="bottom"
            sideOffset={4} avoidCollisions onOpenAutoFocus={handleAutoFocus} onCloseAutoFocus={handleAutoFocus}
            className={contentClasses}>
            {popoverBody}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
}

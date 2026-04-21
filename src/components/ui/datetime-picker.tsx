"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  format,
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

// ── DateTimePicker ─────────────────────────────────────────────────────────────
interface DateTimePickerProps {
  value?: Date;
  onChange?: (date: Date) => void;
  placeholder?: string;
  /** Show HH:mm time input inside the popover. Defaults to false. */
  showTimeInput?: boolean;
  /** Display format string for the trigger label. */
  displayFormat?: string;
  disabled?: boolean;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Select date",
  showTimeInput = false,
  displayFormat,
  disabled = false,
  className,
  minDate,
  maxDate,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [currentMonth, setCurrentMonth] = React.useState<Date>(value ?? new Date());
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  // Time state — only relevant when showTimeInput is true
  const [timeInput, setTimeInput] = React.useState(value ? format(value, "HH:mm") : "00:00");

  // Keep currentMonth in sync when value changes externally
  React.useEffect(() => {
    if (value) setCurrentMonth(value);
  }, [value]);

  // Sync time input when popover opens
  React.useEffect(() => {
    if (open) setTimeInput(value ? format(value, "HH:mm") : "00:00");
  }, [open]);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Popover fixed position anchored to trigger
  const [popoverStyle, setPopoverStyle] = React.useState<React.CSSProperties>({});
  React.useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPopoverStyle({
      position: "fixed",
      top: rect.bottom + 6,
      left: rect.left,
      zIndex: 9999,
    });
  }, [open]);

  const days = buildCalendarDays(currentMonth);

  const handleDayClick = (day: Date) => {
    if (minDate && day < minDate) return;
    if (maxDate && day > maxDate) return;
    const next = new Date(day);
    if (showTimeInput) {
      const [h, m] = timeInput.split(":").map(Number);
      next.setHours(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);
    }
    onChange?.(next);
    setOpen(false);
  };

  const labelFormat = displayFormat ?? (showTimeInput ? "MMM d, yyyy HH:mm" : "MMM d, yyyy");
  const formattedLabel = value ? format(value, labelFormat) : null;

  const popoverContent = open ? (
    <div
      ref={popoverRef}
      style={popoverStyle}
      className={cn(
        "w-[272px] rounded-xl border border-[var(--color-border)]",
        "bg-[var(--color-bg-elevated)] shadow-[var(--shadow-xl)] p-3"
      )}
    >
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          {format(currentMonth, "MMMM yyyy")}
        </span>
        <div className="flex gap-0.5">
          <button
            type="button"
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 text-center mb-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {days.map((day) => {
          const isSelected = value ? isSameDay(day, value) : false;
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isTodayDay = isToday(day);
          const isDisabled =
            (minDate ? day < minDate : false) ||
            (maxDate ? day > maxDate : false);

          return (
            <div
              key={day.toISOString()}
              className={cn("flex items-center justify-center", !isCurrentMonth && "opacity-30")}
            >
              <button
                type="button"
                disabled={isDisabled}
                onClick={() => handleDayClick(day)}
                className={cn(
                  "h-8 w-8 flex items-center justify-center rounded-md text-sm transition-colors focus:outline-none",
                  isSelected
                    ? "bg-[var(--color-text-primary)] text-[var(--color-bg-elevated)] font-medium"
                    : isTodayDay
                    ? "bg-[var(--color-accent)] text-white font-medium"
                    : isDisabled
                    ? "cursor-not-allowed opacity-30"
                    : "hover:bg-[var(--color-bg-card)] text-[var(--color-text-primary)] cursor-pointer"
                )}
              >
                {format(day, "d")}
              </button>
            </div>
          );
        })}
      </div>

      {/* Optional time input */}
      {showTimeInput && (
        <div className="mt-3 -mx-3 px-3 pt-2.5 border-t border-[var(--color-border)]">
          <div className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wide mb-1">Time</div>
          <input
            value={timeInput}
            onChange={(e) => setTimeInput(e.target.value)}
            placeholder="HH:mm"
            className={cn(
              "w-full h-8 px-2.5 rounded-lg border text-sm",
              "bg-[var(--color-bg-elevated)] border-[var(--color-border)] text-[var(--color-text-primary)]",
              "focus:outline-none focus:border-transparent focus:shadow-sm",
            )}
          />
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className={cn("relative", className)}>
      {/* ── Trigger button ── */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-lg border px-3 text-sm transition-colors text-left select-none",
          "bg-[var(--color-bg-elevated)] border-[var(--color-border)]",
          formattedLabel ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)] italic",
          !disabled && "hover:border-[var(--color-border)]",
          "focus:outline-none",
          open && "outline-none border-transparent shadow-sm",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <CalendarIcon className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
        <span className="flex-1 truncate">{formattedLabel ?? placeholder}</span>
      </button>

      {/* ── Portal popover — rendered outside modal stack at document.body ── */}
      {typeof window !== "undefined" && popoverContent
        ? createPortal(popoverContent, document.body)
        : null}
    </div>
  );
}

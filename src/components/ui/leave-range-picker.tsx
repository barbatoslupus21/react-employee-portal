"use client";

import * as React from "react";
import { format } from "date-fns";
import { type DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface LeaveRangePickerProps {
  dateStart: Date | undefined;
  dateEnd: Date | undefined;
  onDateStartChange: (d: Date | undefined) => void;
  onDateEndChange: (d: Date | undefined) => void;
  errorStart?: string;
  errorEnd?: string;
  closeOnSelect?: boolean;
}

export function LeaveRangePicker({
  dateStart,
  dateEnd,
  onDateStartChange,
  onDateEndChange,
  errorStart,
  errorEnd,
  closeOnSelect = true,
}: LeaveRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  const range: DateRange | undefined =
    dateStart || dateEnd ? { from: dateStart, to: dateEnd } : undefined;

  function handleSelect(r: DateRange | undefined) {
    onDateStartChange(r?.from);
    onDateEndChange(r?.to);
    if (closeOnSelect && r?.from && r?.to) {
      setOpen(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-3 px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Date From
          {!dateStart && (
            <span className="text-red-500 normal-case tracking-normal">*</span>
          )}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Date To
          {!dateEnd && (
            <span className="text-red-500 normal-case tracking-normal">*</span>
          )}
        </span>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "grid w-full grid-cols-2 gap-3 overflow-hidden rounded-lg border bg-transparent text-left transition-colors",
              "border-[var(--color-border)] hover:border-[var(--color-text-muted)]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2845D6]/30",
              (errorStart || errorEnd) && "border-red-500",
            )}
          >
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <CalendarIcon className="size-4 shrink-0 text-[var(--color-text-muted)]" />
              <span
                className={cn(
                  "text-sm leading-tight",
                  dateStart
                    ? "text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-muted)]",
                )}
              >
                {dateStart ? format(dateStart, "MMM dd, yyyy") : "Select date"}
              </span>
            </div>

            <div className="flex items-center gap-2.5 px-3 py-2.5 border-l border-[var(--color-border)]">
              <CalendarIcon className="size-4 shrink-0 text-[var(--color-text-muted)]" />
              <span
                className={cn(
                  "text-sm leading-tight",
                  dateEnd
                    ? "text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-muted)]",
                )}
              >
                {dateEnd ? format(dateEnd, "MMM dd, yyyy") : "Select date"}
              </span>
            </div>
          </button>
        </PopoverTrigger>

        <PopoverContent className="w-auto p-0 z-[200]" align="start" side="bottom">
          <Calendar
            mode="range"
            defaultMonth={dateStart ?? new Date()}
            selected={range}
            onSelect={handleSelect}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>

      {(errorStart || errorEnd) && (
        <p className="text-xs text-red-500">{errorStart || errorEnd}</p>
      )}
    </div>
  );
}

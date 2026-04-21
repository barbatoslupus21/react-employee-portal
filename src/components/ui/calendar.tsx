"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = false, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        month_caption: "relative mx-10 mb-1 flex h-9 items-center justify-center",
        caption_label: "text-sm font-medium text-[var(--color-text-primary)]",
        nav: "flex items-center absolute inset-x-0 justify-between",
        button_previous: "h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100 absolute left-5 top-0",
        button_next: "h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100 absolute right-2 top-0",

        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday: "text-[var(--color-text-muted)] rounded-md w-9 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",

        // <td> — receives `group` so child variants can read its data-* attrs and class list
        day: "group size-9 px-0 text-sm",

        // <button> — all range logic lives here via group-* variants
        day_button: cn(
          // Base: ghost-style, rounded pill shape
          "relative flex size-9 items-center justify-center rounded-full p-0 text-sm",
          "text-[var(--color-text-primary)] outline-offset-2",
          "hover:bg-[#2845D6]/10",
          // Smooth transition for start/end cells only
          "group-[[data-selected]:not(.range-middle)]:[transition-property:color,background-color,border-radius]",
          "group-[[data-selected]:not(.range-middle)]:duration-150",
          // Any selected day gets primary bg (covers start, end, and single-day)
          "group-data-[selected]:bg-[#2845D6]",
          "group-data-[selected]:text-white",
          "group-data-[selected]:hover:bg-[#2845D6]",
          // Range start (not also the end): remove right rounding → left-cap pill
          "group-[.range-start:not(.range-end)]:rounded-e-none",
          // Range end (not also the start): remove left rounding → right-cap pill
          "group-[.range-end:not(.range-start)]:rounded-s-none",
          // Range middle: flat bar with light primary bg, normal text
          "group-[.range-middle]:rounded-none",
          "group-data-[selected]:group-[.range-middle]:bg-[#2845D6]/10",
          "group-data-[selected]:group-[.range-middle]:text-[var(--color-text-primary)]",
          "group-data-[selected]:group-[.range-middle]:hover:bg-[#2845D6]/10",
          // Disabled
          "group-data-[disabled]:pointer-events-none",
          "group-data-[disabled]:text-[var(--color-text-muted)] group-data-[disabled]:opacity-40",
          // Focus ring
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2845D6]/60",
        ),

        // Emit real class names so group-[.range-*] selectors can match
        selected: "",
        today: "",
        outside: "text-[var(--color-text-muted)] opacity-30",
        disabled: "opacity-50",
        range_start: "range-start",
        range_end: "range-end",
        range_middle: "range-middle",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...rest }) => {
          if (orientation === "left") return <ChevronLeft className="h-4 w-4" {...rest} />;
          return <ChevronRight className="h-4 w-4" {...rest} />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };

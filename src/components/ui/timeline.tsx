"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Check,
  Clock,
  X,
  AlertCircle,
  Minus,
} from "lucide-react";

// ── Variant Definitions ───────────────────────────────────────────────────────

const timelineVariants = cva("relative flex flex-col", {
  variants: {
    variant: {
      default:  "gap-4",
      compact:  "gap-2",
      spacious: "gap-8",
    },
    orientation: {
      vertical:   "flex-col",
      horizontal: "flex-row",
    },
  },
  defaultVariants: { variant: "default", orientation: "vertical" },
});

const timelineItemVariants = cva("relative flex gap-3 pb-2 items-start", {
  variants: {
    orientation: {
      vertical:   "flex-row",
      horizontal: "flex-col min-w-64 shrink-0",
    },
  },
  defaultVariants: { orientation: "vertical" },
});

const timelineConnectorVariants = cva("absolute w-0.5", {
  variants: {
    orientation: {
      vertical:   "left-3 top-3 h-full",
      horizontal: "top-3 left-3 w-full h-0.5",
    },
    status: {
      default:     "bg-[var(--color-border)]",
      completed:   "bg-green-500/60",
      active:      "bg-[#2845D6]/40",
      pending:     "bg-yellow-500",
      waiting:     "bg-yellow-200",
      error:       "bg-red-500/60",
      approved:    "bg-green-500/60",
      edited:      "bg-green-500/60",
      disapproved: "bg-red-500/60",
      processing:  "bg-yellow-500/40",
      canceled:    "bg-gray-300/60",
    },
  },
  defaultVariants: { orientation: "vertical", status: "default" },
});

const timelineIconVariants = cva(
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
  {
    variants: {
      status: {
        default:     "border-2 border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]",
        completed:   "border-2 border-green-500 bg-green-500 text-white",
        active:      "border-2 border-[#2845D6] bg-[#2845D6] text-white",
        pending:     "border-2 border-yellow-500 bg-yellow-500 text-white",
        error:       "border-2 border-red-500 bg-red-500 text-white",
        approved:    "border-2 border-green-500 bg-green-500 text-white",
        edited:      "border-2 border-green-500 bg-green-500 text-white",
        disapproved: "border-2 border-red-500 bg-red-500 text-white",
        processing:  "border-2 border-yellow-500 bg-yellow-500 text-white dark:text-black",
        canceled:    "border-2 border-gray-400 bg-gray-400 text-white",
        waiting:     "border-2 border-yellow-200 bg-yellow-100 text-yellow-400",
      },
    },
    defaultVariants: { status: "default" },
  },
);

// ── Types ─────────────────────────────────────────────────────────────────────

export type TimelineStatus =
  | "default"
  | "completed"
  | "active"
  | "pending"
  | "error"
  | "approved"
  | "edited"
  | "disapproved"
  | "processing"
  | "canceled"
  | "waiting";

export interface TimelineItem {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  timestamp?: string | Date;
  status?: TimelineStatus;
  /** Custom icon node rendered inside the circle marker. */
  icon?: React.ReactNode;
  /** Arbitrary content rendered below the description. */
  content?: React.ReactNode;
}

export interface TimelineProps extends VariantProps<typeof timelineVariants> {
  items: TimelineItem[];
  className?: string;
  showConnectors?: boolean;
  showTimestamps?: boolean;
  timestampPosition?: "top" | "bottom" | "inline";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStatusIcon(status: TimelineStatus | undefined): React.ReactNode {
  switch (status) {
    case "completed":
    case "approved":
    case "edited":
      return <Check className="h-4 w-4 dark:text-black/50" />;
    case "active":
    case "processing":
      return <Clock className="h-4 w-4 dark:text-black/50" />;
    case "error":
    case "disapproved":
      return <X className="h-4 w-4 dark:text-black/50" />;
    case "canceled":
      return <Minus className="h-4 w-4 dark:text-black/50" />;
    case "pending":
    case "waiting":
      return <AlertCircle className="h-4 w-4 dark:text-black/50" />;
    default:
      return <div className="h-1.5 w-1.5 rounded-full bg-current" />;
  }
}

function formatTimestamp(timestamp: string | Date): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  return [
    date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }),
  ].join(' ');
}

// ── Timeline Component ────────────────────────────────────────────────────────

export function Timeline({
  items,
  className,
  variant,
  orientation = "vertical",
  showConnectors = true,
  showTimestamps = true,
  timestampPosition = "top",
}: TimelineProps) {
  const content = (
    <div
      className={cn(
        timelineVariants({ variant, orientation }),
        orientation === "horizontal" ? "pb-4" : "",
      )}
    >
      {items.map((item, index) => (
        <div
          key={item.id}
          className={cn(timelineItemVariants({ orientation }))}
        >
          {/* Connector line to next item */}
          {showConnectors && index < items.length - 1 && (() => {
            const nextStatus = items[index + 1]?.status;
            const isGradient = item.status === "pending" && nextStatus === "waiting";
            return (
              <div
                className={cn(timelineConnectorVariants({ orientation, status: item.status }))}
                style={isGradient ? { background: "linear-gradient(to bottom, #eab308, #fef9c2b6)" } : undefined}
              />
            );
          })()}

          {/* Circle marker */}
          <div className="relative z-10 flex shrink-0 self-start">
            <div className={cn(timelineIconVariants({ status: item.status }))}>
              {item.icon ?? getStatusIcon(item.status)}
            </div>
          </div>

          {/* Item content */}
          <div className="flex min-w-0 flex-1 flex-col gap-1 self-start">
            {showTimestamps && timestampPosition === "top" && item.timestamp && (
              <time className="text-[11px] text-[var(--color-text-muted)]">
                {formatTimestamp(item.timestamp)}
              </time>
            )}

            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] leading-tight">
                {item.title}
              </h3>
              {showTimestamps &&
                timestampPosition === "inline" &&
                item.timestamp && (
                  <time className="shrink-0 text-[11px] text-[var(--color-text-muted)]">
                    {formatTimestamp(item.timestamp)}
                  </time>
                )}
            </div>

            {item.description && (
              <div className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                {item.description}
              </div>
            )}

            {item.content && (
              <div className="mt-1">{item.content}</div>
            )}

            {showTimestamps &&
              timestampPosition === "bottom" &&
              item.timestamp && (
                <time className="text-[11px] text-[var(--color-text-muted)]">
                  {formatTimestamp(item.timestamp)}
                </time>
              )}
          </div>
        </div>
      ))}
    </div>
  );

  if (orientation === "horizontal") {
    return (
      <ScrollArea orientation="horizontal" className={cn("w-full", className)}>
        {content}
      </ScrollArea>
    );
  }

  return <div className={className}>{content}</div>;
}

export {
  timelineVariants,
  timelineItemVariants,
  timelineConnectorVariants,
  timelineIconVariants,
};

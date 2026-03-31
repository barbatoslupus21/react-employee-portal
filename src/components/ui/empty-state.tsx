"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icons?: LucideIcon[];
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  className?: string;
}

export function EmptyState({
  title,
  description,
  icons = [],
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "text-center",
        "rounded-xl p-14 w-full",
        "group hover:bg-[var(--color-bg-elevated)] transition duration-500 hover:duration-200",
        className,
      )}
    >
      {icons.length > 0 && (
        <div className="flex justify-center isolate">
          {icons.length === 3 ? (
            <>
              <div className="bg-[var(--color-bg-elevated)] size-12 grid place-items-center rounded-xl relative left-2.5 top-1.5 -rotate-6 shadow-sm ring-1 ring-[var(--color-border)] group-hover:-translate-x-5 group-hover:-rotate-12 group-hover:-translate-y-0.5 transition duration-500 group-hover:duration-200">
                {React.createElement(icons[0], { className: "w-6 h-6 text-[var(--color-text-muted)]" })}
              </div>
              <div className="bg-[var(--color-bg-elevated)] size-12 grid place-items-center rounded-xl relative z-10 shadow-sm ring-1 ring-[var(--color-border)] group-hover:-translate-y-0.5 transition duration-500 group-hover:duration-200">
                {React.createElement(icons[1], { className: "w-6 h-6 text-[var(--color-text-muted)]" })}
              </div>
              <div className="bg-[var(--color-bg-elevated)] size-12 grid place-items-center rounded-xl relative right-2.5 top-1.5 rotate-6 shadow-sm ring-1 ring-[var(--color-border)] group-hover:translate-x-5 group-hover:rotate-12 group-hover:-translate-y-0.5 transition duration-500 group-hover:duration-200">
                {React.createElement(icons[2], { className: "w-6 h-6 text-[var(--color-text-muted)]" })}
              </div>
            </>
          ) : (
            <div className="bg-[var(--color-bg-elevated)] size-12 grid place-items-center rounded-xl shadow-sm ring-1 ring-[var(--color-border)] group-hover:-translate-y-0.5 transition duration-500 group-hover:duration-200">
              {React.createElement(icons[0], { className: "w-6 h-6 text-[var(--color-text-muted)]" })}
            </div>
          )}
        </div>
      )}

      <h2 className="text-[var(--color-text-primary)] font-medium mt-6 text-sm">{title}</h2>

      {description && (
        <p className="text-xs text-[var(--color-text-muted)] mt-1 whitespace-pre-line">{description}</p>
      )}

      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={cn(
            "mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium",
            "border border-[var(--color-border)] bg-[var(--color-bg-elevated)]",
            "text-[var(--color-text-primary)]",
            "hover:bg-[var(--color-bg)] hover:shadow-sm active:shadow-none",
            "transition-all duration-200",
          )}
        >
          {action.icon && <span>{action.icon}</span>}
          {action.label}
        </button>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface RoundedTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
  delayDuration?: number;
  className?: string;
  contentClassName?: string;
}

export function RoundedTooltip({
  content,
  children,
  side = "top",
  sideOffset = 6,
  delayDuration = 300,
  className,
  contentClassName,
}: RoundedTooltipProps) {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild className={className}>
          {children}
        </TooltipTrigger>
        <TooltipContent
          side={side}
          sideOffset={sideOffset}
          className={cn(
            "rounded-lg px-3 py-1.5 text-[10px] font-medium shadow-md",
            "bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border border-[var(--color-border)]",
            contentClassName
          )}
        >
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

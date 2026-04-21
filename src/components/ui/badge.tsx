import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-1.5 text-xs font-medium leading-normal transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[#2845D6] text-white",
        secondary: "border-transparent bg-[var(--color-bg-card)] text-[var(--color-text-secondary)]",
        destructive: "border-transparent bg-red-600 text-white",
        outline: "text-[var(--color-text-primary)] border-[var(--color-border)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

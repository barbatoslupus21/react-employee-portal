import React from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface InteractiveHoverButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string;
}

const InteractiveHoverButton = React.forwardRef<
  HTMLButtonElement,
  InteractiveHoverButtonProps
>(({ text = "Button", className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-6 py-2.5 text-center text-sm font-semibold text-[var(--color-text-primary)]",
        className,
      )}
      {...props}
    >
      {/* Text that slides out to the right on hover */}
      <span className="inline-block transition-all duration-300 group-hover:translate-x-12 group-hover:opacity-0">
        {text}
      </span>
      {/* Icon + text that slides in from the right on hover */}
      <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 text-white opacity-0 transition-all duration-300 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0">
        <span>{text}</span>
        <ArrowRight className="size-4" />
      </div>
      {/* Expanding background blob */}
      <div className="absolute left-1/2 top-1/2 h-0 w-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2845D6] transition-all duration-300 group-hover:h-full group-hover:w-full group-hover:rounded-none group-hover:scale-[2]" />
    </button>
  );
});

InteractiveHoverButton.displayName = "InteractiveHoverButton";

export { InteractiveHoverButton };

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, value: valueProp, defaultValue, onChange, maxLength, ...props }, ref) => {
    const isControlled = valueProp !== undefined;
    const [internalValue, setInternalValue] = React.useState<string>(
      typeof defaultValue === "string" ? defaultValue : ""
    );
    const displayValue = isControlled ? (valueProp as string) : internalValue;
    const showCharacterCount = typeof maxLength === "number";

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!isControlled) {
        setInternalValue(e.target.value);
      }
      onChange?.(e);
    };

    return (
      <div className="flex flex-col gap-1.5">
        <textarea
          className={cn(
            "flex min-h-[80px] w-full rounded-lg border border-[var(--color-border)]",
            "bg-[var(--color-bg-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)]",
            "placeholder:text-[var(--color-text-muted)]",
            "focus:outline-none focus:shadow-md focus:ring-0",
            "disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
            className
          )}
          ref={ref}
          value={valueProp}
          defaultValue={!isControlled ? defaultValue : undefined}
          onChange={handleChange}
          maxLength={maxLength}
          {...props}
        />
        {showCharacterCount && (
          <div className="flex justify-end text-xs text-[var(--color-text-muted)]">
            <span>
              {displayValue?.length ?? 0}/{maxLength}
            </span>
          </div>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };

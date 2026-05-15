import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  showCharacterCount?: boolean;
  autoResize?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      value: valueProp,
      defaultValue,
      onChange,
      maxLength,
      showCharacterCount = true,
      autoResize = false,
      ...props
    },
    ref,
  ) => {
    const isControlled = valueProp !== undefined;
    const [internalValue, setInternalValue] = React.useState<string>(
      typeof defaultValue === "string" ? defaultValue : ""
    );
    const displayValue = isControlled ? (valueProp as string) : internalValue;
    const shouldShowCharacterCount = typeof maxLength === "number" && showCharacterCount;

    const textAreaRef = React.useRef<HTMLTextAreaElement | null>(null);

    const handleRef = (instance: HTMLTextAreaElement | null) => {
      textAreaRef.current = instance;
      if (typeof ref === "function") {
        ref(instance);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = instance;
      }
    };

    const resizeTextarea = React.useCallback(() => {
      const element = textAreaRef.current;
      if (!autoResize || !element) return;
      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight}px`;
    }, [autoResize]);

    React.useLayoutEffect(() => {
      resizeTextarea();
    }, [displayValue, resizeTextarea]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!isControlled) {
        setInternalValue(e.target.value);
      }
      if (autoResize) {
        requestAnimationFrame(() => resizeTextarea());
      }
      onChange?.(e);
    };

    return (
      <div className="flex flex-col gap-1.5">
        <textarea
          className={cn(
            "flex w-full min-h-[40px] rounded-lg border px-3 py-2 text-xs transition-colors resize-none overflow-hidden",
            "bg-[var(--color-bg-elevated)] border-[var(--color-border)] text-[var(--color-text-primary)]",
            "placeholder:text-[var(--color-text-muted)] placeholder:text-xs placeholder:text-normal",
            "focus:outline-none focus-visible:outline-none focus:border-[var(--color-border)] focus:ring-0 focus:shadow-none",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          ref={handleRef}
          value={valueProp}
          defaultValue={!isControlled ? defaultValue : undefined}
          onChange={handleChange}
          maxLength={maxLength}
          {...props}
        />
        {shouldShowCharacterCount && (
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

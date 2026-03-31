"use client";

import * as React from "react";
import { X, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string;
  success?: string;
  onClear?: () => void;
  wrapperClassName?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = "text",
      label,
      error,
      success,
      onClear,
      value: valueProp,
      defaultValue,
      onChange,
      wrapperClassName,
      id: idProp,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const id = idProp ?? generatedId;

    const isControlled = valueProp !== undefined;
    const [internalValue, setInternalValue] = React.useState<string>(
      typeof defaultValue === "string" ? defaultValue : ""
    );
    const displayValue = isControlled ? valueProp : internalValue;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isControlled) setInternalValue(e.target.value);
      onChange?.(e);
    };

    const handleClear = () => {
      if (!isControlled) setInternalValue("");
      onClear?.();
    };

    const hasValue = displayValue !== "" && displayValue !== undefined && displayValue !== null;
    const showClear = onClear && hasValue;

    return (
      <div className={cn("flex flex-col gap-1.5", wrapperClassName)}>
        {label && (
          <label
            htmlFor={id}
            className="text-sm font-medium text-[var(--color-text-primary)]"
          >
            {label}
          </label>
        )}

        <div className="relative">
          <input
            id={id}
            ref={ref}
            type={type}
            value={valueProp}
            defaultValue={!isControlled ? defaultValue : undefined}
            onChange={handleChange}
            className={cn(
              "flex h-9 w-full rounded-lg border px-3 py-2 text-sm transition-colors",
              "bg-[var(--color-bg-elevated)] border-[var(--color-border-strong)] text-[var(--color-text-primary)]",
              "placeholder:text-[var(--color-text-muted)]",
              "focus:outline-none focus:shadow-md focus:ring-0",
              "disabled:cursor-not-allowed disabled:opacity-50",
              error && "border-red-500",
              success && !error && "border-green-500",
              (showClear || error || success) && "pr-9",
              className
            )}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : success ? `${id}-success` : undefined}
            {...props}
          />

          <div className="absolute inset-y-0 right-0 flex items-center pr-3 gap-1">
            {error && !showClear && (
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
            )}
            {success && !error && !showClear && (
              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
            )}
            {showClear && (
              <button
                type="button"
                onClick={handleClear}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                aria-label="Clear input"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {error && (
          <p id={`${id}-error`} className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {error}
          </p>
        )}
        {success && !error && (
          <p id={`${id}-success`} className="text-xs text-green-500 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {success}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };

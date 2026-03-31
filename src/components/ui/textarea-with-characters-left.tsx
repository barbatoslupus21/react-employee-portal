"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaWithCharactersLeftProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  maxLength: number;
  error?: string;
  wrapperClassName?: string;
}

const TextareaWithCharactersLeft = React.forwardRef<
  HTMLTextAreaElement,
  TextareaWithCharactersLeftProps
>(
  (
    {
      className,
      label,
      maxLength,
      error,
      wrapperClassName,
      value: valueProp,
      defaultValue,
      onChange,
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
    const displayValue = isControlled ? (valueProp as string) : internalValue;
    const remaining = maxLength - (displayValue?.length ?? 0);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!isControlled) setInternalValue(e.target.value);
      onChange?.(e);
    };

    return (
      <div className={cn("flex flex-col gap-1.5", wrapperClassName)}>
        <div className="flex items-center justify-between">
          {label && (
            <label
              htmlFor={id}
              className="text-sm font-medium text-[var(--color-text-primary)]"
            >
              {label}
            </label>
          )}
          <span
            className={cn(
              "text-xs tabular-nums transition-colors",
              remaining < 20
                ? remaining < 0
                  ? "text-red-500 font-medium"
                  : "text-orange-500"
                : "text-[var(--color-text-muted)]"
            )}
          >
            {remaining} left
          </span>
        </div>

        <textarea
          id={id}
          ref={ref}
          maxLength={maxLength}
          value={valueProp}
          defaultValue={!isControlled ? defaultValue : undefined}
          onChange={handleChange}
          className={cn(
            "flex min-h-[80px] w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors resize-none",
            "bg-[var(--color-bg-elevated)] border-[var(--color-border-strong)] text-[var(--color-text-primary)]",
            "placeholder:text-[var(--color-text-muted)]",
            "focus:outline-none focus:border-transparent focus:shadow-sm",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-red-500 focus:ring-red-500",
            className
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          {...props}
        />

        {error && (
          <p id={`${id}-error`} className="text-xs text-red-500">
            {error}
          </p>
        )}
      </div>
    );
  }
);
TextareaWithCharactersLeft.displayName = "TextareaWithCharactersLeft";

export { TextareaWithCharactersLeft };

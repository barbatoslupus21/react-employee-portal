'use client';

import React from 'react';
import { clsx } from 'clsx';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChoiceboxGroupProps {
  direction: 'row' | 'column';
  label?: string;
  showLabel?: boolean;
  onChange:
    | React.Dispatch<React.SetStateAction<string>>
    | ((value: string) => void);
  type: 'radio' | 'checkbox';
  value: string | string[];
  children: React.ReactNode;
  disabled?: boolean;
}

interface ChoiceboxItemProps {
  title: string;
  description: string;
  value: string;
  type?: 'radio' | 'checkbox';
  valueSelected?: string | string[];
  onChange?: (value: string) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

// ── Radio/Checkbox indicator ───────────────────────────────────────────────────

function IndicatorIcon({
  isSelected,
  type,
}: {
  isSelected: boolean;
  type: 'radio' | 'checkbox';
}) {
  if (type === 'radio') {
    return (
      <span
        className={clsx(
          'relative inline-block w-4 h-4 rounded-full border-2 transition-colors duration-200',
          'after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2',
          'after:w-2 after:h-2 after:rounded-full after:transition-transform after:duration-200',
          isSelected
            ? 'border-[#2845D6] after:bg-[#2845D6] after:scale-100'
            : 'border-[var(--color-border-strong)] after:bg-[var(--color-border-strong)] after:scale-0',
        )}
      />
    );
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center w-4 h-4 rounded border-2 transition-colors duration-200',
        isSelected
          ? 'bg-[#2845D6] border-[#2845D6]'
          : 'bg-transparent border-[var(--color-border-strong)]',
      )}
    >
      {isSelected && (
        <svg height="10" viewBox="0 0 20 20" width="10" className="fill-white">
          <path
            d="M14 7L8.5 12.5L6 10"
            stroke="white"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
            fill="none"
          />
        </svg>
      )}
    </span>
  );
}

// ── ChoiceboxItem ──────────────────────────────────────────────────────────────

function ChoiceboxItem({
  title,
  description,
  value,
  type = 'radio',
  valueSelected,
  onChange,
  disabled,
  children,
}: ChoiceboxItemProps) {
  const isSelected = !!(
    typeof valueSelected === 'string'
      ? value === valueSelected
      : valueSelected?.includes(value)
  );

  const onClick = () => {
    if (onChange && !disabled) onChange(value);
  };

  return (
    <div
      className={clsx(
        'border flex-1 rounded-lg duration-150 select-none',
        isSelected
          ? 'border-[#2845D6] bg-[#2845D6]/[0.08]'
          : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)]',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer hover:border-[var(--color-border-strong)]',
      )}
      onClick={onClick}
      role="option"
      aria-selected={isSelected}
      aria-disabled={disabled}
    >
      <div className="flex items-center gap-3 py-2 px-3">
        <div className="flex flex-col gap-0.5 flex-1 min-w-0 font-sans text-xs">
          <span
            className={clsx(
              'font-semibold leading-snug',
              isSelected ? 'text-[#2845D6]' : 'text-[var(--color-text-primary)]',
            )}
          >
            {title}
          </span>
          <span
            className={clsx(
              'text-[11px] leading-snug',
              isSelected ? 'text-[#2845D6]/80' : 'text-[var(--color-text-muted)]',
            )}
          >
            {description}
          </span>
        </div>
        <div className="flex items-center ml-auto shrink-0">
          <input
            disabled={disabled}
            type={type}
            value={value}
            checked={isSelected}
            onChange={onClick}
            className="sr-only"
            tabIndex={-1}
          />
          <IndicatorIcon isSelected={isSelected} type={type} />
        </div>
      </div>
      {children && isSelected && (
        <div
          className={clsx(
            'border-t',
            isSelected ? 'border-[#2845D6]/30' : 'border-[var(--color-border)]',
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ── ChoiceboxGroup ─────────────────────────────────────────────────────────────

function ChoiceboxGroupBase({
  direction,
  label,
  showLabel,
  onChange,
  type,
  value,
  children,
  disabled,
}: ChoiceboxGroupProps) {
  return (
    <div className="flex flex-col gap-2">
      {showLabel && label && (
        <label className="text-xs font-medium text-[var(--color-text-primary)]">
          {label}
        </label>
      )}
      <div
        className={clsx(
          'flex gap-3',
          direction === 'row' ? 'flex-row' : 'flex-col',
        )}
      >
        {React.Children.map(children, child => {
          const itemProps = disabled
            ? { onChange, type, valueSelected: value, disabled }
            : { onChange, type, valueSelected: value };
          return React.cloneElement(
            child as React.ReactElement<ChoiceboxItemProps>,
            itemProps,
          );
        })}
      </div>
    </div>
  );
}

export const ChoiceboxGroup = Object.assign(ChoiceboxGroupBase, {
  Item: ChoiceboxItem,
});

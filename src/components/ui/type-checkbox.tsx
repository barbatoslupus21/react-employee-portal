'use client';

import { Checkbox } from '@ark-ui/react/checkbox';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TypeCheckboxProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label: string;
  readOnly?: boolean;
  className?: string;
}

export function TypeCheckbox({
  checked,
  onChange,
  label,
  readOnly = false,
  className,
}: TypeCheckboxProps) {
  return (
    <Checkbox.Root
      checked={checked}
      onCheckedChange={readOnly ? undefined : (details) => onChange?.(details.checked === true)}
      className={cn(
        'flex items-center gap-2 select-none mt-1.5 mb-1.5',
        readOnly ? 'cursor-default' : 'cursor-pointer',
        className,
      )}
    >
      <Checkbox.Control
        className={cn(
          'w-4 h-4 rounded flex items-center justify-center transition-all duration-200 shrink-0',
          'border border-[var(--color-border)]',
          checked ? 'bg-[#2845D6]' : 'bg-white',
        )}
      >
        <Checkbox.Indicator>
          <CheckIcon className="w-3.5 h-3.5 text-white" />
        </Checkbox.Indicator>
      </Checkbox.Control>
      <Checkbox.Label className={cn(
        'text-xs text-[var(--color-text-muted)]',
        readOnly ? 'cursor-default' : 'cursor-pointer',
      )}>
        {label}
      </Checkbox.Label>
      <Checkbox.HiddenInput />
    </Checkbox.Root>
  );
}



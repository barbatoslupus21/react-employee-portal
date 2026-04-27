'use client';

import { Checkbox } from '@ark-ui/react/checkbox';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BasicCheckboxProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

export default function BasicCheckbox({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  className,
}: BasicCheckboxProps) {
  return (
    <Checkbox.Root
      checked={checked}
      disabled={disabled}
      onCheckedChange={(details) => onCheckedChange?.(details.checked === true)}
      className={cn(
        'flex items-center gap-2 cursor-pointer',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <Checkbox.Control className="w-4 h-4 bg-white border-2 border-gray-300 rounded data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500 data-hover:border-gray-400 dark:bg-gray-900 dark:border-gray-600 dark:data-[state=checked]:bg-blue-500 dark:data-[state=checked]:border-blue-500 dark:data-hover:border-gray-400 transition-all duration-200 flex items-center justify-center">
        <Checkbox.Indicator>
          <CheckIcon className="w-3 h-3 text-white" />
        </Checkbox.Indicator>
      </Checkbox.Control>
      <Checkbox.Label className="text-xs font-normal text-[var(--color-text-muted)] cursor-pointer">
        {label}
      </Checkbox.Label>
      <Checkbox.HiddenInput />
    </Checkbox.Root>
  );
}

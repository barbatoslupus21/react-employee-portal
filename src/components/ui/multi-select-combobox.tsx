"use client";

import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

interface MultiSelectComboboxProps {
  options: ComboboxOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  maxSelected?: number;
  disabled?: boolean;
}

export function MultiSelectCombobox({
  options,
  selected,
  onChange,
  placeholder = "Select items...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  className,
  maxSelected,
  disabled = false,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      if (maxSelected && selected.length >= maxSelected) return;
      onChange([...selected, value]);
    }
  };

  const remove = (value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter((s) => s !== value));
  };

  const selectedOptions = options.filter((o) => selected.includes(o.value));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "flex min-h-9 w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors",
            "bg-[var(--color-bg-elevated)] border-[var(--color-border-strong)] text-[var(--color-text-primary)]",
            "hover:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            open && "ring-2 ring-[var(--color-accent)] border-transparent",
            className
          )}
        >
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {selectedOptions.length === 0 ? (
              <span className="text-[var(--color-text-muted)]">{placeholder}</span>
            ) : (
              selectedOptions.map((opt) => (
                <span
                  key={opt.value}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium bg-[var(--color-bg-card)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)]"
                >
                  {opt.label}
                  <button
                    type="button"
                    onClick={(e) => remove(opt.value, e)}
                    className="hover:opacity-70 transition-opacity"
                    aria-label={`Remove ${opt.label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-full p-0 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] shadow-lg"
        align="start"
        sideOffset={4}
      >
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            className="h-9 text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
          />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-sm text-[var(--color-text-muted)]">
              {emptyText}
            </CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const isSelected = selected.includes(opt.value);
                const isDisabled = !isSelected && !!maxSelected && selected.length >= maxSelected;
                return (
                  <CommandItem
                    key={opt.value}
                    value={opt.value}
                    onSelect={() => !isDisabled && toggle(opt.value)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer",
                      "text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)]",
                      isSelected && "bg-[var(--color-bg-card)]",
                      isDisabled && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border flex-shrink-0",
                        isSelected
                          ? "bg-[var(--color-accent)] border-[var(--color-accent)]"
                          : "border-[var(--color-border-strong)]"
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{opt.label}</span>
                      {opt.description && (
                        <span className="text-xs text-[var(--color-text-muted)] truncate">{opt.description}</span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

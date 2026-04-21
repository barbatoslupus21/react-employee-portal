"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Tag {
  id: string;
  label: string;
  color?: string;
}

interface TagsSelectorProps {
  tags: Tag[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
  maxSelected?: number;
  disabled?: boolean;
}

export function TagsSelector({
  tags,
  selected,
  onChange,
  placeholder = "Select tags...",
  className,
  maxSelected,
  disabled = false,
}: TagsSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  const filteredTags = tags.filter(
    (t) =>
      t.label.toLowerCase().includes(search.toLowerCase()) &&
      !selected.includes(t.id)
  );

  const selectedTags = tags.filter((t) => selected.includes(t.id));

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      if (maxSelected && selected.length >= maxSelected) return;
      onChange([...selected, id]);
    }
  };

  // close on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className={cn("relative flex flex-col gap-1.5", className)}>
      {/* Selected tags row */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 min-h-[28px]">
          <AnimatePresence>
            {selectedTags.map((tag) => (
              <motion.span
                key={tag.id}
                layoutId={`tag-${tag.id}`}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: tag.color ? `${tag.color}22` : "var(--color-bg-card)",
                  color: tag.color ?? "var(--color-text-primary)",
                  border: `1px solid ${tag.color ? `${tag.color}44` : "var(--color-border-strong)"}`,
                }}
              >
                {tag.label}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => toggle(tag.id)}
                    className="ml-0.5 rounded-full hover:opacity-70 transition-opacity"
                    aria-label={`Remove ${tag.label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Trigger input */}
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex h-9 w-full items-center rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors",
          "bg-[var(--color-bg-elevated)] border-[var(--color-border-strong)] text-[var(--color-text-muted)]",
          "hover:border-[var(--color-accent)] focus:outline-none",
          disabled && "opacity-50 cursor-not-allowed",
          open && "ring-2 ring-[var(--color-accent)] border-transparent"
        )}
        onClick={() => !disabled && setOpen((p) => !p)}
      >
        <span>{placeholder}</span>
        {maxSelected && (
          <span className="ml-auto text-xs text-[var(--color-text-muted)]">
            {selected.length}/{maxSelected}
          </span>
        )}
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border shadow-lg overflow-hidden",
              "bg-[var(--color-bg-elevated)] border-[var(--color-border-strong)]"
            )}
          >
            {/* Search */}
            <div className="p-2 border-b border-[var(--color-border)]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tags..."
                autoFocus
                className={cn(
                  "w-full px-2 py-1 text-sm rounded-md bg-[var(--color-bg-card)] text-[var(--color-text-primary)]",
                  "placeholder:text-[var(--color-text-muted)] focus:outline-none"
                )}
              />
            </div>

            {/* Options list */}
            <div className="max-h-48 overflow-y-auto p-1" role="listbox">
              {filteredTags.length === 0 ? (
                <p className="py-4 text-center text-sm text-[var(--color-text-muted)]">
                  {search ? "No matching tags" : "All tags selected"}
                </p>
              ) : (
                filteredTags.map((tag) => (
                  <motion.button
                    key={tag.id}
                    type="button"
                    layoutId={`option-${tag.id}`}
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      toggle(tag.id);
                      if (maxSelected && selected.length + 1 >= (maxSelected ?? 0)) {
                        setOpen(false);
                        setSearch("");
                      }
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-left transition-colors",
                      "hover:bg-[var(--color-bg-card)] text-[var(--color-text-primary)]"
                    )}
                    whileTap={{ scale: 0.98 }}
                  >
                    {tag.color && (
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                    )}
                    {tag.label}
                  </motion.button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

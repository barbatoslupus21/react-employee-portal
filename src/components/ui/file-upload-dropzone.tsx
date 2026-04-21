'use client';

import React, { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

type FileUploadDropzoneProps = {
  files: File[];
  onFilesChange: (files: File[]) => void;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
  helperText?: string;
  /** File names that should be highlighted as errors (e.g. failed validation or upload). */
  errorFileNames?: Set<string>;
};

export function FileUploadDropzone({
  files,
  onFilesChange,
  accept,
  multiple = false,
  disabled = false,
  label = 'Click to select or drag & drop',
  helperText,
  errorFileNames,
}: FileUploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function upsertFiles(newFiles: FileList | File[]) {
    const items = Array.from(newFiles);
    const merged = [...files];
    for (const f of items) {
      if (!merged.some((existing) => existing.name === f.name && existing.size === f.size)) {
        merged.push(f);
      }
    }
    onFilesChange(merged);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragging(false);
    const dropped = e.dataTransfer.files;
    if (dropped?.length) upsertFiles(dropped);
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    if (disabled) return;
    const picked = e.target.files;
    if (picked?.length) upsertFiles(picked);
    // Reset so the same file(s) can be re-selected and onChange fires every time.
    e.target.value = '';
  }

  function removeFile(name: string) {
    onFilesChange(files.filter((f) => f.name !== name));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!disabled) setIsDragging(true); }}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); if (!disabled) setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
        onDrop={handleDrop}
        className={cn(
          'flex h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl',
          'border-[3px] border-dashed transition-colors text-center',
          disabled ? 'pointer-events-none opacity-60' : '',
          isDragging
            ? 'border-[#2845D6] bg-[#2845D6]/5'
            : 'border-[var(--color-border-strong,var(--color-border))] hover:border-[#2845D6]/50 hover:bg-[var(--color-bg-elevated,var(--color-bg-card))]',
        )}
      >
        <Upload
          size={36}
          className={cn('transition-colors', isDragging ? 'text-[#2845D6]' : 'text-[var(--color-text-muted)]')}
        />
        <div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">{label}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {files.length > 0
              ? `${files.length} file${files.length !== 1 ? 's' : ''} selected`
              : (helperText ?? accept)}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={handleFilePick}
        />
      </div>

      <AnimatePresence>
        {files.length > 0 && (
          <motion.ul
            key="dropzone-file-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="mt-1 space-y-1"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {files.map((f) => {
                const isError = errorFileNames?.has(f.name) ?? false;
                return (
                  <motion.li
                    key={`${f.name}-${f.size}`}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] } }}
                    transition={{ duration: 0.18 }}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs',
                      isError
                        ? 'bg-red-50 dark:bg-red-950/30'
                        : 'bg-[var(--color-bg-card)]',
                    )}
                  >
                    <span className={cn('truncate', isError ? 'text-red-700 dark:text-red-400 font-medium' : 'text-[var(--color-text-primary)]')}>
                      {f.name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeFile(f.name); }}
                      className={cn(
                        'shrink-0 transition-colors',
                        isError ? 'text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-400' : 'text-[var(--color-text-muted)] hover:text-red-500',
                      )}
                    >
                      <X size={13} />
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

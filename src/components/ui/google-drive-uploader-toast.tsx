"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, File, CheckCircle2, XCircle, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
export type UploadStatus = "pending" | "uploading" | "success" | "error";

export interface UploadFile {
  id: string;
  name: string;
  size?: number;
  progress?: number;
  status: UploadStatus;
  errorMessage?: string;
}

interface UploadToastProps {
  files: UploadFile[];
  onDismiss?: (id: string) => void;
  onDismissAll?: () => void;
  className?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusIcon({ status }: { status: UploadStatus }) {
  if (status === "uploading") return <Loader2 className="h-4 w-4 animate-spin text-[var(--color-accent)]" />;
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === "error") return <XCircle className="h-4 w-4 text-red-500" />;
  return <Upload className="h-4 w-4 text-[var(--color-text-muted)]" />;
}

// ── Upload Toast ───────────────────────────────────────────────────────────────
export function UploadToast({ files, onDismiss, onDismissAll, className }: UploadToastProps) {
  if (files.length === 0) return null;

  const completed = files.filter((f) => f.status === "success" || f.status === "error").length;
  const uploading = files.filter((f) => f.status === "uploading").length;
  const overallProgress =
    files.reduce((sum, f) => sum + (f.progress ?? (f.status === "success" ? 100 : 0)), 0) / files.length;

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 w-80 rounded-xl border shadow-xl overflow-hidden",
        "bg-[var(--color-bg-elevated)] border-[var(--color-border-strong)]",
        className
      )}
      role="status"
      aria-live="polite"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-[var(--color-accent)]" />
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            {uploading > 0 ? `Uploading ${uploading} file${uploading > 1 ? "s" : ""}…` : `${completed} of ${files.length} complete`}
          </span>
        </div>
        {onDismissAll && completed === files.length && (
          <button
            type="button"
            onClick={onDismissAll}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="Dismiss all"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Overall progress bar */}
      {uploading > 0 && (
        <div className="h-0.5 bg-[var(--color-bg-card)]">
          <motion.div
            className="h-full bg-[var(--color-accent)]"
            initial={{ width: 0 }}
            animate={{ width: `${overallProgress}%` }}
            transition={{ ease: "easeOut" }}
          />
        </div>
      )}

      {/* File list */}
      <div className="max-h-52 overflow-y-auto divide-y divide-[var(--color-border)]">
        <AnimatePresence>
          {files.map((file) => (
            <motion.div
              key={file.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-start gap-2.5 px-4 py-2.5">
                <div className="mt-0.5 flex-shrink-0">
                  <StatusIcon status={file.status} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                      {file.name}
                    </p>
                    {onDismiss && (file.status === "success" || file.status === "error") && (
                      <button
                        type="button"
                        onClick={() => onDismiss(file.id)}
                        className="flex-shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                        aria-label={`Dismiss ${file.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {file.size && (
                    <p className="text-xs text-[var(--color-text-muted)]">{formatBytes(file.size)}</p>
                  )}

                  {file.status === "error" && file.errorMessage && (
                    <p className="text-xs text-red-500 mt-0.5">{file.errorMessage}</p>
                  )}

                  {file.status === "uploading" && file.progress !== undefined && (
                    <div className="mt-1.5 h-1 rounded-full bg-[var(--color-bg-card)] overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-[var(--color-accent)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${file.progress}%` }}
                        transition={{ ease: "easeOut" }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── useUploadToast hook ────────────────────────────────────────────────────────
export function useUploadToast() {
  const [files, setFiles] = React.useState<UploadFile[]>([]);

  const addFile = React.useCallback((file: Omit<UploadFile, "status" | "progress"> & Partial<UploadFile>): string => {
    const id = file.id ?? Math.random().toString(36).slice(2);
    setFiles((prev) => [...prev, { status: "pending", progress: 0, ...file, id }]);
    return id;
  }, []);

  const updateFile = React.useCallback((id: string, updates: Partial<UploadFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }, []);

  const removeFile = React.useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearAll = React.useCallback(() => setFiles([]), []);

  return { files, addFile, updateFile, removeFile, clearAll };
}

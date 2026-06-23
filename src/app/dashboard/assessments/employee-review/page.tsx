'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart2,
  AlertTriangle,
  Check,
  ChevronDown,
  Download,
  Edit2,
  Eye,
  FileSpreadsheet,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Upload,
  Users2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AdminTableSection } from '@/components/ui/admin-table-section';
import type { DataTableColumn } from '@/components/ui/data-table';
import { StatusPill } from '@/components/ui/status-pill';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { Input } from '@/components/ui/input';
import { AdminChartCard } from '@/components/ui/admin-chart-card';
import type { ChartViewType, ChartDisplayType } from '@/components/ui/admin-chart-card';
import type { ChartCategory } from '@/components/ui/multi-series-chart';
import { EmptyState } from '@/components/ui/interactive-empty-state';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import BasicCheckbox from '@/components/ui/checkbox-1';
import { Tabs as VercelTabs } from '@/components/ui/vercel-tabs';
import { toast } from '@/components/ui/toast';
import { FilterListContent, FilterMultiListContent } from '@/components/ui/admin-table-accordion';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import { FileUploadDropzone } from '@/components/ui/file-upload-dropzone';
import { getCsrfToken } from '@/lib/csrf';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserData {
  id: number;
  admin: boolean;
  hr: boolean;
  accounting: boolean;
}

interface EvaluationPeriod {
  id: number;
  title: string;
  fiscal_year: number;
  start_date: string;
  end_date: string;
  status: 'active' | 'closed';
  frequency: string;
  created_at: string;
}

interface TasklistItem {
  id?: number;
  employee: number;
  employee_id_number: string;
  employee_name: string;
  department: string;
  task_count: number;
  updated_at: string;
}

interface Task {
  id: number;
  name: string;
  order: number;
}

interface TasklistDetail {
  id: number;
  employee: number;
  employee_name: string;
  tasks: Task[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(s: string) {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
}

function formatEmployeeName(fullName: string) {
  if (fullName.includes(',')) return fullName.trim();
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(-1)[0]}, ${parts.slice(0, -1).join(' ')}`;
}

type CenteredModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
};

function CenteredModal({ open, onOpenChange, children, className }: CenteredModalProps) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              'w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden',
              className,
            )}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function toLocalDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const REVIEW_TABS = [
  { id: 'evaluations', label: 'Evaluation Periods' },
  { id: 'tasklists', label: 'Task Lists' },
] as const;

const FREQ_LABELS: Record<string, string> = {
  quarterly: 'Quarterly',
  monthly:   'Monthly',
};

const FREQ_OPTIONS = [
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'monthly',   label: 'Monthly' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
];

// ── EditPeriodModal ────────────────────────────────────────────────────────────

function EditPeriodModal({
  period,
  open,
  onClose,
  onSaved,
}: {
  period: EvaluationPeriod | null;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: EvaluationPeriod) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [localPeriod, setLocalPeriod] = useState<EvaluationPeriod | null>(null);

  // Sync local state when the modal opens — keeps stale content during exit animation
  useEffect(() => {
    if (open && period) {
      setLocalPeriod(period);
      setEndDate(new Date(`${period.end_date}T00:00:00`));
    }
  }, [open, period]);

  async function handleSave() {
    if (!localPeriod) return;
    setSaving(true);
    try {
      const csrf = getCsrfToken();
      const res = await fetch(`/api/employee-eval/admin/periods/${localPeriod.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        credentials: 'include',
        body: JSON.stringify({ end_date: toLocalDateInputValue(endDate) }),
      });
      if (!res.ok) throw new Error('Failed to update period.');
      const data = await res.json();
      toast.success('Period updated.');
      onSaved(data);
    } catch {
      toast.error('Failed to update period.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <CenteredModal open={open} onOpenChange={(o) => { if (!o) onClose(); }} className="max-w-sm">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Edit Evaluation Period</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      <div className="px-6 py-2 max-h-[calc(100vh-22rem)] overflow-y-auto [scrollbar-width:thin]">
        <div className="space-y-4">
          {/* ── Read-only info block ── */}
          {localPeriod && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Title</p>
                  <p className="text-xs text-[var(--color-text-primary)]">{localPeriod.title}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Fiscal Year</p>
                  <p className="text-xs text-[var(--color-text-primary)]">
                    FY {localPeriod.fiscal_year}/{localPeriod.fiscal_year + 1}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Frequency</p>
                  <p className="text-xs text-[var(--color-text-primary)]">{FREQ_LABELS[localPeriod.frequency] ?? localPeriod.frequency}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Start Date</p>
                  <p className="text-xs text-[var(--color-text-primary)]">
                    {new Date(`${localPeriod.start_date}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Current End Date</p>
                  <p className="text-xs text-[var(--color-text-primary)]">
                    {new Date(`${localPeriod.end_date}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Status</p>
                  <StatusPill status={localPeriod.status} label={localPeriod.status === 'active' ? 'Active' : 'Closed'} />
                </div>
              </div>
            </div>
          )}

          {/* ── Editable end date ── */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">New End Date</label>
            <DateTimePicker
              value={endDate}
              onChange={setEndDate}
              displayFormat="MMM d, yyyy"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 p-3 border-t border-[var(--color-border)]">
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-xs font-normal text-[var(--color-text-muted)] border border-[var(--color-border)] hover:bg-[var(--color-bg-card)] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-[#2845D6] px-4 py-2 text-xs font-normal text-white hover:bg-[#1f35b0] transition-colors disabled:opacity-60"
        >
          {saving ? (
            <TextShimmer className="text-white text-xs">Saving Changes…</TextShimmer>
          ) : (
            <>
              <Check size={14} />
              Save Changes
            </>
          )}
        </button>
      </div>
    </CenteredModal>
  );
}

// ── TasklistViewModal ──────────────────────────────────────────────────────────

function TasklistViewModal({
  employeeId,
  employeeName,
  open,
  onClose,
}: {
  employeeId: number | null;
  employeeName: string;
  open: boolean;
  onClose: () => void;
}) {
  const [localEmployeeId, setLocalEmployeeId] = useState<number | null>(null);
  const [localEmployeeName, setLocalEmployeeName] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  // Per-task inline edit state
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingTaskId, setSavingTaskId] = useState<number | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null);

  // When modal opens, sync local employee data and fetch tasks
  useEffect(() => {
    if (open && employeeId !== null) {
      setLocalEmployeeId(employeeId);
      setLocalEmployeeName(employeeName);
      setTasks([]);
      setEditingTaskId(null);
      setEditingValue('');
      setLoading(true);
      fetch(`/api/employee-eval/admin/tasklists/${employeeId}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then((data: TasklistDetail) => setTasks(data.tasks))
        .catch(() => toast.error('Failed to load tasklist.'))
        .finally(() => setLoading(false));
    }
  }, [open, employeeId, employeeName]);

  function startEditing(task: Task) {
    // Discard any in-progress edit and switch to the new task
    setEditingTaskId(task.id);
    setEditingValue(task.name);
  }

  function cancelEditing() {
    // If it was a newly added (unsaved) task, remove it from the list
    if (editingTaskId !== null && editingTaskId < 0) {
      setTasks(prev => prev.filter(t => t.id !== editingTaskId));
    }
    setEditingTaskId(null);
    setEditingValue('');
  }

  async function saveTask(taskId: number) {
    if (localEmployeeId === null) return;
    const trimmed = editingValue.trim();
    if (!trimmed) {
      toast.error('Task name cannot be empty.');
      return;
    }
    const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, name: trimmed } : t);
    setSavingTaskId(taskId);
    try {
      const csrf = getCsrfToken();
      const res = await fetch(`/api/employee-eval/admin/tasklists/${localEmployeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        credentials: 'include',
        body: JSON.stringify({ tasks: updatedTasks.map(t => ({ name: t.name })) }),
      });
      if (!res.ok) throw new Error();
      const data: TasklistDetail = await res.json();
      setTasks(data.tasks);
      setEditingTaskId(null);
      setEditingValue('');
      toast.success('Task saved.');
    } catch {
      toast.error('Failed to save task.');
    } finally {
      setSavingTaskId(null);
    }
  }

  async function confirmDeleteTask(task: Task) {
    if (localEmployeeId === null) return;
    const updatedTasks = tasks.filter(t => t.id !== task.id);
    setDeletingTaskId(task.id);
    try {
      const csrf = getCsrfToken();
      const res = await fetch(`/api/employee-eval/admin/tasklists/${localEmployeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        credentials: 'include',
        body: JSON.stringify({ tasks: updatedTasks.map(t => ({ name: t.name })) }),
      });
      if (!res.ok) throw new Error();
      const data: TasklistDetail = await res.json();
      setTasks(data.tasks);
      if (editingTaskId === task.id) {
        setEditingTaskId(null);
        setEditingValue('');
      }
      toast.success('Task deleted.');
    } catch {
      toast.error('Failed to delete task.');
    } finally {
      setDeletingTaskId(null);
    }
  }

  function addTask() {
    // Cancel any in-progress edit first
    if (editingTaskId !== null && editingTaskId < 0) {
      setTasks(prev => prev.filter(t => t.id !== editingTaskId));
    }
    const newId = -(Date.now());
    const newTask: Task = { id: newId, name: '', order: tasks.length + 1 };
    setTasks(prev => [...prev, newTask]);
    setEditingTaskId(newId);
    setEditingValue('');
  }

  function handleClose() {
    if (editingTaskId !== null) {
      const original = tasks.find(t => t.id === editingTaskId);
      if (original && editingValue.trim() !== original.name) {
        if (!window.confirm('You have unsaved changes. Close anyway?')) return;
      }
    }
    setEditingTaskId(null);
    setEditingValue('');
    onClose();
  }

  const isBusy = savingTaskId !== null || deletingTaskId !== null;

  return (
    <>
      <CenteredModal className='max-w-lg' open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Tasks — {localEmployeeName}</h2>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>
        <div className="px-6 pb-2 max-h-[calc(100vh-22rem)] overflow-y-auto [scrollbar-width:thin]">
          {loading ? (
            <div className="flex justify-center py-8">
                <span className="h-6 w-6 rounded-full border-2 border-[#2845D6] border-t-transparent animate-spin" />
              </div>
            ) : (
              <div className="space-y-1 max-h-[55vh] overflow-y-auto [scrollbar-width:thin] pr-1">
                <AnimatePresence mode="popLayout" initial={false}>
                  {tasks.map((task, idx) => {
                    const isEditing = editingTaskId === task.id;
                    const isSaving = savingTaskId === task.id;
                    const isDeleting = deletingTaskId === task.id;

                    return (
                      <motion.div
                        key={task.id}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{
                          opacity: 0,
                          height: 0,
                          marginTop: 0,
                          marginBottom: 0,
                          paddingTop: 0,
                          paddingBottom: 0,
                        }}
                        transition={{
                          opacity: { duration: 0.15 },
                          height: { duration: 0.15, delay: 0.15 },
                          marginTop: { duration: 0.15, delay: 0.15 },
                          marginBottom: { duration: 0.15, delay: 0.15 },
                          paddingTop: { duration: 0.15, delay: 0.15 },
                          paddingBottom: { duration: 0.15, delay: 0.15 },
                          y: { duration: 0.25, ease: 'easeOut' },
                        }}
                        className={cn(
                          'group flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors',
                          isEditing
                            ? 'bg-[var(--color-bg-card)]'
                            : 'hover:bg-[var(--color-bg-card)]',
                          isDeleting && 'opacity-40',
                        )}
                      >
                        <span className="shrink-0 w-5 text-center text-xs text-[var(--color-text-muted)]">
                          {idx + 1}.
                        </span>

                        {isEditing ? (
                          <>
                            <textarea
                              ref={el => {
                                if (!el) return;
                                el.style.height = 'auto';
                                el.style.height = el.scrollHeight + 'px';
                              }}
                              value={editingValue}
                              maxLength={300}
                              placeholder="Task name…"
                              rows={1}
                              autoFocus
                              onChange={e => {
                                setEditingValue(e.target.value);
                                e.target.style.height = 'auto';
                                e.target.style.height = e.target.scrollHeight + 'px';
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Escape') cancelEditing();
                              }}
                              className="flex-1 min-w-0 w-full text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] px-2 py-1.5 resize-none overflow-hidden placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[#2845D6]/40 leading-relaxed"
                              style={{ height: 'auto' }}
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={() => saveTask(task.id)}
                                disabled={isSaving}
                                className="shrink-0 flex items-center justify-center h-8 w-8 rounded-md text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors disabled:opacity-50"
                                title="Save"
                              >
                                {isSaving ? (
                                  <span className="h-3 w-3 rounded-full border-2 border-[#2845D6] border-t-transparent animate-spin" />
                                ) : (
                                  <Save size={14} />
                                )}
                              </button>
                              <button
                                onClick={cancelEditing}
                                disabled={isSaving}
                                className="shrink-0 flex items-center justify-center h-8 w-8 rounded-md text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                                title="Cancel"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-xs text-[var(--color-text-primary)] break-words leading-relaxed">
                              {isDeleting ? (
                                <span className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
                                  <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                  Deleting…
                                </span>
                              ) : task.name}
                            </span>
                            <button
                              onClick={() => startEditing(task)}
                              disabled={isBusy}
                              className="shrink-0 flex items-center justify-center h-6 w-6 rounded-md text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-all disabled:opacity-30"
                              title="Edit task"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={() => confirmDeleteTask(task)}
                              disabled={isBusy}
                              className="shrink-0 flex items-center justify-center h-6 w-6 rounded-md text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-500/10 transition-all disabled:opacity-30"
                              title="Delete task"
                            >
                              <X size={12} />
                            </button>
                          </>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {tasks.length === 0 && !loading && (
                  <p className="text-sm text-center text-[var(--color-text-muted)] py-4">No tasks yet. Click &quot;Add Task&quot; to get started.</p>
                )}
              </div>
            )}
        </div>
        <div className="flex items-center justify-between gap-2 px-6 pb-5 pt-4 border-t border-[var(--color-border)]">
          <button
            onClick={addTask}
            disabled={isBusy || loading}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-50"
          >
            <Plus size={12} /> Add Task
          </button>
          <button
            onClick={handleClose}
            className="rounded-lg px-4 py-2 text-xs font-normal text-[var(--color-text-muted)] border border-[var(--color-border)] hover:bg-[var(--color-bg-card)] transition-colors"
          >
            Close
          </button>
        </div>
      </CenteredModal>

    </>
  );
}

// ── ImportModal ────────────────────────────────────────────────────────────────

function ImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<'idle' | 'deleting' | 'validating' | 'uploading' | 'done' | 'error'>('idle');

  // Override checkbox state
  const [overrideChecked, setOverrideChecked] = useState(false);

  // Stage 0 — Deletion (only when override is enabled)
  const [stage0Progress, setStage0Progress] = useState(0);
  const [stage0Status, setStage0Status] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [showStage0, setShowStage0] = useState(false);

  // Stage 1 — Validation
  const [stage1Progress, setStage1Progress] = useState(0);
  const [stage1Status, setStage1Status] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [showStage1, setShowStage1] = useState(false);

  // Stage 2 — Upload
  const [stage2Progress, setStage2Progress] = useState(0);
  const [showStage2, setShowStage2] = useState(false);

  const isActive = phase === 'deleting' || phase === 'validating' || phase === 'uploading';

  // Reset all state when the modal opens so each session starts fresh
  useEffect(() => {
    if (open) {
      setFiles([]);
      setPhase('idle');
      setOverrideChecked(false);
      setStage0Progress(0); setStage0Status('idle'); setShowStage0(false);
      setStage1Progress(0); setStage1Status('idle'); setShowStage1(false);
      setStage2Progress(0); setShowStage2(false);
    }
  }, [open]);

  function tryClose() {
    if (isActive) {
      toast.error('An operation is currently in progress. Please wait until it completes.');
      return;
    }
    onClose();
  }

  // ── Override checkbox handler ───────────────────────────────────────────────
  function handleOverrideChange(checked: boolean) {
    setOverrideChecked(checked);
  }

  function scheduleDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
  }

  async function handleTemplate() {
    try {
      const res = await fetch('/api/employee-eval/admin/tasklists/template', { credentials: 'include' });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      scheduleDownload(blob, 'tasklist_template.xlsx');
    } catch {
      toast.error('Failed to download template.');
    }
  }

  async function handleSubmit() {
    if (isActive || files.length === 0) return;

    if (overrideChecked) {
      await handleSubmitWithOverride();
    } else {
      await handleSubmitNormal();
    }
  }

  // ── Override flow: Delete → Validate → Upload ─────────────────────────────
  async function handleSubmitWithOverride() {
    // ── Stage 0: Delete existing tasklists ────────────────────────────────
    setPhase('deleting');
    setStage0Progress(0);
    setStage0Status('running');
    setShowStage0(true);
    setShowStage1(false);
    setShowStage2(false);

    let cancelled0 = false;
    let simProg0 = 0;
    const simId0 = setInterval(() => {
      if (cancelled0) { clearInterval(simId0); return; }
      simProg0 = Math.min(simProg0 + 4, 90);
      setStage0Progress(simProg0);
      if (simProg0 >= 90) clearInterval(simId0);
    }, 70);

    try {
      const res = await fetch('/api/employee-eval/admin/tasklists/delete-all', {
        method: 'POST',
        headers: { 'X-CSRFToken': getCsrfToken() },
        credentials: 'include',
      });
      cancelled0 = true;
      clearInterval(simId0);
      if (!res.ok) throw new Error('Delete failed.');
      setStage0Progress(100);
      setStage0Status('done');
      await new Promise(r => setTimeout(r, 400));
    } catch {
      cancelled0 = true;
      clearInterval(simId0);
      setStage0Progress(100);
      setStage0Status('error');
      setPhase('error');
      toast.error('Failed to delete existing tasklists. Import aborted.');
      return;
    }

    // ── Stage 1: Validation ────────────────────────────────────────────────
    setPhase('validating');
    setStage1Progress(0);
    setStage1Status('running');
    setShowStage1(true);

    let cancelled1 = false;
    let simProg1 = 0;
    const simId1 = setInterval(() => {
      if (cancelled1) { clearInterval(simId1); return; }
      simProg1 = Math.min(simProg1 + 3, 90);
      setStage1Progress(simProg1);
      if (simProg1 >= 90) clearInterval(simId1);
    }, 80);

    try {
      const fd = new FormData();
      fd.append('file', files[0]);
      const res = await fetch('/api/employee-eval/admin/tasklists/validate', {
        method: 'POST',
        headers: { 'X-CSRFToken': getCsrfToken() },
        credentials: 'include',
        body: fd,
      });
      cancelled1 = true;
      clearInterval(simId1);

      if (!res.ok) {
        const blob = await res.blob();
        setStage1Progress(100);
        setStage1Status('error');
        setPhase('error');
        scheduleDownload(blob, 'tasklist_error_report.xlsx');
        toast.error('Validation failed. The error report has been downloaded. Previously deleted tasklists cannot be restored.');
        return;
      }

      setStage1Progress(100);
      setStage1Status('done');
      await new Promise(r => setTimeout(r, 400));

      // ── Stage 2: Upload ──────────────────────────────────────────────────
      setPhase('uploading');
      setStage2Progress(0);
      setShowStage2(true);
      await uploadFile(files[0]);
    } catch {
      cancelled1 = true;
      clearInterval(simId1);
      setStage1Status('error');
      setPhase('error');
      toast.error('An error occurred during validation.');
    }
  }

  // ── Normal flow: Validate → Upload ────────────────────────────────────────
  async function handleSubmitNormal() {
    setPhase('validating');
    setStage0Progress(0); setStage0Status('idle'); setShowStage0(false);
    setStage1Progress(0);
    setStage1Status('running');
    setShowStage1(true);
    setShowStage2(false);

    let cancelled = false;
    let simProgress = 0;
    const simId = setInterval(() => {
      if (cancelled) { clearInterval(simId); return; }
      simProgress = Math.min(simProgress + 3, 90);
      setStage1Progress(simProgress);
      if (simProgress >= 90) clearInterval(simId);
    }, 80);

    try {
      const fd = new FormData();
      fd.append('file', files[0]);
      const res = await fetch('/api/employee-eval/admin/tasklists/validate', {
        method: 'POST',
        headers: { 'X-CSRFToken': getCsrfToken() },
        credentials: 'include',
        body: fd,
      });
      cancelled = true;
      clearInterval(simId);

      if (!res.ok) {
        const blob = await res.blob();
        setStage1Progress(100);
        setStage1Status('error');
        setPhase('error');
        scheduleDownload(blob, 'tasklist_error_report.xlsx');
        toast.error('Validation failed. The error report has been downloaded.');
        return;
      }

      setStage1Progress(100);
      setStage1Status('done');
      await new Promise(r => setTimeout(r, 400));

      setPhase('uploading');
      setStage2Progress(0);
      setShowStage2(true);
      await uploadFile(files[0]);
    } catch {
      cancelled = true;
      clearInterval(simId);
      toast.error('An error occurred. Please try again.');
      setStage1Status('error');
      setPhase('error');
    }
  }

  function uploadFile(file: File): Promise<void> {
    return new Promise((resolve) => {
      const fd = new FormData();
      fd.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/employee-eval/admin/tasklists/import');
      xhr.withCredentials = true;
      xhr.setRequestHeader('X-CSRFToken', getCsrfToken());

      let simProg = 0;
      const simId = setInterval(() => {
        simProg = Math.min(simProg + 5, 90);
        setStage2Progress(simProg);
        if (simProg >= 90) clearInterval(simId);
      }, 60);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const real = Math.round((e.loaded / e.total) * 90);
          if (real > simProg) {
            clearInterval(simId);
            setStage2Progress(real);
            simProg = real;
          }
        }
      };

      xhr.onload = () => {
        clearInterval(simId);
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            setStage2Progress(100);
            setPhase('done');
            const count: number = data.imported ?? 0;
            toast.success(`${count} employee${count !== 1 ? 's' : ''} imported successfully.`);
            onImported();
            setTimeout(() => onClose(), 800);
          } else {
            throw new Error(data?.detail ?? 'Upload failed.');
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to import.';
          toast.error(msg);
          setPhase('error');
        }
        resolve();
      };

      xhr.onerror = () => {
        clearInterval(simId);
        toast.error('Network error during upload.');
        setPhase('error');
        resolve();
      };

      xhr.send(fd);
    });
  }

  const showProgressSection = showStage0 || showStage1;

  return (
    <>
      <CenteredModal open={open} onOpenChange={(o) => { if (!o) tryClose(); }} className="max-w-[550px]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Import Tasklists</h2>
          <button
            type="button"
            onClick={tryClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Green section header — non-scrolling, sits between header and body */}
        <div className="shrink-0 bg-green-50 dark:bg-green-950/20 border-b border-green-200/70 dark:border-green-900/40 px-5 py-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex-1">
              <p className="text-sm font-semibold text-green-900 dark:text-green-200">Tasklist Import</p>
              <p className="text-xs text-green-700 dark:text-green-400 mt-0.5 leading-relaxed">Upload a prepared XLSX tasklist template to import employee task assignments.</p>
            </div>
            <div className="shrink-0">
              <button
                type="button"
                onClick={handleTemplate}
                className="inline-flex items-center gap-2 rounded-full border border-green-300 bg-white px-4 py-2 text-xs font-medium text-green-700 whitespace-nowrap hover:bg-green-50 transition-colors"
              >
                Download Template
              </button>
            </div>
          </div>

          {/* Scrollable content body */}
          <div className="px-5 py-5 space-y-4 max-h-[calc(100vh-22rem)] overflow-y-auto [scrollbar-width:thin]">
              <FileUploadDropzone
                files={files}
                onFilesChange={setFiles}
                accept=".xlsx"
                multiple={false}
                label="Click to select or drag & drop"
                helperText="XLSX format, up to 5 MB"
                disabled={isActive}
              />

              {/* Override checkbox */}
              <div className={cn(
                'flex items-start gap-3 rounded-md border px-4 py-3 cursor-pointer select-none transition-colors',
                overrideChecked
                  ? 'border-none bg-red-50 dark:bg-red-950/20'
                  : 'border-none bg-[var(--color-bg-card)] hover:border-red-300',
                isActive && 'pointer-events-none opacity-50',
              )}>
                <BasicCheckbox
                  checked={overrideChecked}
                  onCheckedChange={handleOverrideChange}
                  label=""
                  disabled={isActive}
                  className="mt-0.5 shrink-0"
                />
                <div className="space-y-0.5">
                  <p className={cn('text-xs font-semibold', overrideChecked ? 'text-red-700 dark:text-red-400' : 'text-[var(--color-text-primary)]')}>
                    Replace all existing tasklists with imported data
                  </p>
                  <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                    When enabled, all existing tasklist records will be permanently deleted before the new data is imported. This cannot be undone.
                  </p>
                </div>
              </div>

              <div className="rounded-md bg-[var(--color-bg-card)] px-4 py-3 text-sm text-[var(--color-text-primary)]">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Required Columns (xlsx, row 1 = header)</p>
                <ul className="mt-3 space-y-2 text-[12px] text-[var(--color-text-primary)]">
                  <li className="flex items-center gap-2">
                    <span className="mt-0.5 rounded px-1.5 py-0.5 text-[11px] bg-[#2845D6]/10 text-[#2845D6]">REQ</span>
                    <span><span className="font-mono">A</span> — ID Number</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="mt-0.5 rounded px-1.5 py-0.5 text-[11px] bg-[#2845D6]/10 text-[#2845D6]">REQ</span>
                    <span><span className="font-mono">B</span> — Employee Name</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="mt-0.5 rounded px-1.5 py-0.5 text-[11px] bg-[#2845D6]/10 text-[#2845D6]">REQ</span>
                    <span><span className="font-mono">C</span> — TaskList (tasks separated by semicolons or line breaks)</span>
                  </li>
                </ul>
              </div>
          </div>

          {/* Multi-stage progress bars — appear after submit is triggered */}
          <AnimatePresence>
              {showProgressSection && (
                <motion.div
                  key="progress-section"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="overflow-hidden border-t border-[var(--color-border)] shrink-0"
                >
                  <div className="px-5 py-4 space-y-3">

                    {/* Stage 0 — Delete (override only) */}
                    <AnimatePresence>
                      {showStage0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="space-y-1.5 overflow-hidden"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-medium text-[var(--color-text-muted)]">Deleting existing tasklists…</p>
                            <span className={cn(
                              'text-[11px] font-bold tabular-nums',
                              stage0Status === 'error' ? 'text-red-500' : stage0Status === 'done' ? 'text-green-600' : 'text-[var(--color-text-muted)]',
                            )}>
                              {stage0Progress}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-[var(--color-border)] overflow-hidden">
                            <motion.div
                              className={cn(
                                'h-full rounded-full',
                                stage0Status === 'error' ? 'bg-red-500' : stage0Status === 'done' ? 'bg-green-500' : 'bg-red-500',
                              )}
                              animate={{ width: `${stage0Progress}%` }}
                              transition={{ duration: 0.15, ease: 'easeOut' }}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Stage 1 — Validation */}
                    <AnimatePresence>
                      {showStage1 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="space-y-1.5 overflow-hidden"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-medium text-[var(--color-text-muted)]">Checking file for errors…</p>
                            <span className={cn(
                              'text-[11px] font-bold tabular-nums',
                              stage1Status === 'error' ? 'text-red-500' : stage1Status === 'done' ? 'text-green-600' : 'text-[var(--color-text-muted)]',
                            )}>
                              {stage1Progress}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-[var(--color-border)] overflow-hidden">
                            <motion.div
                              className={cn(
                                'h-full rounded-full',
                                stage1Status === 'error' ? 'bg-red-500' : stage1Status === 'done' ? 'bg-green-500' : 'bg-[#2845D6]',
                              )}
                              animate={{ width: `${stage1Progress}%` }}
                              transition={{ duration: 0.15, ease: 'easeOut' }}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Stage 2 — Upload (only appears after validation succeeds) */}
                    <AnimatePresence>
                      {showStage2 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="space-y-1.5 overflow-hidden"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-medium text-[var(--color-text-muted)]">Uploading data…</p>
                            <span className={cn(
                              'text-[11px] font-bold tabular-nums',
                              phase === 'done' ? 'text-green-600' : 'text-[var(--color-text-muted)]',
                            )}>
                              {stage2Progress}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-[var(--color-border)] overflow-hidden">
                            <motion.div
                              className={cn(
                                'h-full rounded-full',
                                phase === 'done' ? 'bg-green-500' : 'bg-[#2845D6]',
                              )}
                              animate={{ width: `${stage2Progress}%` }}
                              transition={{ duration: 0.15, ease: 'easeOut' }}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                  </div>
                </motion.div>
              )}
          </AnimatePresence>

          <div className="px-5 py-4 border-t border-[var(--color-border)] flex justify-end">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={files.length === 0 || isActive}
              className="px-4 py-2 rounded-lg text-xs font-normal bg-[#2845D6] text-white hover:bg-[#1e35b5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {isActive ? (
                <TextShimmer className="text-xs [--base-color:rgba(255,255,255,0.55)] [--base-gradient-color:#ffffff]">
                  {phase === 'deleting' ? 'Deleting…' : phase === 'validating' ? 'Validating…' : 'Uploading…'}
                </TextShimmer>
              ) : (
                <>
                  <Upload size={14} /> {overrideChecked ? 'Delete & Import' : 'Validate & Upload'}
                </>
              )}
            </button>
          </div>
        </CenteredModal>
    </>
  );
}

// ── Eval chart helpers ───────────────────────────────────────────────────────

function evalCurrentFYStart(): number {
  const now = new Date();
  return now.getMonth() + 1 >= 5 ? now.getFullYear() : now.getFullYear() - 1;
}

function evalCurrentWeekStart(): string {
  const now = new Date();
  const dow = now.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff);
  return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
}

const EVAL_CHART_CATEGORIES: ChartCategory[] = [
  { key: 'self_evals',       label: 'Self Evaluations',    color: '#2845D6', gradId: 'grad_eval_self', lightColor: '#5B78E8' },
  { key: 'supervisor_evals', label: 'Approver Evaluations', color: '#10B981', gradId: 'grad_eval_sup',  lightColor: '#34D399' },
];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EmployeeReviewPage() {
  const router = useRouter();

  // Auth
  const [user, setUser] = useState<UserData | null>(null);

  // Periods tab
  const [periods, setPeriods] = useState<EvaluationPeriod[]>([]);
  const [periodsTotal, setPeriodsTotal] = useState(0);
  const [periodsPage, setPeriodsPage] = useState(1);
  const [periodsSearch, setPeriodsSearch] = useState('');
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [periodsSortField, setPeriodsSortField] = useState('');
  const [periodsSortDir, setPeriodsSortDir] = useState<'asc' | 'desc'>('asc');
  const [periodsFreqFilter, setPeriodsFreqFilter] = useState<string[]>([]);
  const [periodsStatusFilter, setPeriodsStatusFilter] = useState('');
  const [editPeriod, setEditPeriod] = useState<EvaluationPeriod | null>(null);
  const [togglePeriod, setTogglePeriod] = useState<EvaluationPeriod | null>(null);
  const [toggling, setToggling] = useState(false);
  const periodsSeq = useRef(0);

  // Tasklists tab
  const [tasklists, setTasklists] = useState<TasklistItem[]>([]);
  const [tasklistsTotal, setTasklistsTotal] = useState(0);
  const [tasklistsPage, setTasklistsPage] = useState(1);
  const [tasklistsSearch, setTasklistsSearch] = useState('');
  const [tasklistsLoading, setTasklistsLoading] = useState(false);
  const [tasklistsSortField, setTasklistsSortField] = useState('');
  const [tasklistsSortDir, setTasklistsSortDir] = useState<'asc' | 'desc'>('asc');
  const [tasklistsDeptFilter, setTasklistsDeptFilter] = useState('');
  const [tasklistsTaskFilter, setTasklistsTaskFilter] = useState<'all' | 'with' | 'without'>('all');
  const [hasAnyTasklists, setHasAnyTasklists] = useState<boolean | null>(null);
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
  const tasklistsSeq = useRef(0);
  const [viewEmployee, setViewEmployee] = useState<{ id: number; name: string } | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Tab (persisted in localStorage)
  const [tab, setTab] = useState<'evaluations' | 'tasklists'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('emp-review-tab');
      if (saved === 'tasklists') return 'tasklists';
    }
    return 'evaluations';
  });

  // Chart
  const [chartViewType,    setChartViewType]    = useState<ChartViewType>('fiscal');
  const [chartDisplayType, setChartDisplayType] = useState<ChartDisplayType>('bar');
  const [chartFyStart,     setChartFyStart]     = useState(evalCurrentFYStart());
  const [chartMonthYear,   setChartMonthYear]   = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}`;
  });
  const [chartWeekStart,   setChartWeekStart]   = useState(evalCurrentWeekStart());
  const [chartSelfEvals,   setChartSelfEvals]   = useState<string[]>([]);
  const [chartSupEvals,    setChartSupEvals]    = useState<string[]>([]);
  const [chartLoading,     setChartLoading]     = useState(true);
  const chartInitialized = useRef(false);

  // Auth check
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (!data || (!data.admin && !data.hr)) {
          router.replace('/dashboard');
          return;
        }
        setUser({ id: data.id, admin: data.admin, hr: data.hr, accounting: data.accounting });
      });
  }, [router]);

  // Fetch departments for tasklist filter
  useEffect(() => {
    fetch('/api/general-settings/departments', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: { id: number; name: string }[]) => setDepartments(data))
      .catch(() => {});
  }, []);

  // Load periods
  const loadPeriods = useCallback(async (
    page = 1,
    search = '',
    freqFilters: string[] = [],
    statusFilter = '',
    sortField = '',
    sortDir: 'asc' | 'desc' = 'asc',
  ) => {
    const seq = ++periodsSeq.current;
    setPeriodsLoading(true);
    const _t = Date.now();
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '10' });
      if (search) params.set('search', search);
      freqFilters.forEach(f => params.append('frequency', f));
      if (statusFilter) params.set('status', statusFilter);
      if (sortField) params.set('ordering', sortDir === 'desc' ? `-${sortField}` : sortField);
      const res = await fetch(`/api/employee-eval/admin/periods?${params}`, { credentials: 'include' });
      if (seq !== periodsSeq.current) return;
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (seq !== periodsSeq.current) return;
      setPeriods(data.results ?? []);
      setPeriodsTotal(data.count ?? 0);
      setPeriodsPage(page);

    } catch {
      if (seq !== periodsSeq.current) return;
      toast.error('Failed to load periods.');
    } finally {
      const rem = Math.max(0, 1000 - (Date.now() - _t));
      if (rem > 0) await new Promise(r => setTimeout(r, rem));
      if (seq !== periodsSeq.current) return;
      setPeriodsLoading(false);
    }
  }, []);

  // Load tasklists
  const loadTasklists = useCallback(async (
    page = 1,
    search = '',
    deptFilter = '',
    taskFilter: 'all' | 'with' | 'without' = 'all',
    sortField = '',
    sortDir: 'asc' | 'desc' = 'asc',
  ) => {
    const seq = ++tasklistsSeq.current;
    setTasklistsLoading(true);
    const _t = Date.now();
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '10' });
      if (search) params.set('search', search);
      if (deptFilter) params.set('department_id', deptFilter);
      if (taskFilter && taskFilter !== 'all') params.set('task_filter', taskFilter);
      if (sortField) params.set('ordering', sortDir === 'desc' ? `-${sortField}` : sortField);
      const res = await fetch(`/api/employee-eval/admin/tasklists?${params}`, { credentials: 'include' });
      if (seq !== tasklistsSeq.current) return;
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 404) {
          if (seq === tasklistsSeq.current) toast.error(err.detail ?? 'No active evaluation period.');
          return;
        }
        throw new Error();
      }
      const data = await res.json();
      if (seq !== tasklistsSeq.current) return;
      setTasklists(data.results ?? []);
      setTasklistsTotal(data.count ?? 0);
      setTasklistsPage(page);
      if (!search && !deptFilter && taskFilter === 'all') setHasAnyTasklists((data.count ?? 0) > 0);
    } catch {
      if (seq !== tasklistsSeq.current) return;
      toast.error('Failed to load tasklists.');
    } finally {
      const rem = Math.max(0, 1000 - (Date.now() - _t));
      if (rem > 0) await new Promise(r => setTimeout(r, rem));
      if (seq !== tasklistsSeq.current) return;
      setTasklistsLoading(false);
    }
  }, []);

  // Initial load when user or tab changes
  useEffect(() => {
    if (!user) return;
    if (tab === 'evaluations') {
      loadPeriods(1, periodsSearch, periodsFreqFilter, periodsStatusFilter, periodsSortField, periodsSortDir);
    } else {
      loadTasklists(1, tasklistsSearch, tasklistsDeptFilter, tasklistsTaskFilter, tasklistsSortField, tasklistsSortDir);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tab]);

  // Debounced search
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => {
      if (tab === 'evaluations') {
        loadPeriods(1, periodsSearch, periodsFreqFilter, periodsStatusFilter, periodsSortField, periodsSortDir);
      } else {
        loadTasklists(1, tasklistsSearch, tasklistsDeptFilter, tasklistsTaskFilter, tasklistsSortField, tasklistsSortDir);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodsSearch, tasklistsSearch]);

  // Reload periods when filters change
  useEffect(() => {
    if (!user) return;
    if (tab === 'evaluations') {
      loadPeriods(1, periodsSearch, periodsFreqFilter, periodsStatusFilter, periodsSortField, periodsSortDir);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodsFreqFilter, periodsStatusFilter]);

  // Reload tasklists when dept or task filters change
  useEffect(() => {
    if (!user) return;
    if (tab === 'tasklists') {
      loadTasklists(1, tasklistsSearch, tasklistsDeptFilter, tasklistsTaskFilter, tasklistsSortField, tasklistsSortDir);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasklistsDeptFilter, tasklistsTaskFilter]);

  // Chart entries fetch
  useEffect(() => {
    if (!user) return;
    if (!chartInitialized.current) setChartLoading(true);
    fetch('/api/employee-eval/admin/chart', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { self_evals: [], supervisor_evals: [] })
      .then((data: { self_evals: string[]; supervisor_evals: string[] }) => {
        setChartSelfEvals(data.self_evals ?? []);
        setChartSupEvals(data.supervisor_evals ?? []);
        chartInitialized.current = true;
      })
      .catch(() => {})
      .finally(() => setChartLoading(false));
  }, [user]);

  const fyOptions = useMemo(() => {
    const start = evalCurrentFYStart();
    return Array.from({ length: 4 }, (_, i) => start - i);
  }, []);

  const monthOptions = useMemo(() => {
    const MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear(), m = d.getMonth() + 1;
      return { value: `${y}-${m}`, label: `${MN[m - 1]} ${y}` };
    });
  }, []);

  const weekOptions = useMemo(() => {
    const curMonday = evalCurrentWeekStart();
    const [wy, wm, wd] = curMonday.split('-').map(Number);
    const base = new Date(wy, wm - 1, wd);
    return Array.from({ length: 12 }, (_, i) => {
      const start = new Date(base);
      start.setDate(base.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const value = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
      const label = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      return { value, label };
    });
  }, []);

  const chartData = useMemo<Record<string, string | number>[]>(() => {
    const S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const cnt = (dates: string[], prefix: string) => dates.filter(d => d.startsWith(prefix)).length;
    if (chartViewType === 'fiscal') {
      return [5,6,7,8,9,10,11,12,1,2,3,4].map(m => {
        const year = m >= 5 ? chartFyStart : chartFyStart + 1;
        const prefix = `${year}-${String(m).padStart(2, '0')}`;
        return { label: S[m - 1], self_evals: cnt(chartSelfEvals, prefix), supervisor_evals: cnt(chartSupEvals, prefix) };
      });
    }
    if (chartViewType === 'monthly') {
      const [ys, ms] = chartMonthYear.split('-');
      const year = Number(ys), month = Number(ms);
      const days = new Date(year, month, 0).getDate();
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      return Array.from({ length: days }, (_, i) => {
        const prefix = `${ym}-${String(i + 1).padStart(2, '0')}`;
        return { label: String(i + 1), self_evals: cnt(chartSelfEvals, prefix), supervisor_evals: cnt(chartSupEvals, prefix) };
      });
    }
    const DN = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const [sy, sm, sd] = chartWeekStart.split('-').map(Number);
    const base = new Date(sy, sm - 1, sd);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { label: DN[i], self_evals: cnt(chartSelfEvals, prefix), supervisor_evals: cnt(chartSupEvals, prefix) };
    });
  }, [chartSelfEvals, chartSupEvals, chartViewType, chartFyStart, chartMonthYear, chartWeekStart]);

  // Sort handlers
  function handlePeriodSort(field: string) {
    const newDir = periodsSortField === field && periodsSortDir === 'asc' ? 'desc' : 'asc';
    setPeriodsSortField(field);
    setPeriodsSortDir(newDir);
    loadPeriods(1, periodsSearch, periodsFreqFilter, periodsStatusFilter, field, newDir);
  }

  function handleTasklistSort(field: string) {
    const newDir = tasklistsSortField === field && tasklistsSortDir === 'asc' ? 'desc' : 'asc';
    setTasklistsSortField(field);
    setTasklistsSortDir(newDir);
    loadTasklists(1, tasklistsSearch, tasklistsDeptFilter, tasklistsTaskFilter, field, newDir);
  }

  async function handleToggleStatus(period: EvaluationPeriod) {
    setToggling(true);
    try {
      const csrf = getCsrfToken();
      const res = await fetch(`/api/employee-eval/admin/periods/${period.id}/toggle-status`, {
        method: 'POST',
        headers: { 'X-CSRFToken': csrf },
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      const updated: EvaluationPeriod = await res.json();
      setPeriods(prev => prev.map(p => p.id === updated.id ? updated : p));
      toast.success(`Period marked as ${updated.status}.`);
    } catch {
      toast.error('Failed to toggle status.');
    } finally {
      setToggling(false);
    }
    setTogglePeriod(null);
  }

  // Filter content JSX
  const freqFilterContent = (
    <FilterMultiListContent
      options={FREQ_OPTIONS}
      selected={periodsFreqFilter}
      onChange={setPeriodsFreqFilter}
      withSearch={false}
    />
  );

  const statusFilterContent = (
    <FilterListContent
      options={STATUS_OPTIONS}
      value={periodsStatusFilter}
      onChange={setPeriodsStatusFilter}
      allLabel="All statuses"
    />
  );

  const deptFilterContent = (
    <FilterListContent
      options={departments.map(d => ({ value: String(d.id), label: d.name }))}
      value={tasklistsDeptFilter}
      onChange={setTasklistsDeptFilter}
      allLabel="All departments"
    />
  );

  const TASK_FILTER_OPTIONS = [
    { value: 'all',     label: 'All' },
    { value: 'with',    label: 'With Tasklists' },
    { value: 'without', label: 'No Tasklists' },
  ];

  const taskFilterContent = (
    <FilterListContent
      options={TASK_FILTER_OPTIONS.slice(1)}
      value={tasklistsTaskFilter === 'all' ? '' : tasklistsTaskFilter}
      onChange={v => setTasklistsTaskFilter((v as 'with' | 'without') || 'all')}
      allLabel="All"
    />
  );


  // Columns — Periods
  const periodColumns: DataTableColumn<EvaluationPeriod>[] = [
    {
      key: 'title',
      label: 'Evaluation Title',
      sortField: 'title',
      thClassName: 'hidden lg:table-cell',
      tdClassName: 'hidden lg:table-cell',
      render: r => <span className="text-xs font-normal text-[var(--color-text-secondary)]">{r.title}</span>,
    },
    { key: 'fiscal_year', label: 'Fiscal Year', sortField: 'fiscal_year', render: r => <span className="text-xs text-[var(--color-text-secondary)]">FY {r.fiscal_year}/{r.fiscal_year + 1}</span> },
    {
      key: 'frequency',
      label: 'Frequency',
      sortField: 'frequency',
      filterContent: freqFilterContent,
      filterActive: periodsFreqFilter.length > 0,
      render: r => <span className="text-xs text-[var(--color-text-secondary)]">{FREQ_LABELS[r.frequency] ?? r.frequency}</span>,
    },
    {
      key: 'duration',
      label: 'Duration',
      sortField: 'start_date',
      thClassName: 'hidden lg:table-cell',
      tdClassName: 'hidden lg:table-cell',
      render: r => (
        <span className="text-xs text-[var(--color-text-secondary)]">
          {formatDate(r.start_date)} - {formatDate(r.end_date)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortField: 'status',
      filterContent: statusFilterContent,
      filterActive: !!periodsStatusFilter,
      render: r => <StatusPill status={r.status} label={r.status === 'active' ? 'Active' : 'Closed'} />,
    },
    {
      key: 'actions',
      label: 'Action',
      headerAlign: 'center',
      thClassName: 'text-center',
      tdClassName: 'text-center',
      render: r => (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => router.push(`/dashboard/assessments/employee-review/${r.id}`)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
            title="View results"
          >
            <BarChart2 size={12} />
          </button>
          <button
            onClick={() => setEditPeriod(r)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
            title="Edit end date"
          >
            <Edit2 size={12} />
          </button>
          <button
            onClick={() => setTogglePeriod(r)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
            title="Toggle status"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      ),
    },
  ];

  // Columns — Tasklists
  const tasklistColumns: DataTableColumn<TasklistItem>[] = [
    { key: 'employee_id_number', label: 'ID Number', sortField: 'employee_id_number', render: r => <span className="text-xs text-[var(--color-text-secondary)]">{r.employee_id_number}</span> },
    { key: 'employee_name', label: 'Employee Name', sortField: 'employee_name', render: r => <span className="text-xs font-normal text-[var(--color-text-secondary)]">{formatEmployeeName(r.employee_name)}</span> },
    {
      key: 'department',
      label: 'Department',
      sortField: 'department',
      thClassName: 'hidden lg:table-cell',
      tdClassName: 'hidden lg:table-cell',
      filterContent: deptFilterContent,
      filterActive: !!tasklistsDeptFilter,
      render: r => <span className="text-xs text-[var(--color-text-muted)]">{r.department || '—'}</span>,
    },
    {
      key: 'task_count',
      label: 'Tasks',
      sortField: 'task_count',
      thClassName: 'hidden lg:table-cell',
      tdClassName: 'hidden lg:table-cell',
      filterContent: taskFilterContent,
      filterActive: tasklistsTaskFilter !== 'all',
      render: r => <span className="text-xs text-[var(--color-text-muted)]">{r.task_count}</span>,
    },
    {
      key: 'actions',
      label: 'Action',
      headerAlign: 'center',
      thClassName: 'text-center',
      tdClassName: 'text-center flex items-center justify-center gap-1',
      render: r => (
        <button
          onClick={() => setViewEmployee({ id: r.employee, name: r.employee_name })}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
          title="View tasks"
        >
          <Eye size={12} />
        </button>
      ),
    },
  ];

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="h-6 w-6 rounded-full border-2 border-[#2845D6] border-t-transparent animate-spin" />
      </div>
    );
  }

  const showImportInActions = hasAnyTasklists === true;

  const importButton = (
    <button
      onClick={() => setShowImport(true)}
      className="flex items-center gap-2 rounded-lg bg-[#2845D6] px-4 py-2 text-xs font-normal text-white hover:bg-[#1f35b0] transition-colors whitespace-nowrap"
    >
      <Upload size={14} /> Import Tasks
    </button>
  );

  return (
    <div className="space-y-6 px-4 sm:px-6 py-6">
      <div className="shrink-0 flex items-center gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--color-text-primary)]">Employee Evaluation</h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Manage evaluation periods and employee task lists</p>
        </div>
      </div>

      {/* Evaluations chart */}
      <AdminChartCard
        id="eval-submissions"
        categories={EVAL_CHART_CATEGORIES}
        data={chartData}
        loading={chartLoading}
        viewType={chartViewType}
        onViewTypeChange={setChartViewType}
        chartType={chartDisplayType}
        onChartTypeChange={setChartDisplayType}
        fyStart={chartFyStart}
        onFyStartChange={setChartFyStart}
        fyOptions={fyOptions}
        monthYear={chartMonthYear}
        onMonthYearChange={setChartMonthYear}
        monthOptions={monthOptions}
        weekStart={chartWeekStart}
        onWeekStartChange={setChartWeekStart}
        weekOptions={weekOptions}
      />

      {/* Tabs */}
      <div className="pb-1">
        <VercelTabs
          tabs={[...REVIEW_TABS]}
          activeTab={tab}
          onTabChange={id => {
            setTab(id as 'evaluations' | 'tasklists');
            localStorage.setItem('emp-review-tab', id);
          }}
        />
      </div>

      {/* Evaluations tab */}
      {tab === 'evaluations' && (
        <AdminTableSection<EvaluationPeriod>
          search={periodsSearch}
          onSearchChange={v => setPeriodsSearch(v)}
          searchPlaceholder="Search periods…"
          columns={periodColumns}
          rows={periods}
          rowKey={r => r.id}
          loading={periodsLoading}
          sortField={periodsSortField}
          sortDir={periodsSortDir}
          onSort={handlePeriodSort}
          totalPages={Math.ceil(periodsTotal / 10)}
          totalCount={periodsTotal}
          page={periodsPage}
          pageSize={10}
          onPageChange={p => loadPeriods(p, periodsSearch, periodsFreqFilter, periodsStatusFilter, periodsSortField, periodsSortDir)}
          emptyTitle="No evaluation periods found"
          emptyDescription="No evaluation periods match your search or filter criteria."
          emptyIcons={[Users2, BarChart2, Plus]}
        />
      )}

      {/* Tasklists tab */}
      {tab === 'tasklists' && (
        <AdminTableSection<TasklistItem>
          search={tasklistsSearch}
          onSearchChange={v => setTasklistsSearch(v)}
          searchPlaceholder="Search employees…"
          actions={showImportInActions ? importButton : undefined}
          columns={tasklistColumns}
          rows={tasklists}
          rowKey={r => r.employee}
          loading={tasklistsLoading}
          sortField={tasklistsSortField}
          sortDir={tasklistsSortDir}
          onSort={handleTasklistSort}
          totalPages={Math.ceil(tasklistsTotal / 10)}
          totalCount={tasklistsTotal}
          page={tasklistsPage}
          pageSize={10}
          onPageChange={p => loadTasklists(p, tasklistsSearch, tasklistsDeptFilter, tasklistsTaskFilter, tasklistsSortField, tasklistsSortDir)}
          emptyTitle="No employee task lists found"
          emptyDescription="Import an xlsx file to create employee task lists."
          emptyIcons={[Upload, Users2, Plus]}
          emptyAction={hasAnyTasklists === false ? { label: 'Import Tasklists', onClick: () => setShowImport(true), icon: <Plus size={14} /> } : undefined}
        />
      )}

      {/* Modals */}
      <EditPeriodModal
        period={editPeriod}
        open={!!editPeriod}
        onClose={() => setEditPeriod(null)}
        onSaved={updated => {
          setPeriods(prev => prev.map(p => p.id === updated.id ? updated : p));
          setEditPeriod(null);
        }}
      />

      <AnimatePresence>
        {togglePeriod && (
          <ConfirmationModal
            title={`${togglePeriod.status === 'active' ? 'Close' : 'Activate'} Period`}
            message={`Are you sure you want to mark "${togglePeriod.title}" as ${togglePeriod.status === 'active' ? 'closed' : 'active'}?`}
            confirmLabel={togglePeriod.status === 'active' ? 'Close Period' : 'Activate Period'}
            confirmVariant={togglePeriod.status === 'active' ? 'danger' : 'success'}
            confirming={toggling}
            onConfirm={() => handleToggleStatus(togglePeriod)}
            onCancel={() => setTogglePeriod(null)}
          />
        )}
      </AnimatePresence>

      <TasklistViewModal
        employeeId={viewEmployee?.id ?? null}
        employeeName={viewEmployee?.name ?? ''}
        open={!!viewEmployee}
        onClose={() => setViewEmployee(null)}
      />

      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => loadTasklists(1, tasklistsSearch, tasklistsDeptFilter, tasklistsTaskFilter, tasklistsSortField, tasklistsSortDir)}
      />
    </div>
  );
}

'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Eye,
  Pencil,
  Trash2,
  X,
  FileText,
  AlertTriangle,
  Award,
  BadgeCheck,
  ListFilter,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { TextareaWithCharactersLeft } from '@/components/ui/textarea-with-characters-left';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { EmptyState } from '@/components/ui/interactive-empty-state';
import SearchBar from '@/components/ui/searchbar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import { toast } from '@/components/ui/toast';
import { getCsrfToken } from '@/lib/csrf';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { FileUploadDropzone } from '@/components/ui/file-upload-dropzone';
import { styledXlsx } from '@/lib/xlsx-export';

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserData {
  id:        number;
  idnumber:  string;
  firstname: string | null;
  lastname:  string | null;
  admin:     boolean;
  hr:        boolean;
}

interface Category {
  id:       number;
  name:     string;
  icon_key: string;
}

interface CertificateItem {
  id:                 number;
  title:              string;
  objective:          string;
  category:           number;
  category_name:      string;
  category_icon:      string;
  file_url:           string;
  original_filename:  string;
  employee_idnumber:  string;
  employee_firstname: string;
  employee_lastname:  string;
  created_at:         string;
  updated_at:         string;
}

interface EmployeeRow {
  idnumber:     string;
  firstname:    string;
  lastname:     string;
  department:   string;
  line:         string;
  certificates: CertificateItem[];
}

interface AdminListResponse {
  count:    number;
  next:     string | null;
  previous: string | null;
  results:  EmployeeRow[];
}

interface FilterOpt {
  id:            number;
  name:          string;
  department_id?: number;
}

// ── Constants / helpers ────────────────────────────────────────────────────────

const BLOCKED = /[<>{}[\]\\|^~`"]/;
const PAGE_SIZE = 10;

/** Converts an absolute Django media URL to a same-origin proxy URL that
 * strips X-Frame-Options so it can be embedded in an iframe.
 * The #toolbar=0&navpanes=0 fragment tells Chrome/Firefox's built-in PDF
 * viewer to hide its toolbar (download, print, zoom buttons). */
function toCertProxyUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return `/api/cert-proxy?path=${encodeURIComponent(pathname)}#toolbar=0&navpanes=0`;
  } catch {
    return `/api/cert-proxy?path=${encodeURIComponent(url)}#toolbar=0&navpanes=0`;
  }
}

/** Returns just the pathname for use in direct (new-tab) links. */
function toRelativeUrl(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
  });
}

function buildPaginationRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  const start = Math.max(2, current - 1);
  const end   = Math.min(total - 1, current + 1);
  for (let p = start; p <= end; p++) pages.push(p);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

// ── Category colors ──────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, { dot: string; bg: string; fg: string }> = {
  safety:     { dot: '#F97316', bg: 'rgba(249,115,22,0.12)',  fg: '#c2410c' },
  compliance: { dot: '#3B82F6', bg: 'rgba(59,130,246,0.12)', fg: '#1d4ed8' },
  training:   { dot: '#8B5CF6', bg: 'rgba(139,92,246,0.12)', fg: '#7c3aed' },
  health:     { dot: '#22C55E', bg: 'rgba(34,197,94,0.12)',  fg: '#16a34a' },
  performance:{ dot: '#14B8A6', bg: 'rgba(20,184,166,0.12)', fg: '#0d9488' },
  award:      { dot: '#D97706', bg: 'rgba(217,119,6,0.12)',  fg: '#b45309' },
  graduation: { dot: '#6366F1', bg: 'rgba(99,102,241,0.12)', fg: '#4f46e5' },
};

function getCategoryColor(iconKey: string) {
  return CATEGORY_COLORS[iconKey] ?? { dot: '#6B7280', bg: 'rgba(107,114,128,0.12)', fg: '#4b5563' };
}

// ── Skeleton rows ──────────────────────────────────────────────────────────────

function SkeletonTableRows({ count = 6 }: { count?: number }) {
  const widths = [80, 144, 112, 96, 32, 16];
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="border-b border-[var(--color-border)]">
          {widths.map((w, j) => (
            <td key={j} className="px-4 py-3">
              <div
                className="h-3 animate-pulse rounded-full bg-[var(--color-skeleton)]"
                style={{ width: w }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── Filter popover ────────────────────────────────────────────────────────────

function FilterPopover({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label:     string;
  options:   FilterOpt[];
  value:     number | null;
  onChange:  (id: number | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp,   setCanScrollUp  ] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  function checkScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 4);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }

  useEffect(() => {
    if (open) setTimeout(checkScroll, 0);
  }, [open, options]);

  return (
    <Popover open={disabled ? false : open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={disabled ? undefined : `Filter by ${label}`}
          disabled={disabled}
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors',
            disabled
              ? 'text-[var(--color-text-muted)] opacity-20 cursor-default'
              : value !== null
                ? 'text-[#2845D6]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]',
          )}
        >
          <ListFilter size={10} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-2">
        <div className="relative">
          {canScrollUp && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center bg-gradient-to-b from-[var(--color-bg-elevated)] pb-3 pt-0.5">
              <ChevronUp size={12} className="text-[var(--color-text-muted)]" />
            </div>
          )}
          <div
            ref={scrollRef}
            onScroll={checkScroll}
            className="max-h-60 space-y-0.5 overflow-y-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <button
              type="button"
              onClick={() => onChange(null)}
              className={cn(
                'w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                value === null
                  ? 'bg-[#2845D6]/10 font-medium text-[#2845D6]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]',
              )}
            >
              All
            </button>
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onChange(o.id)}
                className={cn(
                  'w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                  value === o.id
                    ? 'bg-[#2845D6]/10 font-medium text-[#2845D6]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]',
                )}
              >
                {o.name}
              </button>
            ))}
          </div>
          {canScrollDown && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center bg-gradient-to-t from-[var(--color-bg-elevated)] pb-0.5 pt-3">
              <ChevronDown size={12} className="text-[var(--color-text-muted)]" />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Sort icon ─────────────────────────────────────────────────────────────────────────────

function SortIconCell({
  field,
  current,
  dir,
  disabled = false,
}: {
  field:    string;
  current:  string;
  dir:      'asc' | 'desc';
  disabled?: boolean;
}) {
  if (disabled)
    return <ChevronsUpDown size={11} className="shrink-0 text-[var(--color-text-muted)] opacity-20" />;
  if (field !== current)
    return <ChevronsUpDown size={11} className="shrink-0 text-[var(--color-text-muted)] opacity-40" />;
  return dir === 'asc'
    ? <ChevronUp   size={11} className="shrink-0 text-[#2845D6]" />
    : <ChevronDown size={11} className="shrink-0 text-[#2845D6]" />;
}

// ── View Certificate Modal ─────────────────────────────────────────────────────

function ViewCertModal({
  cert,
  onClose,
}: {
  cert:    CertificateItem;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-2 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] truncate">
              {cert.title}
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {cert.category_name} · {cert.employee_firstname} {cert.employee_lastname}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="ml-4 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors">
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden" style={{ minHeight: '400px' }}>
          <iframe
              src={toCertProxyUrl(cert.file_url)}
              className="w-full"
              style={{ height: '60vh', border: 'none' }}
              title={cert.title}
            />
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Edit Certificate Modal ─────────────────────────────────────────────────────

function EditCertModal({
  cert,
  categories,
  onClose,
  onSuccess,
}: {
  cert:       CertificateItem;
  categories: Category[];
  onClose:    () => void;
  onSuccess:  (updated: CertificateItem) => void;
}) {
  const [title,      setTitle     ] = useState(cert.title);
  const [objective,  setObjective ] = useState(cert.objective);
  const [categoryId, setCategoryId] = useState(String(cert.category));
  const [newFile,    setNewFile   ] = useState<File | null>(null);
  const [titleErr,   setTitleErr  ] = useState('');
  const [saving,     setSaving    ] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleTitleChange(v: string) {
    setTitle(v);
    if (BLOCKED.test(v)) {
      setTitleErr('Special characters < > { } [ ] \\ | ^ ~ ` " are not allowed.');
    } else if (v.length > 255) {
      setTitleErr('Title cannot exceed 255 characters.');
    } else if (!v.trim()) {
      setTitleErr('Title is required.');
    } else {
      setTitleErr('');
    }
  }

  const hasError = !!titleErr || !title.trim() || !objective.trim() || !categoryId;

  async function handleSave() {
    if (hasError || saving) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title',     title.trim());
      fd.append('objective', objective.trim());
      fd.append('category',  categoryId);
      if (newFile) fd.append('file', newFile);

      const res = await fetch(`/api/certificates/admin/${cert.id}`, {
        method:      'PATCH',
        credentials: 'include',
        headers:     { 'X-CSRFToken': getCsrfToken() },
        body:        fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        const msg = (Array.isArray(err.title)     ? (err.title     as string[])[0] : null)
                 ?? (Array.isArray(err.objective) ? (err.objective as string[])[0] : null)
                 ?? (typeof err.detail === 'string' ? err.detail : null)
                 ?? 'Failed to save changes.';
        toast.error(msg);
        return;
      }
      const updated: CertificateItem = await res.json();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast.success('Certificate updated successfully.');
      onSuccess(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={saving ? undefined : onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Edit Certificate</h2>
          <button type="button" onClick={onClose} disabled={saving}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-40">
            <X size={15} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Title */}
          <Input
            label="Title"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            maxLength={255}
            error={titleErr}
            placeholder="Certificate title"
          />

          {/* Objective */}
          <TextareaWithCharactersLeft
            label="Objective"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            maxLength={500}
            placeholder="Describe the purpose or objective of this certificate"
            rows={3}
          />

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Category</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-full">
                {categoryId ? (
                  <span className="flex items-center gap-2 overflow-hidden">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: getCategoryColor(categories.find(c => String(c.id) === categoryId)?.icon_key ?? '').dot }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{categories.find(c => String(c.id) === categoryId)?.name}</span>
                  </span>
                ) : (
                  <SelectValue placeholder="Select category" />
                )}
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: getCategoryColor(c.icon_key).dot }}
                        aria-hidden="true"
                      />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Replace PDF */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">
              Replace PDF&nbsp;
              <span className="text-[var(--color-text-muted)] font-normal">(optional)</span>
            </label>
            <div
              className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--color-border-strong)] px-4 py-3 cursor-pointer hover:bg-[var(--color-bg-card)] transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={15} className="text-[var(--color-text-muted)] shrink-0" />
              <span className="text-sm text-[var(--color-text-muted)] truncate">
                {newFile ? newFile.name : cert.original_filename}
              </span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <div className="border-t border-[var(--color-border)] px-6 py-4 flex justify-end gap-3">
          <Button size="sm" onClick={handleSave} disabled={hasError || saving} className="min-w-[110px] flex items-center gap-2 text-sm font-normal px-6 py-4">
            {saving
              ? <TextShimmer>Saving...</TextShimmer>
              : <><Check size={14} /> Save Changes</>}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Delete Certificate Modal ───────────────────────────────────────────────────

function DeleteCertModal({
  cert,
  onClose,
  onSuccess,
}: {
  cert:      CertificateItem;
  onClose:   () => void;
  onSuccess: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/certificates/admin/${cert.id}`, {
        method:      'DELETE',
        credentials: 'include',
        headers:     { 'X-CSRFToken': getCsrfToken() },
      });
      if (res.ok || res.status === 204) {
        toast.success('Certificate deleted.');
        onSuccess();
      } else {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        toast.error(err.detail ?? 'Failed to delete certificate.');
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ConfirmationModal
      title="Delete Certificate"
      message={`This will permanently delete "${cert.title}" and cannot be undone.`}
      confirmLabel="Yes, Delete It"
      cancelLabel="No, Keep It"
      confirming={deleting}
      onConfirm={handleDelete}
      onCancel={onClose}
      icon={<AlertTriangle size={0} className="text-red-600" />}
    />
  );
}

// ── Upload Section ────────────────────────────────────────────────────────────

function UploadModal({
  categories,
  onSuccess,
  onClose,
}: {
  categories: Category[];
  onSuccess:  () => void;
  onClose:    () => void;
}) {
  const [files,      setFiles     ] = useState<File[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [title,      setTitle     ] = useState('');
  const [objective,  setObjective ] = useState('');
  const [titleErr,   setTitleErr  ] = useState('');
  const [progress,   setProgress  ] = useState(0);
  const [uploading,  setUploading ] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Download helper ─────────────────────────────────────────────────────────────────────────
  function scheduleDownload(blob: Blob, filename: string) {
    if (typeof window === 'undefined') return;
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.style.cssText = 'position:fixed;top:-9999px;left:-9999px';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (document.body.contains(a)) document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 150);
  }

  function handleTitleChange(v: string) {
    setTitle(v);
    if (BLOCKED.test(v)) {
      setTitleErr('Special characters < > { } [ ] \\ | ^ ~ ` " are not allowed.');
    } else if (v.length > 255) {
      setTitleErr('Title cannot exceed 255 characters.');
    } else {
      setTitleErr('');
    }
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files ?? []));
  }

  function handleRemoveFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  const canSubmit =
    files.length > 0 && !!categoryId && !!title.trim() && !!objective.trim() && !titleErr && !uploading;

  const certFilenamePattern = /^(\d+)_(.+)\.pdf$/i;

  function downloadCertValidationErrorReport(errors: { file: string; issue: string }[]) {
    try {
      const blob = styledXlsx(
        ['File', 'Issue'],
        errors.map(e => [e.file, e.issue]),
        [1],
      );
      scheduleDownload(blob, 'validation_errors.xlsx');
    } catch (err) {
      console.error('Failed to build validation error report:', err);
      toast.error('Could not generate error report.');
    }
  }

  function handleUpload() {
    if (!canSubmit) return;

    // ── Frontend filename validation ──
    const validFiles: File[] = [];
    const validationErrors: { file: string; issue: string }[] = [];

    for (const f of files) {
      if (!f.name.toLowerCase().endsWith('.pdf')) {
        validationErrors.push({ file: f.name, issue: 'Invalid file type (expected PDF).' });
        continue;
      }
      const match = f.name.match(certFilenamePattern);
      if (!match) {
        validationErrors.push({ file: f.name, issue: 'Filename must follow the pattern {idnumber}_{fullname}.pdf' });
        continue;
      }
      if (f.size > 5 * 1024 * 1024) {
        validationErrors.push({ file: f.name, issue: 'File must not exceed 5 MB.' });
        continue;
      }
      validFiles.push(f);
    }

    if (validationErrors.length > 0) {
      downloadCertValidationErrorReport(validationErrors);
    }

    if (validFiles.length === 0) {
      if (validationErrors.length > 0) {
        toast.error('All files failed validation. Downloaded error report.');
      }
      return;
    }

    if (validationErrors.length > 0) {
      toast.warning(`${validationErrors.length} file${validationErrors.length !== 1 ? 's' : ''} failed validation. Uploading ${validFiles.length} valid file${validFiles.length !== 1 ? 's' : ''}...`);
    }

    setProgress(0);
    setUploading(true);

    const fd = new FormData();
    validFiles.forEach((f) => fd.append('files', f));
    fd.append('category',  categoryId);
    fd.append('title',     title.trim());
    fd.append('objective', objective.trim());

    const xhr = new XMLHttpRequest();
    xhr.withCredentials = true;
    xhr.open('POST', '/api/certificates/admin/upload');
    xhr.setRequestHeader('X-CSRFToken', getCsrfToken());

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      setUploading(false);
      setProgress(0);

      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText) as {
          uploaded:         number;
          failed:           number;
          results:          { filename: string; status: string }[];
          error_report_b64: string | null;
        };

        if (data.uploaded > 0) {
          toast.success(
            `${data.uploaded} certificate${data.uploaded !== 1 ? 's' : ''} uploaded successfully.`,
          );
          setFiles([]);
          setCategoryId('');
          setTitle('');
          setObjective('');
          if (fileRef.current) fileRef.current.value = '';
          onSuccess();
        }

        if (data.failed > 0) {
          toast.warning(
            `${data.failed} file${data.failed !== 1 ? 's' : ''} failed. Downloading error report...`,
          );
          if (data.error_report_b64) {
            const raw  = atob(data.error_report_b64);
            const buf  = new Uint8Array(raw.length);
            for (let j = 0; j < raw.length; j++) buf[j] = raw.charCodeAt(j);
            const blob = new Blob([buf], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            scheduleDownload(blob, 'upload_errors.xlsx');
          }
        }
      } else {
        const err = JSON.parse(xhr.responseText) as { detail?: string };
        toast.error(err.detail ?? 'Upload failed. Please try again.');
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setProgress(0);
      toast.error('Network error during upload.');
    };

    xhr.send(fd);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={uploading ? undefined : onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--color-border)] px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Bulk Certificate Upload</h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Each PDF must be named{' '}
              <code className="bg-[var(--color-bg)] px-1 rounded">
                {'{idnumber}_{fullname}.pdf'}
              </code>
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={uploading}
            className="ml-4 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-40">
            <X size={15} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Drop-zone */}
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">PDF Files</label>
              <div
                onClick={() => !uploading && fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
                onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
                onDrop={e => {
                  e.preventDefault(); e.stopPropagation(); setIsDragging(false);
                  if (uploading) return;
                  const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
                  if (dropped.length > 0) setFiles(prev => [...prev, ...dropped]);
                }}
                className={cn(
                  'flex h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl',
                  'border-[3px] border-dashed transition-colors',
                  uploading ? 'pointer-events-none opacity-60' : '',
                  isDragging
                    ? 'border-[#2845D6] bg-[#2845D6]/5'
                    : 'border-[var(--color-border-strong)] hover:border-[#2845D6]/50 hover:bg-[var(--color-bg-elevated)]',
                )}
              >
                <Upload size={36} className={cn('transition-colors', isDragging ? 'text-[#2845D6]' : 'text-[var(--color-text-muted)]')} />
                <div className="text-center">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">
                    Click to select or drag &amp; drop
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {files.length > 0
                      ? `${files.length} file${files.length !== 1 ? 's' : ''} selected`
                      : '.pdf files only'}
                  </p>
                </div>
              </div>
              <input ref={fileRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleFilePick} />

              {/* Selected file list */}
              <AnimatePresence>
                {files.length > 0 && (
                  <motion.ul
                    key="file-list"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="mt-2 space-y-1"
                  >
                    {files.map((f) => (
                      <li
                        key={f.name}
                        className="flex items-center justify-between gap-2 rounded-lg bg-[var(--color-bg-card)] px-3 py-2 text-xs"
                      >
                        <span className="truncate text-[var(--color-text-primary)]">{f.name}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleRemoveFile(f.name); }}
                          className="shrink-0 text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>

            {/* Category */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Category</label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="w-full">
                  {categoryId ? (
                    <span className="flex items-center gap-2 overflow-hidden">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: getCategoryColor(categories.find(c => String(c.id) === categoryId)?.icon_key ?? '').dot }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{categories.find(c => String(c.id) === categoryId)?.name}</span>
                    </span>
                  ) : (
                    <SelectValue placeholder="Select category" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      <span className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: getCategoryColor(c.icon_key).dot }}
                          aria-hidden="true"
                        />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            <Input
              label="Title"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              maxLength={255}
              error={titleErr}
              placeholder="Certificate title"
            />

            {/* Objective */}
            <div className="md:col-span-2">
              <TextareaWithCharactersLeft
                label="Objective"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                maxLength={500}
                placeholder="Describe the purpose or objective of this certificate"
                rows={3}
              />
            </div>
          </div>

          {/* Upload progress */}
          <AnimatePresence>
            {uploading && (
              <motion.div
                key="progress"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-1.5"
              >
                <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
                  <span>Uploading files...</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
                  <div
                    className="h-full rounded-full bg-[#2845D6] origin-left transition-transform duration-300"
                    style={{ transform: `scaleX(${progress / 100})` }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] px-6 py-4 shrink-0 flex justify-end">
          <Button onClick={handleUpload} disabled={!canSubmit} className="min-w-[140px] flex items-center gap-2">
            {uploading
              ? <TextShimmer>Uploading...</TextShimmer>
              : <><Upload size={15} /> Upload Files</>
            }
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Accordion Row ──────────────────────────────────────────────────────────────

function AccordionRow({
  emp,
  isExpanded,
  onToggle,
  categories,
  onView,
  onEdit,
  onDelete,
}: {
  emp:        EmployeeRow;
  isExpanded: boolean;
  onToggle:   () => void;
  categories: Category[];
  onView:     (cert: CertificateItem) => void;
  onEdit:     (cert: CertificateItem) => void;
  onDelete:   (cert: CertificateItem) => void;
}) {
  const fullName = [emp.lastname, emp.firstname].filter(Boolean).join(', ') || emp.idnumber;

  return (
    <React.Fragment>
      {/* Employee header row */}
      <tr
        className={cn(
          'border-b border-[var(--color-border)] cursor-pointer transition-colors',
          isExpanded
            ? 'bg-[var(--color-bg-elevated)]'
            : 'hover:bg-[var(--color-bg-elevated)]',
        )}
        onClick={onToggle}
      >
        <td className="px-4 py-3.5 text-xs text-[var(--color-text-muted)]">
          {emp.idnumber}
        </td>
        <td className="px-4 py-3.5 text-xs font-medium text-[var(--color-text-primary)]">
          {fullName}
        </td>
        <td className="px-4 py-3.5 text-xs text-[var(--color-text-muted)] hidden sm:table-cell">
          {emp.department || '—'}
        </td>
        <td className="px-4 py-3.5 text-xs text-[var(--color-text-muted)] hidden sm:table-cell">
          {emp.line || '—'}
        </td>
        <td className="px-4 py-3.5 text-xs text-[var(--color-text-muted)]">
          {emp.certificates.length}
        </td>
        <td className="px-4 py-3.5 text-[var(--color-text-muted)]">
          {isExpanded
            ? <ChevronDown size={16} />
            : <ChevronRight size={16} />
          }
        </td>
      </tr>

      {/* Expanded certificates list */}
      <AnimatePresence>
        {isExpanded && (
          <tr key={`${emp.idnumber}-expanded`}>
            <td colSpan={6} className="p-0">
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.32, ease: [0.04, 0.62, 0.23, 0.98] }}
                className="overflow-hidden bg-[var(--color-bg)] border-t border-[var(--color-border)]"
              >
                {emp.certificates.length === 0 ? (
                  <div className="px-10 py-5 text-sm text-[var(--color-text-muted)]">
                    No certificates found for this employee.
                  </div>
                ) : (
                  <motion.ul
                    initial="hidden"
                    animate="visible"
                    variants={{ visible: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } } }}
                    className="divide-y divide-[var(--color-border)]"
                  >
                    {emp.certificates.map((cert) => (
                      <motion.li
                        key={cert.id}
                        variants={{
                          hidden:   { opacity: 0, y: 14, scale: 0.97 },
                          visible:  { opacity: 1, y: 0,  scale: 1,
                            transition: { type: 'spring', stiffness: 300, damping: 26 } },
                        }}
                        className="flex items-center gap-3 pl-10 pr-4 py-3"
                      >
                        {/* Category color bar */}
                        <div
                          className="w-1 h-5 shrink-0 rounded-full"
                          style={{ backgroundColor: getCategoryColor(cert.category_icon).dot }}
                        />

                        {/* Certificate info — issued date on top, then title + category pill */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span
                              className="text-[10px] text-[var(--color-text-muted)] italic"
                              aria-label={`Issued ${fmtDate(cert.created_at)}`}
                            >
                              {fmtDate(cert.created_at)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 overflow-hidden">
                            <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                              {cert.title}
                            </p>
                            <span
                              className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{
                                backgroundColor: getCategoryColor(cert.category_icon).bg,
                                color:           getCategoryColor(cert.category_icon).fg,
                              }}
                            >
                              {cert.category_name}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onView(cert); }}
                            title="View"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] transition-colors"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onEdit(cert); }}
                            title="Edit"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onDelete(cert); }}
                            title="Delete"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </motion.li>
                    ))}
                  </motion.ul>
                )}
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </React.Fragment>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function CertificationAdminPage() {
  const router = useRouter();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');

  useEffect(() => {
    // Show spinner briefly, then always transition to 'checking'
    const toChecking = setTimeout(() => setAuthPhase('checking'), 300);
    let checkingShownAt = 0;

    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => {
        if (!r.ok) { router.replace('/'); return null; }
        return r.json() as Promise<UserData>;
      })
      .then((u) => {
        if (!u) return;
        if (!u.admin && !u.hr) { router.replace('/dashboard/certification'); return; }
        // Ensure 'checking' phase is visible for at least 600ms
        const elapsed = Date.now() - checkingShownAt;
        const remaining = checkingShownAt === 0 ? 600 : Math.max(0, 600 - elapsed);
        setTimeout(() => setAuthPhase('done'), remaining);
      })
      .catch(() => router.replace('/'));

    const origToChecking = toChecking;
    // Track when checking phase is actually shown
    setTimeout(() => { checkingShownAt = Date.now(); }, 300);
    return () => clearTimeout(origToChecking);
  }, [router]);

  // ── Categories ────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    if (authPhase !== 'done') return;
    fetch('/api/certificates/categories', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: Category[]) => setCategories(data))
      .catch(() => {/* non-fatal */});
  }, [authPhase]);

  // ── Filter options ────────────────────────────────────────────────────────
  const [deptOptions, setDeptOptions] = useState<FilterOpt[]>([]);
  const [lineOptions, setLineOptions] = useState<FilterOpt[]>([]);

  useEffect(() => {
    if (authPhase !== 'done') return;
    fetch('/api/certificates/admin/filters', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { departments: FilterOpt[]; lines: FilterOpt[] }) => {
        setDeptOptions(data.departments);
        setLineOptions(data.lines);
      })
      .catch(() => {/* non-fatal */});
  }, [authPhase]);

  // ── Table state ───────────────────────────────────────────────────────────
  const [search,          setSearch         ] = useState('');
  const debouncedSearch                       = useDebounce(search, 350);
  const [sortField,       setSortField      ] = useState('idnumber');
  const [sortDir,         setSortDir        ] = useState<'asc' | 'desc'>('asc');
  const [page,            setPage           ] = useState(1);
  const [employees,       setEmployees      ] = useState<EmployeeRow[]>([]);
  const [totalCount,      setTotalCount     ] = useState(0);
  const [tableLoading,    setTableLoading   ] = useState(false);
  const [expandedIds,     setExpandedIds    ] = useState<Set<string>>(new Set());
  const [showImportModal, setShowImportModal] = useState(false);
  const [deptFilter,      setDeptFilter     ] = useState<number | null>(null);
  const [lineFilter,      setLineFilter     ] = useState<number | null>(null);
  const [refreshKey,      setRefreshKey     ] = useState(0);

  // ── Accordion actions ─────────────────────────────────────────────────────
  const [viewCert,   setViewCert  ] = useState<CertificateItem | null>(null);
  const [editCert,   setEditCert  ] = useState<CertificateItem | null>(null);
  const [deleteCert, setDeleteCert] = useState<CertificateItem | null>(null);

  // ── Fetch employees ───────────────────────────────────────────────────────
  const fetchEmployees = useCallback(async (signal?: AbortSignal) => {
    setTableLoading(true);
    const minDelay = new Promise<void>(res => setTimeout(res, 1000));
    try {
      const params = new URLSearchParams({ page: String(page), sort_by: sortField, sort_dir: sortDir });
      if (debouncedSearch)     params.set('search',        debouncedSearch);
      if (deptFilter !== null) params.set('department_id', String(deptFilter));
      if (lineFilter !== null) params.set('line_id',       String(lineFilter));
      const res = await fetch(`/api/certificates/admin/list?${params}`, {
        credentials: 'include',
        signal,
      });
      await minDelay;
      if (signal?.aborted) return;
      if (!res.ok) { toast.error('Failed to load certificates.'); return; }
      const data: AdminListResponse = await res.json();
      if (signal?.aborted) return;
      setEmployees(data.results);
      setTotalCount(data.count);
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      toast.error('Failed to load certificates.');
    } finally {
      if (!signal?.aborted) setTableLoading(false);
    }
  }, [page, debouncedSearch, sortField, sortDir, deptFilter, lineFilter, refreshKey]);

  useEffect(() => {
    if (authPhase !== 'done') return;
    const ac = new AbortController();
    fetchEmployees(ac.signal);
    return () => ac.abort();
  }, [authPhase, fetchEmployees])

  // Reset page when search, sort, or filters change
  useEffect(() => { setPage(1); }, [debouncedSearch, sortField, sortDir, deptFilter, lineFilter]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // ── Accordion toggle ──────────────────────────────────────────────────────
  function toggleExpand(idnumber: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(idnumber)) next.delete(idnumber);
      else next.add(idnumber);
      return next;
    });
  }

  // ── Edit success ──────────────────────────────────────────────────────────
  function handleEditSuccess(updated: CertificateItem) {
    setEditCert(null);
    setEmployees((prev) =>
      prev.map((emp) => ({
        ...emp,
        certificates: emp.certificates.map((c) => (c.id === updated.id ? updated : c)),
      })),
    );
  }

  // ── Delete success ────────────────────────────────────────────────────────
  function handleDeleteSuccess() {
    setDeleteCert(null);
    setExpandedIds(new Set());
    setRefreshKey((k) => k + 1);
  }

  // ── Sort ───────────────────────────────────────────────────────────────────────
  function handleSort(field: string) {
    if (field === sortField) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  }

  // ── Skeleton page ─────────────────────────────────────────────────────────
  if (authPhase === 'spinner') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#2845D6]" />
      </div>
    );
  }
  if (authPhase !== 'done') {
    return (
      <div className="flex h-full items-center justify-center">
        <TextShimmer className="text-sm" duration={1.4}>Checking permissions…</TextShimmer>
      </div>
    );
  }

  const hasData = employees.length > 0;

  return (
    <div className="mx-auto p-4 sm:p-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Certificate Management</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Upload certificates and manage employee records.
        </p>
      </div>

      {/* Search + Import row */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="min-w-[200px] max-w-sm flex-1">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by employee ID or name…"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2845D6] text-white
              text-xs font-medium hover:bg-[#1f38c0] transition-colors shrink-0"
          >
            <Upload size={12} />
            Import Certificate
          </button>
        </div>
      </div>

      {/* Employees accordion table */}
      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]">

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <th className="px-4 py-2.5 text-left break-words" style={{ width: 130 }}>
                  <button type="button" onClick={() => handleSort('idnumber')}
                    className={cn('flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition-colors', 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer')}>
                    ID Number
                    <SortIconCell field="idnumber" current={sortField} dir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-2.5 text-left break-words" style={{ width: 220 }}>
                  <button type="button" onClick={() => handleSort('name')}
                    className={cn('flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition-colors', 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer')}>
                    Employee Name
                    <SortIconCell field="name" current={sortField} dir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-2.5 text-left hidden sm:table-cell break-words" style={{ width: 160 }}>
                  <div className="flex items-center justify-between gap-1">
                    <button type="button" onClick={() => handleSort('department')}
                      className={cn('flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition-colors', 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer')}>
                      Department
                      <SortIconCell field="department" current={sortField} dir={sortDir} />
                    </button>
                    <FilterPopover
                      label="Department"
                      options={deptOptions}
                      value={deptFilter}
                      onChange={(id) => { setDeptFilter(id); setLineFilter(null); }}
                    />
                  </div>
                </th>
                <th className="px-4 py-2.5 text-left hidden sm:table-cell break-words" style={{ width: 130 }}>
                  <div className="flex items-center justify-between gap-1">
                    <button type="button" onClick={() => handleSort('line')}
                      className={cn('flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition-colors', 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer')}>
                      Line
                      <SortIconCell field="line" current={sortField} dir={sortDir} />
                    </button>
                    <FilterPopover
                      label="Line"
                      options={deptFilter !== null ? lineOptions.filter(l => l.department_id === deptFilter) : lineOptions}
                      value={lineFilter}
                      onChange={setLineFilter}
                    />
                  </div>
                </th>
                <th className="px-4 py-2.5 text-left break-words" style={{ width: 80 }}>
                  <button type="button" onClick={() => handleSort('cert_count')}
                    className={cn('flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition-colors', 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer')}>
                    Certs
                    <SortIconCell field="cert_count" current={sortField} dir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-2.5 w-10" style={{ width: 52 }} />
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <SkeletonTableRows count={6} />
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12">
                    <EmptyState
                      title="No certificates found"
                      description={search ? 'Try a different search term.' : 'Upload certificates to get started.'}
                      icons={[FileText, BadgeCheck, Award]}
                    />
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <AccordionRow
                    key={emp.idnumber}
                    emp={emp}
                    isExpanded={expandedIds.has(emp.idnumber)}
                    onToggle={() => toggleExpand(emp.idnumber)}
                    categories={categories}
                    onView={setViewCert}
                    onEdit={setEditCert}
                    onDelete={setDeleteCert}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination - always visible in lower-left */}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
          <div className="text-xs text-[var(--color-text-muted)]">
            Showing{' '}
            <span className="text-xs text-[var(--color-text-muted)]">
              {totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)}
            </span>
            {' '}of{' '}
            <span className="text-xs text-[var(--color-text-muted)]">{totalCount}</span>
          </div>

          <div>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  />
                </PaginationItem>
                {buildPaginationRange(page, totalPages).map((p, i) => (
                  <PaginationItem key={`${p}-${i}`}>
                    {p === '...' ? (
                      <PaginationEllipsis />
                    ) : (
                      <PaginationLink
                        isActive={p === page}
                        onClick={() => setPage(p as number)}
                      >
                        {p}
                      </PaginationLink>
                    )}
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showImportModal && (
          <UploadModal
            key="import"
            categories={categories}
            onClose={() => setShowImportModal(false)}
            onSuccess={() => {
              setShowImportModal(false);
              setExpandedIds(new Set());
              setRefreshKey((k) => k + 1);
            }}
          />
        )}
        {viewCert && (
          <ViewCertModal key="view" cert={viewCert} onClose={() => setViewCert(null)} />
        )}
        {editCert && (
          <EditCertModal
            key="edit"
            cert={editCert}
            categories={categories}
            onClose={() => setEditCert(null)}
            onSuccess={handleEditSuccess}
          />
        )}
        {deleteCert && (
          <DeleteCertModal
            key="delete"
            cert={deleteCert}
            onClose={() => setDeleteCert(null)}
            onSuccess={handleDeleteSuccess}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

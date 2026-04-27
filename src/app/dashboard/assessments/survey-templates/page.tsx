'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Copy, Edit2, Eye, Layout, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { Input } from '@/components/ui/input';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/modal';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { toast } from '@/components/ui/toast';
import { TextareaWithCharactersLeft } from '@/components/ui/textarea-with-characters-left';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getCsrfToken } from '@/lib/csrf';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserData {
  id: number;
  idnumber: string;
  firstname: string;
  lastname: string;
  admin: boolean;
  hr: boolean;
  iad: boolean;
}

interface TemplateListItem {
  id: number;
  title: string;
  description: string;
  created_by_name: string;
  created_by_id: number | null;
  created_at: string;
  question_count: number;
  template_type?: string;
}

interface TemplateDetail extends TemplateListItem {
  questions?: unknown[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TEMPLATE_CARD_COLORS: [string, string][] = [
  ['#4F46E5', '#7C3AED'],
  ['#1E293B', '#0F172A'],
  ['#7C3AED', '#DB2777'],
  ['#D97706', '#EA580C'],
  ['#059669', '#0D9488'],
  ['#E11D48', '#BE123C'],
  ['#0EA5E9', '#0284C7'],
  ['#8B5CF6', '#6D28D9'],
];

const TEMPLATE_CATEGORIES = [
  'All', 'Leadership Alignment', 'Engagement', 'Effectiveness', 'Experience', 'Onboarding',
];

// ── Card Components ───────────────────────────────────────────────────────────

function TemplateCardPreview({ template, colorIdx }: { template: TemplateListItem; colorIdx: number }) {
  const [from, to] = TEMPLATE_CARD_COLORS[colorIdx % TEMPLATE_CARD_COLORS.length];
  const mockLines = Math.min(template.question_count, 3);
  return (
    <div
      className="relative h-44 overflow-hidden flex items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      <div className="w-full max-w-[180px] bg-white/90 rounded-lg p-3 shadow-md mx-auto">
        <div className="text-[8px] font-bold text-gray-800 mb-1 truncate">{template.title}</div>
        <div className="text-[7px] text-gray-500 mb-2 truncate">{template.description || 'No description'}</div>
        {[...Array(mockLines)].map((_, i) => (
          <div key={i} className="mb-1.5">
            <div className="h-[5px] bg-gray-200 rounded w-4/5 mb-1" />
            <div className="flex gap-1">
              <div className="h-[5px] w-2 bg-gray-300 rounded-sm shrink-0" />
              <div className="h-[5px] bg-gray-100 rounded flex-1" />
            </div>
          </div>
        ))}
        {template.question_count > 0 && (
          <div className="mt-1.5 flex justify-center">
            <div className="h-4 px-3 bg-gray-800 rounded text-white text-[6px] flex items-center justify-center">Submit</div>
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  colorIdx,
  duplicatingId,
  deletingId,
  userId,
  onView,
  onDuplicate,
  onDelete,
  onRename,
}: {
  template: TemplateListItem;
  colorIdx: number;
  duplicatingId: number | null;
  deletingId: number | null;
  userId: number;
  onView: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRename: (id: number, title: string) => Promise<void>;
}) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(template.title);
  const [savingTitle, setSavingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTitle(template.title);
  }, [template.title]);

  useEffect(() => {
    if (isEditingTitle) titleInputRef.current?.focus();
  }, [isEditingTitle]);

  const estMins = Math.max(1, Math.ceil(template.question_count * 50 / 60));
  const isDeleting = deletingId === template.id;
  const isDuplicating = duplicatingId === template.id;
  const isOwner = template.created_by_id === userId;

  return (
    <motion.div
      layout
      layoutId={`template-card-${template.id}`}
      className="group relative rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] overflow-hidden cursor-pointer w-[240px] h-[280px] max-w-[240px]"
      whileHover={{ y: -3, boxShadow: '0 10px 24px -4px rgba(0,0,0,0.12)' }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
      onClick={onView}
    >
      <TemplateCardPreview template={template} colorIdx={colorIdx} />
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
        <button onClick={e => { e.stopPropagation(); onView(); }} className="h-7 w-7 flex items-center justify-center rounded-md bg-white/90 text-gray-700 hover:bg-white shadow-sm transition-colors" title="View">
          <Eye size={13} />
        </button>
        <button onClick={e => { e.stopPropagation(); onView(); }} className="h-7 w-7 flex items-center justify-center rounded-md bg-white/90 text-gray-700 hover:bg-white shadow-sm transition-colors" title="Edit">
          <Edit2 size={13} />
        </button>
        <button onClick={e => { e.stopPropagation(); onDuplicate(); }} disabled={isDuplicating} className="h-7 w-7 flex items-center justify-center rounded-md bg-white/90 text-gray-700 hover:bg-white shadow-sm transition-colors disabled:opacity-50" title="Duplicate">
          {isDuplicating ? <Loader2 size={13} className="animate-spin" /> : <Copy size={13} />}
        </button>
        {isOwner && (
          <button onClick={e => { e.stopPropagation(); onDelete(); }} disabled={isDeleting} className="h-7 w-7 flex items-center justify-center rounded-md bg-white/90 text-red-500 hover:bg-white shadow-sm transition-colors disabled:opacity-50" title="Delete">
            {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        )}
      </div>
      <div className="p-4">
        <div className="min-h-[1.25rem]">
          {isEditingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onClick={e => e.stopPropagation()}
            onBlur={() => setIsEditingTitle(false)}
            onKeyDown={async e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!savingTitle) {
                  const trimmed = title.trim();
                  if (trimmed && trimmed !== template.title) {
                    setSavingTitle(true);
                    try {
                      await onRename(template.id, trimmed);
                    } finally {
                      setSavingTitle(false);
                      setIsEditingTitle(false);
                    }
                  } else {
                    setIsEditingTitle(false);
                    setTitle(template.title);
                  }
                }
              }
            }}
            className={cn(
              'w-full bg-transparent border-0 border-[var(--color-border)] p-1 rounded-sm text-xs font-semibold text-[var(--color-text-primary)] outline-none leading-snug h-5 py-0',
              'placeholder:text-[var(--color-text-muted)]',
              savingTitle && 'opacity-60',
            )}
          />
        ) : (
          <p
            className="font-semibold text-xs text-[var(--color-text-secondary)] truncate leading-snug cursor-text h-5"
            onClick={e => {
              e.stopPropagation();
              setIsEditingTitle(true);
            }}
          >
            {template.title}
          </p>
        )}
        </div>
        <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
          {template.question_count} Questions • {estMins} min{estMins !== 1 ? 's' : ''}
        </p>
      </div>
    </motion.div>
  );
}

function CreateNewTemplateCard({ onClick }: { onClick: () => void }) {
  return (
    <motion.div
      layout
      layoutId="create-template-card"
      onClick={onClick}
      className="group rounded-xl border-2 border-dashed border-[var(--color-border)] hover:border-[#2845D6]/50 bg-transparent hover:bg-[var(--color-bg-card)] transition-colors duration-200 cursor-pointer flex flex-col items-center justify-center gap-3 w-[240px] h-[280px] max-w-[240px] max-h-[280px]"
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="w-10 h-10 rounded-lg border-2 border-[var(--color-border)] group-hover:border-[#2845D6] flex items-center justify-center text-[var(--color-text-muted)] group-hover:text-[#2845D6] transition-colors duration-200">
        <Plus size={18} />
      </div>
      <p className="text-xs font-medium text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors duration-200 text-center px-4">
        Create New Template
      </p>
    </motion.div>
  );
}

// ── Templates Content ─────────────────────────────────────────────────────────

function TemplatesContent({ user }: { user: UserData }) {
  const router = useRouter();
  const [rows, setRows] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [hasAnyTemplate, setHasAnyTemplate] = useState<boolean | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [newTemplateSaving, setNewTemplateSaving] = useState(false);
  const [newTemplateRedirecting, setNewTemplateRedirecting] = useState(false);
  const [tmplTitle, setTmplTitle] = useState('');
  const [tmplDescription, setTmplDescription] = useState('');
  const [tmplType, setTmplType] = useState('');
  const [tmplErrors, setTmplErrors] = useState<Record<string, string>>({});
  const [deleteCandidate, setDeleteCandidate] = useState<TemplateListItem | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRows = useCallback(async (p: number, q: string, isInitial = false) => {
    const startTime = Date.now();
    if (isInitial) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set('search', q);
      const res = await fetch(`/api/survey/admin/templates?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setRows(data.results as TemplateListItem[]);
      if (!q) setHasAnyTemplate(data.pagination.total > 0);
    } catch {
      toast.error('Could not load templates.', { title: 'Error' });
    } finally {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 1000 - elapsed);
      if (remaining > 0) await new Promise<void>(r => setTimeout(r, remaining));
      setLoading(false);
    }
  }, []);

  const triggerFetch = useCallback((p: number, q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchRows(p, q), 300);
  }, [fetchRows]);

  useEffect(() => {
    fetchRows(1, '', true);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchRows]);

  function openNewTemplate() {
    setTmplTitle('');
    setTmplDescription('');
    setTmplType('');
    setTmplErrors({});
    setNewTemplateOpen(true);
  }

  async function handleCreateTemplate() {
    const errors: Record<string, string> = {};
    if (!tmplTitle.trim()) errors.title = 'Template title is required.';
    if (!tmplType) errors.template_type = 'Category is required.';
    if (!tmplDescription.trim()) errors.description = 'Description is required.';
    if (Object.keys(errors).length) { setTmplErrors(errors); return; }

    const startTime = Date.now();
    setNewTemplateSaving(true);
    setTmplErrors({});
    try {
      const body: Record<string, string> = { title: tmplTitle.trim(), description: tmplDescription.trim() };
      if (tmplType) body.template_type = tmplType;
      const res = await fetch('/api/survey/admin/templates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify(body),
      });
      const raw = await res.json();
      if (!res.ok) {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw as Record<string, unknown>))
          fe[k] = Array.isArray(v) ? (v as string[])[0] : String(v);
        setTmplErrors(fe);
        return;
      }
      const newTmpl = raw as TemplateDetail;
      if (!newTmpl.id) {
        toast.error('Template created, but the returned ID is missing.', { title: 'Error' });
        return;
      }
      const elapsed = Date.now() - startTime;
      const minimumMs = 400;
      if (elapsed < minimumMs) await new Promise<void>(r => setTimeout(r, minimumMs - elapsed));
      setHasAnyTemplate(true);
      setNewTemplateRedirecting(true);
      await new Promise<void>(r => setTimeout(r, 2000));
      setNewTemplateOpen(false);
      router.push(`/dashboard/assessments/survey-templates/builder/${newTmpl.id}`);
      return;
    } catch (error) {
      toast.error('Could not create template. Please try again.', { title: 'Error' });
    } finally {
      setNewTemplateSaving(false);
      setNewTemplateRedirecting(false);
    }
  }

  async function handleDuplicate(row: TemplateListItem) {
    setDuplicatingId(row.id);
    try {
      const res = await fetch(`/api/survey/admin/templates/${row.id}/duplicate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      if (res.ok) {
        toast.success('Template duplicated.', { title: 'Duplicated' });
        fetchRows(page, search);
      } else {
        const d = await res.json();
        toast.error(d.detail ?? 'Failed to duplicate template.', { title: 'Error' });
      }
    } finally {
      setDuplicatingId(null);
    }
  }

  function handleDelete(row: TemplateListItem) {
    setDeleteCandidate(row);
  }

  async function confirmDelete() {
    if (!deleteCandidate) return;
    setDeletingId(deleteCandidate.id);
    try {
      const res = await fetch(`/api/survey/admin/templates/${deleteCandidate.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      if (res.status === 204) {
        toast.success('Template deleted.', { title: 'Deleted' });
        fetchRows(page, search);
        setDeleteCandidate(null);
      } else {
        const d = await res.json();
        toast.error(d.detail ?? 'Could not delete.', { title: 'Error' });
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRenameTemplate(id: number, title: string) {
    const res = await fetch(`/api/survey/admin/templates/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error((d as { detail?: string }).detail || 'Failed to update template title.');
    }
    const updated = await res.json() as TemplateDetail;
    setRows(prev => prev.map(row => row.id === id ? { ...row, title: updated.title } : row));
    toast.success('Template title updated.', { title: 'Updated' });
  }

  const filteredRows = selectedCategory === 'All'
    ? rows
    : rows.filter(r =>
        (r.template_type && r.template_type === selectedCategory) ||
        r.title.toLowerCase().includes(selectedCategory.toLowerCase()) ||
        r.description.toLowerCase().includes(selectedCategory.toLowerCase())
      );

  return (
    <>
      <div className="w-full">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">Explore Survey Templates</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-1.5">
            Create, select, or personalize survey templates to perfectly fit your needs
          </p>
        </div>

        <div className="flex justify-center mb-3">
          <div className="relative w-full max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); triggerFetch(1, e.target.value); }}
              placeholder="Search templates"
              className="w-full h-9 px-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[#2845D6]/40"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--color-text-muted)] border border-[var(--color-border)] px-1.5 rounded">/</kbd>
          </div>
        </div>

        <div className="flex justify-center flex-wrap gap-1 mb-8">
          {TEMPLATE_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors duration-150',
                selectedCategory === cat
                  ? 'bg-[var(--color-text-primary)] text-[var(--color-bg)] shadow-sm'
                  : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)]',
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#2845D6]" />
          </div>
        ) : (
          <div className="grid justify-items-center gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, 240px)' }}>
            <AnimatePresence mode="popLayout">
              <CreateNewTemplateCard key="create-card" onClick={openNewTemplate} />
              {filteredRows.map((tmpl, idx) => (
                <TemplateCard
                  key={tmpl.id}
                  template={tmpl}
                  colorIdx={idx}
                  duplicatingId={duplicatingId}
                  deletingId={deletingId}
                  userId={user.id}
                  onView={() => router.push(`/dashboard/assessments/survey-templates/builder/${tmpl.id}`)}
                  onDuplicate={() => handleDuplicate(tmpl)}
                  onDelete={() => handleDelete(tmpl)}
                  onRename={handleRenameTemplate}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* New Template Modal */}
      <Modal open={newTemplateOpen} onOpenChange={open => !newTemplateSaving && !newTemplateRedirecting && !open && setNewTemplateOpen(false)}>
        <ModalContent className="max-w-lg">
          <ModalHeader>
            <ModalTitle>New Template</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                  Template Title {!tmplTitle.trim() && <span className="text-red-500 normal-case tracking-normal">*</span>}
                </label>
                <Input value={tmplTitle} onChange={e => setTmplTitle(e.target.value)} maxLength={200} placeholder="Enter template title…" className={cn(tmplErrors.title && 'border-destructive')} />
                {tmplErrors.title && <p className="text-xs text-destructive">{tmplErrors.title}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                  Category {!tmplType && <span className="text-red-500 normal-case tracking-normal">*</span>}
                </label>
                <Select value={tmplType} onValueChange={setTmplType}>
                  <SelectTrigger className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring data-[placeholder]:text-[var(--color-text-muted)]">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORIES.filter(c => c !== 'All').map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {tmplErrors.template_type && <p className="text-xs text-destructive">{tmplErrors.template_type}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <TextareaWithCharactersLeft
                  label={<>Description {!tmplDescription.trim() && <span className="text-red-500 normal-case tracking-normal">*</span>}</>}
                  maxLength={1000}
                  value={tmplDescription}
                  onChange={e => setTmplDescription(e.target.value)}
                  placeholder="Describe this template…"
                  rows={3}
                  wrapperClassName={cn(tmplErrors.description && '[&_textarea]:border-destructive')}
                />
                {tmplErrors.description && <p className="text-xs text-destructive">{tmplErrors.description}</p>}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCreateTemplate}
                disabled={newTemplateSaving || newTemplateRedirecting}
                className="min-w-[160px] flex items-center justify-center gap-2 px-5 py-2 rounded-lg bg-[var(--btn-primary-bg,#2845D6)] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {(newTemplateSaving || newTemplateRedirecting) ? (
                  <TextShimmer duration={1.2} className="text-sm font-semibold text-white [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]">
                    {newTemplateRedirecting ? 'Preparing Builder…' : 'Creating…'}
                  </TextShimmer>
                ) : (
                  <>
                    <Plus className="size-4" />
                    Create Template
                  </>
                )}
              </button>
            </div>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {deleteCandidate && (
        <ConfirmationModal
          title="Delete Template"
          message={`Are you sure you want to delete "${deleteCandidate.title}"? This action cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          confirming={deletingId !== null}
          onConfirm={confirmDelete}
          onCancel={() => { if (!deletingId) setDeleteCandidate(null); }}
        />
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SurveyTemplatesPage() {
  const router = useRouter();
  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');
  const [user, setUser] = useState<UserData | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setAuthPhase('checking'), 350);
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => { if (!r.ok) { router.push('/'); return null; } return r.json(); })
      .then((u: UserData | null) => {
        clearTimeout(timer);
        if (!u) { router.push('/dashboard'); return; }
        const hasAccess = u.admin || u.hr || u.iad;
        if (!hasAccess) { router.push('/dashboard'); return; }
        setUser(u);
        setAuthPhase('done');
      })
      .catch(() => { clearTimeout(timer); router.push('/'); });
    return () => clearTimeout(timer);
  }, [router]);

  if (authPhase === 'spinner') {
    return (
      <div className="flex h-48 items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#2845D6]" />
      </div>
    );
  }

  if (authPhase === 'checking') {
    return (
      <div className="flex h-48 items-center justify-center">
        <TextShimmer className="text-sm text-muted-foreground" duration={1.4}>Checking permissions…</TextShimmer>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 w-full">
      <TemplatesContent user={user} />
    </div>
  );
}

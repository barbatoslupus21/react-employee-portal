'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { X, Upload, GripVertical, Trash2, ChevronUp, ChevronDown, Eye, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HashtagText } from './HashtagText';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { FileUploadDropzone } from '@/components/ui/file-upload-dropzone';
import type { AnnouncementListItem } from '@/app/dashboard/announcements/_hooks/useAnnouncements';

const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', // images
  'mp4', 'webm', 'ogg',                // videos
]);
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

type MediaPreview = {
  key: string;
  file: File | null;           // null = existing server file
  url: string;
  media_type: 'image' | 'video';
  order: number;
  serverId?: number;           // existing media id
};

type AnnouncementFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: AnnouncementListItem | null;
  onSave: (data: FormData, publish: boolean) => Promise<void>;
};

export function AnnouncementFormModal({
  open,
  onOpenChange,
  editing,
  onSave,
}: AnnouncementFormModalProps) {
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [mediaPreviews, setMediaPreviews] = useState<MediaPreview[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMode, setSaveMode] = useState<'draft' | 'publish' | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Populate form when editing
  useEffect(() => {
    if (editing) {
      setTitle(editing.title ?? '');
      setCaption(editing.caption ?? '');
      const existing: MediaPreview[] = editing.media.map((m) => ({
        key: `existing-${m.id}`,
        file: null,
        url: m.file,
        media_type: m.media_type,
        order: m.order,
        serverId: m.id,
      }));
      setMediaPreviews(existing);
    } else {
      setTitle('');
      setCaption('');
      setMediaPreviews([]);
    }
    setFileErrors([]);
    setShowPreview(false);
  }, [editing, open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  function validateAndAddFiles(files: File[]) {
    const errors: string[] = [];
    const valid: MediaPreview[] = [];

    for (const f of files) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        errors.push(`"${f.name}": unsupported format (.${ext}). Allowed: jpg, jpeg, png, gif, webp, mp4, webm, ogg`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        errors.push(`"${f.name}": exceeds 50 MB limit (${(f.size / 1024 / 1024).toFixed(1)} MB)`);
        continue;
      }
      const isVideo = ['mp4', 'webm', 'ogg'].includes(ext);
      valid.push({
        key: `new-${f.name}-${f.size}-${Date.now()}`,
        file: f,
        url: URL.createObjectURL(f),
        media_type: isVideo ? 'video' : 'image',
        order: mediaPreviews.length + valid.length,
      });
    }

    setFileErrors(errors);
    if (valid.length > 0) {
      setMediaPreviews((prev) => [...prev, ...valid]);
    }
  }

  function removeMedia(key: string) {
    setMediaPreviews((prev) => prev.filter((m) => m.key !== key));
  }

  function moveMedia(key: string, direction: 'up' | 'down') {
    setMediaPreviews((prev) => {
      const idx = prev.findIndex((m) => m.key === key);
      if (idx === -1) return prev;
      const next = [...prev];
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((m, i) => ({ ...m, order: i }));
    });
  }

  async function handleSubmit(publish: boolean) {
    if (!caption.trim()) return;
    setSaving(true);
    setSaveMode(publish ? 'publish' : 'draft');
    try {
      const fd = new FormData();
      if (title) fd.append('title', title);
      fd.append('caption', caption);
      fd.append('is_published', String(publish));
      mediaPreviews.forEach((m) => {
        if (m.file) fd.append('media', m.file);
      });
      await onSave(fd, publish);
      onOpenChange(false);
    } finally {
      setSaving(false);
      setSaveMode(null);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => !saving && onOpenChange(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                {editing ? 'Edit Announcement' : 'New Announcement'}
              </h2>
              <button
                type="button"
                onClick={() => !saving && onOpenChange(false)}
                className="rounded-full p-1.5 hover:bg-[var(--color-bg-subtle)] transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-[var(--color-text-muted)]" />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[calc(100vh-18rem)] overflow-y-auto px-5 py-4 space-y-4">
              {/* Title (optional) */}
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  Title <span className="text-[var(--color-text-muted)] font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  placeholder="Announcement title…"
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#2845D6] transition-all"
                />
              </div>

              {/* Caption */}
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  Caption <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder="Write your announcement… Use #hashtags to highlight keywords."
                  className="w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#2845D6] transition-all"
                />
                <div className="flex justify-between mt-1">
                  <button
                    type="button"
                    onClick={() => setShowPreview((v) => !v)}
                    className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)] hover:text-[#2845D6] transition-colors"
                  >
                    <Eye className="h-3 w-3" />
                    {showPreview ? 'Hide preview' : 'Preview hashtags'}
                  </button>
                  <span className="text-[11px] text-[var(--color-text-muted)]">{caption.length}/2000</span>
                </div>
                {/* Live hashtag preview */}
                <AnimatePresence>
                  {showPreview && caption.trim() && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2 text-sm text-[var(--color-text-primary)] leading-relaxed">
                        <HashtagText text={caption} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Media upload */}
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  Media <span className="text-[var(--color-text-muted)] font-normal">(images & videos)</span>
                </label>
                <FileUploadDropzone
                  files={[]}
                  onFilesChange={(files) => validateAndAddFiles(files)}
                  accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/ogg"
                  multiple
                  helperText="jpg, jpeg, png, gif, webp, mp4, webm, ogg · max 50 MB each"
                />

                {/* File errors */}
                {fileErrors.length > 0 && (
                  <div className="mt-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
                    {fileErrors.map((err, i) => (
                      <p key={i} className="text-xs text-red-600 dark:text-red-400">{err}</p>
                    ))}
                  </div>
                )}

                {/* Media previews (reorderable) */}
                {mediaPreviews.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {mediaPreviews.map((m, idx) => (
                      <div
                        key={m.key}
                        className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-2"
                      >
                        {/* Thumbnail */}
                        <div className="h-12 w-16 flex-shrink-0 rounded-lg overflow-hidden bg-[var(--color-border)]">
                          {m.media_type === 'image' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center">
                              <FileText className="h-5 w-5 text-[var(--color-text-muted)]" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                            {m.file?.name ?? `Existing ${m.media_type}`}
                          </p>
                          <p className="text-[11px] text-[var(--color-text-muted)] capitalize">{m.media_type}</p>
                        </div>

                        {/* Order controls */}
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveMedia(m.key, 'up')}
                            disabled={idx === 0}
                            className="rounded p-0.5 hover:bg-[var(--color-border)] disabled:opacity-30 transition-colors"
                            aria-label="Move up"
                          >
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveMedia(m.key, 'down')}
                            disabled={idx === mediaPreviews.length - 1}
                            className="rounded p-0.5 hover:bg-[var(--color-border)] disabled:opacity-30 transition-colors"
                            aria-label="Move down"
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => removeMedia(m.key)}
                          className="rounded-full p-1 text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          aria-label="Remove media"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-4">
              <button
                type="button"
                onClick={() => !saving && onOpenChange(false)}
                disabled={saving}
                className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={saving || !caption.trim()}
                className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] disabled:opacity-50 transition-colors"
              >
                {saving && saveMode === 'draft' ? (
                  <TextShimmer className="text-sm">Saving…</TextShimmer>
                ) : (
                  'Save as Draft'
                )}
              </button>
              <button
                type="button"
                onClick={() => handleSubmit(true)}
                disabled={saving || !caption.trim()}
                className="rounded-xl bg-[#2845D6] px-4 py-2 text-sm font-medium text-white hover:bg-[#0D1A63] disabled:opacity-50 transition-colors"
              >
                {saving && saveMode === 'publish' ? (
                  <TextShimmer className="text-sm">Publishing…</TextShimmer>
                ) : (
                  'Publish'
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

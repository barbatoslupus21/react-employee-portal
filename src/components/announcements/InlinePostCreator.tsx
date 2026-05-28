'use client';

import { useState, useRef, useEffect } from 'react';
import { Image as ImageIcon, FileText, X, ChevronUp, ChevronDown } from 'lucide-react';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { UserAvatar } from './UserAvatar';
import { cn } from '@/lib/utils';
import type { AnnouncementListItem } from '@/app/dashboard/announcements/_hooks/useAnnouncements';

// --------------------------------------------------------------------------- //
//  Constants                                                                   //
// --------------------------------------------------------------------------- //
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'ogg']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'ogg']);
const MAX_BYTES = 50 * 1024 * 1024;

// --------------------------------------------------------------------------- //
//  Types                                                                       //
// --------------------------------------------------------------------------- //
type MediaPreview = {
  key: string;
  file: File;
  url: string;
  media_type: 'image' | 'video';
  order: number;
};

export type InlinePostCreatorProps = {
  userAvatar: string | null;
  userName: string;
  editingAnnouncement?: AnnouncementListItem | null;
  onPost: (data: FormData) => Promise<void>;
  onCancelEdit?: () => void;
};

// --------------------------------------------------------------------------- //
//  Hashtag-highlighting textarea overlay                                       //
// --------------------------------------------------------------------------- //
const HASHTAG_SPLIT = /(#\w+)/g;

function HighlightTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Auto-grow
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // Sync scroll
  function syncScroll() {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }

  const parts = value.split(HASHTAG_SPLIT);

  return (
    <div className="relative w-full rounded-none border-0 bg-transparent shadow-none outline-none ring-0 focus-within:border-0 focus-within:outline-none focus-within:ring-0">
      {/* Backdrop */}
      <div
        ref={backdropRef}
        aria-hidden="true"
        className={cn(
          'absolute inset-0 pointer-events-none overflow-hidden',
          'px-0 py-0 text-xs leading-5 whitespace-pre-wrap break-words',
          'font-[inherit] text-[var(--color-text-primary)]',
        )}
        style={{ wordBreak: 'break-word' }}
      >
        {value ? (
          parts.map((part, i) =>
            HASHTAG_SPLIT.test(part) ? (
              <span key={i} className="text-[#2845D6]">{part}</span>
            ) : (
              <span key={i}>{part}</span>
            ),
          )
        ) : (
          <span className="text-[var(--color-text-muted)]">{placeholder}</span>
        )}
        {/* Trailing newline to keep heights in sync */}
        {'\n'}
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        maxLength={2000}
        rows={4}
        className="relative w-full resize-none appearance-none border-0 bg-transparent text-transparent shadow-none caret-[var(--color-text-primary)] text-xs leading-5 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
        style={{
          minHeight: '96px',
          border: '0',
          outline: 'none',
          boxShadow: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          appearance: 'none',
          background: 'transparent',
          lineHeight: '1.25rem',
        }}
        aria-label="Announcement caption"
      />
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  Component                                                                   //
// --------------------------------------------------------------------------- //
export function InlinePostCreator({
  userAvatar,
  userName,
  editingAnnouncement,
  onPost,
  onCancelEdit,
}: InlinePostCreatorProps) {
  const [expanded, setExpanded] = useState(false);
  const [caption, setCaption] = useState('');
  const [blogOpen, setBlogOpen] = useState(false);
  const [mediaActive, setMediaActive] = useState(false);
  const [blogContent, setBlogContent] = useState('');
  const [mediaPreviews, setMediaPreviews] = useState<MediaPreview[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMode, setSaveMode] = useState<'draft' | 'publish' | null>(null);

  const mediaInputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Populate when editing an existing announcement
  useEffect(() => {
    if (editingAnnouncement) {
      setCaption(editingAnnouncement.caption ?? '');
      setExpanded(true);
      setMediaPreviews([]);
    }
  }, [editingAnnouncement]);

  // Collapse on outside click (only if no content and not editing)
  useEffect(() => {
    if (!expanded) return;
    function onOutside(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        if (!caption.trim() && !editingAnnouncement) {
          setExpanded(false);
        }
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [expanded, caption, editingAnnouncement]);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const errors: string[] = [];
    const valid: MediaPreview[] = [];
    for (const f of Array.from(files)) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_EXT.has(ext)) {
        errors.push(`"${f.name}" — unsupported format (.${ext})`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        errors.push(`"${f.name}" — exceeds 50 MB (${(f.size / 1024 / 1024).toFixed(1)} MB)`);
        continue;
      }
      valid.push({
        key: `${f.name}-${f.size}-${Date.now()}`,
        file: f,
        url: URL.createObjectURL(f),
        media_type: VIDEO_EXT.has(ext) ? 'video' : 'image',
        order: mediaPreviews.length + valid.length,
      });
    }
    setFileErrors(errors);
    if (valid.length) setMediaPreviews((prev) => [...prev, ...valid]);
  }

  function moveMedia(idx: number, dir: 'up' | 'down') {
    setMediaPreviews((prev) => {
      const next = [...prev];
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((m, i) => ({ ...m, order: i }));
    });
  }

  function handleCollapse() {
    if (editingAnnouncement) onCancelEdit?.();
    setExpanded(false);
    setCaption('');
    setBlogOpen(false);
    setMediaActive(false);
    setBlogContent('');
    setMediaPreviews([]);
    setFileErrors([]);
  }

  async function handleSubmit(publish: boolean) {
    if (!caption.trim()) return;
    setSaving(true);
    setSaveMode(publish ? 'publish' : 'draft');
    try {
      const fd = new FormData();
      fd.append('caption', caption.trim());
      fd.append('is_published', String(publish));
      mediaPreviews.forEach((m) => fd.append('media', m.file));
      await onPost(fd);
      handleCollapse();
    } finally {
      setSaving(false);
      setSaveMode(null);
    }
  }

  return (
    <div
      ref={cardRef}
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] overflow-hidden"
    >
      <div className="p-4">
        {/* Hidden file input — always mounted */}
        <input
          ref={mediaInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/ogg"
          multiple
          className="sr-only"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        />

        {!expanded ? (
            /* ── Collapsed ── */
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <UserAvatar src={userAvatar} alt={userName} className="h-10 w-10 flex-shrink-0" />
                {/* Trigger */}
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="flex-1 h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 text-left text-xs text-[var(--color-text-muted)] hover:border-[#2845D6]/40 hover:bg-[var(--color-bg-subtle)] transition-colors cursor-text"
                >
                  What do you want to talk about?
                </button>
              </div>

              {/* Action row */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setMediaActive(true);
                    setExpanded(true);
                    setTimeout(() => mediaInputRef.current?.click(), 80);
                  }}
                  className="flex items-center gap-1.5 rounded-lg pr-3 py-1.5 text-[12px] font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                >
                  <ImageIcon
                    className={cn(
                      'h-4 w-4 transition-colors',
                      mediaActive ? 'text-[#2845D6]' : 'text-[var(--color-text-muted)]',
                    )}
                  />
                  Media
                </button>
                <button
                  type="button"
                  onClick={() => { setExpanded(true); setBlogOpen(true); }}
                  className="flex items-center gap-1.5 rounded-lg pr-3 py-1.5 text-[12px] font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                >
                  <FileText
                    className={cn(
                      'h-4 w-4 transition-colors',
                      blogOpen ? 'text-[#2845D6]' : 'text-[var(--color-text-muted)]',
                    )}
                  />
                  Blog
                </button>
              </div>
            </div>
          ) : (
            /* ── Expanded ── */
            <div className="space-y-3">
              {/* Creator header */}
              <div className="flex items-center gap-3">
                <UserAvatar src={userAvatar} alt={userName} className="h-10 w-10 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">{userName}</p>
                  {editingAnnouncement && (
                    <p className="text-xs text-[var(--color-text-muted)]">Editing announcement</p>
                  )}
                </div>
              </div>

              {/* Caption with inline hashtag highlight */}
              <HighlightTextarea
                value={caption}
                onChange={setCaption}
                placeholder="What do you want to talk about? Use #hashtags to highlight keywords."
              />

              {/* Blog section */}
              {blogOpen && (
                <div>
                  <textarea
                    value={blogContent}
                    onChange={(e) => setBlogContent(e.target.value)}
                    placeholder="Write longer-form blog content here…"
                    rows={6}
                    className="w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2 text-xs leading-5 text-[var(--color-text-primary)] outline-none ring-0 transition-all focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                    style={{
                      outline: 'none',
                      boxShadow: 'none',
                      lineHeight: '1.25rem',
                    }}
                  />
                </div>
              )}

              {/* Media previews */}
              {mediaPreviews.length > 0 && (
                <div className="space-y-1.5">
                  {mediaPreviews.map((m, idx) => (
                    <div
                      key={m.key}
                      className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-2"
                    >
                      <div className="h-12 w-16 rounded-lg overflow-hidden bg-[var(--color-border)] flex-shrink-0">
                        {m.media_type === 'image' ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center">
                            <FileText className="h-5 w-5 text-[var(--color-text-muted)]" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{m.file.name}</p>
                        <p className="text-[11px] text-[var(--color-text-muted)] capitalize">{m.media_type}</p>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <button type="button" onClick={() => moveMedia(idx, 'up')} disabled={idx === 0} className="rounded p-0.5 hover:bg-[var(--color-border)] disabled:opacity-30" aria-label="Move up">
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button type="button" onClick={() => moveMedia(idx, 'down')} disabled={idx === mediaPreviews.length - 1} className="rounded p-0.5 hover:bg-[var(--color-border)] disabled:opacity-30" aria-label="Move down">
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMediaPreviews((prev) => {
                          const next = prev.filter((_, j) => j !== idx);
                          if (next.length === 0) setMediaActive(false);
                          return next;
                        })}
                        className="rounded-full p-1 text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        aria-label="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* File errors */}
              {fileErrors.length > 0 && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
                  {fileErrors.map((err, i) => (
                    <p key={i} className="text-xs text-red-600 dark:text-red-400">{err}</p>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMediaActive(true);
                      mediaInputRef.current?.click();
                    }}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                  >
                    <ImageIcon
                      className={cn(
                        'h-3 w-3 transition-colors',
                        mediaActive ? 'text-[#2845D6]' : 'text-[var(--color-text-muted)]',
                      )}
                    />
                    Media
                  </button>
                  <button
                    type="button"
                    onClick={() => setBlogOpen((v) => !v)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      blogOpen
                        ? 'bg-[#2845D6]/10 text-[#2845D6]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]',
                    )}
                  >
                    <FileText
                      className={cn(
                        'h-4 w-4 transition-colors',
                        blogOpen ? 'text-[#2845D6]' : 'text-[var(--color-text-muted)]',
                      )}
                    />
                    Blog
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCollapse}
                    disabled={saving}
                    className="rounded-xl border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubmit(false)}
                    disabled={saving || !caption.trim()}
                    className="rounded-xl border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] disabled:opacity-50 transition-colors"
                  >
                    {saving && saveMode === 'draft' ? (
                      <TextShimmer className="text-[12px]">Saving…</TextShimmer>
                    ) : (
                      'Save Draft'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubmit(true)}
                    disabled={saving || !caption.trim()}
                    className="rounded-xl bg-[#2845D6] px-4 py-1.5 text-[12px] font-medium text-white hover:bg-[#0D1A63] disabled:opacity-50 transition-colors"
                  >
                    {saving && saveMode === 'publish' ? (
                      <TextShimmer className="text-[12px]">Posting…</TextShimmer>
                    ) : (
                      'Post'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

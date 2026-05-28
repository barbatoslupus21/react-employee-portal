'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { HashtagText } from './HashtagText';
import { UserAvatar } from './UserAvatar';
import { useAnnouncementComments } from '@/app/dashboard/announcements/_hooks/useAnnouncements';
import { type Comment } from './CommentItem';

export type MediaItem = {
  id: number;
  file: string;
  media_type: 'image' | 'video';
  order: number;
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function LightboxCommentRow({ comment }: { comment: Comment }) {
  const [showReplies, setShowReplies] = useState(false);
  const hasReplies = comment.replies && comment.replies.length > 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <UserAvatar
          src={comment.user_avatar}
          alt={comment.user_name}
          className="mt-0.5 h-5 w-5 flex-shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold text-white/90">{comment.user_name}</span>
            <span className="text-[10px] text-white/35">{formatRelativeTime(comment.created_at)}</span>
          </div>
          <p className="break-words text-xs leading-relaxed text-white/65">{comment.content}</p>
          {hasReplies && (
            <button
              type="button"
              onClick={() => setShowReplies((v) => !v)}
              className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-white/40 transition-colors hover:text-white/65"
            >
              <ChevronDown
                className={`h-3 w-3 transition-transform duration-200 ${showReplies ? 'rotate-180' : ''}`}
              />
              {showReplies
                ? 'Hide replies'
                : `View ${comment.replies.length} ${comment.replies.length === 1 ? 'reply' : 'replies'}`}
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {hasReplies && showReplies && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="ml-7 overflow-hidden"
          >
            <div className="space-y-2 pt-1">
              {comment.replies.map((reply) => (
                <div key={reply.id} className="flex gap-2">
                  <UserAvatar
                    src={reply.user_avatar}
                    alt={reply.user_name}
                    className="mt-0.5 h-5 w-5 flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold text-white/90">{reply.user_name}</span>
                      <span className="text-[10px] text-white/35">{formatRelativeTime(reply.created_at)}</span>
                    </div>
                    <p className="break-words text-xs leading-relaxed text-white/65">{reply.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export type LightboxPostContext = {
  announcementId: number;
  creatorName: string;
  creatorAvatar: string | null;
  caption: string;
};

type MediaLightboxProps = {
  media: MediaItem[];
  initialIndex?: number;
  postContext: LightboxPostContext;
  onClose: () => void;
};

export function MediaLightbox({
  media,
  initialIndex = 0,
  postContext,
  onClose,
}: MediaLightboxProps) {
  const [current, setCurrent] = useState(initialIndex);
  const [visible, setVisible] = useState(true);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const touchStartX = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);

  const { data: comments = [], isLoading: isCommentsLoading } = useAnnouncementComments(
    postContext.announcementId,
  );

  // Keep close ref fresh without re-triggering effects
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(() => onCloseRef.current(), 200);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
      else if (e.key === 'ArrowLeft') setCurrent((c) => Math.max(0, c - 1));
      else if (e.key === 'ArrowRight') setCurrent((c) => Math.min(media.length - 1, c + 1));
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleClose, media.length]);

  // Pause all videos then play the active one
  useEffect(() => {
    videoRefs.current.forEach((vid, i) => {
      if (!vid) return;
      if (i === current) {
        vid.play().catch(() => {});
      } else {
        vid.pause();
        vid.currentTime = 0;
      }
    });
  }, [current]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      setCurrent((c) => (diff > 0 ? Math.min(media.length - 1, c + 1) : Math.max(0, c - 1)));
    }
    touchStartX.current = null;
  }

  const item = media[current];
  if (!item) return null;

  const content = (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex bg-black/92"
          onClick={handleClose}
        >
          {/* ── Main area ── */}
          <div
            className="relative flex flex-1 flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Top bar */}
            <div className="flex flex-shrink-0 items-center justify-between px-5 py-3">
              <span className="text-xs font-normal text-white/60">
                {current + 1} / {media.length}
              </span>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Media viewer */}
            <div className="relative flex flex-1 items-center justify-center overflow-hidden">
              {/* Prev arrow */}
              {current > 0 && (
                <button
                  type="button"
                  onClick={() => setCurrent((c) => c - 1)}
                  aria-label="Previous"
                  className="absolute left-3 z-10 flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/25"
                >
                  <ChevronLeft size={22} />
                </button>
              )}

              <AnimatePresence mode="wait">
                <motion.div
                  key={current}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.18 }}
                  className="flex max-h-full max-w-full items-center justify-center p-6"
                >
                  {item.media_type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.file}
                      alt={`Media ${current + 1}`}
                      className="max-h-[calc(100vh-13rem)] max-w-full rounded-md object-contain shadow-2xl"
                    />
                  ) : (
                    <video
                      ref={(el) => {
                        videoRefs.current[current] = el;
                      }}
                      src={item.file}
                      controls
                      autoPlay
                      className="max-h-[calc(100vh-13rem)] max-w-full rounded-xl shadow-2xl"
                    />
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Next arrow */}
              {current < media.length - 1 && (
                <button
                  type="button"
                  onClick={() => setCurrent((c) => c + 1)}
                  aria-label="Next"
                  className="absolute right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/25"
                >
                  <ChevronRight size={22} />
                </button>
              )}
            </div>

            {/* Thumbnail strip */}
            {media.length > 1 && (
              <div className="flex flex-shrink-0 items-center justify-center gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {media.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setCurrent(i)}
                    aria-label={`Go to media ${i + 1}`}
                    className={`h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border-2 transition-all ${
                      i === current
                        ? 'scale-105 border-[#2845D6] opacity-100'
                        : 'border-transparent opacity-50 hover:opacity-80'
                    }`}
                  >
                    {m.media_type === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.file} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <video src={m.file} className="h-full w-full object-cover" muted />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Right sidebar — post context + comments ── */}
          <div
            className="hidden w-100 flex-shrink-0 flex-col border-l border-white/10 bg-black/50 p-5 lg:flex"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Creator */}
            <div className="mb-3 flex items-center gap-3">
              <UserAvatar
                src={postContext.creatorAvatar}
                alt={postContext.creatorName}
                className="h-9 w-9"
              />
              <p className="text-xs font-semibold text-white">{postContext.creatorName}</p>
            </div>

            {/* Caption */}
            {postContext.caption && (
              <p className="mb-4 whitespace-pre-wrap text-xs leading-relaxed text-white/75">
                <HashtagText text={postContext.caption} />
              </p>
            )}

            {/* Divider */}
            <div className="mb-3 h-px bg-white/10" />

            {/* Comments */}
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
              Comments
            </p>
            <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {isCommentsLoading ? (
                <p className="text-xs text-white/40">Loading…</p>
              ) : comments.length === 0 ? (
                <p className="text-xs text-white/40">No comments yet.</p>
              ) : (
                <div className="space-y-3">
                  {comments.map((comment) => (
                    <LightboxCommentRow key={comment.id} comment={comment} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

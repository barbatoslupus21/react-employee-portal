'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, MessageCircle, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { MediaCarousel } from './MediaCarousel';
import { HashtagText } from './HashtagText';
import { ReactionPicker } from './ReactionPicker';
import { CommentSection } from './CommentSection';
import { ReactionsViewModal } from './ReactionsViewModal';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { cn } from '@/lib/utils';
import {
  type AnnouncementListItem,
  type Comment,
  useToggleReaction,
  usePostComment,
  useDeleteComment,
  useAnnouncementComments,
} from '@/app/dashboard/announcements/_hooks/useAnnouncements';

type PostCardCurrentUser = {
  id: number;
  admin: boolean;
  hr: boolean;
  accounting: boolean;
  avatar: string | null;
  name: string;
};

type PostCardProps = {
  announcement: AnnouncementListItem;
  currentUser: PostCardCurrentUser;
  isAdminManagePage?: boolean;
  onEdit?: (announcement: AnnouncementListItem) => void;
  onDelete?: (id: number) => void;
  isDeleting?: boolean;
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

export function PostCard({
  announcement,
  currentUser,
  isAdminManagePage = false,
  onEdit,
  onDelete,
  isDeleting = false,
}: PostCardProps) {
  const isPrivileged = currentUser.admin || currentUser.hr || currentUser.accounting;

  // Reaction state (optimistic)
  const [localReactionCount, setLocalReactionCount] = useState(announcement.reaction_count);
  const [localUserReaction, setLocalUserReaction] = useState(announcement.user_reaction);
  const [localTopReactors, setLocalTopReactors] = useState(announcement.top_reactors);

  useEffect(() => {
    setLocalReactionCount(announcement.reaction_count);
    setLocalUserReaction(announcement.user_reaction);
    setLocalTopReactors(announcement.top_reactors);
  }, [announcement.reaction_count, announcement.user_reaction, announcement.top_reactors]);

  const toggleReaction = useToggleReaction(announcement.id);

  // Comment state (optimistic)
  const [commentCount, setCommentCount] = useState(announcement.comment_count);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const { data: comments = [] } = useAnnouncementComments(commentsOpen ? announcement.id : null);
  const postComment = usePostComment(announcement.id);
  const deleteComment = useDeleteComment(announcement.id);

  // Reaction picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionButtonRef = useRef<HTMLButtonElement>(null);

  // "View Reactions" modal
  const [reactionsModalOpen, setReactionsModalOpen] = useState(false);

  // Admin delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Admin dropdown
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);

  function handleReactClick(emoji: string = '❤️') {
    setPickerOpen(false);
    // Optimistic
    const wasReacted = localUserReaction === emoji;
    setLocalUserReaction(wasReacted ? null : emoji);
    setLocalReactionCount((c) => (wasReacted ? Math.max(0, c - 1) : c + 1));

    toggleReaction.mutate(emoji, {
      onSuccess: (data) => {
        setLocalReactionCount(data.reaction_count);
        setLocalUserReaction(data.emoji);
        setLocalTopReactors(data.top_reactors);
      },
      onError: () => {
        // Revert
        setLocalUserReaction(announcement.user_reaction);
        setLocalReactionCount(announcement.reaction_count);
      },
    });
  }

  function onLongPressStart() {
    longPressTimer.current = setTimeout(() => setPickerOpen(true), 500);
  }

  function onLongPressEnd() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }

  async function handlePostComment(content: string, parentId?: number) {
    // Optimistic count
    setCommentCount((c) => c + 1);
    try {
      await postComment.mutateAsync({ content, parent_id: parentId });
    } catch {
      setCommentCount((c) => Math.max(0, c - 1));
    }
  }

  async function handleDeleteComment(commentId: number) {
    await deleteComment.mutateAsync(commentId);
    setCommentCount((c) => Math.max(0, c - 1));
  }

  const avatarInitials = announcement.created_by_name
    ?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?';

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] overflow-hidden">
      {/* Draft badge */}
      {!announcement.is_published && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700 px-4 py-1.5 flex items-center gap-2">
          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Draft — not visible to regular users</span>
        </div>
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {announcement.created_by_avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={announcement.created_by_avatar}
                alt={announcement.created_by_name}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-[#2845D6]/20 flex items-center justify-center text-sm font-semibold text-[#2845D6]">
                {avatarInitials}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                {announcement.created_by_name}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {formatRelativeTime(announcement.created_at)}
                {announcement.title && (
                  <span className="ml-1 font-medium text-[var(--color-text-secondary)]">
                    · {announcement.title}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Admin actions */}
          {isAdminManagePage && isPrivileged && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAdminMenuOpen((v) => !v)}
                className="rounded-full p-1.5 hover:bg-[var(--color-bg-subtle)] transition-colors"
                aria-label="Options"
              >
                <MoreHorizontal className="h-4 w-4 text-[var(--color-text-muted)]" />
              </button>
              <AnimatePresence>
                {adminMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 top-full mt-1 w-36 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-lg z-10 overflow-hidden"
                    onMouseLeave={() => setAdminMenuOpen(false)}
                  >
                    <button
                      type="button"
                      onClick={() => { setAdminMenuOpen(false); onEdit?.(announcement); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    {!showDeleteConfirm ? (
                      <button
                        type="button"
                        onClick={() => { setAdminMenuOpen(false); setShowDeleteConfirm(true); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    ) : null}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Inline delete confirmation */}
              <AnimatePresence>
                {showDeleteConfirm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-right">
                      <p className="text-xs text-red-700 dark:text-red-300 mb-2">Delete this announcement?</p>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowDeleteConfirm(false)}
                          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete?.(announcement.id)}
                          disabled={isDeleting}
                          className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50 transition-colors"
                        >
                          {isDeleting ? (
                            <TextShimmer className="text-xs">Deleting…</TextShimmer>
                          ) : (
                            'Confirm Delete'
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Media */}
        {announcement.media.length > 0 && (
          <div className="mb-3 -mx-4">
            <MediaCarousel media={announcement.media} />
          </div>
        )}

        {/* Caption */}
        {announcement.caption && (
          <p className="text-sm text-[var(--color-text-primary)] leading-relaxed mb-3">
            <HashtagText text={announcement.caption} />
          </p>
        )}

        {/* Reaction summary */}
        {localReactionCount > 0 && (
          <div className="flex items-center gap-2 mb-2">
            {/* Reactor avatars */}
            <div className="flex -space-x-1.5">
              {localTopReactors.slice(0, 5).map((r, i) =>
                r.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={r.avatar}
                    alt=""
                    className="h-5 w-5 rounded-full border-2 border-[var(--color-bg-elevated)] object-cover"
                  />
                ) : (
                  <div
                    key={i}
                    className="h-5 w-5 rounded-full border-2 border-[var(--color-bg-elevated)] bg-[#2845D6]/20 flex items-center justify-center text-[8px] font-semibold text-[#2845D6]"
                  />
                ),
              )}
            </div>
            <button
              type="button"
              onClick={() => setReactionsModalOpen(true)}
              className="text-xs text-[var(--color-text-secondary)] hover:text-[#2845D6] transition-colors"
            >
              {localReactionCount} {localReactionCount === 1 ? 'reaction' : 'reactions'}
            </button>
          </div>
        )}

        {/* Comment count row */}
        {commentCount > 0 && (
          <button
            type="button"
            onClick={() => setCommentsOpen((v) => !v)}
            className="text-xs text-[var(--color-text-secondary)] hover:text-[#2845D6] transition-colors mb-2"
          >
            {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
          </button>
        )}

        {/* Divider */}
        <div className="border-t border-[var(--color-border)] my-2" />

        {/* Action buttons */}
        <div className="flex gap-1">
          {/* React button */}
          <div className="relative flex-1">
            <button
              ref={reactionButtonRef}
              type="button"
              onMouseEnter={() => setPickerOpen(true)}
              onMouseLeave={() => setPickerOpen(false)}
              onTouchStart={onLongPressStart}
              onTouchEnd={onLongPressEnd}
              onClick={() => handleReactClick(localUserReaction ?? '❤️')}
              className={cn(
                'flex w-full items-center justify-center gap-1.5 rounded-xl py-1.5 text-sm font-medium transition-colors',
                localUserReaction
                  ? 'text-[#2845D6] bg-[#2845D6]/10 hover:bg-[#2845D6]/15'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]',
              )}
            >
              <span className="text-base">{localUserReaction ?? '❤️'}</span>
              <span>{localUserReaction ? 'Reacted' : 'React'}</span>
            </button>
            <div onMouseEnter={() => setPickerOpen(true)} onMouseLeave={() => setPickerOpen(false)}>
              <ReactionPicker open={pickerOpen} onSelect={handleReactClick} />
            </div>
          </div>

          {/* Comment button */}
          <button
            type="button"
            onClick={() => setCommentsOpen((v) => !v)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-1.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            Comment
          </button>
        </div>

        {/* Comment section */}
        <AnimatePresence>
          {commentsOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-3 overflow-hidden"
            >
              <CommentSection
                announcementId={announcement.id}
                currentUserId={currentUser.id}
                currentUserAvatar={currentUser.avatar}
                currentUserName={currentUser.name}
                isAdminHrAccounting={isPrivileged}
                comments={comments as Comment[]}
                onPost={handlePostComment}
                onDelete={handleDeleteComment}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Reactions modal */}
      <ReactionsViewModal
        open={reactionsModalOpen}
        onOpenChange={setReactionsModalOpen}
        announcementId={announcement.id}
      />
    </div>
  );
}

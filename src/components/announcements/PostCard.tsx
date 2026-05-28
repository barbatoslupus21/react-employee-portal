'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, Pencil, ThumbsUp, Trash2 } from 'lucide-react';
import { MediaCarousel } from './MediaCarousel';
import { HashtagText } from './HashtagText';
import { ReactionPicker } from './ReactionPicker';
import { CommentSection } from './CommentSection';
import { ReactionsViewModal } from './ReactionsViewModal';
import { UserAvatar } from './UserAvatar';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
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
  const isCreator = currentUser.id === announcement.created_by_id;

  // Reaction state (optimistic)
  const [localReactionCount, setLocalReactionCount] = useState(announcement.reaction_count);
  const [localUserReaction, setLocalUserReaction] = useState(announcement.user_reaction);
  const [localTopReactors, setLocalTopReactors] = useState(announcement.top_reactors);
  const [localReactionEmojis, setLocalReactionEmojis] = useState(announcement.reaction_emojis);

  useEffect(() => {
    setLocalReactionCount(announcement.reaction_count);
    setLocalUserReaction(announcement.user_reaction);
    setLocalTopReactors(announcement.top_reactors);
    setLocalReactionEmojis(announcement.reaction_emojis);
  }, [announcement.reaction_count, announcement.user_reaction, announcement.top_reactors, announcement.reaction_emojis]);

  const toggleReaction = useToggleReaction(announcement.id);

  // Comment state (optimistic)
  const [commentCount, setCommentCount] = useState(announcement.comment_count);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const { data: comments = [], isLoading: isCommentsLoading } = useAnnouncementComments(commentsOpen ? announcement.id : null);
  const postComment = usePostComment(announcement.id);
  const deleteComment = useDeleteComment(announcement.id);
  const cardRef = useRef<HTMLDivElement>(null);
  const commentsRegionRef = useRef<HTMLDivElement>(null);
  const pendingCommentScrollRef = useRef(false);

  // Reaction picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionButtonRef = useRef<HTMLButtonElement>(null);

  // "View Reactions" modal
  const [reactionsModalOpen, setReactionsModalOpen] = useState(false);

  // Admin delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Card hover state for edit/delete controls
  const [isHovered, setIsHovered] = useState(false);

  // Admin dropdown — removed; controls now appear on hover

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
        setLocalReactionEmojis(data.reaction_emojis ?? Array.from(new Set(data.top_reactors.map((r) => r.emoji))).slice(0, 3));
      },
      onError: () => {
        // Revert
        setLocalUserReaction(announcement.user_reaction);
        setLocalReactionCount(announcement.reaction_count);
        setLocalTopReactors(announcement.top_reactors);
        setLocalReactionEmojis(announcement.reaction_emojis);
      },
    });
  }

  function onLongPressStart() {
    longPressTimer.current = setTimeout(() => setPickerOpen(true), 500);
  }

  function onLongPressEnd() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }

  function handleToggleComments() {
    setCommentsOpen((isOpen) => {
      const willOpen = !isOpen;
      if (willOpen) {
        pendingCommentScrollRef.current = true;
      } else {
        window.setTimeout(() => {
          cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
      }
      return willOpen;
    });
  }

  useEffect(() => {
    if (!commentsOpen || !pendingCommentScrollRef.current || isCommentsLoading) return;

    const timer = window.setTimeout(() => {
      const container = commentsRegionRef.current;
      if (!container) return;

      const firstComment = container.querySelector('[data-comment-item="true"]') as HTMLElement | null;
      const commentInput = container.querySelector('[data-comment-input="true"]') as HTMLElement | null;

      (firstComment ?? commentInput ?? container).scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      pendingCommentScrollRef.current = false;
    }, 150);

    return () => window.clearTimeout(timer);
  }, [commentsOpen, comments.length, isCommentsLoading]);

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

  const topNames = localTopReactors.map((r) => r.name).filter(Boolean);
  const shownNames = topNames.slice(0, 3);
  const othersCount = Math.max(0, localReactionCount - shownNames.length);
  const namesText = shownNames.length > 0
    ? `${shownNames.join(', ')}${othersCount > 0 ? ` and ${othersCount} others` : ''}`
    : 'Someone reacted';

  return (
    <div
      ref={cardRef}
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Draft badge */}
      {!announcement.is_published && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700 px-4 py-1.5 flex items-center gap-2">
          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Draft — not visible to regular users</span>
        </div>
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <UserAvatar
              src={announcement.created_by_avatar}
              alt={announcement.created_by_name}
              className="h-8 w-8"
            />
            <div>
              <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                {announcement.created_by_name}
              </p>
              <p className="text-[10px] text-[var(--color-text-muted)]">
                {formatRelativeTime(announcement.created_at)}
                {announcement.title && (
                  <span className="ml-1 font-normal text-[var(--color-text-secondary)]">
                    · {announcement.title}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Creator actions — visible on hover, only for the post creator */}
          {isCreator && (
            <AnimatePresence>
              {isHovered && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.12 }}
                  className="flex items-center gap-1"
                >
                  <button
                    type="button"
                    onClick={() => onEdit?.(announcement)}
                    className="rounded-full p-1.5 text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors"
                    aria-label="Edit"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="rounded-full p-1.5 text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Inline delete confirmation (shown when creator clicks delete) */}
        <AnimatePresence>
          {showDeleteConfirm && (
            <ConfirmationModal
              title="Delete announcement?"
              message="This action cannot be undone."
              confirmLabel="Delete"
              onConfirm={() => { onDelete?.(announcement.id); setShowDeleteConfirm(false); }}
              onCancel={() => setShowDeleteConfirm(false)}
              confirming={isDeleting}
              // icon={<Trash2 size={20} className="text-red-600" />}
              confirmVariant="danger"
            />
          )}
        </AnimatePresence>

        {/* Caption */}
        {announcement.caption && (
          <p className="text-xs text-[var(--color-text-primary)] leading-relaxed mb-3 whitespace-pre-wrap">
            <HashtagText text={announcement.caption} />
          </p>
        )}

        {/* Media */}
        {announcement.media.length > 0 && (
          <div className="mb-3 -mx-4">
            <MediaCarousel
              media={announcement.media}
              postContext={{
                announcementId: announcement.id,
                creatorName: announcement.created_by_name,
                creatorAvatar: announcement.created_by_avatar,
                caption: announcement.caption,
              }}
            />
          </div>
        )}

        {/* Summary row (reactions + comments) */}
        {(localReactionCount > 0 || commentCount > 0) && (
          <div className="mb-2 flex items-center justify-between text-[11px] text-[var(--color-text-secondary)]">
            {localReactionCount > 0 ? (
              <button
                type="button"
                onClick={() => setReactionsModalOpen(true)}
                className="inline-flex min-w-0 items-center hover:text-[#2845D6] transition-colors"
              >
                <span className="mr-2 inline-flex items-center">
                  {localReactionEmojis.slice(0, 3).map((emoji, idx) => (
                    <span
                      key={`${emoji}-${idx}`}
                      className={cn(
                        'inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-bg-elevated)] bg-[var(--color-bg-elevated)] text-lg leading-none',
                        idx > 0 && '-ml-1.5',
                      )}
                    >
                      {emoji}
                    </span>
                  ))}
                </span>
                <span className="text-[12px] truncate text-left leading-tight text-[var(--color-text-muted)]">{namesText}</span>
              </button>
            ) : (
              <span />
            )}

            {commentCount > 0 && (
              <button
                type="button"
                onClick={handleToggleComments}
                className="hover:text-[#2845D6] transition-colors text-[var(--color-text-muted)] text-[12px]"
              >
                {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
              </button>
            )}
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-[var(--color-border)] my-1.5" />

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
                'flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors',
                localUserReaction
                  ? 'text-[#2845D6] hover:bg-[var(--color-bg-subtle)]'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]',
              )}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              <span>{localUserReaction ? 'Liked' : 'Like'}</span>
            </button>
            <div onMouseEnter={() => setPickerOpen(true)} onMouseLeave={() => setPickerOpen(false)}>
              <ReactionPicker open={pickerOpen} onSelect={handleReactClick} />
            </div>
          </div>

          {/* Comment button */}
          <button
            type="button"
            onClick={handleToggleComments}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] transition-colors"
          >
            <MessageCircle className="h-3.5 w-3.5" />
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
              ref={commentsRegionRef}
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

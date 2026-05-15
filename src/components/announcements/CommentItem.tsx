'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Reply, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { HashtagText } from './HashtagText';
import { TextShimmer } from '@/components/ui/text-shimmer';

type CommentUser = {
  id: number;
  name: string;
  avatar: string | null;
};

export type Comment = {
  id: number;
  user: number;
  user_name: string;
  user_avatar: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  parent: number | null;
  replies: Comment[];
};

type CommentItemProps = {
  comment: Comment;
  announcementId: number;
  currentUserId: number;
  isAdminHrAccounting: boolean;
  onDelete: (commentId: number) => Promise<void>;
  onReply: (parentId: number, content: string) => Promise<void>;
  depth?: number;
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

export function CommentItem({
  comment,
  announcementId,
  currentUserId,
  isAdminHrAccounting,
  onDelete,
  onReply,
  depth = 0,
}: CommentItemProps) {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showReplies, setShowReplies] = useState(true);

  const canDelete = comment.user === currentUserId || isAdminHrAccounting;

  async function handleReplySubmit() {
    const text = replyText.trim();
    if (!text) return;
    setReplySubmitting(true);
    try {
      await onReply(comment.id, text);
      setReplyText('');
      setShowReplyInput(false);
    } finally {
      setReplySubmitting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(comment.id);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  const avatar = comment.user_avatar;
  const initials = comment.user_name
    ? comment.user_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <div className={depth > 0 ? 'ml-9 mt-2' : 'mt-3'}>
      <div className="flex gap-2">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt={comment.user_name}
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            <div className="h-7 w-7 rounded-full bg-[#2845D6]/20 flex items-center justify-center text-[10px] font-semibold text-[#2845D6]">
              {initials}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Comment bubble */}
          <div className="inline-block rounded-2xl bg-[var(--color-bg-subtle)] px-3 py-2 max-w-full">
            <p className="text-xs font-semibold text-[var(--color-text-primary)] mb-0.5">
              {comment.user_name}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)] break-words">
              <HashtagText text={comment.content} />
            </p>
          </div>

          {/* Action row */}
          <div className="flex items-center gap-3 mt-1 px-1">
            <span className="text-[11px] text-[var(--color-text-muted)]">
              {formatRelativeTime(comment.created_at)}
            </span>
            {depth === 0 && (
              <button
                type="button"
                onClick={() => setShowReplyInput((v) => !v)}
                className="text-[11px] font-semibold text-[var(--color-text-secondary)] hover:text-[#2845D6] transition-colors"
              >
                Reply
              </button>
            )}
            {canDelete && !showDeleteConfirm && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
              >
                Delete
              </button>
            )}
          </div>

          {/* Inline delete confirmation (no modal) */}
          <AnimatePresence>
            {showDeleteConfirm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 mt-1 px-1 overflow-hidden"
              >
                <span className="text-xs text-[var(--color-text-secondary)]">Delete comment?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs font-semibold text-red-500 hover:text-red-600 disabled:opacity-50 transition-colors"
                >
                  {deleting ? <TextShimmer className="text-xs">Deleting…</TextShimmer> : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                >
                  Cancel
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reply input */}
          <AnimatePresence>
            {showReplyInput && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 overflow-hidden"
              >
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleReplySubmit();
                      }
                    }}
                    placeholder="Write a reply…"
                    maxLength={1000}
                    className="flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#2845D6] transition-all"
                  />
                  <button
                    type="button"
                    onClick={handleReplySubmit}
                    disabled={replySubmitting || !replyText.trim()}
                    className="text-xs font-semibold text-[#2845D6] hover:text-[#0D1A63] disabled:opacity-40 transition-colors"
                  >
                    {replySubmitting ? <TextShimmer className="text-xs">Sending…</TextShimmer> : 'Send'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Nested replies */}
      {depth === 0 && comment.replies.length > 0 && (
        <div className="ml-9 mt-1">
          <button
            type="button"
            onClick={() => setShowReplies((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-text-secondary)] hover:text-[#2845D6] transition-colors mb-1"
          >
            {showReplies ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
          </button>
          <AnimatePresence>
            {showReplies && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {comment.replies.map((reply) => (
                  <CommentItem
                    key={reply.id}
                    comment={reply}
                    announcementId={announcementId}
                    currentUserId={currentUserId}
                    isAdminHrAccounting={isAdminHrAccounting}
                    onDelete={onDelete}
                    onReply={onReply}
                    depth={1}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

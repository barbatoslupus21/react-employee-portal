'use client';

import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { CommentItem, type Comment } from './CommentItem';
import { TextShimmer } from '@/components/ui/text-shimmer';

type CommentSectionProps = {
  announcementId: number;
  currentUserId: number;
  currentUserAvatar: string | null;
  currentUserName: string;
  isAdminHrAccounting: boolean;
  comments: Comment[];
  onPost: (content: string, parentId?: number) => Promise<void>;
  onDelete: (commentId: number) => Promise<void>;
};

export function CommentSection({
  announcementId,
  currentUserId,
  currentUserAvatar,
  currentUserName,
  isAdminHrAccounting,
  comments,
  onPost,
  onDelete,
}: CommentSectionProps) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const initials = currentUserName
    ? currentUserName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  async function handleSubmit() {
    const content = text.trim();
    if (!content) return;
    setSubmitting(true);
    try {
      await onPost(content);
      setText('');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReply(parentId: number, content: string) {
    await onPost(content, parentId);
  }

  return (
    <div className="border-t border-[var(--color-border)] pt-3">
      {/* Input */}
      <div className="flex items-center gap-2">
        {currentUserAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUserAvatar}
            alt={currentUserName}
            className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="h-8 w-8 flex-shrink-0 rounded-full bg-[#2845D6]/20 flex items-center justify-center text-xs font-semibold text-[#2845D6]">
            {initials}
          </div>
        )}
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Write a comment…"
            maxLength={1000}
            disabled={submitting}
            className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-bg-subtle)] py-2 pl-4 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-[#2845D6] disabled:opacity-60 transition-all"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !text.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-[#2845D6] hover:bg-[#2845D6]/10 disabled:opacity-40 transition-all"
            aria-label="Send comment"
          >
            {submitting ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#2845D6]/30 border-t-[#2845D6]" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Comments list */}
      <div className="mt-2">
        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            announcementId={announcementId}
            currentUserId={currentUserId}
            isAdminHrAccounting={isAdminHrAccounting}
            onDelete={onDelete}
            onReply={handleReply}
          />
        ))}
      </div>
    </div>
  );
}

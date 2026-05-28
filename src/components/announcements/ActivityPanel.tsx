'use client';

import { Activity, MessageCircle } from 'lucide-react';
import { useAnnouncementActivity, type ActivityItem } from '@/app/dashboard/announcements/_hooks/useAnnouncements';
import { UserAvatar } from './UserAvatar';

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

function ActivityRow({ item }: { item: ActivityItem }) {
  const preview =
    item.announcement_preview.length > 45
      ? item.announcement_preview.slice(0, 45) + '…'
      : item.announcement_preview;

  return (
    <div className="flex items-start gap-2.5 py-3 border-b border-[var(--color-border)] last:border-0">
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <UserAvatar src={item.user_avatar} alt={item.user_name} className="h-6 w-6" />
        {/* Activity type badge */}
        <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)] flex items-center justify-center">
          {item.type === 'comment' ? (
            <MessageCircle className="h-2 w-2 text-[#2845D6]" />
          ) : (
            <span className="text-[9px] leading-none">{item.emoji}</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-[var(--color-text-primary)] leading-snug">
          <span className="font-semibold">{item.user_name}</span>{' '}
          <span className="text-[var(--color-text-secondary)]">
            {item.type === 'comment' ? 'commented on' : 'reacted to'}
          </span>{' '}
          <span className="italic text-[var(--color-text-secondary)]">"{preview}"</span>
        </p>

        {item.type === 'comment' && item.content && (
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 truncate">
            {item.content}
          </p>
        )}

        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
          {formatRelativeTime(item.timestamp)}
        </p>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex gap-2.5 animate-pulse py-3 border-b border-[var(--color-border)] last:border-0">
      <div className="h-8 w-8 rounded-full bg-[var(--color-border)] flex-shrink-0" />
      <div className="flex-1 space-y-1.5 pt-0.5">
        <div className="h-2.5 w-3/4 rounded bg-[var(--color-border)]" />
        <div className="h-2 w-1/2 rounded bg-[var(--color-border)]" />
        <div className="h-2 w-16 rounded bg-[var(--color-border)]" />
      </div>
    </div>
  );
}

export function ActivityPanel() {
  const { data: activities = [], isLoading } = useAnnouncementActivity();

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)] flex-shrink-0">
        {/* <Activity className="h-4 w-4 text-[#2845D6]" /> */}
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Recent Activity</h2>
        {/* {activities.length > 0 && (
          <span className="ml-auto text-[11px] text-[var(--color-text-muted)]">
            {activities.length} update{activities.length !== 1 ? 's' : ''}
          </span>
        )} */}
      </div>

      {/* Scrollable list */}
      <div className="px-4 overflow-y-auto flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {isLoading ? (
          <>
            {[...Array(5)].map((_, i) => <Skeleton key={i} />)}
          </>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center h-full">
            <Activity className="h-8 w-8 text-[var(--color-text-muted)] mb-2 opacity-40" />
            <p className="text-xs text-[var(--color-text-muted)]">No activity yet</p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
              Reactions and comments will appear here.
            </p>
          </div>
        ) : (
          <>
            {activities.map((item, i) => (
              <ActivityRow
                key={`${item.type}-${item.announcement_id}-${item.timestamp}-${i}`}
                item={item}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

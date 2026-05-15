'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Megaphone } from 'lucide-react';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { PostCard } from '@/components/announcements/PostCard';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import {
  useAnnouncements,
  type AnnouncementListItem,
} from '../_hooks/useAnnouncements';

interface UserData {
  id: number;
  firstname: string | null;
  lastname: string | null;
  email: string;
  avatar: string | null;
  admin: boolean;
  hr: boolean;
  accounting: boolean;
}

function PostCardSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-[var(--color-border)]" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3 w-32 rounded bg-[var(--color-border)]" />
          <div className="h-2.5 w-20 rounded bg-[var(--color-border)]" />
        </div>
      </div>
      <div className="h-48 w-full rounded-xl bg-[var(--color-border)]" />
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-[var(--color-border)]" />
        <div className="h-3 w-3/4 rounded bg-[var(--color-border)]" />
      </div>
    </div>
  );
}

export default function AnnouncementsFeedPage() {
  const router = useRouter();

  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');
  const [user, setUser] = useState<UserData | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (authPhase === 'spinner') setAuthPhase('checking');
    }, 350);

    fetch('/api/auth/me/', { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        clearTimeout(timer);
        setUser(data);
        setAuthPhase('done');
      })
      .catch(() => {
        clearTimeout(timer);
        router.replace('/');
      });

    return () => clearTimeout(timer);
  }, []);

  const { data, isLoading } = useAnnouncements({ page, tab: 'published' });

  if (authPhase === 'spinner') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#2845D6]" />
      </div>
    );
  }

  if (authPhase === 'checking') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <TextShimmer className="text-sm" duration={1.4}>
          Checking permissions…
        </TextShimmer>
      </div>
    );
  }

  const announcements = data?.results ?? [];
  const totalPages = data?.total_pages ?? 1;

  const currentUser = user
    ? {
        id: user.id,
        admin: user.admin,
        hr: user.hr,
        accounting: user.accounting,
        avatar: user.avatar,
        name: [user.firstname, user.lastname].filter(Boolean).join(' ') || user.email,
      }
    : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center gap-2 mb-6">
        <Megaphone className="h-5 w-5 text-[#2845D6]" />
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Announcements</h1>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <PostCardSkeleton key={i} />)}
        </div>
      ) : announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Megaphone className="h-10 w-10 text-[var(--color-text-muted)] mb-3" />
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">No announcements yet</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Check back later for updates.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((ann) => (
            <PostCard
              key={ann.id}
              announcement={ann}
              currentUser={currentUser!}
              isAdminManagePage={false}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex justify-center">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-disabled={page === 1}
                  className={page === 1 ? 'pointer-events-none opacity-40' : 'cursor-pointer'}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <PaginationItem key={p}>
                  <PaginationLink
                    isActive={p === page}
                    onClick={() => setPage(p)}
                    className="cursor-pointer"
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-disabled={page === totalPages}
                  className={page === totalPages ? 'pointer-events-none opacity-40' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}

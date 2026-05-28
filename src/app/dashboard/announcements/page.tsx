'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Megaphone } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { ActivityPanel } from '@/components/announcements/ActivityPanel';
import { InlinePostCreator } from '@/components/announcements/InlinePostCreator';
import { PostCard } from '@/components/announcements/PostCard';
import { Tabs as VercelTabs } from '@/components/ui/vercel-tabs';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { TextShimmer } from '@/components/ui/text-shimmer';

import {
  type AnnouncementListItem,
  useAnnouncements,
  useCreateAnnouncement,
  useDeleteAnnouncement,
  useUpdateAnnouncement,
} from './_hooks/useAnnouncements';

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

type Tab = 'all' | 'published' | 'drafts';

const ANNOUNCEMENT_TABS = [
  { id: 'published', label: 'Published' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'all', label: 'All' },
] as const;

function PostCardSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-[var(--color-border)]" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-32 rounded bg-[var(--color-border)]" />
          <div className="h-2.5 w-20 rounded bg-[var(--color-border)]" />
        </div>
      </div>
      <div className="h-40 w-full rounded-xl bg-[var(--color-border)]" />
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-[var(--color-border)]" />
        <div className="h-3 w-3/4 rounded bg-[var(--color-border)]" />
      </div>
    </div>
  );
}

export default function AnnouncementsPage() {
  const router = useRouter();
  const [authPhase, setAuthPhase] = useState<'spinner' | 'checking' | 'done'>('spinner');
  const [user, setUser] = useState<UserData | null>(null);
  const [tab, setTab] = useState<Tab>('published');
  const [page, setPage] = useState(1);
  const [editingAnnouncement, setEditingAnnouncement] = useState<AnnouncementListItem | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setAuthPhase('checking'), 350);

    fetch('/api/auth/me/', { credentials: 'include' })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load current user');
        }
        return response.json();
      })
      .then((data: UserData) => {
        clearTimeout(timer);
        setUser(data);
        setAuthPhase('done');
      })
      .catch(() => {
        clearTimeout(timer);
        router.replace('/');
      });

    return () => clearTimeout(timer);
  }, [router]);

  const isPrivileged = Boolean(user?.admin || user?.hr || user?.accounting);
  const effectiveTab = isPrivileged ? tab : 'published';

  const { data, isLoading } = useAnnouncements(
    authPhase === 'done' ? { page, tab: effectiveTab } : {},
  );

  const createAnnouncement = useCreateAnnouncement();
  const updateAnnouncement = useUpdateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();

  async function handlePost(formData: FormData) {
    if (editingAnnouncement) {
      await updateAnnouncement.mutateAsync({ id: editingAnnouncement.id, data: formData });
      setEditingAnnouncement(null);
      return;
    }

    await createAnnouncement.mutateAsync(formData);
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteAnnouncement.mutateAsync(id);
    } finally {
      setDeletingId(null);
    }
  }

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
          Loading announcements...
        </TextShimmer>
      </div>
    );
  }

  const announcements = data?.results ?? [];
  const totalPages = data?.total_pages ?? 1;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {isPrivileged && currentUser && (
            <InlinePostCreator
              userAvatar={currentUser.avatar}
              userName={currentUser.name}
              editingAnnouncement={editingAnnouncement}
              onPost={handlePost}
              onCancelEdit={() => setEditingAnnouncement(null)}
            />
          )}

          {isPrivileged && (
            <VercelTabs
              tabs={[...ANNOUNCEMENT_TABS]}
              activeTab={tab}
              onTabChange={(tabId) => {
                setTab(tabId as Tab);
                setPage(1);
              }}
            />
          )}

          <div className="space-y-4 pb-8">
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, index) => (
                  <PostCardSkeleton key={index} />
                ))}
              </div>
            ) : announcements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Megaphone className="mb-3 h-10 w-10 text-[var(--color-text-muted)] opacity-40" />
                <p className="text-sm font-medium text-[var(--color-text-secondary)]">No announcements yet</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {effectiveTab === 'drafts' ? 'No drafts saved.' : 'Check back later for updates.'}
                </p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                <div className="space-y-4">
                  {announcements.map((announcement) => (
                    <motion.div
                      key={announcement.id}
                      initial={{ opacity: 0, y: -12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.22 }}
                    >
                      <PostCard
                        announcement={announcement}
                        currentUser={currentUser!}
                        onEdit={setEditingAnnouncement}
                        onDelete={handleDelete}
                        isDeleting={deletingId === announcement.id}
                      />
                    </motion.div>
                  ))}
                </div>
              </AnimatePresence>
            )}

            {totalPages > 1 && (
              <div className="flex justify-center pt-2">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                        aria-disabled={page === 1}
                        className={page === 1 ? 'pointer-events-none opacity-40' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                      <PaginationItem key={pageNumber}>
                        <PaginationLink
                          isActive={pageNumber === page}
                          onClick={() => setPage(pageNumber)}
                          className="cursor-pointer"
                        >
                          {pageNumber}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                        aria-disabled={page === totalPages}
                        className={page === totalPages ? 'pointer-events-none opacity-40' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </div>
        </div>

        <div className="hidden xl:block">
          <div className="sticky top-6 h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)]">
            <ActivityPanel />
          </div>
        </div>
      </div>
    </div>
  );
}

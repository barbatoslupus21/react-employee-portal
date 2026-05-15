'use client';

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { getCsrfToken } from '@/lib/csrf';

const BASE = '/api/announcements';

// --------------------------------------------------------------------------- //
//  Types                                                                       //
// --------------------------------------------------------------------------- //

export type AnnouncementMedia = {
  id: number;
  file: string;
  media_type: 'image' | 'video';
  order: number;
};

export type Reactor = { avatar: string | null };

export type AnnouncementListItem = {
  id: number;
  title: string;
  caption: string;
  is_published: boolean;
  created_by_name: string;
  created_by_avatar: string | null;
  created_at: string;
  updated_at: string;
  media: AnnouncementMedia[];
  reaction_count: number;
  comment_count: number;
  user_reaction: string | null;
  top_reactors: Reactor[];
};

export type AnnouncementsResponse = {
  results: AnnouncementListItem[];
  count: number;
  page: number;
  total_pages: number;
};

export type ReactionResponse = {
  reacted: boolean;
  emoji: string | null;
  reaction_count: number;
  top_reactors: Reactor[];
};

export type ReactionItem = {
  id: number;
  user_name: string;
  user_avatar: string | null;
  emoji: string;
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

// --------------------------------------------------------------------------- //
//  Fetch helpers                                                               //
// --------------------------------------------------------------------------- //

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const csrf = await getCsrfToken();
  return apiFetch<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify(body),
  });
}

async function apiPatch<T>(url: string, data: FormData | unknown): Promise<T> {
  const csrf = await getCsrfToken();
  if (data instanceof FormData) {
    return apiFetch<T>(url, {
      method: 'PATCH',
      headers: { 'X-CSRFToken': csrf },
      body: data,
    });
  }
  return apiFetch<T>(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify(data),
  });
}

async function apiDelete(url: string): Promise<void> {
  const csrf = await getCsrfToken();
  return apiFetch<void>(url, {
    method: 'DELETE',
    headers: { 'X-CSRFToken': csrf },
  });
}

async function apiPut<T>(url: string, body: unknown): Promise<T> {
  const csrf = await getCsrfToken();
  return apiFetch<T>(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: JSON.stringify(body),
  });
}

// --------------------------------------------------------------------------- //
//  Queries                                                                     //
// --------------------------------------------------------------------------- //

export function useAnnouncements(params: { page?: number; tab?: string } = {}) {
  const { page = 1, tab = 'all' } = params;
  const qs = new URLSearchParams({ page: String(page), tab }).toString();
  return useQuery<AnnouncementsResponse>({
    queryKey: ['announcements', page, tab],
    queryFn: () => apiFetch<AnnouncementsResponse>(`${BASE}/?${qs}`),
  });
}

export function useAnnouncementDetail(id: number | null) {
  return useQuery<AnnouncementListItem>({
    queryKey: ['announcement', id],
    queryFn: () => apiFetch<AnnouncementListItem>(`${BASE}/${id}/`),
    enabled: id !== null,
  });
}

export function useAnnouncementComments(announcementId: number | null) {
  return useQuery<Comment[]>({
    queryKey: ['announcement-comments', announcementId],
    queryFn: () => apiFetch<Comment[]>(`${BASE}/${announcementId}/comments/`),
    enabled: announcementId !== null,
  });
}

export function useAnnouncementReactions(announcementId: number | null, enabled: boolean) {
  return useQuery<ReactionItem[]>({
    queryKey: ['announcement-reactions', announcementId],
    queryFn: () => apiFetch<ReactionItem[]>(`${BASE}/${announcementId}/reactions/`),
    enabled: enabled && announcementId !== null,
  });
}

// --------------------------------------------------------------------------- //
//  Mutations                                                                   //
// --------------------------------------------------------------------------- //

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: FormData) => {
      const csrf = await getCsrfToken();
      return apiFetch<AnnouncementListItem>(`${BASE}/`, {
        method: 'POST',
        headers: { 'X-CSRFToken': csrf },
        body: data,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
}

export function useUpdateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: FormData | Record<string, unknown> }) =>
      apiPatch<AnnouncementListItem>(`${BASE}/${id}/`, data),
    onSuccess: (_data: AnnouncementListItem, vars: { id: number; data: FormData | Record<string, unknown> }) => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['announcement', vars.id] });
    },
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`${BASE}/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
}

export function useReorderMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ announcementId, items }: { announcementId: number; items: { id: number; order: number }[] }) =>
      apiPut(`${BASE}/${announcementId}/media/reorder/`, items),
    onSuccess: (_data: unknown, vars: { announcementId: number; items: { id: number; order: number }[] }) => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['announcement', vars.announcementId] });
    },
  });
}

export function useToggleReaction(announcementId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (emoji: string) =>
      apiPost<ReactionResponse>(`${BASE}/${announcementId}/react/`, { emoji }),
    onMutate: async (emoji: string) => {
      // Optimistic update on list cache (Risk 9 pattern)
      await qc.cancelQueries({ queryKey: ['announcements'] });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
    },
  });
}

export function usePostComment(announcementId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { content: string; parent_id?: number }) =>
      apiPost<{ comment: Comment; comment_count: number }>(
        `${BASE}/${announcementId}/comments/`,
        payload,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcement-comments', announcementId] });
      qc.invalidateQueries({ queryKey: ['announcements'] });
    },
  });
}

export function useDeleteComment(announcementId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: number) =>
      apiDelete(`${BASE}/${announcementId}/comments/${commentId}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcement-comments', announcementId] });
      qc.invalidateQueries({ queryKey: ['announcements'] });
    },
  });
}

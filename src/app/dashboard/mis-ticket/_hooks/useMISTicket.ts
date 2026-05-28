'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCsrfToken, seedCsrfCookie } from '@/lib/csrf';
import { toast } from '@/components/ui/toast';

const API = '/api/mis';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = { 'Content-Type': 'application/json', ...init?.headers };
  const requestInit = {
    credentials: 'include',
    ...init,
    headers,
  };

  const res = await fetch(`${API}${path}`, requestInit);
  if (res.status === 401 && path !== '/auth/token/refresh') {
    let csrfToken = getCsrfToken();
    if (!csrfToken) {
      csrfToken = await seedCsrfCookie();
    }

    const refreshRes = await fetch(`${API}/auth/token/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRFToken': csrfToken },
    });

    if (refreshRes.ok) {
      const retryRes = await fetch(`${API}${path}`, requestInit);
      if (retryRes.ok) {
        return retryRes.json() as Promise<T>;
      }
      const retryBody = await retryRes.json().catch(() => ({}));
      throw new Error(retryBody.detail || `Request failed: ${retryRes.status}`);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MISDevice {
  id: number;
  device_name: string;
  device_type: string;
  device_type_display: string;
  other_device_type: string;
  brand: string;
  model_name: string;
  serial_number: string;
  asset_tag: string;
  location: string;
  created_at: string;
  updated_at: string;
}

export interface MISTicket {
  id: number;
  ticket_number: string;
  subject: string;
  device_name: string;
  device_display: string;
  category: string;
  category_display: string;
  priority: string;
  priority_display: string;
  problem: string;
  status: string;
  status_display: string;
  has_diagnosis: boolean;
  diagnosis_note: string;
  requires_immediate_action: boolean;
  has_recommended_parts: boolean;
  seen: boolean;
  created_at: string;
  resolved_at: string | null;
  // detail only
  employee_name?: string;
  department?: string;
  diagnosis?: MISDiagnosis;
  updated_at?: string;
}

export interface MISDiagnosis {
  id: number;
  technician_name: string;
  progress_note: string;
  diagnosis: string;
  action_taken: string;
  possible_reason: string;
  recommendation: string;
  requires_immediate_action: boolean;
  recommended_parts: string;
  diagnosed_at: string;
  last_diagnosed_at: string;
}

export interface MISChatSession {
  id: number;
  session_id: string;
  created_at: string;
  last_active: string;
}

export interface MISChatMessage {
  id: number;
  message: string;
  is_ai: boolean;
  is_ticket_creation: boolean;
  created_at: string;
}

export interface MISTicketPage {
  results: MISTicket[];
  count: number;
  page: number;
  page_size: number;
}

export interface AdminStats {
  by_status: { status: string; count: number }[];
  by_category: { category: string; count: number }[];
  by_priority: { priority: string; count: number }[];
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
  prev_total: number;
  prev_open: number;
  prev_in_progress: number;
  prev_resolved: number;
  prev_closed: number;
  avg_resolution_time: number;
  prev_avg_resolution_time: number;
}

export interface MISChartDataPoint {
  label: string;
  [key: string]: string | number;
}

export interface MISChartResponse {
  view: string;
  fy_start: number;
  data: MISChartDataPoint[];
}

// ── Device hooks ──────────────────────────────────────────────────────────────

export function useMISDevices() {
  return useQuery({
    queryKey: ['mis-devices'],
    queryFn: () => apiFetch<MISDevice[]>('/devices'),
  });
}

export function useMISDevicesSearch(search = '') {
  const qs = new URLSearchParams();
  if (search.trim()) qs.set('search', search.trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : '';

  return useQuery({
    queryKey: ['mis-devices', search.trim()],
    queryFn: () => apiFetch<MISDevice[]>(`/devices${suffix}`),
  });
}

export function useMISDevicesFiltered(search = '', deviceType = '') {
  const qs = new URLSearchParams();
  if (search.trim()) qs.set('search', search.trim());
  if (deviceType.trim()) qs.set('device_type', deviceType.trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : '';

  return useQuery({
    queryKey: ['mis-devices', search.trim(), deviceType.trim()],
    queryFn: () => apiFetch<MISDevice[]>(`/devices${suffix}`),
  });
}

export function useCreateMISDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<MISDevice>) => {
      const csrf = await getCsrfToken();
      return apiFetch<MISDevice>('/devices', {
        method: 'POST',
        headers: { 'X-CSRFToken': csrf },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mis-devices'] });
      toast.success('Device added successfully.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateMISDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<MISDevice> }) => {
      const csrf = await getCsrfToken();
      return apiFetch<MISDevice>(`/devices/${id}`, {
        method: 'PUT',
        headers: { 'X-CSRFToken': csrf },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mis-devices'] });
      toast.success('Device updated.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteMISDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, confirm }: { id: number; confirm?: boolean }) => {
      const csrf = await getCsrfToken();
      const url = confirm ? `/devices/${id}?confirm=1` : `/devices/${id}`;
      const res = await fetch(`${API}${url}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRFToken': csrf },
      });
      if (res.status === 409) return res.json(); // open tickets warning
      if (!res.ok) throw new Error('Failed to delete device.');
      return null;
    },
    onSuccess: (data) => {
      if (!data) {
        qc.invalidateQueries({ queryKey: ['mis-devices'] });
        toast.success('Device deleted.');
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useMISDeviceSummary(pk: number | null) {
  return useQuery({
    queryKey: ['mis-device-summary', pk],
    queryFn: () => apiFetch<unknown>(`/devices/${pk}/summary`),
    enabled: pk !== null,
  });
}

// ── Ticket hooks ──────────────────────────────────────────────────────────────

export function useUnseenMISTicketCount() {
  return useQuery({
    queryKey: ['mis-tickets-unseen-count'],
    queryFn: () => apiFetch<{ count: number }>('/tickets/unseen-count'),
    refetchInterval: 60000,
  });
}

export function useMISTickets(params?: {
  page?: number;
  search?: string;
  pageSize?: number;
  status?: string;
  category?: string;
}) {
  const page = params?.page ?? 1;
  const search = params?.search ?? '';
  const pageSize = params?.pageSize ?? 20;
  const status = params?.status ?? '';
  const category = params?.category ?? '';
  const qs = new URLSearchParams();
  qs.set('page', String(page));
  qs.set('page_size', String(pageSize));
  if (search.trim()) qs.set('search', search.trim());
  if (status.trim()) qs.set('status', status.trim());
  if (category.trim()) qs.set('category', category.trim());

  return useQuery({
    queryKey: ['mis-tickets', page, pageSize, search.trim(), status.trim(), category.trim()],
    queryFn: () => apiFetch<MISTicketPage>(`/tickets?${qs.toString()}`),
  });
}

export function useMISTicketDetail(pk: number | null) {
  return useQuery({
    queryKey: ['mis-ticket-detail', pk],
    queryFn: () => apiFetch<MISTicket>(`/tickets/${pk}`),
    enabled: pk !== null,
  });
}

export function useCreateMISTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      subject: string;
      category: string;
      device_id?: number | null;
      problem: string;
    }) => {
      const csrf = await getCsrfToken();
      return apiFetch<MISTicket>('/tickets', {
        method: 'POST',
        headers: { 'X-CSRFToken': csrf },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mis-tickets'] });
      toast.success('Ticket created successfully.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCancelMISTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pk: number) => {
      const csrf = await getCsrfToken();
      return apiFetch<MISTicket>(`/tickets/${pk}/cancel`, {
        method: 'POST',
        headers: { 'X-CSRFToken': csrf },
      });
    },
    onSuccess: (_, pk) => {
      qc.invalidateQueries({ queryKey: ['mis-tickets'] });
      qc.invalidateQueries({ queryKey: ['mis-ticket-detail', pk] });
      qc.invalidateQueries({ queryKey: ['admin-mis-tickets'] });
      qc.invalidateQueries({ queryKey: ['admin-mis-stats'] });
      toast.success('Ticket cancelled.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Chat hooks ────────────────────────────────────────────────────────────────

export function useMISChatSession() {
  return useQuery({
    queryKey: ['mis-chat-session'],
    queryFn: () => apiFetch<MISChatSession>('/chat/session'),
  });
}

export function useMISChatMessages(sessionId: string | null) {
  return useQuery({
    queryKey: ['mis-chat-messages', sessionId],
    queryFn: () => apiFetch<MISChatMessage[]>(`/chat/messages?session_id=${sessionId}`),
    enabled: !!sessionId,
  });
}

export function useSendMISChatMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ message }: { message: string }) => {
      const csrf = await getCsrfToken();
      return apiFetch<{ user_message: MISChatMessage; ai_message: MISChatMessage; ticket?: MISTicket }>(
        '/chat/relay',
        {
          method: 'POST',
          headers: { 'X-CSRFToken': csrf },
          body: JSON.stringify({ message }),
        },
      );
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['mis-chat-messages'] });
      if (data.ticket) {
        qc.invalidateQueries({ queryKey: ['mis-tickets'] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Admin hooks ───────────────────────────────────────────────────────────────

export function useAdminMISTickets(params: {
  search?: string;
  status?: string;
  category?: string;
  priority?: string;
  page?: number;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
}) {
  const qs = new URLSearchParams();
  if (params.search)   qs.set('search',   params.search);
  if (params.status)   qs.set('status',   params.status);
  if (params.category) qs.set('category', params.category);
  if (params.priority) qs.set('priority', params.priority);
  if (params.sort_by)  qs.set('sort_by',  params.sort_by);
  if (params.sort_dir) qs.set('sort_dir', params.sort_dir);
  qs.set('page', String(params.page ?? 1));

  return useQuery({
    queryKey: ['admin-mis-tickets', params],
    queryFn: () => apiFetch<MISTicketPage>(`/admin/tickets?${qs}`),
  });
}

export function useAdminMISStats() {
  return useQuery({
    queryKey: ['admin-mis-stats'],
    queryFn: () => apiFetch<AdminStats>('/admin/stats'),
  });
}

export function useAdminDiagnose() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pk,
      data,
    }: {
      pk: number;
      data: {
        diagnosis: string;
        action_taken: string;
        possible_reason: string;
        recommendation?: string;
        progress_note?: string;
        status: string;
        requires_immediate_action?: boolean;
      };
    }) => {
      const csrf = await getCsrfToken();
      return apiFetch<MISTicket>(`/admin/tickets/${pk}/diagnose`, {
        method: 'POST',
        headers: { 'X-CSRFToken': csrf },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-mis-tickets'] });
      qc.invalidateQueries({ queryKey: ['admin-mis-stats'] });
      qc.invalidateQueries({ queryKey: ['admin-mis-chart'] });
      toast.success('Diagnosis submitted successfully.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAdminMISChart(params: {
  view: 'fiscal' | 'monthly' | 'weekly';
  fyStart?: number;
  monthYear?: string;
  weekStart?: string;
}) {
  const qs = new URLSearchParams();
  qs.set('view', params.view);
  if (params.fyStart)    qs.set('fy_start',   String(params.fyStart));
  if (params.monthYear)  qs.set('month_year', params.monthYear);
  if (params.weekStart)  qs.set('week_start', params.weekStart);

  return useQuery({
    queryKey: ['admin-mis-chart', params],
    queryFn: () => apiFetch<MISChartResponse>(`/admin/chart?${qs}`),
    staleTime: 60_000,
  });
}

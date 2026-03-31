"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { AnimatedTabs } from "@/components/ui/animated-tabs";
import { getCsrfToken } from "@/lib/csrf";
import {
  Bell,
  Award,
  FileText,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

interface ApiNotification {
  id:                number;
  notification_type: string;
  title:             string;
  message:           string;
  is_read:           boolean;
  module:            string;
  related_object_id: number | null;
  created_at:        string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Map a notification's module slug to its dashboard route. */
function getModuleRoute(module: string): string {
  const MAP: Record<string, string> = {
    'certification': '/dashboard/certification',
    'pr-form':       '/dashboard/pr-form',
    'calendar':      '/dashboard/calendar',
    'hr':            '/dashboard/hr',
    'clinic':        '/dashboard/clinic',
    'news':          '/dashboard/news',
    'accounting':    '/dashboard/accounting',
  };
  return MAP[module] ?? '/dashboard';
}

/** Select a Lucide icon based on notification_type. */
function getNotifIcon(type: string): LucideIcon {
  if (type.startsWith('certificate')) return Award;
  if (type.startsWith('prf'))        return FileText;
  return AlertCircle;
}

/** Format a UTC ISO timestamp into a human-readable relative string. */
function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 1)    return 'Just now';
  if (mins < 60)   return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)    return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Component ────────────────────────────────────────────────────────────────

export function NotificationInboxPopover() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [tab, setTab] = useState("all");
  const [open, setOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchNotifications = useCallback(() => {
    fetch('/api/activitylog/notifications/', { credentials: 'include' })
      .then((r) => r.ok ? r.json() as Promise<ApiNotification[]> : Promise.resolve([]))
      .then(setNotifications)
      .catch(() => {/* silent */});
  }, []);

  useEffect(() => {
    fetchNotifications();
    // Poll every 60 s for new notifications
    pollRef.current = setInterval(fetchNotifications, 60_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchNotifications]);

  // Refresh when popover opens
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const filtered    = tab === "unread"
    ? notifications.filter((n) => !n.is_read)
    : notifications;

  const notifTabs = [
    { id: "all",    label: "All" },
    { id: "unread", label: "Unread", badge: unreadCount },
  ];

  // ── Actions ────────────────────────────────────────────────────────────────
  function handleMarkAllRead() {
    fetch('/api/activitylog/notifications/read-all/', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'X-CSRFToken': getCsrfToken() },
    })
      .then((r) => r.ok ? setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true }))) : null)
      .catch(() => {/* silent */});
  }

  function handleNotifClick(n: ApiNotification) {
    // Mark as read locally immediately for responsiveness
    setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, is_read: true } : x));

    // Persist to backend (fire-and-forget)
    fetch(`/api/activitylog/notifications/${n.id}/read/`, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'X-CSRFToken': getCsrfToken() },
    }).catch(() => {/* silent */});

    // Navigate to the relevant module page
    const route = getModuleRoute(n.module);
    setOpen(false);
    router.push(route);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex h-8 w-8 items-center justify-center
            text-[var(--color-text-primary)]
            hover:text-[var(--color-text-muted)] transition-colors duration-150"
          aria-label="Open notifications"
        >
          <Bell size={20} strokeWidth={2} />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px]
                px-1 text-[10px] leading-none flex items-center justify-center"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[360px] p-0"
        align="end"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2.5">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            Notifications
          </span>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
              >
                Mark all read
              </button>
            )}
            <AnimatedTabs
              tabs={notifTabs}
              defaultTab="all"
              onChange={setTab}
            />
          </div>
        </div>

        {/* List */}
        <div className="max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
              No notifications
            </div>
          ) : (
            filtered.map((n) => {
              const Icon = getNotifIcon(n.notification_type);
              return (
                <button
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  className="flex w-full items-start gap-3 border-b border-[var(--color-border)]
                    px-4 py-3 text-left transition-colors duration-100
                    hover:bg-[var(--color-bg-card)]"
                >
                  <div className="mt-0.5 shrink-0 text-[var(--color-text-muted)]">
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p
                      className={`text-sm leading-snug ${
                        !n.is_read
                          ? "font-semibold text-[var(--color-text-primary)]"
                          : "text-[var(--color-text-secondary)]"
                      }`}
                    >
                      {n.title}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">
                      {n.message}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      {fmtRelative(n.created_at)}
                    </p>
                  </div>
                  {!n.is_read && (
                    <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-[#2845D6]" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}


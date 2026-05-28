"use client";

import {
  useState,
  useEffect,
  useCallback,
  useId,
  useMemo,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence, animate, color } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Clock,
  CalendarDays,
  Award,
  Gift,
  AlertCircle,
  CheckCircle2,
  User,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  ClipboardList,
  GraduationCap,
  X,
  Boxes,
} from "lucide-react";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { TextRotate } from "@/components/ui/text-rotate";
import { PostCard } from "@/components/announcements/PostCard";
import {
  useAnnouncements,
  type AnnouncementListItem,
} from "@/app/dashboard/announcements/_hooks/useAnnouncements";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/pie-chart";
import { getCsrfToken } from "@/lib/csrf";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Label,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserData {
  id: number;
  idnumber: string;
  firstname: string | null;
  lastname: string | null;
  email: string;
  avatar: string | null;
  active: boolean;
  admin: boolean;
  hr: boolean;
  hr_manager: boolean;
  accounting: boolean;
  mis: boolean;
  news: boolean;
  clinic: boolean;
  iad: boolean;
  is_staff: boolean;
  is_superuser: boolean;
}

interface MissingTimelog {
  date: string;
  missing: "time_in" | "time_out";
}

interface UpcomingLeave {
  id: number;
  control_number: string;
  leave_type_name: string;
  date_start: string;
  date_end: string;
  status: string;
  status_display: string;
}

interface UpcomingEvent {
  id: number;
  title: string;
  date: string;
  event_type: string;
  event_type_display: string;
}

interface UnseenCert {
  id: number;
  title: string;
  category_name: string;
  created_at: string;
}

interface MemoAdvertisementSettingsData {
  enabled: boolean;
}

interface MemoAdvertisementData {
  id: number;
  title: string;
  description: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface CalEvent {
  id: number;
  date: string;
  event_type: string;
  title: string;
  repetition: string;
}

interface CalLeave {
  date_start: string;
  date_end: string;
  status: string;
  leave_type_name: string;
}

interface DashboardOverview {
  is_approver: boolean;
  profile: { birth_date: string | null; completion_pct: number };
  notifications: {
    missing_timelogs: MissingTimelog[];
    upcoming_leaves: UpcomingLeave[];
    upcoming_events: UpcomingEvent[];
    unseen_certs: UnseenCert[];
  };
  birthdays_today: {
    id: number;
    name: string;
    firstname: string;
  }[];
  calendar: { leaves: CalLeave[]; events: CalEvent[]; holidays: CalEvent[] };
}

type CalendarSlot = {
  events: CalEvent[];
  holidays: CalEvent[];
  leaves: CalLeave[];
};

type DashboardRole = "admin" | "accounting" | "hr" | "personal";

function resolveDashboardRole(user: Pick<UserData, "admin" | "accounting" | "hr">): DashboardRole {
  // Priority order required for Overview resolution.
  if (user.admin) return "admin";
  if (user.accounting) return "accounting";
  if (user.hr) return "hr";
  return "personal";
}

function openingText(role: Exclude<DashboardRole, "personal">): string {
  if (role === "admin") return "Opening Admin Dashboard...";
  if (role === "accounting") return "Opening Accounting Dashboard...";
  return "Opening HR Dashboard...";
}

// ── Approver types ────────────────────────────────────────────────────────────

interface TimelogAnomaly {
  employee_id: number;
  employee_name: string;
  anomalies: { date: string; missing: "time_in" | "time_out" }[];
}

interface ApproverSubLeave {
  id: number;
  employee_name: string;
  department_name: string | null;
  line_name: string | null;
  leave_type: string;
  leave_category: string;
  leave_reason: string;
  date_start: string;
  date_end: string;
  days_count: number;
}

interface ApproverPendingLeave extends ApproverSubLeave {
  control_number: string;
  days_pending: number | null;
}

interface EvaluationProgress {
  period_title: string;
  period_start: string;
  period_end: string;
  frequency: string;
  submitted_count: number;
  total_count: number;
  not_submitted: { employee_id: number; employee_name: string }[];
  days_remaining: number;
  status_breakdown: {
    key:
      | "pending"
      | "supervisor_review"
      | "user_confirmation"
      | "final_approval"
      | "second_final_approval"
      | "returned"
      | "completed"
      | "disapproved";
    label: string;
    count: number;
  }[];
}

interface OpenTicket {
  id: number;
  ticket_number: string;
  employee_name: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  days_open: number | null;
}

interface ApproverOverview {
  is_empty: boolean;
  summary: {
    total_subordinates: number;
    pending_leave_approvals: { current: number };
    lacking_timelogs: { current: number };
    evaluations_submitted: { current: number; previous: number };
    trainings_completed: { current: number; previous: number };
    certs_issued: { current: number; previous: number };
    trends: {
      weeks: string[];
      total_subordinates: number[];
      pending_leave_approvals: number[];
      lacking_timelogs: number[];
      evaluations_submitted: number[];
      trainings_completed: number[];
      certs_issued: number[];
    };
  };
  timelog_anomalies: TimelogAnomaly[];
  pending_leaves: ApproverPendingLeave[];
  upcoming_leaves: ApproverSubLeave[];
  evaluation: EvaluationProgress | null;
  open_tickets: OpenTicket[];
  subordinates: { employee_id: number; employee_name: string }[];
  timelog_chart: {
    days: string[];
    last_week: number[];
    current_week: number[];
  } | null;
  leave_chart: {
    weeks: string[];
    current_month: number[];
    previous_month: number[];
  } | null;
  pending_leave_chart: {
    months: string[];
    current_month: number[];
    previous_month: number[];
  } | null;
  mis_chart: {
    months: string[];
    current_month: number[];
    previous_month: number[];
  } | null;
}

// ── Static data ───────────────────────────────────────────────────────────────

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const LEAVE_STATUS_COLOR: Record<string, string> = {
  approved: "bg-emerald-500",
  pending:  "bg-amber-400",
  routing:  "bg-amber-400",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGreeting(birthDate: string | null, firstName: string | null): string {
  const now = new Date();
  if (birthDate) {
    // Parse date as local to avoid UTC offset shifting day/month
    const [, mm, dd] = birthDate.split("-").map(Number);
    if (mm === now.getMonth() + 1 && dd === now.getDate()) {
      return `Happy Birthday${firstName ? `, ${firstName}` : ""}!`;
    }
  }
  return getDayPeriodGreeting(firstName);
}

function getDayPeriodGreeting(firstName: string | null): string {
  const hour = new Date().getHours();
  const suffix = firstName ? `, ${firstName}!` : "!";
  if (hour < 12) return `Good morning${suffix}`;
  if (hour < 17) return `Good afternoon${suffix}`;
  return `Good evening${suffix}`;
}

function getGreetingBoostMessage(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning! Ready to make today amazing?";
  if (hour < 17) return "Good afternoon! Keep the momentum going.";
  return "Good evening! Wrap up the day with something meaningful.";
}

function getCompletionColors(pct: number) {
  if (pct <= 50) {
    return {
      barColor: "#EF4444",
      pillBg: "#F87171",
      pillText: "#7F1D1D",
    };
  }
  if (pct <= 70) {
    return {
      barColor: "#F59E0B",
      pillBg: "#FBBF24",
      pillText: "#78350F",
    };
  }
  return {
    barColor: "#10B981",
    pillBg: "#34D399",
    pillText: "#14532D",
  };
}

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function padNum(n: number) {
  return String(n).padStart(2, "0");
}

function isoDate(y: number, m: number, d: number) {
  return `${y}-${padNum(m)}-${padNum(d)}`;
}

// Build a map: "YYYY-MM-DD" → { events, holidays, leaves }
function buildDateMap(
  events: CalEvent[],
  holidays: CalEvent[],
  leaves: CalLeave[],
  year: number,
  month: number // 1-based
): Map<string, CalendarSlot> {
  const map = new Map<string, CalendarSlot>();
  const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-based so month+0=last day

  function slot(key: string) {
    if (!map.has(key)) map.set(key, { events: [], holidays: [], leaves: [] });
    return map.get(key)!;
  }

  // Expand events and holidays (with repetition)
  const allEvs: [CalEvent[], "events" | "holidays"][] = [
    [events, "events"],
    [holidays, "holidays"],
  ];
  for (const [list, kind] of allEvs) {
    for (const ev of list) {
      const [by, bm, bd] = ev.date.split("-").map(Number);
      const base = new Date(by, bm - 1, bd);
      for (let day = 1; day <= daysInMonth; day++) {
        const cur = new Date(year, month - 1, day);
        if (cur < base) continue;
        let match = false;
        switch (ev.repetition) {
          case "once":    match = cur.getTime() === base.getTime(); break;
          case "daily":   match = true; break;
          case "weekly":  match = cur.getDay() === base.getDay(); break;
          case "monthly": match = cur.getDate() === base.getDate(); break;
          case "yearly":  match = cur.getMonth() === base.getMonth() && cur.getDate() === base.getDate(); break;
        }
        if (match) slot(isoDate(year, month, day))[kind].push(ev);
      }
    }
  }

  // Expand leaves (date range)
  for (const lv of leaves) {
    const [sy, sm, sd] = lv.date_start.split("-").map(Number);
    const [ey, em, ed] = lv.date_end.split("-").map(Number);
    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    for (let day = 1; day <= daysInMonth; day++) {
      const cur = new Date(year, month - 1, day);
      if (cur >= start && cur <= end) slot(isoDate(year, month, day)).leaves.push(lv);
    }
  }

  return map;
}

// ── PostCard skeleton ─────────────────────────────────────────────────────────

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
      <div className="h-40 w-full rounded-xl bg-[var(--color-border)]" />
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-[var(--color-border)]" />
        <div className="h-3 w-3/4 rounded bg-[var(--color-border)]" />
      </div>
    </div>
  );
}

// ── ProfileWidget ─────────────────────────────────────────────────────────────

function ProfileWidget({
  user,
  overview,
  router,
}: {
  user: UserData;
  overview: DashboardOverview | undefined;
  router: ReturnType<typeof useRouter>;
}) {
  const pct = overview?.profile.completion_pct ?? 0;
  const birthDate = overview?.profile.birth_date ?? null;

  const greeting = getGreeting(birthDate, user.firstname);
  const boostMessage = getGreetingBoostMessage();
  const progressClickable = pct < 100;
  const completionColors = getCompletionColors(pct);

  return (
    <div>
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-xl font-semibold text-[var(--color-text-primary)]">
            {greeting}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {boostMessage}
          </p>
        </div>

        {progressClickable && (
          <button
            type="button"
            onClick={() => router.push("/dashboard/profile-settings")}
            className="block w-full bg-[var(--color-bg-elevated)] text-left transition-colors hover:bg-[var(--color-bg-card)]/80"
            title="Complete your profile"
          >
            <div className="relative">
              <div className="h-2 overflow-hidden rounded-full bg-[var(--color-border)]">
                <motion.div
                  className="h-full rounded-full"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: pct / 100 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  style={{
                    backgroundColor: completionColors.barColor,
                    transformOrigin: "left center",
                  }}
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
              Complete the remaining details in your profile settings.
            </p>
          </button>
        )}
      </div>
    </div>
  );
}

function ProfileWidgetSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 animate-pulse">
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="h-6 w-40 rounded bg-[var(--color-border)]" />
          <div className="h-4 w-full rounded bg-[var(--color-border)]" />
          <div className="h-4 w-3/4 rounded bg-[var(--color-border)]" />
        </div>
        <div className="rounded-xl border border-[var(--color-border)] p-3">
          <div className="mb-2 h-4 w-28 rounded bg-[var(--color-border)]" />
          <div className="h-2 w-full rounded-full bg-[var(--color-border)]" />
          <div className="mt-2 h-3 w-2/3 rounded bg-[var(--color-border)]" />
        </div>
      </div>
    </div>
  );
}

// ── MiniCalendar ──────────────────────────────────────────────────────────────

function MiniCalendar({ overview }: { overview: DashboardOverview | undefined }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1); // 1-based
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [monthDirection, setMonthDirection] = useState<1 | -1>(1);

  const dateMap = useMemo(() => {
    if (!overview) return new Map<string, CalendarSlot>();
    return buildDateMap(
      overview.calendar.events,
      overview.calendar.holidays,
      overview.calendar.leaves,
      viewYear,
      viewMonth
    );
  }, [overview, viewYear, viewMonth]);

  const firstDow = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const todayStr = isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const monthKey = `${viewYear}-${viewMonth}`;

  function prevMonth() {
    setMonthDirection(-1);
    setHoveredDate(null);
    if (viewMonth === 1) { setViewYear((y) => y - 1); setViewMonth(12); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    setMonthDirection(1);
    setHoveredDate(null);
    if (viewMonth === 12) { setViewYear((y) => y + 1); setViewMonth(1); }
    else setViewMonth((m) => m + 1);
  }

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const tooltipSlot = hoveredDate ? dateMap.get(hoveredDate) : null;

  return (
    <div className="relative overflow-visible rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2">

      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          className="p-1 rounded-lg hover:bg-[var(--color-bg-card)] text-[var(--color-text-muted)] transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft size={15} />
        </button>
        <div className="relative overflow-hidden">
          <AnimatePresence mode="wait" initial={false} custom={monthDirection}>
            <motion.span
              key={monthKey}
              custom={monthDirection}
              initial={{ opacity: 0, x: monthDirection * 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: monthDirection * -14 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="block text-sm font-semibold text-[var(--color-text-primary)]"
            >
              {MONTHS[viewMonth - 1]} {viewYear}
            </motion.span>
          </AnimatePresence>
        </div>
        <button
          onClick={nextMonth}
          className="p-1 rounded-lg hover:bg-[var(--color-bg-card)] text-[var(--color-text-muted)] transition-colors"
          aria-label="Next month"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Weekday row */}
      <div className="grid grid-cols-7 mb-0.5">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="text-[10px] font-medium text-center text-[var(--color-text-muted)] py-0.5"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Date grid */}
      <div className="relative min-h-[172px] overflow-visible">
        <AnimatePresence mode="wait" initial={false} custom={monthDirection}>
          <motion.div
            key={monthKey}
            custom={monthDirection}
            initial={{ opacity: 0, x: monthDirection * 28, scale: 0.985 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: monthDirection * -28, scale: 0.985 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-7 gap-y-px overflow-visible"
          >
            {cells.map((day, idx) => {
              if (!day) return <div key={`p${idx}`} />;
              const ds = isoDate(viewYear, viewMonth, day);
              const slot = dateMap.get(ds);
              const isToday = ds === todayStr;
              const isHovered = ds === hoveredDate;
              const isTooltipOpen = isHovered && !!slot;
              const hasLeave = !!slot?.leaves.length;
              const hasHoliday = !!slot?.holidays.length;
              const hasEvent = !!slot?.events.length;
              const hasAny = hasLeave || hasHoliday || hasEvent;

              return (
                <motion.div
                  key={ds}
                  onMouseEnter={() => hasAny && setHoveredDate(ds)}
                  onMouseLeave={() => setHoveredDate(null)}
                  onClick={() => setHoveredDate(isHovered ? null : hasAny ? ds : null)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.18,
                    ease: "easeOut",
                    delay: Math.min(day * 0.006, 0.12),
                  }}
                  className={`
                    relative flex flex-col items-center py-0.5 rounded-md transition-colors overflow-visible
                    ${isToday ? "bg-[#2845D6]/10" : isHovered ? "bg-[var(--color-bg-card)]" : "hover:bg-[var(--color-bg-card)]"}
                    ${hasAny ? "cursor-pointer" : "cursor-default"}
                    ${isTooltipOpen ? "z-30" : "z-0"}
                  `}
                >
                  <span
                    className={`text-[11px] leading-5 select-none ${
                      isToday
                        ? "font-bold text-[#2845D6]"
                        : "text-[var(--color-text-primary)]"
                    }`}
                  >
                    {day}
                  </span>
                  {hasAny && (
                    <div className="flex gap-[2px] mt-px">
                      {hasLeave && (
                        <span className="w-1 h-1 rounded-full bg-blue-500" />
                      )}
                      {hasHoliday && (
                        <span className="w-1 h-1 rounded-full bg-emerald-500" />
                      )}
                      {hasEvent && (
                        <span className="w-1 h-1 rounded-full bg-purple-500" />
                      )}
                    </div>
                  )}

                  <AnimatePresence>
                    {isTooltipOpen && slot && (
                      <motion.div
                        key={`${ds}-tooltip`}
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                        className="absolute bottom-full left-1/2 z-40 mb-2 w-44 -translate-x-1/2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] p-2 text-left shadow-xl"
                      >
                        <p className="text-[10px] font-semibold text-[var(--color-text-primary)]">
                          {formatShortDate(ds)}
                        </p>
                        <div className="mt-2 space-y-1">
                          {slot.holidays.map((h) => (
                            <div key={h.id} className="flex items-center gap-2">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                              <span className="truncate text-[9px] text-[var(--color-text-secondary)]">
                                {h.title}
                              </span>
                            </div>
                          ))}
                          {slot.leaves.map((lv, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  LEAVE_STATUS_COLOR[lv.status] ?? "bg-blue-500"
                                }`}
                              />
                              <span className="truncate text-[9px] text-[var(--color-text-secondary)]">
                                {lv.leave_type_name} ({lv.status})
                              </span>
                            </div>
                          ))}
                          {slot.events.map((ev) => (
                            <div key={ev.id} className="flex items-center gap-2">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-purple-500" />
                              <span className="truncate text-[9px] text-[var(--color-text-secondary)]">
                                {ev.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function MiniCalendarSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="w-5 h-5 rounded bg-[var(--color-border)]" />
        <div className="w-28 h-4 rounded bg-[var(--color-border)]" />
        <div className="w-5 h-5 rounded bg-[var(--color-border)]" />
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="h-5 rounded bg-[var(--color-border)] opacity-40" />
        ))}
      </div>
    </div>
  );
}

// ── NotificationPanel ─────────────────────────────────────────────────────────

function NotifItem({
  icon,
  label,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-2 py-2 rounded-md hover:bg-[var(--color-bg-card)] pl-2 text-left transition-colors group"
    >
      <span className="mt-0.5 shrink-0 text-[var(--color-text-muted)] group-hover:text-[#2845D6] transition-colors">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--color-text-primary)] truncate leading-snug">
          {label}
        </p>
        <p className="text-[10px] text-[var(--color-text-muted)] truncate leading-snug mt-0.5">
          {sub}
        </p>
      </div>
    </button>
  );
}

function getNotificationRoute(category: keyof DashboardOverview["notifications"]) {
  switch (category) {
    case "missing_timelogs":
      return "/dashboard/calendar";
    case "upcoming_leaves":
      return "/dashboard/leave";
    case "upcoming_events":
      return "/dashboard/calendar";
    case "unseen_certs":
      return "/dashboard/certification";
    default:
      return "/dashboard";
  }
}

function NotificationPanel({
  overview,
  router,
}: {
  overview: DashboardOverview | undefined;
  router: ReturnType<typeof useRouter>;
}) {
  if (!overview) return <NotificationPanelSkeleton />;

  const { missing_timelogs, upcoming_leaves, upcoming_events, unseen_certs } =
    overview.notifications;

  const total =
    missing_timelogs.length +
    upcoming_leaves.length +
    upcoming_events.length +
    unseen_certs.length;

  return (
    <div className="overflow-hidden">
      <div className="py-2 border-b border-[var(--color-border)] flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">
          Notifications
        </span>
      </div>

      <div
        className="max-h-[320px] min-h-0 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        <div className="divide-y divide-[var(--color-border)]">
          {/* Missing timelogs */}
        {missing_timelogs.length > 0 && (
          <div className="py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] py-1">
              Missing Timelogs
            </p>
            {missing_timelogs.map((t) => (
              <NotifItem
                key={t.date}
                icon={<Clock size={14} />}
                label={`Missing ${t.missing === "time_out" ? "Time-Out" : "Time-In"}`}
                sub={formatShortDate(t.date)}
                onClick={() => router.push(getNotificationRoute("missing_timelogs"))}
              />
            ))}
          </div>
        )}

        {/* Upcoming leaves */}
        {upcoming_leaves.length > 0 && (
          <div className="py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] py-1">
              Upcoming Leaves
            </p>
            {upcoming_leaves.map((lv) => (
              <NotifItem
                key={lv.id}
                icon={<CalendarDays size={14} />}
                label={lv.leave_type_name}
                sub={`${formatShortDate(lv.date_start)}${
                  lv.date_start !== lv.date_end
                    ? ` – ${formatShortDate(lv.date_end)}`
                    : ""
                } · ${lv.status_display}`}
                onClick={() => router.push(getNotificationRoute("upcoming_leaves"))}
              />
            ))}
          </div>
        )}

        {/* Upcoming events */}
        {upcoming_events.length > 0 && (
          <div className="py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] py-1">
              Upcoming Events
            </p>
            {upcoming_events.map((ev) => (
              <NotifItem
                key={ev.id}
                icon={<CalendarDays size={14} />}
                label={ev.title}
                sub={`${formatShortDate(ev.date)} · ${ev.event_type_display}`}
                onClick={() => router.push(getNotificationRoute("upcoming_events"))}
              />
            ))}
          </div>
        )}

        {/* Unseen certificates */}
        {unseen_certs.length > 0 && (
          <div className="py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] py-1">
              New Certificates
            </p>
            {unseen_certs.map((cert) => (
              <NotifItem
                key={cert.id}
                icon={<Award size={14} />}
                label={cert.title}
                sub={cert.category_name}
                onClick={() => router.push(getNotificationRoute("unseen_certs"))}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {total === 0 && (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <CheckCircle2
              size={28}
              className="text-emerald-500 mb-2"
            />
            <p className="text-xs font-medium text-[var(--color-text-secondary)]">
              You&apos;re all caught up
            </p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
              No pending items right now.
            </p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function normalizeMemoText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function getMemoPreview(text: string, length = 50) {
  const normalized = normalizeMemoText(text);
  if (normalized.length <= length) return normalized;
  return `${normalized.slice(0, length).trim()}…`;
}

function GridPattern({
  width = 40,
  height = 40,
  x = -1,
  y = -1,
  strokeDasharray = "0",
  squares,
  className,
  ...props
}: {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  squares?: Array<[number, number]>;
  strokeDasharray?: string;
  className?: string;
  [key: string]: unknown;
}) {
  const id = useId();

  return (
    <svg
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full fill-gray-400/30 stroke-gray-400/30",
        className
      )}
      {...props}
    >
      <defs>
        <pattern
          id={id}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          <path
            d={`M.5 ${height}V.5H${width}`}
            fill="none"
            strokeDasharray={strokeDasharray}
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${id})`} />
      {squares && (
        <svg x={x} y={y} className="overflow-visible">
          {squares.map(([x, y]) => (
            <rect
              strokeWidth="0"
              key={`${x}-${y}`}
              width={width - 1}
              height={height - 1}
              x={x * width + 1}
              y={y * height + 1}
            />
          ))}
        </svg>
      )}
    </svg>
  );
}

function MemoMeasureCard({ memo }: { memo: MemoAdvertisementData }) {
  return (
    <div className="rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-4 py-6 w-full">
      <div className="flex flex-col gap-3">
        <p className="text-md font-bold leading-snug text-[var(--color-text-primary)]">{memo.title}</p>
        <p className="text-[12px] leading-6 text-[var(--color-text-secondary)] whitespace-pre-wrap break-words">{memo.description}</p>
      </div>
    </div>
  );
}

function MemoCard({
  memo,
  index,
  onVisible,
  onCardClick,
  setCardRef,
}: {
  memo: MemoAdvertisementData;
  index: number;
  onVisible: (index: number) => void;
  onCardClick?: () => void;
  setCardRef?: (node: HTMLButtonElement | null) => void;
}) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const [entered, setEntered] = useState(index < 2);
  const description = memo.description;

  useEffect(() => {
    if (entered || index < 2) {
      if (index === 0) onVisible(index);
      return;
    }
    const element = cardRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setEntered(true);
          onVisible(index);
          observer.disconnect();
        }
      },
      { threshold: 0.45 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [entered, index, onVisible]);

  const isBlurred = index >= 2 && !entered;

  return (
    <button
      type="button"
      ref={(node) => {
        cardRef.current = node;
        if (setCardRef) setCardRef(node);
      }}
      onClick={onCardClick}
      className="relative w-full min-w-full max-w-full h-full flex-shrink-0 snap-center overflow-hidden rounded-lg bg-[var(--color-bg-elevated)] px-4 py-6 transition duration-200 cursor-pointer border border-[var(--color-border)]"
      style={{
        filter: isBlurred ? "blur(5px)" : "none",
        WebkitBackdropFilter: isBlurred ? "blur(5px)" : "none",
        backdropFilter: isBlurred ? "blur(5px)" : "none",
      }}
    >
      <GridPattern width={40} height={40} strokeDasharray="1 7" />
      <div className="relative z-10 flex flex-col gap-3">
        <div>
          <div className="text-md font-bold text-[var(--color-text-primary)] leading-snug">
            {entered ? (
              <TextRotate
                texts={[memo.title]}
                splitBy="characters"
                auto={false}
                mainClassName="text-md font-bold leading-snug"
              />
            ) : (
              <p className="text-md font-bold leading-snug">{memo.title}</p>
            )}
          </div>
        </div>

        <div className="text-[12px] leading-6 text-[var(--color-text-secondary)] whitespace-pre-wrap break-words">
          {entered ? (
            <TextRotate
              texts={[description]}
              splitBy="words"
              staggerDuration={0.03}
              staggerFrom="first"
              auto={false}
              mainClassName="block"
            />
          ) : (
            <p>{description}</p>
          )}
        </div>

        <div className="pointer-events-none absolute -right-20 -top-15 opacity-15">
          <span style={{ color: "#8CC0EB" }}><Boxes size={250} /></span>
        </div>

      </div>
    </button>
  );
}

function MemoAdvertisementPanel({
  memos,
  isLoading,
}: {
  memos: MemoAdvertisementData[];
  isLoading: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [direction, setDirection] = useState(0);
  // Start with a reasonable default; updated after off-screen measurement
  const [containerHeight, setContainerHeight] = useState(220);
  const measureRef = useRef<HTMLDivElement>(null);

  // Measure every card at natural height, use the tallest as the uniform height
  useEffect(() => {
    if (!measureRef.current || memos.length === 0) return;
    const cards = Array.from(measureRef.current.children) as HTMLElement[];
    const maxH = Math.max(...cards.map((el) => el.offsetHeight));
    // +16 accounts for p-2 (8px top + 8px bottom) on the motion wrapper
    if (maxH > 0) setContainerHeight(maxH + 16);
  }, [memos]);

  // Auto-advance every 60 seconds
  useEffect(() => {
    if (memos.length <= 1 || isPaused) return;
    const interval = window.setInterval(() => {
      setDirection(1);
      setActiveIndex((current) => (current + 1) % memos.length);
    }, 60000);
    return () => window.clearInterval(interval);
  }, [memos.length, isPaused]);

  const handleDotClick = (index: number) => {
    setDirection(index > activeIndex ? 1 : -1);
    setActiveIndex(index);
  };

  return (
    <div className="mb-4 relative">
      {/* Off-screen stack — invisible, no pointer events, used only to measure natural card heights */}
      {memos.length > 0 && !isLoading && (
        <div
          ref={measureRef}
          className="absolute inset-x-2 top-0 invisible pointer-events-none"
          aria-hidden="true"
        >
          {memos.map((memo) => (
            <MemoMeasureCard key={memo.id} memo={memo} />
          ))}
        </div>
      )}

      <div
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        className="flex flex-col items-stretch w-full"
      >
        {isLoading ? (
          <div className="w-full h-[220px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] animate-pulse" />
        ) : memos.length === 0 ? (
          <div className="w-full rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 text-center text-sm text-[var(--color-text-muted)]">
            <div className="grid grid-cols-3 gap-4 justify-items-center mb-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] shadow-sm">
                <Megaphone size={24} />
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] shadow-sm">
                <Gift size={24} />
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] shadow-sm">
                <CalendarDays size={24} />
              </div>
            </div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              No active memo ads currently.
            </p>
            <p className="mt-2 text-[10px] text-[var(--color-text-muted)]">
              Active memo cards will appear here once available.
            </p>
          </div>
        ) : (
          // Fixed height container — required so absolute cards clip cleanly during sync slide
          <div className="relative w-full overflow-hidden" style={{ height: containerHeight }}>
            <AnimatePresence initial={false} custom={direction} mode="sync">
              <motion.div
                key={memos[activeIndex].id}
                custom={direction}
                initial={{ x: direction > 0 ? "100%" : "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: direction > 0 ? "-100%" : "100%" }}
                transition={{ duration: 0.42, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="absolute inset-0 pb-2"
              >
                <MemoCard
                  memo={memos[activeIndex]}
                  index={activeIndex}
                  onVisible={() => {}}
                  onCardClick={() => setIsPaused(true)}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>

      {memos.length > 1 && (
        <div className="mt-1 flex items-center justify-center gap-2">
          {memos.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleDotClick(index)}
              aria-label={`Show memo ${index + 1}`}
              className={`h-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-[#2845D6] ${
                index === activeIndex ? "w-6 bg-[#2845D6]" : "w-2 bg-[var(--color-border)]"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationPanelSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 space-y-3 animate-pulse">
      <div className="h-4 w-24 rounded bg-[var(--color-border)]" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-6 h-6 rounded bg-[var(--color-border)] shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 rounded bg-[var(--color-border)]" />
            <div className="h-2.5 w-20 rounded bg-[var(--color-border)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function BirthdayPanel({ overview }: { overview: DashboardOverview | undefined }) {
  if (!overview) return <BirthdayPanelSkeleton />;

  const birthdaysToday = overview.birthdays_today;

  if (birthdaysToday.length === 0) return null;

  return (
    <div className="overflow-hidden">
      <div className="py-2 border-b border-[var(--color-border)] flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">
          Birthdays
        </span>
      </div>

      <div>
        {birthdaysToday.map((person) => (
          <div key={person.id} className="py-3">
            <div className="flex items-center gap-3">
              <span className="shrink-0 text-[#2845D6]">
                <Gift size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-normal leading-snug text-[var(--color-text-primary)]">
                  <span className="font-normal">{person.name}</span>
                  {"'s birthday is today."}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BirthdayPanelSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 space-y-3 animate-pulse">
      <div className="h-4 w-20 rounded bg-[var(--color-border)]" />
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-5 w-5 rounded bg-[var(--color-border)] shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-full rounded bg-[var(--color-border)]" />
            <div className="h-3 w-2/3 rounded bg-[var(--color-border)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── ApproverDashboard (full-page) ────────────────────────────────────────────

function TrendBadge({
  current,
  previous,
  betterWhenLower = false,
}: {
  current: number;
  previous: number | null | undefined;
  betterWhenLower?: boolean;
}) {
  if (previous === null || previous === undefined) return null;
  if (current === previous)
    return <span className="text-[10px] text-[var(--color-text-muted)]">—</span>;
  const isUp = current > previous;
  const isGood = betterWhenLower ? !isUp : isUp;
  const Icon = isUp ? ArrowUpRight : ArrowDownRight;
  const pct =
    previous > 0
      ? Math.round((Math.abs(current - previous) / previous) * 100)
      : 100;
  return (
    <span
      className={`flex items-center gap-0.5 text-[10px] font-medium ${
        isGood ? "text-emerald-500" : "text-red-500"
      }`}
    >
      <Icon size={12} />
      {pct}%
    </span>
  );
}

function ApproverDashboardSkeleton() {
  return (
    <div className="h-full w-full space-y-6 animate-pulse p-6">
      <div className="grid grid-cols-3 gap-4 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] overflow-hidden"
          >
            <div className="p-4 pb-0">
              <div className="h-3 w-16 rounded bg-[var(--color-border)] mb-3" />
              <div className="h-7 w-10 rounded bg-[var(--color-border)]" />
            </div>
            <div className="h-14 bg-[var(--color-border)] opacity-30 mt-2" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] h-52" />
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] h-52" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] h-44"
          />
        ))}
      </div>
    </div>
  );
}

function ApproverDashboard({
  data,
}: {
  data: ApproverOverview | undefined;
  subordinates?: ApproverOverview["subordinates"];
}) {
  if (!data) return <ApproverDashboardSkeleton />;

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (data.is_empty) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-8 px-8 py-16">
        <div className="flex items-end gap-8">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
              <Users size={28} className="text-[var(--color-text-muted)]" />
            </div>
            <span className="text-xs text-[var(--color-text-muted)]">No team</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
              <CalendarDays size={34} className="text-[var(--color-text-muted)]" />
            </div>
            <span className="text-xs text-[var(--color-text-muted)]">No schedule</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
              <ClipboardList size={28} className="text-[var(--color-text-muted)]" />
            </div>
            <span className="text-xs text-[var(--color-text-muted)]">No activity</span>
          </div>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-[var(--color-text-secondary)]">
            No direct reports assigned
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Your team overview will appear here once subordinates are linked to
            your account.
          </p>
        </div>
      </div>
    );
  }

  const {
    summary,
    timelog_anomalies,
    pending_leaves,
    upcoming_leaves,
    evaluation,
    open_tickets,
    timelog_chart,
    leave_chart,
    pending_leave_chart,
    mis_chart,
  } = data;

  // ── Stats10-style card definitions ─────────────────────────────────────────
  const statDefs = [
    {
      label: "Direct Reports",
      sub: "active employees",
      value: summary.total_subordinates,
      prev: null as number | null,
      betterWhenLower: false,
      trendKey: "total_subordinates" as const,
    },
    {
      label: "Pending Approvals",
      sub: "leave requests",
      value: summary.pending_leave_approvals.current,
      prev: null as number | null,
      betterWhenLower: true,
      trendKey: "pending_leave_approvals" as const,
    },
    {
      label: "Lacking Timelogs",
      sub: "this week",
      value: summary.lacking_timelogs.current,
      prev: null as number | null,
      betterWhenLower: true,
      trendKey: "lacking_timelogs" as const,
    },
    {
      label: "Evals Submitted",
      sub: "this month",
      value: summary.evaluations_submitted.current,
      prev: summary.evaluations_submitted.previous,
      betterWhenLower: false,
      trendKey: "evaluations_submitted" as const,
    },
    {
      label: "Trainings Done",
      sub: "this month",
      value: summary.trainings_completed.current,
      prev: summary.trainings_completed.previous,
      betterWhenLower: false,
      trendKey: "trainings_completed" as const,
    },
    {
      label: "Certs Issued",
      sub: "this month",
      value: summary.certs_issued.current,
      prev: summary.certs_issued.previous,
      betterWhenLower: false,
      trendKey: "certs_issued" as const,
    },
  ];

  // ── Leave comparison chart data ─────────────────────────────────────────────
  const leaveChartData = (leave_chart?.weeks ?? ["Wk 1"]).map((week, i) => ({
    week,
    "This Month": leave_chart?.current_month[i] ?? 0,
    "Last Month": leave_chart?.previous_month[i] ?? 0,
  }));

  // ── Evaluation pie data ─────────────────────────────────────────────────────
  const evaluationPieData = evaluation
    ? [
        {
          key: "submitted",
          label: "Submitted",
          count: evaluation.submitted_count,
          fill: "#10B981",
        },
        {
          key: "pending",
          label: "Pending",
          count: Math.max(evaluation.total_count - evaluation.submitted_count, 0),
          fill: "#F59E0B",
        },
      ].filter((item) => item.count > 0)
    : [];
  const evaluationChartConfig = (evaluationPieData.reduce<ChartConfig>(
    (config, item) => {
      config[item.key] = {
        label: item.label,
        color: item.fill,
      };
      return config;
    },
    {},
  ));

  // ── Two-part widget chart data ──────────────────────────────────────────────
  const timelogChartData = (timelog_chart?.days ?? []).map((day, i) => ({
    day,
    "Last Week": timelog_chart?.last_week[i] ?? 0,
    "This Week": timelog_chart?.current_week[i] ?? 0,
  }));
  const pendingChartData = (pending_leave_chart?.months ?? []).map((month, i) => ({
    month,
    "This Month": pending_leave_chart?.current_month[i] ?? 0,
    "Last Month": pending_leave_chart?.previous_month[i] ?? 0,
  }));
  const misChartData = (mis_chart?.months ?? []).map((month, i) => ({
    month,
    "This Month": mis_chart?.current_month[i] ?? 0,
    "Last Month": mis_chart?.previous_month[i] ?? 0,
  }));

  const allClear =
    timelog_anomalies.length === 0 &&
    pending_leaves.length === 0 &&
    open_tickets.length === 0;

  const tooltipStyle = {
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    fontSize: 11,
    color: "var(--color-text-primary)",
  };
  const axisTickProps = { fontSize: 10, fill: "var(--color-text-muted)" } as const;

  return (
    <div className="w-full space-y-5 px-1 pb-6">
      {/* ── Row 1: Stats10-style stat cards ────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        {statDefs.map((card) => {
          const delta = card.prev !== null ? card.value - card.prev : null;
          const isGood =
            delta === null
              ? null
              : card.betterWhenLower
              ? delta <= 0
              : delta >= 0;
          const valueColor =
            isGood === null
              ? "text-[var(--color-text-primary)]"
              : isGood
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400";
          const areaColor =
            isGood === null ? "#2845D6" : isGood ? "#16a34a" : "#dc2626";
          const sparkData = summary.trends.weeks.map((week, index) => ({
            week,
            value: summary.trends[card.trendKey][index] ?? 0,
          }));
          const gradId = card.label.replace(/\s+/g, "-").toLowerCase();
          const pct =
            card.prev !== null && card.prev > 0
              ? Math.round((Math.abs(delta!) / card.prev) * 100)
              : card.prev === 0 && card.value > 0
              ? 100
              : null;

          return (
            <div
              key={card.label}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] overflow-hidden"
            >
              <div className="p-4 pb-0">
                <dt className="text-[10px] font-medium text-[var(--color-text-muted)] truncate">
                  {card.label}
                  <span className="ml-1 opacity-70">{card.sub}</span>
                </dt>
                <div className="flex items-baseline justify-between mt-1 gap-1">
                  <dd className={`text-2xl font-bold leading-none ${valueColor}`}>
                    {card.value}
                  </dd>
                  {delta !== null && (
                    <dd className={`flex items-center gap-0.5 text-[9px] ${valueColor} shrink-0`}>
                      {delta >= 0 ? (
                        <ArrowUpRight size={10} />
                      ) : (
                        <ArrowDownRight size={10} />
                      )}
                      {Math.abs(delta)}
                      {pct !== null && <span className="opacity-70">({pct}%)</span>}
                    </dd>
                  )}
                </div>
              </div>
              <div className="h-14 mt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={sparkData}
                    margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                  >
                    <XAxis dataKey="week" hide />
                    <defs>
                      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={areaColor} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={areaColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      dataKey="value"
                      stroke={areaColor}
                      fill={`url(#${gradId})`}
                      strokeWidth={1.5}
                      type="monotone"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Row 2: Leave comparison chart + Evaluation pie ─────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-stretch">
        {/* Monthly Leave Requests */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 flex h-full flex-col">
          <div className="mb-4">
            <div>
              <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                Monthly Leave Requests
              </p>
              <p className="text-[10px] text-[var(--color-text-muted)]">
                Subordinate leaves by week — current vs previous month
              </p>
            </div>
          </div>
          <div className="min-h-[240px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leaveChartData} barCategoryGap="30%" barGap={3}>
                <XAxis
                  dataKey="week"
                  tick={axisTickProps}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={axisTickProps}
                  axisLine={false}
                  tickLine={false}
                  width={20}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "var(--color-border)", opacity: 0.4 }}
                />
                <Bar dataKey="Last Month" radius={[3, 3, 0, 0]} fill="var(--color-border)" />
                <Bar dataKey="This Month" radius={[3, 3, 0, 0]} fill="#2845D6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Evaluation pie / donut */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 flex h-full flex-col">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-semibold text-[var(--color-text-primary)]">
              Evaluation Period
            </p>
          </div>
          {evaluation ? (
            <>
              <p className="text-[10px] text-[var(--color-text-muted)] mb-3 leading-snug">
                {evaluation.period_title} · {evaluation.days_remaining}d remaining
              </p>
              <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="flex min-h-[280px] flex-col bg-[var(--color-bg-elevated)] p-3">
                  <div className="h-[170px]">
                    <ChartContainer
                      config={evaluationChartConfig}
                      className="mx-auto h-full w-full max-w-[220px]"
                    >
                      <PieChart>
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              hideLabel
                              nameKey="key"
                              className="rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-xs"
                              formatter={(value, _name, item) => {
                                const label =
                                  typeof item.payload?.label === "string"
                                    ? item.payload.label
                                    : "";
                                const count = Number(value);
                                const percentage = evaluation.total_count
                                  ? Math.round((count / evaluation.total_count) * 100)
                                  : 0;
                                return (
                                  <>
                                    <span className="text-[10px] text-[var(--color-text-muted)]">{label}</span>
                                    <span className="text-[10px] font-medium text-[var(--color-text-primary)]">
                                      {count} ({percentage}%)
                                    </span>
                                  </>
                                );
                              }}
                            />
                          }
                        />
                        <Pie
                          data={evaluationPieData}
                          dataKey="count"
                          nameKey="key"
                          innerRadius={46}
                          outerRadius={74}
                          strokeWidth={4}
                        >
                          <Label
                            content={({ viewBox }) => {
                              if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) {
                                return null;
                              }
                              return (
                                <text
                                  x={viewBox.cx}
                                  y={viewBox.cy}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                >
                                  <tspan
                                    x={viewBox.cx}
                                    y={viewBox.cy - 4}
                                    className="fill-[var(--color-text-primary)] text-sm font-semibold"
                                  >
                                    {evaluation.total_count}
                                  </tspan>
                                  <tspan
                                    x={viewBox.cx}
                                    y={viewBox.cy + 14}
                                    className="fill-[var(--color-text-muted)] text-[10px]"
                                  >
                                    Team Users
                                  </tspan>
                                </text>
                              );
                            }}
                          />
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 pt-3">
                    {evaluationPieData.map((item) => (
                      <div
                        key={item.key}
                        className="bg-[var(--color-bg-elevated)] px-2 py-1.5"
                        style={{ borderColor: item.fill }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: item.fill }}
                          />
                          <span
                            className="truncate text-[9px] font-medium"
                            style={{ color: item.fill }}
                          >
                            {item.label}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 min-h-[280px]">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--color-text-primary)]">
                        Not Yet Self-Evaluated
                      </p>
                      <p className="text-[10px] text-[var(--color-text-muted)]">
                        Employees still in pending submission state
                      </p>
                    </div>
                    {/* <span className="rounded-full bg-[var(--color-bg-elevated)] px-2 py-1 text-[10px] font-medium text-[var(--color-text-secondary)]">
                      {evaluation.not_submitted.length}
                    </span> */}
                  </div>
                  <div className="max-h-[226px] overflow-y-auto divide-y divide-[var(--color-border)] pr-1" style={{ scrollbarWidth: "none" }}>
                    {evaluation.not_submitted.length > 0 ? (
                      evaluation.not_submitted.map((ns) => (
                        <div key={ns.employee_id} className="flex items-center gap-2 py-2">
                          <div className="flex h-8 w-8 items-center justify-center bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]">
                            <User size={14} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-medium text-[var(--color-text-primary)]">
                              {ns.employee_name}
                            </p>
                            <p className="text-[9px] text-[var(--color-text-muted)]">
                              Waiting for self-evaluation
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex h-[210px] flex-col items-center justify-center text-center">
                        <CheckCircle2 size={20} className="mb-2 text-emerald-500" />
                        <p className="text-[11px] font-medium text-[var(--color-text-primary)]">
                          Everyone has started
                        </p>
                        <p className="text-[10px] text-[var(--color-text-muted)]">
                          No pending self-evaluations in this period.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-40 flex-col items-center justify-center">
              <ClipboardList size={24} className="text-[var(--color-text-muted)] mb-2" />
              <p className="text-xs text-[var(--color-text-muted)]">
                No active evaluation period
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 3: Three two-part widgets ──────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Lacking Timelogs */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
          <div className="flex items-center gap-2 mb-3">
            {/* <Clock size={14} className="text-amber-500" /> */}
            <p className="text-xs font-semibold text-[var(--color-text-primary)]">
              Lacking Timelogs
            </p>
            {timelog_anomalies.length > 0 && (
              <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                {timelog_anomalies.length}
              </span>
            )}
          </div>
          <div className="flex gap-3" style={{ height: 168 }}>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timelogChartData} barCategoryGap="30%" barGap={2}>
                  <XAxis
                    dataKey="day"
                    tick={axisTickProps}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={axisTickProps}
                    axisLine={false}
                    tickLine={false}
                    width={16}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: "var(--color-border)", opacity: 0.4 }}
                  />
                  <Bar dataKey="Last Week" radius={[2, 2, 0, 0]} fill="var(--color-border)" />
                  <Bar dataKey="This Week" radius={[2, 2, 0, 0]} fill="#F59E0B" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div
              className="w-2/5 overflow-y-auto divide-y divide-[var(--color-border)]"
              style={{ scrollbarWidth: "none" }}
            >
              {timelog_anomalies.length > 0 ? (
                timelog_anomalies.map((emp) => (
                  <div key={emp.employee_id} className="py-2">
                    <p className="text-[11px] font-medium text-[var(--color-text-primary)] truncate">
                      {emp.employee_name}
                    </p>
                    {emp.anomalies.map((a) => (
                      <p
                        key={a.date}
                        className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5"
                      >
                        {formatShortDate(a.date)} —{" "}
                        {a.missing === "time_out" ? "No out" : "No in"}
                      </p>
                    ))}
                  </div>
                ))
              ) : (
                <div className="flex h-full flex-col items-center justify-center">
                  <CheckCircle2 size={18} className="text-emerald-500 mb-1" />
                  <p className="text-[10px] text-[var(--color-text-muted)] text-center">
                    All timelogs complete
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Awaiting Approval */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
          <div className="flex items-center gap-2 mb-3">
            {/* <CalendarDays size={14} className="text-[#2845D6]" /> */}
            <p className="text-xs font-semibold text-[var(--color-text-primary)]">
              Awaiting Approval
            </p>
            {pending_leaves.length > 0 && (
              <span className="ml-auto rounded-full bg-[#2845D6]/15 px-2 py-0.5 text-[9px] font-semibold text-[#2845D6]">
                {pending_leaves.length}
              </span>
            )}
          </div>
          <div className="flex gap-3" style={{ height: 168 }}>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pendingChartData} barCategoryGap="30%" barGap={2}>
                  <XAxis
                    dataKey="month"
                    tick={axisTickProps}
                    axisLine={false}
                    tickLine={false}
                    hide
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={axisTickProps}
                    axisLine={false}
                    tickLine={false}
                    width={16}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: "var(--color-border)", opacity: 0.4 }}
                    labelFormatter={(label) => String(label)}
                  />
                  <Bar dataKey="Last Month" radius={[2, 2, 0, 0]} fill="var(--color-border)" />
                  <Bar dataKey="This Month" radius={[2, 2, 0, 0]} fill="#2845D6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div
              className="w-2/5 overflow-y-auto divide-y divide-[var(--color-border)]"
              style={{ scrollbarWidth: "none" }}
            >
              {pending_leaves.length > 0 ? (
                pending_leaves.map((lr) => (
                  <div key={lr.id} className="py-2">
                    <p className="text-[11px] font-medium text-[var(--color-text-primary)] truncate">
                      {lr.employee_name}
                    </p>
                    <p className="text-[9px] text-[var(--color-text-muted)]">
                      {lr.leave_type}
                    </p>
                    <p className="text-[9px] text-[var(--color-text-muted)]">
                      {formatShortDate(lr.date_start)}
                      {lr.date_start !== lr.date_end
                        ? ` – ${formatShortDate(lr.date_end)}`
                        : ""}
                    </p>
                    {lr.days_pending !== null && lr.days_pending !== undefined && (
                      <p className="text-[9px] text-amber-600 dark:text-amber-400">
                        {lr.days_pending}d pending
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex h-full flex-col items-center justify-center">
                  <CheckCircle2 size={18} className="text-emerald-500 mb-1" />
                  <p className="text-[10px] text-[var(--color-text-muted)] text-center">
                    No pending requests
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Open MIS Tickets */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
          <div className="flex items-center gap-2 mb-3">
            {/* <AlertCircle size={14} className="text-red-500" /> */}
            <p className="text-xs font-semibold text-[var(--color-text-primary)]">
              Open MIS Tickets
            </p>
            {open_tickets.length > 0 && (
              <span className="ml-auto rounded-full bg-red-500/15 px-2 py-0.5 text-[9px] font-semibold text-red-600 dark:text-red-400">
                {open_tickets.length}
              </span>
            )}
          </div>
          <div className="flex gap-3" style={{ height: 168 }}>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={misChartData} barCategoryGap="30%" barGap={2}>
                  <XAxis
                    dataKey="month"
                    tick={axisTickProps}
                    axisLine={false}
                    tickLine={false}
                    hide
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={axisTickProps}
                    axisLine={false}
                    tickLine={false}
                    width={16}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: "var(--color-border)", opacity: 0.4 }}
                    labelFormatter={(label) => String(label)}
                  />
                  <Bar dataKey="Last Month" radius={[2, 2, 0, 0]} fill="var(--color-border)" />
                  <Bar dataKey="This Month" radius={[2, 2, 0, 0]} fill="#EF4444" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div
              className="w-2/5 overflow-y-auto divide-y divide-[var(--color-border)]"
              style={{ scrollbarWidth: "none" }}
            >
              {open_tickets.length > 0 ? (
                open_tickets.map((t) => (
                  <div key={t.id} className="py-2">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-[11px] font-medium text-[var(--color-text-primary)] truncate">
                        {t.employee_name}
                      </p>
                      <span className="text-[9px] text-[var(--color-text-muted)] shrink-0">
                        #{t.ticket_number}
                      </span>
                    </div>
                    <p className="text-[9px] text-[var(--color-text-muted)] truncate">
                      {t.category}
                    </p>
                    {t.days_open !== null && (
                      <p className="text-[9px] text-red-600 dark:text-red-400">
                        {t.days_open}d open
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex h-full flex-col items-center justify-center">
                  <CheckCircle2 size={18} className="text-emerald-500 mb-1" />
                  <p className="text-[10px] text-[var(--color-text-muted)] text-center">
                    No open tickets
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Upcoming leaves ─────────────────────────────────────────────────── */}
      {upcoming_leaves.length > 0 && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
          <div className="flex items-center gap-2 mb-3">
            {/* <CalendarDays size={14} className="text-emerald-500" /> */}
            <p className="text-xs font-semibold text-[var(--color-text-primary)]">
              Upcoming Leaves
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {upcoming_leaves.map((lr) => (
              <div
                key={lr.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-[var(--color-text-primary)]">
                      {lr.employee_name}
                    </p>
                    <p className="truncate text-[10px] text-[var(--color-text-muted)]">
                      {lr.department_name ?? "—"}
                      ({lr.line_name ?? "—"})
                    </p>
                  </div>
                  {/* <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    {lr.days_count}d
                  </span> */}
                  <p className="mt-2 text-[10px] text-emerald-600 dark:text-emerald-400">
                    {formatShortDate(lr.date_start)}
                    {lr.date_start !== lr.date_end
                      ? ` – ${formatShortDate(lr.date_end)}`
                      : ""}
                  </p>
                </div>
                <p className="text-[11px] font-medium text-[var(--color-text-primary)]">
                  {lr.leave_type}
                </p>
                <p className="truncate text-[10px] text-[var(--color-text-muted)]">
                  {lr.leave_category || "—"}-{lr.leave_reason || "—"}
                </p>
                {/* <p className="mt-2 text-[10px] text-emerald-600 dark:text-emerald-400">
                  {formatShortDate(lr.date_start)}
                  {lr.date_start !== lr.date_end
                    ? ` – ${formatShortDate(lr.date_end)}`
                    : ""}
                </p> */}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── All clear banner ────────────────────────────────────────────────── */}
      {/* {allClear && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4">
          <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              All clear
            </p>
            <p className="text-[11px] text-emerald-600/70 dark:text-emerald-500/70">
              No timelog issues, pending approvals, or open tickets for your team.
            </p>
          </div>
        </div>
      )} */}
    </div>
  );
}

// ── AnnouncementFeed ──────────────────────────────────────────────────────────

function AnnouncementFeed({ user }: { user: UserData }) {
  const [page, setPage] = useState(1);
  const [allPosts, setAllPosts] = useState<AnnouncementListItem[]>([]);

  const { data, isFetching } = useAnnouncements({ page, tab: "published" });

  useEffect(() => {
    if (!data?.results) return;
    setAllPosts((prev) =>
      page === 1 ? data.results : [...prev, ...data.results]
    );
  }, [data, page]);

  const currentUser = {
    id: user.id,
    admin: user.admin,
    hr: user.hr,
    accounting: user.accounting,
    avatar: user.avatar,
    name:
      [user.firstname, user.lastname].filter(Boolean).join(" ") || user.email,
  };

  const hasMore = data ? page < data.total_pages : false;

  return (
    <div className="w-full h-full p-4 space-y-4 lg:mx-auto lg:w-4/5">
      {/* <div className="flex items-center gap-2">
        <Megaphone size={16} className="text-[#2845D6]" />
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Announcements
        </h2>
      </div> */}

      {/* Initial load skeleton */}
      {isFetching && allPosts.length === 0 && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isFetching && allPosts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Megaphone size={36} className="text-[var(--color-text-muted)] mb-3" />
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">
            No announcements yet
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Check back later for updates.
          </p>
        </div>
      )}

      {/* Posts */}
      {allPosts.length > 0 && (
        <div className="space-y-4">
          {allPosts.map((ann) => (
            <PostCard
              key={ann.id}
              announcement={ann}
              currentUser={currentUser}
              isAdminManagePage={false}
            />
          ))}
        </div>
      )}

      {/* Load more / loading more */}
      {allPosts.length > 0 && (
        <div className="flex justify-center pt-2 pb-4">
          {isFetching ? (
            <div className="h-5 w-5 rounded-full border-2 border-[var(--color-border)] border-t-[#2845D6] animate-spin" />
          ) : hasMore ? (
            <button
              onClick={() => setPage((p) => p + 1)}
              className="text-xs text-[#2845D6] hover:underline font-medium"
            >
              Load more
            </button>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">
              You&apos;re up to date
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [authPhase, setAuthPhase] = useState<"spinner" | "checking" | "done">(
    "spinner"
  );
  const [user, setUser] = useState<UserData | null>(null);
  const [dashboardView, setDashboardView] = useState<"personal" | "approver">(
    "personal"
  );
  const resolvedRole = useMemo(
    () => (user ? resolveDashboardRole(user) : null),
    [user]
  );

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(
      () => setAuthPhase((p) => (p === "spinner" ? "checking" : p)),
      350
    );

    const doAuth = async () => {
      try {
        let res = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });

        if (res.status === 401) {
          try {
            const refreshRes = await fetch("/api/auth/token/refresh", {
              method: "POST",
              credentials: "include",
              headers: { "X-CSRFToken": getCsrfToken() },
            });
            if (refreshRes.ok) {
              await new Promise<void>((r) => setTimeout(r, 120));
              res = await fetch("/api/auth/me", {
                credentials: "include",
                cache: "no-store",
              });
            }
          } catch {
            /* ignore refresh errors */
          }
        }

        clearTimeout(timer);
        if (res.status === 401 || !res.ok) {
          router.replace("/");
          return;
        }
        setUser(await res.json());
        setAuthPhase("done");
      } catch {
        clearTimeout(timer);
        router.replace("/");
      }
    };

    doAuth();
    return () => clearTimeout(timer);
  }, [router]);

  useEffect(() => {
    if (authPhase !== "done" || !resolvedRole) return;

    if (resolvedRole === "admin") {
      router.replace("/dashboard/admin");
      return;
    }
    if (resolvedRole === "accounting") {
      router.replace("/dashboard/accounting");
      return;
    }
    if (resolvedRole === "hr") {
      router.replace("/dashboard/hr");
    }
  }, [authPhase, resolvedRole, router]);

  // ── Overview data ───────────────────────────────────────────────────────────
  const { data: overview } = useQuery<DashboardOverview>({
    queryKey: ["dashboard-overview"],
    queryFn: async () => {
      const res = await fetch("/api/user-profile/dashboard-overview", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load overview");
      return res.json();
    },
    enabled: authPhase === "done" && !!user && resolvedRole === "personal",
    staleTime: 60_000,
    refetchInterval: 120_000, // soft real-time: refresh every 2 min
  });

  // ── Approver overview data (lazy — only when user switches to "My Team") ───
  const { data: approverData } = useQuery<ApproverOverview>({
    queryKey: ["approver-overview"],
    queryFn: async () => {
      const res = await fetch("/api/user-profile/approver-overview", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load approver data");
      return res.json();
    },
    enabled:
      authPhase === "done" &&
      !!user &&
      resolvedRole === "personal" &&
      dashboardView === "approver" &&
      !!overview?.is_approver,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: memoAdvertisementSettings, isLoading: memoSettingsLoading } = useQuery<MemoAdvertisementSettingsData>({
    queryKey: ["memo-advertisement-settings"],
    queryFn: async () => {
      const res = await fetch("/api/general-settings/memo-advertisement", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load memo settings");
      return res.json();
    },
    enabled: authPhase === "done" && !!user && resolvedRole === "personal",
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const memoAdvertisementEnabled = memoAdvertisementSettings?.enabled ?? false;

  const { data: memoAdvertisementMemos, isLoading: memoMemosLoading } = useQuery<MemoAdvertisementData[]>({
    queryKey: ["memo-advertisement-memos"],
    queryFn: async () => {
      const res = await fetch("/api/general-settings/memo-advertisement/memos", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load memos");
      return res.json();
    },
    enabled:
      authPhase === "done" &&
      !!user &&
      resolvedRole === "personal" &&
      memoAdvertisementEnabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const activeMemoAdvertisements =
    memoAdvertisementMemos?.filter((memo) => memo.active) ?? [];

  // ── Loading phases ──────────────────────────────────────────────────────────
  if (authPhase === "spinner") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[var(--color-border)] border-t-[#2845D6] animate-spin" />
      </div>
    );
  }

  if (authPhase === "checking") {
    return (
      <div className="flex h-full items-center justify-center">
        <TextShimmer className="text-sm" duration={1.4}>
          Checking permissions…
        </TextShimmer>
      </div>
    );
  }

  if (!user) return null;

  if (resolvedRole && resolvedRole !== "personal") {
    return (
      <div className="flex h-full items-center justify-center">
        <TextShimmer className="text-xs" duration={1.4}>
          {openingText(resolvedRole)}
        </TextShimmer>
      </div>
    );
  }

  const approverToggle = overview?.is_approver ? (
    <div
      role="tablist"
      className="flex w-44 rounded-lg bg-[var(--color-bg-card)] p-0.5 gap-0.5"
    >
      {(["personal", "approver"] as const).map((view) => (
        <button
          key={view}
          role="tab"
          aria-selected={dashboardView === view}
          tabIndex={0}
          onClick={() => setDashboardView(view)}
          className="relative flex-1 rounded-md px-2 py-1.5 text-[10px] font-medium focus:outline-none"
        >
          {dashboardView === view && (
            <motion.div
              layoutId="dash-view-pill"
              className="absolute inset-0 rounded-md bg-[#2845D6]"
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
          <span
            className={`relative z-10 ${
              dashboardView === view
                ? "text-white"
                : "text-[var(--color-text-muted)]"
            }`}
          >
            {view === "personal" ? "Personal" : "My Team"}
          </span>
        </button>
      ))}
    </div>
  ) : null;

  // ── Full layout ─────────────────────────────────────────────────────────────
  return (
    <div className="flex w-full flex-col overflow-hidden p-4 lg:mx-auto lg:max-w-full lg:gap-2 h-full min-h-0">
      {/* ── Main area — switches between personal 3-col and full approver view ── */}
      <AnimatePresence mode="wait">
        {dashboardView === "approver" && overview?.is_approver ? (
          /* ── Approver full-page view ── */
          <motion.div
            key="approver-view"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex flex-1 flex-col overflow-hidden h-full min-h-0"
          >
            <div className="mb-3 flex shrink-0 items-start justify-end gap-3">
              {approverToggle}
            </div>
            <div className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: "none" }}>
              <ApproverDashboard data={approverData} />
            </div>
          </motion.div>
        ) : (
          /* ── Personal 3-column view ── */
          <motion.div
            key="personal-view"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex flex-1 flex-col overflow-hidden lg:flex-row lg:gap-4 h-full min-h-0"
            style={{ minHeight: "calc(100vh - var(--header-height) - 2rem)" }}
          >
            {/* Left column */}
            <div className="hidden lg:flex lg:flex-col lg:basis-[20%] lg:shrink-0 lg:h-full min-h-0">
              <div className="flex-1 h-full min-h-0 space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
                {overview ? (
                  <ProfileWidget user={user} overview={overview} router={router} />
                ) : (
                  <ProfileWidgetSkeleton />
                )}
                {overview ? (
                  <MiniCalendar overview={overview} />
                ) : (
                  <MiniCalendarSkeleton />
                )}
                <NotificationPanel overview={overview} router={router} />
              </div>
            </div>

            {/* Center column */}
            <div className="flex flex-col flex-1 lg:basis-[60%] lg:h-full min-h-0 overflow-hidden">
              <div className="flex-1 h-full overflow-y-auto w-full min-h-0" style={{ scrollbarWidth: "none" }}>
                <AnnouncementFeed user={user} />
              </div>
            </div>

            {/* Right column */}
            <div className="hidden lg:flex lg:flex-col lg:basis-[20%] lg:shrink-0 lg:h-full min-h-0">
              <div className="flex h-full min-h-0 flex-col overflow-hidden">
                <div className="mb-4 flex shrink-0 items-center justify-end px-4">
                  {approverToggle && <div className="mb-3">{approverToggle}</div>}
                </div>
                <div
                  className="flex-1 min-h-0 overflow-y-auto px-4"
                  style={{ scrollbarWidth: "none" }}
                >
                  {memoAdvertisementEnabled && (
                    <MemoAdvertisementPanel
                      memos={activeMemoAdvertisements}
                      isLoading={memoSettingsLoading || memoMemosLoading}
                    />
                  )}
                  <BirthdayPanel overview={overview} />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

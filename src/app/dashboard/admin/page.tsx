"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Lock,
  ShieldAlert,
  UserCog,
  Users,
} from "lucide-react";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { StatusPill } from "@/components/ui/status-pill";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/pie-chart";
import { AdminTableSection } from "@/components/ui/admin-table-section";
import type { DataTableColumn } from "@/components/ui/data-table";
import { FilterListContent } from "@/components/ui/admin-table-accordion";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { EmptyState } from "@/components/ui/interactive-empty-state";
import { getCsrfToken } from "@/lib/csrf";
import { useDebounce } from "@/hooks/use-debounce";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from "recharts";

type AuthPhase = "spinner" | "checking" | "done";

interface UserData {
  id: number;
  firstname: string | null;
  lastname: string | null;
  admin: boolean;
  hr: boolean;
  accounting: boolean;
}

interface AdminStatValue {
  current: number;
}

interface AdminOverview {
  stats: {
    failed_logins: AdminStatValue;
    locked_accounts: AdminStatValue;
    active_users: AdminStatValue;
    inactive_users: AdminStatValue;
    password_changes: AdminStatValue;
    default_pwd_users: AdminStatValue;
    trends: {
      weeks: string[];
      failed_logins: number[];
      locked_accounts: number[];
      active_users: number[];
      inactive_users: number[];
      password_changes: number[];
      default_pwd_users: number[];
    };
  };
  login_chart: {
    months: string[];
    failed: number[];
    successful: number[];
  };
  lock_chart: {
    months: string[];
    locked: number[];
  };
  password_chart: {
    months: string[];
    changed_password: number[];
    default_password: number[];
    locked_accounts: number[];
  };
  user_pie: {
    active: number;
    inactive: number;
    locked: number;
  };
  admin_users: AdminUser[];
  recent_errors: SystemError[];
}

interface AdminUser {
  id: number;
  idnumber: string;
  full_name: string;
  department: string | null;
  avatar: string | null;
  last_login: string | null;
  locked: boolean;
  active: boolean;
  roles: string[];
}

interface ErrorTriggerUser {
  id: number;
  idnumber: string;
  name: string;
}

interface SystemError {
  id: number;
  timestamp: string;
  error_type: string;
  module: string;
  message: string;
  resolved: boolean;
  triggered_by: ErrorTriggerUser | null;
}

interface SystemErrorsResponse {
  total: number;
  page: number;
  per_page: number;
  results: SystemError[];
  available_modules: string[];
  available_error_types: string[];
}

const PIE_COLORS = ["#16A34A", "#F59E0B", "#DC2626"];

function ScrollableCardList({ children }: { children: React.ReactNode }) {
  const [canUp, setCanUp] = useState(false);
  const [canDown, setCanDown] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const update = () => {
    const node = scrollRef.current;
    if (!node) return;
    setCanUp(node.scrollTop > 2);
    setCanDown(node.scrollTop + node.clientHeight < node.scrollHeight - 2);
  };

  useEffect(() => {
    update();
  }, [children]);

  const scrollByAmount = (delta: number) => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollBy({ top: delta, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={update}
        className="max-h-[320px] space-y-3 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      {canUp && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-8 rounded-t-lg bg-gradient-to-b from-[var(--color-bg-elevated)] to-transparent" />
      )}
      {canDown && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-lg bg-gradient-to-t from-[var(--color-bg-elevated)] to-transparent" />
      )}

      {canUp && (
        <button
          type="button"
          onClick={() => scrollByAmount(-72)}
          className="absolute right-2 top-1 z-10 rounded-full p-1 text-[var(--color-text-muted)] backdrop-blur"
          aria-label="Scroll up"
        >
          <ChevronUp size={12} />
        </button>
      )}
      {canDown && (
        <button
          type="button"
          onClick={() => scrollByAmount(72)}
          className="absolute right-2 bottom-1 z-10 rounded-full p-1 text-[var(--color-text-muted)] backdrop-blur"
          aria-label="Scroll down"
        >
          <ChevronDown size={12} />
        </button>
      )}
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "No login yet";
  const date = new Date(value);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function prettifyErrorType(errorType: string) {
  return errorType.toUpperCase();
}

function StatCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      <div className="space-y-3 p-4 pb-0">
        <div className="h-3 w-24 rounded bg-[var(--color-border)]" />
        <div className="h-8 w-14 rounded bg-[var(--color-border)]" />
      </div>
      <div className="mt-2 h-14 bg-[var(--color-border)]/40" />
    </div>
  );
}

function PanelSkeleton({ className = "h-[320px]" }: { className?: string }) {
  return (
    <div
      className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 animate-pulse ${className}`}
    >
      <div className="mb-4 h-4 w-40 rounded bg-[var(--color-border)]" />
      <div className="h-[calc(100%-2rem)] rounded bg-[var(--color-border)]/40" />
    </div>
  );
}

function AdminDashboardSkeleton() {
  return (
    <div className="w-full space-y-5 px-1 pb-6 animate-pulse">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <StatCardSkeleton key={index} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PanelSkeleton className="h-[360px]" />
        <PanelSkeleton className="h-[360px]" />
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [authPhase, setAuthPhase] = useState<AuthPhase>("spinner");
  const [user, setUser] = useState<UserData | null>(null);
  const [search, setSearch] = useState("");
  const [resolvedFilter, setResolvedFilter] = useState<"all" | "true" | "false">("false");
  const [errorTypeFilter, setErrorTypeFilter] = useState<string>("all");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<string>("timestamp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [confirmResolve, setConfirmResolve] = useState<SystemError | null>(null);
  const [tableDelayLoading, setTableDelayLoading] = useState(false);
  const debouncedSearch = useDebounce(search, 350);

  useEffect(() => {
    const timer = setTimeout(
      () => setAuthPhase((current) => (current === "spinner" ? "checking" : current)),
      350,
    );

    const doAuth = async () => {
      try {
        let response = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });

        if (response.status === 401) {
          try {
            const refresh = await fetch("/api/auth/token/refresh", {
              method: "POST",
              credentials: "include",
              headers: { "X-CSRFToken": getCsrfToken() },
            });
            if (refresh.ok) {
              await new Promise<void>((resolve) => setTimeout(resolve, 120));
              response = await fetch("/api/auth/me", {
                credentials: "include",
                cache: "no-store",
              });
            }
          } catch {
            // Ignore refresh failures and fall through to redirect.
          }
        }

        clearTimeout(timer);
        if (response.status === 401 || !response.ok) {
          router.replace("/");
          return;
        }

        const data = (await response.json()) as UserData;
        if (!data.admin) {
          router.replace("/dashboard");
          return;
        }

        setUser(data);
        setAuthPhase("done");
      } catch {
        clearTimeout(timer);
        router.replace("/");
      }
    };

    void doAuth();
    return () => clearTimeout(timer);
  }, [router]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, resolvedFilter, errorTypeFilter, moduleFilter, sortField, sortDir]);

  useEffect(() => {
    setTableDelayLoading(true);
    const timer = setTimeout(() => setTableDelayLoading(false), 1000);
    return () => clearTimeout(timer);
  }, [debouncedSearch, resolvedFilter, errorTypeFilter, moduleFilter, sortField, sortDir]);

  const overviewQuery = useQuery<AdminOverview>({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const response = await fetch("/api/user-profile/admin-overview", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to load admin dashboard.");
      return response.json();
    },
    enabled: authPhase === "done" && !!user,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const systemErrorsQuery = useQuery<SystemErrorsResponse>({
    queryKey: [
      "admin-system-errors",
      debouncedSearch,
      resolvedFilter,
      errorTypeFilter,
      moduleFilter,
      sortField,
      sortDir,
      page,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page) });
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (resolvedFilter !== "all") params.set("resolved", resolvedFilter);
      if (errorTypeFilter !== "all") params.set("error_type", errorTypeFilter);
      if (moduleFilter !== "all") params.set("module", moduleFilter);
      params.set("sort_by", sortField);
      params.set("sort_dir", sortDir);

      const response = await fetch(`/api/user-profile/system-errors?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to load system errors.");
      return response.json();
    },
    enabled: authPhase === "done" && !!user,
    placeholderData: (previous) => previous,
    staleTime: 10_000,
  });

  const overview = overviewQuery.data;
  const systemErrors = systemErrorsQuery.data;

  const statCards = useMemo(() => {
    if (!overview) return [];
    return [
      {
        label: "Failed Logins",
        sub: "this month",
        value: overview.stats.failed_logins.current,
        trend: overview.stats.trends.failed_logins,
        icon: ShieldAlert,
        color: "#DC2626",
      },
      {
        label: "Locked Accounts",
        sub: "current",
        value: overview.stats.locked_accounts.current,
        trend: overview.stats.trends.locked_accounts,
        icon: Lock,
        color: "#F59E0B",
      },
      {
        label: "Active Users",
        sub: "current",
        value: overview.stats.active_users.current,
        trend: overview.stats.trends.active_users,
        icon: Users,
        color: "#16A34A",
      },
      {
        label: "Inactive Users",
        sub: "current",
        value: overview.stats.inactive_users.current,
        trend: overview.stats.trends.inactive_users,
        icon: ArrowDownRight,
        color: "#6B7280",
      },
      {
        label: "Password Changes",
        sub: "this month",
        value: overview.stats.password_changes.current,
        trend: overview.stats.trends.password_changes,
        icon: KeyRound,
        color: "#2845D6",
      },
      {
        label: "Default Password",
        sub: "active users",
        value: overview.stats.default_pwd_users.current,
        trend: overview.stats.trends.default_pwd_users,
        icon: UserCog,
        color: "#7C3AED",
      },
    ];
  }, [overview]);

  const loginChartData = useMemo(
    () =>
      overview?.login_chart.months.map((month, index) => ({
        month,
        Failed: overview.login_chart.failed[index] ?? 0,
        Successful: overview.login_chart.successful[index] ?? 0,
      })) ?? [],
    [overview],
  );

  const lockChartData = useMemo(
    () =>
      overview?.lock_chart.months.map((month, index) => ({
        month,
        Locked: overview.lock_chart.locked[index] ?? 0,
      })) ?? [],
    [overview],
  );

  const passwordChartData = useMemo(
    () =>
      overview?.password_chart.months.map((month, index) => ({
        month,
        Changed: overview.password_chart.changed_password[index] ?? 0,
        Default: overview.password_chart.default_password[index] ?? 0,
        Locked: overview.password_chart.locked_accounts[index] ?? 0,
      })) ?? [],
    [overview],
  );

  const userPieData = useMemo(
    () =>
      overview
        ? [
            { name: "Active", value: overview.user_pie.active },
            { name: "Inactive", value: overview.user_pie.inactive },
            { name: "Locked", value: overview.user_pie.locked },
          ]
        : [],
    [overview],
  );

  const activeUserCount = overview?.user_pie.active ?? 0;
  const totalPages = systemErrors ? Math.max(1, Math.ceil(systemErrors.total / systemErrors.per_page)) : 1;

  const systemErrorColumns = useMemo<DataTableColumn<SystemError>[]>(() => {
    const moduleOptions = systemErrors?.available_modules ?? [];
    const errorTypeOptions = systemErrors?.available_error_types ?? [];

    return [
      {
        key: "timestamp",
        label: "Timestamp",
        sortField: "timestamp",
        render: (row) => formatDateTime(row.timestamp),
        thClassName: "min-w-[180px]",
        tdClassName: "text-[var(--color-text-secondary)]",
      },
      {
        key: "error_type",
        label: "Type",
        sortField: "error_type",
        filterActive: errorTypeFilter !== "all",
        filterContent: (
          <FilterListContent
            options={[
              { label: "All types", value: "all" },
              ...errorTypeOptions.map((value) => ({ label: prettifyErrorType(value), value })),
            ]}
            value={errorTypeFilter}
            onChange={setErrorTypeFilter}
          />
        ),
        render: (row) => (
          <StatusPill
            status={row.error_type.startsWith("5") ? "disapproved" : "pending"}
            label={prettifyErrorType(row.error_type)}
          />
        ),
      },
      {
        key: "module",
        label: "Module",
        sortField: "module",
        filterActive: moduleFilter !== "all",
        filterContent: (
          <FilterListContent
            options={[
              { label: "All modules", value: "all" },
              ...moduleOptions.map((value) => ({ label: value, value })),
            ]}
            value={moduleFilter}
            onChange={setModuleFilter}
          />
        ),
        render: (row) => row.module,
        tdClassName: "font-medium text-[var(--color-text-primary)]",
      },
      {
        key: "message",
        label: "Message",
        sortField: "message",
        render: (row) => row.message,
        tdClassName: "text-[var(--color-text-secondary)]",
      },
      {
        key: "triggered_by",
        label: "Triggered By",
        sortField: "triggered_by",
        render: (row) => row.triggered_by?.name ?? "System",
        tdClassName: "text-[var(--color-text-secondary)]",
      },
      {
        key: "status",
        label: "Status",
        sortField: "status",
        filterActive: resolvedFilter !== "all",
        filterContent: (
          <FilterListContent
            options={[
              { label: "All statuses", value: "all" },
              { label: "Open", value: "false" },
              { label: "Resolved", value: "true" },
            ]}
            value={resolvedFilter}
            onChange={(value) => setResolvedFilter(value as "all" | "true" | "false")}
          />
        ),
        render: (row) => (
          <StatusPill status={row.resolved ? "active" : "pending"} label={row.resolved ? "Resolved" : "Open"} />
        ),
      },
      {
        key: "action",
        label: "Action",
        sortField: "timestamp",
        headerAlign: "center",
        thClassName: "text-center",
        tdClassName: "text-center",
        render: (row) =>
          row.resolved ? (
            <span className="text-[11px] text-[var(--color-text-muted)]">Resolved</span>
          ) : (
            <button
              type="button"
              disabled={resolvingId === row.id}
              onClick={() => setConfirmResolve(row)}
              className="inline-flex h-8 items-center justify-center rounded-lg bg-[#2845D6] px-3 text-[11px] font-medium text-white transition hover:bg-[#1f39b3] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {resolvingId === row.id ? (
                <TextShimmer className="text-[11px] text-white" duration={1.2}>
                  Updating...
                </TextShimmer>
              ) : (
                "Resolve"
              )}
            </button>
          ),
      },
    ];
  }, [errorTypeFilter, moduleFilter, resolvedFilter, resolvingId, systemErrors?.available_error_types, systemErrors?.available_modules]);

  const handleSort = (field: string) => {
    setSortField((current) => {
      if (current === field) {
        setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
        return current;
      }
      setSortDir("asc");
      return field;
    });
  };

  async function handleResolve(id: number) {
    setResolvingId(id);
    try {
      const response = await fetch(`/api/user-profile/system-errors/${id}/resolve`, {
        method: "PATCH",
        credentials: "include",
        headers: { "X-CSRFToken": getCsrfToken() },
      });
      if (!response.ok) throw new Error("Resolve failed");
      await systemErrorsQuery.refetch();
      await overviewQuery.refetch();
    } finally {
      setResolvingId(null);
      setConfirmResolve(null);
    }
  }

  if (authPhase === "spinner") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#2845D6]" />
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

  const tooltipStyle = {
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    fontSize: 11,
    color: "var(--color-text-primary)",
  };
  const axisTickProps = { fontSize: 10, fill: "var(--color-text-muted)" } as const;

  return (
    <div className="w-full space-y-5 p-4">
      <div className="flex flex-col gap-0">
        <p className="text-lg font-bold text-[var(--color-text-primary)]">System Dashboard</p>
        <p className="text-xs text-[var(--color-text-muted)]">
          Security posture, access health, and admin account visibility in one place.
        </p>
      </div>

      {!overview ? (
        <AdminDashboardSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {statCards.map((card) => {
              const gradId = `admin-${card.label.replace(/\s+/g, "-").toLowerCase()}`;
              const delta = card.trend.at(-1) ?? card.value;
              const deltaStart = card.trend[0] ?? card.value;
              const isUp = delta >= deltaStart;
              const DeltaIcon = isUp ? ArrowUpRight : ArrowDownRight;
              const sparkData = overview.stats.trends.weeks.map((week, index) => ({
                week,
                value: card.trend[index] ?? 0,
              }));

              return (
                <div
                  key={card.label}
                  className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]"
                >
                  <div className="p-4 pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <dt className="text-[10px] font-medium text-[var(--color-text-muted)]">
                          {card.label}
                          <span className="ml-1 opacity-70">{card.sub}</span>
                        </dt>
                        <dd className="mt-1 text-2xl font-bold leading-none text-[var(--color-text-primary)]">
                          {formatNumber(card.value)}
                        </dd>
                      </div>
                      {/* <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
                        <Icon size={16} />
                      </span> */}
                    </div>
                    <div
                        className={`flex items-center gap-1 text-[10px] ${
                            isUp
                            ? "text-[var(--btn-success-bg)]"
                            : "text-[var(--btn-danger-bg)]"
                        }`}
                        >
                        <DeltaIcon
                            size={11}
                            className={isUp ? "text-emerald-500" : "text-red-500"}
                        />
                        Weekly ending value {formatNumber(delta)}
                    </div>
                  </div>
                  <div className="mt-1 h-14">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={sparkData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={card.color} stopOpacity={0.35} />
                            <stop offset="95%" stopColor={card.color} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="week" hide />
                        <Area
                          dataKey="value"
                          type="monotone"
                          stroke={card.color}
                          fill={`url(#${gradId})`}
                          strokeWidth={1.5}
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

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div className="mb-4">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">Login Activity</p>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  Failed versus successful login attempts across the current fiscal year.
                </p>
              </div>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={loginChartData} barCategoryGap="26%">
                    <CartesianGrid vertical={false} stroke="var(--color-border)" opacity={0.45} />
                    <XAxis dataKey="month" tick={axisTickProps} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={axisTickProps} axisLine={false} tickLine={false} width={24} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-border)", opacity: 0.2 }} />
                    <Bar dataKey="Failed" fill="#DC2626" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Successful" fill="#2845D6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div className="mb-4">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">Account Lock Events</p>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  Monthly lock activity to highlight spikes in authentication risk.
                </p>
              </div>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lockChartData}>
                    <CartesianGrid vertical={false} stroke="var(--color-border)" opacity={0.45} />
                    <XAxis dataKey="month" tick={axisTickProps} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={axisTickProps} axisLine={false} tickLine={false} width={24} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="Locked"
                      stroke="#F59E0B"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#F59E0B" }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_0.7fr]">
            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div className="mb-4">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">Password Security</p>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  Changed passwords, remaining default passwords, and locked accounts by fiscal month.
                </p>
              </div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={passwordChartData} barCategoryGap="20%">
                    <CartesianGrid vertical={false} stroke="var(--color-border)" opacity={0.45} />
                    <XAxis dataKey="month" tick={axisTickProps} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={axisTickProps} axisLine={false} tickLine={false} width={24} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-border)", opacity: 0.2 }} />
                    <Bar dataKey="Changed" fill="#16A34A" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Default" fill="#2845D6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Locked" fill="#DC2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div className="mb-2">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">User Account Status</p>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  Current distribution of active, inactive, and locked accounts.
                </p>
              </div>
              <div className="flex h-[300px] items-center gap-2">
                <div className="relative h-[240px] w-[220px]">
                  <ChartContainer
                    config={{
                      active: { label: "Active", color: PIE_COLORS[0] },
                      inactive: { label: "Inactive", color: PIE_COLORS[1] },
                      locked: { label: "Locked", color: PIE_COLORS[2] },
                    }}
                    className="h-full w-full"
                  >
                    <PieChart>
                      <ChartTooltip
                        content={<ChartTooltipContent hideLabel className='border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2 rounded-md text-[10px]' />}
                        formatter={(value, _name, item) => {
                          const name = item?.payload?.name ?? "";
                          const count = Number(value ?? 0);
                          return `${name}: ${formatNumber(count)}`;
                        }}
                      />
                      <Pie
                        data={userPieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={84}
                        paddingAngle={8}
                        cornerRadius={10}
                        startAngle={90}
                        endAngle={-270}
                        strokeWidth={0}
                      >
                        {userPieData.map((entry, index) => (
                          <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold leading-none text-[var(--color-text-primary)]">
                      {formatNumber(activeUserCount)}
                    </span>
                    <span className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                      Active
                    </span>
                  </div>
                </div>

                <div className="flex-1 space-y-2">
                  {userPieData.map((item, index) => (
                    <div key={item.name} className="flex items-center justify-between rounded-lg bg-[var(--color-bg-card)] px-3 py-2">
                      <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                        {item.name}
                      </div>
                      <span className="text-xs font-semibold text-[var(--color-text-primary)]">{formatNumber(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">Admin Accounts</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    Current admin users, status, and most recent access timestamps.
                  </p>
                </div>
                <span className="rounded-full bg-[var(--color-bg-card)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-text-secondary)]">
                  {overview.admin_users.length} total
                </span>
              </div>

              {overview.admin_users.length === 0 ? (
                <EmptyState
                  title="No admin users found"
                  description="No non-superuser accounts currently have the admin flag enabled."
                  icons={[Users, UserCog, ShieldAlert]}
                  className="min-h-[220px] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)]/40"
                />
              ) : (
                <ScrollableCardList>
                  {overview.admin_users.map((adminUser) => (
                    <div
                      key={adminUser.id}
                      className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2"
                    >
                      <Image
                        src={adminUser.avatar || "/default-avatar.png"}
                        alt={adminUser.full_name}
                        width={44}
                        height={44}
                        className="h-8 w-8 rounded-full object-cover"
                        unoptimized
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-xs font-semibold text-[var(--color-text-primary)]">
                            {adminUser.full_name || adminUser.idnumber}
                          </p>
                          {adminUser.locked ? (
                            <StatusPill status="pending" label="Locked" />
                          ) : adminUser.active ? (
                            <StatusPill status="active" label="Active" />
                          ) : (
                            <StatusPill status="cancelled" label="Inactive" />
                          )}
                        </div>
                        <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                          {adminUser.idnumber}
                          {adminUser.department ? ` · ${adminUser.department}` : " · No department"}
                          {adminUser.roles ? ` · ${adminUser.roles}` : " · No Roles"}
                        </p>
                        <p className="text-[10px] text-[var(--color-text-muted)]">
                          Last login: {formatDateTime(adminUser.last_login)}
                        </p>
                      </div>
                    </div>
                  ))}
                </ScrollableCardList>
              )}
            </section>

            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">Recent Unresolved Errors</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    Latest unresolved system issues surfaced from the error log.
                  </p>
                </div>
                <span className="rounded-full bg-[var(--color-bg-card)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-text-secondary)]">
                  {overview.recent_errors.length} visible
                </span>
              </div>

              {overview.recent_errors.length === 0 ? (
                <EmptyState
                  title="No unresolved errors"
                  description="The latest snapshot shows no open system errors that need admin attention."
                  icons={[CheckCircle2, AlertTriangle, ShieldAlert]}
                  className="min-h-[220px] bg-[var(--color-bg-elevated)]/40"
                />
              ) : (
                <ScrollableCardList>
                  {overview.recent_errors.map((error) => (
                    <div
                      key={error.id}
                      className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <StatusPill status="disapproved" label={prettifyErrorType(error.error_type)} />
                          <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                            {error.module}
                          </span>
                        </div>
                        <span className="text-[10px] text-[var(--color-text-muted)]">
                          {formatDateTime(error.timestamp)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--color-text-primary)]">{error.message}</p>
                      <p className="text-[10px] text-[var(--color-text-muted)]">
                        Triggered by: {error.triggered_by?.name ?? "System"}
                      </p>
                    </div>
                  ))}
                </ScrollableCardList>
              )}
            </section>
          </div>
        </>
      )}

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
        <div className="mb-3">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">System Error Log</p>
          <p className="text-[10px] text-[var(--color-text-muted)]">
            Full-dataset search, column filtering, sorting, and resolve actions.
          </p>
        </div>

        <AdminTableSection<SystemError>
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search module, type, message, or user..."
          columns={systemErrorColumns}
          rows={systemErrors?.results ?? []}
          rowKey={(row) => row.id}
          loading={!systemErrors || systemErrorsQuery.isLoading || tableDelayLoading}
          transitioning={!tableDelayLoading && systemErrorsQuery.isFetching}
          skeletonRows={10}
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          emptyTitle="No error records found"
          emptyDescription="No system errors match the current filters."
          emptyIcons={[CheckCircle2, AlertTriangle, ShieldAlert]}
          page={systemErrors?.page ?? page}
          totalPages={totalPages}
          pageSize={systemErrors?.per_page ?? 10}
          totalCount={systemErrors?.total ?? 0}
          onPageChange={setPage}
        />
      </section>

      {confirmResolve && (
        <ConfirmationModal
          title="Resolve System Error"
          message={`Mark this ${prettifyErrorType(confirmResolve.error_type)} error in ${confirmResolve.module} as resolved?`}
          confirmLabel="Resolve"
          cancelLabel="Cancel"
          confirming={resolvingId === confirmResolve.id}
          confirmVariant="success"
          onConfirm={() => handleResolve(confirmResolve.id)}
          onCancel={() => setConfirmResolve(null)}
        />
      )}
    </div>
  );
}
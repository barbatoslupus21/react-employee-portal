"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  ClipboardCheck,
  FileText,
  ShieldCheck,
  Users,
} from "lucide-react";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/pie-chart";
import { getCsrfToken } from "@/lib/csrf";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type AuthPhase = "spinner" | "checking" | "done";

interface UserData {
  id: number;
  admin: boolean;
  hr: boolean;
}

interface HRStatValue {
  current: number;
}

interface HROverview {
  stats: {
    total_employees: HRStatValue;
    certs_granted: HRStatValue;
    prf_this_month: HRStatValue;
    active_surveys: HRStatValue;
    leaves_filed: HRStatValue;
    completed_profiles: HRStatValue;
    trends: {
      weeks: string[];
      total_employees: number[];
      certs_granted: number[];
      prf_this_month: number[];
      active_surveys: number[];
      leaves_filed: number[];
      completed_profiles: number[];
    };
  };
  user_pie: {
    active: number;
    inactive: number;
    locked: number;
  };
  password_chart: {
    months: string[];
    changed_password: number[];
    default_password: number[];
  };
  leave_weekly_chart: {
    weeks: string[];
    current_month: number[];
    last_month: number[];
  };
  leave_category_chart: {
    name: string;
    count: number;
  }[];
  leave_fiscal_chart: {
    months: string[];
    total_filed: number[];
    categories: { name: string; count: number[] }[];
  };
  leave_status_monthly_chart: {
    months: string[];
    statuses: { status: string; count: number[] }[];
  };
  prf_status_monthly_chart: {
    months: string[];
    statuses: { status: string; count: number[] }[];
  };
  cert_chart: {
    months: string[];
    count: number[];
  };
  survey_pies: {
    survey_id: number;
    title: string;
    submitted: number;
    not_submitted: number;
  }[];
  training_status_pie: {
    status: string;
    count: number;
  }[];
  training_status_bar: {
    status: string;
    label: string;
    count: number;
  }[];
  dept_profile_chart: {
    department: string;
    completed: number;
    total: number;
    pct: number;
  }[];
  profile_completion_fiscal_chart: {
    months: string[];
    employment_types: { name: string; count: number[] }[];
  };
  upcoming_birthdays: {
    id: number;
    idnumber: string;
    full_name: string;
    birth_date: string | null;
    days_away: number;
  }[];
  pending_leaves_count: number;
}

const PIE_COLORS = ["#16A34A", "#F59E0B", "#DC2626", "#2845D6", "#0D9488", "#7C3AED"];
const TRAINING_STATUS_COLOR_MAP: Record<string, string> = {
  pending: "#F59E0B",
  supervisor_review: "#3B82F6",
  user_confirmation: "#6366F1",
  final_approval: "#8B5CF6",
  returned: "#DC2626",
  completed: "#16A34A",
};
const FILING_STATUS_COLOR_MAP: Record<string, string> = {
  pending: "#F59E0B",
  approved: "#16A34A",
  disapproved: "#DC2626",
  cancelled: "#6B7280",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function titleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
    <div className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 animate-pulse ${className}`}>
      <div className="mb-4 h-4 w-36 rounded bg-[var(--color-border)]" />
      <div className="h-[calc(100%-2rem)] rounded bg-[var(--color-border)]/40" />
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="w-full space-y-5 px-1 pb-6 animate-pulse">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <StatCardSkeleton key={index} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <PanelSkeleton className="h-[340px]" />
        <PanelSkeleton className="h-[340px]" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <PanelSkeleton className="h-[360px]" />
        <PanelSkeleton className="h-[360px]" />
      </div>
    </div>
  );
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)]/40 px-6 text-center">
      <p className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-[var(--color-text-muted)]">{description}</p>
    </div>
  );
}

export default function HRDashboardPage() {
  const router = useRouter();
  const [authPhase, setAuthPhase] = useState<AuthPhase>("spinner");
  const [user, setUser] = useState<UserData | null>(null);

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
            // Ignore and redirect below.
          }
        }

        clearTimeout(timer);
        if (response.status === 401 || !response.ok) {
          router.replace("/");
          return;
        }

        const data = (await response.json()) as UserData;
        if (!(data.hr || data.admin)) {
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

  const overviewQuery = useQuery<HROverview>({
    queryKey: ["hr-overview"],
    queryFn: async () => {
      const response = await fetch("/api/user-profile/hr-overview", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to load HR dashboard.");
      return response.json();
    },
    enabled: authPhase === "done" && !!user,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const overview = overviewQuery.data;

  const statCards = !overview
    ? []
    : [
        {
          label: "Employees",
          sub: "active regulars",
          value: overview.stats.total_employees.current,
          trend: overview.stats.trends.total_employees,
          icon: Users,
          color: "#2845D6",
        },
        {
          label: "Certificates",
          sub: "this month",
          value: overview.stats.certs_granted.current,
          trend: overview.stats.trends.certs_granted,
          icon: BadgeCheck,
          color: "#16A34A",
        },
        {
          label: "PRFs Filed",
          sub: "this month",
          value: overview.stats.prf_this_month.current,
          trend: overview.stats.trends.prf_this_month,
          icon: FileText,
          color: "#0D9488",
        },
        {
          label: "Active Surveys",
          sub: "live now",
          value: overview.stats.active_surveys.current,
          trend: overview.stats.trends.active_surveys,
          icon: ClipboardCheck,
          color: "#7C3AED",
        },
        {
          label: "Leave Filings",
          sub: "this month",
          value: overview.stats.leaves_filed.current,
          trend: overview.stats.trends.leaves_filed,
          icon: CalendarClock,
          color: "#F59E0B",
        },
        {
          label: "Profiles Complete",
          sub: "current",
          value: overview.stats.completed_profiles.current,
          trend: overview.stats.trends.completed_profiles,
          icon: ShieldCheck,
          color: "#DC2626",
        },
      ];

  const certData =
    overview?.cert_chart.months.map((month, index) => ({
      month,
      Certificates: overview.cert_chart.count[index] ?? 0,
    })) ?? [];

  const leaveFiscalData =
    overview?.leave_fiscal_chart.months.map((month, index) => {
      const row: Record<string, string | number> = {
        month,
        total_filed: overview.leave_fiscal_chart.total_filed[index] ?? 0,
      };
      for (const category of overview.leave_fiscal_chart.categories) {
        row[category.name] = category.count[index] ?? 0;
      }
      return row;
    }) ?? [];

  const profileCompletionData =
    overview?.profile_completion_fiscal_chart.months.map((month, index) => {
      const row: Record<string, string | number> = { month };
      for (const typeRow of overview.profile_completion_fiscal_chart.employment_types) {
        row[typeRow.name] = typeRow.count[index] ?? 0;
      }
      return row;
    }) ?? [];

  const leaveStatusData =
    overview?.leave_status_monthly_chart.months.map((month, index) => {
      const row: Record<string, string | number> = { month };
      for (const statusRow of overview.leave_status_monthly_chart.statuses) {
        row[statusRow.status] = statusRow.count[index] ?? 0;
      }
      return row;
    }) ?? [];

  const prfStatusData =
    overview?.prf_status_monthly_chart.months.map((month, index) => {
      const row: Record<string, string | number> = { month };
      for (const statusRow of overview.prf_status_monthly_chart.statuses) {
        row[statusRow.status] = statusRow.count[index] ?? 0;
      }
      return row;
    }) ?? [];

  const trainingStatusData = overview?.training_status_bar ?? [];

  const userPieData = overview
    ? [
        { name: "Active", value: overview.user_pie.active },
        { name: "Inactive", value: overview.user_pie.inactive },
        { name: "Locked", value: overview.user_pie.locked },
      ]
    : [];
  const totalUserCount = userPieData.reduce((sum, item) => sum + item.value, 0);
  const activeUserCount = overview?.user_pie.active ?? 0;
  const userPieDataWithPct = userPieData.map((item) => ({
    ...item,
    pct: totalUserCount > 0 ? (item.value / totalUserCount) * 100 : 0,
  }));

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
        <p className="text-lg font-bold text-[var(--color-text-primary)]">Employees Overview</p>
        <p className="text-xs text-[var(--color-text-muted)]">
          Workforce health, submissions, and completion signals for HR operations.
        </p>
      </div>

      {!overview ? (
        <PageSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {statCards.map((card) => {
              const gradId = `hr-${card.label.replace(/\s+/g, "-").toLowerCase()}`;
              const endValue = card.trend.at(-1) ?? card.value;
              const startValue = card.trend[0] ?? card.value;
              const rising = endValue >= startValue;
              const DeltaIcon = rising ? ArrowUpRight : ArrowDownRight;
              const sparkData = overview.stats.trends.weeks.map((week, index) => ({
                week,
                value: card.trend[index] ?? 0,
              }));

              return (
                <div key={card.label} className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
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
                            rising
                            ? "text-[var(--btn-success-bg)]"
                            : "text-[var(--btn-danger-bg)]"
                        }`}
                        >
                        <DeltaIcon
                            size={11}
                            className={rising ? "text-emerald-500" : "text-red-500"}
                        />
                        Current weekly signal {formatNumber(endValue)}
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

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.5fr_1.5fr]">
            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div className="mb-3">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">User Account Status</p>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  Active, inactive, and locked accounts across the current workforce.
                </p>
              </div>
              <div className="grid h-[280px] grid-cols-1 gap-4 md:grid-cols-[1fr_0.9fr] md:items-center">
                <div className="relative h-[220px] w-full">
                  <ChartContainer
                    config={{
                      Active: { label: "Active", color: PIE_COLORS[0] },
                      Inactive: { label: "Inactive", color: PIE_COLORS[1] },
                      Locked: { label: "Locked", color: PIE_COLORS[2] },
                    }}
                    className="h-full w-full"
                  >
                    <PieChart>
                      <Pie
                        data={userPieDataWithPct}
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
                        {userPieDataWithPct.map((entry, index) => (
                          <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip
                        content={
                          <ChartTooltipContent 
                            className='border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2 rounded-md text-[10px] '
                            formatter={(value, name, item) => {
                              const count = Number(value ?? 0);
                              const pct = Number((item?.payload as { pct?: number })?.pct ?? 0);
                              return (
                                <div className="flex min-w-[180px] items-center justify-between gap-4 text-xs bg-white">
                                  <span className="text-[10px] font-medium text-[var(--color-text-primary)]">{String(name)}</span>
                                  <span className="text-[10px] font-semibold text-[var(--color-text-primary)]">{formatNumber(count)} ({pct.toFixed(1)}%)</span>
                                </div>
                              );
                            }}
                          />
                        }
                      />
                    </PieChart>
                  </ChartContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-2xl font-bold leading-none text-[var(--color-text-primary)]">{formatNumber(activeUserCount)}</span>
                    <span className="mt-1 text-[10px] uppercase text-[var(--color-text-muted)]">Active users</span>
                  </div>
                </div>
                <div className="grid w-full gap-2">
                  {userPieDataWithPct.map((item, index) => (
                    <div key={item.name} className="flex items-center justify-between rounded-lg bg-[var(--color-bg-card)] px-3 py-2">
                      <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                        {item.name}
                      </div>
                      <span className="text-[10px] font-semibold text-[var(--color-text-primary)]">{item.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div className="mb-4">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">Profile Completion by Department</p>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  Fiscal-year profile completions grouped by employment type for standard users.
                </p>
              </div>
              {overview.profile_completion_fiscal_chart.employment_types.length === 0 ? (
                <EmptyPanel title="No completion data" description="Completed profile totals by employment type will appear once users complete required profile fields." />
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={profileCompletionData} barCategoryGap="18%" barGap={4}>
                      <CartesianGrid vertical={false} stroke="var(--color-border)" opacity={0.45} />
                      <XAxis dataKey="month" tick={axisTickProps} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={axisTickProps} axisLine={false} tickLine={false} width={24} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-border)", opacity: 0.12 }} />
                      {overview.profile_completion_fiscal_chart.employment_types.map((typeRow, index) => (
                        <Bar
                          key={typeRow.name}
                          dataKey={typeRow.name}
                          name={typeRow.name}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                          radius={[4, 4, 0, 0]}
                        />
                      ))}
                      <Legend verticalAlign="bottom" align="center" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div className="mb-4">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">Leave Filings & Categories</p>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  Fiscal-year monthly leave filings with category trend overlays.
                </p>
              </div>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={leaveFiscalData} barCategoryGap="24%">
                    <CartesianGrid vertical={false} stroke="var(--color-border)" opacity={0.45} />
                    <XAxis dataKey="month" tick={axisTickProps} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={axisTickProps} axisLine={false} tickLine={false} width={24} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-border)", opacity: 0.2 }} />
                    <Bar dataKey="total_filed" name="Total Filed" fill="#2845D6" radius={[4, 4, 0, 0]} />
                    {overview.leave_fiscal_chart.categories.map((category, index) => (
                      <Line
                        key={category.name}
                        type="monotone"
                        dataKey={category.name}
                        name={category.name}
                        stroke={PIE_COLORS[(index + 1) % PIE_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                    <Legend verticalAlign="bottom" align="center" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div className="mb-4">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">Training Submission Status</p>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  Current evaluation totals by workflow status.
                </p>
              </div>
              {trainingStatusData.length === 0 ? (
                <EmptyPanel title="No training submissions yet" description="Training evaluation status will populate after submissions are recorded." />
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trainingStatusData} barCategoryGap="22%">
                      <CartesianGrid vertical={false} stroke="var(--color-border)" opacity={0.45} />
                      <XAxis dataKey="label" tick={axisTickProps} axisLine={false} tickLine={false} interval={0} angle={0} textAnchor="middle" height={36} tickMargin={10} />
                      <YAxis allowDecimals={false} tick={axisTickProps} axisLine={false} tickLine={false} width={24} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-border)", opacity: 0.15 }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {trainingStatusData.map((item) => (
                          <Cell key={item.status} fill={TRAINING_STATUS_COLOR_MAP[item.status] ?? "#2845D6"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">Certificates by Month</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    Fiscal-year certificate issuance volume.
                  </p>
                </div>
              </div>
              <div className="mt-4 h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={certData}>
                    <CartesianGrid vertical={false} stroke="var(--color-border)" opacity={0.45} />
                    <XAxis dataKey="month" tick={axisTickProps} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={axisTickProps} axisLine={false} tickLine={false} width={24} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="Certificates" fill="#2845D6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div className="mb-4">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">Leave Filing</p>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  Fiscal-year monthly leave filings by status.
                </p>
              </div>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={leaveStatusData} barCategoryGap="18%">
                    <CartesianGrid vertical={false} stroke="var(--color-border)" opacity={0.45} />
                    <XAxis dataKey="month" tick={axisTickProps} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={axisTickProps} axisLine={false} tickLine={false} width={24} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value, name) => [formatNumber(Number(value)), titleCase(String(name))]}
                      labelFormatter={(label) => `Month: ${String(label)}`}
                    />
                    {overview.leave_status_monthly_chart.statuses.map((statusRow) => (
                      <Bar
                        key={statusRow.status}
                        dataKey={statusRow.status}
                        name={titleCase(statusRow.status)}
                        fill={FILING_STATUS_COLOR_MAP[statusRow.status] ?? "#2845D6"}
                        radius={[4, 4, 0, 0]}
                      />
                    ))}
                    <Legend verticalAlign="bottom" align="center" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div className="mb-4">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">PRF Requests Filing</p>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  Fiscal-year monthly PRF requests by status.
                </p>
              </div>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={prfStatusData} barCategoryGap="18%">
                    <CartesianGrid vertical={false} stroke="var(--color-border)" opacity={0.45} />
                    <XAxis dataKey="month" tick={axisTickProps} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={axisTickProps} axisLine={false} tickLine={false} width={24} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value, name) => [formatNumber(Number(value)), titleCase(String(name))]}
                      labelFormatter={(label) => `Month: ${String(label)}`}
                    />
                    {overview.prf_status_monthly_chart.statuses.map((statusRow) => (
                      <Bar
                        key={statusRow.status}
                        dataKey={statusRow.status}
                        name={titleCase(statusRow.status)}
                        fill={FILING_STATUS_COLOR_MAP[statusRow.status] ?? "#2845D6"}
                        radius={[4, 4, 0, 0]}
                      />
                    ))}
                    <Legend verticalAlign="bottom" align="center" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
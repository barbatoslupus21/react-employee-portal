"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BriefcaseBusiness,
  ChevronDown,
  ChevronUp,
  Landmark,
  Receipt,
  Wallet,
  Users,
} from "lucide-react";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { getCsrfToken } from "@/lib/csrf";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type AuthPhase = "spinner" | "checking" | "done";
type PeriodFilter = "1W" | "1M" | "3M" | "1FY";

interface UserData {
  id: number;
  admin: boolean;
  accounting: boolean;
}

interface AccountingStatValue {
  current: number;
}

interface AccountingOverview {
  stats: {
    total_employees: AccountingStatValue;
    users_with_loans: AccountingStatValue;
    users_with_allowances: AccountingStatValue;
    users_with_savings: AccountingStatValue;
    users_with_payslips: AccountingStatValue;
    active_prfs: AccountingStatValue;
    trends: {
      weeks: string[];
      total_employees: number[];
      users_with_loans: number[];
      users_with_allowances: number[];
      users_with_savings: number[];
      users_with_payslips: number[];
      active_prfs: number[];
    };
  };
  employment_type_chart: { name: string; count: number }[];
  dept_pie: { name: string; count: number }[];
  loan_chart: { name: string; count: number }[];
  finance_monthly_chart: {
    months: string[];
    allowances: number[];
    savings: number[];
    payslips: number[];
  };
  finance_monthly_amount_chart: {
    months: string[];
    loans: number[];
    allowances: number[];
    savings: number[];
    prf_requests: number[];
  };
  prf_status_pie: { status: string; count: number }[];
  prf_type_chart: { name: string; count: number }[];
  loan_portfolio: number;
  savings_total: number;
  loan_portfolio_change_pct: number;
  savings_total_change_pct: number;
  allowance_total: number;
  allowance_total_change_pct: number;
  loan_type_amounts: { name: string; amount: number; change_pct: number }[];
  savings_type_amounts: { name: string; amount: number; change_pct: number }[];
  allowance_type_amounts: { name: string; amount: number; change_pct: number }[];
  prf_request_total: number;
  prf_request_change_pct: number;
  prf_type_amounts: { name: string; amount: number; change_pct: number }[];
  selected_period: PeriodFilter;
  selected_range: { start: string; end: string };
  latest_payslip_period: string | null;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPct(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
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
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <PanelSkeleton className="h-[320px]" />
        <PanelSkeleton className="h-[320px]" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        <PanelSkeleton className="h-[340px]" />
        <PanelSkeleton className="h-[340px]" />
      </div>
    </div>
  );
}

export default function AccountingDashboardPage() {
  const router = useRouter();
  const [authPhase, setAuthPhase] = useState<AuthPhase>("spinner");
  const [user, setUser] = useState<UserData | null>(null);
  const [loanPeriod, setLoanPeriod] = useState<PeriodFilter>("1FY");
  const [savingsPeriod, setSavingsPeriod] = useState<PeriodFilter>("1FY");
  const [allowancePeriod, setAllowancePeriod] = useState<PeriodFilter>("1FY");
  const [prfPeriod, setPrfPeriod] = useState<PeriodFilter>("1FY");

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
        if (!(data.accounting || data.admin)) {
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

  const fetchOverview = async (period: PeriodFilter) => {
    const response = await fetch(`/api/user-profile/accounting-overview?period=${period}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Failed to load accounting dashboard.");
    return (await response.json()) as AccountingOverview;
  };

  const overviewQuery = useQuery<AccountingOverview>({
    queryKey: ["accounting-overview", "base"],
    queryFn: () => fetchOverview("1FY"),
    enabled: authPhase === "done" && !!user,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const loanOverviewQuery = useQuery<AccountingOverview>({
    queryKey: ["accounting-overview", "loan", loanPeriod],
    queryFn: () => fetchOverview(loanPeriod),
    enabled: authPhase === "done" && !!user,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });

  const savingsOverviewQuery = useQuery<AccountingOverview>({
    queryKey: ["accounting-overview", "savings", savingsPeriod],
    queryFn: () => fetchOverview(savingsPeriod),
    enabled: authPhase === "done" && !!user,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });

  const allowanceOverviewQuery = useQuery<AccountingOverview>({
    queryKey: ["accounting-overview", "allowance", allowancePeriod],
    queryFn: () => fetchOverview(allowancePeriod),
    enabled: authPhase === "done" && !!user,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });

  const prfOverviewQuery = useQuery<AccountingOverview>({
    queryKey: ["accounting-overview", "prf", prfPeriod],
    queryFn: () => fetchOverview(prfPeriod),
    enabled: authPhase === "done" && !!user,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });

  const overview = overviewQuery.data;
  const loanOverview = loanOverviewQuery.data ?? overview;
  const savingsOverview = savingsOverviewQuery.data ?? overview;
  const allowanceOverview = allowanceOverviewQuery.data ?? overview;
  const prfOverview = prfOverviewQuery.data ?? overview;

  const statCards = !overview
    ? []
    : [
        {
          label: "Employees",
          sub: "regular active",
          value: overview.stats.total_employees.current,
          trend: overview.stats.trends.total_employees,
          icon: Users,
          color: "#2845D6",
        },
        {
          label: "With Loans",
          sub: "active balances",
          value: overview.stats.users_with_loans.current,
          trend: overview.stats.trends.users_with_loans,
          icon: Landmark,
          color: "#DC2626",
        },
        {
          label: "Allowances",
          sub: "employees tagged",
          value: overview.stats.users_with_allowances.current,
          trend: overview.stats.trends.users_with_allowances,
          icon: Banknote,
          color: "#16A34A",
        },
        {
          label: "Savings",
          sub: "contributors",
          value: overview.stats.users_with_savings.current,
          trend: overview.stats.trends.users_with_savings,
          icon: Wallet,
          color: "#0D9488",
        },
        {
          label: "Payslips",
          sub: "latest batch",
          value: overview.stats.users_with_payslips.current,
          trend: overview.stats.trends.users_with_payslips,
          icon: Receipt,
          color: "#7C3AED",
        },
        {
          label: "Active PRFs",
          sub: "pending now",
          value: overview.stats.active_prfs.current,
          trend: overview.stats.trends.active_prfs,
          icon: BriefcaseBusiness,
          color: "#F59E0B",
        },
      ];

  const financeMonthlyData =
    overview?.finance_monthly_chart.months.map((month, index) => ({
      month,
      Allowances: overview.finance_monthly_chart.allowances[index] ?? 0,
      Savings: overview.finance_monthly_chart.savings[index] ?? 0,
      Payslips: overview.finance_monthly_chart.payslips[index] ?? 0,
    })) ?? [];

  const loanTrendData =
    loanOverview?.finance_monthly_amount_chart.months.map((period, index) => ({
      period,
      value: loanOverview.finance_monthly_amount_chart.loans[index] ?? 0,
    })) ?? [];

  const savingsTrendData =
    savingsOverview?.finance_monthly_amount_chart.months.map((period, index) => ({
      period,
      value: savingsOverview.finance_monthly_amount_chart.savings[index] ?? 0,
    })) ?? [];

  const allowanceTrendData =
    allowanceOverview?.finance_monthly_amount_chart.months.map((period, index) => ({
      period,
      value: allowanceOverview.finance_monthly_amount_chart.allowances[index] ?? 0,
    })) ?? [];

  const activeLoanTypes = loanOverview?.loan_type_amounts ?? [];
  const activeSavingsTypes = savingsOverview?.savings_type_amounts ?? [];
  const activeAllowanceTypes = allowanceOverview?.allowance_type_amounts ?? [];
  const activePrfTypes = prfOverview?.prf_type_amounts ?? [];
  const prfTrendData =
    prfOverview?.finance_monthly_amount_chart.months.map((period, index) => ({
      period,
      value: prfOverview.finance_monthly_amount_chart.prf_requests[index] ?? 0,
    })) ?? [];

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
    <div className="w-full space-y-5 p-4 pb-6">
      <div className="flex flex-col gap-0">
        <p className="text-lg font-bold text-[var(--color-text-primary)]">Finance Overview</p>
        <p className="text-xs text-[var(--color-text-muted)]">
          Financial coverage, payroll distribution, and PRF activity for accounting operations.
        </p>
      </div>

      {!overview ? (
        <PageSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {statCards.map((card) => {
              const gradId = `acct-${card.label.replace(/\s+/g, "-").toLowerCase()}`;
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
                    <div className={`flex items-center gap-1 text-[10px] ${
                        rising
                        ? "text-[var(--btn-success-bg)]"
                        : "text-[var(--btn-danger-bg)]"
                    }`}>
                      <DeltaIcon size={11} className={rising ? "text-emerald-500" : "text-red-500"} />
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

          <div className="grid grid-cols-1 gap-4">
            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div className="mb-4">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">Monthly Finance Activity</p>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  Allowances, savings, and payslips issued per fiscal-year month.
                </p>
              </div>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={financeMonthlyData} barCategoryGap="18%">
                    <CartesianGrid vertical={false} stroke="var(--color-border)" opacity={0.45} />
                    <XAxis dataKey="month" tick={axisTickProps} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={axisTickProps} axisLine={false} tickLine={false} width={24} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="Allowances" fill="#16A34A" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Savings" fill="#0D9488" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Payslips" fill="#2845D6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            <section className="w-full min-w-[280px] max-w-[560px] xl:max-w-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">Loan Portfolio</p>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-xl font-bold text-[var(--color-text-muted)]">{formatCurrency(loanOverview?.loan_portfolio ?? 0)}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                    (loanOverview?.loan_portfolio_change_pct ?? 0) >= 0
                      ? "bg-emerald-500/15 text-emerald-600"
                      : "bg-red-500/15 text-red-600"
                  }`}
                >
                  {formatPct(loanOverview?.loan_portfolio_change_pct ?? 0)}
                </span>
              </div>
              <div className="mt-3">
                <PeriodTabs value={loanPeriod} onChange={setLoanPeriod} />
              </div>
              <div className="mt-3 h-[170px] rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)]/40 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={loanTrendData}>
                    <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="4 4" opacity={0.45} />
                    <XAxis dataKey="period" hide />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(label) => `Period: ${String(label)}`}
                      formatter={(value) => [formatCurrency(Number(value)), "Loans"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#DC2626"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <ScrollableMetricList
                items={activeLoanTypes}
                emptyText="No active loan types recorded."
                money
              />
            </section>

            <section className="w-full min-w-[280px] max-w-[560px] xl:max-w-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">Savings Balance</p>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-xl font-bold text-[var(--color-text-muted)]">{formatCurrency(savingsOverview?.savings_total ?? 0)}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                    (savingsOverview?.savings_total_change_pct ?? 0) >= 0
                      ? "bg-emerald-500/15 text-emerald-600"
                      : "bg-red-500/15 text-red-600"
                  }`}
                >
                  {formatPct(savingsOverview?.savings_total_change_pct ?? 0)}
                </span>
              </div>
              <div className="mt-3">
                <PeriodTabs value={savingsPeriod} onChange={setSavingsPeriod} />
              </div>
              <div className="mt-3 h-[170px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)]/40 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={savingsTrendData}>
                    <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="4 4" opacity={0.45} />
                    <XAxis dataKey="period" hide />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(label) => `Period: ${String(label)}`}
                      formatter={(value) => [formatCurrency(Number(value)), "Savings"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#0D9488"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <ScrollableMetricList
                items={activeSavingsTypes}
                emptyText="No savings activity for this selected period."
                money
              />
            </section>

            <section className="w-full min-w-[280px] max-w-[560px] xl:max-w-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">Allowance Coverage</p>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-xl font-bold text-[var(--color-text-muted)]">{formatCurrency(allowanceOverview?.allowance_total ?? 0)}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                    (allowanceOverview?.allowance_total_change_pct ?? 0) >= 0
                      ? "bg-emerald-500/15 text-emerald-600"
                      : "bg-red-500/15 text-red-600"
                  }`}
                >
                  {formatPct(allowanceOverview?.allowance_total_change_pct ?? 0)}
                </span>
              </div>
              <div className="mt-3">
                <PeriodTabs value={allowancePeriod} onChange={setAllowancePeriod} />
              </div>
              <div className="mt-3 h-[170px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)]/40 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={allowanceTrendData}>
                    <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="4 4" opacity={0.45} />
                    <XAxis dataKey="period" hide />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(label) => `Period: ${String(label)}`}
                      formatter={(value) => [formatCurrency(Number(value)), "Allowances"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#16A34A"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <ScrollableMetricList
                items={activeAllowanceTypes}
                emptyText="No allowance activity for this selected period."
                money
              />
            </section>

            <section className="w-full min-w-[280px] max-w-[560px] xl:max-w-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">PRF Requests</p>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-xl font-bold text-[var(--color-text-muted)]">{formatNumber(prfOverview?.prf_request_total ?? 0)}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                    (prfOverview?.prf_request_change_pct ?? 0) >= 0
                      ? "bg-emerald-500/15 text-emerald-600"
                      : "bg-red-500/15 text-red-600"
                  }`}
                >
                  {formatPct(prfOverview?.prf_request_change_pct ?? 0)}
                </span>
              </div>
              <div className="mt-3">
                <PeriodTabs value={prfPeriod} onChange={setPrfPeriod} />
              </div>
              <div className="mt-3 h-[170px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)]/40 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={prfTrendData}>
                    <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="4 4" opacity={0.45} />
                    <XAxis dataKey="period" hide />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(label) => `Period: ${String(label)}`}
                      formatter={(value) => [formatNumber(Number(value)), "Requests"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#2845D6"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <ScrollableMetricList
                items={activePrfTypes}
                emptyText="No PRF type activity for this selected period."
                money={false}
              />
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function PeriodTabs({
  value,
  onChange,
}: {
  value: PeriodFilter;
  onChange: (next: PeriodFilter) => void;
}) {
  const options: PeriodFilter[] = ["1W", "1M", "3M", "1FY"];
  return (
    <div className="group flex w-full overflow-hidden rounded-lg border border-[var(--color-border)]">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          data-active={value === option}
          className="relative flex h-7 flex-1 items-center justify-center border-r border-[var(--color-border)] bg-transparent text-[11px] font-semibold text-[var(--color-text-muted)] transition-colors last:border-r-0 hover:bg-[var(--color-bg-card)] data-[active=true]:bg-[var(--color-bg-card)] data-[active=true]:text-[var(--color-text-primary)]"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function ScrollableMetricList({
  items,
  emptyText,
  money = true,
}: {
  items: { name: string; amount: number; change_pct: number }[];
  emptyText: string;
  money?: boolean;
}) {
  const [canUp, setCanUp] = useState(false);
  const [canDown, setCanDown] = useState(false);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  const update = () => {
    if (!scrollEl) return;
    setCanUp(scrollEl.scrollTop > 2);
    setCanDown(scrollEl.scrollTop + scrollEl.clientHeight < scrollEl.scrollHeight - 2);
  };

  const attachScrollEl = (node: HTMLDivElement | null) => {
    setScrollEl(node);
    if (!node) {
      setCanUp(false);
      setCanDown(false);
      return;
    }
    setCanUp(node.scrollTop > 2);
    setCanDown(node.scrollTop + node.clientHeight < node.scrollHeight - 2);
  };

  const scrollByAmount = (delta: number) => {
    if (!scrollEl) return;
    scrollEl.scrollBy({ top: delta, behavior: "smooth" });
  };

  return (
    <div className="relative mt-3">
      <div
        ref={attachScrollEl}
        onScroll={update}
        className="max-h-[160px] space-y-2 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.length === 0 ? (
          <p className="rounded-lg bg-[var(--color-bg-elevated)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
            {emptyText}
          </p>
        ) : (
          items.map((item) => (
            <div key={item.name} className="flex items-center justify-between bg-[var(--color-bg-elevated)] px-3 py-1">
              <span className="truncate pr-2 text-xs font-medium text-[var(--color-text-secondary)]">{item.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                  {money ? formatCurrency(item.amount) : formatNumber(item.amount)}
                </span>
                <span className={item.change_pct >= 0 ? "text-[10px] font-medium text-emerald-600" : "text-[10px] font-medium text-red-600"}>
                  {formatPct(item.change_pct)}
                </span>
              </div>
            </div>
          ))
        )}
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
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  LogOut,
  Newspaper,
  Stethoscope,
  Calculator,
  Users,
  Users2,
  Monitor,
  ShieldCheck,
  Calendar,
  FileText,
  Award,
  DollarSign,
  Clock,
  Ticket,
  Settings,
  Search,
  ChevronRight,
  Menu,
  CalendarFold,
} from "lucide-react";
import { ThemeSwitch } from "@/components/ui/theme-switch-button";
import { NotificationInboxPopover } from "@/components/ui/notification-inbox-popover";
import { Sidebar, SidebarBody, SidebarLink, useSidebar } from "@/components/ui/sidebar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getCsrfToken } from "@/lib/csrf";
import { cn } from "@/lib/utils";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { InactivityWarningModal } from "@/components/InactivityWarningModal";
import { AnimatePresence } from "motion/react";

// ── Types ──────────────────────────────────────────────────────────────

interface UserData {
  id: number;
  idnumber: string;
  firstname: string | null;
  lastname: string | null;
  email: string;
  avatar: string | null;
  active: boolean;
  locked: boolean;
  change_password: boolean;
  admin: boolean;
  news: boolean;
  clinic: boolean;
  iad: boolean;
  accounting: boolean;
  hr: boolean;
  hr_manager: boolean;
  mis: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  is_approver: boolean;
}

type NavItem = {
  icon: React.ElementType;
  label: string;
  href: string;
  section?: string;
};

type AssessmentTab = 'training' | 'review' | 'survey-admin' | 'survey-my' | 'survey-templates' | null;

const STATIC_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: "Overview",         href: "/dashboard",                  section: "Management Information System" },
  { icon: Calendar,        label: "Calendar",          href: "/dashboard/calendar",          section: "Management Information System" },
  { icon: Award,           label: "Certificate",       href: "/dashboard/certification",       section: "Management Information System" },
  { icon: FileText,        label: "PR-Form",           href: "/dashboard/pr-form",           section: "Management Information System" },
  { icon: LayoutDashboard, label: "Assessments",       href: "/dashboard/assessments",       section: "Management Information System" },
  { icon: CalendarFold,    label: "Leave Requests",    href: "/dashboard/leave",             section: "Management Information System" },
  { icon: Ticket,          label: "MIS Ticket",        href: "/dashboard/mis-ticket",        section: "Management Information System" },
];

function buildNav(user: UserData): NavItem[] {
  const extra: NavItem[] = [];
  if (user.news)
    extra.push({ icon: Newspaper,   label: "News",       href: "/dashboard/news",       section: "Modules" });
  if (user.clinic)
    extra.push({ icon: Stethoscope, label: "Clinic",     href: "/dashboard/clinic",     section: "Modules" });
  if (user.admin || user.is_staff)
    extra.push({ icon: ShieldCheck, label: "Admin",      href: "/dashboard/admin",      section: "Modules" });

  const financeHref = (user.admin && user.accounting)
    ? '/dashboard/finance/admin'
    : '/dashboard/finance';

  const financeItem: NavItem = {
    icon: user.admin || user.accounting ? Calculator : DollarSign,
    label: user.admin || user.accounting ? "Accounting" : "Finances",
    href: financeHref,
    section: "Management Information System",
  };

  const base = STATIC_NAV.map((item) => {
      if (item.href === "/dashboard/certification" && (user.admin || user.hr)) {
        return { ...item, label: "Certification" };
      }
      if (item.href === "/dashboard/pr-form" && (user.admin || user.hr || user.accounting)) {
        return { ...item, label: "PR Request" };
      }
      return item;
    });

  // Insert Finances after Certificate / Assessments position to preserve order
  base.splice(4, 0, financeItem);

  const surveyItem: NavItem = {
    icon: FileText,
    label: user.iad
      ? "Surveys"
      : user.admin || user.hr
        ? "Survey Management"
        : "My Surveys",
    href: "/dashboard/assessments/survey",
    section: "Management Information System",
  };

  const assessmentsIndex = base.findIndex((item) => item.href === "/dashboard/assessments");
  if (assessmentsIndex >= 0) {
    base.splice(assessmentsIndex + 1, 0, surveyItem);
  } else {
    base.push(surveyItem);
  }

  // Move Leave Requests immediately after the finance item.
  const leaveIndex = base.findIndex((item) => item.href === "/dashboard/leave");
  const financeIndex = base.findIndex((item) => item.href === financeHref);
  if (leaveIndex >= 0 && financeIndex >= 0 && leaveIndex !== financeIndex + 1) {
    const [leaveItem] = base.splice(leaveIndex, 1);
    base.splice(financeIndex + 1, 0, leaveItem);
  }

  // Profile Settings is only visible to regular employees (not admin, hr, or accounting)
  if (!user.admin && !user.hr && !user.accounting) {
    base.push({ icon: Settings, label: "Profile Settings", href: "/dashboard/profile-settings", section: "Management Information System" });
  }

  // Employees tab is visible to admin and hr only. Insert after Leave Requests.
  if (user.admin || user.hr) {
    const employeesItem: NavItem = {
      icon: Users2,
      label: "Employees",
      href: "/dashboard/employees",
      section: "Human Resources",
    };
    const leaveIndex = base.findIndex((item) => item.href === "/dashboard/leave");
    if (leaveIndex >= 0) {
      base.splice(leaveIndex + 1, 0, employeesItem);
    } else {
      extra.push(employeesItem);
    }
  }

  return [...base, ...extra];
}

// ── Sidebar sub-components ─────────────────────────────────────────────

function SidebarUserCard({ user }: { user: UserData }) {
  const { open, animate } = useSidebar();
  const initials =
    `${user.firstname?.[0] ?? ""}${user.lastname?.[0] ?? ""}`.toUpperCase() ||
    user.idnumber[0].toUpperCase();
  const fullName =
    `${user.firstname ?? ""} ${user.lastname ?? ""}`.trim() || user.idnumber;
  return (
    <div className="flex items-center h-14 border-b border-[var(--color-border)] overflow-hidden shrink-0">
      <span className="flex h-14 w-[60px] shrink-0 items-center justify-center">
        <img
          src={user.avatar ?? "/default-avatar.png"}
          alt={fullName}
          className="h-8 w-8 rounded-full object-cover shrink-0"
        />
      </span>
      <motion.div
        initial={false}
        animate={{
          opacity: animate ? (open ? 1 : 0) : 1,
          maxWidth: animate ? (open ? 180 : 0) : 180,
        }}
        transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
        style={{ maxWidth: 180 }}
        className="overflow-hidden pr-3"
      >
        <p className="whitespace-nowrap text-xs font-semibold text-[var(--color-text-primary)] leading-tight">
          {fullName}
        </p>
        <p className="whitespace-nowrap text-[11px] text-[var(--color-text-muted)] leading-tight mt-0.5">
          {user.idnumber}
        </p>
      </motion.div>
    </div>
  );
}

// ── Leave accordion animation constants ──────────────────────────────

const SUB_CONTAINER_VARIANTS = {
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.02 } },
  hidden:  { transition: { staggerChildren: 0.04, staggerDirection: -1 as const } },
};

const SUB_ITEM_VARIANTS = {
  hidden:  { opacity: 0, y: -6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
  },
};

const LEAVE_SUB_ITEMS = [
  { label: "My Request",  href: "/dashboard/leave",                    tab: "request"  as const },
  { label: "Approvals", href: "/dashboard/leave?tab=approval-queue", tab: "approval" as const },
];

const ASSESSMENT_SUB_ITEMS = [
  { label: "Training Evaluation", href: "/dashboard/assessments/training-evaluation", tab: "training" as const },
  { label: "Performance Evaluation", href: "/dashboard/assessments/employee-review", tab: "review" as const },
];

function SidebarAssessmentAccordion({
  isExpanded,
  onToggle,
  pathname,
  activeTab,
  onSubClick,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  pathname: string;
  activeTab: AssessmentTab;
  onSubClick: (tab: AssessmentTab) => void;
}) {
  const { open: sidebarOpen, animate } = useSidebar();
  const onAssessments = pathname.startsWith("/dashboard/assessments");

  return (
    <Accordion
      type="single"
      collapsible
      value={isExpanded ? "assessments" : ""}
      onValueChange={(v) => {
        const nowOpen = v === "assessments";
        if (nowOpen !== isExpanded) onToggle();
      }}
    >
      <AccordionItem value="assessments">
        <AccordionTrigger
          className="h-10 rounded-lg
            text-[var(--color-text-muted)]
            hover:text-[var(--color-text-primary)]"
        >
          <span className="flex h-10 w-[40px] shrink-0 items-center justify-center">
            <LayoutDashboard size={18} className="shrink-0" />
          </span>
          <motion.div
            initial={false}
            animate={{
              opacity: animate ? (sidebarOpen ? 1 : 0) : 1,
              maxWidth: animate ? (sidebarOpen ? 160 : 0) : 160,
            }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="flex flex-1 items-center overflow-hidden"
          >
            <span className="flex-1 whitespace-nowrap text-xs font-medium text-left">Assessments</span>
            <span
              className="shrink-0 flex items-center justify-center mr-1
                transition-transform duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)]
                [[data-state=open]_&]:rotate-90"
            >
              <ChevronRight size={14} />
            </span>
          </motion.div>
        </AccordionTrigger>

        <AccordionContent>
          {sidebarOpen && (
            <motion.div
              variants={SUB_CONTAINER_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="mt-0.5 flex flex-col gap-0.5 pb-0.5"
            >
              {ASSESSMENT_SUB_ITEMS.map((item) => {
                const isActive = onAssessments && activeTab === item.tab;
                return (
                  <motion.div key={item.tab} variants={SUB_ITEM_VARIANTS}>
                    <Link
                      href={item.href}
                      onClick={() => onSubClick(item.tab)}
                      className={cn(
                        "flex items-center h-7 rounded-lg pr-3 pl-[42px] text-xs transition-colors duration-150",
                        isActive
                          ? "bg-[#2845D6]/10 text-[#2845D6]"
                          : "text-[var(--color-text-muted)] font-medium hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
                      )}
                    >
                      <span className="whitespace-nowrap">{item.label}</span>
                    </Link>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

// ── Leave accordion (approver-based) ─────────────────────────────────

function SidebarSurveyAccordion({
  currentSurveyView,
  activeTab,
  onSubClick,
  isIad = false,
}: {
  currentSurveyView: 'admin' | 'my' | null;
  activeTab: AssessmentTab;
  onSubClick: (tab: AssessmentTab) => void;
  isIad?: boolean;
}) {
  const { open: sidebarOpen, animate } = useSidebar();
  const [surveyAccordionOpen, setSurveyAccordionOpen] = useState(false);

  useEffect(() => {
    setSurveyAccordionOpen(currentSurveyView !== null || activeTab === 'survey-admin' || activeTab === 'survey-templates' || activeTab === 'survey-my');
  }, [currentSurveyView, activeTab]);

  const ALL_ITEMS = [
    { label: 'My Surveys', href: '/dashboard/assessments/survey?view=my', tab: 'survey-my' as const, iadOnly: true },
    { label: 'Survey Management', href: '/dashboard/assessments/survey-management', tab: 'survey-admin' as const, iadOnly: false },
    { label: 'Survey Templates', href: '/dashboard/assessments/survey-templates', tab: 'survey-templates' as const, iadOnly: false },
  ];
  const ITEMS = ALL_ITEMS.filter(item => !item.iadOnly || isIad);

  return (
    <Accordion
      type="single"
      collapsible
      value={surveyAccordionOpen ? 'survey' : ''}
      onValueChange={(v) => {
        const nowOpen = v === 'survey';
        setSurveyAccordionOpen(nowOpen);
      }}
    >
      <AccordionItem value="survey">
        <AccordionTrigger
          className="h-10 rounded-lg
            text-[var(--color-text-muted)]
            hover:text-[var(--color-text-primary)]"
        >
          <span className="flex h-10 w-[40px] shrink-0 items-center justify-center">
            <FileText size={18} className="shrink-0" />
          </span>
          <motion.div
            initial={false}
            animate={{
              opacity: animate ? (sidebarOpen ? 1 : 0) : 1,
              maxWidth: animate ? (sidebarOpen ? 160 : 0) : 160,
            }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="flex flex-1 items-center overflow-hidden"
          >
            <span className="flex-1 whitespace-nowrap text-xs font-medium text-left">Surveys</span>
            <span
              className="shrink-0 flex items-center justify-center mr-1
                transition-transform duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)]
                [[data-state=open]_&]:rotate-90"
            >
              <ChevronRight size={14} />
            </span>
          </motion.div>
        </AccordionTrigger>
        <AccordionContent>
          {sidebarOpen && (
            <motion.div
              variants={SUB_CONTAINER_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="mt-0.5 flex flex-col gap-0.5 pb-0.5"
            >
              {ITEMS.map((item) => {
                const isActive =
                  activeTab === item.tab;
                return (
                  <motion.div key={item.tab} variants={SUB_ITEM_VARIANTS}>
                    <Link
                      href={item.href}
                      onClick={() => onSubClick(item.tab)}
                      className={cn(
                        "flex items-center h-7 rounded-lg pr-3 pl-[42px] text-xs transition-colors duration-150",
                        isActive
                          ? "bg-[#2845D6]/10 text-[#2845D6]"
                          : "text-[var(--color-text-muted)] font-medium hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
                      )}
                    >
                      <span className="whitespace-nowrap">{item.label}</span>
                    </Link>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function SidebarLeaveAccordion({
  isExpanded,
  onToggle,
  pathname,
  activeTab,
  onSubClick,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  pathname: string;
  activeTab: "request" | "approval" | null;
  onSubClick: (tab: "request" | "approval") => void;
}) {
  const { open: sidebarOpen, animate } = useSidebar();
  const onLeave = pathname.startsWith("/dashboard/leave");

  return (
    <Accordion
      type="single"
      collapsible
      value={isExpanded ? "leave" : ""}
      onValueChange={(v) => {
        const nowOpen = v === "leave";
        if (nowOpen !== isExpanded) onToggle();
      }}
    >
      <AccordionItem value="leave">
        {/* Trigger — never highlighted; active state lives only on sub-items */}
        <AccordionTrigger
          className="h-10 rounded-lg
            text-[var(--color-text-muted)]
            hover:text-[var(--color-text-primary)]"
        >
          <span className="flex h-10 w-[40px] shrink-0 items-center justify-center">
            <CalendarFold size={18} className="shrink-0" />
          </span>
          <motion.div
            initial={false}
            animate={{
              opacity: animate ? (sidebarOpen ? 1 : 0) : 1,
              maxWidth: animate ? (sidebarOpen ? 160 : 0) : 160,
            }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="flex flex-1 items-center overflow-hidden"
          >
            <span className="flex-1 whitespace-nowrap text-xs font-medium text-left">Leave Filing</span>
            {/* Pure CSS rotate — no Framer layout, never stretches */}
            <span
              className="shrink-0 flex items-center justify-center mr-1
                transition-transform duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)]
                [[data-state=open]_&]:rotate-90"
            >
              <ChevronRight size={14} />
            </span>
          </motion.div>
        </AccordionTrigger>

        {/* Content — Radix drives height via --radix-accordion-content-height CSS var */}
        <AccordionContent>
          {sidebarOpen && (
            <motion.div
              variants={SUB_CONTAINER_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="mt-0.5 flex flex-col gap-0.5 pb-0.5"
            >
              {LEAVE_SUB_ITEMS.map((item) => {
                const isActive =
                  onLeave &&
                  (activeTab === null
                    ? item.tab === "request"
                    : activeTab === item.tab);
                return (
                  <motion.div key={item.tab} variants={SUB_ITEM_VARIANTS}>
                    <Link
                      href={item.href}
                      onClick={() => onSubClick(item.tab)}
                      className={cn(
                        "flex items-center h-7 rounded-lg pr-3 pl-[42px] text-xs transition-colors duration-150",
                        isActive
                          ? "bg-[#2845D6]/10 text-[#2845D6]"
                          : "text-[var(--color-text-muted)] font-medium hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
                      )}
                    >
                      <span className="whitespace-nowrap">{item.label}</span>
                    </Link>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function LogoutButton({ onLogout }: { onLogout: () => void }) {
  const { open, animate } = useSidebar();
  return (
    <button
      onClick={onLogout}
      title="Log Out"
      className="flex items-center h-10 w-full rounded-lg
        text-[var(--color-text-muted)]
        hover:bg-red-50 hover:text-red-600
        transition-colors duration-150"
    >
      <span className="flex h-10 w-[45px] shrink-0 items-center justify-center">
        <LogOut size={18} className="shrink-0" />
      </span>
      <motion.span
        animate={{
          opacity: animate ? (open ? 1 : 0) : 1,
          maxWidth: animate ? (open ? 180 : 0) : 180,
        }}
        transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
        className="overflow-hidden whitespace-nowrap text-xs font-medium"
      >
        Log Out
      </motion.span>
    </button>
  );
}

function DashboardSearchBar() {
  const [query, setQuery] = useState("");
  const suggestions = ["Certificates", "PR Form", "Leave Requests", "Calendar"];
  const hint = suggestions[new Date().getMinutes() % suggestions.length];
  return (
    <div className="relative hidden lg:flex items-center">
      <Search
        size={13}
        className="pointer-events-none absolute left-3 text-[var(--color-text-muted)]"
      />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search "${hint}"`}
        className="h-8 w-44 xl:w-56 rounded-lg border border-[var(--color-border)]
          bg-[var(--color-bg-elevated)] pl-8 pr-3 text-xs
          text-[var(--color-text-primary)]
          placeholder:text-[var(--color-text-muted)] placeholder:italic
          focus:outline-none focus:shadow-md focus:ring-0
          transition-all duration-200"
      />
    </div>
  );
}

// ── Shell ──────────────────────────────────────────────────────────────

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Leave accordion state (persists for session — layout never remounts) ──
  const [leaveAccordionOpen, setLeaveAccordionOpen] = useState(
    () => pathname.startsWith("/dashboard/leave")
  );
  const [lastLeaveTab, setLastLeaveTab] = useState<"request" | "approval" | null>(null);
  const [assessmentAccordionOpen, setAssessmentAccordionOpen] = useState(
    () => pathname.startsWith("/dashboard/assessments")
  );
  const [lastAssessmentTab, setLastAssessmentTab] = useState<AssessmentTab>(null);

  const searchParams = useSearchParams();
  const surveyView = searchParams?.get('view') === 'my' ? 'my' : searchParams?.get('view') === 'admin' ? 'admin' : null;

  useEffect(() => {
    if (pathname.startsWith("/dashboard/assessments/training-evaluation")) {
      setLastAssessmentTab('training');
    } else if (pathname.startsWith("/dashboard/assessments/employee-review")) {
      setLastAssessmentTab('review');
    } else if (pathname.startsWith("/dashboard/assessments/survey-templates")) {
      setLastAssessmentTab('survey-templates');
    } else if (pathname.startsWith("/dashboard/assessments/survey-management")) {
      setLastAssessmentTab('survey-admin');
    } else if (pathname.startsWith("/dashboard/assessments/survey")) {
      if (surveyView === 'my' || (!user?.admin && !user?.hr && !user?.iad)) {
        setLastAssessmentTab('survey-my');
      } else {
        setLastAssessmentTab('survey-admin');
      }
    } else {
      setLastAssessmentTab(null);
    }
  }, [pathname, surveyView, user]);

  // Reset last-clicked tab tracking when navigating away from leave pages
  useEffect(() => {
    if (!pathname.startsWith("/dashboard/leave")) {
      setLastLeaveTab(null);
    }
  }, [pathname]);

  // ── Inactivity timeout ────────────────────────────────────────────────
  const handleInactivityTimeout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRFToken": getCsrfToken() },
      });
    } catch { /* silent — navigate regardless */ }
    window.location.href = "/";
  }, []);

  const { showWarning, secondsLeft, resetTimer } = useInactivityTimeout(handleInactivityTimeout);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status === 401) { router.replace("/"); return; }
      if (res.ok) setUser(await res.json());
      else router.replace("/");
    } catch {
      router.replace("/");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  // ── Force password-change guard ──────────────────────────────────────────
  // If the user's change_password flag is set, they must change it before
  // accessing any other page.
  useEffect(() => {
    if (!user) return;
    if (user.change_password && pathname !== '/dashboard/change-password') {
      router.replace('/dashboard/change-password');
    }
  }, [user, pathname, router]);

  // ── Silent token refresh ─────────────────────────────────────────────────
  // Proactively refresh the access token every 12 minutes to prevent API calls
  // from receiving 401 errors due to the 15-minute JWT access-token expiry.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        await fetch('/api/auth/token/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRFToken': getCsrfToken() },
        });
      } catch { /* silent — if refresh fails the next protected API call will redirect */ }
    }, 12 * 60 * 1000); // every 12 minutes
    return () => clearInterval(id);
  }, []);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRFToken": getCsrfToken() },
      });
    } catch { /* silent — navigate regardless */ }
    // Hard navigate so the landing page re-mounts fresh (restarts Three.js animation).
    window.location.href = "/";
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-bg)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-[#2845D6] border-t-transparent animate-spin" />
          <p className="text-xs text-[var(--color-text-muted)]">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const navItems = buildNav(user);
  const activeItem =
    navItems.find((n) => n.href === pathname) ??
    navItems.find((n) => pathname.startsWith(n.href + "/")) ??
    navItems[0];
  // Breadcrumb shows only the page label (not the section)
  const breadcrumb = activeItem.label;

  // A user can access the leave approval queue if they have
  // a role-group (clinic/iad), or are designated as an approver in WorkInformation.
  // Admin/HR get a dedicated single "Leave Approval" link via an earlier branch.
  const isLeaveApprover =
    user.is_approver || user.clinic || user.iad;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--color-bg)]">

      {/* ── FULL-WIDTH NAVBAR ── */}
      <header
        className="flex h-14 shrink-0 items-center gap-3
          border-b border-[var(--color-border)]
          bg-[var(--color-bg-elevated)] px-5 z-10"
      >
        {/* Mobile: hamburger */}
        <button
          className="md:hidden flex items-center justify-center h-8 w-8 rounded-lg
            text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label="Toggle sidebar"
        >
          <Menu size={18} />
        </button>

        {/* Logo */}
        <span className="flex items-center text-lg font-black tracking-tight shrink-0">
          <span className="text-[#2845D6]">REP</span>
          <span className="text-[var(--color-text-primary)]">Connect</span>
        </span>

        {/* Divider */}
        <span className="h-5 w-px bg-[var(--color-border)] shrink-0" />

        {/* Breadcrumb — hidden on mobile */}
        <div className="hidden sm:flex items-center gap-1.5 min-w-0 mr-auto">
          <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
            {breadcrumb}
          </span>
        </div>

        {/* Spacer on mobile */}
        <div className="flex-1 sm:hidden" />

        {/* Search — hidden below lg */}
        <DashboardSearchBar />

        <NotificationInboxPopover />
        <ThemeSwitch />
      </header>

      {/* ── CONTENT ROW ── */}
      <div className="relative flex flex-1 overflow-hidden">

        <Sidebar open={sidebarOpen} setOpen={setSidebarOpen}>
          <SidebarBody className="py-0">
            <SidebarUserCard user={user} />
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex flex-col gap-0.5">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  // Assessment accordion uses only training and review.
                  if (item.href === "/dashboard/assessments") {
                    return (
                      <SidebarAssessmentAccordion
                        key="assessments-accordion"
                        isExpanded={assessmentAccordionOpen}
                        onToggle={() => {
                          setAssessmentAccordionOpen((v) => !v);
                          setLeaveAccordionOpen(false);
                        }}
                        pathname={pathname}
                        activeTab={lastAssessmentTab}
                        onSubClick={(tab) => setLastAssessmentTab(tab)}
                      />
                    );
                  }

                  if (item.href === "/dashboard/assessments/survey") {
                    if (user.iad || user.admin || user.hr) {
                      return (
                        <SidebarSurveyAccordion
                          key="survey-accordion"
                          currentSurveyView={surveyView}
                          activeTab={lastAssessmentTab}
                          onSubClick={(tab) => setLastAssessmentTab(tab)}
                          isIad={user.iad}
                        />
                      );
                    }
                    return (
                      <SidebarLink
                        key={item.href}
                        link={{
                          label: item.label,
                          href: item.href + "?view=my",
                          icon: <Icon size={18} className="shrink-0" />,
                        }}
                        active={pathname.startsWith('/dashboard/assessments/survey')}
                      />
                    );
                  }

                  if (item.href === "/dashboard/leave") {
                    if (user.admin || user.hr) {
                      return (
                        <SidebarLink
                          key="leave-approval"
                          link={{
                            label: "Leave Approval",
                            href: "/dashboard/leave?tab=approval-queue",
                            icon: <CalendarFold size={18} className="shrink-0" />,
                          }}
                          active={pathname === "/dashboard/leave"}
                        />
                      );
                    }
                    if (isLeaveApprover) {
                      return (
                        <SidebarLeaveAccordion
                          key="leave-accordion"
                          isExpanded={leaveAccordionOpen}
                          onToggle={() => {
                            setLeaveAccordionOpen((v) => !v);
                            setAssessmentAccordionOpen(false);
                          }}
                          pathname={pathname}
                          activeTab={lastLeaveTab}
                          onSubClick={(tab) => setLastLeaveTab(tab)}
                        />
                      );
                    }
                  }

                  return (
                    <SidebarLink
                      key={item.href}
                      link={{
                        label: item.label,
                        href: item.href,
                        icon: <Icon size={18} className="shrink-0" />,
                      }}
                      active={pathname === item.href}
                    />
                  );
                })}
              </div>
            </div>
            <div className="shrink-0 border-t border-[var(--color-border)] py-2 px-2">
              <LogoutButton onLogout={handleLogout} />
            </div>
          </SidebarBody>
        </Sidebar>

        {/* Main — pl-[60px] reserves collapsed sidebar space on desktop */}
        <div className="flex-1 overflow-y-auto md:pl-[60px]">
          {children}
        </div>
      </div>

      {/* ── Inactivity warning modal ── */}
      <AnimatePresence>
        {showWarning && (
          <InactivityWarningModal
            secondsLeft={secondsLeft}
            onCancel={resetTimer}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

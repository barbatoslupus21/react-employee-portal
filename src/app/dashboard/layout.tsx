"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  LogOut,
  Megaphone,
  Calculator,
  MessageSquare,
  Users,
  Users2,
  Monitor,
  Calendar,
  FileText,
  Award,
  DollarSign,
  Clock,
  Ticket,
  Settings,
  Search,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Menu,
  CalendarFold,
  GraduationCap,
  X,
} from "lucide-react";
import { AIChatPanel, RobotNavButton } from "@/components/ui/ai-chat-panel";
import { DottedSurface } from "@/components/ui/dotted-surface";
import { SystemFeedbackModal } from "@/components/SystemFeedbackModal";
import { WhatIsNewModal } from "@/components/WhatIsNewModal";
import { Balloons } from "@/components/screen-effects/Balloons";
import { HappyBirthdayModal } from "@/components/HappyBirthdayModal";
import { ThemeSwitch } from "@/components/ui/theme-switch-button";
import { NotificationInboxPopover } from "@/components/ui/notification-inbox-popover";
import { Sidebar, SidebarBody, SidebarLink, useSidebar } from "@/components/ui/sidebar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getCsrfToken } from "@/lib/csrf";
import { cn } from "@/lib/utils";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { InactivityWarningModal } from "@/components/InactivityWarningModal";
import { AnimatePresence } from "motion/react";
import { NavigationGuardProvider, type NavGuardHandle } from "@/lib/navigation-guard-context";

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
  employment_type_name: string | null;
  date_hired: string | null;
  birth_date?: string | null;
}

type NavItem = {
  icon: React.ElementType;
  label: string;
  href: string;
  section?: string;
};

type AssessmentTab = 'survey-admin' | 'survey-my' | 'survey-templates' | null;
type TrainingTab = 'training-evaluation' | 'training-approval' | null;
type EmployeeEvalTab = 'self-evaluation' | 'employee-evaluation' | null;

const STATIC_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: "Overview",         href: "/dashboard",                  section: "Management Information System" },
  { icon: Calendar,        label: "Calendar",          href: "/dashboard/calendar",          section: "Management Information System" },
  { icon: Award,           label: "Certificate",       href: "/dashboard/certification",       section: "Management Information System" },
  { icon: FileText,        label: "PR-Form",           href: "/dashboard/pr-form",           section: "Management Information System" },
  { icon: CalendarFold,    label: "Leave Requests",    href: "/dashboard/leave",             section: "Management Information System" },
  { icon: Ticket,          label: "MIS Ticket",        href: "/dashboard/mis-ticket",        section: "Management Information System" },
];

// Static breadcrumb labels for routes that have no direct nav item entry.
const STATIC_BREADCRUMBS: Record<string, string> = {
  '/dashboard/leave/admin':                               'Leave Approval',
  '/dashboard/assessments/survey-management':             'Survey Management',
  '/dashboard/assessments/survey-templates':              'Survey Templates',
};

function isEvalEligible(user: UserData, periodStartDate: string | null): boolean {
  const empType = (user.employment_type_name ?? '').toLowerCase();
  if (/probationary|ojt|on.job|on.the.job/.test(empType)) return false;
  if (/regular/.test(empType) && user.date_hired && periodStartDate) {
    const hired = new Date(user.date_hired);
    const periodStart = new Date(periodStartDate);
    const ineligibleFrom = new Date(periodStart.getFullYear(), periodStart.getMonth() - 1, 1);
    if (hired >= ineligibleFrom) return false;
  }
  return true;
}

function buildNav(user: UserData, activePeriodStart: string | null): NavItem[] {
  const extra: NavItem[] = [];
  if (user.admin || user.hr || user.accounting) {
    extra.push({ icon: Megaphone,   label: "Announcements", href: "/dashboard/announcements", section: "Modules" });
  }
  if (user.admin || user.hr) {
    extra.push({ icon: Settings, label: "System Settings", href: "/dashboard/system-settings", section: "Modules" });
  }
  if (user.admin) {
    extra.push({ icon: MessageSquare, label: "Feedback", href: "/dashboard/feedback", section: "Modules" });
  }

  const financeHref = user.accounting
    ? '/dashboard/finance/admin'
    : '/dashboard/finance';

  const financeItem: NavItem = {
    icon: user.admin || user.accounting ? Calculator : DollarSign,
    label: user.admin || user.accounting ? "Accounting" : "Finances",
    href: financeHref,
    section: "Management Information System",
  };

  const base = STATIC_NAV.map((item) => {
      if (item.href === "/dashboard/certification") {
        if (user.accounting && !user.hr) {
          return null;
        }
        if (user.admin || user.hr) {
          return { ...item, label: "Certification" };
        }
      }
      if (item.href === "/dashboard/pr-form" && (user.admin || user.hr || user.accounting)) {
        return { ...item, href: "/dashboard/pr-form/admin", label: "PR Request" };
      }
      if (item.href === "/dashboard/mis-ticket") {
        return {
          ...item,
          href: user.mis ? "/dashboard/mis-ticket/admin" : "/dashboard/mis-ticket",
          label: user.mis ? "MIS Ticket Admin" : "MIS Ticket",
        };
      }
      return item;
    }).filter((item): item is NavItem => item !== null);

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

  const leaveIdxForSurvey = base.findIndex((item) => item.href === "/dashboard/leave");
  if (leaveIdxForSurvey >= 0) {
    base.splice(leaveIdxForSurvey + 1, 0, surveyItem);
  } else {
    base.push(surveyItem);
  }

  // Training Evaluation — hidden only for accounting-only users.
  if (!(user.accounting && !user.admin && !user.hr)) {
    const trainingEvalItem: NavItem = {
      icon: GraduationCap,
      label: "Training Evaluation",
      href: "/dashboard/assessments/training-evaluation",
      section: "Management Information System",
    };
    const surveyIdx = base.findIndex((item) => item.href === "/dashboard/assessments/survey");
    const insertAfterIdx = surveyIdx >= 0
      ? surveyIdx
      : base.findIndex((item) => item.href === "/dashboard/leave");
    if (insertAfterIdx >= 0) {
      base.splice(insertAfterIdx + 1, 0, trainingEvalItem);
    } else {
      base.push(trainingEvalItem);
    }
    // Training Approval — breadcrumb entry for approver non-admin/hr users only.
    if (user.is_approver && !user.admin && !user.hr) {
      const trainingApprovalItem: NavItem = {
        icon: GraduationCap,
        label: "Training Approval",
        href: "/dashboard/assessments/training-approval",
        section: "Management Information System",
      };
      const evalIdx = base.findIndex((item) => item.href === "/dashboard/assessments/training-evaluation");
      if (evalIdx >= 0) {
        base.splice(evalIdx + 1, 0, trainingApprovalItem);
      } else {
        base.push(trainingApprovalItem);
      }
    }
  }

  // Employee Evaluation — hidden only for accounting-only users.
  if (!(user.accounting && !user.admin && !user.hr)) {
    if (user.admin || user.hr) {
      // Admin/HR: single "Employee Evaluation" button → admin-facing management page.
      const empEvalAdminItem: NavItem = {
        icon: Users2,
        label: 'Employee Evaluation',
        href: '/dashboard/assessments/employee-review',
        section: 'Management Information System',
      };
      const trainingEvalIdxA = base.findIndex((item) => item.href === '/dashboard/assessments/training-evaluation');
      const insertEvalAfterA = trainingEvalIdxA >= 0 ? trainingEvalIdxA : base.findIndex((item) => item.href === '/dashboard/assessments/survey');
      if (insertEvalAfterA >= 0) {
        base.splice(insertEvalAfterA + 1, 0, empEvalAdminItem);
      } else {
        base.push(empEvalAdminItem);
      }
    } else if (user.is_approver) {
      // Approver: accordion with Self Evaluation + Employee Evaluation sub-items.
      const selfEvalItem: NavItem = {
        icon: Users,
        label: 'Self Evaluation',
        href: '/dashboard/assessments/self-evaluation',
        section: 'Management Information System',
      };
      const empEvalApproverItem: NavItem = {
        icon: Users2,
        label: 'Employee Evaluation',
        href: '/dashboard/assessments/employee-evaluation',
        section: 'Management Information System',
      };
      const trainingApprovalIdxB = base.findIndex((item) => item.href === '/dashboard/assessments/training-approval');
      const trainingEvalIdxB = base.findIndex((item) => item.href === '/dashboard/assessments/training-evaluation');
      const insertEvalAfterB = trainingApprovalIdxB >= 0 ? trainingApprovalIdxB : trainingEvalIdxB >= 0 ? trainingEvalIdxB : base.findIndex((item) => item.href === '/dashboard/assessments/survey');
      if (insertEvalAfterB >= 0) {
        if (isEvalEligible(user, activePeriodStart)) {
          base.splice(insertEvalAfterB + 1, 0, selfEvalItem, empEvalApproverItem);
        } else {
          base.splice(insertEvalAfterB + 1, 0, empEvalApproverItem);
        }
      } else {
        if (isEvalEligible(user, activePeriodStart)) {
          base.push(selfEvalItem, empEvalApproverItem);
        } else {
          base.push(empEvalApproverItem);
        }
      }
    } else {
      // Standard user: single "Self Evaluation" button.
      const selfEvalStandardItem: NavItem = {
        icon: Users,
        label: 'Self Evaluation',
        href: '/dashboard/assessments/self-evaluation',
        section: 'Management Information System',
      };
      const trainingEvalIdxC = base.findIndex((item) => item.href === '/dashboard/assessments/training-evaluation');
      const insertEvalAfterC = trainingEvalIdxC >= 0 ? trainingEvalIdxC : base.findIndex((item) => item.href === '/dashboard/assessments/survey');
      if (isEvalEligible(user, activePeriodStart)) {
        if (insertEvalAfterC >= 0) {
          base.splice(insertEvalAfterC + 1, 0, selfEvalStandardItem);
        } else {
          base.push(selfEvalStandardItem);
        }
      }
    }
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

    // For admin/hr, move surveys and training links after Employees.
    const employeeIndex = base.findIndex((item) => item.href === '/dashboard/employees');
    if (employeeIndex >= 0) {
      const afterEmployees: NavItem[] = [];
      for (const href of [
        '/dashboard/assessments/survey',
        '/dashboard/assessments/training-evaluation',
        '/dashboard/assessments/employee-review',
      ]) {
        const idx = base.findIndex((item) => item.href === href);
        if (idx >= 0) {
          afterEmployees.push(...base.splice(idx, 1));
        }
      }
      if (afterEmployees.length > 0) {
        base.splice(employeeIndex + 1, 0, ...afterEmployees);
      }
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

// ── Survey badge helper ───────────────────────────────────────────────

function surveyItemIsActionRequired(item: {
  status: string;
  is_complete: boolean;
  start_date: string | null;
  end_date: string | null;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = item.start_date ? new Date(item.start_date + 'T00:00:00') : null;
  const end = item.end_date ? new Date(item.end_date + 'T23:59:59') : null;
  if (item.status === 'draft' || item.status === 'closed') return false;
  if (end && today > end) return false;
  if (start && today < start) return false;
  if (item.is_complete) return false;
  return true;
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


const TRAINING_SUB_ITEMS = [
  { label: "Training Evaluation", href: "/dashboard/assessments/training-evaluation", tab: "training-evaluation" as const },
  { label: "Training Approval",   href: "/dashboard/assessments/training-approval",   tab: "training-approval"   as const },
];


// ── Leave accordion (approver-based) ─────────────────────────────────

function SidebarSurveyAccordion({
  currentSurveyView,
  activeTab,
  onSubClick,
  showMySurveys = false,
  surveyBadgeCount = 0,
}: {
  currentSurveyView: 'admin' | 'my' | null;
  activeTab: AssessmentTab;
  onSubClick: (tab: AssessmentTab) => void;
  showMySurveys?: boolean;
  surveyBadgeCount?: number;
}) {
  const { open: sidebarOpen, animate } = useSidebar();
  const surveyContextActive =
    currentSurveyView !== null ||
    activeTab === 'survey-admin' ||
    activeTab === 'survey-templates' ||
    activeTab === 'survey-my';
  const [surveyAccordionOpen, setSurveyAccordionOpen] = useState(surveyContextActive);
  const effectiveSurveyAccordionOpen = surveyContextActive || surveyAccordionOpen;

  const ALL_ITEMS = [
    { label: 'My Surveys', href: '/dashboard/assessments/survey?view=my', tab: 'survey-my' as const, iadOnly: true },
    { label: 'Survey Management', href: '/dashboard/assessments/survey-management', tab: 'survey-admin' as const, iadOnly: false },
    { label: 'Survey Templates', href: '/dashboard/assessments/survey-templates', tab: 'survey-templates' as const, iadOnly: false },
  ];
  const ITEMS = ALL_ITEMS.filter(item => !item.iadOnly || showMySurveys);

  return (
    <Accordion
      type="single"
      collapsible
      value={effectiveSurveyAccordionOpen ? 'survey' : ''}
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
          <span className="relative flex h-10 w-[40px] shrink-0 items-center justify-center">
            <FileText size={18} className="shrink-0" />
            {surveyBadgeCount > 0 && showMySurveys && !sidebarOpen && (
              <span
                className="absolute h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
                style={{ top: '8px', right: '8px' }}
              />
            )}
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
                        "relative flex items-center h-7 rounded-lg pr-3 pl-[42px] text-xs transition-colors duration-150",
                        isActive
                          ? "bg-[#2845D6]/10 text-[#2845D6]"
                          : "text-[var(--color-text-muted)] font-medium hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
                      )}
                    >
                      <span className="flex-1 whitespace-nowrap">{item.label}</span>
                      {item.tab === 'survey-my' && surveyBadgeCount > 0 && (
                        <span className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-1.5 h-[18px] text-[10px] font-semibold text-[var(--color-text-muted)] min-w-[18px]">
                          {surveyBadgeCount}
                        </span>
                      )}
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
  requestBadgeCount = 0,
  approvalBadgeCount = 0,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  pathname: string;
  activeTab: "request" | "approval" | null;
  onSubClick: (tab: "request" | "approval") => void;
  requestBadgeCount?: number;
  approvalBadgeCount?: number;
}) {
  const { open: sidebarOpen, animate } = useSidebar();
  const onLeave = pathname.startsWith("/dashboard/leave");
  const totalBadge = requestBadgeCount + approvalBadgeCount;
  const subBadgeMap: Record<string, number> = {
    request: requestBadgeCount,
    approval: approvalBadgeCount,
  };

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
          <span className="relative flex h-10 w-[40px] shrink-0 items-center justify-center">
            <CalendarFold size={18} className="shrink-0" />
            {totalBadge > 0 && !sidebarOpen && (
              <span
                className="absolute h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
                style={{ top: '8px', right: '8px' }}
              />
            )}
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
                        "flex items-center justify-between h-7 rounded-lg pr-3 pl-[42px] text-xs transition-colors duration-150",
                        isActive
                          ? "bg-[#2845D6]/10 text-[#2845D6]"
                          : "text-[var(--color-text-muted)] font-medium hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
                      )}
                    >
                      <span className="whitespace-nowrap">{item.label}</span>
                      {(subBadgeMap[item.tab] ?? 0) > 0 && (
                        <span className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-1.5 h-[18px] text-[10px] font-semibold text-[var(--color-text-muted)] min-w-[18px]">
                          {subBadgeMap[item.tab]}
                        </span>
                      )}
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

function SidebarTrainingAccordion({
  isExpanded,
  onToggle,
  pathname,
  activeTab,
  onSubClick,
  trainingApprovalBadgeCount = 0,
  trainingEvalBadgeCount = 0,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  pathname: string;
  activeTab: TrainingTab;
  onSubClick: (tab: TrainingTab) => void;
  trainingApprovalBadgeCount?: number;
  trainingEvalBadgeCount?: number;
}) {
  const { open: sidebarOpen, animate } = useSidebar();
  const onTraining = pathname.startsWith("/dashboard/assessments/training");
  const totalBadge = trainingApprovalBadgeCount + trainingEvalBadgeCount;

  // Per-tab badge counts for sub-items
  const subBadgeMap: Record<string, number> = {
    'training-evaluation': trainingEvalBadgeCount,
    'training-approval':   trainingApprovalBadgeCount,
  };

  return (
    <Accordion
      type="single"
      collapsible
      value={isExpanded ? "training" : ""}
      onValueChange={(v) => {
        const nowOpen = v === "training";
        if (nowOpen !== isExpanded) onToggle();
      }}
    >
      <AccordionItem value="training">
        <AccordionTrigger
          className="h-10 rounded-lg
            text-[var(--color-text-muted)]
            hover:text-[var(--color-text-primary)]"
        >
          {/* Icon with dot badge when collapsed */}
          <span className="relative flex h-10 w-[40px] shrink-0 items-center justify-center">
            <GraduationCap size={18} className="shrink-0" />
            {totalBadge > 0 && !sidebarOpen && (
              <span
                className="absolute h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
                style={{ top: '8px', right: '8px' }}
              />
            )}
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
            <span className="flex-1 whitespace-nowrap text-xs font-medium text-left">Training</span>
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
              {TRAINING_SUB_ITEMS.map((item) => {
                const isActive = onTraining && activeTab === item.tab;
                const badgeCount = subBadgeMap[item.tab] ?? 0;
                return (
                  <motion.div key={item.tab} variants={SUB_ITEM_VARIANTS}>
                    <Link
                      href={item.href}
                      onClick={() => onSubClick(item.tab)}
                      className={cn(
                        "flex items-center justify-between h-7 rounded-lg pr-3 pl-[42px] text-xs transition-colors duration-150",
                        isActive
                          ? "bg-[#2845D6]/10 text-[#2845D6]"
                          : "text-[var(--color-text-muted)] font-medium hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
                      )}
                    >
                      <span className="whitespace-nowrap">{item.label}</span>
                      {badgeCount > 0 && (
                        <span className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-1.5 h-[18px] text-[10px] font-semibold text-[var(--color-text-muted)] min-w-[18px]">
                          {badgeCount}
                        </span>
                      )}
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

function SidebarEmployeeEvalAccordion({
  isExpanded,
  onToggle,
  pathname,
  activeTab,
  onSubClick,
  selfEvalBadgeCount,
  empEvalApproverBadgeCount = 0,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  pathname: string;
  activeTab: EmployeeEvalTab;
  onSubClick: (tab: EmployeeEvalTab) => void;
  selfEvalBadgeCount?: number;
  empEvalApproverBadgeCount?: number;
}) {
  const { open: sidebarOpen, animate } = useSidebar();
  const onEmpEval =
    pathname.startsWith('/dashboard/assessments/self-evaluation') ||
    pathname.startsWith('/dashboard/assessments/employee-evaluation');

  const totalBadge = (selfEvalBadgeCount ?? 0) + empEvalApproverBadgeCount;

  const EMPLOYEE_EVAL_SUB_ITEMS = [
    { label: 'Self Evaluation',     href: '/dashboard/assessments/self-evaluation',   tab: 'self-evaluation'   as const },
    { label: 'Employee Evaluation', href: '/dashboard/assessments/employee-evaluation', tab: 'employee-evaluation' as const },
  ];

  const subBadgeMap: Record<string, number> = {
    'self-evaluation':     selfEvalBadgeCount ?? 0,
    'employee-evaluation': empEvalApproverBadgeCount,
  };

  return (
    <Accordion
      type="single"
      collapsible
      value={isExpanded ? 'employee-eval' : ''}
      onValueChange={(v) => {
        const nowOpen = v === 'employee-eval';
        if (nowOpen !== isExpanded) onToggle();
      }}
    >
      <AccordionItem value="employee-eval">
        <AccordionTrigger
          className="h-10 rounded-lg
            text-[var(--color-text-muted)]
            hover:text-[var(--color-text-primary)]"
        >
          {/* Icon with dot badge when collapsed */}
          <span className="relative flex h-10 w-[40px] shrink-0 items-center justify-center">
            <Users2 size={18} className="shrink-0" />
            {totalBadge > 0 && !sidebarOpen && (
              <span
                className="absolute h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
                style={{ top: '8px', right: '8px' }}
              />
            )}
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
            <span className="flex-1 whitespace-nowrap text-xs font-medium text-left">Employee Evaluation</span>
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
              {EMPLOYEE_EVAL_SUB_ITEMS.map((item) => {
                const isActive = onEmpEval && activeTab === item.tab;
                const badgeCount = subBadgeMap[item.tab] ?? 0;
                return (
                  <motion.div key={item.tab} variants={SUB_ITEM_VARIANTS}>
                    <Link
                      href={item.href}
                      onClick={() => onSubClick(item.tab)}
                      className={cn(
                        'flex items-center justify-between h-7 rounded-lg pr-3 pl-[42px] text-xs transition-colors duration-150',
                        isActive
                          ? 'bg-[#2845D6]/10 text-[#2845D6]'
                          : 'text-[var(--color-text-muted)] font-medium hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]'
                      )}
                    >
                      <span className="whitespace-nowrap">{item.label}</span>
                      {badgeCount > 0 && (
                        <span className="inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-1.5 h-[18px] text-[10px] font-semibold text-[var(--color-text-muted)] min-w-[18px]">
                          {badgeCount > 99 ? '99+' : badgeCount}
                        </span>
                      )}
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
          focus:outline-none focus:ring-0
          transition-all duration-200"
      />
    </div>
  );
}

// ── Shell ──────────────────────────────────────────────────────────────

function SearchParamsReader({ onSurveyView }: { onSurveyView: (v: 'my' | 'admin' | null) => void }) {
  const searchParams = useSearchParams();
  const view = searchParams?.get('view');
  const surveyView: 'my' | 'admin' | null = view === 'my' ? 'my' : view === 'admin' ? 'admin' : null;
  useEffect(() => { onSurveyView(surveyView); }, [surveyView, onSurveyView]);
  return null;
}

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
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);
  const [showSidebarScrollTop, setShowSidebarScrollTop] = useState(false);
  const [showSidebarScrollBottom, setShowSidebarScrollBottom] = useState(false);

  // ── Leave accordion state (persists for session — layout never remounts) ──
  const [leaveAccordionOpen, setLeaveAccordionOpen] = useState(
    () => pathname.startsWith("/dashboard/leave")
  );
  const [lastLeaveTab, setLastLeaveTab] = useState<"request" | "approval" | null>(null);
  const [lastAssessmentTab, setLastAssessmentTab] = useState<AssessmentTab>(null);
  const [trainingAccordionOpen, setTrainingAccordionOpen] = useState(
    () => pathname.startsWith("/dashboard/assessments/training")
  );
  const [lastTrainingTab, setLastTrainingTab] = useState<TrainingTab>(null);
  const [employeeEvalAccordionOpen, setEmployeeEvalAccordionOpen] = useState(
    () =>
      pathname.startsWith('/dashboard/assessments/self-evaluation') ||
      pathname.startsWith('/dashboard/assessments/employee-evaluation'),
  );
  const [lastEmployeeEvalTab, setLastEmployeeEvalTab] = useState<EmployeeEvalTab>(null);

  // ── Navigation guard state ───────────────────────────────────────────────────
  const navGuardRef = useRef<NavGuardHandle | null>(null);
  const [showNavGuardModal, setShowNavGuardModal] = useState(false);
  const [pendingNavHref, setPendingNavHref] = useState('');
  const [navGuardSubmitting, setNavGuardSubmitting] = useState(false);
  const [pendingLogout, setPendingLogout] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [updatesModalOpen, setUpdatesModalOpen] = useState(false);
  const [happyBirthdayOpen, setHappyBirthdayOpen] = useState(false);
  const [birthdaySeen, setBirthdaySeen] = useState(false);
  const [balloonsLaunched, setBalloonsLaunched] = useState(false);
  const balloonsRef = useRef<{ launchAnimation: () => void } | null>(null);
  const birthdayTimerRef = useRef<number | null>(null);

  const registerGuard = useCallback((handle: NavGuardHandle | null) => {
    navGuardRef.current = handle;
  }, []);

  useEffect(() => {
    const node = sidebarScrollRef.current;
    if (!node) return;

    const updateSidebarScrollIndicators = () => {
      const { scrollTop, scrollHeight, clientHeight } = node;
      setShowSidebarScrollTop(scrollTop > 8);
      setShowSidebarScrollBottom(scrollTop + clientHeight < scrollHeight - 8);
    };

    updateSidebarScrollIndicators();
    node.addEventListener('scroll', updateSidebarScrollIndicators);
    window.addEventListener('resize', updateSidebarScrollIndicators);

    return () => {
      node.removeEventListener('scroll', updateSidebarScrollIndicators);
      window.removeEventListener('resize', updateSidebarScrollIndicators);
    };
  }, [sidebarOpen, user]);

  // ── Survey action-required badge ─────────────────────────────────────────
  const [actionRequiredCount, setActionRequiredCount] = useState(0);
  const [certBadgeCount, setCertBadgeCount] = useState(0);
  const [prfBadgeCount, setPrfBadgeCount] = useState(0);
  const [misBadgeCount, setMisBadgeCount] = useState(0);
  const [financeBadgeCount, setFinanceBadgeCount] = useState(0);
  const [calendarBadgeCount, setCalendarBadgeCount] = useState(0);
  const [trainingApprovalBadgeCount, setTrainingApprovalBadgeCount] = useState(0);
  const [trainingEvalBadgeCount, setTrainingEvalBadgeCount] = useState(0);
  const [selfEvalBadgeCount, setSelfEvalBadgeCount] = useState(0);
  const [empEvalApproverBadgeCount, setEmpEvalApproverBadgeCount] = useState(0);
  const [leaveMyBadgeCount, setLeaveMyBadgeCount] = useState(0);
  const [leaveApprovalBadgeCount, setLeaveApprovalBadgeCount] = useState(0);
  const [activePeriodStart, setActivePeriodStart] = useState<string | null>(null);

  const fetchSurveyBadge = useCallback(async () => {
    try {
      const res = await fetch('/api/survey/my-surveys', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const items: { status: string; is_complete: boolean; start_date: string | null; end_date: string | null }[] =
        Array.isArray(data) ? data : (data.results ?? []);
      setActionRequiredCount(items.filter(surveyItemIsActionRequired).length);
    } catch { /* silent */ }
  }, []);

  const fetchCertBadge = useCallback(async () => {
    try {
      const res = await fetch('/api/certificates/my', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const items: { is_new?: boolean }[] = Array.isArray(data) ? data : (data.results ?? []);
      setCertBadgeCount(items.filter((cert) => cert.is_new).length);
    } catch { /* silent */ }
  }, []);

  const fetchTrainingApprovalBadge = useCallback(async (currentUser: UserData | null) => {
    if (!currentUser || !currentUser.is_approver || currentUser.admin || currentUser.hr) return;
    try {
      const res = await fetch('/api/training/approver/badge', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setTrainingApprovalBadgeCount(typeof data.count === 'number' ? data.count : 0);
    } catch { /* silent */ }
  }, []);

  function getTrainingStatus(dateStr: string) {
    if (!dateStr) return 'closed';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = dateStr.split('-').map(Number);
    const trainingDate = new Date(y, m - 1, d);
    if (trainingDate > today) return 'scheduled';
    if (trainingDate.getTime() === today.getTime()) return 'active';
    return 'closed';
  }

  const fetchTrainingEvalBadge = useCallback(async (currentUser: UserData | null) => {
    // Only standard users (not admin/hr) see the training eval badge
    if (!currentUser || currentUser.admin || currentUser.hr) return;
    try {
      const res = await fetch('/api/training/my', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const items: { is_complete: boolean; training_date: string; status?: string | null; requires_action?: boolean }[] = Array.isArray(data) ? data : (data.results ?? []);
      const count = items.filter(item => {
        if (item.requires_action || item.status === 'user_confirmation') return true;
        if (item.is_complete) return false;
        if (item.status !== null) return false;
        return getTrainingStatus(item.training_date) !== 'scheduled';
      }).length;
      setTrainingEvalBadgeCount(count);
    } catch { /* silent */ }
  }, []);

  const fetchPrfBadge = useCallback(async (currentUser: UserData | null) => {
    if (!currentUser) return;
    try {
      const isPrivileged = currentUser.admin || currentUser.hr || currentUser.accounting;
      if (isPrivileged) {
        const res = await fetch('/api/prform/admin/pending-count', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        setPrfBadgeCount(typeof data.pending_count === 'number' ? data.pending_count : 0);
      } else {
        const res = await fetch('/api/prform/requests/unseen-count', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        setPrfBadgeCount(typeof data.unseen_count === 'number' ? data.unseen_count : 0);
      }
    } catch { /* silent */ }
  }, []);

  const fetchMisBadge = useCallback(async (currentUser: UserData | null) => {
    // Only non-MIS users see the badge on the MIS Ticket sidebar link
    if (!currentUser || currentUser.mis) return;
    try {
      const res = await fetch('/api/mis/tickets/unseen-count', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setMisBadgeCount(typeof data.count === 'number' ? data.count : 0);
    } catch { /* silent */ }
  }, []);

  const fetchFinanceBadge = useCallback(async (currentUser: UserData | null) => {
    // Finance badge is user-facing: unseen loans + unsent payslips.
    if (!currentUser || currentUser.admin || currentUser.hr || currentUser.accounting) return;
    try {
      const res = await fetch('/api/finance/my/unseen-count', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setFinanceBadgeCount(typeof data.count === 'number' ? data.count : 0);
    } catch { /* silent */ }
  }, []);

  const fetchCalendarBadge = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar/events/unseen-count', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setCalendarBadgeCount(typeof data.count === 'number' ? data.count : 0);
    } catch { /* silent */ }
  }, []);

  const fetchSelfEvalBadge = useCallback(async (currentUser: UserData | null) => {
    if (!currentUser || currentUser.admin || currentUser.hr || currentUser.accounting) return;
    try {
      const res = await fetch('/api/employee-eval/my/badge', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setSelfEvalBadgeCount(typeof data.pending_count === 'number' ? data.pending_count : 0);
    } catch { /* silent */ }
  }, []);

  const fetchEmpEvalApproverBadge = useCallback(async (currentUser: UserData | null) => {
    if (!currentUser || !currentUser.is_approver || currentUser.admin || currentUser.hr) return;
    try {
      const res = await fetch('/api/employee-eval/approver/badge', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setEmpEvalApproverBadgeCount(typeof data.count === 'number' ? data.count : 0);
    } catch { /* silent */ }
  }, []);

  const fetchLeaveMyBadge = useCallback(async (currentUser: UserData | null) => {
    if (!currentUser || currentUser.admin || currentUser.hr) return;
    try {
      const res = await fetch('/api/leave/requests/unseen-count', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setLeaveMyBadgeCount(typeof data.unseen_count === 'number' ? data.unseen_count : 0);
    } catch { /* silent */ }
  }, []);

  const fetchLeaveApprovalBadge = useCallback(async (currentUser: UserData | null) => {
    if (!currentUser || (!currentUser.admin && !currentUser.hr && !currentUser.is_approver && !currentUser.clinic && !currentUser.iad)) {
      return;
    }
    try {
      const res = await fetch('/api/leave/approval/pending-count', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setLeaveApprovalBadgeCount(typeof data.pending_count === 'number' ? data.pending_count : 0);
    } catch { /* silent */ }
  }, []);

  const [surveyView, setSurveyView] = useState<'my' | 'admin' | null>(null);

  // ── Fetch survey badge on user load, visibility change, and route change ──
  useEffect(() => {
    if (!user) return;
    fetchSurveyBadge();
    fetchCertBadge();
    fetchPrfBadge(user);
    fetchMisBadge(user);
    fetchFinanceBadge(user);
    fetchCalendarBadge();
    fetchTrainingApprovalBadge(user);
    fetchTrainingEvalBadge(user);
    fetchSelfEvalBadge(user);
    fetchEmpEvalApproverBadge(user);
    fetchLeaveMyBadge(user);
    fetchLeaveApprovalBadge(user);
    function onVisible() {
      if (document.visibilityState === 'visible') {
        fetchSurveyBadge();
        fetchCertBadge();
        fetchPrfBadge(user);
        fetchMisBadge(user);
        fetchFinanceBadge(user);
        fetchCalendarBadge();
        fetchTrainingApprovalBadge(user);
        fetchTrainingEvalBadge(user);
        fetchSelfEvalBadge(user);
        fetchEmpEvalApproverBadge(user);
        fetchLeaveMyBadge(user);
        fetchLeaveApprovalBadge(user);
      }
    }
    function onSurveyRefresh() { fetchSurveyBadge(); }
    function onCertRefresh() { fetchCertBadge(); }
    function onPrfRefresh() { fetchPrfBadge(user); }
    function onMisRefresh() { fetchMisBadge(user); }
    function onFinanceRefresh() { fetchFinanceBadge(user); }
    function onCalendarRefresh() { fetchCalendarBadge(); }
    function onTrainingApprovalRefresh() { fetchTrainingApprovalBadge(user); }
    function onTrainingEvalRefresh() { fetchTrainingEvalBadge(user); }
    function onSelfEvalRefresh() { fetchSelfEvalBadge(user); }
    function onEmpEvalApproverRefresh() { fetchEmpEvalApproverBadge(user); }
    function onLeaveRefresh() {
      fetchLeaveMyBadge(user);
      fetchLeaveApprovalBadge(user);
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('survey-badge-refresh', onSurveyRefresh);
    window.addEventListener('certificate-badge-refresh', onCertRefresh);
    window.addEventListener('prf-badge-refresh', onPrfRefresh);
    window.addEventListener('mis-ticket-badge-refresh', onMisRefresh);
    window.addEventListener('finance-badge-refresh', onFinanceRefresh);
    window.addEventListener('calendar-badge-refresh', onCalendarRefresh);
    window.addEventListener('training-approval-badge-refresh', onTrainingApprovalRefresh);
    window.addEventListener('training-eval-badge-refresh', onTrainingEvalRefresh);
    window.addEventListener('self-eval-badge-refresh', onSelfEvalRefresh);
    window.addEventListener('employee-eval-approver-badge-refresh', onEmpEvalApproverRefresh);
    window.addEventListener('leave-badge-refresh', onLeaveRefresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('survey-badge-refresh', onSurveyRefresh);
      window.removeEventListener('certificate-badge-refresh', onCertRefresh);
      window.removeEventListener('prf-badge-refresh', onPrfRefresh);
      window.removeEventListener('mis-ticket-badge-refresh', onMisRefresh);
      window.removeEventListener('finance-badge-refresh', onFinanceRefresh);
      window.removeEventListener('calendar-badge-refresh', onCalendarRefresh);
      window.removeEventListener('training-approval-badge-refresh', onTrainingApprovalRefresh);
      window.removeEventListener('training-eval-badge-refresh', onTrainingEvalRefresh);
      window.removeEventListener('self-eval-badge-refresh', onSelfEvalRefresh);
      window.removeEventListener('employee-eval-approver-badge-refresh', onEmpEvalApproverRefresh);
      window.removeEventListener('leave-badge-refresh', onLeaveRefresh);
    };
  }, [user, fetchSurveyBadge, fetchCertBadge, fetchPrfBadge, fetchMisBadge, fetchFinanceBadge, fetchCalendarBadge, fetchTrainingApprovalBadge, fetchTrainingEvalBadge, fetchSelfEvalBadge, fetchEmpEvalApproverBadge, fetchLeaveMyBadge, fetchLeaveApprovalBadge]);

  useEffect(() => {
    if (user) {
      fetchSurveyBadge();
      fetchLeaveMyBadge(user);
      fetchLeaveApprovalBadge(user);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (pathname.startsWith("/dashboard/assessments/survey-templates")) {
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

  useEffect(() => {
    if (pathname.startsWith('/dashboard/assessments/self-evaluation')) {
      setLastEmployeeEvalTab('self-evaluation');
    } else if (pathname.startsWith('/dashboard/assessments/employee-evaluation')) {
      setLastEmployeeEvalTab('employee-evaluation');
    } else {
      setLastEmployeeEvalTab(null);
    }
  }, [pathname]);

  useEffect(() => {
    if (pathname.startsWith("/dashboard/assessments/training-approval")) {
      setLastTrainingTab('training-approval');
    } else if (pathname.startsWith("/dashboard/assessments/training-evaluation")) {
      setLastTrainingTab('training-evaluation');
    } else {
      setLastTrainingTab(null);
    }
  }, [pathname]);

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

  const fetchMeWithRefreshFallback = useCallback(async () => {
    const meRes = await fetch("/api/auth/me", {
      credentials: "include",
      cache: "no-store",
    });

    if (meRes.ok) {
      return meRes;
    }

    if (meRes.status !== 401) {
      return meRes;
    }

    try {
      const refreshRes = await fetch('/api/auth/token/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });

      if (!refreshRes.ok) {
        return meRes;
      }

      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 120);
      });

      return fetch('/api/auth/me', {
        credentials: 'include',
        cache: 'no-store',
      });
    } catch {
      return meRes;
    }
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetchMeWithRefreshFallback();
      if (res.status === 401) { router.replace("/"); return; }
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        try {
          const preferredTheme = userData.theme ? 'dark' : 'light';
          document.documentElement.setAttribute('data-theme', preferredTheme);
          localStorage.setItem('repconnect-theme', preferredTheme);
        } catch {
          /* ignore */
        }
        // Fetch the active period start_date so sidebar eligibility uses the real period date.
        if (!userData.admin && !userData.hr) {
          fetch('/api/employee-eval/active-period', { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data?.period?.start_date) setActivePeriodStart(data.period.start_date); })
            .catch(() => { /* silent */ });
        }
      } else {
        router.replace("/");
      }
    } catch {
      router.replace("/");
    } finally {
      setLoading(false);
    }
  }, [fetchMeWithRefreshFallback, router]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  function isTodayBirthday(birthDate: string | null | undefined) {
    if (!birthDate) return false;
    const [year, month, day] = birthDate.split('-').map(Number);
    if (!month || !day) return false;
    const today = new Date();
    return today.getMonth() + 1 === month && today.getDate() === day;
  }

  useEffect(() => {
    if (!user || !user.birth_date) return;

    const birthdayStorageKey = `repconnect-happy-birthday-seen-${user.id}-${new Date().getFullYear()}-${user.birth_date.slice(5)}`;
    const storedValue = window.localStorage.getItem(birthdayStorageKey);
    setBirthdaySeen(storedValue === '1');
  }, [user]);

  const handleBirthdayModalChange = useCallback(
    (open: boolean) => {
      if (!open) {
        if (birthdayTimerRef.current) {
          window.clearTimeout(birthdayTimerRef.current);
          birthdayTimerRef.current = null;
        }

        if (user && user.birth_date && isTodayBirthday(user.birth_date)) {
          const birthdayStorageKey = `repconnect-happy-birthday-seen-${user.id}-${new Date().getFullYear()}-${user.birth_date.slice(5)}`;
          window.localStorage.setItem(birthdayStorageKey, '1');
          setBirthdaySeen(true);
        }
      }
      setHappyBirthdayOpen(open);
    },
    [user],
  );

  useEffect(() => {
    if (!user || !user.birth_date || balloonsLaunched || happyBirthdayOpen || birthdaySeen) return;
    if (!isTodayBirthday(user.birth_date)) return;
    if (feedbackModalOpen || updatesModalOpen) return;

    if (balloonsRef.current) {
      balloonsRef.current.launchAnimation();
    }

    setBalloonsLaunched(true);
  }, [user, feedbackModalOpen, updatesModalOpen, balloonsLaunched, happyBirthdayOpen, birthdaySeen]);

  useEffect(() => {
    if (!balloonsLaunched || happyBirthdayOpen || birthdaySeen) return;

    if (birthdayTimerRef.current) {
      window.clearTimeout(birthdayTimerRef.current);
    }

    birthdayTimerRef.current = window.setTimeout(() => {
      setHappyBirthdayOpen(true);
      birthdayTimerRef.current = null;
    }, 3400);

    return () => {
      if (birthdayTimerRef.current) {
        window.clearTimeout(birthdayTimerRef.current);
      }
    };
  }, [balloonsLaunched, happyBirthdayOpen, birthdaySeen]);

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

  async function doLogout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRFToken": getCsrfToken() },
      });
    } catch { /* silent — navigate regardless */ }
    window.location.href = "/";
  }

  async function handleLogout() {
    if (navGuardRef.current?.isDirty) {
      setPendingLogout(true);
      setPendingNavHref('');
      setShowNavGuardModal(true);
      return;
    }
    await doLogout();
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

  const navItems = buildNav(user, activePeriodStart);
  const exactMatch = navItems.find((n) => n.href === pathname);
  const prefixMatch = [...navItems]
    .filter((n) => pathname.startsWith(n.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const activeItem = exactMatch ?? prefixMatch ?? navItems[0];
  // Breadcrumb: static overrides win, then survey-builder dynamic route, then nav item label.
  const breadcrumb =
    STATIC_BREADCRUMBS[pathname] ??
    (pathname.startsWith('/dashboard/assessments/survey-templates/builder/') ? 'Survey Builder' : null) ??
    activeItem.label;

  // A user can access the leave approval queue if they have
  // a role-group (clinic/iad), or are designated as an approver in WorkInformation.
  // Admin/HR get a dedicated single "Leave Approval" link via an earlier branch.
  const isLeaveApprover =
    user.is_approver || user.clinic || user.iad;

  return (
    <NavigationGuardProvider registerGuard={registerGuard}>
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--color-bg)]">
      <Suspense fallback={null}>
        <SearchParamsReader onSurveyView={setSurveyView} />
      </Suspense>

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

        <RobotNavButton
          onClick={() => { setChatOpen((v) => !v); setChatUnread(false); }}
          hasUnread={chatUnread}
        />
        <NotificationInboxPopover />
        <ThemeSwitch />
      </header>

      {/* ── CONTENT ROW ── */}
      <div className="relative flex flex-1 overflow-hidden">

        <Sidebar open={sidebarOpen} setOpen={setSidebarOpen}>
          <SidebarBody className="py-0">
            <SidebarUserCard user={user} />
            {/* onClickCapture intercepts all link clicks in the sidebar for navigation guard */}
            <div className="relative flex-1 min-h-0">
            <div
              ref={sidebarScrollRef}
              className="h-full overflow-y-auto overflow-x-hidden py-2 px-2 [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: 'none' }}
              onClickCapture={(e) => {
                const guard = navGuardRef.current;
                if (!guard?.isDirty) return;
                const anchor = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
                if (!anchor) return;
                e.preventDefault();
                e.stopPropagation();
                const href = anchor.getAttribute('href') || '/dashboard';
                setPendingNavHref(href);
                setShowNavGuardModal(true);
              }}
            >
              <div className="flex flex-col gap-0.5">
                {navItems.map((item) => {
                  const Icon = item.icon;

                  // Employee Evaluation — approver accordion or standard-user button.
                  if (item.href === '/dashboard/assessments/self-evaluation') {
                    if (user.is_approver) {
                      return (
                        <SidebarEmployeeEvalAccordion
                          key="employee-eval-accordion"
                          isExpanded={employeeEvalAccordionOpen}
                          onToggle={() => {
                            setEmployeeEvalAccordionOpen((v) => !v);
                            setLeaveAccordionOpen(false);
                            setTrainingAccordionOpen(false);
                          }}
                          pathname={pathname}
                          activeTab={lastEmployeeEvalTab}
                          onSubClick={(tab) => setLastEmployeeEvalTab(tab)}
                          selfEvalBadgeCount={selfEvalBadgeCount}
                          empEvalApproverBadgeCount={empEvalApproverBadgeCount}
                        />
                      );
                    }
                    // Standard user: standalone Self Evaluation button with badge.
                    return (
                      <SidebarLink
                        key="self-eval-user"
                        link={{
                          label: 'Self Evaluation',
                          href: '/dashboard/assessments/self-evaluation',
                          icon: <Users size={18} className="shrink-0" />,
                          badgeCount: selfEvalBadgeCount,
                        }}
                        active={pathname.startsWith('/dashboard/assessments/self-evaluation')}
                      />
                    );
                  }

                  // Rendered inside SidebarEmployeeEvalAccordion — skip standalone.
                  if (item.href === '/dashboard/assessments/employee-evaluation') {
                    return null;
                  }

                  // Admin/HR Employee Evaluation — standalone link.
                  if (item.href === '/dashboard/assessments/employee-review') {
                    return (
                      <SidebarLink
                        key="employee-eval-admin"
                        link={{
                          label: 'Employee Evaluation',
                          href: '/dashboard/assessments/employee-review',
                          icon: <Users size={18} className="shrink-0" />,
                        }}
                        active={pathname.startsWith('/dashboard/assessments/employee-review')}
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
                          showMySurveys={user.iad && !user.admin && !user.hr}
                          surveyBadgeCount={actionRequiredCount}
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
                          badgeCount: actionRequiredCount,
                        }}
                        active={pathname.startsWith('/dashboard/assessments/survey')}
                      />
                    );
                  }

                  if (item.href === "/dashboard/assessments/training-evaluation") {
                    const isAccountingOnly = user.accounting && !user.admin && !user.hr;
                    if (isAccountingOnly) {
                      return null;
                    }

                    if (user.admin || user.hr) {
                      return (
                        <SidebarLink
                          key="training-evaluation-admin"
                          link={{
                            label: "Training Evaluation",
                            href: "/dashboard/assessments/training-evaluation",
                            icon: <GraduationCap size={18} className="shrink-0" />,
                          }}
                          active={pathname.startsWith("/dashboard/assessments/training-evaluation")}
                        />
                      );
                    }
                    if (user.is_approver) {
                      return (
                        <SidebarTrainingAccordion
                          key="training-accordion"
                          isExpanded={trainingAccordionOpen}
                          onToggle={() => {
                            setTrainingAccordionOpen((v) => !v);
                            setLeaveAccordionOpen(false);
                            setEmployeeEvalAccordionOpen(false);
                          }}
                          pathname={pathname}
                          activeTab={lastTrainingTab}
                          onSubClick={(tab) => setLastTrainingTab(tab)}
                          trainingApprovalBadgeCount={trainingApprovalBadgeCount}
                          trainingEvalBadgeCount={trainingEvalBadgeCount}
                        />
                      );
                    }
                    // Standard user
                    return (
                      <SidebarLink
                        key="training-evaluation-user"
                        link={{
                          label: "Training Evaluation",
                          href: "/dashboard/assessments/training-evaluation",
                          icon: <GraduationCap size={18} className="shrink-0" />,
                          badgeCount: trainingEvalBadgeCount,
                        }}
                        active={pathname.startsWith("/dashboard/assessments/training-evaluation")}
                      />
                    );
                  }

                  // Training Approval is rendered inside SidebarTrainingAccordion — skip here.
                  if (item.href === "/dashboard/assessments/training-approval") {
                    return null;
                  }

                  if (item.href === "/dashboard/leave") {
                    if (user.admin || user.hr) {
                      return (
                        <SidebarLink
                          key="leave-approval"
                          link={{
                            label: "Leave Approval",
                            href: "/dashboard/leave/admin",
                            icon: <CalendarFold size={18} className="shrink-0" />,
                            badgeCount: leaveApprovalBadgeCount,
                          }}
                          active={pathname.startsWith("/dashboard/leave/admin")}
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
                            setTrainingAccordionOpen(false);
                            setEmployeeEvalAccordionOpen(false);
                          }}
                          pathname={pathname}
                          activeTab={lastLeaveTab}
                          onSubClick={(tab) => setLastLeaveTab(tab)}
                          requestBadgeCount={leaveMyBadgeCount}
                          approvalBadgeCount={leaveApprovalBadgeCount}
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
                        badgeCount: item.href === '/dashboard/calendar'
                          ? calendarBadgeCount
                          : item.href === '/dashboard/certification'
                          ? certBadgeCount
                          : item.href === '/dashboard/pr-form'
                          ? prfBadgeCount
                          : item.href === '/dashboard/mis-ticket' && !user?.mis
                          ? misBadgeCount
                          : item.href.startsWith('/dashboard/finance')
                          ? financeBadgeCount
                          : item.href === '/dashboard/leave'
                          ? leaveMyBadgeCount
                          : undefined,
                      }}
                      active={pathname === item.href}
                    />
                  );
                })}
              </div>
            </div>
            <div
              className={cn(
                'pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-1.5 transition-opacity duration-200',
                showSidebarScrollTop ? 'opacity-100' : 'opacity-0',
              )}
            >
              <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[var(--color-bg-elevated)] to-transparent rounded-t" />
              <div className="relative z-10 flex h-4 w-4 items-center justify-center text-[var(--color-text-muted)]">
                <ChevronUp className="h-3.5 w-3.5" />
              </div>
            </div>
            <div
              className={cn(
                'pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-1.5 transition-opacity duration-200',
                showSidebarScrollBottom ? 'opacity-100' : 'opacity-0',
              )}
            >
              <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--color-bg-elevated)] to-transparent rounded-b" />
              <div className="relative z-10 flex h-4 w-4 items-center justify-center text-[var(--color-text-muted)]">
                <ChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>
            </div>
            <div className="shrink-0 border-t border-[var(--color-border)] py-2 px-2">
              <LogoutButton onLogout={handleLogout} />
            </div>
          </SidebarBody>
        </Sidebar>

        {/* Main — pl-[60px] reserves collapsed sidebar space on desktop */}
        <div className="flex-1 min-h-0 md:pl-[60px] relative isolate">
          <DottedSurface className="pointer-events-none absolute inset-0 -z-10" />
          <div className="pointer-events-none absolute inset-0 z-0 hidden dark:block bg-background [background:radial-gradient(125%_125%_at_50%_-50%,#c7d2fe_40%,transparent_100%)] dark:[background:radial-gradient(125%_125%_at_50%_-50%,#6366f136_40%,transparent_100%)]" />
          <div className="relative h-full overflow-y-auto">
            {children}
          </div>
        </div>
      </div>

      <Balloons ref={balloonsRef} className="pointer-events-none fixed inset-0 z-50" />

      {/* ── System feedback modal — suppressed while password change is required ── */}
      {!user.change_password && (
        <SystemFeedbackModal
          userId={user.id}
          admin={user.admin}
          onOpenChange={setFeedbackModalOpen}
        />
      )}

      {/* ── What's New modal — suppressed while password change is required ── */}
      {!user.change_password && (
        <WhatIsNewModal
          userId={user.id}
          admin={user.admin}
          onOpenChange={setUpdatesModalOpen}
        />
      )}

      {/* ── Happy birthday modal (automatically shown on birthday after balloons) ── */}
      <HappyBirthdayModal
        open={happyBirthdayOpen}
        onOpenChange={handleBirthdayModalChange}
        firstName={user?.firstname ?? ''}
      />

      {/* ── Inactivity warning modal ── */}
      <AnimatePresence>
        {showWarning && (
          <InactivityWarningModal
            secondsLeft={secondsLeft}
            onCancel={resetTimer}
          />
        )}
      </AnimatePresence>

      {/* ── AI Chat Panel ── */}
      <AIChatPanel
        open={chatOpen}
        onOpenChange={setChatOpen}
        user={{
          id: user.id,
          firstname: user.firstname,
          lastname: user.lastname,
        }}
        onUnreadChange={setChatUnread}
      />

      {/* ── Navigation guard modal ── */}
      <AnimatePresence>
        {showNavGuardModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={navGuardSubmitting ? undefined : () => { setShowNavGuardModal(false); setPendingLogout(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden"
            >
              <div className="flex items-start justify-between gap-3 p-4 border-b border-[var(--color-border)]">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">Submit Your Evaluation</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    You have answered all required questions for this evaluation but have not submitted it yet. Would you like to submit your evaluation before leaving?
                  </p>
                </div>
                <button
                  type="button"
                  disabled={navGuardSubmitting}
                  onClick={() => {
                    if (navGuardSubmitting) return;
                    setShowNavGuardModal(false);
                    setPendingLogout(false);
                  }}
                  className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-40"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="p-4 pb-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={navGuardSubmitting}
                  onClick={() => {
                    navGuardRef.current = null;
                    setShowNavGuardModal(false);
                    const isLogout = pendingLogout;
                    const href = pendingNavHref;
                    setPendingLogout(false);
                    if (isLogout) { void doLogout(); } else { router.push(href); }
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-medium border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-50"
                >
                  Leave Without Submitting
                </button>
                <button
                  type="button"
                  disabled={navGuardSubmitting}
                  onClick={async () => {
                    const guard = navGuardRef.current;
                    const isLogout = pendingLogout;
                    const href = pendingNavHref;
                    if (!guard) {
                      setShowNavGuardModal(false);
                      setPendingLogout(false);
                      if (isLogout) { void doLogout(); } else { router.push(href); }
                      return;
                    }
                    setNavGuardSubmitting(true);
                    try {
                      const ok = await guard.trySubmit();
                      setShowNavGuardModal(false);
                      setPendingLogout(false);
                      if (ok) {
                        if (isLogout) { void doLogout(); } else { router.push(href); }
                      }
                    } finally {
                      setNavGuardSubmitting(false);
                    }
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#2845D6] hover:bg-[#1f35b0] transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {navGuardSubmitting
                    ? <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    : null}
                  Submit Evaluation
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </NavigationGuardProvider>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  LogOut,
  Newspaper,
  Stethoscope,
  Calculator,
  Users,
  Monitor,
  ShieldCheck,
  Calendar,
  FileText,
  Award,
  DollarSign,
  Clock,
  Ticket,
  Settings,
  Lock,
  Search,
  ChevronRight,
  Menu,
} from "lucide-react";
import { ThemeSwitch } from "@/components/ui/theme-switch-button";
import { NotificationInboxPopover } from "@/components/ui/notification-inbox-popover";
import { Sidebar, SidebarBody, SidebarLink, useSidebar } from "@/components/ui/sidebar";
import { getCsrfToken } from "@/lib/csrf";
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
}

type NavItem = {
  icon: React.ElementType;
  label: string;
  href: string;
  section?: string;
};

const STATIC_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: "Overview",         href: "/dashboard",                  section: "Management Information System" },
  { icon: Calendar,        label: "Calendar",          href: "/dashboard/calendar",          section: "Management Information System" },
  { icon: FileText,        label: "PR-Form",           href: "/dashboard/pr-form",           section: "Management Information System" },
  { icon: Award,           label: "Certificate",       href: "/dashboard/certification",       section: "Management Information System" },
  { icon: LayoutDashboard, label: "Assessments",       href: "/dashboard/assessments",       section: "Management Information System" },
  { icon: DollarSign,      label: "Finances",          href: "/dashboard/finance/admin",     section: "Management Information System" },
  { icon: Clock,           label: "Leave Requests",    href: "/dashboard/leave",             section: "Management Information System" },
  { icon: Ticket,          label: "MIS Ticket",        href: "/dashboard/mis-ticket",        section: "Management Information System" },
  { icon: Settings,        label: "Profile Settings",  href: "/dashboard/profile-settings",  section: "Management Information System" },
  { icon: Lock,            label: "Password Settings", href: "/dashboard/password-settings", section: "Management Information System" },
];

function buildNav(user: UserData): NavItem[] {
  const extra: NavItem[] = [];
  if (user.news)
    extra.push({ icon: Newspaper,   label: "News",       href: "/dashboard/news",       section: "Modules" });
  if (user.clinic)
    extra.push({ icon: Stethoscope, label: "Clinic",     href: "/dashboard/clinic",     section: "Modules" });
  if (user.accounting)
    extra.push({ icon: Calculator,  label: "Accounting", href: "/dashboard/accounting", section: "Modules" });
  if (user.hr || user.hr_manager)
    extra.push({ icon: Users,       label: "HR",         href: "/dashboard/hr",         section: "Modules" });
  if (user.mis)
    extra.push({ icon: Monitor,     label: "MIS",        href: "/dashboard/mis",        section: "Modules" });
  if (user.admin || user.is_staff)
    extra.push({ icon: ShieldCheck, label: "Admin",      href: "/dashboard/admin",      section: "Modules" });
  return [...STATIC_NAV, ...extra];
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
        <p className="whitespace-nowrap text-sm font-semibold text-[var(--color-text-primary)] leading-tight">
          {fullName}
        </p>
        <p className="whitespace-nowrap text-xs text-[var(--color-text-muted)] leading-tight mt-0.5">
          {user.idnumber}
        </p>
      </motion.div>
    </div>
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
        className="overflow-hidden whitespace-nowrap text-sm font-medium"
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

  // ── Inactivity timeout ────────────────────────────────────────────────
  const handleInactivityTimeout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRFToken": getCsrfToken() },
    });
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
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRFToken": getCsrfToken() },
    });
    // Hard navigate so the landing page re-mounts fresh (restarts Three.js animation).
    window.location.href = "/";
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-bg)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-[#2845D6] border-t-transparent animate-spin" />
          <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
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
          <ChevronRight size={13} className="shrink-0 text-[var(--color-text-muted)]" />
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

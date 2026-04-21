"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

// UserData is re-declared here locally so page.tsx stays self-contained
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

function StatCard({
  title,
  value,
  accent = false,
}: {
  title: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        {title}
      </p>
      <p
        className={`mt-1.5 text-xl font-bold ${
          accent ? "text-red-500" : "text-[var(--color-text-primary)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[#2845D6] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const permissionModules = [
    { label: "News",       active: user.news },
    { label: "Clinic",     active: user.clinic },
    { label: "Accounting", active: user.accounting },
    { label: "HR",         active: user.hr },
    { label: "HR Manager", active: user.hr_manager },
    { label: "MIS",        active: user.mis },
    { label: "Admin",      active: user.admin },
  ];

  return (
    <main className="p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            Welcome back, {user.firstname ?? user.idnumber}!
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Good morning! Ready to make today amazing?
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard title="ID Number" value={user.idnumber} />
          <StatCard
            title="Account Status"
            value={user.active ? "Active" : "Inactive"}
            accent={!user.active}
          />
          <StatCard
            title="Role"
            value={
              user.is_superuser
                ? "Super Admin"
                : user.is_staff
                ? "Administrator"
                : "Employee"
            }
          />
        </div>

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Module Access
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {permissionModules.map(({ label, active }) => (
              <div
                key={label}
                className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                  active
                    ? "border-[#2845D6]/30 bg-[#2845D6]/10 text-[#2845D6]"
                    : "border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-muted)]"
                }`}
              >
                {label}
                <span className="mt-0.5 block text-xs font-normal opacity-70">
                  {active ? "Enabled" : "Disabled"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

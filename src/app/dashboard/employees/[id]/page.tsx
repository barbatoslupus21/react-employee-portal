"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence, animate } from "motion/react";
import {
  ChevronDown, Award, ChevronLeft,
  School, BookOpen, Wrench, GraduationCap,
  ChevronUp, Pencil, Check, User, Users, X,
} from "lucide-react";
import { Timeline } from "@/components/ui/timeline";
import { Tabs as VercelTabs } from "@/components/ui/vercel-tabs";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCsrfToken } from "@/lib/csrf";

// ── Types (same shape as profile-settings ProfileData) ──────────────────────

interface Skill       { id?: number; name: string; }
interface Certificate { id: number; title: string; category_name: string; category_icon: string; created_at: string; }
interface PersonalInfo {
  middle_name: string; nickname: string; work_email: string;
  gender: string; birth_date: string; birth_place: string; contact_number: string;
}
interface Address {
  country: string; province: string; city: string;
  barangay: string; street: string; block_lot: string;
}
interface ProvincialAddr extends Address { same_as_present: boolean; }
interface EmergencyContact { name: string; relationship: string; contact_number: string; address: string; }
interface FamilyBg  { mother_name: string; father_name: string; spouse_name: string; }
interface ChildRec  { id?: number; name: string; }
interface EduRec {
  id?: number; institution: string; education_level: string;
  degree: string; year_attended: string;
}
interface WorkInfo {
  department_id: number | null; department_name: string | null;
  line_id: number | null;       line_name: string | null;
  approver_id: number | null;   approver_name: string | null;
  position_id: number | null;   position_name: string | null;
  position_level: number | null;
  employment_type_id: number | null; employment_type_name: string | null;
  office_id: number | null;     office_name: string | null;
  shift_id: number | null;      shift_name: string | null;
  date_hired: string | null;
  tin_number: string; sss_number: string;
  hdmf_number: string; philhealth_number: string; bank_account: string;
}
interface ProfileData {
  id: number; idnumber: string;
  firstname: string | null; lastname: string | null; email: string | null;
  avatar: string | null;
  personal_info: PersonalInfo;
  present_address: Address;
  provincial_address: ProvincialAddr;
  emergency_contact: EmergencyContact;
  family_background: FamilyBg;
  children: ChildRec[];
  education_records: EduRec[];
  work_info: WorkInfo | null;
  skills: Skill[];
  certificates: Certificate[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "personal",   label: "Personal Information" },
  { id: "background", label: "Background & Education" },
];

// ── Work-info text-field validation constants ─────────────────────────────────
const WI_BLOCKED_CHARS = /[<>{}\[\]\\|^~`"]/;
const WI_TEXT_MAX: Record<string, number> = {
  tin_number: 20, sss_number: 20, hdmf_number: 20, philhealth_number: 20, bank_account: 50,
};
const WI_TEXT_LABELS: Record<string, string> = {
  tin_number: "TIN Number", sss_number: "SSS Number", hdmf_number: "HDMF / Pag-IBIG",
  philhealth_number: "PhilHealth", bank_account: "Bank Account",
};

function formatDisplayDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// ── Education helpers ─────────────────────────────────────────────────────────

const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  primary: "Primary", secondary: "Secondary", vocational: "Vocational",
  tertiary: "Tertiary", masteral: "Masteral", doctorate: "Doctorate",
};
const EDUCATION_ORDER = ["primary", "secondary", "vocational", "tertiary", "masteral", "doctorate"];

function sortByEducationLevel(records: EduRec[]): EduRec[] {
  return [...records].sort((a, b) => {
    const ia = EDUCATION_ORDER.indexOf(a.education_level ?? "");
    const ib = EDUCATION_ORDER.indexOf(b.education_level ?? "");
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

function getEducationIcon(level: string | undefined): React.ReactNode {
  switch (level) {
    case "primary":    return <School size={13} />;
    case "secondary":  return <BookOpen size={13} />;
    case "vocational": return <Wrench size={13} />;
    case "tertiary":   return <GraduationCap size={13} />;
    case "masteral":
    case "doctorate":  return <Award size={13} />;
    default:           return <GraduationCap size={13} />;
  }
}

// ── Shared display components ────────────────────────────────────────────────

function ReadField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">{label}</span>
      <span className="text-sm text-[var(--color-text-primary)]">
        {value || <span className="italic text-[var(--color-text-muted)]">—</span>}
      </span>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
      {children}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)] shrink-0">{label}</span>
      <Pill>{value}</Pill>
    </div>
  );
}

// ── AccordionSection ──────────────────────────────────────────────────────────

function AccordionSection({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-5 py-3.5 text-sm font-semibold text-[var(--color-text-primary)] text-left select-none"
      >
        <motion.span
          animate={{ rotate: open ? 0 : -90 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          className="shrink-0"
        >
          <ChevronDown size={14} />
        </motion.span>
        {title}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="px-5 pb-5 space-y-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ── Profile Completion Card ───────────────────────────────────────────────────

function ProfileCompletionCard({ profile }: { profile: ProfileData }) {
  const { percentage, personalComplete, hasFamilyBg, hasEducation, message, chartColor, chartGradient } = useMemo(() => {
    const requiredFields = [
      profile.firstname?.trim(),
      profile.lastname?.trim(),
      profile.personal_info.gender,
      profile.personal_info.birth_date,
      profile.personal_info.birth_place?.trim(),
      profile.personal_info.contact_number?.trim(),
      profile.present_address.country,
      profile.emergency_contact.name?.trim(),
      profile.emergency_contact.relationship?.trim(),
      profile.emergency_contact.contact_number?.trim(),
      profile.emergency_contact.address?.trim(),
    ];
    const filled = requiredFields.filter(Boolean).length;
    const pct    = Math.round((filled / requiredFields.length) * 100);

    const personalComplete = filled === requiredFields.length;
    const hasFamilyBg = !!(
      profile.family_background.mother_name?.trim() ||
      profile.family_background.father_name?.trim()  ||
      profile.family_background.spouse_name?.trim()  ||
      profile.children.some((c) => c.name?.trim())
    );
    const hasEducation = profile.education_records.some((e) => e.institution?.trim());

    let msg: string;
    if      (pct === 0)  msg = "Profile is empty. No details have been filled in.";
    else if (pct < 30)   msg = "Just getting started — basic details are missing.";
    else if (pct < 50)   msg = "Good progress! Several fields still need attention.";
    else if (pct < 70)   msg = "Halfway there. A few more fields to go.";
    else if (pct < 100)  msg = "Almost complete! Fill in the remaining required fields.";
    else                 msg = "Profile is fully complete.";

    const colorStops = pct <= 50
      ? ["#F87171", "#EF4444"]
      : pct <= 70
        ? ["#FBBF24", "#F59E0B"]
        : ["#34D399", "#10B981"];

    return { percentage: pct, personalComplete, hasFamilyBg, hasEducation, message: msg, chartColor: colorStops[1], chartGradient: colorStops };
  }, [profile]);

  const [displayedPct, setDisplayedPct] = useState(0);
  useEffect(() => {
    setDisplayedPct(0);
    const ctrl = animate(0, percentage, {
      duration: 1.6,
      ease: "easeOut",
      onUpdate: (v) => setDisplayedPct(Math.round(v)),
    });
    return () => ctrl.stop();
  }, [percentage]);

  const svgSize    = 120;
  const sw         = 25;
  const r          = (svgSize - sw) / 2;
  const C          = 2 * Math.PI * r;
  const dashOffset = C - (percentage / 100) * C;

  const sections = [
    { label: "Profile",    done: personalComplete },
    { label: "Background", done: hasFamilyBg      },
    { label: "Education",  done: hasEducation      },
  ];

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: svgSize, height: svgSize }}>
          <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`} style={{ display: "block" }} aria-hidden="true">
            <defs>
              <linearGradient id="completionGradientAdmin" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={chartGradient[0]} />
                <stop offset="100%" stopColor={chartGradient[1]} />
              </linearGradient>
            </defs>
            <circle cx={svgSize/2} cy={svgSize/2} r={r} fill="none" stroke="rgba(148, 163, 184, 0.32)" strokeWidth={sw} />
            <g transform={`rotate(-90 ${svgSize/2} ${svgSize/2})`}>
              <motion.circle
                key={percentage}
                cx={svgSize/2} cy={svgSize/2} r={r}
                fill="none" stroke="url(#completionGradientAdmin)"
                strokeWidth={sw} strokeLinecap="round"
                strokeDasharray={C}
                initial={{ strokeDashoffset: C }}
                animate={{ strokeDashoffset: dashOffset }}
                transition={{ duration: 2.4, ease: "easeOut" }}
              />
            </g>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center select-none">
            <span className="text-sm font-bold leading-none tabular-nums" style={{ color: chartColor }}>
              {displayedPct}%
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <p className="text-sm leading-snug text-[var(--color-text-secondary)]">{message}</p>
          <div className="space-y-1.5">
            {sections.map(({ label, done }) => {
              const LeadingIcon = label === "Profile" ? User : label === "Background" ? Users : GraduationCap;
              return (
                <div key={label} className="flex items-center gap-2">
                  <LeadingIcon size={15} className="text-[var(--color-text-muted)]" aria-hidden="true" />
                  <span className={`text-xs font-medium pl-1 ${done ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-muted)]"}`}>{label}</span>
                  <span className={`inline-flex h-3 w-3 items-center justify-center rounded-full ${done ? "bg-emerald-500" : "bg-gray-300"}`}>
                    <Check size={9} className="text-white" />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Left Card (read-only) ─────────────────────────────────────────────────────

function LeftCard({ profile }: { profile: ProfileData }) {
  const [certsExpanded, setCertsExpanded] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const wi         = profile.work_info;
  const displayAv  = profile.avatar ?? "/default-avatar.png";
  const fullName   = [profile.firstname, profile.lastname].filter(Boolean).join(" ") || profile.idnumber;

  const certPreview = profile.certificates.slice(0, 4);
  const certExtra   = profile.certificates.slice(4);
  const extraCount  = certExtra.length;

  return (
    <aside className="w-full lg:w-64 xl:w-72 shrink-0 lg:h-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] flex flex-col overflow-hidden">

      {/* Cover image */}
      <div className="relative shrink-0 h-[80px] overflow-visible rounded-t-2xl">
        <img
          src="/coverpage.jpg"
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover select-none"
        />
        <div className="absolute left-5 top-full -translate-y-1/2 z-20">
          <div className="h-[78px] w-[78px] overflow-hidden rounded-full border-[4px] border-[var(--color-bg-elevated)] bg-white">
            <img
              src={displayAv}
              alt={fullName}
              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/default-avatar.png"; }}
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </div>

      {/* Static header — always visible */}
      <div className="px-5 pb-2 pt-9 space-y-1">
        {wi?.position_name && (
          <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/15 text-emerald-600 border border-emerald-500/25">
            {wi.position_name}
          </span>
        )}
        <h2 className="text-xl font-bold text-[var(--color-text-secondary)] leading-snug">{fullName}</h2>
        <p className="text-[11px] text-[var(--color-text-muted)]">
          {profile.idnumber}
          {profile.email && <> &bull; {profile.email}</>}
        </p>
      </div>

      {/* Expandable body — always open on desktop, toggle-able on mobile */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="card-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-5 pb-3 space-y-3">

              {wi?.employment_type_name && (
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">Employment type</span>
                  <Pill>{wi.employment_type_name}</Pill>
                </div>
              )}

              {(wi?.date_hired || wi?.tin_number || wi?.sss_number || wi?.hdmf_number || wi?.philhealth_number || wi?.bank_account) && (
                <div className="space-y-2.5">
                  <InfoRow label="Date Hired"      value={formatDisplayDate(wi?.date_hired)} />
                  <InfoRow label="TIN Number"      value={wi?.tin_number} />
                  <InfoRow label="SSS Number"      value={wi?.sss_number} />
                  <InfoRow label="HDMF / Pag-IBIG" value={wi?.hdmf_number} />
                  <InfoRow label="PhilHealth"      value={wi?.philhealth_number} />
                  <InfoRow label="Bank Account"    value={wi?.bank_account} />
                </div>
              )}

              {/* Skills */}
              {profile.skills.length > 0 && (
                profile.skills.length <= 2 ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">Skills</span>
                    <div className="flex flex-wrap justify-end gap-1 max-w-[70%]">
                      {profile.skills.map((skill) => <Pill key={skill.name}>{skill.name}</Pill>)}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">Skills</span>
                    <div className="flex flex-wrap gap-1">
                      {profile.skills.map((skill) => <Pill key={skill.name}>{skill.name}</Pill>)}
                    </div>
                  </div>
                )
              )}

              {/* Certificates */}
              {profile.certificates.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[9px] font-semibold uppercase text-[var(--color-text-muted)]">Certificates</span>
                  <div className="space-y-0">
                    {certPreview.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 py-1.5">
                        <Award size={13} className="shrink-0 text-[#2845D6]" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-[var(--color-text-primary)] truncate leading-snug">{c.title}</p>
                          <p className="text-[10px] text-[var(--color-text-muted)] truncate">{c.category_name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <AnimatePresence initial={false}>
                    {certsExpanded && extraCount > 0 && (
                      <motion.div
                        key="cert-extra"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        {certExtra.map((c) => (
                          <div key={c.id} className="flex items-center gap-2 py-1.5">
                            <Award size={13} className="shrink-0 text-[#2845D6]" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-[var(--color-text-primary)] truncate leading-snug">{c.title}</p>
                              <p className="text-[10px] text-[var(--color-text-muted)] truncate">{c.category_name}</p>
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {extraCount > 0 && (
                    <button
                      onClick={() => setCertsExpanded((v) => !v)}
                      className="flex items-center gap-1 text-[10px] text-[#2845D6] hover:text-[#1e37b8] font-medium transition-colors pt-0.5"
                    >
                      {certsExpanded
                        ? <>See less <ChevronUp size={12} /></>
                        : <>See {extraCount} more <ChevronDown size={12} /></>
                      }
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expand/collapse toggle — mobile only */}
      <div className="lg:hidden shrink-0 flex justify-center pb-2 pt-1 mt-auto">
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          aria-label={isExpanded ? "Collapse card" : "Expand card"}
        >
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="inline-flex"
          >
            <ChevronDown size={14} />
          </motion.span>
        </button>
      </div>
    </aside>
  );
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function LeftSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-5">
      <div className="mx-auto h-24 w-24 rounded-full bg-[var(--color-bg-card)]" />
      <div className="space-y-2 text-center">
        <div className="mx-auto h-3 w-24 rounded bg-[var(--color-bg-card)]" />
        <div className="mx-auto h-5 w-36 rounded bg-[var(--color-bg-card)]" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[80, 60, 90, 70].map((w, i) => (
          <div key={i} className="h-5 rounded-md bg-[var(--color-bg-card)]" style={{ width: w }} />
        ))}
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-1">
          <div className="h-2.5 w-16 rounded bg-[var(--color-bg-card)]" />
          <div className="h-5 w-28 rounded bg-[var(--color-bg-card)]" />
        </div>
      ))}
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="animate-pulse p-6 space-y-5">
      <div className="flex gap-1">
        {[110, 130, 160].map((w, i) => (
          <div key={i} className="h-7 rounded bg-[var(--color-bg-card)]" style={{ width: w }} />
        ))}
      </div>
      <div className="grid grid-cols-2 min-[480px]:grid-cols-3 gap-4 mt-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-24 rounded bg-[var(--color-bg-card)]" />
            <div className="h-5 rounded-lg bg-[var(--color-bg-card)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Address read view ─────────────────────────────────────────────────────────

function AddressReadView({ address, title }: { address: Address; title: string }) {
  const hasAny = Object.values(address).some(Boolean);
  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)] mb-3 tracking-wide">{title}</h3>
      {hasAny ? (
        <div className="grid grid-cols-2 min-[480px]:grid-cols-3 gap-4">
          <ReadField label="Country"              value={address.country} />
          <ReadField label="Province"             value={address.province} />
          <ReadField label="City / Municipality"  value={address.city} />
          <ReadField label="Barangay"             value={address.barangay} />
          <ReadField label="Street"               value={address.street} />
          <ReadField label="Block / Lot"          value={address.block_lot} />
        </div>
      ) : (
        <p className="text-sm italic text-[var(--color-text-muted)]">— No address on record</p>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function EmployeeProfilePage() {
  const router = useRouter();
  const params = useParams();
  const idnumber = params.id as string;

  type AuthPhase = "spinner" | "checking" | "done";
  const [authPhase, setAuthPhase] = useState<AuthPhase>("spinner");
  const [profile,   setProfile]   = useState<ProfileData | null>(null);
  const [notFound,  setNotFound]  = useState(false);
  const [activeTab, setActiveTab] = useState("personal");

  // ── Work-info edit state ───────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [draftWi,   setDraftWi]   = useState<{
    department_id:    number | null;
    line_id:          number | null;
    approver_id:      number | null;
    position_id:      number | null;
    employment_type_id: number | null;
    date_hired:       string;
    tin_number:       string;
    sss_number:       string;
    hdmf_number:      string;
    philhealth_number: string;
    bank_account:     string;
  } | null>(null);
  const [depts,           setDepts]           = useState<{ id: number; name: string }[]>([]);
  const [lines,           setLines]           = useState<{ id: number; name: string }[]>([]);
  const [approvers,       setApprovers]       = useState<{ id: number; name: string; idnumber: string }[]>([]);
  const [positions,       setPositions]       = useState<{ id: number; name: string }[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<{ id: number; name: string }[]>([]);
  const [wiTouched,       setWiTouched]       = useState<Record<string, boolean>>({});
  const [saveAttempted,   setSaveAttempted]   = useState(false);

  // ── Auth + fetch ──────────────────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => setAuthPhase("checking"), 350);
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { credentials: "include" });
        clearTimeout(timer);
        if (!r.ok) { router.replace("/"); return; }
        const user = await r.json();
        if (!user.admin && !user.hr) {
          router.replace("/dashboard/employees");
          return;
        }
        // Fetch employee profile
        const pr = await fetch(`/api/user-profile/${idnumber}/admin`, { credentials: "include" });
        if (pr.status === 404 || pr.status === 403) { setNotFound(true); setAuthPhase("done"); return; }
        if (!pr.ok) { router.replace("/dashboard/employees"); return; }
        const data = await pr.json() as ProfileData;
        setProfile(data);
        setAuthPhase("done");
      } catch {
        clearTimeout(timer);
        router.replace("/dashboard/employees");
      }
    })();
    return () => clearTimeout(timer);
  }, [router, idnumber]);

  // ── Dropdown loaders ──────────────────────────────────────────────────────

  const loadDepts = useCallback(async () => {
    try {
      const r = await fetch("/api/general-settings/departments", { credentials: "include" });
      if (r.ok) setDepts(await r.json());
    } catch { /* silent */ }
  }, []);

  const loadLines = useCallback(async (deptId: number | null) => {
    try {
      const url = deptId
        ? `/api/general-settings/lines?department=${deptId}`
        : `/api/general-settings/lines`;
      const r = await fetch(url, { credentials: "include" });
      if (r.ok) setLines(await r.json()); else setLines([]);
    } catch { /* silent */ }
  }, []);

  const loadApprovers = useCallback(async () => {
    try {
      const r = await fetch(`/api/user-profile/admin-approvers`, { credentials: "include" });
      if (r.ok) setApprovers(await r.json()); else setApprovers([]);
    } catch { /* silent */ }
  }, []);

  const loadPositions = useCallback(async () => {
    try {
      const r = await fetch("/api/general-settings/positions", { credentials: "include" });
      if (r.ok) setPositions(await r.json()); else setPositions([]);
    } catch { /* silent */ }
  }, []);

  const loadEmploymentTypes = useCallback(async () => {
    try {
      const r = await fetch("/api/general-settings/employment-types", { credentials: "include" });
      if (r.ok) setEmploymentTypes(await r.json()); else setEmploymentTypes([]);
    } catch { /* silent */ }
  }, []);

  // ── Edit handlers ─────────────────────────────────────────────────────────

  const startEditing = useCallback(async () => {
    if (!profile) return;
    const wi = profile.work_info;
    const draft = {
      department_id:      wi?.department_id      ?? null,
      line_id:            wi?.line_id            ?? null,
      approver_id:        wi?.approver_id        ?? null,
      position_id:        wi?.position_id        ?? null,
      employment_type_id: wi?.employment_type_id ?? null,
      date_hired:         wi?.date_hired         ?? "",
      tin_number:         wi?.tin_number         ?? "",
      sss_number:         wi?.sss_number         ?? "",
      hdmf_number:        wi?.hdmf_number        ?? "",
      philhealth_number:  wi?.philhealth_number  ?? "",
      bank_account:       wi?.bank_account       ?? "",
    };

    setDraftWi(draft);
    setWiTouched({
      department_id:      !draft.department_id,
      line_id:            !draft.line_id,
      approver_id:        !draft.approver_id,
      position_id:        !draft.position_id,
      employment_type_id: !draft.employment_type_id,
      date_hired:         !draft.date_hired,
      tin_number:         !draft.tin_number?.trim(),
      sss_number:         !draft.sss_number?.trim(),
      hdmf_number:        !draft.hdmf_number?.trim(),
      philhealth_number:  !draft.philhealth_number?.trim(),
      bank_account:       !draft.bank_account?.trim(),
    });
    setSaveAttempted(false);

    await Promise.all([
      loadDepts(),
      loadLines(wi?.department_id ?? null),
      loadApprovers(),
      loadPositions(),
      loadEmploymentTypes(),
    ]);
    setIsEditing(true);
  }, [profile, loadDepts, loadLines, loadApprovers, loadPositions, loadEmploymentTypes]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setDraftWi(null);
    setWiTouched({});
    setSaveAttempted(false);
  }, []);

  const saveEditing = useCallback(async () => {
    if (!draftWi || !profile) return;
    setSaveAttempted(true);
    // Guard: all required fields must be filled
    if (!draftWi.department_id || !draftWi.line_id || !draftWi.approver_id || !draftWi.position_id || !draftWi.employment_type_id || !draftWi.date_hired || !draftWi.tin_number?.trim() || !draftWi.sss_number?.trim() || !draftWi.hdmf_number?.trim() || !draftWi.philhealth_number?.trim() || !draftWi.bank_account?.trim()) return;
    setSaving(true);
    try {
      const csrf = await getCsrfToken();
      const body: Record<string, unknown> = {
        department:        draftWi.department_id,
        line:              draftWi.line_id,
        approver:          draftWi.approver_id,
        position:          draftWi.position_id,
        employment_type:   draftWi.employment_type_id,
        date_hired:        draftWi.date_hired || null,
        tin_number:        draftWi.tin_number,
        sss_number:        draftWi.sss_number,
        hdmf_number:       draftWi.hdmf_number,
        philhealth_number: draftWi.philhealth_number,
        bank_account:      draftWi.bank_account,
      };

      const r = await fetch(`/api/user-profile/${idnumber}/admin/work-info`, {
        method:      "PATCH",
        credentials: "include",
        headers:     { "Content-Type": "application/json", "X-CSRFToken": csrf ?? "" },
        body:        JSON.stringify(body),
      });
      if (!r.ok) { setSaving(false); return; }
      const updatedWi = await r.json();
      setProfile((prev) => prev ? { ...prev, work_info: updatedWi } : prev);
      setIsEditing(false);
      setDraftWi(null);
      setWiTouched({});
    } finally {
      setSaving(false);
    }
  }, [draftWi, profile, idnumber]);

  // ── Draft validation ──────────────────────────────────────────────────────
  const wiErrs = useMemo((): Record<string, string> => {
    if (!draftWi) return {};
    const e: Record<string, string> = {};
    if (saveAttempted && !draftWi.department_id)      e.department_id      = "Department is required.";
    if (saveAttempted && !draftWi.line_id)            e.line_id            = "Line is required.";
    if (saveAttempted && !draftWi.approver_id)        e.approver_id        = "Approver is required.";
    if (saveAttempted && !draftWi.position_id)        e.position_id        = "Position is required.";
    if (saveAttempted && !draftWi.employment_type_id) e.employment_type_id = "Employment type is required.";
    if (saveAttempted && !draftWi.date_hired)         e.date_hired         = "Date hired is required.";
    for (const field of ["tin_number", "sss_number", "hdmf_number", "philhealth_number", "bank_account"] as const) {
      const val = draftWi[field] ?? "";
      if (!wiTouched[field] && !saveAttempted) continue;
      if (saveAttempted && !val.trim()) {
        e[field] = `${WI_TEXT_LABELS[field]} is required.`;
        continue;
      }
      if (WI_BLOCKED_CHARS.test(val)) {
        e[field] = "Contains invalid characters.";
        continue;
      }
      if (val.length > WI_TEXT_MAX[field]) {
        e[field] = `Maximum ${WI_TEXT_MAX[field]} characters allowed.`;
      }
    }
    return e;
  }, [draftWi, wiTouched, saveAttempted]);

  const canSave = useMemo(() => {
    if (!draftWi) return false;
    const requiredFields = [
      draftWi.department_id,
      draftWi.line_id,
      draftWi.approver_id,
      draftWi.position_id,
      draftWi.employment_type_id,
      draftWi.date_hired,
      draftWi.tin_number,
      draftWi.sss_number,
      draftWi.hdmf_number,
      draftWi.philhealth_number,
      draftWi.bank_account,
    ];
    if (requiredFields.some((value) => value === null || value === undefined || String(value).trim() === "")) {
      return false;
    }
    for (const field of ["tin_number", "sss_number", "hdmf_number", "philhealth_number", "bank_account"] as const) {
      const val = draftWi[field] ?? "";
      if (WI_BLOCKED_CHARS.test(val) || val.length > WI_TEXT_MAX[field]) return false;
    }
    return true;
  }, [draftWi]);

  // ── Loading states ────────────────────────────────────────────────────────

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
        <TextShimmer className="text-sm" duration={1.4}>Checking permissions…</TextShimmer>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col gap-3 h-full items-center justify-center">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">Employee not found</p>
        <button
          onClick={() => router.push("/dashboard/employees")}
          className="text-xs text-[#2845D6] hover:underline"
        >
          Back to Employees
        </button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col lg:flex-row h-full overflow-hidden p-4 lg:p-5 gap-4">
        <div className="w-full lg:w-64 xl:w-72 shrink-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] overflow-hidden">
          <LeftSkeleton />
        </div>
        <div className="flex-1 rounded-lg border border-[var(--color-border)] overflow-hidden">
          <ContentSkeleton />
        </div>
      </div>
    );
  }

  const fullName = [profile.firstname, profile.lastname].filter(Boolean).join(" ") || profile.idnumber;
  const wi = profile.work_info;

  return (
    <div className="flex flex-col lg:flex-row lg:h-full lg:overflow-hidden p-4 lg:p-5 gap-4">

      {/* ── Left Card ─────────────────────────────────────────────────────── */}
      <LeftCard profile={profile} />

      {/* ── Right Content ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:h-full px-2 lg:overflow-hidden rounded-lg overflow-hidden">

        {/* Header: breadcrumb + tabs */}
        <div className="shrink-0 pt-2 pb-0 border-b border-[var(--color-border)] bg-[var(--color-bg)]">

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 mb-2 min-h-[38px]">
            <button
              onClick={() => router.push("/dashboard/employees")}
              className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[#2845D6] transition-colors"
            >
              <ChevronLeft size={14} />
              Employees
            </button>
            <span className="text-xs text-[var(--color-text-muted)]">/</span>
            <span className="text-xs font-semibold text-[var(--color-text-primary)] truncate max-w-[200px]">
              {fullName}
            </span>
          </div>

          <VercelTabs
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            className="pb-1"
          />
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="h-full"
            >

              {/* ══════════════════════════════════════════════════════════════
                  TAB 1 — Personal Information
              ══════════════════════════════════════════════════════════════ */}
              {activeTab === "personal" && (
                <div className="flex flex-col lg:flex-row gap-5 h-full overflow-hidden lg:overflow-hidden pt-6">

                  {/* Left column — full-width on tablet/mobile, 70% on desktop */}
                  <div className="flex-[7] min-w-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden space-y-4 pb-6">

                    <AccordionSection title="Basic Information">
                      <div className="grid grid-cols-2 min-[480px]:grid-cols-3 gap-4">
                        <ReadField label="First Name"   value={profile.firstname} />
                        <ReadField label="Last Name"    value={profile.lastname} />
                        <ReadField label="Middle Name"  value={profile.personal_info.middle_name} />
                        <ReadField label="Nickname"     value={profile.personal_info.nickname} />
                        <ReadField label="Gender"       value={
                          profile.personal_info.gender === "male" ? "Male"
                          : profile.personal_info.gender === "female" ? "Female"
                          : profile.personal_info.gender || null
                        } />
                        <ReadField label="Birth Date"        value={formatDisplayDate(profile.personal_info.birth_date)} />
                        <ReadField label="Birth Place"       value={profile.personal_info.birth_place} />
                        <ReadField label="Contact Number"    value={profile.personal_info.contact_number} />
                      </div>
                    </AccordionSection>

                    <AccordionSection title="Address Information">
                      <AddressReadView address={profile.present_address} title="Present Address" />

                      <div className="border-t border-[var(--color-border)] my-2" />

                      {profile.provincial_address.same_as_present ? (
                        <div>
                          <h3 className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)] mb-3 tracking-wide">
                            Provincial Address
                            <span className="ml-2 normal-case font-normal text-[var(--color-text-muted)]">(same as present)</span>
                          </h3>
                          <div className="grid grid-cols-2 min-[480px]:grid-cols-3 gap-4">
                            <ReadField label="Country"             value={profile.present_address.country} />
                            <ReadField label="Province"            value={profile.present_address.province} />
                            <ReadField label="City / Municipality" value={profile.present_address.city} />
                            <ReadField label="Barangay"            value={profile.present_address.barangay} />
                            <ReadField label="Street"              value={profile.present_address.street} />
                            <ReadField label="Block / Lot"         value={profile.present_address.block_lot} />
                          </div>
                        </div>
                      ) : (
                        <AddressReadView address={profile.provincial_address} title="Provincial Address" />
                      )}
                    </AccordionSection>

                    <AccordionSection title="Emergency Contact">
                      <div className="grid grid-cols-2 min-[480px]:grid-cols-3 gap-4">
                        <ReadField label="Name"           value={profile.emergency_contact.name} />
                        <ReadField label="Relationship"   value={profile.emergency_contact.relationship} />
                        <ReadField label="Contact Number" value={profile.emergency_contact.contact_number} />
                        <ReadField label="Address"        value={profile.emergency_contact.address} />
                      </div>
                    </AccordionSection>

                    <AccordionSection title="Skills">
                      {profile.skills.length === 0 ? (
                        <p className="text-sm italic text-[var(--color-text-muted)]">— No skills on record</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {profile.skills.map((s) => (
                            <span
                              key={s.name}
                              className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1 text-[12px] font-medium text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
                            >
                              {s.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </AccordionSection>

                    {/* Email + Department — tablet/mobile only (desktop sees them in right column) */}
                    <div className="lg:hidden">
                      <AccordionSection title="Email Addresses">
                        <ReadField label="Account Email" value={profile.email} />
                        <ReadField label="Work Email"    value={profile.personal_info.work_email} />
                      </AccordionSection>
                    </div>

                    <div className="lg:hidden">
                      <AccordionSection title="Department & Role">
                        <ReadField label="Department" value={wi?.department_name} />
                        <ReadField label="Line"       value={wi?.line_name} />
                        <ReadField label="Position"   value={wi?.position_name} />
                        <ReadField label="Approver"   value={wi?.approver_name} />
                      </AccordionSection>
                    </div>
                  </div>

                  {/* Right column — desktop only */}
                  <div className="hidden lg:flex lg:flex-col flex-[3] min-w-0 min-h-0 h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden space-y-4 pb-6">

                    {/* Profile completion card */}
                    <div className="flex-none">
                      <ProfileCompletionCard profile={profile} />
                    </div>

                    <div className="flex-none">
                      <AccordionSection title="Email Addresses">
                        <ReadField label="Account Email" value={profile.email} />
                        <ReadField label="Work Email"    value={profile.personal_info.work_email} />
                      </AccordionSection>
                    </div>

                    {/* Department & Role — editable */}
                    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
                      {/* Header with edit/save/cancel */}
                      <div className="flex items-center gap-2 w-full px-5 py-3.5">
                        <motion.span
                          animate={{ rotate: 0 }}
                          className="shrink-0 text-[var(--color-text-primary)]"
                        >
                          <ChevronDown size={14} />
                        </motion.span>
                        <span className="flex-1 text-sm font-semibold text-[var(--color-text-primary)]">Department &amp; Role</span>
                        {!isEditing ? (
                          <button
                            type="button"
                            onClick={startEditing}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[var(--color-bg-card)] transition-colors"
                          >
                            <Pencil size={12} /> Edit
                          </button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={cancelEditing}
                              disabled={saving}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors"
                            >
                              <X size={12} /> Cancel
                            </button>
                            <div onPointerDown={() => setSaveAttempted(true)}>
                              <button
                                type="button"
                                onClick={saveEditing}
                                disabled={saving || !canSave}
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-white bg-[#2845D6] hover:bg-[#1e37b8] disabled:opacity-60 transition-colors"
                              >
                                {saving
                                  ? <TextShimmer className="text-[11px]" duration={1}>Saving…</TextShimmer>
                                  : <><Check size={12} /> Save</>
                                }
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="px-5 pb-5 space-y-4">
                        {isEditing && draftWi ? (
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4">
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">
                                  Position{(wiTouched.position_id || saveAttempted) && (!draftWi.position_id || wiErrs.position_id) && <span className="ml-0.5 text-red-500">*</span>}
                                </span>
                                <Select
                                  value={draftWi.position_id?.toString() ?? ""}
                                  onValueChange={(v) => {
                                    const id = v ? Number(v) : null;
                                    setDraftWi((d) => d ? { ...d, position_id: id } : d);
                                    setWiTouched((t) => ({ ...t, position_id: true }));
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder="Select position" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {positions.map((p) => (
                                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {wiErrs.position_id && <span className="text-[10px] text-red-500">{wiErrs.position_id}</span>}
                              </div>

                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">
                                  Employment Type{(wiTouched.employment_type_id || saveAttempted) && (!draftWi.employment_type_id || wiErrs.employment_type_id) && <span className="ml-0.5 text-red-500">*</span>}
                                </span>
                                <Select
                                  value={draftWi.employment_type_id?.toString() ?? ""}
                                  onValueChange={(v) => {
                                    const id = v ? Number(v) : null;
                                    setDraftWi((d) => d ? { ...d, employment_type_id: id } : d);
                                    setWiTouched((t) => ({ ...t, employment_type_id: true }));
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder="Select employment type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {employmentTypes.map((e) => (
                                      <SelectItem key={e.id} value={e.id.toString()}>{e.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {wiErrs.employment_type_id && <span className="text-[10px] text-red-500">{wiErrs.employment_type_id}</span>}
                              </div>

                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">
                                  Date Hired{(wiTouched.date_hired || saveAttempted) && (!draftWi.date_hired || wiErrs.date_hired) && <span className="ml-0.5 text-red-500">*</span>}
                                </span>
                                <DateTimePicker
                                  value={draftWi.date_hired ? new Date(draftWi.date_hired) : undefined}
                                  onChange={(date) => {
                                    const year  = date.getFullYear();
                                    const month = String(date.getMonth() + 1).padStart(2, '0');
                                    const day   = String(date.getDate()).padStart(2, '0');
                                    setDraftWi((d) => d ? { ...d, date_hired: `${year}-${month}-${day}` } : d);
                                    setWiTouched((t) => ({ ...t, date_hired: true }));
                                  }}
                                  placeholder="Select hire date"
                                />
                                {wiErrs.date_hired && <span className="text-[10px] text-red-500">{wiErrs.date_hired}</span>}
                              </div>
                            </div>

                            <div className="border-t border-[var(--color-border)] pt-4 grid grid-cols-1 gap-4">
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">
                                  Department{(wiTouched.department_id || saveAttempted) && (!draftWi.department_id || wiErrs.department_id) && <span className="ml-0.5 text-red-500">*</span>}
                                </span>
                                <Select
                                  value={draftWi.department_id?.toString() ?? ""}
                                  onValueChange={(v) => {
                                    const id = v ? Number(v) : null;
                                    setDraftWi((d) => d ? { ...d, department_id: id, line_id: null } : d);
                                    setWiTouched((t) => ({ ...t, department_id: true }));
                                    loadLines(id);
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder="Select department" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {depts.map((d) => (
                                      <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {wiErrs.department_id && <span className="text-[10px] text-red-500">{wiErrs.department_id}</span>}
                              </div>

                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">
                                  Line{(wiTouched.line_id || saveAttempted) && (!draftWi.line_id || wiErrs.line_id) && <span className="ml-0.5 text-red-500">*</span>}
                                </span>
                                <Select
                                  value={draftWi.line_id?.toString() ?? ""}
                                  onValueChange={(v) => {
                                    const id = v ? Number(v) : null;
                                    setDraftWi((d) => d ? { ...d, line_id: id } : d);
                                    setWiTouched((t) => ({ ...t, line_id: true }));
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder="Select line" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {lines.map((l) => (
                                      <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {wiErrs.line_id && <span className="text-[10px] text-red-500">{wiErrs.line_id}</span>}
                              </div>

                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">
                                  Approver{(wiTouched.approver_id || saveAttempted) && (!draftWi.approver_id || wiErrs.approver_id) && <span className="ml-0.5 text-red-500">*</span>}
                                </span>
                                <Select
                                  value={draftWi.approver_id?.toString() ?? ""}
                                  onValueChange={(v) => {
                                    const id = v ? Number(v) : null;
                                    setDraftWi((d) => d ? { ...d, approver_id: id } : d);
                                    setWiTouched((t) => ({ ...t, approver_id: true }));
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder="Select approver" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {approvers.map((a) => (
                                      <SelectItem key={a.id} value={a.id.toString()}>
                                        {a.name || a.idnumber}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {wiErrs.approver_id && <span className="text-[10px] text-red-500">{wiErrs.approver_id}</span>}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <ReadField label="Department" value={wi?.department_name} />
                            <ReadField label="Line" value={wi?.line_name} />
                            <ReadField label="Approver" value={wi?.approver_name} />
                          </>
                        )}

                        {/* Sensitive fields — slide-down in edit mode only */}
                        <AnimatePresence initial={false}>
                          {isEditing && draftWi && (
                            <motion.div
                              key="sensitive-fields"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: "easeInOut" }}
                              className="overflow-visible"
                            >
                              <div className="space-y-3 pt-1">
                                <div className="border-t border-[var(--color-border)]" />
                                {(["tin_number", "sss_number", "hdmf_number", "philhealth_number", "bank_account"] as const).map((field) => (
                                  <div key={field} className="flex flex-col gap-1">
                                    <span className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">
                                      {WI_TEXT_LABELS[field]}{(wiTouched[field] || saveAttempted) && (!draftWi[field].trim() || wiErrs[field]) && <span className="ml-0.5 text-red-500">*</span>}
                                    </span>
                                    <Input
                                      className="h-8 text-sm"
                                      value={draftWi[field]}
                                      maxLength={WI_TEXT_MAX[field] + 1}
                                      onChange={(e) => {
                                        setDraftWi((d) => d ? { ...d, [field]: e.target.value } : d);
                                        setWiTouched((t) => ({ ...t, [field]: true }));
                                      }}
                                      onBlur={() => setWiTouched((t) => ({ ...t, [field]: true }))}
                                      placeholder={`Enter ${WI_TEXT_LABELS[field]}`}
                                    />
                                    {wiErrs[field] && <span className="text-[10px] text-red-500">{wiErrs[field]}</span>}
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </section>
                  </div>
                </div>
              )}

              {/* ══════════════════════════════════════════════════════════════
                  TAB 2 — Background & Education
              ══════════════════════════════════════════════════════════════ */}
              {activeTab === "background" && (
                <div className="h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-6">
                  <div className="w-full max-w-5xl space-y-5">

                    <AccordionSection title="Family Background">
                      <div className="grid grid-cols-2 min-[480px]:grid-cols-3 gap-4">
                        <ReadField label="Mother's Name" value={profile.family_background.mother_name} />
                        <ReadField label="Father's Name" value={profile.family_background.father_name} />
                        <ReadField label="Spouse Name"   value={profile.family_background.spouse_name} />
                      </div>

                      {/* Children */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">Children</span>
                        {profile.children.length === 0 ? (
                          <p className="text-sm italic text-[var(--color-text-muted)]">— No children on record</p>
                        ) : (
                          <div className="space-y-1">
                            {profile.children.map((child, idx) => (
                              <p key={child.id ?? idx} className="text-sm text-[var(--color-text-primary)]">
                                {idx + 1}. {child.name || <span className="italic text-[var(--color-text-muted)]">—</span>}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </AccordionSection>

                    <AccordionSection title="Educational Background">
                      {profile.education_records.length === 0 ? (
                        <p className="text-sm italic text-[var(--color-text-muted)]">— No education records on file</p>
                      ) : (
                        <Timeline
                          variant="default"
                          showTimestamps={false}
                          items={sortByEducationLevel(profile.education_records).map((rec, idx) => ({
                            id: rec.id?.toString() ?? `edu-${idx}`,
                            title: (
                              <div className="space-y-1.5">
                                <div className="text-[11px] text-[var(--color-text-muted)]">
                                  {rec.year_attended || "—"}
                                </div>
                                <div>
                                  <span className="inline-flex rounded-full bg-[var(--color-bg-card)] px-1.5 py-1 text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">
                                    {EDUCATION_LEVEL_LABELS[rec.education_level] ?? rec.education_level ?? "Education"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-md font-semibold text-[var(--color-text-primary)] block leading-tight">
                                    {rec.institution || "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] font-normal text-[var(--color-text-muted)] leading-snug">
                                    {rec.degree}
                                  </span>
                                </div>
                              </div>
                            ),
                            status: "default" as const,
                            icon: getEducationIcon(rec.education_level),
                          }))}
                        />
                      )}
                    </AccordionSection>

                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

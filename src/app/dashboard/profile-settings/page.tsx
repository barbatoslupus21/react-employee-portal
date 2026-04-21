"use client";

import React, {
  useState, useEffect, useCallback, useRef, useMemo, KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, animate, type Variants } from "motion/react";
import {
  Camera, Pencil, X, Plus, Trash2,
  Eye, EyeOff, CheckCircle2, XCircle, Award,
  ChevronDown, ChevronUp, Check, ChevronsUpDown,
  School, BookOpen, Wrench, GraduationCap,
  User, Users,
} from "lucide-react";
import { Timeline } from "@/components/ui/timeline";

import { Tabs as VercelTabs } from "@/components/ui/vercel-tabs";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ElasticSwitch } from "@/components/ui/elastic-switch-shadcnui";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { EmptyState } from "@/components/ui/interactive-empty-state";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { toast } from "@/components/ui/toast";
import { getCsrfToken } from "@/lib/csrf";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Country, State, City } from "country-state-city";
import { AvatarUploader } from "@/components/ui/avatar-uploader";

// ── Types ───────────────────────────────────────────────────────────────────────

interface Skill        { id?: number; name: string; }
interface Certificate  { id: number; title: string; category_name: string; category_icon: string; created_at: string; }
interface PersonalInfo { middle_name: string; nickname: string; work_email: string; gender: string; birth_date: string; birth_place: string; contact_number: string; }
interface Address      { country: string; province: string; city: string; barangay: string; street: string; block_lot: string; }
interface ProvincialAddr extends Address { same_as_present: boolean; }
interface EmergencyContact { name: string; relationship: string; contact_number: string; address: string; }
interface FamilyBg     { mother_name: string; father_name: string; spouse_name: string; }
interface ChildRec     { id?: number; name: string; }
interface EduRec       { id?: number; institution: string; education_level: string; degree: string; year_attended: string; }
interface WorkInfo {
  department_id: number | null; department_name: string | null;
  line_id: number | null;       line_name: string | null;
  approver_id: number | null;   approver_name: string | null;
  position_name: string | null; employment_type_name: string | null;
  office_name: string | null;   shift_name: string | null;
  date_hired: string | null;    tin_number: string;
  sss_number: string;           hdmf_number: string;
  philhealth_number: string;    bank_account: string;
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
interface Dept     { id: number; name: string; office_name: string; }
interface Line     { id: number; name: string; }
interface Approver { id: number; idnumber: string; name: string; }
interface Policy   { min_length: number; require_uppercase: boolean; require_lowercase: boolean; require_number: boolean; require_special_character: boolean; }

// ── Constants ───────────────────────────────────────────────────────────────────

const TABS = [
  { id: "personal",   label: "Personal Information" },
  { id: "background", label: "Background & Education" },
  { id: "password",   label: "Change Password" },
];

function deepClone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

function formatDisplayDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const FIELD_VARIANTS: Variants = {
  hidden:  { opacity: 0, y: -4 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.18, ease: "easeOut" } },
};

// ── Countries / States / Cities (country-state-city) ───────────────────────

const _ALL_COUNTRIES = Country.getAllCountries();
/** Map country name → ISO-2 code (e.g. "Philippines" → "PH") */
const COUNTRY_ISO_MAP: Record<string, string> = {};
_ALL_COUNTRIES.forEach(c => { COUNTRY_ISO_MAP[c.name] = c.isoCode; });
/** Sorted list of country names with Philippines pinned first */
const COUNTRY_NAMES: string[] = [
  "Philippines",
  ..._ALL_COUNTRIES.map(c => c.name).filter(n => n !== "Philippines"),
];

// ── Country combobox (searchable) ────────────────────────────────────────────

function CountryCombobox({ value, onChange, disabled, error }: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value;

  return (
    <div className="flex flex-col gap-1.5">
      <InputLabel label="Country" required value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={`flex h-9 w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors
              ${error ? "border-red-500" : "border-[var(--color-border-strong)]"}
              bg-[var(--color-bg-elevated)] text-left
              disabled:cursor-not-allowed disabled:opacity-50
              focus:outline-none`}
          >
            <span className={selected ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)] italic"}>
              {selected || "Select country"}
            </span>
            <ChevronsUpDown size={14} className="shrink-0 text-[var(--color-text-muted)]" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search country…" />
            <CommandList className="max-h-[220px]">
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {COUNTRY_NAMES.map((c) => (
                  <CommandItem
                    key={c}
                    value={c}
                    onSelect={(v) => { onChange(v === value ? "" : v); setOpen(false); }}
                  >
                    <Check size={13} className={`mr-2 shrink-0 ${c === value ? "opacity-100" : "opacity-0"}`} />
                    {c}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────────────────────

function Pill({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-sm px-1.5 py-0.2 text-[11px] font-medium whitespace-nowrap
      ${accent
        ? "bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400 border border-gray-400/10 dark:border-gray-400/10"
        : "bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400 border border-gray-400/10 dark:border-gray-400/10"
      }`}>
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

function getEducationRecordLabel(index: number, level?: string) {
  const levelLabels: Record<string, string> = {
    primary: "Primary",
    secondary: "Secondary",
    vocational: "Vocational",
    tertiary: "Tertiary",
  };
  if (level && levelLabels[level]) return levelLabels[level];
  const fallbackLabels = ["Elementary", "Secondary", "Tertiary", "Vocational", "Postgraduate"];
  return fallbackLabels[index] ?? `Additional ${index - 2}`;
}

// ── Education Timeline Helpers ────────────────────────────────────────────────

const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  primary:    "Primary",
  secondary:  "Secondary",
  vocational: "Vocational",
  tertiary:   "Tertiary",
  masteral:   "Masteral",
  doctorate:  "Doctorate",
};

/** Fixed sort order: Primary → Secondary → Vocational → Tertiary → Masteral → Doctorate */
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

function InputLabel({ label, required, value }: { label: string; required?: boolean; value?: string | null | undefined }) {
  return (
    <label className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">
      {label}
      {required && !value ? <span className="text-red-500"> *</span> : null}
    </label>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────────

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

function RightSkeleton() {
  return (
    <div className="animate-pulse p-6 space-y-5">
      <div className="flex gap-1">
        {[110, 130, 160, 130].map((w, i) => (
          <div key={i} className="h-7 rounded bg-[var(--color-bg-card)]" style={{ width: w }} />
        ))}
      </div>
      <div className="grid grid-cols-2 min-[480px]:grid-cols-3 gap-4 mt-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-24 rounded bg-[var(--color-bg-card)]" />
            <div className="h-9 rounded-lg bg-[var(--color-bg-card)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Left Card ──────────────────────────────────────────────────────────────────

interface LeftCardProps {
  profile: ProfileData;
  isEditing: boolean;
  avatarPreview: string | null;
  onAvatarClick: () => void;
}

function LeftCard({
  profile, isEditing, avatarPreview, onAvatarClick,
}: LeftCardProps) {
  const [certsExpanded, setCertsExpanded] = useState(false);
  // Expand/collapse the card body — available on ALL viewport sizes
  const [isExpanded, setIsExpanded] = useState(true);

  const wi         = profile.work_info;
  const displayAv  = avatarPreview ?? profile.avatar ?? "/default-avatar.png";
  const fullName   = [profile.firstname, profile.lastname].filter(Boolean).join(" ") || profile.idnumber;

  const certPreview  = profile.certificates.slice(0, 4);
  const certExtra    = profile.certificates.slice(4);
  const extraCount   = certExtra.length;

  const hasAnyEmploymentDetail = !!(wi?.date_hired || wi?.tin_number || wi?.sss_number || wi?.hdmf_number || wi?.bank_account);

  return (
    <aside className="w-full lg:w-64 xl:w-72 shrink-0 lg:h-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] flex flex-col overflow-hidden">

      {/* ── Cover image ── */}
      <div className="relative shrink-0 h-[80px] overflow-visible rounded-t-2xl">
        <img
          src="/coverpage.jpg"
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover select-none"
        />
        {/* Avatar — left-aligned, overlaying the cover */}
        <div className="absolute left-5 top-full -translate-y-1/2 z-20">
          <div className="relative">
            <div className="h-[78px] w-[78px] overflow-hidden rounded-full border-[4px] border-[var(--color-bg-elevated)] bg-white">
              <img
                src={displayAv}
                alt={fullName}
                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/default-avatar.png"; }}
                className="h-full w-full object-cover"
              />
            </div>
            <AnimatePresence>
              {isEditing && (
                <motion.button
                  key="cam"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.15 }}
                  onClick={onAvatarClick}
                  className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-[#2845D6] text-white hover:bg-[#1e37b8] transition-colors shadow-md border-2 border-[var(--color-bg-elevated)]"
                  aria-label="Change avatar"
                >
                  <Camera size={11} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Static header — always visible on all viewports ── */}
      <div className="px-5 pb-2 pt-9 space-y-1">
        <div className="space-y-0">
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
      </div>

      {/* ── Expandable body — controlled by isExpanded on ALL viewports ── */}
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
              {/* ── Employment type ── */}
              {(wi?.office_name || wi?.employment_type_name) && (
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">Employment type</span>
                  <div className="flex flex-wrap justify-end gap-1 max-w-[70%]">
                    {wi?.employment_type_name && <Pill>{wi.employment_type_name}</Pill>}
                  </div>
                </div>
              )}

              {/* ── Core employment details ── */}
              {hasAnyEmploymentDetail && (
                <div className="space-y-2.5">
                  <InfoRow label="Date Hired"      value={formatDisplayDate(wi?.date_hired)} />
                  <InfoRow label="TIN Number"      value={wi?.tin_number} />
                  <InfoRow label="SSS Number"      value={wi?.sss_number} />
                  <InfoRow label="HDMF / Pag-IBIG" value={wi?.hdmf_number} />
                  <InfoRow label="Bank Account"    value={wi?.bank_account} />
                </div>
              )}

              {/* ── Skills ── */}
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

              {/* ── Certificates ── */}
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
                      {certsExpanded ? <>See less <ChevronUp size={12} /></> : <>See {extraCount} more <ChevronDown size={12} /></>}
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Expand/collapse toggle — always visible on all viewports ── */}
      <div className="shrink-0 flex justify-center pb-2 pt-1 mt-auto">
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

// ── Skills panel (used in Personal tab) ─────────────────────────────────────

interface SkillsPanelProps {
  draftSkills: Skill[];
  isEditing: boolean;
  onRemoveSkill: (i: number) => void;
  onAddSkill: (name: string) => void;
}

function SkillsPanel({ draftSkills, isEditing, onRemoveSkill, onAddSkill }: SkillsPanelProps) {
  const [skillInput, setSkillInput] = useState("");

  function commitSkill() {
    const trimmed = skillInput.trim().slice(0, 100);
    if (!trimmed) return;
    onAddSkill(trimmed);
    setSkillInput("");
  }

  useEffect(() => {
    if (!isEditing) setSkillInput("");
  }, [isEditing]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <AnimatePresence>
          {draftSkills.map((s, i) => (
            <motion.span
              key={s.name}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1 text-[12px] font-medium text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
            >
              {s.name}
              {isEditing && (
                <button onClick={() => onRemoveSkill(i)} className="text-slate-500 hover:text-red-500 transition-colors ml-0.5">
                  <X size={10} />
                </button>
              )}
            </motion.span>
          ))}
        </AnimatePresence>
        {draftSkills.length === 0 && !isEditing && (
          <span className="text-sm italic text-[var(--color-text-muted)]">— No skills on record</span>
        )}
        {draftSkills.length === 0 && isEditing && (
          <span className="text-xs italic text-[var(--color-text-muted)]">Add your skills below</span>
        )}
      </div>
      {isEditing && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex gap-1">
          <input
            type="text"
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { e.preventDefault(); commitSkill(); } }}
            maxLength={100}
            placeholder="Add skill…"
            className="flex-1 min-w-0 h-7 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[#2845D6]/40 placeholder:text-[var(--color-text-muted)]"
          />
          <button
            onClick={commitSkill}
            disabled={!skillInput.trim()}
            className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md bg-[#2845D6] text-white hover:bg-[#1e37b8] disabled:opacity-40 transition-colors"
          >
            <Plus size={12} />
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ── Address fields (shared, no card wrapper) ─────────────────────────────────

interface AddrFieldsProps {
  address: Address;
  isEditing: boolean;
  onChange: (p: Partial<Address>) => void;
  /** PSGC data for Philippines (province → city → barangay[]); null when not yet loaded */
  psgcData: Record<string, Record<string, string[]>> | null;
  onCountryChange: (v: string) => void;
  onProvinceChange: (v: string) => void;
  onCityChange: (v: string) => void;
  fieldErrors: Record<string, string>;
  prefix: string;
}

function AddressFields({
  address, isEditing, onChange,
  psgcData,
  onCountryChange, onProvinceChange, onCityChange,
  fieldErrors, prefix,
}: AddrFieldsProps) {
  const isPH = address.country === "Philippines";

  // Derive province/state options from PSGC (PH) or country-state-city (others)
  const provinceOptions = useMemo<string[]>(() => {
    if (!address.country) return [];
    if (isPH && psgcData) return Object.keys(psgcData);
    const iso = COUNTRY_ISO_MAP[address.country];
    if (!iso) return [];
    return State.getStatesOfCountry(iso).map(s => s.name);
  }, [address.country, isPH, psgcData]);

  // Derive city/municipality options
  const cityOptions = useMemo<string[]>(() => {
    if (!address.province) return [];
    if (isPH && psgcData) return Object.keys(psgcData[address.province] ?? {});
    const countryIso = COUNTRY_ISO_MAP[address.country];
    if (!countryIso) return [];
    const stateIso = State.getStatesOfCountry(countryIso).find(s => s.name === address.province)?.isoCode;
    if (!stateIso) return [];
    return City.getCitiesOfState(countryIso, stateIso).map(c => c.name);
  }, [address.country, address.province, isPH, psgcData]);

  // Derive barangay options (Philippines only via PSGC)
  const barangayOptions = useMemo<string[]>(() => {
    if (!isPH || !psgcData || !address.province || !address.city) return [];
    return psgcData[address.province]?.[address.city] ?? [];
  }, [isPH, psgcData, address.province, address.city]);

  return (
    <div className="grid grid-cols-2 min-[480px]:grid-cols-3 gap-4">
      {/* Country — always a searchable combobox in edit mode */}
      <AnimatePresence mode="wait">
        {isEditing ? (
          <motion.div key="e" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
            <CountryCombobox value={address.country} onChange={onCountryChange} error={fieldErrors[`${prefix}.country`]} />
          </motion.div>
        ) : (
          <motion.div key="v" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ReadField label="Country" value={address.country} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Province / State — Select when options available, Input fallback */}
      <AnimatePresence mode="wait">
        {isEditing ? (
          <motion.div key="e" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
            <div className="flex flex-col gap-1.5">
              <InputLabel label="Province" required value={address.province} />
              {provinceOptions.length > 0 ? (
                <Select value={address.province} onValueChange={onProvinceChange} disabled={!address.country}>
                  <SelectTrigger><SelectValue placeholder="Select province" /></SelectTrigger>
                  <SelectContent>
                    {provinceOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input maxLength={100} value={address.province}
                  onChange={(e) => onProvinceChange(e.target.value)}
                  placeholder="Enter province / state"
                  disabled={!address.country} />
              )}
              {fieldErrors[`${prefix}.province`] && <span className="text-xs text-red-500">{fieldErrors[`${prefix}.province`]}</span>}
            </div>
          </motion.div>
        ) : (
          <motion.div key="v" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ReadField label="Province" value={address.province} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* City / Municipality — Select when options available, Input fallback */}
      <AnimatePresence mode="wait">
        {isEditing ? (
          <motion.div key="e" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
            <div className="flex flex-col gap-1.5">
              <InputLabel label="City / Municipality" required value={address.city} />
              {cityOptions.length > 0 ? (
                <Select value={address.city} onValueChange={onCityChange} disabled={!address.province}>
                  <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                  <SelectContent>
                    {cityOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input maxLength={100} value={address.city}
                  onChange={(e) => onCityChange(e.target.value)}
                  placeholder="Enter city / municipality"
                  disabled={!address.province} />
              )}
              {fieldErrors[`${prefix}.city`] && <span className="text-xs text-red-500">{fieldErrors[`${prefix}.city`]}</span>}
            </div>
          </motion.div>
        ) : (
          <motion.div key="v" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ReadField label="City / Municipality" value={address.city} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Barangay — Select (PH via PSGC) or Input (other countries), disabled until city selected */}
      <AnimatePresence mode="wait">
        {isEditing ? (
          <motion.div key="e" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
            <div className="flex flex-col gap-1.5">
              <InputLabel label="Barangay" required value={address.barangay} />
              {barangayOptions.length > 0 ? (
                <Select value={address.barangay} onValueChange={(v) => onChange({ barangay: v })} disabled={!address.city}>
                  <SelectTrigger><SelectValue placeholder="Select barangay" /></SelectTrigger>
                  <SelectContent>
                    {barangayOptions.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input maxLength={150} value={address.barangay}
                  onChange={(e) => onChange({ barangay: e.target.value })}
                  placeholder="Enter barangay / district"
                  disabled={!address.city} />
              )}
              {fieldErrors[`${prefix}.barangay`] && <span className="text-xs text-red-500">{fieldErrors[`${prefix}.barangay`]}</span>}
            </div>
          </motion.div>
        ) : (
          <motion.div key="v" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ReadField label="Barangay" value={address.barangay} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Street — free-text, disabled until barangay selected */}
      <AnimatePresence mode="wait">
        {isEditing ? (
          <motion.div key="e" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">Street</label>
              <Input maxLength={200} value={address.street}
                onChange={(e) => onChange({ street: e.target.value })}
                error={fieldErrors[`${prefix}.street`]}
                placeholder="House/Unit no. and street name"
                disabled={!address.barangay} />
            </div>
          </motion.div>
        ) : (
          <motion.div key="v" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ReadField label="Street" value={address.street} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Block / Lot — free-text, disabled until barangay selected */}
      <AnimatePresence mode="wait">
        {isEditing ? (
          <motion.div key="e" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">Block / Lot</label>
              <Input maxLength={50} value={address.block_lot}
                onChange={(e) => onChange({ block_lot: e.target.value })}
                placeholder="Optional"
                disabled={!address.barangay} />
            </div>
          </motion.div>
        ) : (
          <motion.div key="v" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ReadField label="Block / Lot" value={address.block_lot} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Accordion section card (collapsible with smooth slide) ────────────────────

interface AccordionSectionProps {
  title: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function AccordionSection({ title, headerExtra, children, defaultOpen = true }: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] overflow-hidden">
      <div className="flex items-center justify-between px-5 min-h-[48px]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 flex-1 py-3.5 text-sm font-semibold text-[var(--color-text-primary)] text-left select-none"
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
        {headerExtra && <div className="shrink-0 pl-2">{headerExtra}</div>}
      </div>
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
            <div className="px-5 pb-5 space-y-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ── Password policy rule row ─────────────────────────────────────────────────

function PolicyRule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${ok ? "text-green-600" : "text-[var(--color-text-muted)]"}`}>
      {ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      <span>{label}</span>
    </div>
  );
}

// ── Profile Completion Card ─────────────────────────────────────────────────

function ProfileCompletionCard({ profile }: { profile: ProfileData }) {
  const { percentage, personalComplete, hasFamilyBg, hasEducation, message, chartColor, chartGradient } = useMemo(() => {
    // Required fields strictly within the Personal Information tab
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
    if      (pct === 0)  msg = "Your profile is empty. Start filling in your details.";
    else if (pct < 30)   msg = "Just getting started — add your basic details to proceed.";
    else if (pct < 50)   msg = "Good progress! Keep adding your information.";
    else if (pct < 70)   msg = "You're halfway there. A few more fields to go.";
    else if (pct < 100)  msg = "Almost complete! Fill in the remaining required fields.";
    else                 msg = "Excellent work! Your profile is fully complete.";

    const colorStops = pct <= 50
      ? ["#F87171", "#EF4444"]
      : pct <= 70
        ? ["#FBBF24", "#F59E0B"]
        : ["#34D399", "#10B981"];

    return {
      percentage: pct,
      personalComplete,
      hasFamilyBg,
      hasEducation,
      message: msg,
      chartColor: colorStops[1],
      chartGradient: colorStops,
    };
  }, [profile]);

  // Animated counter (0 → percentage)
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

  // SVG donut params
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
        {/* Donut chart */}
        <div className="relative shrink-0" style={{ width: svgSize, height: svgSize }}>
          <svg
            width={svgSize}
            height={svgSize}
            viewBox={`0 0 ${svgSize} ${svgSize}`}
            style={{ display: "block" }}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="completionGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={chartGradient[0]} />
                <stop offset="100%" stopColor={chartGradient[1]} />
              </linearGradient>
            </defs>
            {/* Background track */}
            <circle
              cx={svgSize / 2}
              cy={svgSize / 2}
              r={r}
              fill="none"
              stroke="rgba(148, 163, 184, 0.32)"
              strokeWidth={sw}
            />
            {/* Animated progress arc — rotated so progress starts at 12 o'clock */}
            <g transform={`rotate(-90 ${svgSize / 2} ${svgSize / 2})`}>
              <motion.circle
                key={percentage}
                cx={svgSize / 2}
                cy={svgSize / 2}
                r={r}
                fill="none"
                stroke="url(#completionGradient)"
                strokeWidth={sw}
                strokeLinecap="round"
                strokeDasharray={C}
                initial={{ strokeDashoffset: C }}
                animate={{ strokeDashoffset: dashOffset }}
                transition={{ duration: 2.4, ease: "easeOut" }}
              />
            </g>
          </svg>
          {/* Center percentage label */}
          <div className="absolute inset-0 flex items-center justify-center select-none">
            <span
              className="text-sm font-bold leading-none tabular-nums"
              style={{ color: chartColor }}
            >
              {displayedPct}%
            </span>
          </div>
        </div>

        {/* Summary */}
        <div className="flex-1 min-w-0 space-y-3">
          <p className="text-sm leading-snug text-[var(--color-text-secondary)]">{message}</p>
          <div className="space-y-1.5">
            {sections.map(({ label, done }) => {
              const LeadingIcon = label === "Profile" ? User : label === "Background" ? Users : GraduationCap;
              return (
                <div key={label} className="flex items-center gap-2">
                  <LeadingIcon size={15} className="text-[var(--color-text-muted)]" aria-hidden="true" />
                  <span className={`text-xs font-medium pl-1 ${done ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-muted)]"}`}>
                    {label}
                  </span>
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

// ── Main page ────────────────────────────────────────────────────────────────

export default function ProfileSettingsPage() {
  const router = useRouter();

  // ── auth ──────────────────────────────────────────────────────────────────
  type AuthPhase = "spinner" | "checking" | "done";
  const [authPhase, setAuthPhase] = useState<AuthPhase>("spinner");

  // ── profile ───────────────────────────────────────────────────────────────
  const [savedProfile,  setSavedProfile]  = useState<ProfileData | null>(null);
  const [draftProfile,  setDraftProfile]  = useState<ProfileData | null>(null);
  const [draftSkills,   setDraftSkills]   = useState<Skill[]>([]);
  const [isEditing,     setIsEditing]     = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [fieldErrors,   setFieldErrors]   = useState<Record<string, string>>({});

  // ── avatar ─────────────────────────────────────────────────────────────────
  const [avatarPreview,   setAvatarPreview]   = useState<string | null>(null);
  const [avatarFile,      setAvatarFile]      = useState<File | null>(null);
  const [avatarCropOpen,  setAvatarCropOpen]  = useState(false);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  // ── tabs ──────────────────────────────────────────────────────────────────
  const [activeTab,         setActiveTab]        = useState("personal");
  const [pendingTab,        setPendingTab]        = useState<string | null>(null);
  const [showDiscard,       setShowDiscard]       = useState(false);
  const [discardConfirming, setDiscardConfirming] = useState(false);

  // ── work dropdowns ─────────────────────────────────────────────────────────
  const [depts,     setDepts]     = useState<Dept[]>([]);
  const [lines,     setLines]     = useState<Line[]>([]);
  const [approvers, setApprovers] = useState<Approver[]>([]);

  // ── PSGC ──────────────────────────────────────────────────────────────────
  const [psgcData, setPsgcData] = useState<Record<string, Record<string, string[]>> | null>(null);
  const psgcRef    = useRef<Record<string, Record<string, string[]>> | null>(null);

  // ── password ──────────────────────────────────────────────────────────────
  const [pwCurrent,  setPwCurrent]  = useState("");
  const [pwNew,      setPwNew]      = useState("");
  const [pwConfirm,  setPwConfirm]  = useState("");
  const [pwShowCurr, setPwShowCurr] = useState(false);
  const [pwShowNew,  setPwShowNew]  = useState(false);
  const [pwShowConf, setPwShowConf] = useState(false);
  const [pwSaving,   setPwSaving]   = useState(false);
  const [policy,     setPolicy]     = useState<Policy | null>(null);

  // ────────────────────────────────────────────────────────────────────────────
  // Fetch helpers
  // ────────────────────────────────────────────────────────────────────────────

  const fetchProfile = useCallback(async () => {
    const r = await fetch("/api/user-profile/me", { credentials: "include" });
    return r.ok ? (await r.json()) as ProfileData : null;
  }, []);

  const fetchDepts = useCallback(async () => {
    const r = await fetch("/api/general-settings/departments", { credentials: "include" });
    if (r.ok) setDepts(await r.json());
  }, []);

  const fetchLines = useCallback(async (id: number) => {
    const r = await fetch(`/api/general-settings/lines?department=${id}`, { credentials: "include" });
    if (r.ok) setLines(await r.json()); else setLines([]);
  }, []);

  const fetchApprovers = useCallback(async (id: number) => {
    const r = await fetch(`/api/user-profile/approvers?department=${id}`, { credentials: "include" });
    if (r.ok) setApprovers(await r.json()); else setApprovers([]);
  }, []);

  const fetchPolicy = useCallback(async () => {
    const r = await fetch("/api/general-settings/password-policy", { credentials: "include" });
    if (r.ok) setPolicy(await r.json());
  }, []);

  const loadPsgc = useCallback(async () => {
    if (psgcRef.current) return;
    try {
      const r = await fetch("/data/psgc.json");
      if (!r.ok) return;
      psgcRef.current = await r.json();
      setPsgcData(psgcRef.current);
    } catch { /* PSGC not available — address fields fall back to free-text */ }
  }, []);

  // ────────────────────────────────────────────────────────────────────────────
  // Auth + initial load
  // ────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => setAuthPhase("checking"), 350);
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { credentials: "include" });
        clearTimeout(timer);
        if (!r.ok) { router.replace("/"); return; }
        const userData = await r.json();
        // Privileged users (admin, hr, accounting) must not access profile-settings
        if (userData.admin || userData.hr || userData.accounting) {
          router.replace(userData.admin || userData.hr ? "/dashboard/employees" : "/dashboard");
          return;
        }
        const [prof] = await Promise.all([fetchProfile(), fetchDepts()]);
        if (prof) {
          setSavedProfile(prof);
          setDraftProfile(deepClone(prof));
          setDraftSkills(deepClone(prof.skills));
        }
        setAuthPhase("done");
      } catch { clearTimeout(timer); router.replace("/"); }
    })();
    return () => clearTimeout(timer);
  }, [router, fetchProfile, fetchDepts]);

  // Prefetch password policy
  useEffect(() => { if (activeTab === "password" && !policy) fetchPolicy(); }, [activeTab, policy, fetchPolicy]);

  // Prefetch work dropdowns when editing work tab
  useEffect(() => {
    if (isEditing && activeTab === "personal" && draftProfile?.work_info?.department_id) {
      fetchLines(draftProfile.work_info.department_id);
      fetchApprovers(draftProfile.work_info.department_id);
    }
  }, [isEditing, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load PSGC on personal tab
  useEffect(() => { if (activeTab === "personal") loadPsgc(); }, [activeTab, loadPsgc]);

  // Avatar preview cleanup
  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);

  // ────────────────────────────────────────────────────────────────────────────
  // Editing helpers
  // ────────────────────────────────────────────────────────────────────────────

  function startEditing() {
    if (!savedProfile) return;
    setDraftProfile(deepClone(savedProfile));
    setDraftSkills(deepClone(savedProfile.skills));
    setFieldErrors({});
    setIsEditing(true);
  }

  function cancelEditing() {
    if (savedProfile) {
      setDraftProfile(deepClone(savedProfile));
      setDraftSkills(deepClone(savedProfile.skills));
    }
    setAvatarFile(null);
    if (avatarPreview) { URL.revokeObjectURL(avatarPreview); setAvatarPreview(null); }
    setFieldErrors({});
    setIsEditing(false);
  }

  function updateDraft<K extends keyof ProfileData>(section: K, patch: Partial<ProfileData[K]>) {
    setDraftProfile((p) => p ? { ...p, [section]: { ...(p[section] as object), ...patch } } : p);
  }

  function handleFieldChange(section: keyof ProfileData, key: string, value: string) {
    const BLOCKED = /[<>{}\[\]\\|^~`"]/;
    let err = BLOCKED.test(value) ? 'Field contains invalid characters (< > { } [ ] \\ | ^ ~ ` ")' : "";
    if (!err) {
      if (key === "contact_number") {
        if (value && !/^(\+63|0)\d{10}$/.test(value)) {
          err = "Enter a valid PH mobile number (e.g. 09171234567 or +639171234567)";
        }
      } else if (key === "work_email") {
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          err = "Enter a valid email address";
        }
      }
    }
    setFieldErrors((prev) => ({ ...prev, [`${section}.${key}`]: err }));
    updateDraft(section as never, { [key]: value } as never);
  }

  // Computed: all required fields filled and no validation errors
  const canSave = useMemo(() => {
    if (!draftProfile) return false;
    if (Object.values(fieldErrors).some(Boolean)) return false;
    if (!draftProfile.personal_info.gender) return false;
    if (!draftProfile.personal_info.birth_date) return false;
    if (!draftProfile.personal_info.birth_place?.trim()) return false;
    if (!draftProfile.personal_info.contact_number?.trim()) return false;
    if (!draftProfile.present_address.country) return false;
    if (!draftProfile.emergency_contact.name?.trim()) return false;
    if (!draftProfile.emergency_contact.relationship?.trim()) return false;
    if (!draftProfile.emergency_contact.contact_number?.trim()) return false;
    if (!draftProfile.emergency_contact.address?.trim()) return false;
    return true;
  }, [draftProfile, fieldErrors]);

  // ────────────────────────────────────────────────────────────────────────────
  // Tab switching with unsaved-changes guard
  // ────────────────────────────────────────────────────────────────────────────

  function handleTabRequest(tabId: string) {
    if (tabId === activeTab) return;
    if (isEditing) { setPendingTab(tabId); setShowDiscard(true); }
    else setActiveTab(tabId);
  }

  function confirmDiscard() {
    setDiscardConfirming(true);
    setTimeout(() => {
      cancelEditing();
      if (pendingTab) setActiveTab(pendingTab);
      setPendingTab(null);
      setShowDiscard(false);
      setDiscardConfirming(false);
    }, 300);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Avatar
  // ────────────────────────────────────────────────────────────────────────────

  function handleAvatarIconClick() {
    avatarFileInputRef.current?.click();
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-selected later
    e.target.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["jpg", "jpeg", "png", "webp"].includes(ext)) {
      toast.error("Unsupported file type. Please use JPG, PNG, or WebP.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Image must not exceed 20 MB.");
      return;
    }
    setPendingCropFile(file);
    setAvatarCropOpen(true);
  }

  async function handleAvatarUpload(file: File): Promise<{ success: boolean }> {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    return { success: true };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Save
  // ────────────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!draftProfile) return;
    if (Object.values(fieldErrors).some(Boolean)) { toast.error("Fix all validation errors before saving."); return; }

    setSaving(true);
    // Each request gets its own unique idempotency key so the backend
    // never short-circuits a later call with a cached result from an earlier one.
    const H = () => ({ "X-CSRFToken": getCsrfToken(), "X-Idempotency-Key": crypto.randomUUID() });
    const J = () => ({ "X-CSRFToken": getCsrfToken(), "X-Idempotency-Key": crypto.randomUUID(), "Content-Type": "application/json" });

    try {
      // Avatar
      if (avatarFile) {
        const fd = new FormData();
        fd.append("avatar", avatarFile);
        const r = await fetch("/api/user-profile/avatar", { method: "PATCH", credentials: "include", headers: H(), body: fd });
        if (!r.ok) { const err = await r.json().catch(() => ({})); toast.error(err.avatar?.[0] ?? "Avatar upload failed."); setSaving(false); return; }
      }

      // Basic info (firstname, lastname, email on loginCredentials)
      {
        const r = await fetch("/api/user-profile/basic-info", {
          method: "PATCH", credentials: "include", headers: J(),
          body: JSON.stringify({ firstname: draftProfile.firstname, lastname: draftProfile.lastname, email: draftProfile.email }),
        });
        if (!r.ok) { const err = await r.json().catch(() => ({})); toast.error(err.firstname?.[0] ?? err.lastname?.[0] ?? err.email?.[0] ?? "Failed to save basic information."); setSaving(false); return; }
      }

      // Personal info
      {
        const r = await fetch("/api/user-profile/personal-info", { method: "PATCH", credentials: "include", headers: J(), body: JSON.stringify(draftProfile.personal_info) });
        if (!r.ok) { toast.error("Failed to save personal information."); setSaving(false); return; }
      }

      // Addresses
      for (const [url, body] of [
        ["/api/user-profile/present-address",    draftProfile.present_address],
        ["/api/user-profile/provincial-address", draftProfile.provincial_address],
      ] as [string, object][]) {
        const r = await fetch(url, { method: "PATCH", credentials: "include", headers: J(), body: JSON.stringify(body) });
        if (!r.ok) { toast.error("Failed to save address."); setSaving(false); return; }
      }

      // Emergency / Family
      for (const [url, body] of [
        ["/api/user-profile/emergency-contact", draftProfile.emergency_contact],
        ["/api/user-profile/family-background", draftProfile.family_background],
      ] as [string, object][]) {
        const r = await fetch(url, { method: "PATCH", credentials: "include", headers: J(), body: JSON.stringify(body) });
        if (!r.ok) { toast.error("Failed to save data."); setSaving(false); return; }
      }

      // Children + Education + Skills (bulk replace)
      for (const [url, body] of [
        ["/api/user-profile/children",  draftProfile.children.map((c) => ({ name: c.name }))],
        ["/api/user-profile/education", draftProfile.education_records.map((e) => ({ institution: e.institution, education_level: e.education_level, degree: e.degree, year_attended: e.year_attended ? parseInt(e.year_attended, 10) : null }))],
        ["/api/user-profile/skills",    draftSkills.map((s) => ({ name: s.name }))],
      ] as [string, object[]][]) {
        const r = await fetch(url, { method: "PUT", credentials: "include", headers: J(), body: JSON.stringify(body) });
        if (!r.ok) { toast.error("Failed to save records."); setSaving(false); return; }
      }

      // Work info
      if (draftProfile.work_info) {
        const r = await fetch("/api/user-profile/work-info", {
          method: "PATCH", credentials: "include", headers: J(),
          body: JSON.stringify({ department: draftProfile.work_info.department_id, line: draftProfile.work_info.line_id, approver: draftProfile.work_info.approver_id }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          toast.error(err.approver ?? err.detail ?? "Failed to save work information.");
          setSaving(false); return;
        }
      }

      // Refresh
      const refreshed = await fetchProfile();
      if (refreshed) {
        setSavedProfile(refreshed);
        setDraftProfile(deepClone(refreshed));
        setDraftSkills(deepClone(refreshed.skills));
      }
      setAvatarFile(null);
      if (avatarPreview) { URL.revokeObjectURL(avatarPreview); setAvatarPreview(null); }
      setIsEditing(false);
      toast.success("Profile saved successfully.");
    } catch { toast.error("An unexpected error occurred. Please try again."); }
    finally { setSaving(false); }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Password change
  // ────────────────────────────────────────────────────────────────────────────

  function allPolicyOk(pw: string) {
    if (!policy) return true;
    if (pw.length < policy.min_length) return false;
    if (policy.require_uppercase && !/[A-Z]/.test(pw)) return false;
    if (policy.require_lowercase && !/[a-z]/.test(pw)) return false;
    if (policy.require_number    && !/\d/.test(pw)) return false;
    if (policy.require_special_character && !/[!@#$%^&*()\-_=+\[\]{};:'",.<>?/\\|`~]/.test(pw)) return false;
    return true;
  }

  async function handlePasswordChange() {
    if (!pwCurrent || !pwNew || !pwConfirm) { toast.error("All password fields are required."); return; }
    if (!allPolicyOk(pwNew)) { toast.error("New password does not meet the policy requirements."); return; }
    if (pwNew !== pwConfirm) { toast.error("Passwords do not match."); return; }
    setPwSaving(true);
    try {
      const r = await fetch("/api/user-profile/change-password", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({ current_password: pwCurrent, new_password: pwNew, confirm_password: pwConfirm }),
      });
      if (r.ok) {
        toast.success("Password changed successfully.");
        setPwCurrent(""); setPwNew(""); setPwConfirm("");
      } else {
        const err = await r.json().catch(() => ({}));
        toast.error(err.current_password?.[0] ?? err.new_password?.[0] ?? err.confirm_password?.[0] ?? err.detail ?? "Password change failed.");
      }
    } catch { toast.error("An unexpected error occurred."); }
    finally { setPwSaving(false); }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Loading states
  // ────────────────────────────────────────────────────────────────────────────

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

  if (!draftProfile || !savedProfile) {
    return (
      <div className="flex flex-col lg:flex-row h-full overflow-hidden p-4 lg:p-5 gap-4">
        <div className="w-full lg:w-64 xl:w-72 shrink-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
          <LeftSkeleton />
        </div>
        <div className="flex-1 rounded-lg border border-[var(--color-border)] overflow-hidden"><RightSkeleton /></div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col lg:flex-row lg:h-full lg:overflow-hidden p-4 lg:p-5 gap-4">

      {/* ── Left Card ─────────────────────────────────────────────────────── */}
      <LeftCard
        profile={savedProfile}
        isEditing={isEditing}
        avatarPreview={avatarPreview}
        onAvatarClick={handleAvatarIconClick}
      />

      {/* Hidden file input — triggered by the camera button */}
      <input
        ref={avatarFileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Crop modal — opens after file is chosen */}
      <AvatarUploader
        open={avatarCropOpen}
        onOpenChange={setAvatarCropOpen}
        initialFile={pendingCropFile}
        onUpload={handleAvatarUpload}
      />

      {/* ── Right Content ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:h-full px-2 lg:overflow-hidden rounded-lg overflow-hidden">

        {/* Header: title + Edit/Save/Cancel + VercelTabs */}
        <div className="shrink-0 pt-2 pb-0 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
          <div className="flex items-center justify-between mb-2 min-h-[38px]">
            <h1 className="text-base font-bold text-[var(--color-text-secondary)]">User Profile Settings</h1>

            <div className="flex items-center gap-2">
              <AnimatePresence mode="wait">
                {activeTab !== "password" && !isEditing && (
                  <motion.div key="edit" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                    <Button variant="outline" size="sm" onClick={startEditing} className="gap-1.5">
                      <Pencil size={13} /> Edit
                    </Button>
                  </motion.div>
                )}
                {isEditing && (
                  <motion.div key="save-cancel" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={cancelEditing} disabled={saving} className="gap-1.5">
                      <X size={13} /> Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving || !canSave} className="gap-1.5 min-w-[96px]">
                      {saving
                        ? <TextShimmer className="text-sm text-white" duration={1.2}>Saving…</TextShimmer>
                        : "Save changes"}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <VercelTabs
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={handleTabRequest}
            className="pb-1"
          />
        </div>

        {/* Tab content — each tab scrolls independently */}
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

                  {/* ── Left column (70% on desktop, full-width on tablet/mobile) — scrolls independently ── */}
                  {/* On tablet/mobile this is the only column; right column items are appended below Skills */}
                  <div className="flex-[7] min-w-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden space-y-4 pb-6">

                    {/* Basic info */}
                    <AccordionSection title="Basic Information">
                      <div className="grid grid-cols-2 min-[480px]:grid-cols-3 gap-4">
                        <AnimatePresence mode="wait">
                          {isEditing ? (
                            <motion.div key="first" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                              <div className="flex flex-col gap-1.5">
                                <InputLabel label="First Name" required value={draftProfile.firstname} />
                                <Input maxLength={50} value={draftProfile.firstname ?? ""} onChange={(e) => setDraftProfile((p) => p ? { ...p, firstname: e.target.value } : p)} error={fieldErrors["firstname"]} />
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div key="first-view" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                              <ReadField label="First Name" value={draftProfile.firstname} />
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <AnimatePresence mode="wait">
                          {isEditing ? (
                            <motion.div key="last" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                              <div className="flex flex-col gap-1.5">
                                <InputLabel label="Last Name" required value={draftProfile.lastname} />
                                <Input maxLength={50} value={draftProfile.lastname ?? ""} onChange={(e) => setDraftProfile((p) => p ? { ...p, lastname: e.target.value } : p)} error={fieldErrors["lastname"]} />
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div key="last-view" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                              <ReadField label="Last Name" value={draftProfile.lastname} />
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Middle name */}
                        <AnimatePresence mode="wait">
                          {isEditing ? (
                            <motion.div key="e" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">Middle Name</label>
                                <Input maxLength={50} value={draftProfile.personal_info.middle_name} onChange={(e) => handleFieldChange("personal_info", "middle_name", e.target.value)} error={fieldErrors["personal_info.middle_name"]} placeholder="Optional" />
                              </div>
                            </motion.div>
                          ) : <motion.div key="v" initial={{ opacity: 1 }} exit={{ opacity: 0 }}><ReadField label="Middle Name" value={draftProfile.personal_info.middle_name} /></motion.div>}
                        </AnimatePresence>

                        {/* Nickname */}
                        <AnimatePresence mode="wait">
                          {isEditing ? (
                            <motion.div key="e" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">Nickname</label>
                                <Input maxLength={50} value={draftProfile.personal_info.nickname} onChange={(e) => handleFieldChange("personal_info", "nickname", e.target.value)} error={fieldErrors["personal_info.nickname"]} placeholder="Optional" />
                              </div>
                            </motion.div>
                          ) : <motion.div key="v" initial={{ opacity: 1 }} exit={{ opacity: 0 }}><ReadField label="Nickname" value={draftProfile.personal_info.nickname} /></motion.div>}
                        </AnimatePresence>

                        {/* Gender */}
                        <AnimatePresence mode="wait">
                          {isEditing ? (
                            <motion.div key="e" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                              <div className="flex flex-col gap-1.5">
                                <InputLabel label="Gender" required value={draftProfile.personal_info.gender} />
                                <Select value={draftProfile.personal_info.gender} onValueChange={(v) => updateDraft("personal_info", { gender: v })}>
                                  <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="male">Male</SelectItem>
                                    <SelectItem value="female">Female</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div key="v" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                              <ReadField label="Gender" value={draftProfile.personal_info.gender === "male" ? "Male" : draftProfile.personal_info.gender === "female" ? "Female" : draftProfile.personal_info.gender} />
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Birth Date */}
                        <AnimatePresence mode="wait">
                          {isEditing ? (
                            <motion.div key="e" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                              <div className="flex flex-col gap-1.5">
                                <InputLabel label="Birth Date" required value={draftProfile.personal_info.birth_date} />
                                <DateTimePicker
                                  value={draftProfile.personal_info.birth_date ? new Date(draftProfile.personal_info.birth_date) : undefined}
                                  onChange={(date) => updateDraft("personal_info", { birth_date: date.toISOString().split("T")[0] })}
                                  placeholder="Select birth date"
                                  displayFormat="MMMM d, yyyy"
                                  minDate={new Date(1900, 0, 1)}
                                  maxDate={new Date()}
                                />
                              </div>
                            </motion.div>
                          ) : <motion.div key="v" initial={{ opacity: 1 }} exit={{ opacity: 0 }}><ReadField label="Birth Date" value={formatDisplayDate(draftProfile.personal_info.birth_date)} /></motion.div>}
                        </AnimatePresence>

                        {/* Birth Place */}
                        <AnimatePresence mode="wait">
                          {isEditing ? (
                            <motion.div key="e" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                              <div className="flex flex-col gap-1.5">
                                <InputLabel label="Birth Place" required value={draftProfile.personal_info.birth_place} />
                                <Input maxLength={150} value={draftProfile.personal_info.birth_place} onChange={(e) => handleFieldChange("personal_info", "birth_place", e.target.value)} error={fieldErrors["personal_info.birth_place"]} placeholder="Enter birth place" />
                              </div>
                            </motion.div>
                          ) : <motion.div key="v" initial={{ opacity: 1 }} exit={{ opacity: 0 }}><ReadField label="Birth Place" value={draftProfile.personal_info.birth_place} /></motion.div>}
                        </AnimatePresence>

                        {/* Contact Number */}
                        <AnimatePresence mode="wait">
                          {isEditing ? (
                            <motion.div key="e" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                              <div className="flex flex-col gap-1.5">
                                <InputLabel label="Contact Number" required value={draftProfile.personal_info.contact_number} />
                                <Input maxLength={15} value={draftProfile.personal_info.contact_number} onChange={(e) => handleFieldChange("personal_info", "contact_number", e.target.value)} error={fieldErrors["personal_info.contact_number"]} placeholder="e.g. 09171234567" />
                              </div>
                            </motion.div>
                          ) : <motion.div key="v" initial={{ opacity: 1 }} exit={{ opacity: 0 }}><ReadField label="Contact Number" value={draftProfile.personal_info.contact_number} /></motion.div>}
                        </AnimatePresence>
                      </div>
                    </AccordionSection>

                    {/* Combined Address Card */}
                    <AccordionSection title="Address Information">
                      {/* Present Address sub-section */}
                      <div>
                        <h3 className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)] mb-3 tracking-wide">Present Address</h3>
                        <AddressFields
                          address={draftProfile.present_address}
                          isEditing={isEditing}
                          onChange={(p) => updateDraft("present_address", p)}
                          psgcData={psgcData}
                          onCountryChange={(v) => updateDraft("present_address", { country: v, province: "", city: "", barangay: "", street: "", block_lot: "" })}
                          onProvinceChange={(v) => updateDraft("present_address", { province: v, city: "", barangay: "" })}
                          onCityChange={(v) => updateDraft("present_address", { city: v, barangay: "" })}
                          fieldErrors={fieldErrors}
                          prefix="present_address"
                        />
                      </div>

                      {/* Divider */}
                      <div className="border-t border-[var(--color-border)] my-4" />

                      {/* Provincial Address sub-section */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)] tracking-wide">Provincial Address</h3>
                          {isEditing && (
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[10px] text-[var(--color-text-muted)]">Same as present</span>
                              <ElasticSwitch
                                size="sm"
                                className="!p-0"
                                value={draftProfile.provincial_address.same_as_present}
                                onChange={(v) => updateDraft("provincial_address", { same_as_present: v })}
                              />
                            </div>
                          )}
                        </div>
                        {draftProfile.provincial_address.same_as_present ? (
                          <div className="grid grid-cols-2 min-[480px]:grid-cols-3 gap-4">
                            {(["country","province","city","barangay","street","block_lot"] as const).map((k) => (
                              <ReadField key={k} label={k === "block_lot" ? "Block / Lot" : k.charAt(0).toUpperCase() + k.slice(1)} value={draftProfile.present_address[k]} />
                            ))}
                          </div>
                        ) : (
                          <AddressFields
                            address={draftProfile.provincial_address}
                            isEditing={isEditing}
                            onChange={(p) => updateDraft("provincial_address", p)}
                            psgcData={psgcData}
                            onCountryChange={(v) => updateDraft("provincial_address", { country: v, province: "", city: "", barangay: "", street: "", block_lot: "" })}
                            onProvinceChange={(v) => updateDraft("provincial_address", { province: v, city: "", barangay: "" })}
                            onCityChange={(v) => updateDraft("provincial_address", { city: v, barangay: "" })}
                            fieldErrors={fieldErrors}
                            prefix="provincial_address"
                          />
                        )}
                      </div>
                    </AccordionSection>

                    {/* Emergency Contact */}
                    <AccordionSection title="Emergency Contact">
                      <div className="grid grid-cols-2 min-[480px]:grid-cols-3 gap-4">
                        {(["name","relationship","contact_number","address"] as const).map((key) => (
                          <AnimatePresence key={key} mode="wait">
                            {isEditing ? (
                              <motion.div key="e" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                                <div className="flex flex-col gap-1.5">
                                  <InputLabel
                                  label={key === "contact_number" ? "Contact Number" : key === "name" ? "Name" : key === "relationship" ? "Relationship" : "Address"}
                                  required
                                  value={draftProfile.emergency_contact[key]}
                                />
                                  <Input
                                    maxLength={key === "address" ? 300 : key === "contact_number" ? 15 : 100}
                                    value={draftProfile.emergency_contact[key]}
                                    onChange={(e) => handleFieldChange("emergency_contact", key, e.target.value)}
                                    error={fieldErrors[`emergency_contact.${key}`]}
                                    placeholder={key === "contact_number" ? "e.g. 09171234567" : key === "name" ? "Full name" : key === "relationship" ? "e.g. Spouse, Parent" : "Emergency contact address"}
                                  />
                                </div>
                              </motion.div>
                            ) : (
                              <motion.div key="v" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <ReadField label={key === "contact_number" ? "Contact Number" : key === "name" ? "Name" : key === "relationship" ? "Relationship" : "Address"} value={draftProfile.emergency_contact[key]} />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        ))}
                      </div>
                    </AccordionSection>

                    {/* Skills */}
                    <AccordionSection title="Skills">
                      <SkillsPanel
                        draftSkills={draftSkills}
                        isEditing={isEditing}
                        onRemoveSkill={(i) => setDraftSkills((prev) => prev.filter((_, idx) => idx !== i))}
                        onAddSkill={(name) => {
                          if (draftSkills.some((s) => s.name.toLowerCase() === name.toLowerCase())) return;
                          setDraftSkills((prev) => [...prev, { name }]);
                        }}
                      />
                    </AccordionSection>

                    {/* ── Email Addresses card — tablet/mobile only (desktop sees it in right column) ── */}
                    <div className="lg:hidden">
                      <AccordionSection title="Email Addresses">
                        <AnimatePresence mode="wait">
                          {isEditing ? (
                            <motion.div key="email-edit-m" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                              <div className="flex flex-col gap-1.5">
                                <InputLabel label="Account Email" required value={draftProfile.email} />
                                <Input type="email" maxLength={254} value={draftProfile.email ?? ""} onChange={(e) => setDraftProfile((p) => p ? { ...p, email: e.target.value } : p)} error={fieldErrors["email"]} />
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div key="email-view-m" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                              <ReadField label="Account Email" value={draftProfile.email} />
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <AnimatePresence mode="wait">
                          {isEditing ? (
                            <motion.div key="work-email-edit-m" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">Work Email</label>
                                <Input type="email" maxLength={254} value={draftProfile.personal_info.work_email} onChange={(e) => handleFieldChange("personal_info", "work_email", e.target.value)} error={fieldErrors["personal_info.work_email"]} placeholder="work@email.com" />
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div key="work-email-view-m" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                              <ReadField label="Work Email" value={draftProfile.personal_info.work_email} />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </AccordionSection>
                    </div>

                    {/* ── Department & Role card — tablet/mobile only ── */}
                    <div className="lg:hidden">
                      <AccordionSection title="Department & Role">
                        {/* Department */}
                        <AnimatePresence mode="wait">
                          {isEditing ? (
                            <motion.div key="dept-e-m" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">Department</label>
                                {(() => {
                                  const currentOffice = draftProfile.work_info?.office_name ?? savedProfile?.work_info?.office_name ?? "";
                                  const officeDepartments = currentOffice ? depts.filter((d) => d.office_name === currentOffice) : [];
                                  return (
                                    <Select value={draftProfile.work_info?.department_id?.toString() ?? ""} onValueChange={(v) => {
                                      const id = parseInt(v, 10);
                                      const d = depts.find((x) => x.id === id);
                                      updateDraft("work_info", { department_id: id, department_name: d?.name ?? null, line_id: null, line_name: null, approver_id: null, approver_name: null } as WorkInfo);
                                      fetchLines(id); fetchApprovers(id);
                                    }}>
                                      <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                                      <SelectContent>{(() => { const currentOffice2 = draftProfile.work_info?.office_name ?? savedProfile?.work_info?.office_name ?? ""; return currentOffice2 ? depts.filter((d) => d.office_name === currentOffice2) : []; })().map((d) => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                  );
                                })()}
                              </div>
                            </motion.div>
                          ) : <motion.div key="dept-v-m" initial={{ opacity: 1 }} exit={{ opacity: 0 }}><ReadField label="Department" value={draftProfile.work_info?.department_name} /></motion.div>}
                        </AnimatePresence>
                        {/* Line */}
                        <AnimatePresence mode="wait">
                          {isEditing ? (
                            <motion.div key="line-e-m" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">Line</label>
                                <Select value={draftProfile.work_info?.line_id?.toString() ?? "none"} onValueChange={(v) => { const id = v === "none" ? null : parseInt(v, 10); const l = lines.find((x) => x.id === id); updateDraft("work_info", { line_id: id, line_name: l?.name ?? null } as WorkInfo); }} disabled={!draftProfile.work_info?.department_id}>
                                  <SelectTrigger><SelectValue placeholder="Select line (optional)" /></SelectTrigger>
                                  <SelectContent><SelectItem value="none">— None —</SelectItem>{lines.map((l) => <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>)}</SelectContent>
                                </Select>
                              </div>
                            </motion.div>
                          ) : <motion.div key="line-v-m" initial={{ opacity: 1 }} exit={{ opacity: 0 }}><ReadField label="Line" value={draftProfile.work_info?.line_name} /></motion.div>}
                        </AnimatePresence>
                        {/* Approver */}
                        <AnimatePresence mode="wait">
                          {isEditing ? (
                            <motion.div key="approver-e-m" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">Approver</label>
                                <Select value={draftProfile.work_info?.approver_id?.toString() ?? "none"} onValueChange={(v) => { const id = v === "none" ? null : parseInt(v, 10); const a = approvers.find((x) => x.id === id); updateDraft("work_info", { approver_id: id, approver_name: a?.name ?? null } as WorkInfo); }} disabled={!draftProfile.work_info?.department_id}>
                                  <SelectTrigger><SelectValue placeholder="Select approver" /></SelectTrigger>
                                  <SelectContent><SelectItem value="none">— None —</SelectItem>{approvers.map((a) => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}</SelectContent>
                                </Select>
                              </div>
                            </motion.div>
                          ) : <motion.div key="approver-v-m" initial={{ opacity: 1 }} exit={{ opacity: 0 }}><ReadField label="Approver" value={draftProfile.work_info?.approver_name} /></motion.div>}
                        </AnimatePresence>
                      </AccordionSection>
                    </div>
                  </div>

                  {/* ── Right column (30% on desktop, hidden on tablet/mobile — items moved below Skills) ── */}
                  <div className="hidden lg:flex lg:flex-col flex-[3] min-w-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden space-y-4 pb-6">

                    {/* Profile Completion card — desktop only */}
                    <ProfileCompletionCard profile={savedProfile} />

                    {/* Email card */}
                    <AccordionSection title="Email Addresses">
                      <AnimatePresence mode="wait">
                        {isEditing ? (
                          <motion.div key="email-edit" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                            <div className="flex flex-col gap-1.5">
                              <InputLabel label="Account Email" required value={draftProfile.email} />
                              <Input type="email" maxLength={254} value={draftProfile.email ?? ""} onChange={(e) => setDraftProfile((p) => p ? { ...p, email: e.target.value } : p)} error={fieldErrors["email"]} />
                            </div>
                          </motion.div>
                        ) : (
                          <motion.div key="email-view" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <ReadField label="Account Email" value={draftProfile.email} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <AnimatePresence mode="wait">
                        {isEditing ? (
                          <motion.div key="work-email-edit" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">Work Email</label>
                              <Input type="email" maxLength={254} value={draftProfile.personal_info.work_email} onChange={(e) => handleFieldChange("personal_info", "work_email", e.target.value)} error={fieldErrors["personal_info.work_email"]} placeholder="work@email.com" />
                            </div>
                          </motion.div>
                        ) : (
                          <motion.div key="work-email-view" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <ReadField label="Work Email" value={draftProfile.personal_info.work_email} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </AccordionSection>

                    {/* Department & Role card */}
                    <AccordionSection title="Department & Role">

                      {/* Department */}
                      <AnimatePresence mode="wait">
                        {isEditing ? (
                          <motion.div key="e" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">Department</label>
                              {(() => {
                                const currentOffice = draftProfile.work_info?.office_name ?? savedProfile?.work_info?.office_name ?? "";
                                const officeDepartments = currentOffice ? depts.filter((d) => d.office_name === currentOffice) : [];
                                return (
                                  <Select value={draftProfile.work_info?.department_id?.toString() ?? ""} onValueChange={(v) => {
                                    const id = parseInt(v, 10);
                                    const d = depts.find((x) => x.id === id);
                                    updateDraft("work_info", { department_id: id, department_name: d?.name ?? null, line_id: null, line_name: null, approver_id: null, approver_name: null } as WorkInfo);
                                    fetchLines(id); fetchApprovers(id);
                                  }}>
                                    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                                    <SelectContent>
                                      {officeDepartments.map((d) => (
                                        <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                );
                              })()}
                            </div>
                          </motion.div>
                        ) : <motion.div key="v" initial={{ opacity: 1 }} exit={{ opacity: 0 }}><ReadField label="Department" value={draftProfile.work_info?.department_name} /></motion.div>}
                      </AnimatePresence>

                      {/* Line */}
                      <AnimatePresence mode="wait">
                        {isEditing ? (
                          <motion.div key="e" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">Line</label>
                              <Select value={draftProfile.work_info?.line_id?.toString() ?? "none"} onValueChange={(v) => { const id = v === "none" ? null : parseInt(v, 10); const l = lines.find((x) => x.id === id); updateDraft("work_info", { line_id: id, line_name: l?.name ?? null } as WorkInfo); }} disabled={!draftProfile.work_info?.department_id}>
                                <SelectTrigger><SelectValue placeholder="Select line (optional)" /></SelectTrigger>
                                <SelectContent><SelectItem value="none">— None —</SelectItem>{lines.map((l) => <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                          </motion.div>
                        ) : <motion.div key="v" initial={{ opacity: 1 }} exit={{ opacity: 0 }}><ReadField label="Line" value={draftProfile.work_info?.line_name} /></motion.div>}
                      </AnimatePresence>

                      {/* Approver */}
                      <AnimatePresence mode="wait">
                        {isEditing ? (
                          <motion.div key="e" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">Approver</label>
                              <Select value={draftProfile.work_info?.approver_id?.toString() ?? "none"} onValueChange={(v) => { const id = v === "none" ? null : parseInt(v, 10); const a = approvers.find((x) => x.id === id); updateDraft("work_info", { approver_id: id, approver_name: a?.name ?? null } as WorkInfo); }} disabled={!draftProfile.work_info?.department_id}>
                                <SelectTrigger><SelectValue placeholder="Select approver" /></SelectTrigger>
                                <SelectContent><SelectItem value="none">— None —</SelectItem>{approvers.map((a) => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                          </motion.div>
                        ) : <motion.div key="v" initial={{ opacity: 1 }} exit={{ opacity: 0 }}><ReadField label="Approver" value={draftProfile.work_info?.approver_name} /></motion.div>}
                      </AnimatePresence>
                    </AccordionSection>
                  </div>
                </div>
              )}

              {/* ══════════════════════════════════════════════════════════════
                  TAB 2 — Background & Education
              ══════════════════════════════════════════════════════════════ */}
              {activeTab === "background" && (
                <div className="h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-6">
                  <div className="flex-[7] min-w-0 w-full max-w-5xl space-y-5">
                    {/* Family background */}
                    <AccordionSection title="Family Background">
                    <div className="grid grid-cols-2 min-[480px]:grid-cols-3 gap-4">
                      {(["mother_name","father_name","spouse_name"] as const).map((key) => (
                        <AnimatePresence key={key} mode="wait">
                          {isEditing ? (
                            <motion.div key="e" variants={FIELD_VARIANTS} initial="hidden" animate="visible">
                              <Input label={key === "mother_name" ? "Mother's Name" : key === "father_name" ? "Father's Name" : "Spouse Name"} maxLength={100} value={draftProfile.family_background[key]} onChange={(e) => handleFieldChange("family_background", key, e.target.value)} error={fieldErrors[`family_background.${key}`]} placeholder="Optional" />
                            </motion.div>
                          ) : (
                            <motion.div key="v" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                              <ReadField label={key === "mother_name" ? "Mother's Name" : key === "father_name" ? "Father's Name" : "Spouse Name"} value={draftProfile.family_background[key]} />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      ))}
                    </div>

                    {/* Children */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">Children</span>
                      <AnimatePresence>
                        {draftProfile.children.length === 0 && !isEditing && <p className="text-sm italic text-[var(--color-text-muted)]">— No children on record</p>}
                        {draftProfile.children.map((child, idx) => (
                          <motion.div
                            key={child.id ?? `n-${idx}`}
                            layout
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            transition={{ duration: 0.24, ease: "easeOut" }}
                            className="flex items-center gap-1"
                          >
                            {isEditing ? (
                              <>
                                <Input placeholder={`Child ${idx + 1} name`} maxLength={100} value={child.name} onChange={(e) => { const upd = [...draftProfile.children]; upd[idx] = { ...upd[idx], name: e.target.value }; setDraftProfile((p) => p ? { ...p, children: upd } : p); }} wrapperClassName="flex-1" />
                                <button onClick={() => setDraftProfile((p) => p ? { ...p, children: p.children.filter((_, i) => i !== idx) } : p)} className="text-red-400 hover:text-red-600 transition-colors p-1"><Trash2 size={14} /></button>
                              </>
                            ) : (
                              <p className="text-sm text-[var(--color-text-primary)]">
                                {idx + 1}. {child.name || <span className="italic text-[var(--color-text-muted)]">—</span>}
                              </p>
                            )}
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      {isEditing && (
                        <div className="flex justify-end pt-3">
                          <button
                            type="button"
                            onClick={() => setDraftProfile((p) => p ? { ...p, children: [...p.children, { name: "" }] } : p)}
                            className="inline-flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors text-xs"
                          >
                            <Plus size={12} /> Add Child
                          </button>
                        </div>
                      )}
                    </div>
                  </AccordionSection>

                  {/* Education */}
                  <AccordionSection title="Educational Background">
                    {!isEditing ? (
                      /* ── READ MODE: vertical timeline sorted by level ── */
                      draftProfile.education_records.length === 0 ? (
                        <EmptyState
                          title="No education records"
                          description="Add your educational background to see it displayed here."
                          icons={[GraduationCap, BookOpen, Award]}
                          className="py-6 border-0"
                        />
                      ) : (
                        <Timeline
                          variant="default"
                          showTimestamps={false}
                          items={sortByEducationLevel(draftProfile.education_records).map((rec, idx) => ({
                            id: rec.id?.toString() ?? `edu-${idx}`,
                            title: (
                              <div className="space-y-1.5">                                <div className="text-[11px] text-[var(--color-text-muted)]">
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
                      )
                    ) : (
                      /* ── EDIT MODE: cards with form inputs ── */
                      <>
                        <div className="divide-y divide-[var(--color-border)]">
                          <AnimatePresence>
                            {draftProfile.education_records.map((rec, idx) => (
                              <motion.div
                                key={rec.id ?? `n-${idx}`}
                                layout
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -15 }}
                                transition={{ duration: 0.24, ease: "easeOut" }}
                                className="bg-transparent py-4"
                              >
                                <div className="flex flex-col gap-3">
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3">
                                    <div className="grid grid-cols-2 min-[480px]:grid-cols-4 gap-3 flex-1">
                                      <div className="flex flex-col gap-1.5">
                                        <InputLabel label="Level" required value={rec.education_level} />
                                        <Select value={rec.education_level} onValueChange={(v) => { const u = [...draftProfile.education_records]; u[idx] = { ...u[idx], education_level: v }; setDraftProfile((p) => p ? { ...p, education_records: u } : p); }}>
                                          <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="primary">Primary</SelectItem>
                                            <SelectItem value="secondary">Secondary</SelectItem>
                                            <SelectItem value="vocational">Vocational</SelectItem>
                                            <SelectItem value="tertiary">Tertiary</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <Input label="Institution *" maxLength={200} value={rec.institution} onChange={(e) => { const u = [...draftProfile.education_records]; u[idx] = { ...u[idx], institution: e.target.value }; setDraftProfile((p) => p ? { ...p, education_records: u } : p); }} placeholder="School / University" />
                                      <Input label="Degree / Qualification" maxLength={200} value={rec.degree} onChange={(e) => { const u = [...draftProfile.education_records]; u[idx] = { ...u[idx], degree: e.target.value }; setDraftProfile((p) => p ? { ...p, education_records: u } : p); }} placeholder="e.g. BS Computer Science" />
                                      <Input label="Year Attended" type="number" value={rec.year_attended} onChange={(e) => { const u = [...draftProfile.education_records]; u[idx] = { ...u[idx], year_attended: e.target.value }; setDraftProfile((p) => p ? { ...p, education_records: u } : p); }} placeholder="e.g. 2020" />
                                    </div>
                                    <div className="flex items-start justify-end">
                                      <button onClick={() => setDraftProfile((p) => p ? { ...p, education_records: p.education_records.filter((_, i) => i !== idx) } : p)} className="text-red-400 hover:text-red-600 transition-colors p-1">
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                        <div className="flex justify-end pt-4">
                          <button
                            type="button"
                            onClick={() => setDraftProfile((p) => p ? { ...p, education_records: [...p.education_records, { institution: "", education_level: "", degree: "", year_attended: "" }] } : p)}
                            className="inline-flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors text-xs"
                          >
                            <Plus size={12} /> Add Education
                          </button>
                        </div>
                      </>
                    )}
                  </AccordionSection>
                </div>
                </div>
              )}

              {/* ══════════════════════════════════════════════════════════════
                  TAB 4 — Change Password (always-input, centred)
              ══════════════════════════════════════════════════════════════ */}
              {activeTab === "password" && (
                <div className="h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-6 flex justify-center">
                <div className="w-full">
                  <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 shadow-sm space-y-5">
                    <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Change Password</h2>

                    {/* Current */}
                    <Input
                      label="Current Password"
                      type={pwShowCurr ? "text" : "password"}
                      value={pwCurrent}
                      onChange={(e) => setPwCurrent(e.target.value)}
                      placeholder="Enter current password"
                      trailingIcon={
                        <button
                          type="button"
                          onClick={() => setPwShowCurr((v) => !v)}
                          className="h-7 w-4 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                          aria-label="Toggle current password visibility"
                        >
                          {pwShowCurr ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      }
                    />

                    {/* New */}
                    <Input
                      label="New Password"
                      type={pwShowNew ? "text" : "password"}
                      value={pwNew}
                      onChange={(e) => setPwNew(e.target.value)}
                      placeholder="Enter new password"
                      trailingIcon={
                        <button
                          type="button"
                          onClick={() => setPwShowNew((v) => !v)}
                          className="h-7 w-4 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                          aria-label="Toggle new password visibility"
                        >
                          {pwShowNew ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      }
                    />

                    {/* Policy checklist */}
                    {policy && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 space-y-1.5">
                        <PolicyRule ok={pwNew.length >= policy.min_length}       label={`At least ${policy.min_length} characters`} />
                        {policy.require_uppercase  && <PolicyRule ok={/[A-Z]/.test(pwNew)}                          label="At least one uppercase letter (A–Z)" />}
                        {policy.require_lowercase  && <PolicyRule ok={/[a-z]/.test(pwNew)}                          label="At least one lowercase letter (a–z)" />}
                        {policy.require_number     && <PolicyRule ok={/\d/.test(pwNew)}                             label="At least one digit (0–9)" />}
                        {policy.require_special_character && <PolicyRule ok={/[!@#$%^&*()\-_=+\[\]{};:'",.<>?/\\|`~]/.test(pwNew)} label="At least one special character" />}
                      </motion.div>
                    )}

                    {/* Confirm */}
                    <Input
                      label="Confirm Password"
                      type={pwShowConf ? "text" : "password"}
                      value={pwConfirm}
                      onChange={(e) => setPwConfirm(e.target.value)}
                      placeholder="Repeat new password"
                      error={pwConfirm.length > 0 && pwNew !== pwConfirm ? "Passwords do not match" : undefined}
                      success={pwConfirm.length > 0 && pwNew === pwConfirm ? "Passwords match" : undefined}
                      trailingIcon={
                        <button
                          type="button"
                          onClick={() => setPwShowConf((v) => !v)}
                          className="h-7 w-4 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                          aria-label="Toggle confirm password visibility"
                        >
                          {pwShowConf ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      }
                    />

                    <Button onClick={handlePasswordChange} disabled={pwSaving || !pwCurrent || !pwNew || !pwConfirm || pwNew !== pwConfirm || (policy ? !allPolicyOk(pwNew) : false)} className="w-full">
                      {pwSaving ? <TextShimmer className="text-sm text-white" duration={1.2}>Updating…</TextShimmer> : "Update Password"}
                    </Button>
                  </div>
                </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Discard modal ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showDiscard && (
          <ConfirmationModal
            title="Unsaved changes"
            message="You have unsaved changes. Discard them and switch tabs?"
            confirmLabel="Discard"
            cancelLabel="Keep editing"
            confirmVariant="danger"
            confirming={discardConfirming}
            onConfirm={confirmDiscard}
            onCancel={() => { setShowDiscard(false); setPendingTab(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

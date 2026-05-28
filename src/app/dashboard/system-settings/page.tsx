"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, Eye, EyeOff, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TextareaWithCharactersLeft } from "@/components/ui/textarea-with-characters-left";
import BasicCheckbox from "@/components/ui/checkbox-1";
import { ChoiceboxGroup } from "@/components/ui/choicebox-1";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { TextShimmer } from "@/components/ui/text-shimmer";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { getCsrfToken } from "@/lib/csrf";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";

type AuthPhase = "spinner" | "checking" | "done";
type TopTab = "general" | "security" | "approval" | "memo-advertisement";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
type JsonObject = Record<string, JsonValue>;

type UserData = { id: number; admin: boolean; hr: boolean; accounting: boolean };
type ShiftData = { id: number; name: string; start_time: string; end_time: string };
type OfficeData = { id: number; name: string };
type DepartmentData = { id: number; name: string; office: number; office_name?: string };
type LineData = { id: number; name: string; department: number; department_name?: string };
type PositionData = { id: number; name: string; level_of_approval: number };
type EmploymentTypeData = { id: number; name: string };
type WeekdayDurationMap = Record<string, number | string>;
type WorkdayScheduleData = { workdays: number[]; hours_per_day: number | string; weekday_durations?: WeekdayDurationMap; half_day_hours?: number | string };

type MemoAdvertisementSettingsData = { enabled: boolean };
type MemoAdvertisementData = {
  id: number;
  title: string;
  description: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type FeedbackSettingsData = { feedback_enabled: boolean; updates_enabled: boolean };
type SystemUpdateData = {
  id: number;
  version: string;
  description: string;
  created_at: string;
  updated_at: string;
};

type LeaveTypeData = {
  id: number;
  name: string;
  has_balance: boolean;
  deductible: boolean;
  requires_clinic_approval: boolean;
  is_active: boolean;
};
type LeaveReasonData = { id: number; title: string; leave_types: number[] };
type LeaveSubreasonData = { id: number; reason: number; title: string };
type LeaveRoutingRuleData = {
  id: number;
  description: string;
  is_active: boolean;
  positions: string[];
  departments: string[];
  steps: { step_order: number; position_ids: number[] }[];
};
type LeaveRoutingStepDraft = {
  id: string;
  position_ids: number[];
};
type LeaveRoutingRuleDraft = {
  description: string;
  position_ids: number[];
  department_ids: number[];
  steps: LeaveRoutingStepDraft[];
};
type EvaluationRoutingRuleData = {
  id: number;
  description: string;
  is_active: boolean;
  positions: string[];
  departments: string[];
  steps: { position_ids: number[] }[];
};
type EvaluationSettingsData = { id: number; frequency: "monthly" | "quarterly" };
type PasswordPolicyData = {
  min_length: number;
  password_expiry_days: number;
  default_password_prefix: string;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_number: boolean;
  require_special_character: boolean;
  require_change_on_first_login: boolean;
  enable_account_lockout: boolean;
  max_failed_login_attempts: number;
};

type EmailConfigData = {
  smtp_host: string;
  smtp_port: number;
  use_ssl: boolean;
  use_tls: boolean;
  username: string;
  password: string;
  from_name: string;
  from_address: string;
};

type AdminAccountData = {
  id: number;
  idnumber: string;
  firstname: string | null;
  lastname: string | null;
  active: boolean;
  locked: boolean;
  failed_login_attempts: number;
  admin: boolean;
  hr: boolean;
  accounting: boolean;
  mis: boolean;
  iad: boolean;
  clinic: boolean;
  hr_manager: boolean;
};

type AdminRoleKey = "admin" | "clinic" | "iad" | "accounting" | "hr" | "hr_manager" | "mis";

type SectionDef = {
  id: string;
  title: string;
  tab: TopTab;
  editable: (u: UserData) => boolean;
};

const SECTIONS: SectionDef[] = [
  { id: "general-group", title: "", tab: "general", editable: (u) => u.admin || u.hr },
  { id: "leave-reasons", title: "Leave Reasons", tab: "general", editable: (u) => u.admin || u.hr },
  { id: "evaluation-frequency", title: "Evaluation Frequency", tab: "general", editable: (u) => u.admin || u.hr },
  { id: "leave-routing", title: "Leave Routing", tab: "approval", editable: (u) => u.admin || u.hr },
  { id: "training-evaluation-routing", title: "Training Evaluation Routing", tab: "approval", editable: (u) => u.admin || u.hr },
  { id: "evaluation-routing", title: "Employee Evaluation Routing", tab: "approval", editable: (u) => u.admin || u.hr },
];

type WorkdayPresetValue = "mon-fri" | "mon-sat" | "mon-sun" | "custom";

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Monday" },
  { value: 1, label: "Tuesday" },
  { value: 2, label: "Wednesday" },
  { value: 3, label: "Thursday" },
  { value: 4, label: "Friday" },
  { value: 5, label: "Saturday" },
  { value: 6, label: "Sunday" },
] as const;

const WORKDAY_PRESET_OPTIONS: { value: WorkdayPresetValue; title: string; description: string; workdays: number[] }[] = [
  { value: "mon-fri", title: "Monday to Friday", description: "Standard five-day workweek", workdays: [0, 1, 2, 3, 4] },
  { value: "mon-sat", title: "Monday to Saturday", description: "Six-day workweek including Saturday", workdays: [0, 1, 2, 3, 4, 5] },
  { value: "mon-sun", title: "Monday to Sunday", description: "Seven-day workweek including Sunday", workdays: [0, 1, 2, 3, 4, 5, 6] },
  { value: "custom", title: "Custom", description: "Choose each weekday and assign its duration", workdays: [] },
];

const ACTION_ICON_BUTTON_CLASS = "inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[#2845D6]/10 hover:text-[#2845D6]";
const DANGER_ICON_BUTTON_CLASS = "inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500";
const GENERAL_LIST_ROW_CLASS = "flex items-center gap-3 border-b border-[var(--color-border)] px-3 py-2.5 text-xs last:border-b-0";
const GENERAL_LIST_SCROLL_CLASS = "max-h-[22.5rem] overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#2845D6]/45 [&::-webkit-scrollbar-track]:bg-transparent";

const ADMIN_ROLE_OPTIONS: { key: AdminRoleKey; label: string; pillClassName: string }[] = [
  { key: "admin", label: "Admin", pillClassName: "bg-[#2845D6]/12 text-[#2845D6]" },
  { key: "clinic", label: "Clinic", pillClassName: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  { key: "iad", label: "IAD", pillClassName: "bg-orange-500/12 text-orange-600 dark:text-orange-400" },
  { key: "accounting", label: "Accounting", pillClassName: "bg-amber-500/12 text-amber-700 dark:text-amber-400" },
  { key: "hr", label: "HR", pillClassName: "bg-pink-500/12 text-pink-600 dark:text-pink-400" },
  { key: "hr_manager", label: "HR Manager", pillClassName: "bg-purple-500/12 text-purple-600 dark:text-purple-400" },
  { key: "mis", label: "MIS", pillClassName: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-400" },
];

function getDefaultEmailConfig(): EmailConfigData {
  return {
    smtp_host: "",
    smtp_port: 587,
    use_ssl: false,
    use_tls: true,
    username: "",
    password: "",
    from_name: "",
    from_address: "",
  };
}

function normalizeEmailConfig(config: EmailConfigData | null): EmailConfigData {
  const base = getDefaultEmailConfig();
  if (!config) return base;
  return {
    ...base,
    ...config,
    smtp_port: Number(config.smtp_port) || 587,
  };
}

function newLeaveRoutingStepId() {
  return `step-${Math.random().toString(36).slice(2, 10)}`;
}

function createLeaveRoutingRuleDraft(): LeaveRoutingRuleDraft {
  return {
    description: "",
    position_ids: [],
    department_ids: [],
    steps: [{ id: newLeaveRoutingStepId(), position_ids: [] }],
  };
}

function buildLeaveRoutingRuleDraft(rule: LeaveRoutingRuleData | EvaluationRoutingRuleData, positions: PositionData[], departments: DepartmentData[]): LeaveRoutingRuleDraft {
  const positionMap = new Map(positions.map((position) => [position.name, position.id]));
  const departmentMap = new Map(departments.map((department) => [department.name, department.id]));
  const steps = rule.steps && rule.steps.length > 0
    ? rule.steps.map((s) => ({ id: newLeaveRoutingStepId(), position_ids: s.position_ids }))
    : [{ id: newLeaveRoutingStepId(), position_ids: [] }];
  return {
    description: rule.description,
    position_ids: rule.positions.map((name) => positionMap.get(name)).filter((id): id is number => typeof id === "number"),
    department_ids: rule.departments.map((name) => departmentMap.get(name)).filter((id): id is number => typeof id === "number"),
    steps,
  };
}

function formatPositionOption(position: PositionData) {
  return `${position.name} (level ${position.level_of_approval})`;
}

function sameEmailConfig(a: EmailConfigData | null, b: EmailConfigData | null) {
  const left = normalizeEmailConfig(a);
  const right = normalizeEmailConfig(b);
  return (
    left.smtp_host === right.smtp_host
    && left.smtp_port === right.smtp_port
    && left.use_ssl === right.use_ssl
    && left.use_tls === right.use_tls
    && left.username === right.username
    && left.password === right.password
    && left.from_name === right.from_name
    && left.from_address === right.from_address
  );
}

function isValidEmailAddress(value: string) {
  const trimmed = value.trim();
  return trimmed !== "" && /\S+@\S+\.\S+/.test(trimmed);
}

function getEmailConfigRequiredFlags(config: EmailConfigData) {
  return {
    smtp_host: !config.smtp_host.trim(),
    smtp_port: !(config.smtp_port >= 1 && config.smtp_port <= 65535),
    username: !config.username.trim(),
    password: !config.password.trim(),
    from_name: !config.from_name.trim(),
    from_address: !isValidEmailAddress(config.from_address),
  };
}

function samePasswordPolicy(a: PasswordPolicyData | null, b: PasswordPolicyData | null) {
  if (!a || !b) return false;
  return (
    a.require_change_on_first_login === b.require_change_on_first_login
    && a.min_length === b.min_length
    && a.require_uppercase === b.require_uppercase
    && a.require_lowercase === b.require_lowercase
    && a.require_number === b.require_number
    && a.require_special_character === b.require_special_character
    && a.password_expiry_days === b.password_expiry_days
    && a.default_password_prefix === b.default_password_prefix
    && a.enable_account_lockout === b.enable_account_lockout
    && a.max_failed_login_attempts === b.max_failed_login_attempts
  );
}

function getDefaultPasswordPolicy(): PasswordPolicyData {
  return {
    min_length: 8,
    password_expiry_days: 90,
    default_password_prefix: "",
    require_uppercase: false,
    require_lowercase: false,
    require_number: false,
    require_special_character: false,
    require_change_on_first_login: false,
    enable_account_lockout: false,
    max_failed_login_attempts: 5,
  };
}

function updatePasswordPolicy(
  setPasswordPolicy: Dispatch<SetStateAction<PasswordPolicyData | null>>,
  patch: Partial<PasswordPolicyData>,
) {
  setPasswordPolicy((prev) => ({ ...getDefaultPasswordPolicy(), ...(prev ?? {}), ...patch }));
}

function getAdminRoleSnapshot(account: AdminAccountData): Record<AdminRoleKey, boolean> {
  return {
    admin: Boolean(account.admin),
    clinic: Boolean(account.clinic),
    iad: Boolean(account.iad),
    accounting: Boolean(account.accounting),
    hr: Boolean(account.hr),
    hr_manager: Boolean(account.hr_manager),
    mis: Boolean(account.mis),
  };
}

function hasAnyAdminRole(account: AdminAccountData) {
  return ADMIN_ROLE_OPTIONS.some((role) => Boolean(account[role.key]));
}

function sameAdminRoleSet(a: AdminAccountData, b: AdminAccountData) {
  return ADMIN_ROLE_OPTIONS.every((role) => Boolean(a[role.key]) === Boolean(b[role.key]));
}

function isAdminAccountsDirty(current: AdminAccountData[], saved: AdminAccountData[]) {
  if (current.length !== saved.length) return true;
  const savedMap = new Map(saved.map((item) => [item.id, item]));
  for (const item of current) {
    const savedItem = savedMap.get(item.id);
    if (!savedItem) return true;
    if (!sameAdminRoleSet(item, savedItem)) return true;
  }
  return false;
}

function sameNumberArray(a: number[], b: number[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function formatDurationValue(value: number | string | undefined, fallback = "0") {
  if (value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Number(parsed.toFixed(1))) : fallback;
}

function buildWeekdayDurationMap(workdays: number[], hoursPerDay: number | string): Record<string, string> {
  const normalizedHours = formatDurationValue(hoursPerDay, "8");
  return Object.fromEntries(WEEKDAY_OPTIONS.map((option) => [String(option.value), workdays.includes(option.value) ? normalizedHours : "0"]));
}

function buildWeekdayEnabledMap(workdays: number[]): Record<string, boolean> {
  return Object.fromEntries(WEEKDAY_OPTIONS.map((option) => [String(option.value), workdays.includes(option.value)]));
}

function normalizeWeekdayDurationMap(
  value: WeekdayDurationMap | undefined,
  workdays: number[],
  hoursPerDay: number | string,
): Record<string, string> {
  const base = buildWeekdayDurationMap(workdays, hoursPerDay);
  if (!value) return base;

  for (const option of WEEKDAY_OPTIONS) {
    const raw = value[String(option.value)];
    if (raw === undefined || raw === null) continue;
    if (raw === "") {
      base[String(option.value)] = "";
      continue;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) continue;
    base[String(option.value)] = String(Number(parsed.toFixed(1)));
  }

  return base;
}

function getWorkdaysFromDurationMap(durations: Record<string, string>): number[] {
  return WEEKDAY_OPTIONS
    .map((option) => option.value)
    .filter((day) => {
      const raw = durations[String(day)] ?? "0";
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed > 0;
    });
}

function getEnabledWorkdays(enabledMap: Record<string, boolean>) {
  return WEEKDAY_OPTIONS
    .map((option) => option.value)
    .filter((day) => Boolean(enabledMap[String(day)]));
}

function sameWeekdayDurationMap(a: Record<string, string>, b: Record<string, string>) {
  return WEEKDAY_OPTIONS.every((option) => (a[String(option.value)] ?? "0") === (b[String(option.value)] ?? "0"));
}

function sameWeekdayEnabledMap(a: Record<string, boolean>, b: Record<string, boolean>) {
  return WEEKDAY_OPTIONS.every((option) => Boolean(a[String(option.value)]) === Boolean(b[String(option.value)]));
}

function getLeaveTypeSummary(leaveType: Pick<LeaveTypeData, "has_balance" | "deductible" | "requires_clinic_approval" | "is_active">) {
  const flags = [
    leaveType.has_balance ? "Has Balance" : null,
    leaveType.deductible ? "Deductible" : null,
    leaveType.requires_clinic_approval ? "Need clinic approval" : null,
    leaveType.is_active ? "Active" : null,
  ].filter(Boolean);

  return flags.join(" • ");
}

function getMaxDurationValue(durations: Record<string, string>) {
  return Math.max(0, ...WEEKDAY_OPTIONS.map((option) => {
    const parsed = Number(durations[String(option.value)] ?? "0");
    return Number.isFinite(parsed) ? parsed : 0;
  }));
}

function getWorkdayPresetValue(workdays: number[], weekdayDurations: WeekdayDurationMap | undefined, hoursPerDay: number | string): WorkdayPresetValue {
  const normalized = [...workdays].sort((a, b) => a - b);
  const normalizedDurations = normalizeWeekdayDurationMap(weekdayDurations, normalized, hoursPerDay);
  const exactMatch = WORKDAY_PRESET_OPTIONS.find((option) => sameNumberArray(option.workdays, normalized));
  if (!exactMatch || exactMatch.value === "custom") return "custom";
  const presetDurations = buildWeekdayDurationMap(exactMatch.workdays, hoursPerDay);
  return sameWeekdayDurationMap(normalizedDurations, presetDurations) ? exactMatch.value : "custom";
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-[var(--color-border)] pb-4 last:border-b-0 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
      <div className="max-w-md space-y-0.5">
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</p>
        {description ? <p className="text-[12px] leading-relaxed text-[var(--color-text-muted)]">{description}</p> : null}
      </div>
      <div className="flex w-full justify-end">
        <div className="w-full max-w-[42rem]">{children}</div>
      </div>
    </div>
  );
}

type GeneralEditableListProps<TItem, TDraft> = {
  title: string;
  description: string;
  items: TItem[];
  canEdit: boolean;
  getItemId: (item: TItem) => number;
  getItemName: (item: TItem) => string;
  getItemMeta?: (item: TItem) => string | undefined;
  createEmptyDraft: () => TDraft;
  createDraftFromItem: (item: TItem) => TDraft;
  renderCreateFields: (args: {
    draft: TDraft;
    setDraft: (value: React.SetStateAction<TDraft>) => void;
    inputRef: React.RefObject<HTMLInputElement | null>;
    disabled: boolean;
  }) => React.ReactNode;
  renderEditFields: (args: {
    draft: TDraft;
    setDraft: (value: React.SetStateAction<TDraft>) => void;
    inputRef: React.RefObject<HTMLInputElement | null>;
    disabled: boolean;
  }) => React.ReactNode;
  isCreateValid: (draft: TDraft) => boolean;
  isEditValid: (draft: TDraft) => boolean;
  onCreate: (draft: TDraft) => Promise<boolean>;
  onUpdate: (item: TItem, draft: TDraft) => Promise<boolean>;
  onDelete: (item: TItem) => Promise<boolean>;
  getDeleteTitle: (item: TItem) => string;
  getDeleteMessage: (item: TItem) => string;
};

function GeneralEditableList<TItem, TDraft>({
  title,
  description,
  items,
  canEdit,
  getItemId,
  getItemName,
  getItemMeta,
  createEmptyDraft,
  createDraftFromItem,
  renderCreateFields,
  renderEditFields,
  isCreateValid,
  isEditValid,
  onCreate,
  onUpdate,
  onDelete,
  getDeleteTitle,
  getDeleteMessage,
}: GeneralEditableListProps<TItem, TDraft>) {
  const [isAdding, setIsAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<TDraft>(() => createEmptyDraft());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<TDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TItem | null>(null);
  const [isSavingAdd, setIsSavingAdd] = useState(false);
  const [savingEditId, setSavingEditId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const addInputRef = useRef<HTMLInputElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const activeEditRowRef = useRef<HTMLDivElement | null>(null);

  const focusAddInput = () => {
    const element = addInputRef.current;
    if (!element) return;
    element.focus();
    element.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  };

  useEffect(() => {
    if (!isAdding) return;
    const frame = window.requestAnimationFrame(focusAddInput);
    return () => window.cancelAnimationFrame(frame);
  }, [isAdding]);

  useEffect(() => {
    if (editingId !== null) editInputRef.current?.focus();
  }, [editingId]);

  useEffect(() => {
    if (editingId === null) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && activeEditRowRef.current && !activeEditRowRef.current.contains(target)) {
        setEditingId(null);
        setEditDraft(null);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [editingId]);

  const openAddRow = () => {
    if (!canEdit) return;
    if (isAdding) {
      focusAddInput();
      return;
    }
    setIsAdding(true);
    setAddDraft(createEmptyDraft());
  };

  const cancelAddRow = () => {
    setIsAdding(false);
    setAddDraft(createEmptyDraft());
  };

  const startEdit = (item: TItem) => {
    if (!canEdit) return;
    setEditingId(getItemId(item));
    setEditDraft(createDraftFromItem(item));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const handleCreate = async () => {
    if (!isCreateValid(addDraft) || isSavingAdd) return;
    setIsSavingAdd(true);
    const ok = await onCreate(addDraft);
    setIsSavingAdd(false);
    if (ok) cancelAddRow();
  };

  const handleUpdate = async (item: TItem) => {
    if (!editDraft || !isEditValid(editDraft) || savingEditId === getItemId(item)) return;
    setSavingEditId(getItemId(item));
    const ok = await onUpdate(item, editDraft);
    setSavingEditId(null);
    if (ok) cancelEdit();
  };

  const handleDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    const ok = await onDelete(deleteTarget);
    setIsDeleting(false);
    if (ok) setDeleteTarget(null);
  };

  const setEditDraftValue = (value: React.SetStateAction<TDraft>) => {
    setEditDraft((prev) => {
      const base = prev ?? createEmptyDraft();
      return typeof value === "function"
        ? (value as (previousState: TDraft) => TDraft)(base)
        : value;
    });
  };

  return (
    <>
      <SettingRow title={title} description={description}>
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <div className={GENERAL_LIST_SCROLL_CLASS}>
            <AnimatePresence initial={false}>
              {items.map((item) => {
                const itemId = getItemId(item);
                const isEditing = editingId === itemId && editDraft !== null;
                const meta = getItemMeta?.(item);

                return (
                  <motion.div
                    layout
                    key={itemId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    ref={isEditing ? activeEditRowRef : undefined}
                    className={cn(GENERAL_LIST_ROW_CLASS, isEditing && "bg-[var(--color-bg-card)]")}
                  >
                    {isEditing && editDraft ? (
                      <>
                        <div className="min-w-0 flex-1">
                          {renderEditFields({
                            draft: editDraft,
                            setDraft: setEditDraftValue,
                            inputRef: editInputRef,
                            disabled: savingEditId === itemId,
                          })}
                        </div>
                        <div className="flex items-center gap-1">
                          <button type="button" className={ACTION_ICON_BUTTON_CLASS} disabled={savingEditId === itemId || !isEditValid(editDraft)} onClick={() => void handleUpdate(item)}>
                            {savingEditId === itemId ? <TextShimmer className="text-[10px]">Saving</TextShimmer> : <Check size={14} />}
                          </button>
                          <button type="button" className={DANGER_ICON_BUTTON_CLASS} disabled={savingEditId === itemId} onClick={cancelEdit}>
                            <X size={14} />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-normal text-[var(--color-text-primary)]">{getItemName(item)}</p>
                          {meta && <p className="truncate text-[11px] text-[var(--color-text-muted)]">{meta}</p>}
                        </div>
                        {canEdit && (
                          <div className="flex items-center gap-1">
                            <button type="button" className={ACTION_ICON_BUTTON_CLASS} onClick={() => startEdit(item)}>
                              <Pencil size={14} />
                            </button>
                            <button type="button" className={DANGER_ICON_BUTTON_CLASS} onClick={() => setDeleteTarget(item)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                );
              })}

              {isAdding && (
                <motion.div
                  layout
                  key="general-add-row"
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="overflow-hidden border-[var(--color-border)] bg-[var(--color-bg-card)]/40 px-3 py-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      {renderCreateFields({
                        draft: addDraft,
                        setDraft: setAddDraft,
                        inputRef: addInputRef,
                        disabled: isSavingAdd,
                      })}
                    </div>
                    <div className="flex items-center gap-1 pt-0.5">
                      <button type="button" className={ACTION_ICON_BUTTON_CLASS} disabled={isSavingAdd || !isCreateValid(addDraft)} onClick={() => void handleCreate()}>
                        {isSavingAdd ? <TextShimmer className="text-[10px]">Saving</TextShimmer> : <Check size={14} />}
                      </button>
                      <button type="button" className={DANGER_ICON_BUTTON_CLASS} disabled={isSavingAdd} onClick={cancelAddRow}>
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {canEdit && (
            <div className="border-t border-[var(--color-border)] px-3 py-1.5 flex justify-center">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-accent)]"
                onClick={openAddRow}
              >
                <Plus size={12} /> Add More
              </button>
            </div>
          )}
        </div>
      </SettingRow>

      <AnimatePresence>
        {deleteTarget && (
          <ConfirmationModal
            title={getDeleteTitle(deleteTarget)}
            message={getDeleteMessage(deleteTarget)}
            confirmLabel="Delete"
            confirming={isDeleting}
            onConfirm={handleDelete}
            onCancel={() => !isDeleting && setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store", ...init });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    let message = typeof body.detail === "string" ? body.detail : "";
    if (!message) {
      const msgs = Object.values(body).flatMap((v) => Array.isArray(v) ? v.map(String) : [String(v)]);
      message = msgs.filter(Boolean).join("; ") || "Request failed.";
    }
    throw new Error(message);
  }
  return body as T;
}

async function mutateJson<T>(url: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: JsonObject): Promise<T> {
  return fetchJson<T>(url, {
    method,
    headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function nextPatchVersion(updates: SystemUpdateData[]): string {
  if (!updates.length) return "1.0.0";
  const latest = updates[0].version;
  const parts = latest.split(".");
  if (parts.length !== 3) return "1.0.0";
  const patch = parseInt(parts[2], 10);
  if (isNaN(patch)) return "1.0.0";
  return `${parts[0]}.${parts[1]}.${patch + 1}`;
}

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export default function SystemSettingsPage() {
  const router = useRouter();
  const [authPhase, setAuthPhase] = useState<AuthPhase>("spinner");
  const [user, setUser] = useState<UserData | null>(null);
  const [activeTab, setActiveTab] = useState<TopTab>("general");
  const [activeSectionId, setActiveSectionId] = useState("general-group");
  const [sectionBusy, setSectionBusy] = useState<Record<string, boolean>>({});

  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [offices, setOffices] = useState<OfficeData[]>([]);
  const [departments, setDepartments] = useState<DepartmentData[]>([]);
  const [lines, setLines] = useState<LineData[]>([]);
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<EmploymentTypeData[]>([]);
  const [workdaySchedule, setWorkdaySchedule] = useState<WorkdayScheduleData>({
    workdays: [0, 1, 2, 3, 4, 5],
    hours_per_day: 8,
    weekday_durations: buildWeekdayDurationMap([0, 1, 2, 3, 4, 5], 8),
    half_day_hours: 4,
  });
  const [workdayMode, setWorkdayMode] = useState<WorkdayPresetValue>("mon-sat");
  const [customWeekdayDurations, setCustomWeekdayDurations] = useState<Record<string, string>>(buildWeekdayDurationMap([0, 1, 2, 3, 4, 5], 8));
  const [customEnabledWeekdays, setCustomEnabledWeekdays] = useState<Record<string, boolean>>(buildWeekdayEnabledMap([0, 1, 2, 3, 4, 5]));
  const [savedWorkdays, setSavedWorkdays] = useState<number[]>([0, 1, 2, 3, 4, 5]);
  const [savedWorkdayMode, setSavedWorkdayMode] = useState<WorkdayPresetValue>("mon-sat");
  const [savedWeekdayDurations, setSavedWeekdayDurations] = useState<Record<string, string>>(buildWeekdayDurationMap([0, 1, 2, 3, 4, 5], 8));
  const [savedCustomEnabledWeekdays, setSavedCustomEnabledWeekdays] = useState<Record<string, boolean>>(buildWeekdayEnabledMap([0, 1, 2, 3, 4, 5]));
  const [savedHoursPerDay, setSavedHoursPerDay] = useState(8);
  const [newShift, setNewShift] = useState({ name: "", start_time: "08:00", end_time: "17:00" });
  const [newOfficeName, setNewOfficeName] = useState("");
  const [newDepartment, setNewDepartment] = useState({ name: "", office: "" });
  const [newLine, setNewLine] = useState({ name: "", department: "" });
  const [newPosition, setNewPosition] = useState({ name: "", level_of_approval: "1" });
  const [newEmploymentTypeName, setNewEmploymentTypeName] = useState("");

  const [memoAdvertisementEnabled, setMemoAdvertisementEnabled] = useState(false);
  const [memoAdvertisementMemos, setMemoAdvertisementMemos] = useState<MemoAdvertisementData[]>([]);
  const [memoAdvertisementModalOpen, setMemoAdvertisementModalOpen] = useState(false);
  const [memoAdvertisementEditingId, setMemoAdvertisementEditingId] = useState<number | null>(null);
  const [memoAdvertisementForm, setMemoAdvertisementForm] = useState({ title: "", description: "" });
  const [memoAdvertisementDeleteTarget, setMemoAdvertisementDeleteTarget] = useState<MemoAdvertisementData | null>(null);

  const [feedbackEnabled, setFeedbackEnabled] = useState(false);
  const [updatesEnabled, setUpdatesEnabled] = useState(false);
  const [systemUpdates, setSystemUpdates] = useState<SystemUpdateData[]>([]);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateEditingId, setUpdateEditingId] = useState<number | null>(null);
  const [updateForm, setUpdateForm] = useState({ version: "", description: "" });
  const [updateDeleteTarget, setUpdateDeleteTarget] = useState<SystemUpdateData | null>(null);

  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeData[]>([]);
  const [leaveReasons, setLeaveReasons] = useState<LeaveReasonData[]>([]);
  const [leaveSubreasons, setLeaveSubreasons] = useState<LeaveSubreasonData[]>([]);
  const [leaveRoutingRules, setLeaveRoutingRules] = useState<LeaveRoutingRuleData[]>([]);
  const [trainingEvaluationRoutingRules, setTrainingEvaluationRoutingRules] = useState<EvaluationRoutingRuleData[]>([]);
  const [evaluationRoutingRules, setEvaluationRoutingRules] = useState<EvaluationRoutingRuleData[]>([]);
  const [newLeaveType, setNewLeaveType] = useState({ name: "", has_balance: false, deductible: false, requires_clinic_approval: false, is_active: true });
  const [isAddingLeaveType, setIsAddingLeaveType] = useState(false);
  const [editingLeaveTypeId, setEditingLeaveTypeId] = useState<number | null>(null);
  const [editLeaveType, setEditLeaveType] = useState({ name: "", has_balance: false, deductible: false, requires_clinic_approval: false, is_active: true });
  const [leaveTypeDeleteTarget, setLeaveTypeDeleteTarget] = useState<LeaveTypeData | null>(null);
  const [leaveReasonModalOpen, setLeaveReasonModalOpen] = useState(false);
  const [editingLeaveReasonId, setEditingLeaveReasonId] = useState<number | null>(null);
  const [leaveReasonForm, setLeaveReasonForm] = useState({ title: "", leave_type_id: "", subreasons: [""] as string[] });
  const [leaveReasonDeleteTarget, setLeaveReasonDeleteTarget] = useState<LeaveReasonData | null>(null);

  const [evaluationSettings, setEvaluationSettings] = useState<EvaluationSettingsData | null>(null);
  const [savedEvaluationFrequency, setSavedEvaluationFrequency] = useState<"monthly" | "quarterly">("quarterly");
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicyData | null>(null);
  const [savedPasswordPolicy, setSavedPasswordPolicy] = useState<PasswordPolicyData | null>(null);
  const [emailConfig, setEmailConfig] = useState<EmailConfigData | null>(null);
  const [savedEmailConfig, setSavedEmailConfig] = useState<EmailConfigData | null>(null);
  const [emailConfigShowPassword, setEmailConfigShowPassword] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [adminAccounts, setAdminAccounts] = useState<AdminAccountData[]>([]);
  const [savedAdminAccounts, setSavedAdminAccounts] = useState<AdminAccountData[]>([]);
  const [adminAddOpen, setAdminAddOpen] = useState(false);
  const [adminUserSearch, setAdminUserSearch] = useState("");
  const [adminAddUserId, setAdminAddUserId] = useState("");
  const [adminAddRoles, setAdminAddRoles] = useState<Record<AdminRoleKey, boolean>>({
    admin: false,
    clinic: false,
    iad: false,
    accounting: false,
    hr: false,
    hr_manager: false,
    mis: false,
  });
  const [adminEditingId, setAdminEditingId] = useState<number | null>(null);
  const [adminEditRoles, setAdminEditRoles] = useState<Record<AdminRoleKey, boolean>>({
    admin: false,
    clinic: false,
    iad: false,
    accounting: false,
    hr: false,
    hr_manager: false,
    mis: false,
  });
  const [adminDeleteTarget, setAdminDeleteTarget] = useState<AdminAccountData | null>(null);
  const [adminUnlockTarget, setAdminUnlockTarget] = useState<AdminAccountData | null>(null);
  const [leaveRoutingModalOpen, setLeaveRoutingModalOpen] = useState(false);
  const [leaveRoutingEditTarget, setLeaveRoutingEditTarget] = useState<LeaveRoutingRuleData | null>(null);
  const [leaveRoutingRuleDraft, setLeaveRoutingRuleDraft] = useState<LeaveRoutingRuleDraft>(createLeaveRoutingRuleDraft());
  const [leaveRoutingDeleteTarget, setLeaveRoutingDeleteTarget] = useState<LeaveRoutingRuleData | null>(null);
  const [trainingEvaluationRoutingModalOpen, setTrainingEvaluationRoutingModalOpen] = useState(false);
  const [trainingEvaluationRoutingEditTarget, setTrainingEvaluationRoutingEditTarget] = useState<EvaluationRoutingRuleData | null>(null);
  const [trainingEvaluationRoutingRuleDraft, setTrainingEvaluationRoutingRuleDraft] = useState<LeaveRoutingRuleDraft>(createLeaveRoutingRuleDraft());
  const [evaluationRoutingModalOpen, setEvaluationRoutingModalOpen] = useState(false);
  const [evaluationRoutingEditTarget, setEvaluationRoutingEditTarget] = useState<EvaluationRoutingRuleData | null>(null);
  const [evaluationRoutingDeleteTarget, setEvaluationRoutingDeleteTarget] = useState<EvaluationRoutingRuleData | null>(null);
  const [evaluationRoutingRuleDraft, setEvaluationRoutingRuleDraft] = useState<LeaveRoutingRuleDraft>(createLeaveRoutingRuleDraft());

  const updateLeaveRoutingRuleDraft = (patch: Partial<LeaveRoutingRuleDraft>) => {
    setLeaveRoutingRuleDraft((prev) => ({ ...prev, ...patch }));
  };
  const updateTrainingEvaluationRoutingRuleDraft = (patch: Partial<LeaveRoutingRuleDraft>) => {
    setTrainingEvaluationRoutingRuleDraft((prev) => ({ ...prev, ...patch }));
  };
  const updateEvaluationRoutingRuleDraft = (patch: Partial<LeaveRoutingRuleDraft>) => {
    setEvaluationRoutingRuleDraft((prev) => ({ ...prev, ...patch }));
  };

  const addLeaveRoutingStep = () => {
    setLeaveRoutingRuleDraft((prev) => ({
      ...prev,
      steps: [...prev.steps, { id: newLeaveRoutingStepId(), position_ids: [] }],
    }));
  };
  const addTrainingEvaluationRoutingStep = () => {
    setTrainingEvaluationRoutingRuleDraft((prev) => ({
      ...prev,
      steps: [...prev.steps, { id: newLeaveRoutingStepId(), position_ids: [] }],
    }));
  };
  const addEvaluationRoutingStep = () => {
    setEvaluationRoutingRuleDraft((prev) => ({
      ...prev,
      steps: [...prev.steps, { id: newLeaveRoutingStepId(), position_ids: [] }],
    }));
  };

  const removeLeaveRoutingStep = (stepId: string) => {
    setLeaveRoutingRuleDraft((prev) => ({
      ...prev,
      steps: prev.steps.filter((step) => step.id !== stepId),
    }));
  };
  const removeTrainingEvaluationRoutingStep = (stepId: string) => {
    setTrainingEvaluationRoutingRuleDraft((prev) => ({
      ...prev,
      steps: prev.steps.filter((step) => step.id !== stepId),
    }));
  };
  const removeEvaluationRoutingStep = (stepId: string) => {
    setEvaluationRoutingRuleDraft((prev) => ({
      ...prev,
      steps: prev.steps.filter((step) => step.id !== stepId),
    }));
  };

  const updateLeaveRoutingStep = (stepId: string, patch: Partial<LeaveRoutingStepDraft>) => {
    setLeaveRoutingRuleDraft((prev) => ({
      ...prev,
      steps: prev.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    }));
  };
  const updateTrainingEvaluationRoutingStep = (stepId: string, patch: Partial<LeaveRoutingStepDraft>) => {
    setTrainingEvaluationRoutingRuleDraft((prev) => ({
      ...prev,
      steps: prev.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    }));
  };
  const updateEvaluationRoutingStep = (stepId: string, patch: Partial<LeaveRoutingStepDraft>) => {
    setEvaluationRoutingRuleDraft((prev) => ({
      ...prev,
      steps: prev.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    }));
  };
  const [trainingEvaluationRoutingDeleteTarget, setTrainingEvaluationRoutingDeleteTarget] = useState<EvaluationRoutingRuleData | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setAuthPhase((p) => (p === "spinner" ? "checking" : p)), 350);
    const run = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
        clearTimeout(t);
        if (!res.ok) return router.replace("/");
        const data = (await res.json()) as UserData;
        if (!(data.admin || data.hr || data.accounting)) return router.replace("/dashboard");
        setUser(data);
        setAuthPhase("done");
      } catch {
        clearTimeout(t);
        router.replace("/");
      }
    };
    void run();
    return () => clearTimeout(t);
  }, [router]);

  const sectionsForTab = useMemo(() => SECTIONS.filter((s) => s.tab === activeTab), [activeTab]);
  const activeSection = useMemo(() => sectionsForTab.find((s) => s.id === activeSectionId) ?? null, [activeSectionId, sectionsForTab]);
  const generalSectionCards = useMemo(() => {
    if (activeTab !== "general") return sectionsForTab.map((section) => ({ id: section.id, title: section.title, sections: [section] }));

    const generalGroupSection = sectionsForTab.find((s) => s.id === "general-group");
    const leaveReasonsSection = sectionsForTab.find((s) => s.id === "leave-reasons");
    const evaluationFrequencySection = sectionsForTab.find((s) => s.id === "evaluation-frequency");
    const cards: { id: string; title: string; sections: SectionDef[] }[] = [];

    if (generalGroupSection) {
      cards.push({
        id: "general-group",
        title: "",
        sections: [generalGroupSection, leaveReasonsSection, evaluationFrequencySection].filter(Boolean) as SectionDef[],
      });
    }

    return cards;
  }, [activeTab, sectionsForTab]);
  const canEdit = user && activeSection ? activeSection.editable(user) : false;
  const leaveRoutingCanSave = leaveRoutingRuleDraft.description.trim().length > 0 && (
    leaveRoutingRuleDraft.position_ids.length > 0
    || leaveRoutingRuleDraft.department_ids.length > 0
    || leaveRoutingRuleDraft.steps.some((step) => step.position_ids.length > 0)
  );
  const trainingEvaluationRoutingCanSave = trainingEvaluationRoutingRuleDraft.description.trim().length > 0 && (
    trainingEvaluationRoutingRuleDraft.position_ids.length > 0
    || trainingEvaluationRoutingRuleDraft.department_ids.length > 0
    || trainingEvaluationRoutingRuleDraft.steps.some((step) => step.position_ids.length > 0)
  );
  const evaluationRoutingCanSave = evaluationRoutingRuleDraft.description.trim().length > 0 && (
    evaluationRoutingRuleDraft.position_ids.length > 0
    || evaluationRoutingRuleDraft.department_ids.length > 0
    || evaluationRoutingRuleDraft.steps.some((step) => step.position_ids.length > 0)
  );

  useEffect(() => {
    if (!sectionsForTab.length) return;
    if (!sectionsForTab.some((s) => s.id === activeSectionId)) setActiveSectionId(sectionsForTab[0].id);
  }, [sectionsForTab, activeSectionId]);

  const fetchShiftsData = async () => setShifts(await fetchJson<ShiftData[]>("/api/general-settings/shifts"));
  const fetchOfficesData = async () => setOffices(await fetchJson<OfficeData[]>("/api/general-settings/offices"));
  const fetchDepartmentsData = async () => setDepartments(await fetchJson<DepartmentData[]>("/api/general-settings/departments"));
  const fetchLinesData = async () => setLines(await fetchJson<LineData[]>("/api/general-settings/lines"));
  const fetchPositionsData = async () => setPositions(await fetchJson<PositionData[]>("/api/general-settings/positions"));
  const fetchEmploymentTypesData = async () => setEmploymentTypes(await fetchJson<EmploymentTypeData[]>("/api/general-settings/employment-types"));
  const fetchWorkdayScheduleData = async () => {
    const data = await fetchJson<WorkdayScheduleData>("/api/general-settings/workday-schedule");
    const hoursPerDay = Number(data.hours_per_day ?? 8);
    const normalizedWeekdayDurations = normalizeWeekdayDurationMap(data.weekday_durations, data.workdays ?? [0, 1, 2, 3, 4, 5], Number.isFinite(hoursPerDay) ? hoursPerDay : 8);
    const initialWorkdayMode = getWorkdayPresetValue(data.workdays ?? [0, 1, 2, 3, 4, 5], normalizedWeekdayDurations, Number.isFinite(hoursPerDay) ? hoursPerDay : 8);
    const initialEnabledWeekdays = buildWeekdayEnabledMap(data.workdays ?? [0, 1, 2, 3, 4, 5]);

    setWorkdaySchedule({
      workdays: data.workdays ?? [0, 1, 2, 3, 4, 5],
      hours_per_day: Number.isFinite(hoursPerDay) ? hoursPerDay : 8,
      weekday_durations: normalizedWeekdayDurations,
      half_day_hours: data.half_day_hours,
    });
    setWorkdayMode(initialWorkdayMode);
    setCustomWeekdayDurations(normalizedWeekdayDurations);
    setCustomEnabledWeekdays(initialEnabledWeekdays);
    setSavedWorkdays(data.workdays ?? [0, 1, 2, 3, 4, 5]);
    setSavedWorkdayMode(initialWorkdayMode);
    setSavedWeekdayDurations(normalizedWeekdayDurations);
    setSavedCustomEnabledWeekdays(initialEnabledWeekdays);
    setSavedHoursPerDay(Number.isFinite(hoursPerDay) ? hoursPerDay : 8);
  };
  const refreshGeneralData = async () => {
    await Promise.all([
      fetchShiftsData(),
      fetchOfficesData(),
      fetchDepartmentsData(),
      fetchLinesData(),
      fetchPositionsData(),
      fetchEmploymentTypesData(),
      fetchWorkdayScheduleData(),
    ]);
  };

  const fetchLeaveTypesData = async () => setLeaveTypes(await fetchJson<LeaveTypeData[]>("/api/leave/admin/types"));
  const fetchEmailConfigData = async () => {
    const data = await fetchJson<EmailConfigData | null>("/api/general-settings/email-config");
    const normalized = normalizeEmailConfig(data);
    setEmailConfig(normalized);
    setSavedEmailConfig(normalized);
  };
  const fetchPasswordPolicyData = async () => {
    const data = await fetchJson<PasswordPolicyData>("/api/general-settings/password-policy/admin");
    setPasswordPolicy(data);
    setSavedPasswordPolicy(data);
  };
  const fetchAdminAccountsData = async () => {
    const data = await fetchJson<AdminAccountData[]>("/api/general-settings/admin-accounts");
    setAdminAccounts(data);
    setSavedAdminAccounts(data);
  };
  const refreshSecurityData = async () => {
    await Promise.all([
      fetchEmailConfigData(),
      fetchPasswordPolicyData(),
      fetchAdminAccountsData(),
    ]);
  };
  const fetchMemoAdvertisementSettings = async () => {
    const data = await fetchJson<MemoAdvertisementSettingsData>("/api/general-settings/memo-advertisement");
    setMemoAdvertisementEnabled(data.enabled);
  };
  const fetchMemoAdvertisementMemos = async () => setMemoAdvertisementMemos(await fetchJson<MemoAdvertisementData[]>("/api/general-settings/memo-advertisement/memos"));
  const refreshMemoAdvertisementData = async () => {
    await Promise.all([
      fetchMemoAdvertisementSettings(),
      fetchMemoAdvertisementMemos(),
    ]);
  };

  const fetchFeedbackSettings = async () => {
    const data = await fetchJson<FeedbackSettingsData>("/api/feedback/settings");
    setFeedbackEnabled(data.feedback_enabled);
    setUpdatesEnabled(data.updates_enabled);
  };
  const fetchSystemUpdates = async () => setSystemUpdates(await fetchJson<SystemUpdateData[]>("/api/feedback/updates"));
  const refreshFeedbackAndUpdatesData = async () => {
    await Promise.all([fetchFeedbackSettings(), fetchSystemUpdates()]);
  };
  const fetchLeaveReasonsData = async () => setLeaveReasons(await fetchJson<LeaveReasonData[]>("/api/leave/admin/reasons"));
  const fetchLeaveSubreasonsData = async () => setLeaveSubreasons(await fetchJson<LeaveSubreasonData[]>("/api/leave/admin/subreasons"));
  const fetchLeaveRoutingRules = async () => setLeaveRoutingRules(await fetchJson<LeaveRoutingRuleData[]>("/api/leave/admin/routing-rules"));
  const fetchTrainingEvaluationRoutingRules = async () => setTrainingEvaluationRoutingRules(await fetchJson<EvaluationRoutingRuleData[]>("/api/training/admin/routing-rules"));
  const fetchEvaluationRoutingRules = async () => setEvaluationRoutingRules(await fetchJson<EvaluationRoutingRuleData[]>("/api/employee-eval/admin/routing-rules"));
  const refreshLeaveReasonCatalogData = async () => {
    await Promise.all([
      fetchLeaveReasonsData(),
      fetchLeaveSubreasonsData(),
    ]);
  };
  const refreshLeaveData = async () => {
    await Promise.all([
      fetchLeaveTypesData(),
      fetchLeaveReasonsData(),
      fetchLeaveSubreasonsData(),
      fetchLeaveRoutingRules(),
    ]);
  };

  const runAction = async (sectionId: string, action: () => Promise<void>, ok: string) => {
    setSectionBusy((p) => ({ ...p, [sectionId]: true }));
    try {
      await action();
      toast.success(ok);
      return true;
    }
    catch (e) {
      const message = e instanceof Error ? e.message : "Action failed.";
      toast.error(message, { title: "Error" });
      return false;
    }
    finally { setSectionBusy((p) => ({ ...p, [sectionId]: false })); }
  };

  useEffect(() => {
    if (!user || authPhase !== "done" || activeTab === "approval") return;
    let cancelled = false;
    const load = async () => {
      setSectionBusy((p) => ({ ...p, [activeSectionId]: true }));
      try {
        if (activeTab === "general" && activeSectionId === "general-group") {
          await Promise.all([
            refreshGeneralData(),
            fetchLeaveTypesData(),
            fetchLeaveReasonsData(),
            fetchLeaveSubreasonsData(),
            (async () => {
              const evalData = await fetchJson<EvaluationSettingsData>("/api/employee-eval/settings");
              setEvaluationSettings(evalData);
              setSavedEvaluationFrequency(evalData.frequency);
            })(),
          ]);
        } else {
          if (activeSectionId === "general-group") await refreshGeneralData();
          if (activeSectionId === "leave-reasons" || activeSectionId === "leave-routing") await refreshLeaveData();
          if (activeSectionId === "evaluation-routing") await fetchEvaluationRoutingRules();
          if (activeSectionId === "evaluation-frequency") {
            const evalData = await fetchJson<EvaluationSettingsData>("/api/employee-eval/settings");
            setEvaluationSettings(evalData);
            setSavedEvaluationFrequency(evalData.frequency);
          }
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Unable to load section data.", { title: "Load Error" });
      } finally {
        if (!cancelled) setSectionBusy((p) => ({ ...p, [activeSectionId]: false }));
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [activeSectionId, activeTab, authPhase, user]);

  useEffect(() => {
    if (!user || authPhase !== "done" || activeTab !== "memo-advertisement") return;
    let cancelled = false;
    const load = async () => {
      setSectionBusy((p) => ({ ...p, "memo-advertisement": true }));
      try {
        await Promise.all([
          refreshMemoAdvertisementData(),
          refreshFeedbackAndUpdatesData(),
        ]);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Unable to load memo advertisement settings.", { title: "Load Error" });
      } finally {
        if (!cancelled) setSectionBusy((p) => ({ ...p, "memo-advertisement": false }));
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [activeTab, authPhase, user]);

  useEffect(() => {
    if (!user || authPhase !== "done" || activeTab !== "security") return;
    let cancelled = false;
    const load = async () => {
      setSectionBusy((p) => ({ ...p, "security": true }));
      try {
        await refreshSecurityData();
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Unable to load security settings.", { title: "Load Error" });
      } finally {
        if (!cancelled) setSectionBusy((p) => ({ ...p, "security": false }));
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [activeTab, authPhase, user]);

  const openLeaveCreate = () => {
    setEditingLeaveReasonId(null);
    setLeaveReasonForm({ title: "", leave_type_id: "", subreasons: [""] });
    setLeaveReasonModalOpen(true);
  };

  const openLeaveEdit = (reason: LeaveReasonData) => {
    const sr = leaveSubreasons.filter((x) => x.reason === reason.id).map((x) => x.title);
    setEditingLeaveReasonId(reason.id);
    setLeaveReasonForm({ title: reason.title, leave_type_id: String(reason.leave_types[0] ?? ""), subreasons: sr.length ? sr : [""] });
    setLeaveReasonModalOpen(true);
  };

  const renderSectionBody = (section?: SectionDef) => {
    const activeSectionToRender = section ?? activeSection;
    if (!activeSectionToRender) return null;
    if (sectionBusy[activeSectionToRender.id]) return <TextShimmer className="text-xs">Loading section data...</TextShimmer>;

    if (activeSectionToRender.id === "general-group") {
      const canEditWorkdays = Boolean(user?.admin);
      const configuredHoursPerDay = Number(workdaySchedule.hours_per_day ?? 8);
      const hoursChanged = Math.abs(configuredHoursPerDay - savedHoursPerDay) > 0.001;
      const currentWeekdayDurations = workdayMode === "custom"
        ? customWeekdayDurations
        : normalizeWeekdayDurationMap(workdaySchedule.weekday_durations, workdaySchedule.workdays ?? [], configuredHoursPerDay);
      const currentEnabledWeekdays = workdayMode === "custom"
        ? customEnabledWeekdays
        : buildWeekdayEnabledMap(workdaySchedule.workdays ?? []);
      const customWorkdays = getEnabledWorkdays(currentEnabledWeekdays);
      const effectiveCustomDurations = Object.fromEntries(
        WEEKDAY_OPTIONS.map((option) => [
          String(option.value),
          currentEnabledWeekdays[String(option.value)] ? (currentWeekdayDurations[String(option.value)] ?? "0") : "0",
        ]),
      );
      const hasInvalidCustomDuration = WEEKDAY_OPTIONS.some((option) => {
        if (!currentEnabledWeekdays[String(option.value)]) return false;
        const raw = currentWeekdayDurations[String(option.value)] ?? "0";
        if (raw === "") return false;
        const parsed = Number(raw);
        return !Number.isFinite(parsed) || parsed < 0 || parsed > 24;
      });
      const savedCustomDurations = normalizeWeekdayDurationMap(savedWeekdayDurations, savedWorkdays, savedHoursPerDay);
      const workdayChanged = workdayMode !== savedWorkdayMode || (workdayMode === "custom" && (
        !sameWeekdayDurationMap(effectiveCustomDurations, savedCustomDurations)
        || !sameWeekdayEnabledMap(currentEnabledWeekdays, savedCustomEnabledWeekdays)
      ));
      const hasPositiveCustomDuration = customWorkdays.some((day) => Number(currentWeekdayDurations[String(day)] ?? "0") > 0);
      const canSaveWorkdayConfig = workdayMode === "custom"
        ? customWorkdays.length > 0 && hasPositiveCustomDuration && !hasInvalidCustomDuration
        : true;
      return (
        <div className="space-y-4">
          <SettingRow
            title="Company Regular Workday Configuration"
            description="Choose a preset schedule or switch to Custom to configure each weekday duration."
          >
            <div className="space-y-3 px-3">
              <ChoiceboxGroup
                direction="column"
                showLabel
                type="radio"
                value={workdayMode}
                onChange={(value: string) => {
                  if (!canEditWorkdays) return;
                  const next = WORKDAY_PRESET_OPTIONS.find((option) => option.value === value as WorkdayPresetValue);
                  if (!next) return;
                  if (next.value === "custom") {
                    setWorkdayMode("custom");
                    return;
                  }
                  setWorkdayMode(next.value);
                  setWorkdaySchedule((prev) => ({
                    ...prev,
                    workdays: next.workdays,
                    weekday_durations: buildWeekdayDurationMap(next.workdays, savedHoursPerDay),
                  }));
                }}
                disabled={!canEditWorkdays}
              >
                {WORKDAY_PRESET_OPTIONS.map((option) => (
                  <ChoiceboxGroup.Item
                    key={option.value}
                    value={option.value}
                    title={option.title}
                    description={option.description}
                  />
                ))}
              </ChoiceboxGroup>
              <AnimatePresence initial={false}>
                {workdayMode === "custom" && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)]/50 p-3"
                  >
                    <p className="text-xs font-normal text-[var(--color-text-muted)]">Select weekday durations</p>
                    <div className="space-y-2">
                      {WEEKDAY_OPTIONS.map((option) => {
                        const rawDuration = currentWeekdayDurations[String(option.value)] ?? "0";
                        const isSelected = Boolean(currentEnabledWeekdays[String(option.value)]);
                        return (
                          <div key={option.value} className="flex flex-col gap-2 px-3 sm:flex-row sm:items-center sm:justify-between">
                            <BasicCheckbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                if (!canEditWorkdays) return;
                                setCustomEnabledWeekdays((prev) => ({
                                  ...prev,
                                  [String(option.value)]: checked,
                                }));
                                if (checked) {
                                  setCustomWeekdayDurations((prev) => ({
                                    ...prev,
                                    [String(option.value)]: prev[String(option.value)] === "" ? formatDurationValue(savedHoursPerDay, "8") : prev[String(option.value)] ?? formatDurationValue(savedHoursPerDay, "8"),
                                  }));
                                }
                              }}
                              label={option.label}
                              disabled={!canEditWorkdays}
                              className="min-w-[10rem]"
                            />
                            <div className="w-full sm:w-36">
                              <Input
                                type="number"
                                min={0}
                                max={24}
                                step={0.5}
                                value={isSelected ? rawDuration : ""}
                                placeholder="Hours"
                                disabled={!canEditWorkdays || !isSelected}
                                onChange={(event) => {
                                  if (!canEditWorkdays) return;
                                  const nextValue = event.target.value;
                                  setCustomWeekdayDurations((prev) => ({
                                    ...prev,
                                    [String(option.value)]: nextValue === "" ? "" : formatDurationValue(nextValue, nextValue),
                                  }));
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* <p className="text-[11px] text-[var(--color-text-muted)]">Set a day to 0 hours to exclude it from the workweek.</p> */}
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence initial={false}>
                {workdayChanged && canEditWorkdays && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: 8, height: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        className="rounded-lg bg-[#2845D6] px-4 py-2 text-xs font-normal text-white disabled:opacity-50"
                        disabled={!canEditWorkdays || !canSaveWorkdayConfig}
                        onClick={() => void runAction("general-workday", async () => {
                          const weekdayDurationsToSave = workdayMode === "custom"
                            ? effectiveCustomDurations
                            : buildWeekdayDurationMap(workdaySchedule.workdays, savedHoursPerDay);
                          await mutateJson<WorkdayScheduleData>("/api/general-settings/workday-schedule", "PUT", {
                            workdays: workdayMode === "custom" ? customWorkdays : workdaySchedule.workdays,
                            weekday_durations: weekdayDurationsToSave,
                            hours_per_day: workdayMode === "custom"
                              ? Math.max(getMaxDurationValue(effectiveCustomDurations), savedHoursPerDay)
                              : savedHoursPerDay,
                          });
                          await fetchWorkdayScheduleData();
                        }, "Workday configuration updated.")}
                      >
                        {sectionBusy["general-workday"] ? (
                          <TextShimmer className="text-xs" duration={1.2}>Saving configuration...</TextShimmer>
                        ) : "Save Changes"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </SettingRow>

          <SettingRow
            title="Hours Per Day"
            description="Used when calculating leave balances and retroactively recalibrating stored leave hours."
          >
            <div className="space-y-3 px-3">
              <div className="ml-auto w-[100px] max-w-xs">
                <Input
                  type="number"
                  min={1}
                  step={0.5}
                  value={String(workdaySchedule.hours_per_day ?? 8)}
                  onChange={(e) => {
                    if (!canEditWorkdays) return;
                    const next = Number(e.target.value);
                    setWorkdaySchedule((prev) => ({
                      ...prev,
                      hours_per_day: Number.isFinite(next) && next > 0 ? next : prev.hours_per_day,
                    }));
                  }}
                  disabled={!canEditWorkdays}
                />
              </div>
              <AnimatePresence initial={false}>
                {hoursChanged && canEditWorkdays && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: 8, height: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        className="rounded-lg bg-[#2845D6] px-4 py-2 text-xs font-normal text-white disabled:opacity-50"
                        disabled={!canEditWorkdays || configuredHoursPerDay <= 0}
                        onClick={() => void runAction("general-hours", async () => {
                            await mutateJson<WorkdayScheduleData>("/api/general-settings/workday-schedule", "PUT", {
                              workdays: savedWorkdays,
                              hours_per_day: configuredHoursPerDay,
                            });
                            await fetchWorkdayScheduleData();
                          }, "Hours per day updated. Leave balances recalibrated.")}
                      >
                        {sectionBusy["general-hours"] ? (
                          <TextShimmer className="text-xs" duration={1.2}>Saving hours...</TextShimmer>
                        ) : "Save Changes"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </SettingRow>

          <GeneralEditableList
            title="Shifts"
            description="Maintain reusable shift templates for employee scheduling."
            items={shifts}
            canEdit={canEdit}
            getItemId={(item) => item.id}
            getItemName={(item) => item.name}
            getItemMeta={(item) => `${item.start_time} - ${item.end_time}`}
            createEmptyDraft={() => ({ name: "", start_time: "08:00", end_time: "17:00" })}
            createDraftFromItem={(item) => ({ name: item.name, start_time: item.start_time, end_time: item.end_time })}
            renderCreateFields={({ draft, setDraft, inputRef, disabled }) => (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input ref={inputRef} value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Shift name" disabled={disabled} wrapperClassName="flex-1" />
                <Input type="time" value={draft.start_time} onChange={(e) => setDraft((prev) => ({ ...prev, start_time: e.target.value }))} disabled={disabled} wrapperClassName="sm:w-32" />
                <Input type="time" value={draft.end_time} onChange={(e) => setDraft((prev) => ({ ...prev, end_time: e.target.value }))} disabled={disabled} wrapperClassName="sm:w-32" />
              </div>
            )}
            renderEditFields={({ draft, setDraft, inputRef, disabled }) => (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input ref={inputRef} value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Shift name" disabled={disabled} wrapperClassName="flex-1" />
                <Input type="time" value={draft.start_time} onChange={(e) => setDraft((prev) => ({ ...prev, start_time: e.target.value }))} disabled={disabled} wrapperClassName="sm:w-32" />
                <Input type="time" value={draft.end_time} onChange={(e) => setDraft((prev) => ({ ...prev, end_time: e.target.value }))} disabled={disabled} wrapperClassName="sm:w-32" />
              </div>
            )}
            isCreateValid={(draft) => draft.name.trim().length > 0}
            isEditValid={(draft) => draft.name.trim().length > 0}
            onCreate={(draft) => runAction("general-shifts", async () => {
              await mutateJson<ShiftData>("/api/general-settings/shifts", "POST", draft as unknown as JsonObject);
              await fetchShiftsData();
            }, "Shift added.")}
            onUpdate={(item, draft) => runAction("general-shifts", async () => {
              await mutateJson<ShiftData>(`/api/general-settings/shifts/${item.id}`, "PUT", draft as unknown as JsonObject);
              await fetchShiftsData();
            }, "Shift updated.")}
            onDelete={(item) => runAction("general-shifts", async () => {
              await mutateJson<void>(`/api/general-settings/shifts/${item.id}`, "DELETE");
              await fetchShiftsData();
            }, "Shift deleted.")}
            getDeleteTitle={(item) => `Delete Shift`}
            getDeleteMessage={(item) => `Delete "${item.name}"? This action cannot be undone.`}
          />

          <GeneralEditableList
            title="Offices"
            description="Manage the office locations available across the system."
            items={offices}
            canEdit={canEdit}
            getItemId={(item) => item.id}
            getItemName={(item) => item.name}
            createEmptyDraft={() => ({ name: "" })}
            createDraftFromItem={(item) => ({ name: item.name })}
            renderCreateFields={({ draft, setDraft, inputRef, disabled }) => (
              <Input ref={inputRef} value={draft.name} onChange={(e) => setDraft({ name: e.target.value })} placeholder="Office name" disabled={disabled} />
            )}
            renderEditFields={({ draft, setDraft, inputRef, disabled }) => (
              <Input ref={inputRef} value={draft.name} onChange={(e) => setDraft({ name: e.target.value })} placeholder="Office name" disabled={disabled} />
            )}
            isCreateValid={(draft) => draft.name.trim().length > 0}
            isEditValid={(draft) => draft.name.trim().length > 0}
            onCreate={(draft) => runAction("general-offices", async () => {
              await mutateJson<OfficeData>("/api/general-settings/offices", "POST", draft as unknown as JsonObject);
              await fetchOfficesData();
            }, "Office added.")}
            onUpdate={(item, draft) => runAction("general-offices", async () => {
              await mutateJson<OfficeData>(`/api/general-settings/offices/${item.id}`, "PUT", draft as unknown as JsonObject);
              await fetchOfficesData();
            }, "Office updated.")}
            onDelete={(item) => runAction("general-offices", async () => {
              await mutateJson<void>(`/api/general-settings/offices/${item.id}`, "DELETE");
              await fetchOfficesData();
            }, "Office deleted.")}
            getDeleteTitle={() => "Delete Office"}
            getDeleteMessage={(item) => `Delete "${item.name}"? This action cannot be undone.`}
          />

          <GeneralEditableList
            title="Departments"
            description="Organize teams by department and keep office assignments consistent."
            items={departments}
            canEdit={canEdit}
            getItemId={(item) => item.id}
            getItemName={(item) => item.name}
            getItemMeta={(item) => item.office_name}
            createEmptyDraft={() => ({ name: "", office: "" })}
            createDraftFromItem={(item) => ({ name: item.name, office: String(item.office) })}
            renderCreateFields={({ draft, setDraft, inputRef, disabled }) => (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input ref={inputRef} value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Department name" disabled={disabled} wrapperClassName="flex-1" />
                <div className="sm:w-52">
                  <Select value={draft.office} onValueChange={(value) => setDraft((prev) => ({ ...prev, office: value }))} disabled={disabled}>
                    <SelectTrigger><SelectValue placeholder="Select office" /></SelectTrigger>
                    <SelectContent>{offices.map((office) => <SelectItem key={office.id} value={String(office.id)}>{office.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}
            renderEditFields={({ draft, setDraft, inputRef, disabled }) => (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input ref={inputRef} value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Department name" disabled={disabled} wrapperClassName="flex-1" />
                <div className="sm:w-52">
                  <Select value={draft.office} onValueChange={(value) => setDraft((prev) => ({ ...prev, office: value }))} disabled={disabled}>
                    <SelectTrigger><SelectValue placeholder="Select office" /></SelectTrigger>
                    <SelectContent>{offices.map((office) => <SelectItem key={office.id} value={String(office.id)}>{office.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}
            isCreateValid={(draft) => draft.name.trim().length > 0 && draft.office.length > 0}
            isEditValid={(draft) => draft.name.trim().length > 0}
            onCreate={(draft) => runAction("general-departments", async () => {
              await mutateJson<DepartmentData>("/api/general-settings/departments", "POST", { name: draft.name, office: Number(draft.office) });
              await fetchDepartmentsData();
            }, "Department added.")}
            onUpdate={(item, draft) => runAction("general-departments", async () => {
              await mutateJson<DepartmentData>(`/api/general-settings/departments/${item.id}`, "PUT", { name: draft.name, office: Number(draft.office) });
              await fetchDepartmentsData();
            }, "Department updated.")}
            onDelete={(item) => runAction("general-departments", async () => {
              await mutateJson<void>(`/api/general-settings/departments/${item.id}`, "DELETE");
              await fetchDepartmentsData();
            }, "Department deleted.")}
            getDeleteTitle={() => "Delete Department"}
            getDeleteMessage={(item) => `Delete "${item.name}"? This action cannot be undone.`}
          />

          <GeneralEditableList
            title="Lines"
            description="Maintain production or reporting lines and their department links."
            items={lines}
            canEdit={canEdit}
            getItemId={(item) => item.id}
            getItemName={(item) => item.name}
            getItemMeta={(item) => item.department_name}
            createEmptyDraft={() => ({ name: "", department: "" })}
            createDraftFromItem={(item) => ({ name: item.name, department: String(item.department) })}
            renderCreateFields={({ draft, setDraft, inputRef, disabled }) => (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input ref={inputRef} value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Line name" disabled={disabled} wrapperClassName="flex-1" />
                <div className="sm:w-56">
                  <Select value={draft.department} onValueChange={(value) => setDraft((prev) => ({ ...prev, department: value }))} disabled={disabled}>
                    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>{departments.map((department) => <SelectItem key={department.id} value={String(department.id)}>{department.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}
            renderEditFields={({ draft, setDraft, inputRef, disabled }) => (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input ref={inputRef} value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Line name" disabled={disabled} wrapperClassName="flex-1" />
                <div className="sm:w-56">
                  <Select value={draft.department} onValueChange={(value) => setDraft((prev) => ({ ...prev, department: value }))} disabled={disabled}>
                    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>{departments.map((department) => <SelectItem key={department.id} value={String(department.id)}>{department.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}
            isCreateValid={(draft) => draft.name.trim().length > 0 && draft.department.length > 0}
            isEditValid={(draft) => draft.name.trim().length > 0}
            onCreate={(draft) => runAction("general-lines", async () => {
              await mutateJson<LineData>("/api/general-settings/lines", "POST", { name: draft.name, department: Number(draft.department) });
              await fetchLinesData();
            }, "Line added.")}
            onUpdate={(item, draft) => runAction("general-lines", async () => {
              await mutateJson<LineData>(`/api/general-settings/lines/${item.id}`, "PUT", { name: draft.name, department: Number(draft.department) });
              await fetchLinesData();
            }, "Line updated.")}
            onDelete={(item) => runAction("general-lines", async () => {
              await mutateJson<void>(`/api/general-settings/lines/${item.id}`, "DELETE");
              await fetchLinesData();
            }, "Line deleted.")}
            getDeleteTitle={() => "Delete Line"}
            getDeleteMessage={(item) => `Delete "${item.name}"? This action cannot be undone.`}
          />

          <GeneralEditableList
            title="Positions"
            description="Manage position titles and approval-level metadata used by the system."
            items={positions}
            canEdit={canEdit}
            getItemId={(item) => item.id}
            getItemName={(item) => item.name}
            getItemMeta={(item) => `Level ${item.level_of_approval}`}
            createEmptyDraft={() => ({ name: "", level_of_approval: "1" })}
            createDraftFromItem={(item) => ({ name: item.name, level_of_approval: String(item.level_of_approval) })}
            renderCreateFields={({ draft, setDraft, inputRef, disabled }) => (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input ref={inputRef} value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Position name" disabled={disabled} wrapperClassName="flex-1" />
                <Input type="number" min={1} value={draft.level_of_approval} onChange={(e) => setDraft((prev) => ({ ...prev, level_of_approval: e.target.value }))} placeholder="Approval level" disabled={disabled} wrapperClassName="sm:w-40" />
              </div>
            )}
            renderEditFields={({ draft, setDraft, inputRef, disabled }) => (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input ref={inputRef} value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Position name" disabled={disabled} wrapperClassName="flex-1" />
                <Input type="number" min={1} value={draft.level_of_approval} onChange={(e) => setDraft((prev) => ({ ...prev, level_of_approval: e.target.value }))} placeholder="Approval level" disabled={disabled} wrapperClassName="sm:w-40" />
              </div>
            )}
            isCreateValid={(draft) => draft.name.trim().length > 0}
            isEditValid={(draft) => draft.name.trim().length > 0}
            onCreate={(draft) => runAction("general-positions", async () => {
              await mutateJson<PositionData>("/api/general-settings/positions", "POST", { name: draft.name, level_of_approval: Number(draft.level_of_approval) });
              await fetchPositionsData();
            }, "Position added.")}
            onUpdate={(item, draft) => runAction("general-positions", async () => {
              await mutateJson<PositionData>(`/api/general-settings/positions/${item.id}`, "PUT", { name: draft.name, level_of_approval: Number(draft.level_of_approval) });
              await fetchPositionsData();
            }, "Position updated.")}
            onDelete={(item) => runAction("general-positions", async () => {
              await mutateJson<void>(`/api/general-settings/positions/${item.id}`, "DELETE");
              await fetchPositionsData();
            }, "Position deleted.")}
            getDeleteTitle={() => "Delete Position"}
            getDeleteMessage={(item) => `Delete "${item.name}"? This action cannot be undone.`}
          />

          <GeneralEditableList
            title="Employment Types"
            description="Keep available employment classifications up to date."
            items={employmentTypes}
            canEdit={canEdit}
            getItemId={(item) => item.id}
            getItemName={(item) => item.name}
            createEmptyDraft={() => ({ name: "" })}
            createDraftFromItem={(item) => ({ name: item.name })}
            renderCreateFields={({ draft, setDraft, inputRef, disabled }) => (
              <Input ref={inputRef} value={draft.name} onChange={(e) => setDraft({ name: e.target.value })} placeholder="Employment type name" disabled={disabled} />
            )}
            renderEditFields={({ draft, setDraft, inputRef, disabled }) => (
              <Input ref={inputRef} value={draft.name} onChange={(e) => setDraft({ name: e.target.value })} placeholder="Employment type name" disabled={disabled} />
            )}
            isCreateValid={(draft) => draft.name.trim().length > 0}
            isEditValid={(draft) => draft.name.trim().length > 0}
            onCreate={(draft) => runAction("general-employment-types", async () => {
              await mutateJson<EmploymentTypeData>("/api/general-settings/employment-types", "POST", draft as unknown as JsonObject);
              await fetchEmploymentTypesData();
            }, "Employment type added.")}
            onUpdate={(item, draft) => runAction("general-employment-types", async () => {
              await mutateJson<EmploymentTypeData>(`/api/general-settings/employment-types/${item.id}`, "PUT", draft as unknown as JsonObject);
              await fetchEmploymentTypesData();
            }, "Employment type updated.")}
            onDelete={(item) => runAction("general-employment-types", async () => {
              await mutateJson<void>(`/api/general-settings/employment-types/${item.id}`, "DELETE");
              await fetchEmploymentTypesData();
            }, "Employment type deleted.")}
            getDeleteTitle={() => "Delete Employment Type"}
            getDeleteMessage={(item) => `Delete "${item.name}"? This action cannot be undone.`}
          />
        </div>
      );
    }

    if (activeSectionToRender.id === "leave-reasons") {
      const cleanSubreasons = leaveReasonForm.subreasons.map((s) => s.trim()).filter(Boolean);
      const leaveReasonFormValid = leaveReasonForm.title.trim().length > 0 && leaveReasonForm.leave_type_id.length > 0 && cleanSubreasons.length > 0;
      const leaveTypeFormValid = newLeaveType.name.trim().length > 0;
      return (
        <>
          <div className="space-y-4">
            <SettingRow
              title="Leave Types"
              description="Manage the leave type definitions and policy flags used by leave requests."
            >
              <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
                <div className={GENERAL_LIST_SCROLL_CLASS}>
                  {leaveTypes.map((t) => editingLeaveTypeId === t.id ? (
                    <div key={t.id} className={cn(GENERAL_LIST_ROW_CLASS, "bg-[var(--color-bg-card)]")}>
                      <div className="min-w-0 flex-1 space-y-3">
                        <Input placeholder="Leave type name" value={editLeaveType.name} onChange={(e) => setEditLeaveType((prev) => ({ ...prev, name: e.target.value }))} disabled={Boolean(sectionBusy["leave-types-update"])} />
                        <div className="flex flex-wrap gap-3 justify-start [&_*]:!text-[11px]">
                          <BasicCheckbox checked={editLeaveType.has_balance} onCheckedChange={(v) => setEditLeaveType((prev) => ({ ...prev, has_balance: v }))} label="Has balance" disabled={Boolean(sectionBusy["leave-types-update"])} />
                          <BasicCheckbox checked={editLeaveType.deductible} onCheckedChange={(v) => setEditLeaveType((prev) => ({ ...prev, deductible: v }))} label="Deductible" disabled={Boolean(sectionBusy["leave-types-update"])} />
                          <BasicCheckbox checked={editLeaveType.requires_clinic_approval} onCheckedChange={(v) => setEditLeaveType((prev) => ({ ...prev, requires_clinic_approval: v }))} label="Needs clinic approval" disabled={Boolean(sectionBusy["leave-types-update"])} />
                          <BasicCheckbox checked={editLeaveType.is_active} onCheckedChange={(v) => setEditLeaveType((prev) => ({ ...prev, is_active: v }))} label="Active" disabled={Boolean(sectionBusy["leave-types-update"])} />
                        </div>
                      </div>
                      <div className="flex items-center gap-1 pt-0.5">
                        <button type="button" className={ACTION_ICON_BUTTON_CLASS} disabled={Boolean(sectionBusy["leave-types-update"]) || editLeaveType.name.trim().length === 0} onClick={() => void (async () => {
                          const ok = await runAction("leave-types-update", async () => {
                            await mutateJson<LeaveTypeData>(`/api/leave/admin/types/${t.id}`, "PATCH", editLeaveType as unknown as JsonObject);
                            await fetchLeaveTypesData();
                          }, "Leave type updated.");
                          if (ok) {
                            setEditingLeaveTypeId(null);
                            setEditLeaveType({ name: "", has_balance: false, deductible: false, requires_clinic_approval: false, is_active: true });
                          }
                        })()}>
                          {sectionBusy["leave-types-update"] ? <TextShimmer className="text-[10px]">Saving</TextShimmer> : <Check size={14} />}
                        </button>
                        <button type="button" className={DANGER_ICON_BUTTON_CLASS} disabled={Boolean(sectionBusy["leave-types-update"])} onClick={() => { setEditingLeaveTypeId(null); setEditLeaveType({ name: "", has_balance: false, deductible: false, requires_clinic_approval: false, is_active: true }); }}>
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ) : <div key={t.id} className={GENERAL_LIST_ROW_CLASS}><div className="min-w-0 flex-1"><p className="truncate text-xs font-normal text-[var(--color-text-primary)]">{t.name}</p><p className="truncate text-[11px] text-[var(--color-text-muted)]">{getLeaveTypeSummary(t)}</p></div>{canEdit && <button type="button" className={ACTION_ICON_BUTTON_CLASS} onClick={() => { setEditingLeaveTypeId(t.id); setEditLeaveType({ name: t.name, has_balance: t.has_balance, deductible: t.deductible, requires_clinic_approval: t.requires_clinic_approval, is_active: t.is_active }); setIsAddingLeaveType(false); }}><Pencil size={14} /></button>}{canEdit && <button type="button" className={DANGER_ICON_BUTTON_CLASS} onClick={() => setLeaveTypeDeleteTarget(t)}><Trash2 size={14} /></button>}</div>)}

                  <AnimatePresence initial={false}>
                    {isAddingLeaveType && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden border-[var(--color-border)] bg-[var(--color-bg-card)]/40 px-3 py-3"
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1 space-y-3">
                            <Input placeholder="Leave type name" value={newLeaveType.name} onChange={(e) => setNewLeaveType((p) => ({ ...p, name: e.target.value }))} disabled={sectionBusy["leave-types-create"]} />
                            <div className="flex flex-wrap gap-3 justify-start [&_*]:!text-[11px]">
                              <BasicCheckbox checked={newLeaveType.has_balance} onCheckedChange={(v) => setNewLeaveType((p) => ({ ...p, has_balance: v }))} label="Has balance" disabled={sectionBusy["leave-types-create"]} />
                              <BasicCheckbox checked={newLeaveType.deductible} onCheckedChange={(v) => setNewLeaveType((p) => ({ ...p, deductible: v }))} label="Deductible" disabled={sectionBusy["leave-types-create"]} />
                              <BasicCheckbox checked={newLeaveType.requires_clinic_approval} onCheckedChange={(v) => setNewLeaveType((p) => ({ ...p, requires_clinic_approval: v }))} label="Needs clinic approval" disabled={sectionBusy["leave-types-create"]} />
                              <BasicCheckbox checked={newLeaveType.is_active} onCheckedChange={(v) => setNewLeaveType((p) => ({ ...p, is_active: v }))} label="Active" disabled={sectionBusy["leave-types-create"]} />
                            </div>
                          </div>
                          <div className="flex items-center gap-1 pt-0.5">
                            <button type="button" className={ACTION_ICON_BUTTON_CLASS} disabled={sectionBusy["leave-types-create"] || !leaveTypeFormValid} onClick={() => void (async () => {
                              const ok = await runAction("leave-types-create", async () => {
                                await mutateJson<LeaveTypeData>("/api/leave/admin/types", "POST", newLeaveType as unknown as JsonObject);
                                setNewLeaveType({ name: "", has_balance: false, deductible: false, requires_clinic_approval: false, is_active: true });
                                await fetchLeaveTypesData();
                              }, "Leave type added.");
                              if (ok) setIsAddingLeaveType(false);
                            })()}>
                              {sectionBusy["leave-types-create"] ? <TextShimmer className="text-[10px]">Saving</TextShimmer> : <Check size={14} />}
                            </button>
                            <button type="button" className={DANGER_ICON_BUTTON_CLASS} disabled={sectionBusy["leave-types-create"]} onClick={() => { setIsAddingLeaveType(false); setNewLeaveType({ name: "", has_balance: false, deductible: false, requires_clinic_approval: false, is_active: true }); }}>
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {canEdit && (
                  <div className="border-t border-[var(--color-border)] px-3 py-1.5 flex justify-center">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-accent)]"
                      onClick={() => setIsAddingLeaveType(true)}
                    >
                      <Plus size={12} /> Add More
                    </button>
                  </div>
                )}
              </div>
            </SettingRow>

            <SettingRow
              title="Leave Reasons"
              description="Maintain the reason catalog and its subreasons for leave filing flows."
            >
              <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
                <div className={GENERAL_LIST_SCROLL_CLASS}>
                  {leaveReasons.map((reason) => (
                    <div key={reason.id} className={GENERAL_LIST_ROW_CLASS}>
                      <div className="min-w-0 flex-1"><p className="truncate font-medium text-[var(--color-text-primary)]">{reason.title}</p><p className="truncate text-[11px] text-[var(--color-text-muted)]">{leaveSubreasons.filter((s) => s.reason === reason.id).map((s) => s.title).join(", ") || "No subreasons"}</p></div>
                      {canEdit && <button type="button" className={ACTION_ICON_BUTTON_CLASS} onClick={() => openLeaveEdit(reason)}><Pencil size={14} /></button>}
                      {canEdit && <button type="button" className={DANGER_ICON_BUTTON_CLASS} onClick={() => setLeaveReasonDeleteTarget(reason)}><Trash2 size={14} /></button>}
                    </div>
                  ))}
                </div>
                {canEdit && (
                  <div className="border-t border-[var(--color-border)] px-3 py-1.5 flex justify-center">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-accent)]"
                      onClick={openLeaveCreate}
                    >
                      <Plus size={12} /> Add More
                    </button>
                  </div>
                )}
              </div>
            </SettingRow>
          </div>

          <Modal open={leaveReasonModalOpen} onOpenChange={setLeaveReasonModalOpen} mobileVariant="dialog">
            <ModalContent className="max-w-md">
              <ModalHeader><ModalTitle>{editingLeaveReasonId ? "Edit Leave Reason" : "Create Leave Reason"}</ModalTitle></ModalHeader>
              <ModalBody className="space-y-2 py-4">
                <TextareaWithCharactersLeft label="Leave reason" maxLength={200} value={leaveReasonForm.title} onChange={(e) => setLeaveReasonForm((p) => ({ ...p, title: e.target.value }))} disabled={!canEdit} />
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Leave type</label>
                  <Select value={leaveReasonForm.leave_type_id} onValueChange={(v) => setLeaveReasonForm((p) => ({ ...p, leave_type_id: v }))} disabled={!canEdit}>
                    <SelectTrigger><SelectValue placeholder="Select leave type" /></SelectTrigger>
                    <SelectContent>{leaveTypes.map((t) =>
                      <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Subreasons</p>
                  <div className="max-h-56 space-y-2 overflow-y-auto">{leaveReasonForm.subreasons.map((s, i) => <div key={`sub-${i}`} className="flex items-center gap-2">
                    <Input value={s} onChange={(e) => setLeaveReasonForm((p) => ({ ...p, subreasons: p.subreasons.map((x, idx) => idx === i ? e.target.value : x) }))} wrapperClassName="flex-1" />
                    <button type="button" className={DANGER_ICON_BUTTON_CLASS} onClick={() => setLeaveReasonForm((p) => ({ ...p, subreasons: p.subreasons.length > 1 ? p.subreasons.filter((_, idx) => idx !== i) : p.subreasons }))}>
                      <Trash2 size={14} />
                    </button>
                    </div>)}
                    </div>
                    <button type="button" className="inline-flex items-center gap-1 px-3 text-[12px] hover:text-[var(--color-accent)]" onClick={() => setLeaveReasonForm((p) => ({ ...p, subreasons: [...p.subreasons, ""] }))}>
                      <Plus size={12} />Add more
                    </button>
                  </div>
              </ModalBody>
              <ModalFooter>
                <button type="button" className="rounded-md border border-[var(--color-border)] px-4 py-2 text-xs font-normal" onClick={() => setLeaveReasonModalOpen(false)}>Cancel</button>
                <button type="button" className="flex items-center gap-1 rounded-lg bg-[#2845D6] px-4 py-2 text-xs font-normal text-white disabled:opacity-50" disabled={!canEdit || !leaveReasonFormValid || sectionBusy["leave-reasons-modal"]} onClick={() => void (async () => {
                  const isEditing = Boolean(editingLeaveReasonId);
                  await runAction("leave-reasons-modal", async () => {
                    const payload = { title: leaveReasonForm.title.trim(), leave_types: [Number(leaveReasonForm.leave_type_id)] };
                    let reasonId = editingLeaveReasonId;
                    if (reasonId) await mutateJson<LeaveReasonData>(`/api/leave/admin/reasons/${reasonId}`, "PATCH", payload);
                    else reasonId = (await mutateJson<LeaveReasonData>("/api/leave/admin/reasons", "POST", payload)).id;
                    if (!reasonId) return;
                    const current = leaveSubreasons.filter((x) => x.reason === reasonId);
                    for (let i = 0; i < cleanSubreasons.length; i += 1) {
                      if (current[i]) await mutateJson<LeaveSubreasonData>(`/api/leave/admin/subreasons/${current[i].id}`, "PATCH", { title: cleanSubreasons[i] });
                      else await mutateJson<LeaveSubreasonData>("/api/leave/admin/subreasons", "POST", { reason: reasonId, title: cleanSubreasons[i] });
                    }
                    for (const extra of current.slice(cleanSubreasons.length)) await mutateJson<void>(`/api/leave/admin/subreasons/${extra.id}`, "DELETE");
                    setLeaveReasonModalOpen(false);
                    await refreshLeaveReasonCatalogData();
                  }, isEditing ? "Leave reason updated." : "Leave reason created.");
                })()}>{sectionBusy["leave-reasons-modal"] ? <TextShimmer className="text-xs">Saving...</TextShimmer> : <><Check size={13} className="mr-1" />{editingLeaveReasonId ? "Save changes" : "Create reason"}</>}</button>
              </ModalFooter>
            </ModalContent>
          </Modal>

          <AnimatePresence>
            {leaveTypeDeleteTarget && (
              <ConfirmationModal
                title="Delete Leave Type"
                message={`Delete "${leaveTypeDeleteTarget.name}"? This action cannot be undone.`}
                confirmLabel="Delete"
                confirming={Boolean(sectionBusy["leave-types-delete"])}
                onConfirm={() => void runAction("leave-types-delete", async () => {
                  await mutateJson<void>(`/api/leave/admin/types/${leaveTypeDeleteTarget.id}`, "DELETE");
                  await fetchLeaveTypesData();
                  setLeaveTypeDeleteTarget(null);
                }, "Leave type removed.")}
                onCancel={() => !sectionBusy["leave-types-delete"] && setLeaveTypeDeleteTarget(null)}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {leaveReasonDeleteTarget && (
              <ConfirmationModal
                title="Delete Leave Reason"
                message={`Delete "${leaveReasonDeleteTarget.title}"? This action cannot be undone.`}
                confirmLabel="Delete"
                confirming={Boolean(sectionBusy["leave-reasons-delete"])}
                onConfirm={() => void (async () => {
                  await runAction("leave-reasons-delete", async () => {
                    await mutateJson<void>(`/api/leave/admin/reasons/${leaveReasonDeleteTarget.id}`, "DELETE");
                    await refreshLeaveReasonCatalogData();
                    setLeaveReasonDeleteTarget(null);
                  }, "Leave reason removed.");
                })()}
                onCancel={() => !sectionBusy["leave-reasons-delete"] && setLeaveReasonDeleteTarget(null)}
              />
            )}
          </AnimatePresence>
        </>
      );
    }

    if (activeSectionToRender.id === "evaluation-frequency") {
      const evalChanged = evaluationSettings?.frequency !== savedEvaluationFrequency;
      return (
        <SettingRow
          title="Evaluation Frequency"
          description="Choose how often the system runs employee evaluation cycles."
        >
          <div className="space-y-3 pb-3">
            <ChoiceboxGroup direction="row" showLabel type="radio" value={evaluationSettings?.frequency ?? "quarterly"} onChange={(value: string) => setEvaluationSettings((p) => (p ? { ...p, frequency: value as "monthly" | "quarterly" } : p))} disabled={!canEdit}><ChoiceboxGroup.Item value="quarterly" title="Quarterly" description="4 evaluation cycles per fiscal year" /><ChoiceboxGroup.Item value="monthly" title="Monthly" description="12 evaluation cycles per fiscal year" /></ChoiceboxGroup>
            <AnimatePresence initial={false}>
              {canEdit && evalChanged && (
                <motion.div
                  initial={{ opacity: 0, y: 8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: 8, height: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="flex justify-end pt-1">
                    <button className="inline-flex items-center gap-1.5 rounded-lg bg-[#2845D6] px-4 py-2 text-xs font-normal text-white disabled:opacity-50" disabled={sectionBusy["evaluation-frequency"]} onClick={() => void (async () => {
                      await runAction("evaluation-frequency", async () => {
                        if (!evaluationSettings) return;
                        const saved = await mutateJson<EvaluationSettingsData>("/api/employee-eval/settings", "PUT", { frequency: evaluationSettings.frequency });
                        setEvaluationSettings(saved);
                        setSavedEvaluationFrequency(saved.frequency);
                      }, "Evaluation frequency saved.");
                    })()}>
                      {sectionBusy["evaluation-frequency"] ? <TextShimmer className="text-xs" duration={1.2}>Saving...</TextShimmer> : <><Check size={13} />Save Changes</>}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </SettingRow>
      );
    }

    if (activeSectionToRender.id === "leave-routing") {
      return (
        <>
          <SettingRow
            title="Leave Routing"
            description="Configure leave routing approval rules."
          >
            <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
              <div className={GENERAL_LIST_SCROLL_CLASS}>
                {leaveRoutingRules.map((rule) => (
                  <div key={rule.id} className={GENERAL_LIST_ROW_CLASS}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-[var(--color-text-primary)]">{rule.description || "(No description)"}</p>
                      <p className="truncate text-[11px] text-[var(--color-text-muted)]">{rule.positions.length > 0 ? rule.positions.join(", ") : "All positions"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold",
                        rule.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
                      )}>
                        {rule.is_active ? "Active" : "Inactive"}
                      </span>
                      {canEdit && (
                        <>
                          <button type="button" className={ACTION_ICON_BUTTON_CLASS} onClick={() => {
                            setLeaveRoutingEditTarget(rule);
                            setLeaveRoutingModalOpen(true);
                          }}>
                            <Pencil size={14} />
                          </button>
                          <button type="button" className={DANGER_ICON_BUTTON_CLASS} onClick={() => setLeaveRoutingDeleteTarget(rule)}>
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {canEdit && (
                <div className="border-t border-[var(--color-border)] px-3 py-1.5 flex justify-center">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-accent)]"
                    onClick={() => {
                      setLeaveRoutingEditTarget(null);
                      setLeaveRoutingModalOpen(true);
                    }}
                  >
                    <Plus size={12} /> Add More
                  </button>
                </div>
              )}
            </div>
          </SettingRow>

          <Modal open={leaveRoutingModalOpen} onOpenChange={setLeaveRoutingModalOpen} mobileVariant="dialog">
            <ModalContent className="max-w-3xl">
              <ModalHeader>
                <ModalTitle>{leaveRoutingEditTarget ? "Edit Leave Routing Rule" : "Add Leave Routing Rule"}</ModalTitle>
              </ModalHeader>
              <ModalBody className="min-h-[8rem]">
                <div className="text-sm text-[var(--color-text-muted)]">
                  {leaveRoutingEditTarget
                    ? `Edit routing rule for ${leaveRoutingEditTarget.description || "(no description)"}.`
                    : "Create a new leave routing rule in the admin interface."}
                </div>
              </ModalBody>
              <ModalFooter>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md bg-[#2845D6] px-4 py-2 text-xs font-normal text-white "
                  onClick={() => setLeaveRoutingModalOpen(false)}
                >
                  Close
                </button>
              </ModalFooter>
            </ModalContent>
          </Modal>

          <AnimatePresence>
            {leaveRoutingDeleteTarget && (
              <ConfirmationModal
                title="Delete Leave Routing Rule"
                message={`Delete the routing rule "${leaveRoutingDeleteTarget.description || "(No description)"}"? This action cannot be undone.`}
                confirmLabel="Delete"
                confirming={Boolean(sectionBusy["leave-routing-delete"])}
                onConfirm={() => void runAction("leave-routing-delete", async () => {
                  await mutateJson<void>(`/api/leave/admin/routing-rules/${leaveRoutingDeleteTarget.id}`, "DELETE");
                  await fetchLeaveRoutingRules();
                  setLeaveRoutingDeleteTarget(null);
                }, "Leave routing rule removed.")}
                onCancel={() => !sectionBusy["leave-routing-delete"] && setLeaveRoutingDeleteTarget(null)}
              />
            )}
          </AnimatePresence>
        </>
      );
    }

    if (activeSectionToRender.id === "evaluation-routing") {
      return (
        <>
          <SettingRow
            title="Evaluation Routing"
            description="Configure evaluation approval routing rules."
          >
            <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
              <div className={GENERAL_LIST_SCROLL_CLASS}>
                {evaluationRoutingRules.map((rule) => (
                  <div key={rule.id} className={GENERAL_LIST_ROW_CLASS}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-[var(--color-text-primary)]">{rule.description || "(No description)"}</p>
                      <p className="truncate text-[11px] text-[var(--color-text-muted)]">{rule.positions.length > 0 ? rule.positions.join(", ") : "All positions"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold",
                        rule.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
                      )}>
                        {rule.is_active ? "Active" : "Inactive"}
                      </span>
                      {canEdit && (
                        <>
                          <button type="button" className={ACTION_ICON_BUTTON_CLASS} onClick={() => {
                            setEvaluationRoutingEditTarget(rule);
                            setEvaluationRoutingRuleDraft(buildLeaveRoutingRuleDraft(rule, positions, departments));
                            setEvaluationRoutingModalOpen(true);
                          }}>
                            <Pencil size={14} />
                          </button>
                          <button type="button" className={DANGER_ICON_BUTTON_CLASS} onClick={() => setEvaluationRoutingDeleteTarget(rule)}>
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {canEdit && (
                <div className="border-t border-[var(--color-border)] px-3 py-1.5 flex justify-center">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-accent)]"
                    onClick={() => {
                      setEvaluationRoutingEditTarget(null);
                      setEvaluationRoutingRuleDraft(createLeaveRoutingRuleDraft());
                      setEvaluationRoutingModalOpen(true);
                    }}
                  >
                    <Plus size={12} /> Add More
                  </button>
                </div>
              )}
            </div>
          </SettingRow>

          <Modal open={evaluationRoutingModalOpen} onOpenChange={setEvaluationRoutingModalOpen} mobileVariant="dialog">
            <ModalContent className="max-w-3xl">
              <ModalHeader>
                <ModalTitle>{evaluationRoutingEditTarget ? "Edit Evaluation Routing Rule" : "Add Evaluation Routing Rule"}</ModalTitle>
              </ModalHeader>
              <ModalBody className="space-y-4">
                <div className="grid gap-3">
                  <Input
                    label="Rule Title"
                    value={evaluationRoutingRuleDraft.description}
                    onChange={(e) => updateEvaluationRoutingRuleDraft({ description: e.target.value })}
                    placeholder="Type routing rule title"
                  />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-[var(--color-text-primary)]">Requester positions</p>
                        <p className="text-[11px] font-normal text-[var(--color-text-muted)]">Choose the requestor positions that this routing rule applies to.</p>
                      </div>
                      <span className="rounded-full bg-[#2845D6]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2845D6] whitespace-nowrap">
                        {evaluationRoutingRuleDraft.position_ids.length} selected
                      </span>
                    </div>
                    <div className="mt-4">
                      <MultiSelectCombobox
                        className="text-xs focus:outline-none focus:ring-0 focus:border-[var(--color-border)] focus-visible:ring-0 focus-visible:outline-none !ring-0"
                        options={positions.map((p) => ({ value: String(p.id), label: formatPositionOption(p) }))}
                        selected={evaluationRoutingRuleDraft.position_ids.map(String)}
                        onChange={(vals) => updateEvaluationRoutingRuleDraft({ position_ids: vals.map(Number).filter(Number.isFinite) })}
                        placeholder="Select positions"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-[var(--color-text-primary)]">Departments</p>
                        <p className="text-[11px] font-normal text-[var(--color-text-muted)]">Select departments for the routing rule, or leave empty to apply across all departments.</p>
                      </div>
                      <span className="rounded-full bg-[#2845D6]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2845D6] whitespace-nowrap">
                        {evaluationRoutingRuleDraft.department_ids.length} selected
                      </span>
                    </div>
                    <div className="mt-4">
                      <MultiSelectCombobox
                        className="text-xs focus:outline-none focus:ring-0 focus:border-[var(--color-border)] focus-visible:ring-0 focus-visible:outline-none !ring-0"
                        options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
                        selected={evaluationRoutingRuleDraft.department_ids.map(String)}
                        onChange={(vals) => updateEvaluationRoutingRuleDraft({ department_ids: vals.map(Number).filter(Number.isFinite) })}
                        placeholder="Select departments"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">Approval steps</p>
                      <p className="text-[10px] font-normal text-[var(--color-text-muted)]">Each step is executed in order. Choose the approver positions for every step.</p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-lg bg-[#2845D6] px-4 py-1.5 text-xs font-normal text-white transition-colors hover:bg-[#1f3eb5]"
                      onClick={addEvaluationRoutingStep}
                    >
                      <Plus size={14} /> Add step
                    </button>
                  </div>

                  <div className="mt-4">
                    <AnimatePresence initial={false}>
                      {evaluationRoutingRuleDraft.steps.map((step, index) => (
                        <motion.div
                          key={step.id}
                          layout
                          initial={{ opacity: 0, y: -8, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: "auto" }}
                          exit={{ opacity: 0, y: -8, height: 0 }}
                          transition={{ duration: 0.18, ease: "easeOut" }}
                          className={cn(
                            "overflow-hidden py-4",
                            index > 0 && "border-t border-[var(--color-border)]"
                          )}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="inline-flex items-center gap-2 rounded-full bg-[#2845D6]/10 px-3 py-0.5 text-[11px] font-medium text-[#2845D6]">
                                Step {index + 1}
                              </div>
                            </div>
                            {evaluationRoutingRuleDraft.steps.length > 1 && (
                              <button
                                type="button"
                                className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                                onClick={() => removeEvaluationRoutingStep(step.id)}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>

                          <div className="mt-2 grid gap-1">
                            <MultiSelectCombobox
                              className="text-xs focus:outline-none focus:ring-0 focus:border-[var(--color-border)] focus-visible:ring-0 focus-visible:outline-none !ring-0"
                              options={positions.map((p) => ({ value: String(p.id), label: formatPositionOption(p) }))}
                              selected={step.position_ids.map(String)}
                              onChange={(vals) => updateEvaluationRoutingStep(step.id, { position_ids: vals.map(Number).filter(Number.isFinite) })}
                              placeholder="Choose approver positions"
                            />
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>

                  <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">The step order is assigned automatically from top to bottom. The first matching approver position in each step is used during routing.</p>
                </div>
              </ModalBody>
              <ModalFooter className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2 text-xs font-normal text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]"
                  onClick={() => setEvaluationRoutingModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-normal text-white",
                    evaluationRoutingCanSave ? "bg-[#2845D6] hover:bg-[#1f3eb5]" : "bg-[#2845D6] disabled:opacity-50 cursor-not-allowed"
                  )}
                  onClick={() => {
                    if (!evaluationRoutingCanSave || sectionBusy["evaluation-routing-save"]) return;
                    void runAction("evaluation-routing-save", async () => {
                      const payload = {
                        description: evaluationRoutingRuleDraft.description.trim(),
                        position_ids: evaluationRoutingRuleDraft.position_ids,
                        department_ids: evaluationRoutingRuleDraft.department_ids,
                        steps: evaluationRoutingRuleDraft.steps.map((s) => ({ position_ids: s.position_ids })),
                        module: "employee_evaluation",
                      };
                      if (evaluationRoutingEditTarget) {
                        await mutateJson(`/api/employee-eval/admin/routing-rules/${evaluationRoutingEditTarget.id}`, "PUT", payload);
                      } else {
                        await mutateJson(`/api/employee-eval/admin/routing-rules`, "POST", payload);
                      }
                      await fetchEvaluationRoutingRules();
                      setEvaluationRoutingModalOpen(false);
                    }, evaluationRoutingEditTarget ? "Employee evaluation routing rule updated." : "Employee evaluation routing rule created.");
                  }}
                  disabled={!evaluationRoutingCanSave || Boolean(sectionBusy["evaluation-routing-save"])}
                >
                  {sectionBusy["evaluation-routing-save"] ? <TextShimmer className="text-xs" duration={1.2}>Saving...</TextShimmer> : <><Check size={14} /> Save rule</>}
                </button>
              </ModalFooter>
            </ModalContent>
          </Modal>

          <AnimatePresence>
            {evaluationRoutingDeleteTarget && (
              <ConfirmationModal
                title="Delete Employee Evaluation Routing Rule"
                message={`Delete the routing rule "${evaluationRoutingDeleteTarget.description || "(No description)"}"? This action cannot be undone.`}
                confirmLabel="Delete"
                confirming={Boolean(sectionBusy["evaluation-routing-delete"])}
                onConfirm={() => void runAction("evaluation-routing-delete", async () => {
                  await mutateJson<void>(`/api/employee-eval/admin/routing-rules/${evaluationRoutingDeleteTarget.id}`, "DELETE");
                  await fetchEvaluationRoutingRules();
                  setEvaluationRoutingDeleteTarget(null);
                }, "Employee evaluation routing rule removed.")}
                onCancel={() => !sectionBusy["evaluation-routing-delete"] && setEvaluationRoutingDeleteTarget(null)}
              />
            )}
          </AnimatePresence>
        </>
      );
    }

    return null;
  };

  const openMemoAdvertisementEdit = (memo: MemoAdvertisementData) => {
    setMemoAdvertisementEditingId(memo.id);
    setMemoAdvertisementForm({ title: memo.title, description: memo.description });
    setMemoAdvertisementModalOpen(true);
  };

  const resetMemoAdvertisementForm = () => {
    setMemoAdvertisementEditingId(null);
    setMemoAdvertisementForm({ title: "", description: "" });
  };

  const renderMemoAdvertisementContent = () => {
    if (sectionBusy["memo-advertisement"]) {
      return <TextShimmer className="text-xs">Loading memo advertisement settings...</TextShimmer>;
    }

    const canEdit = Boolean(user?.admin);
    const memoFormValid = memoAdvertisementForm.title.trim().length > 0 && memoAdvertisementForm.description.trim().length > 0;

    return (
      <div className="space-y-6">
        <SettingRow
          title="Enable Advertisement"
          description="Toggle whether active memos are shown to users across the system."
        >
          <div className="flex justify-end">
            <BasicCheckbox
              checked={memoAdvertisementEnabled}
              onCheckedChange={async (checked) => {
                if (!canEdit) return;
                const next = Boolean(checked);
                setMemoAdvertisementEnabled(next);
                const ok = await runAction("memo-advertisement-toggle", async () => {
                  const saved = await mutateJson<MemoAdvertisementSettingsData>("/api/general-settings/memo-advertisement", "PUT", { enabled: next });
                  setMemoAdvertisementEnabled(saved.enabled);
                }, next ? "Advertisement enabled." : "Advertisement disabled.");
                if (!ok) setMemoAdvertisementEnabled(!next);
              }}
              label="Enabled"
              disabled={!canEdit || Boolean(sectionBusy["memo-advertisement-toggle"])}
            />
          </div>
        </SettingRow>

        <SettingRow
          title="Memo List"
          description="Create and manage memos for user display."
        >
          <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <div className={GENERAL_LIST_SCROLL_CLASS}>
              <AnimatePresence initial={false}>
                {memoAdvertisementMemos.map((memo) => (
                  <motion.div
                    key={memo.id}
                    layout
                    initial={{ opacity: 0, y: -8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: -8, height: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className={cn(GENERAL_LIST_ROW_CLASS, "items-start")}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-xs font-normal text-[var(--color-text-primary)]">{memo.title}</p>
                      <p className="text-[11px] text-[var(--color-text-muted)]">{truncateText(memo.description, 80)}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      {canEdit && (
                        <button type="button" className={ACTION_ICON_BUTTON_CLASS} onClick={() => openMemoAdvertisementEdit(memo)}>
                          <Pencil size={14} />
                        </button>
                      )}
                      {canEdit && (
                        <button type="button" className={DANGER_ICON_BUTTON_CLASS} onClick={() => setMemoAdvertisementDeleteTarget(memo)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            {canEdit && (
              <div className="border-t border-[var(--color-border)] px-3 py-1.5 flex justify-center">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-accent)]"
                  onClick={() => {
                    resetMemoAdvertisementForm();
                    setMemoAdvertisementModalOpen(true);
                  }}
                >
                  <Plus size={12} /> Add More
                </button>
              </div>
            )}
          </div>
        </SettingRow>

          <Modal
            open={memoAdvertisementModalOpen}
            onOpenChange={(open) => {
              if (!open) resetMemoAdvertisementForm();
              setMemoAdvertisementModalOpen(open);
            }}
            mobileVariant="dialog"
          >
            <ModalContent className="max-w-md">
              <ModalHeader>
                <ModalTitle>{memoAdvertisementEditingId ? "Edit Memo" : "Add Memo"}</ModalTitle>
              </ModalHeader>
              <ModalBody className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Title</label>
                  <Input
                    value={memoAdvertisementForm.title}
                    onChange={(e) => setMemoAdvertisementForm((prev) => ({ ...prev, title: e.target.value }))}
                    disabled={!canEdit}
                  />
                </div>
                <TextareaWithCharactersLeft
                  label="Description"
                  maxLength={10000}
                  value={memoAdvertisementForm.description}
                  onChange={(e) => setMemoAdvertisementForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={!canEdit}
                />
              </ModalBody>
              <ModalFooter className="flex justify-end gap-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2 text-xs font-normal text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]"
                  onClick={() => {
                    setMemoAdvertisementModalOpen(false);
                    resetMemoAdvertisementForm();
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-normal text-white",
                    memoFormValid ? "bg-[#2845D6] hover:bg-[#1f3eb5]" : "bg-[#2845D6] disabled:opacity-50 cursor-not-allowed"
                  )}
                  disabled={!canEdit || !memoFormValid || Boolean(sectionBusy["memo-advertisement-save"])}
                  onClick={async () => {
                    if (!memoFormValid || sectionBusy["memo-advertisement-save"]) return;
                    const ok = await runAction("memo-advertisement-save", async () => {
                      const payload = {
                        title: memoAdvertisementForm.title.trim(),
                        description: memoAdvertisementForm.description.trim(),
                        active: true,
                      };
                      if (memoAdvertisementEditingId) {
                        const updated = await mutateJson<MemoAdvertisementData>(`/api/general-settings/memo-advertisement/memos/${memoAdvertisementEditingId}`, "PATCH", payload);
                        setMemoAdvertisementMemos((prev) => prev.map((item) => item.id === updated.id ? updated : item));
                      } else {
                        const created = await mutateJson<MemoAdvertisementData>("/api/general-settings/memo-advertisement/memos", "POST", payload);
                        setMemoAdvertisementMemos((prev) => [...prev, created]);
                      }
                      setMemoAdvertisementModalOpen(false);
                      resetMemoAdvertisementForm();
                    }, memoAdvertisementEditingId ? "Memo updated." : "Memo created.");
                    if (!ok) {
                      // keep modal open for retry
                    }
                  }}
                >
                  {sectionBusy["memo-advertisement-save"] ? <TextShimmer className="text-xs">Saving...</TextShimmer> : <><Check size={13} />{memoAdvertisementEditingId ? "Save changes" : "Create memo"}</>}
                </button>
              </ModalFooter>
            </ModalContent>
          </Modal>

          <AnimatePresence>
            {memoAdvertisementDeleteTarget && (
              <ConfirmationModal
                title="Delete Memo"
                message={`Delete "${memoAdvertisementDeleteTarget.title}"? This action cannot be undone.`}
                confirmLabel="Delete"
                confirming={Boolean(sectionBusy["memo-advertisement-delete"])}
                onConfirm={() => void runAction("memo-advertisement-delete", async () => {
                  await mutateJson<void>(`/api/general-settings/memo-advertisement/memos/${memoAdvertisementDeleteTarget.id}`, "DELETE");
                  setMemoAdvertisementMemos((prev) => prev.filter((item) => item.id !== memoAdvertisementDeleteTarget.id));
                  setMemoAdvertisementDeleteTarget(null);
                }, "Memo deleted.")}
                onCancel={() => !sectionBusy["memo-advertisement-delete"] && setMemoAdvertisementDeleteTarget(null)}
              />
            )}
          </AnimatePresence>

          {/* ── System Feedback ─────────────────────────────── */}
          <div className="border-t border-[var(--color-border)] pt-6 space-y-6">

            <SettingRow
              title="Enable Feedback"
              description="When enabled, a feedback modal is shown to all non-admin users once per session (and reappears next month if not yet submitted for that month)."
            >
              <div className="flex justify-end">
                <BasicCheckbox
                  checked={feedbackEnabled}
                  onCheckedChange={async (checked) => {
                    if (!canEdit) return;
                    const next = Boolean(checked);
                    setFeedbackEnabled(next);
                    const ok = await runAction("feedback-toggle", async () => {
                      const saved = await mutateJson<FeedbackSettingsData>("/api/feedback/settings", "PUT", { target: "feedback", enabled: next });
                      setFeedbackEnabled(saved.feedback_enabled);
                    }, next ? "Feedback enabled." : "Feedback disabled.");
                    if (!ok) setFeedbackEnabled(!next);
                  }}
                  label="Enabled"
                  disabled={!canEdit || Boolean(sectionBusy["feedback-toggle"])}
                />
              </div>
            </SettingRow>

          </div>

          {/* ── System Updates ──────────────────────────────── */}
          <div className="space-y-6">

            <SettingRow
              title="Enable Updates"
              description="When enabled, a What's New modal is shown to all non-admin users for each update they have not yet acknowledged."
            >
              <div className="flex justify-end">
                <BasicCheckbox
                  checked={updatesEnabled}
                  onCheckedChange={async (checked) => {
                    if (!canEdit) return;
                    const next = Boolean(checked);
                    setUpdatesEnabled(next);
                    const ok = await runAction("updates-toggle", async () => {
                      const saved = await mutateJson<FeedbackSettingsData>("/api/feedback/settings", "PUT", { target: "updates", enabled: next });
                      setUpdatesEnabled(saved.updates_enabled);
                    }, next ? "Updates enabled." : "Updates disabled.");
                    if (!ok) setUpdatesEnabled(!next);
                  }}
                  label="Enabled"
                  disabled={!canEdit || Boolean(sectionBusy["updates-toggle"])}
                />
              </div>
            </SettingRow>

            <SettingRow
              title="Updates List"
              description="Manage system update entries shown in the What's New modal."
            >
              <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
                <div className={GENERAL_LIST_SCROLL_CLASS}>
                  {systemUpdates.length === 0 && (
                    <div className="px-3 py-4 text-center text-[11px] text-[var(--color-text-muted)]">
                      No updates yet.
                    </div>
                  )}
                  <AnimatePresence initial={false}>
                    {systemUpdates.map((update) => (
                      <motion.div
                        key={update.id}
                        layout
                        initial={{ opacity: 0, y: -8, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -8, height: 0 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className={cn(GENERAL_LIST_ROW_CLASS, "items-start")}
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="text-xs font-bold text-[var(--color-text-primary)]">v{update.version}</p>
                          <p className="text-[11px] text-[var(--color-text-muted)]">{truncateText(update.description, 80)}</p>
                          <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
                            {new Date(update.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                          </p>
                        </div>
                        <div className="flex items-start gap-2 pt-0.5">
                          {canEdit && (
                            <button
                              type="button"
                              className={ACTION_ICON_BUTTON_CLASS}
                              onClick={() => {
                                setUpdateEditingId(update.id);
                                setUpdateForm({ version: update.version, description: update.description });
                                setUpdateModalOpen(true);
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              className={DANGER_ICON_BUTTON_CLASS}
                              onClick={() => setUpdateDeleteTarget(update)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                {canEdit && (
                  <div className="border-t border-[var(--color-border)] px-3 py-1.5 flex justify-center">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-accent)]"
                      onClick={() => {
                        setUpdateEditingId(null);
                        setUpdateForm({ version: nextPatchVersion(systemUpdates), description: "" });
                        setUpdateModalOpen(true);
                      }}
                    >
                      <Plus size={12} /> Add More
                    </button>
                  </div>
                )}
              </div>
            </SettingRow>

          </div>

          {/* Add / Edit update modal */}
          <Modal
            open={updateModalOpen}
            onOpenChange={(open) => {
              if (!open) {
                setUpdateEditingId(null);
                setUpdateForm({ version: "", description: "" });
              }
              setUpdateModalOpen(open);
            }}
            mobileVariant="dialog"
          >
            <ModalContent className="max-w-md">
              <ModalHeader>
                <ModalTitle>{updateEditingId ? "Edit Update" : "Add Update"}</ModalTitle>
              </ModalHeader>
              <ModalBody className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Version Number
                  </label>
                  <Input
                    value={updateForm.version}
                    onChange={(e) => setUpdateForm((prev) => ({ ...prev, version: e.target.value }))}
                    placeholder="e.g. 1.0.4"
                    disabled={!canEdit}
                  />
                  {updateForm.version && !SEMVER_RE.test(updateForm.version) && (
                    <p className="text-[11px] text-red-500">Must follow x.y.z format (e.g. 1.0.4).</p>
                  )}
                </div>
                <TextareaWithCharactersLeft
                  label="What's New"
                  maxLength={5000}
                  value={updateForm.description}
                  onChange={(e) => setUpdateForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what changed in this version…"
                  rows={5}
                  disabled={!canEdit}
                />
              </ModalBody>
              <ModalFooter className="flex justify-end gap-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2 text-xs font-normal text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]"
                  onClick={() => {
                    setUpdateModalOpen(false);
                    setUpdateEditingId(null);
                    setUpdateForm({ version: "", description: "" });
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    !canEdit
                    || !updateForm.version.trim()
                    || !SEMVER_RE.test(updateForm.version.trim())
                    || !updateForm.description.trim()
                    || Boolean(sectionBusy["update-save"])
                  }
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-normal text-white",
                    "bg-[#2845D6] hover:bg-[#1f3eb5] disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                  onClick={async () => {
                    const version = updateForm.version.trim();
                    const description = updateForm.description.trim();
                    if (!version || !SEMVER_RE.test(version) || !description) return;
                    await runAction("update-save", async () => {
                      if (updateEditingId) {
                        const updated = await mutateJson<SystemUpdateData>(`/api/feedback/updates/${updateEditingId}`, "PATCH", { version, description });
                        setSystemUpdates((prev) => prev.map((u) => u.id === updated.id ? updated : u));
                      } else {
                        const created = await mutateJson<SystemUpdateData>("/api/feedback/updates", "POST", { version, description });
                        setSystemUpdates((prev) => [created, ...prev]);
                      }
                      setUpdateModalOpen(false);
                      setUpdateEditingId(null);
                      setUpdateForm({ version: "", description: "" });
                    }, updateEditingId ? "Update saved." : "Update created.");
                  }}
                >
                  {sectionBusy["update-save"]
                    ? <TextShimmer className="text-xs" duration={1.2}>Saving...</TextShimmer>
                    : <><Check size={13} />{updateEditingId ? "Save Changes" : "Create Update"}</>
                  }
                </button>
              </ModalFooter>
            </ModalContent>
          </Modal>

          <AnimatePresence>
            {updateDeleteTarget && (
              <ConfirmationModal
                title="Delete Update"
                message={`Delete version "${updateDeleteTarget.version}"? This action cannot be undone.`}
                confirmLabel="Delete"
                confirming={Boolean(sectionBusy["update-delete"])}
                onConfirm={() => void runAction("update-delete", async () => {
                  await mutateJson<void>(`/api/feedback/updates/${updateDeleteTarget.id}`, "DELETE");
                  setSystemUpdates((prev) => prev.filter((u) => u.id !== updateDeleteTarget.id));
                  setUpdateDeleteTarget(null);
                }, "Update deleted.")}
                onCancel={() => !sectionBusy["update-delete"] && setUpdateDeleteTarget(null)}
              />
            )}
          </AnimatePresence>

        </div>
      );
    };

  const renderApprovalRoutingContent = () => {
    if (sectionBusy["approval"]) {
      return <TextShimmer className="text-xs">Loading approval routing...</TextShimmer>;
    }

    return (
      <div className="space-y-6">
        {!canEdit && (
          <div className="flex justify-end">
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-[10px] font-medium text-[var(--color-text-muted)]">
              <Lock size={12} /> Locked for current role
            </span>
          </div>
        )}

        <SettingRow
          title="Leave Routing"
          description="Configure leave routing approval rules."
        >
          <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <div className={GENERAL_LIST_SCROLL_CLASS}>
              {leaveRoutingRules.map((rule) => (
                <div key={rule.id} className={GENERAL_LIST_ROW_CLASS}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-[var(--color-text-primary)]">{rule.description || "(No description)"}</p>
                    <p className="truncate text-[11px] text-[var(--color-text-muted)]">{rule.positions.length > 0 ? rule.positions.join(", ") : "All positions"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold",
                      rule.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
                    )}>
                      {rule.is_active ? "Active" : "Inactive"}
                    </span>
                    {canEdit && (
                      <>
                        <button type="button" className={ACTION_ICON_BUTTON_CLASS} onClick={() => {
                          setLeaveRoutingEditTarget(rule);
                          setLeaveRoutingRuleDraft(buildLeaveRoutingRuleDraft(rule, positions, departments));
                          setLeaveRoutingModalOpen(true);
                        }}>
                          <Pencil size={14} />
                        </button>
                        <button type="button" className={DANGER_ICON_BUTTON_CLASS} onClick={() => setLeaveRoutingDeleteTarget(rule)}>
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="border-t border-[var(--color-border)] px-3 py-1.5 flex justify-center">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-accent)]"
                  onClick={() => {
                    setLeaveRoutingEditTarget(null);
                    setLeaveRoutingRuleDraft(createLeaveRoutingRuleDraft());
                    setLeaveRoutingModalOpen(true);
                  }}
                >
                  <Plus size={12} /> Add More
                </button>
              </div>
            )}
          </div>
        </SettingRow>

        <SettingRow
          title="Training Evaluation Routing"
          description="Configure training evaluation approval rules."
        >
          <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <div className={GENERAL_LIST_SCROLL_CLASS}>
              {trainingEvaluationRoutingRules.map((rule) => (
                <div key={rule.id} className={GENERAL_LIST_ROW_CLASS}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-[var(--color-text-primary)]">{rule.description || "(No description)"}</p>
                    <p className="truncate text-[11px] text-[var(--color-text-muted)]">{rule.positions.length > 0 ? rule.positions.join(", ") : "All positions"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold",
                      rule.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
                    )}>
                      {rule.is_active ? "Active" : "Inactive"}
                    </span>
                    {canEdit && (
                      <>
                        <button type="button" className={ACTION_ICON_BUTTON_CLASS} onClick={() => {
                          setTrainingEvaluationRoutingEditTarget(rule);
                          setTrainingEvaluationRoutingRuleDraft(buildLeaveRoutingRuleDraft(rule, positions, departments));
                          setTrainingEvaluationRoutingModalOpen(true);
                        }}>
                          <Pencil size={14} />
                        </button>
                        <button type="button" className={DANGER_ICON_BUTTON_CLASS} onClick={() => setTrainingEvaluationRoutingDeleteTarget(rule)}>
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="border-t border-[var(--color-border)] px-3 py-1.5 flex justify-center">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-accent)]"
                  onClick={() => {
                    setTrainingEvaluationRoutingEditTarget(null);
                    setTrainingEvaluationRoutingRuleDraft(createLeaveRoutingRuleDraft());
                    setTrainingEvaluationRoutingModalOpen(true);
                  }}
                >
                  <Plus size={12} /> Add More
                </button>
              </div>
            )}
          </div>
        </SettingRow>

        <SettingRow
          title="Employee Evaluation Routing"
          description="Configure employee evaluation approval rules."
        >
          <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <div className={GENERAL_LIST_SCROLL_CLASS}>
              {evaluationRoutingRules.map((rule) => (
                <div key={rule.id} className={GENERAL_LIST_ROW_CLASS}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-[var(--color-text-primary)]">{rule.description || "(No description)"}</p>
                    <p className="truncate text-[11px] text-[var(--color-text-muted)]">{rule.positions.length > 0 ? rule.positions.join(", ") : "All positions"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold",
                      rule.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
                    )}>
                      {rule.is_active ? "Active" : "Inactive"}
                    </span>
                    {canEdit && (
                      <>
                        <button type="button" className={ACTION_ICON_BUTTON_CLASS} onClick={() => {
                          setEvaluationRoutingEditTarget(rule);
                          setEvaluationRoutingRuleDraft(buildLeaveRoutingRuleDraft(rule, positions, departments));
                          setEvaluationRoutingModalOpen(true);
                        }}>
                          <Pencil size={14} />
                        </button>
                        <button type="button" className={DANGER_ICON_BUTTON_CLASS} onClick={() => setEvaluationRoutingDeleteTarget(rule)}>
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="border-t border-[var(--color-border)] px-3 py-1.5 flex justify-center">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-accent)]"
                  onClick={() => {
                    setEvaluationRoutingEditTarget(null);
                    setEvaluationRoutingRuleDraft(createLeaveRoutingRuleDraft());
                    setEvaluationRoutingModalOpen(true);
                  }}
                >
                  <Plus size={12} /> Add More
                </button>
              </div>
            )}
          </div>
        </SettingRow>

        <Modal open={leaveRoutingModalOpen} onOpenChange={setLeaveRoutingModalOpen} mobileVariant="dialog">
          <ModalContent className="max-w-3xl">
            <ModalHeader>
              <ModalTitle>{leaveRoutingEditTarget ? "Edit Leave Routing Rule" : "Add Leave Routing Rule"}</ModalTitle>
            </ModalHeader>
            <ModalBody className="space-y-4">
              <div className="grid gap-3">
                <Input
                  label="Rule Title"
                  value={leaveRoutingRuleDraft.description}
                  onChange={(e) => updateLeaveRoutingRuleDraft({ description: e.target.value })}
                  placeholder="Type routing rule title"
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-[var(--color-text-primary)]">Requester positions</p>
                      <p className="text-[11px] font-normal text-[var(--color-text-muted)]">Choose the requestor positions that this leave routing rule applies to.</p>
                    </div>
                    <span className="rounded-full bg-[#2845D6]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2845D6] whitespace-nowrap">
                      {leaveRoutingRuleDraft.position_ids.length} selected
                    </span>
                  </div>
                  <div className="mt-4">
                    <MultiSelectCombobox
                      className="text-xs focus:outline-none focus:ring-0 focus:border-[var(--color-border)] focus-visible:ring-0 focus-visible:outline-none !ring-0"
                      options={positions.map((p) => ({ value: String(p.id), label: formatPositionOption(p) }))}
                      selected={leaveRoutingRuleDraft.position_ids.map(String)}
                      onChange={(vals) => updateLeaveRoutingRuleDraft({ position_ids: vals.map(Number).filter(Number.isFinite) })}
                      placeholder="Select positions"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-[var(--color-text-primary)]">Departments</p>
                      <p className="text-[11px] font-normal text-[var(--color-text-muted)]">Select departments for the routing rule, or leave empty to apply across all departments.</p>
                    </div>
                    <span className="rounded-full bg-[#2845D6]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2845D6] whitespace-nowrap">
                      {leaveRoutingRuleDraft.department_ids.length} selected
                    </span>
                  </div>
                  <div className="mt-4">
                    <MultiSelectCombobox
                      className="text-xs focus:outline-none focus:ring-0 focus:border-[var(--color-border)] focus-visible:ring-0 focus-visible:outline-none !ring-0"
                      options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
                      selected={leaveRoutingRuleDraft.department_ids.map(String)}
                      onChange={(vals) => updateLeaveRoutingRuleDraft({ department_ids: vals.map(Number).filter(Number.isFinite) })}
                      placeholder="Select departments"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">Approval steps</p>
                    <p className="text-[10px] font-normal text-[var(--color-text-muted)]">Each step is executed in order. Choose the approver positions for every step.</p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#2845D6] px-4 py-1.5 text-xs font-normal text-white transition-colors hover:bg-[#1f3eb5]"
                    onClick={addLeaveRoutingStep}
                  >
                    <Plus size={14} /> Add step
                  </button>
                </div>

                <div className="mt-4">
                  <AnimatePresence initial={false}>
                    {leaveRoutingRuleDraft.steps.map((step, index) => (
                      <motion.div
                        key={step.id}
                        layout
                        initial={{ opacity: 0, y: -8, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -8, height: 0 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className={cn(
                          "overflow-hidden py-4",
                          index > 0 && "border-t border-[var(--color-border)]"
                        )}
                      >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="inline-flex items-center gap-2 rounded-full bg-[#2845D6]/10 px-3 py-0.5 text-[11px] font-medium text-[#2845D6]">
                                Step {index + 1}
                              </div>
                            </div>
                            {leaveRoutingRuleDraft.steps.length > 1 && (
                              <button
                                type="button"
                                className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                                onClick={() => removeLeaveRoutingStep(step.id)}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>

                          <div className="mt-2 grid gap-1">
                            {/* <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Approver positions</label> */}
                            <MultiSelectCombobox
                              className="text-xs focus:outline-none focus:ring-0 focus:border-[var(--color-border)] focus-visible:ring-0 focus-visible:outline-none !ring-0"
                              options={positions.map((p) => ({ value: String(p.id), label: formatPositionOption(p) }))}
                              selected={step.position_ids.map(String)}
                              onChange={(vals) => updateLeaveRoutingStep(step.id, { position_ids: vals.map(Number).filter(Number.isFinite) })}
                              placeholder="Choose approver positions"
                            />
                          </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">The step order is assigned automatically from top to bottom. The first matching approver position in each step is used during routing.</p>
              </div>
            </ModalBody>
            <ModalFooter className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2 text-xs font-normal text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]"
                onClick={() => setLeaveRoutingModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-normal text-white",
                  leaveRoutingCanSave ? "bg-[#2845D6] hover:bg-[#1f3eb5]" : "bg-[#2845D6] disabled:opacity-50 cursor-not-allowed"
                )}
                onClick={() => {
                  if (!leaveRoutingCanSave || sectionBusy["leave-routing-save"]) return;
                  void runAction("leave-routing-save", async () => {
                    const payload = {
                      description: leaveRoutingRuleDraft.description.trim(),
                      position_ids: leaveRoutingRuleDraft.position_ids,
                      department_ids: leaveRoutingRuleDraft.department_ids,
                      steps: leaveRoutingRuleDraft.steps.map((s) => ({ position_ids: s.position_ids })),
                    };
                    if (leaveRoutingEditTarget) {
                      await mutateJson(`/api/leave/admin/routing-rules/${leaveRoutingEditTarget.id}`, "PUT", payload);
                    } else {
                      await mutateJson(`/api/leave/admin/routing-rules`, "POST", payload);
                    }
                    await fetchLeaveRoutingRules();
                    setLeaveRoutingModalOpen(false);
                  }, leaveRoutingEditTarget ? "Leave routing rule updated." : "Leave routing rule created.");
                }}
                disabled={!leaveRoutingCanSave || Boolean(sectionBusy["leave-routing-save"])}
              >
                {sectionBusy["leave-routing-save"] ? <TextShimmer className="text-xs" duration={1.2}>Saving...</TextShimmer> : <><Check size={14} /> Save rule</>}
              </button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        <Modal open={trainingEvaluationRoutingModalOpen} onOpenChange={setTrainingEvaluationRoutingModalOpen} mobileVariant="dialog">
          <ModalContent className="max-w-3xl">
            <ModalHeader>
              <ModalTitle>{trainingEvaluationRoutingEditTarget ? "Edit Training Evaluation Routing Rule" : "Add Training Evaluation Routing Rule"}</ModalTitle>
            </ModalHeader>
            <ModalBody className="space-y-4">
              <div className="grid gap-3">
                <Input
                  label="Rule Title"
                  value={trainingEvaluationRoutingRuleDraft.description}
                  onChange={(e) => updateTrainingEvaluationRoutingRuleDraft({ description: e.target.value })}
                  placeholder="Type routing rule title"
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-[var(--color-text-primary)]">Requester positions</p>
                      <p className="text-[11px] font-normal text-[var(--color-text-muted)]">Choose the requestor positions that this routing rule applies to.</p>
                    </div>
                    <span className="rounded-full bg-[#2845D6]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2845D6] whitespace-nowrap">
                      {trainingEvaluationRoutingRuleDraft.position_ids.length} selected
                    </span>
                  </div>
                  <div className="mt-4">
                    <MultiSelectCombobox
                      className="text-xs focus:outline-none focus:ring-0 focus:border-[var(--color-border)] focus-visible:ring-0 focus-visible:outline-none !ring-0"
                      options={positions.map((p) => ({ value: String(p.id), label: formatPositionOption(p) }))}
                      selected={trainingEvaluationRoutingRuleDraft.position_ids.map(String)}
                      onChange={(vals) => updateTrainingEvaluationRoutingRuleDraft({ position_ids: vals.map(Number).filter(Number.isFinite) })}
                      placeholder="Select positions"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-[var(--color-text-primary)]">Departments</p>
                      <p className="text-[11px] font-normal text-[var(--color-text-muted)]">Select departments for the routing rule, or leave empty to apply across all departments.</p>
                    </div>
                    <span className="rounded-full bg-[#2845D6]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2845D6] whitespace-nowrap">
                      {trainingEvaluationRoutingRuleDraft.department_ids.length} selected
                    </span>
                  </div>
                  <div className="mt-4">
                    <MultiSelectCombobox
                      className="text-xs focus:outline-none focus:ring-0 focus:border-[var(--color-border)] focus-visible:ring-0 focus-visible:outline-none !ring-0"
                      options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
                      selected={trainingEvaluationRoutingRuleDraft.department_ids.map(String)}
                      onChange={(vals) => updateTrainingEvaluationRoutingRuleDraft({ department_ids: vals.map(Number).filter(Number.isFinite) })}
                      placeholder="Select departments"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">Approval steps</p>
                    <p className="text-[10px] font-normal text-[var(--color-text-muted)]">Each step is executed in order. Choose the approver positions for every step.</p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#2845D6] px-4 py-1.5 text-xs font-normal text-white transition-colors hover:bg-[#1f3eb5]"
                    onClick={addTrainingEvaluationRoutingStep}
                  >
                    <Plus size={14} /> Add step
                  </button>
                </div>

                <div className="mt-4">
                  <AnimatePresence initial={false}>
                    {trainingEvaluationRoutingRuleDraft.steps.map((step, index) => (
                      <motion.div
                        key={step.id}
                        layout
                        initial={{ opacity: 0, y: -8, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -8, height: 0 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className={cn(
                          "overflow-hidden py-4",
                          index > 0 && "border-t border-[var(--color-border)]"
                        )}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="inline-flex items-center gap-2 rounded-full bg-[#2845D6]/10 px-3 py-0.5 text-[11px] font-medium text-[#2845D6]">
                              Step {index + 1}
                            </div>
                          </div>
                          {trainingEvaluationRoutingRuleDraft.steps.length > 1 && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                              onClick={() => removeTrainingEvaluationRoutingStep(step.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>

                        <div className="mt-2 grid gap-1">
                          <MultiSelectCombobox
                            className="text-xs focus:outline-none focus:ring-0 focus:border-[var(--color-border)] focus-visible:ring-0 focus-visible:outline-none !ring-0"
                            options={positions.map((p) => ({ value: String(p.id), label: formatPositionOption(p) }))}
                            selected={step.position_ids.map(String)}
                            onChange={(vals) => updateTrainingEvaluationRoutingStep(step.id, { position_ids: vals.map(Number).filter(Number.isFinite) })}
                            placeholder="Choose approver positions"
                          />
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">The step order is assigned automatically from top to bottom. The first matching approver position in each step is used during routing.</p>
              </div>
            </ModalBody>
            <ModalFooter className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2 text-xs font-normal text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]"
                onClick={() => setTrainingEvaluationRoutingModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-normal text-white",
                  trainingEvaluationRoutingCanSave ? "bg-[#2845D6] hover:bg-[#1f3eb5]" : "bg-[#2845D6] disabled:opacity-50 cursor-not-allowed"
                )}
                onClick={() => {
                  if (!trainingEvaluationRoutingCanSave || sectionBusy["training-evaluation-routing-save"]) return;
                  void runAction("training-evaluation-routing-save", async () => {
                    const payload = {
                      description: trainingEvaluationRoutingRuleDraft.description.trim(),
                      position_ids: trainingEvaluationRoutingRuleDraft.position_ids,
                      department_ids: trainingEvaluationRoutingRuleDraft.department_ids,
                      steps: trainingEvaluationRoutingRuleDraft.steps.map((s) => ({ position_ids: s.position_ids })),
                      module: "training_evaluation",
                    };
                    if (trainingEvaluationRoutingEditTarget) {
                      await mutateJson(`/api/training/admin/routing-rules/${trainingEvaluationRoutingEditTarget.id}`, "PUT", payload);
                    } else {
                      await mutateJson(`/api/training/admin/routing-rules`, "POST", payload);
                    }
                    await fetchTrainingEvaluationRoutingRules();
                    setTrainingEvaluationRoutingModalOpen(false);
                  }, trainingEvaluationRoutingEditTarget ? "Training evaluation routing rule updated." : "Training evaluation routing rule created.");
                }}
                disabled={!trainingEvaluationRoutingCanSave || Boolean(sectionBusy["training-evaluation-routing-save"])}
              >
                {sectionBusy["training-evaluation-routing-save"] ? <TextShimmer className="text-xs" duration={1.2}>Saving...</TextShimmer> : <><Check size={14} /> Save rule</>}
              </button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        <Modal open={evaluationRoutingModalOpen} onOpenChange={setEvaluationRoutingModalOpen} mobileVariant="dialog">
          <ModalContent className="max-w-3xl">
            <ModalHeader>
              <ModalTitle>{evaluationRoutingEditTarget ? "Edit Employee Evaluation Routing Rule" : "Add Employee Evaluation Routing Rule"}</ModalTitle>
            </ModalHeader>
            <ModalBody className="space-y-4">
              <div className="grid gap-3">
                <Input
                  label="Rule Title"
                  value={evaluationRoutingRuleDraft.description}
                  onChange={(e) => updateEvaluationRoutingRuleDraft({ description: e.target.value })}
                  placeholder="Type routing rule title"
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-[var(--color-text-primary)]">Requester positions</p>
                      <p className="text-[11px] font-normal text-[var(--color-text-muted)]">Choose the requestor positions that this routing rule applies to.</p>
                    </div>
                    <span className="rounded-full bg-[#2845D6]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2845D6] whitespace-nowrap">
                      {evaluationRoutingRuleDraft.position_ids.length} selected
                    </span>
                  </div>
                  <div className="mt-4">
                    <MultiSelectCombobox
                      className="text-xs focus:outline-none focus:ring-0 focus:border-[var(--color-border)] focus-visible:ring-0 focus-visible:outline-none !ring-0"
                      options={positions.map((p) => ({ value: String(p.id), label: formatPositionOption(p) }))}
                      selected={evaluationRoutingRuleDraft.position_ids.map(String)}
                      onChange={(vals) => updateEvaluationRoutingRuleDraft({ position_ids: vals.map(Number).filter(Number.isFinite) })}
                      placeholder="Select positions"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-[var(--color-text-primary)]">Departments</p>
                      <p className="text-[11px] font-normal text-[var(--color-text-muted)]">Select departments for the routing rule, or leave empty to apply across all departments.</p>
                    </div>
                    <span className="rounded-full bg-[#2845D6]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2845D6] whitespace-nowrap">
                      {evaluationRoutingRuleDraft.department_ids.length} selected
                    </span>
                  </div>
                  <div className="mt-4">
                    <MultiSelectCombobox
                      className="text-xs focus:outline-none focus:ring-0 focus:border-[var(--color-border)] focus-visible:ring-0 focus-visible:outline-none !ring-0"
                      options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
                      selected={evaluationRoutingRuleDraft.department_ids.map(String)}
                      onChange={(vals) => updateEvaluationRoutingRuleDraft({ department_ids: vals.map(Number).filter(Number.isFinite) })}
                      placeholder="Select departments"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">Approval steps</p>
                    <p className="text-[10px] font-normal text-[var(--color-text-muted)]">Each step is executed in order. Choose the approver positions for every step.</p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#2845D6] px-4 py-1.5 text-xs font-normal text-white transition-colors hover:bg-[#1f3eb5]"
                    onClick={addEvaluationRoutingStep}
                  >
                    <Plus size={14} /> Add step
                  </button>
                </div>

                <div className="mt-4">
                  <AnimatePresence initial={false}>
                    {evaluationRoutingRuleDraft.steps.map((step, index) => (
                      <motion.div
                        key={step.id}
                        layout
                        initial={{ opacity: 0, y: -8, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -8, height: 0 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className={cn(
                          "overflow-hidden py-4",
                          index > 0 && "border-t border-[var(--color-border)]"
                        )}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="inline-flex items-center gap-2 rounded-full bg-[#2845D6]/10 px-3 py-0.5 text-[11px] font-medium text-[#2845D6]">
                              Step {index + 1}
                            </div>
                          </div>
                          {evaluationRoutingRuleDraft.steps.length > 1 && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                              onClick={() => removeEvaluationRoutingStep(step.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>

                        <div className="mt-2 grid gap-1">
                          <MultiSelectCombobox
                            className="text-xs focus:outline-none focus:ring-0 focus:border-[var(--color-border)] focus-visible:ring-0 focus-visible:outline-none !ring-0"
                            options={positions.map((p) => ({ value: String(p.id), label: formatPositionOption(p) }))}
                            selected={step.position_ids.map(String)}
                            onChange={(vals) => updateEvaluationRoutingStep(step.id, { position_ids: vals.map(Number).filter(Number.isFinite) })}
                            placeholder="Choose approver positions"
                          />
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">The step order is assigned automatically from top to bottom. The first matching approver position in each step is used during routing.</p>
              </div>
            </ModalBody>
            <ModalFooter className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2 text-xs font-normal text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]"
                onClick={() => setEvaluationRoutingModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-normal text-white",
                  evaluationRoutingCanSave ? "bg-[#2845D6] hover:bg-[#1f3eb5]" : "bg-[#2845D6] disabled:opacity-50 cursor-not-allowed"
                )}
                onClick={() => {
                  if (!evaluationRoutingCanSave || sectionBusy["evaluation-routing-save"]) return;
                  void runAction("evaluation-routing-save", async () => {
                    const payload = {
                      description: evaluationRoutingRuleDraft.description.trim(),
                      position_ids: evaluationRoutingRuleDraft.position_ids,
                      department_ids: evaluationRoutingRuleDraft.department_ids,
                      steps: evaluationRoutingRuleDraft.steps.map((s) => ({ position_ids: s.position_ids })),
                      module: "employee_evaluation",
                    };
                    if (evaluationRoutingEditTarget) {
                      await mutateJson(`/api/employee-eval/admin/routing-rules/${evaluationRoutingEditTarget.id}`, "PUT", payload);
                    } else {
                      await mutateJson(`/api/employee-eval/admin/routing-rules`, "POST", payload);
                    }
                    await fetchEvaluationRoutingRules();
                    setEvaluationRoutingModalOpen(false);
                  }, evaluationRoutingEditTarget ? "Employee evaluation routing rule updated." : "Employee evaluation routing rule created.");
                }}
                disabled={!evaluationRoutingCanSave || Boolean(sectionBusy["evaluation-routing-save"])}
              >
                {sectionBusy["evaluation-routing-save"] ? <TextShimmer className="text-xs" duration={1.2}>Saving...</TextShimmer> : <><Check size={14} /> Save rule</>}
              </button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        <AnimatePresence>
          {leaveRoutingDeleteTarget && (
            <ConfirmationModal
              title="Delete Leave Routing Rule"
              message={`Delete the routing rule "${leaveRoutingDeleteTarget.description || "(No description)"}"? This action cannot be undone.`}
              confirmLabel="Delete"
              confirming={Boolean(sectionBusy["leave-routing-delete"])}
              onConfirm={() => void runAction("leave-routing-delete", async () => {
                await mutateJson<void>(`/api/leave/admin/routing-rules/${leaveRoutingDeleteTarget.id}`, "DELETE");
                await fetchLeaveRoutingRules();
                setLeaveRoutingDeleteTarget(null);
              }, "Leave routing rule removed.")}
              onCancel={() => !sectionBusy["leave-routing-delete"] && setLeaveRoutingDeleteTarget(null)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {trainingEvaluationRoutingDeleteTarget && (
            <ConfirmationModal
              title="Delete Training Evaluation Routing Rule"
              message={`Delete the routing rule "${trainingEvaluationRoutingDeleteTarget.description || "(No description)"}"? This action cannot be undone.`}
              confirmLabel="Delete"
              confirming={Boolean(sectionBusy["training-evaluation-routing-delete"])}
              onConfirm={() => void runAction("training-evaluation-routing-delete", async () => {
                await mutateJson<void>(`/api/training/admin/routing-rules/${trainingEvaluationRoutingDeleteTarget.id}`, "DELETE");
                await fetchTrainingEvaluationRoutingRules();
                setTrainingEvaluationRoutingDeleteTarget(null);
              }, "Training evaluation routing rule removed.")}
              onCancel={() => !sectionBusy["training-evaluation-routing-delete"] && setTrainingEvaluationRoutingDeleteTarget(null)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {evaluationRoutingDeleteTarget && (
            <ConfirmationModal
              title="Delete Employee Evaluation Routing Rule"
              message={`Delete the routing rule "${evaluationRoutingDeleteTarget.description || "(No description)"}"? This action cannot be undone.`}
              confirmLabel="Delete"
              confirming={Boolean(sectionBusy["evaluation-routing-delete"])}
              onConfirm={() => void runAction("evaluation-routing-delete", async () => {
                await mutateJson<void>(`/api/employee-eval/admin/routing-rules/${evaluationRoutingDeleteTarget.id}`, "DELETE");
                await fetchEvaluationRoutingRules();
                setEvaluationRoutingDeleteTarget(null);
              }, "Employee evaluation routing rule removed.")}
              onCancel={() => !sectionBusy["evaluation-routing-delete"] && setEvaluationRoutingDeleteTarget(null)}
            />
          )}
        </AnimatePresence>

      </div>
    );
  };

  const renderSecurityContent = () => {
    if (sectionBusy["security"]) return <div className="flex items-center justify-center py-16"><TextShimmer className="text-sm" duration={1.4}>Loading security settings...</TextShimmer></div>;

    const isAdmin = Boolean(user?.admin);
    const normalizedEmailConfig = normalizeEmailConfig(emailConfig);
    const normalizedSavedEmailConfig = normalizeEmailConfig(savedEmailConfig);
    const emailDirty = !sameEmailConfig(normalizedEmailConfig, normalizedSavedEmailConfig);
    const emailConfigRequired = getEmailConfigRequiredFlags(normalizedEmailConfig);
    const normalizedPasswordPolicy = passwordPolicy ?? getDefaultPasswordPolicy();
    const normalizedSavedPasswordPolicy = savedPasswordPolicy ?? getDefaultPasswordPolicy();
    const passwordDirty = !samePasswordPolicy(normalizedPasswordPolicy, normalizedSavedPasswordPolicy);
    const adminDirty = isAdminAccountsDirty(adminAccounts, savedAdminAccounts);
    const privilegedAccounts = adminAccounts.filter((account) => hasAnyAdminRole(account));
    const availableUsers = adminAccounts
      .filter((account) => !hasAnyAdminRole(account))
      .filter((account) => {
        const name = [account.firstname, account.lastname].filter(Boolean).join(" ").trim() || account.idnumber;
        const q = adminUserSearch.trim().toLowerCase();
        if (!q) return true;
        return name.toLowerCase().includes(q) || account.idnumber.toLowerCase().includes(q);
      });

    const canSaveAddRow = Boolean(adminAddUserId) && Object.values(adminAddRoles).some(Boolean);
    const canSaveEditRow = adminEditingId !== null && Object.values(adminEditRoles).some(Boolean);

    return (
      <div className="space-y-6 overflow-y-auto p-3">
          <SettingRow
              title="Email Configuration"
              description="Configure SMTP and test email delivery settings."
            >
            <div className="space-y-3 px-3 space-y-4">
              <div className="grid grid-cols-10 gap-3">
                  <div className="col-span-7 space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                      SMTP Host
                      {isAdmin && emailConfigRequired.smtp_host && (
                        <span className="ml-1 text-red-500">*</span>
                      )}
                    </label>
                    <Input
                      type="text"
                      value={normalizedEmailConfig.smtp_host}
                      onChange={(e) => setEmailConfig((prev) => ({ ...normalizeEmailConfig(prev), smtp_host: e.target.value }))}
                      disabled={!isAdmin}
                      placeholder="smtp.gmail.com"
                    />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                      SMTP Port
                      {isAdmin && emailConfigRequired.smtp_port && (
                        <span className="ml-1 text-red-500">*</span>
                      )}
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={65535}
                      value={String(normalizedEmailConfig.smtp_port)}
                      onChange={(e) => setEmailConfig((prev) => ({ ...normalizeEmailConfig(prev), smtp_port: Math.max(1, Math.min(65535, Number(e.target.value) || 1)) }))}
                      disabled={!isAdmin}
                    />
                  </div>
              </div>

              <div className="flex items-center gap-6">
                  <div className="space-y-1">
                    <BasicCheckbox
                      checked={normalizedEmailConfig.use_tls}
                      onCheckedChange={(checked) => setEmailConfig((prev) => ({ ...normalizeEmailConfig(prev), use_tls: checked }))}
                      label="TLS"
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="space-y-1">
                    <BasicCheckbox
                      checked={normalizedEmailConfig.use_ssl}
                      onCheckedChange={(checked) => setEmailConfig((prev) => ({ ...normalizeEmailConfig(prev), use_ssl: checked }))}
                      label="SSL"
                      disabled={!isAdmin}
                    />
                  </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  SMTP Username
                  {isAdmin && emailConfigRequired.username && (
                    <span className="ml-1 text-red-500">*</span>
                  )}
                </label>
                <Input
                  type="text"
                  value={normalizedEmailConfig.username}
                  onChange={(e) => setEmailConfig((prev) => ({ ...normalizeEmailConfig(prev), username: e.target.value }))}
                  disabled={!isAdmin}
                  placeholder="noreply@example.com"
                />
              </div>

              <div className="relative w-full">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    SMTP Password
                    {isAdmin && emailConfigRequired.password && (
                      <span className="ml-1 text-red-500">*</span>
                    )}
                  </label>
                  <Input
                    type={emailConfigShowPassword ? "text" : "password"}
                    value={normalizedEmailConfig.password}
                    onChange={(e) => setEmailConfig((prev) => ({ ...normalizeEmailConfig(prev), password: e.target.value }))}
                    disabled={!isAdmin}
                    placeholder="Enter SMTP password"
                  />
                  <button type="button" className="absolute inset-y-0 right-2 flex items-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]" onClick={() => setEmailConfigShowPassword((v) => !v)} tabIndex={-1} aria-label={emailConfigShowPassword ? "Hide password" : "Show password"}>
                    {emailConfigShowPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  From Name
                  {isAdmin && emailConfigRequired.from_name && (
                    <span className="ml-1 text-red-500">*</span>
                  )}
                </label>
                <Input
                  type="text"
                  value={normalizedEmailConfig.from_name}
                  onChange={(e) => setEmailConfig((prev) => ({ ...normalizeEmailConfig(prev), from_name: e.target.value }))}
                  disabled={!isAdmin}
                  placeholder="Email sender name"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  From Address
                  {isAdmin && emailConfigRequired.from_address && (
                    <span className="ml-1 text-red-500">*</span>
                  )}
                </label>
                <Input
                  type="email"
                  value={normalizedEmailConfig.from_address}
                  onChange={(e) => setEmailConfig((prev) => ({ ...normalizeEmailConfig(prev), from_address: e.target.value }))}
                  disabled={!isAdmin}
                  placeholder="noreply@example.com"
                />
              </div>

              <p className="text-[11px] font-semibold border-t pt-2 border-[var(--color-border)] text-[var(--color-text-muted)] uppercase tracking-wide">Test Email Configuration</p>
              <div className="flex items-center gap-2">
                  <Input
                    type="email"
                    value={testEmailAddress}
                    onChange={(e) => setTestEmailAddress(e.target.value)}
                    disabled={!isAdmin}
                    placeholder="Recipient Address"
                    wrapperClassName="flex-1"
                  />
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-2 text-xs font-normal disabled:opacity-50"
                    disabled={!isAdmin || !testEmailAddress.trim() || sectionBusy["email-test"]}
                    onClick={() => void runAction("email-test", async () => {
                      await mutateJson<{ detail: string }>("/api/general-settings/email-config/test", "POST", { recipient: testEmailAddress.trim() });
                    }, "Test email sent successfully.")}
                  >
                    {sectionBusy["email-test"] ? <TextShimmer className="text-xs">Sending Test Email...</TextShimmer> : "Send Test Email"}
                  </button>
              </div>

              <AnimatePresence initial={false}>
                {isAdmin && emailDirty && (
                  <motion.div
                    initial={{ opacity: 0, y: 12, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: 12, height: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#2845D6] px-4 py-2 text-xs font-normal text-white disabled:opacity-50"
                        disabled={sectionBusy["email-save"]}
                        onClick={() => void runAction("email-save", async () => {
                          const payload: EmailConfigData = {
                            smtp_host: normalizedEmailConfig.smtp_host,
                            smtp_port: normalizedEmailConfig.smtp_port,
                            use_ssl: normalizedEmailConfig.use_ssl,
                            use_tls: normalizedEmailConfig.use_tls,
                            username: normalizedEmailConfig.username,
                            password: normalizedEmailConfig.password,
                            from_name: normalizedEmailConfig.from_name,
                            from_address: normalizedEmailConfig.from_address,
                          };
                          const saved = normalizeEmailConfig(await mutateJson<EmailConfigData>("/api/general-settings/email-config", "PUT", payload));
                          const persisted = { ...saved, password: payload.password };
                          setEmailConfig(persisted);
                          setSavedEmailConfig(persisted);
                        }, "Email configuration saved.")}
                      >
                        {sectionBusy["email-save"] ? <TextShimmer className="text-xs">Saving Email Configuration...</TextShimmer> : <><Check size={13} />Save Changes</>}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </SettingRow>

          <SettingRow
            title="Password Policy"
            description="Set account password strength and lockout rules."
          >
            <div className="space-y-6 px-3">
              <div className="space-y-6">
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Password Requirements</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <BasicCheckbox
                    checked={Boolean(passwordPolicy?.require_uppercase)}
                    onCheckedChange={(checked) => updatePasswordPolicy(setPasswordPolicy, { require_uppercase: checked })}
                    label="Require uppercase"
                    disabled={!isAdmin}
                  />
                  <BasicCheckbox
                    checked={Boolean(passwordPolicy?.require_lowercase)}
                    onCheckedChange={(checked) => updatePasswordPolicy(setPasswordPolicy, { require_lowercase: checked })}
                    label="Require lowercase"
                    disabled={!isAdmin}
                  />
                  <BasicCheckbox
                    checked={Boolean(passwordPolicy?.require_number)}
                    onCheckedChange={(checked) => updatePasswordPolicy(setPasswordPolicy, { require_number: checked })}
                    label="Require number"
                    disabled={!isAdmin}
                  />
                  <BasicCheckbox
                    checked={Boolean(passwordPolicy?.require_special_character)}
                    onCheckedChange={(checked) => updatePasswordPolicy(setPasswordPolicy, { require_special_character: checked })}
                    label="Require special character"
                    disabled={!isAdmin}
                  />
                </div>
              </div>

              <div>
                <Input
                  type="number"
                  label="Minimum password length"
                  min={6}
                  max={128}
                  value={String(passwordPolicy?.min_length ?? 8)}
                  onChange={(e) => updatePasswordPolicy(setPasswordPolicy, { min_length: Math.max(6, Math.min(128, Number(e.target.value) || 6)) })}
                  disabled={!isAdmin}
                />
              </div>

              <div>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      
                      <BasicCheckbox
                        checked={Boolean(passwordPolicy?.require_change_on_first_login)}
                        onCheckedChange={(checked) => updatePasswordPolicy(setPasswordPolicy, { require_change_on_first_login: checked })}
                        label="Require Change on First Login"
                        disabled={!isAdmin}
                      />
                    </div>
                    <div className="space-y-1">
                      <BasicCheckbox
                        checked={Boolean(passwordPolicy?.enable_account_lockout)}
                        onCheckedChange={(checked) => updatePasswordPolicy(setPasswordPolicy, { enable_account_lockout: checked })}
                        label="Enable Account Lockout"
                        disabled={!isAdmin}
                      />
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {passwordPolicy?.enable_account_lockout && (
                      <motion.div
                        initial={{ opacity: 0, y: -8, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -8, height: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-3">
                          <Input
                            type="number"
                            label="Max failed login attempts before lockout"
                            min={1}
                            max={20}
                            value={String(passwordPolicy?.max_failed_login_attempts ?? getDefaultPasswordPolicy().max_failed_login_attempts)}
                            onChange={(e) => updatePasswordPolicy(setPasswordPolicy, { max_failed_login_attempts: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
                            disabled={!isAdmin}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {isAdmin && passwordDirty && (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#2845D6] px-4 py-2 text-xs font-normal text-white disabled:opacity-50"
                  disabled={sectionBusy["password-policy-save"]}
                  onClick={() => void runAction("password-policy-save", async () => {
                    if (!passwordPolicy) return;
                    const saved = await mutateJson<PasswordPolicyData>("/api/general-settings/password-policy/admin", "PUT", passwordPolicy as unknown as JsonObject);
                    setPasswordPolicy(saved);
                    setSavedPasswordPolicy(saved);
                  }, "Password policy saved.")}
                >
                  {sectionBusy["password-policy-save"] ? <TextShimmer className="text-xs">Saving Password Policy...</TextShimmer> : <><Check size={13} />Save Changes</>}
                </button>
              </div>
            )}
            </div>
          </SettingRow>

          <SettingRow
            title="Admin Accounts"
            description="Manage admin accounts and their permissions."
          >
            <div className="space-y-3 border border-[var(--color-border)] rounded-lg">
              <div className={GENERAL_LIST_SCROLL_CLASS}>
                <AnimatePresence initial={false}>
                  {privilegedAccounts.map((account) => {
                    const name = [account.firstname, account.lastname].filter(Boolean).join(" ").trim() || account.idnumber;
                    const accountRoles = ADMIN_ROLE_OPTIONS.filter((role) => Boolean(account[role.key]));
                    const isEditing = adminEditingId === account.id;
                    return (
                      <motion.div
                        key={account.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className={cn(GENERAL_LIST_ROW_CLASS, isEditing && "bg-[var(--color-bg-card)]")}
                      >
                        {isEditing ? (
                          <>
                            <div className="min-w-0 flex-1 space-y-2">
                              <p className="truncate text-xs font-semibold text-[var(--color-text-primary)]">{name}</p>
                              <div className="grid grid-cols-2 gap-2">
                                {ADMIN_ROLE_OPTIONS.map((role) => (
                                  <BasicCheckbox
                                    key={`edit-role-${account.id}-${role.key}`}
                                    checked={Boolean(adminEditRoles[role.key])}
                                    onCheckedChange={(checked) => setAdminEditRoles((prev) => ({ ...prev, [role.key]: checked }))}
                                    label={role.label}
                                    disabled={!isAdmin}
                                  />
                                ))}
                              </div>
                            </div>
                            {isAdmin && (
                              <div className="flex items-center gap-1 self-start pt-0.5">
                                <button
                                  type="button"
                                  className={ACTION_ICON_BUTTON_CLASS}
                                  disabled={!canSaveEditRow}
                                  onClick={() => {
                                    setAdminAccounts((prev) => prev.map((item) => (
                                      item.id === account.id ? { ...item, ...adminEditRoles } : item
                                    )));
                                    setAdminEditingId(null);
                                  }}
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  type="button"
                                  className={DANGER_ICON_BUTTON_CLASS}
                                  onClick={() => {
                                    setAdminEditingId(null);
                                    setAdminEditRoles({
                                      admin: false,
                                      clinic: false,
                                      iad: false,
                                      accounting: false,
                                      hr: false,
                                      hr_manager: false,
                                      mis: false,
                                    });
                                  }}
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-xs font-semibold text-[var(--color-text-primary)]">{name}</p>
                                {account.locked && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                    <Lock size={10} />Locked
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex max-w-[26rem] flex-wrap justify-end gap-1">
                                {accountRoles.map((role) => (
                                  <span key={`pill-${account.id}-${role.key}`} className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", role.pillClassName)}>{role.label}</span>
                                ))}
                              </div>

                              {isAdmin && (
                                <div className="flex items-center gap-1">
                                  {account.locked && (
                                    <button
                                      type="button"
                                      className="shrink-0 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                                      onClick={() => setAdminUnlockTarget(account)}
                                    >
                                      Unlock
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className={ACTION_ICON_BUTTON_CLASS}
                                    onClick={() => {
                                      setAdminEditingId(account.id);
                                      setAdminEditRoles(getAdminRoleSnapshot(account));
                                      setAdminAddOpen(false);
                                    }}
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    className={DANGER_ICON_BUTTON_CLASS}
                                    onClick={() => setAdminDeleteTarget(account)}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </motion.div>
                    );
                  })}

                  {adminAddOpen && (
                    <motion.div
                      layout
                      key="admin-add-row"
                      initial={{ opacity: 0, y: -10, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: "auto" }}
                      exit={{ opacity: 0, y: -10, height: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="overflow-hidden border-[var(--color-border)] bg-[var(--color-bg-card)]/40 px-3 py-3"
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <Select value={adminAddUserId} onValueChange={setAdminAddUserId}>
                              <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                              <SelectContent>
                                <div className="px-3 py-2">
                                  <Input
                                    value={adminUserSearch}
                                    onChange={(e) => setAdminUserSearch(e.target.value)}
                                    placeholder="Search user"
                                    wrapperClassName="w-full"
                                  />
                                </div>
                                {availableUsers.map((item) => {
                                  const optionName = [item.firstname, item.lastname].filter(Boolean).join(" ").trim() || item.idnumber;
                                  return <SelectItem key={`admin-add-user-${item.id}`} value={String(item.id)}>{optionName}</SelectItem>;
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {ADMIN_ROLE_OPTIONS.map((role) => (
                              <BasicCheckbox
                                key={`add-role-${role.key}`}
                                checked={Boolean(adminAddRoles[role.key])}
                                onCheckedChange={(checked) => setAdminAddRoles((prev) => ({ ...prev, [role.key]: checked }))}
                                label={role.label}
                                disabled={!isAdmin}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 pt-0.5">
                          <button
                            type="button"
                            className={ACTION_ICON_BUTTON_CLASS}
                            disabled={!canSaveAddRow}
                            onClick={() => {
                              setAdminAccounts((prev) => prev.map((item) => (
                                String(item.id) === adminAddUserId ? { ...item, ...adminAddRoles } : item
                              )));
                              setAdminAddOpen(false);
                              setAdminUserSearch("");
                              setAdminAddUserId("");
                              setAdminAddRoles({
                                admin: false,
                                clinic: false,
                                iad: false,
                                accounting: false,
                                hr: false,
                                hr_manager: false,
                                mis: false,
                              });
                            }}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            className={DANGER_ICON_BUTTON_CLASS}
                            onClick={() => {
                              setAdminAddOpen(false);
                              setAdminUserSearch("");
                              setAdminAddUserId("");
                              setAdminAddRoles({
                                admin: false,
                                clinic: false,
                                iad: false,
                                accounting: false,
                                hr: false,
                                hr_manager: false,
                                mis: false,
                              });
                            }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {!adminAddOpen && privilegedAccounts.length === 0 && (
                  <div className="px-3 py-3 text-xs text-[var(--color-text-muted)]">No users currently have admin privileges.</div>
                )}
              </div>

              {isAdmin && (
                <div className="flex justify-center border-t border-[var(--color-border)] px-3 py-1.5">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-accent)]"
                    onClick={() => {
                      setAdminAddOpen(true);
                      setAdminEditingId(null);
                    }}
                  >
                    <Plus size={12} /> Add More
                  </button>
                </div>
              )}
            </div>

            <AnimatePresence>
            {adminDeleteTarget && (
              <ConfirmationModal
                title="Remove Admin Privileges"
                message={`Remove all privileges for ${[adminDeleteTarget.firstname, adminDeleteTarget.lastname].filter(Boolean).join(" ") || adminDeleteTarget.idnumber}?`}
                confirmLabel="Delete"
                confirming={Boolean(sectionBusy["admin-remove-privileges"])}
                onConfirm={() => void runAction("admin-remove-privileges", async () => {
                  setAdminAccounts((prev) => prev.map((item) => (
                    item.id === adminDeleteTarget.id
                      ? {
                          ...item,
                          admin: false,
                          clinic: false,
                          iad: false,
                          accounting: false,
                          hr: false,
                          hr_manager: false,
                          mis: false,
                        }
                      : item
                  )));
                  setAdminDeleteTarget(null);
                }, "Privileges removed from user.")}
                onCancel={() => !sectionBusy["admin-remove-privileges"] && setAdminDeleteTarget(null)}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {adminUnlockTarget && (
              <ConfirmationModal
                title="Unlock Account"
                message={`Unlock the account for ${[adminUnlockTarget.firstname, adminUnlockTarget.lastname].filter(Boolean).join(" ") || adminUnlockTarget.idnumber}? Their failed login counter will be reset and they will receive an email notification.`}
                confirmLabel="Unlock"
                confirming={Boolean(sectionBusy["admin-unlock"])}
                onConfirm={() => void runAction("admin-unlock", async () => {
                  const updated = await mutateJson<AdminAccountData>(`/api/general-settings/admin-accounts/${adminUnlockTarget.id}`, "PATCH", { action: "unlock" } as unknown as JsonObject);
                  setAdminAccounts((prev) => prev.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
                  setSavedAdminAccounts((prev) => prev.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
                  setAdminUnlockTarget(null);
                }, "Account unlocked successfully.")}
                onCancel={() => !sectionBusy["admin-unlock"] && setAdminUnlockTarget(null)}
              />
            )}
          </AnimatePresence>

          </SettingRow>         
      </div>
    );
  };

  if (authPhase === "spinner") return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#2845D6]" /></div>;
  if (authPhase === "checking") return <div className="flex h-full items-center justify-center"><TextShimmer className="text-sm" duration={1.4}>Checking permissions...</TextShimmer></div>;
  if (!user) return null;

  const visibleTabs: TopTab[] = user.admin ? ["general", "security", "approval", "memo-advertisement"] : ["general", "approval"];

  return (
    <div className="w-full space-y-4 p-4 pb-6">
      <div>
        <p className="text-lg font-bold text-[var(--color-text-primary)]">System Settings</p>
        <p className="text-xs text-[var(--color-text-muted)]">Configure global settings by module. Some sections are visible but locked based on role.</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1">
        <div className="flex min-w-max items-center gap-1">
          {visibleTabs.map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={cn("rounded-md px-3 py-2 text-xs font-normal transition-colors", activeTab === tab ? "bg-[#2845D6] text-white" : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]")}>{tab === "general" ? "General Settings" : tab === "security" ? "Security & Accounts" : tab === "approval" ? "Approval Routing" : "Memo & Advertisement"}</button>)}
        </div>
      </div>

      {activeTab === "security" ? (
        <div className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
          {renderSecurityContent()}
        </div>
      ) : activeTab === "memo-advertisement" ? (
        <div className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
          {renderMemoAdvertisementContent()}
        </div>
      ) : activeTab === "approval" ? (
        <div className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
          {renderApprovalRoutingContent()}
        </div>
      ) : (
        <div className="space-y-4">
        {!canEdit && <div className="flex justify-end"><span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-[10px] font-medium text-[var(--color-text-muted)]"><Lock size={12} />Locked for current role</span></div>}
        <div className="space-y-4">
          {generalSectionCards.map((card) => (
            <div key={card.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">{card.title}</p>
                  {card.sections.some((section) => !section.editable(user)) && <p className="text-[11px] text-[var(--color-text-muted)]">Locked for current role</p>}
                </div>
              </div>
              <div className={cn("mt-4", card.sections.some((section) => !section.editable(user)) && "opacity-70")}>
                {card.sections.map((section, index) => (
                  <div key={section.id} className={cn(index > 0 && "mt-8 border-t border-[var(--color-border)] pt-8")}>
                    {renderSectionBody(section)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}

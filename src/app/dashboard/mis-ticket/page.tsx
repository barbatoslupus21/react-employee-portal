'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import {
  ClipboardList,
  Download,
  Edit2,
  FileText,
  HardDrive,
  Laptop,
  Monitor,
  Network,
  Plus,
  Printer,
  Ticket,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusPill } from '@/components/ui/status-pill';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { RoundedTooltip } from '@/components/ui/rounded-tooltip';
import { toast } from '@/components/ui/toast';
import { AdminTableSection } from '@/components/ui/admin-table-section';
import type { DataTableColumn } from '@/components/ui/data-table';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { TextareaWithCharactersLeft } from '@/components/ui/textarea-with-characters-left';
import { FilterListContent } from '@/components/ui/admin-table-accordion';
import { Tabs as VercelTabs } from '@/components/ui/vercel-tabs';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';

import {
  type MISDevice,
  type MISTicket,
  useCancelMISTicket,
  useCreateMISDevice,
  useCreateMISTicket,
  useDeleteMISDevice,
  useMISDevicesFiltered,
  useMISDeviceSummary,
  useMISTicketDetail,
  useMISTickets,
  useUnseenMISTicketCount,
  useUpdateMISDevice,
} from './_hooks/useMISTicket';
import { useQueryClient } from '@tanstack/react-query';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEVICE_TYPES = [
  { value: 'desktop',    label: 'Desktop' },
  { value: 'laptop',     label: 'Laptop' },
  { value: 'printer',    label: 'Printer' },
  { value: 'network',    label: 'Network Device' },
  { value: 'peripheral', label: 'Peripheral' },
  { value: 'other',      label: 'Other' },
];

const TICKET_CATEGORIES = [
  { value: 'hardware',           label: 'Hardware' },
  { value: 'software',           label: 'Software' },
  { value: 'network',            label: 'Network' },
  { value: 'account',            label: 'Access' },
  { value: 'request_for_parts',  label: 'Request for Parts' },
];

const TICKET_STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const DEVICE_ICON: Record<string, React.ElementType> = {
  desktop:    Monitor,
  laptop:     Laptop,
  printer:    Printer,
  network:    Network,
  peripheral: HardDrive,
  scanner:    HardDrive,
  phone:      HardDrive,
  router:     Network,
  monitor:    Monitor,
  projector:  Monitor,
  ups:        HardDrive,
  other:      HardDrive,
};

const TICKET_STATUS_MAP: Record<string, { status: string; label: string }> = {
  OPEN:        { status: 'pending',  label: 'Open' },
  IN_PROGRESS: { status: 'routing',  label: 'In Progress' },
  RESOLVED:    { status: 'approved', label: 'Resolved' },
  CLOSED:      { status: 'closed',   label: 'Closed' },
};

const TAB_LIST = [
  { id: 'tickets', label: 'My Tickets' },
  { id: 'devices', label: 'My Devices' },
] as const;
type TabId = (typeof TAB_LIST)[number]['id'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function sortItems<T>(items: T[], field: string, dir: 'asc' | 'desc'): T[] {
  if (!field) return items;
  return [...items].sort((a, b) => {
    const va = String((a as Record<string, unknown>)[field] ?? '');
    const vb = String((b as Record<string, unknown>)[field] ?? '');
    return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });
}

/** Shows skeleton for at least 1 second after data loading begins. */
function useDelayedLoading(isLoading: boolean): boolean {
  const [delayed, setDelayed] = useState(isLoading);
  useEffect(() => {
    if (isLoading) {
      const frame = requestAnimationFrame(() => setDelayed(true));
      return () => cancelAnimationFrame(frame);
    }
    const t = setTimeout(() => setDelayed(false), 1000);
    return () => clearTimeout(t);
  }, [isLoading]);
  return delayed;
}

const tableIconButtonCls = 'flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[#2845D6] hover:bg-[#2845D6]/10 transition-colors';
const tableDangerIconButtonCls = 'flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-50 transition-colors';

function RequiredLabel({ text, invalid }: { text: string; invalid: boolean }) {
  return (
    <span className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">
      {text}
      {invalid && <span className="ml-1 text-red-500">*</span>}
    </span>
  );
}

// ── CreateTicketModal ─────────────────────────────────────────────────────────

type CreateTicketForm = {
  subject: string;
  category: string;
  device_id: string;
  problem: string;
};
const EMPTY_TICKET_FORM: CreateTicketForm = {
  subject: '', category: '', device_id: '', problem: '',
};

function CreateTicketModal({
  open, onClose, devices,
}: { open: boolean; onClose: () => void; devices: MISDevice[] }) {
  const [form, setForm] = useState<CreateTicketForm>(() => EMPTY_TICKET_FORM);
  const createTicket = useCreateMISTicket();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_TICKET_FORM);
      setSubmitting(false);
    }
  }, [open]);

  const subjectInvalid  = form.subject.trim().length === 0;
  const categoryInvalid  = form.category.length === 0;
  const deviceInvalid    = form.device_id === '' || form.device_id === 'none';
  const problemInvalid   = form.problem.trim().length === 0;
  const canSubmit = !subjectInvalid && !categoryInvalid && !deviceInvalid && !problemInvalid;
  const busy = createTicket.isPending || submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 1000));
    setSubmitting(false);
    await createTicket.mutateAsync({
      subject: form.subject.trim(),
      category: form.category,
      device_id: parseInt(form.device_id),
      problem: form.problem.trim(),
    });
    onClose();
  }

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()}>
      <ModalContent className="max-w-lg">
        <ModalHeader>
          <ModalTitle>Create Ticket</ModalTitle>
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody className="space-y-3">
            {/* Subject */}
            <div>
              <label><RequiredLabel text="Subject" invalid={subjectInvalid} /></label>
              <Input
                required
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Brief summary of the issue"
                disabled={busy}
              />
            </div>

            {/* Category */}
            <div>
              <label><RequiredLabel text="Category" invalid={categoryInvalid} /></label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                disabled={busy}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Device */}
            <div>
              <label><RequiredLabel text="Device" invalid={deviceInvalid} /></label>
              <Select
                value={form.device_id}
                onValueChange={(v) => setForm((f) => ({ ...f, device_id: v }))}
                disabled={busy}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a device" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.device_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Problem */}
            <div>
              <TextareaWithCharactersLeft
                label={(
                  <span className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">
                    Problem Description
                    {problemInvalid && <span className="ml-1 text-red-500">*</span>}
                  </span>
                )}
                value={form.problem}
                onChange={(e) => setForm((f) => ({ ...f, problem: e.target.value }))}
                maxLength={2000}
                placeholder="Describe the issue in detail…"
                rows={5}
                disabled={busy}
              />
            </div>
          </ModalBody>

          <ModalFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <button
              type="submit"
              disabled={busy || !canSubmit}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2 text-xs font-normal text-white transition-all',
                busy || !canSubmit
                  ? 'bg-[#2845D6]/70 cursor-not-allowed'
                  : 'bg-[#2845D6] hover:bg-[#1f37b9]',
              )}
            >
              {busy ? (
                <TextShimmer
                  duration={1.2}
                  className="text-xs font-normal [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]"
                >
                  Creating…
                </TextShimmer>
              ) : (
                <><Plus size={14} /> Create Ticket</>
              )}
            </button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}

// ── DeviceModal ───────────────────────────────────────────────────────────────

type DeviceForm = {
  device_name: string;
  device_type: string;
  other_device_type: string;
  brand: string;
  model_name: string;
  location: string;
};

const EMPTY_DEVICE: DeviceForm = {
  device_name: '', device_type: '', other_device_type: '',
  brand: '', model_name: '', location: '',
};

function getDeviceForm(device?: MISDevice | null): DeviceForm {
  if (!device) return EMPTY_DEVICE;
  return {
    device_name: device.device_name,
    device_type: device.device_type,
    other_device_type: device.other_device_type,
    brand: device.brand,
    model_name: device.model_name,
    location: device.location,
  };
}

function DeviceModal({
  open, onClose, device,
}: { open: boolean; onClose: () => void; device?: MISDevice | null }) {
  const [form, setForm] = useState<DeviceForm>(() => getDeviceForm(device));
  const create = useCreateMISDevice();
  const update = useUpdateMISDevice();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(getDeviceForm(device));
    }
  }, [device, open]);

  const inp = (k: keyof DeviceForm) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 1000));
    setSubmitting(false);
    if (device) {
      await update.mutateAsync({ id: device.id, data: form });
    } else {
      await create.mutateAsync(form);
    }
    onClose();
  }

  const busy = create.isPending || update.isPending || submitting;
  const deviceNameInvalid = form.device_name.trim().length === 0;
  const deviceTypeInvalid = form.device_type.trim().length === 0;
  const otherTypeInvalid = form.device_type === 'other' && form.other_device_type.trim().length === 0;
  const brandInvalid = form.brand.trim().length === 0;
  const modelInvalid = form.model_name.trim().length === 0;
  const locationInvalid = form.location.trim().length === 0;
  const canSubmit = !deviceNameInvalid && !deviceTypeInvalid && !otherTypeInvalid && !brandInvalid && !modelInvalid && !locationInvalid;

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()}>
      <ModalContent className="max-w-md">
        <ModalHeader>
          <ModalTitle>{device ? 'Edit Device' : 'Register New Device'}</ModalTitle>
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody className="space-y-4">
            {/* Device Name */}
            <div>
              <label><RequiredLabel text="Device Name" invalid={deviceNameInvalid} /></label>
              <Input
                required
                value={form.device_name}
                onChange={inp('device_name')}
                placeholder="e.g. My Office Laptop"
                disabled={busy}
              />
            </div>

            {/* Device Type */}
            <div>
              <label><RequiredLabel text="Device Type" invalid={deviceTypeInvalid} /></label>
              <Select
                value={form.device_type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, device_type: v, other_device_type: '' }))
                }
                disabled={busy}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select device type" />
                </SelectTrigger>
                <SelectContent>
                  {DEVICE_TYPES.map((dt) => (
                    <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Specify type when Other */}
            {form.device_type === 'other' && (
              <div>
                <label><RequiredLabel text="Specify Type" invalid={otherTypeInvalid} /></label>
                <Input
                  required
                  value={form.other_device_type}
                  onChange={inp('other_device_type')}
                  placeholder="e.g. Barcode scanner"
                  disabled={busy}
                />
              </div>
            )}

            {/* Brand / Model */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label><RequiredLabel text="Brand" invalid={brandInvalid} /></label>
                <Input
                  required
                  value={form.brand}
                  onChange={inp('brand')}
                  placeholder="e.g. Lenovo"
                  disabled={busy}
                />
              </div>
              <div>
                <label><RequiredLabel text="Model/Unit" invalid={modelInvalid} /></label>
                <Input
                  required
                  value={form.model_name}
                  onChange={inp('model_name')}
                  placeholder="e.g. ThinkPad E14"
                  disabled={busy}
                />
              </div>
            </div>

            {/* Location */}
            <div>
              <label><RequiredLabel text="Location" invalid={locationInvalid} /></label>
              <Input
                required
                value={form.location}
                onChange={inp('location')}
                placeholder="e.g. 2nd Floor, Accounting"
                disabled={busy}
              />
            </div>
          </ModalBody>

          <ModalFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <button
              type="submit"
              disabled={busy || !canSubmit}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2 text-xs font-normal text-white transition-all',
                busy || !canSubmit ? 'bg-[#2845D6]/70 cursor-not-allowed' : 'bg-[#2845D6] hover:bg-[#1f37b9]',
              )}
            >
              {busy ? (
                <TextShimmer
                  duration={1.2}
                  className="text-xs font-normal [--base-color:#a5b4fc] [--base-gradient-color:#ffffff]"
                >
                  {device ? 'Saving…' : 'Registering…'}
                </TextShimmer>
              ) : (
                device ? <><Edit2 size={14} /> Save Changes</> : <><Plus size={14} /> Register Device</>
              )}
            </button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}

// ── TicketDetailModal ─────────────────────────────────────────────────────────

function TicketDetailModal({
  open,
  pk,
  ticketPreview,
  onClose,
}: {
  open: boolean;
  pk: number | null;
  ticketPreview: MISTicket | null;
  onClose: () => void;
}) {
  const [activePk, setActivePk] = useState<number | null>(pk);
  const [activePreview, setActivePreview] = useState<MISTicket | null>(ticketPreview);

  useEffect(() => {
    if (open && pk !== null) {
      setActivePk(pk);
      setActivePreview(ticketPreview);
    }
  }, [open, pk, ticketPreview]);

  const resolvedPk = pk ?? activePk;
  const resolvedPreview = ticketPreview ?? activePreview;
  const { data: ticketDetail, isLoading, error } = useMISTicketDetail(resolvedPk);

  if (resolvedPk === null) return null;

  const ticket = ticketDetail ?? resolvedPreview;
  const pill = ticket
    ? (TICKET_STATUS_MAP[ticket.status] ?? { status: ticket.status, label: ticket.status })
    : null;

  async function downloadPDF() {
    const res = await fetch(`/api/mis/tickets/${resolvedPk}/pdf`, { credentials: 'include' });
    if (!res.ok) { toast.error('PDF not available yet.'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${ticket?.ticket_number ?? resolvedPk}.pdf`; a.click();
    URL.revokeObjectURL(url);
  }

  function fmtShort(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return (
    <Modal open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <ModalContent className="max-w-lg bg-[var(--color-bg-elevated)]">
        <ModalHeader>
          <ModalTitle>View Ticket Details</ModalTitle>
        </ModalHeader>

        <ModalBody className="px-0 py-0">
          {isLoading ? (
            <div className="space-y-3 px-6 py-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-5 rounded-lg bg-[var(--color-bg-card)] animate-pulse" />
              ))}
            </div>
          ) : ticket ? (
            <>
              {/* {error && (
                <div className="px-6 pt-5">
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Showing available ticket information. Some detail fields could not be loaded.
                  </p>
                </div>
              )} */}

              <div className="mb-3 flex items-center justify-between px-6 pt-4">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-[var(--color-text-primary)]">
                    {ticket.ticket_number}
                  </span>
                  {pill && <StatusPill status={pill.status} label={pill.label} />}
                </div>
                <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                  {fmtShort(ticket.created_at)}
                </span>
              </div>

              <div className="px-6 pb-3 pt-3">
                <div className="flex items-center gap-3">
                  <p className="text-xs font-bold text-[var(--color-text-primary)] whitespace-nowrap">
                    Ticket Information
                  </p>
                  <div className="h-px flex-1 bg-[var(--color-border)]" />
                </div>
              </div>

              <div className="px-6 pb-2 [scrollbar-width:thin]">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <DetailValue label="Ticket Number" value={ticket.ticket_number} mono />
                  <DetailValue label="Status" value={ticket.status_display} />
                  <DetailValue label="Subject" value={ticket.subject || '—'} />
                  <DetailValue label="Category" value={ticket.category_display} />
                  <DetailValue label="Device" value={ticket.device_name || '—'} />
                  <DetailValue label="Priority" value={ticket.priority_display} />
                  <DetailValue label="Requested By" value={ticket.employee_name || '—'} />
                  <DetailValue label="Department" value={ticket.department || '—'} />
                  <DetailValue label="Created At" value={fmtDate(ticket.created_at)} />
                  <DetailValue label="Resolved At" value={ticket.resolved_at ? fmtDate(ticket.resolved_at) : '—'} />
                </div>

                <div className="mt-4">
                  <p className="text-[11px] mb-1 font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                    Problem Description
                  </p>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap text-[var(--color-text-primary)]">
                    {ticket.problem || '—'}
                  </p>
                </div>

                {ticketDetail?.diagnosis && (
                  <div className="mt-4">
                    <div className="mb-3 flex items-center gap-3">
                      <p className="flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-[var(--color-text-primary)]">
                        Technician Diagnosis
                      </p>
                      <div className="h-px flex-1 bg-[var(--color-border)]" />
                    </div>

                    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                      <DetailValue label="Technician" value={ticketDetail.diagnosis.technician_name || '—'} />
                      <DetailValue label="Diagnosed At" value={fmtDate(ticketDetail.diagnosis.diagnosed_at)} />
                    </div>

                    {ticketDetail.diagnosis.progress_note && (
                      <div className="mt-4">
                        <DetailValue label="Technician Note" value={ticketDetail.diagnosis.progress_note} multiline />
                      </div>
                    )}

                    <div className="mt-4 grid gap-y-4">
                      <DetailValue label="Diagnosis" value={ticketDetail.diagnosis.diagnosis || '—'} multiline />
                      <DetailValue label="Action Taken" value={ticketDetail.diagnosis.action_taken || '—'} multiline />
                      <DetailValue label="Possible Reason" value={ticketDetail.diagnosis.possible_reason || '—'} multiline />
                      {ticketDetail.diagnosis.recommendation && (
                        <DetailValue label="Recommendation" value={ticketDetail.diagnosis.recommendation} multiline />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : error ? (
            <div className="px-6 py-6">
              <p className="text-sm text-[var(--color-text-muted)]">
                Failed to load ticket details.
              </p>
            </div>
          ) : (
            <div className="px-6 py-6">
              <p className="text-sm text-[var(--color-text-muted)]">Ticket not found.</p>
            </div>
          )}
        </ModalBody>

        {ticket && (
          <ModalFooter>
            <div className="flex w-full items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="group flex items-center gap-1.5 text-xs border border-[var(--color-border)] rounded-lg px-4 py-2 font-normal text-[var(--color-text-muted)] transition-all hover:gap-2 hover:text-[var(--color-text-primary)]"
              >
                <X className="h-3.5 w-3.5" />
                <span>Close</span>
              </button>
              <RoundedTooltip
                content={
                  ticket.has_diagnosis && (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED')
                    ? 'Download PDF report'
                    : 'PDF available after technician diagnosis is submitted and ticket is resolved'
                }
              >
                <span>
                  <button
                    type="button"
                    disabled={
                      !ticket.has_diagnosis ||
                      ticket.status === 'OPEN' ||
                      ticket.status === 'IN_PROGRESS'
                    }
                    onClick={downloadPDF}
                    className={cn(
                      'group flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-normal text-xs text-white transition-all hover:gap-2',
                      !ticket.has_diagnosis ||
                      ticket.status === 'OPEN' ||
                      ticket.status === 'IN_PROGRESS'
                        ? 'cursor-not-allowed bg-[#2845D6]/70'
                        : 'bg-[#2845D6] hover:bg-[#1f37b9]',
                    )}
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download PDF</span>
                  </button>
                </span>
              </RoundedTooltip>
            </div>
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  );
}

function DetailValue({
  label,
  value,
  mono,
  multiline,
}: {
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
      <p
        className={cn(
          'text-xs text-[var(--color-text-primary)]',
          multiline && 'leading-relaxed whitespace-pre-wrap',
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ── DeviceSummaryModal ────────────────────────────────────────────────────────

function DeviceSummaryModal({
  deviceId, onClose,
}: { deviceId: number | null; onClose: () => void }) {
  const { data, isLoading } = useMISDeviceSummary(deviceId);
  const d = data as {
    device: MISDevice;
    total_tickets: number;
    resolved_tickets: number;
    most_common_category: string | null;
    latest_ticket: {
      ticket_number: string;
      status: string;
      status_display: string;
      created_at: string;
    } | null;
  } | undefined;
  if (!deviceId) return null;

  return (
    <Modal open={deviceId !== null} onOpenChange={(open) => !open && onClose()}>
      <ModalContent className="max-w-sm bg-[var(--color-bg-elevated)]">
        <ModalHeader>
          <ModalTitle>Device Summary</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-5 rounded-lg bg-[var(--color-bg-elevated)] animate-pulse" />
              ))}
            </div>
          ) : d ? (
            <>
            <p className="font-semibold text-[var(--color-text-primary)]">{d.device.device_name}</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Total Tickets', value: d.total_tickets },
                { label: 'Resolved',      value: d.resolved_tickets },
                { label: 'Common Issue',  value: d.most_common_category ?? '—' },
                { label: 'Latest Status', value: d.latest_ticket?.status_display ?? '—' },
              ].map((c) => (
                <div
                  key={c.label}
                  className="rounded-xl bg-[var(--color-bg-elevated)] border border-[var(--color-border)] p-3"
                >
                  <div className="text-[11px] text-[var(--color-text-muted)]">{c.label}</div>
                  <div className="text-base font-bold text-[var(--color-text-primary)] mt-0.5 capitalize">
                    {c.value}
                  </div>
                </div>
              ))}
            </div>
            {d.latest_ticket && (
              <p className="text-xs text-[var(--color-text-muted)]">
                Last ticket:{' '}
                <span className="font-semibold text-[#2845D6]">{d.latest_ticket.ticket_number}</span>{' '}
                · {fmtDate(d.latest_ticket.created_at)}
              </p>
            )}
            </>
          ) : null}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MISTicketPage() {
  const queryClient = useQueryClient();

  // ── Tab ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>('tickets');

  // ── Unseen count (drives sidebar badge) ───────────────────────────────────
  useUnseenMISTicketCount();

  // ── Tickets ───────────────────────────────────────────────────────────────
  const [ticketPage, setTicketPage] = useState(1);
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState('');
  const [ticketCategoryFilter, setTicketCategoryFilter] = useState('');
  const debouncedTicketSearch = useDebounce(ticketSearch, 300);
  const { data: ticketData, isLoading: ticketsLoading } = useMISTickets({
    page: ticketPage,
    search: debouncedTicketSearch,
    pageSize: 10,
    status: ticketStatusFilter,
    category: ticketCategoryFilter,
  });
  const ticketShowSkeleton = useDelayedLoading(ticketsLoading);
  const [ticketSortField, setTicketSortField] = useState('created_at');
  const [ticketSortDir, setTicketSortDir] = useState<'asc' | 'desc'>('desc');
  const [detailPk, setDetailPk] = useState<number | null>(null);
  const [detailPreview, setDetailPreview] = useState<MISTicket | null>(null);
  const [createTicketOpen, setCreateTicketOpen] = useState(false);
  const cancelTicket = useCancelMISTicket();
  const [cancelTarget, setCancelTarget] = useState<MISTicket | null>(null);

  // ── Devices ───────────────────────────────────────────────────────────────
  const [deviceSearch, setDeviceSearch] = useState('');
  const [deviceTypeFilter, setDeviceTypeFilter] = useState('');
  const debouncedDeviceSearch = useDebounce(deviceSearch, 300);
  const { data: devices = [], isLoading: devicesLoading } = useMISDevicesFiltered(
    debouncedDeviceSearch,
    deviceTypeFilter,
  );
  const deviceShowSkeleton = useDelayedLoading(devicesLoading);
  const [deviceSortField, setDeviceSortField] = useState('device_name');
  const [deviceSortDir, setDeviceSortDir] = useState<'asc' | 'desc'>('asc');
  const deleteDevice = useDeleteMISDevice();
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [editDevice, setEditDevice] = useState<MISDevice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MISDevice | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [openTicketsWarning, setOpenTicketsWarning] = useState<{
    device: MISDevice;
    count: number;
  } | null>(null);
  const [summaryDeviceId, setSummaryDeviceId] = useState<number | null>(null);

  useEffect(() => {
    setTicketPage(1);
  }, [debouncedTicketSearch, ticketStatusFilter, ticketCategoryFilter]);

  // ── Computed: Tickets ──────────────────────────────────────────────────────
  const ticketRows = ticketData?.results ?? [];
  const hasTickets = !ticketShowSkeleton && ticketRows.length > 0;
  const sortedTickets = sortItems(ticketRows, ticketSortField, ticketSortDir);
  const totalTicketPages = ticketData ? Math.ceil(ticketData.count / 10) : 1;

  // ── Computed: Devices ──────────────────────────────────────────────────────
  const hasDevices = !deviceShowSkeleton && devices.length > 0;
  const sortedDevices = sortItems(devices, deviceSortField, deviceSortDir);

  // ── Sort handlers ──────────────────────────────────────────────────────────
  function handleTicketSort(field: string) {
    if (ticketSortField === field) {
      setTicketSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setTicketSortField(field);
      setTicketSortDir('asc');
    }
  }
  function handleDeviceSort(field: string) {
    if (deviceSortField === field) {
      setDeviceSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setDeviceSortField(field);
      setDeviceSortDir('asc');
    }
  }

  function openTicketDetail(ticket: MISTicket) {
    setDetailPreview(ticket);
    setDetailPk(ticket.id);
  }

  function closeTicketDetail() {
    setDetailPk(null);
    setDetailPreview(null);
    // Refresh unseen count so the sidebar badge updates
    queryClient.invalidateQueries({ queryKey: ['mis-tickets-unseen-count'] });
    queryClient.invalidateQueries({ queryKey: ['mis-tickets'] });
  }

  async function handleCancelTicket(ticket: MISTicket) {
    await cancelTicket.mutateAsync(ticket.id);
    setCancelTarget(null);
  }

  const ticketCategoryFilterContent = (
    <FilterListContent
      options={TICKET_CATEGORIES}
      value={ticketCategoryFilter}
      onChange={setTicketCategoryFilter}
      allLabel="All categories"
    />
  );

  const ticketStatusFilterContent = (
    <FilterListContent
      options={TICKET_STATUS_OPTIONS}
      value={ticketStatusFilter}
      onChange={setTicketStatusFilter}
      allLabel="All statuses"
    />
  );

  const deviceTypeFilterContent = (
    <FilterListContent
      options={DEVICE_TYPES}
      value={deviceTypeFilter}
      onChange={setDeviceTypeFilter}
      allLabel="All types"
    />
  );

  // ── Column definitions ─────────────────────────────────────────────────────

  const ticketColumns: DataTableColumn<MISTicket>[] = [
    {
      key: 'ticket_number',
      label: 'Ticket #',
      sortField: 'ticket_number',
      render: (t) => <span className="text-xs">{t.ticket_number}</span>,
    },
    {
      key: 'subject',
      label: 'Subject',
      sortField: 'subject',
      render: (t) => (
        <span className="block truncate max-w-[160px] text-[var(--color-text-primary)]">
          {t.subject || '—'}
        </span>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      sortField: 'category_display',
      filterContent: ticketCategoryFilterContent,
      filterActive: !!ticketCategoryFilter,
      thClassName: 'hidden md:table-cell',
      tdClassName: 'hidden md:table-cell',
      render: (t) => (
        <span className="capitalize text-[var(--color-text-secondary)]">{t.category_display}</span>
      ),
    },
    {
      key: 'device',
      label: 'Device',
      thClassName: 'hidden md:table-cell',
      tdClassName: 'hidden md:table-cell',
      render: (t) => (
        <span className="text-[var(--color-text-secondary)] truncate block max-w-[140px]">
          {t.device_display || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortField: 'status',
      filterContent: ticketStatusFilterContent,
      filterActive: !!ticketStatusFilter,
      render: (t) => {
        const pill = TICKET_STATUS_MAP[t.status] ?? { status: t.status, label: t.status };
        return (
          <div className="flex flex-wrap items-center gap-1">
            <StatusPill status={pill.status} label={pill.label} />
            {t.requires_immediate_action && (
              <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                Immediate Action
              </span>
            )}
            {t.has_recommended_parts && (
              <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                Parts Requested
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'note',
      label: 'Note',
      thClassName: 'hidden xl:table-cell',
      tdClassName: 'hidden xl:table-cell',
      render: (t) => (
        <span className="text-[var(--color-text-muted)] text-xs line-clamp-2 max-w-[180px]">
          {t.diagnosis_note || '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Action',
      headerAlign: 'center',
      thClassName: 'text-center',
      tdClassName: 'text-center',
      render: (t) => (
        <div className="flex items-center justify-center gap-0.5">
          <RoundedTooltip content="View details">
            <button onClick={() => openTicketDetail(t)} className={tableIconButtonCls}>
              <FileText className="h-3 w-3" />
            </button>
          </RoundedTooltip>
          <RoundedTooltip
            content={
              t.has_diagnosis && (t.status === 'RESOLVED' || t.status === 'CLOSED')
                ? 'Download PDF'
                : 'PDF available after diagnosis'
            }
          >
            <span>
              <button
                disabled={!t.has_diagnosis || (t.status !== 'RESOLVED' && t.status !== 'CLOSED')}
                onClick={async () => {
                  const res = await fetch(`/api/mis/tickets/${t.id}/pdf`, { credentials: 'include' });
                  if (!res.ok) { toast.error('PDF not available.'); return; }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `${t.ticket_number}.pdf`; a.click();
                  URL.revokeObjectURL(url);
                }}
                className={cn(tableIconButtonCls, 'disabled:cursor-not-allowed disabled:opacity-30')}
              >
                <Download className="h-3 w-3" />
              </button>
            </span>
          </RoundedTooltip>
        </div>
      ),
    },
  ];

  const deviceColumns: DataTableColumn<MISDevice>[] = [
    {
      key: 'device_name',
      label: 'Device Name',
      sortField: 'device_name',
      render: (d) => {
        const Icon = (DEVICE_ICON[d.device_type] ?? HardDrive) as LucideIcon;
        return (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-7 w-7 shrink-0 rounded-lg bg-[#2845D6]/10 flex items-center justify-center">
              <Icon className="h-3.5 w-3.5 text-[#2845D6]" />
            </div>
            <span className="font-medium text-[var(--color-text-primary)] truncate">
              {d.device_name}
            </span>
          </div>
        );
      },
    },
    {
      key: 'device_type',
      label: 'Type',
      sortField: 'device_type_display',
      filterContent: deviceTypeFilterContent,
      filterActive: !!deviceTypeFilter,
      thClassName: 'hidden md:table-cell',
      tdClassName: 'hidden md:table-cell',
      render: (d) => (
        <span className="capitalize text-[var(--color-text-secondary)]">
          {d.device_type === 'other' && d.other_device_type
            ? d.other_device_type
            : d.device_type_display}
        </span>
      ),
    },
    {
      key: 'brand_model',
      label: 'Brand / Model',
      render: (d) => (
        <span className="text-[var(--color-text-secondary)]">
          {d.brand} {d.model_name}
        </span>
      ),
    },
    {
      key: 'location',
      label: 'Location',
      sortField: 'location',
      render: (d) => (
        <span className="text-[var(--color-text-muted)] truncate block max-w-[140px]">
          {d.location || '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Action',
      headerAlign: 'center',
      thClassName: 'text-center',
      tdClassName: 'text-center',
      render: (d) => (
        <div className="flex items-center justify-center gap-0.5">
          <RoundedTooltip content="Summary">
            <button onClick={() => setSummaryDeviceId(d.id)} className={tableIconButtonCls}>
              <ClipboardList className="h-3 w-3" />
            </button>
          </RoundedTooltip>
          <RoundedTooltip content="Edit">
            <button
              onClick={() => { setEditDevice(d); setDeviceModalOpen(true); }}
              className={tableIconButtonCls}
            >
              <Edit2 className="h-3 w-3" />
            </button>
          </RoundedTooltip>
          <RoundedTooltip content="Delete">
            <button onClick={() => setDeleteTarget(d)} className={tableDangerIconButtonCls}>
              <Trash2 className="h-3 w-3" />
            </button>
          </RoundedTooltip>
        </div>
      ),
    },
  ];

  // ── Device delete handler ─────────────────────────────────────────────────
  async function handleDeleteDevice(device: MISDevice, forceConfirm = false) {
    setConfirmingDelete(true);
    try {
      const result = await deleteDevice.mutateAsync({ id: device.id, confirm: forceConfirm });
      if (result && (result as Record<string, unknown>).open_tickets) {
        setOpenTicketsWarning({
          device,
          count: (result as Record<string, unknown>).open_tickets as number,
        });
      } else {
        setDeleteTarget(null);
      }
    } finally {
      setConfirmingDelete(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Full-width single-column shell */}
      <div className="h-[calc(100dvh-3.5rem)] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent] bg-[var(--color-bg)]">
        <div className="p-5 space-y-5 w-full">

          {/* Page header */}
          <div>
            <h1 className="text-lg font-bold text-[var(--color-text-primary)]">MIS Ticket</h1>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              IT support, your tickets, and your registered devices.
            </p>
          </div>

          {/* VercelTabs */}
          <VercelTabs
            tabs={TAB_LIST as unknown as { id: string; label: string }[]}
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as TabId)}
          />

          {/* ── Tab content ───────────────────────────────────────────── */}
          <AnimatePresence mode="wait">

            {/* ── TICKETS ────────────────────────────────────────────── */}
            {activeTab === 'tickets' && (
              <motion.div
                key="tickets"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.18 }}
              >
                <AdminTableSection<MISTicket>
                  search={ticketSearch}
                  onSearchChange={setTicketSearch}
                  searchPlaceholder="Search tickets…"
                  actions={(
                    <div className="flex items-center gap-2">
                      {hasTickets && (
                        <button
                          type="button"
                          onClick={() => setCreateTicketOpen(true)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-normal text-white transition-all bg-[#2845D6] hover:bg-[#1f37b9]"
                        >
                          <Plus size={14} /> Create Ticket
                        </button>
                      )}
                    </div>
                  )}
                  columns={ticketColumns}
                  rows={sortedTickets}
                  rowKey={(t) => t.id}
                  loading={ticketShowSkeleton}
                  sortField={ticketSortField}
                  sortDir={ticketSortDir}
                  onSort={handleTicketSort}
                  emptyTitle="No tickets yet"
                  emptyDescription="Create a ticket to get IT support assistance."
                  emptyIcons={[Ticket, FileText, ClipboardList]}
                  emptyAction={
                    !ticketShowSkeleton
                      ? {
                          label: 'Create Ticket',
                          onClick: () => setCreateTicketOpen(true),
                          icon: <Plus size={14} />,
                        }
                      : undefined
                  }
                  page={ticketPage}
                  totalPages={totalTicketPages}
                  pageSize={10}
                  totalCount={ticketData?.count ?? 0}
                  onPageChange={setTicketPage}
                />
              </motion.div>
            )}

            {/* ── DEVICES ────────────────────────────────────────────── */}
            {activeTab === 'devices' && (
              <motion.div
                key="devices"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.18 }}
              >
                <AdminTableSection<MISDevice>
                  search={deviceSearch}
                  onSearchChange={setDeviceSearch}
                  searchPlaceholder="Search devices…"
                  actions={
                    hasDevices ? (
                      <button
                        type="button"
                        onClick={() => { setEditDevice(null); setDeviceModalOpen(true); }}
                        className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-normal text-white transition-all bg-[#2845D6] hover:bg-[#1f37b9]"
                      >
                        <Plus size={14} /> Register Device
                      </button>
                    ) : undefined
                  }
                  columns={deviceColumns}
                  rows={sortedDevices}
                  rowKey={(d) => d.id}
                  loading={deviceShowSkeleton}
                  sortField={deviceSortField}
                  sortDir={deviceSortDir}
                  onSort={handleDeviceSort}
                  emptyTitle="No devices registered"
                  emptyDescription="Registering your devices helps IT Support diagnose issues faster."
                  emptyIcons={[Monitor, Laptop, HardDrive]}
                  emptyAction={
                    !deviceShowSkeleton
                      ? {
                          label: 'Register Device',
                          onClick: () => { setEditDevice(null); setDeviceModalOpen(true); },
                          icon: <Plus size={14} />,
                        }
                      : undefined
                  }
                  page={1}
                  totalPages={1}
                  pageSize={sortedDevices.length || 10}
                  totalCount={sortedDevices.length}
                  onPageChange={() => {}}
                />
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      {/* Create Ticket */}
      <CreateTicketModal
        open={createTicketOpen}
        onClose={() => setCreateTicketOpen(false)}
        devices={devices}
      />

      {/* Device (register / edit) */}
      <DeviceModal
        open={deviceModalOpen}
        onClose={() => { setDeviceModalOpen(false); setEditDevice(null); }}
        device={editDevice}
      />

      {/* Ticket detail + Device summary (portal-rendered, inside AnimatePresence) */}
      <AnimatePresence>
        <TicketDetailModal
          pk={detailPk}
          open={detailPk !== null}
          ticketPreview={detailPreview}
          onClose={closeTicketDetail}
        />
        {summaryDeviceId !== null && (
          <DeviceSummaryModal
            key="device-summary"
            deviceId={summaryDeviceId}
            onClose={() => setSummaryDeviceId(null)}
          />
        )}
        {deleteTarget && (
          <ConfirmationModal
            key="delete-confirm"
            title={`Delete "${deleteTarget.device_name}"?`}
            message="This will permanently remove the device record. Existing tickets referencing this device will not be affected."
            confirmLabel="Delete Device"
            confirming={confirmingDelete}
            onConfirm={() => handleDeleteDevice(deleteTarget)}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
        {openTicketsWarning && (
          <ConfirmationModal
            key="open-tickets-warn"
            title={`This device has ${openTicketsWarning.count} open ticket(s)`}
            message={`"${openTicketsWarning.device.device_name}" has ${openTicketsWarning.count} open or in-progress ticket(s). Deleting the device won't cancel those tickets, but the reference will be retained. Are you sure?`}
            confirmLabel="Delete Anyway"
            confirming={confirmingDelete}
            onConfirm={() => {
              handleDeleteDevice(openTicketsWarning.device, true);
              setOpenTicketsWarning(null);
            }}
            onCancel={() => {
              setOpenTicketsWarning(null);
              setDeleteTarget(null);
            }}
          />
        )}
        {cancelTarget && (
          <ConfirmationModal
            key="cancel-ticket-confirm"
            title={`Cancel ticket ${cancelTarget.ticket_number}?`}
            message="This will mark the ticket as closed. This action requires confirmation."
            confirmLabel="Cancel Ticket"
            confirming={cancelTicket.isPending}
            onConfirm={() => handleCancelTicket(cancelTarget)}
            onCancel={() => setCancelTarget(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

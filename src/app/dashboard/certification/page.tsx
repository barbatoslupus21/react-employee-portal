'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mail, FileText, Award, BadgeCheck } from 'lucide-react';
import { GradientCard, GradientCardSkeleton } from '@/components/ui/gradient-card';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { Button } from '@/components/ui/button';
import { ChoiceboxGroup } from '@/components/ui/choicebox-1';
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/interactive-empty-state';
import { toast } from '@/components/ui/toast';
import { getCsrfToken } from '@/lib/csrf';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserData {
  id:        number;
  idnumber:  string;
  email:     string;
  firstname: string | null;
  lastname:  string | null;
  admin:     boolean;
  hr:        boolean;
}

interface CertificateItem {
  id:                 number;
  title:              string;
  objective:          string;
  category:           number;
  category_name:      string;
  category_icon:      string;
  file_url:           string;
  original_filename:  string;
  employee_idnumber:  string;
  employee_firstname: string;
  employee_lastname:  string;
  is_new:             boolean;
  created_at:         string;
  updated_at:         string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Routes through the cert-proxy so X-Frame-Options is stripped for embedding. */
function toCertProxyUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return `/api/cert-proxy?path=${encodeURIComponent(pathname)}#toolbar=0&navpanes=0`;
  } catch {
    return `/api/cert-proxy?path=${encodeURIComponent(url)}#toolbar=0&navpanes=0`;
  }
}

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim();
}

// ── PDF Viewer Modal ───────────────────────────────────────────────────────────

function PDFModal({
  cert,
  onClose,
  onSendRequest,
  sending,
}: {
  cert:    CertificateItem;
  onClose: () => void;
  onSendRequest: () => void;
  sending: boolean;
}) {
  const [pdfLoading, setPdfLoading] = useState(true);

  useEffect(() => {
    setPdfLoading(true);
  }, [cert.id]);

  return createPortal(
    <motion.div
      key="pdf-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={sending ? undefined : onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={{ opacity: 0,    scale: 0.95, y: 12 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] truncate">
              {cert.title}
            </h2>
            <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">{cert.category_name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="ml-4 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] transition-colors disabled:opacity-40"
          >
            <X size={15} />
          </button>
        </div>

        {/* PDF iframe */}
        <div className="relative flex-1 overflow-auto cert-modal-scrollbar" style={{ minHeight: '400px' }}>
          {pdfLoading && (
            <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[var(--color-bg-elevated)]/90">
              <div className="flex flex-col items-center gap-2 text-[var(--color-text-muted)]">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#2845D6]" />
                <span className="text-xs">Loading certificate...</span>
              </div>
            </div>
          )}
          <iframe
            src={toCertProxyUrl(cert.file_url)}
            className="w-full"
            style={{ height: '60vh', border: 'none' }}
            title={cert.title}
            onLoad={() => setPdfLoading(false)}
          />
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] px-6 py-4 shrink-0 flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            Issued&nbsp;
            {new Date(cert.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day:   'numeric',
              year:  'numeric',
            })}
          </p>
          <Button
            onClick={onSendRequest}
            disabled={sending}
            size="sm"
            className={cn('flex items-center gap-2 min-w-[160px] justify-center text-xs font-normal px-4 py-2 rounded-lg', sending && 'pointer-events-none')}
          >
            <>
              <Mail size={14} />
              Send to Email
            </>
          </Button>
        </div>
      </motion.div>
    </motion.div>
  , document.body);
}

// ── Page skeleton ──────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="mx-auto p-4 sm:p-6 space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-44 rounded-lg bg-[var(--color-border)] animate-pulse" />
        <div className="h-4 w-72 rounded bg-[var(--color-border)] animate-pulse" />
      </div>
      <div className="grid grid-cols-1 max-[480px]:grid-cols-1 min-[481px]:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))] gap-5 pt-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <GradientCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function CertificationPage() {
  const router = useRouter();

  const [user,        setUser       ] = useState<UserData | null>(null);
  const [authPhase,   setAuthPhase  ] = useState<'spinner' | 'checking' | 'done'>('spinner');
  const [certs,       setCerts      ] = useState<CertificateItem[]>([]);
  const [loading,     setLoading    ] = useState(true);
  const [viewCert,    setViewCert   ] = useState<CertificateItem | null>(null);
  const [sending,     setSending    ] = useState(false);
  const [workEmail,   setWorkEmail  ] = useState('');
  const [sendFlow,    setSendFlow   ] = useState<'none' | 'select' | 'confirm'>('none');
  const [sendChoice,  setSendChoice ] = useState<'personal' | 'work' | ''>('');
  const [recipient,   setRecipient  ] = useState('');

  // ── Auth ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const toChecking = setTimeout(() => setAuthPhase('checking'), 300);
    let checkingShownAt = 0;
    setTimeout(() => { checkingShownAt = Date.now(); }, 300);

    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => {
        if (!r.ok) { router.replace('/'); return null; }
        return r.json() as Promise<UserData>;
      })
      .then((u) => {
        if (!u) return;
        // Admin or HR users go to the management view
        if (u.admin || u.hr) { router.replace('/dashboard/certification/admin'); return; }
        setUser(u);
        fetch('/api/user-profile/me', { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : null))
          .then((profile: { personal_info?: { work_email?: string } } | null) => {
            setWorkEmail(normalizeEmail(profile?.personal_info?.work_email));
          })
          .catch(() => {
            setWorkEmail('');
          });
        const elapsed   = Date.now() - checkingShownAt;
        const remaining = checkingShownAt === 0 ? 600 : Math.max(0, 600 - elapsed);
        setTimeout(() => setAuthPhase('done'), remaining);
      })
      .catch(() => router.replace('/'));

    return () => clearTimeout(toChecking);
  }, [router]);

  // ── Fetch certificates ─────────────────────────────────────────────────────
  const fetchCerts = useCallback(() => {
    setLoading(true);
    fetch('/api/certificates/my', { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json() as Promise<{ results: CertificateItem[]; count: number }>;
      })
      .then((data) => setCerts(data.results))
      .catch(() => toast.error('Failed to load certificates.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (authPhase !== 'done') return;
    fetchCerts();
  }, [authPhase, fetchCerts]);

  // ── Open certificate (mark as viewed) ────────────────────────────────────
  function handleOpenCert(cert: CertificateItem) {
    setViewCert(cert);
    // Mark as viewed if still new
    if (cert.is_new) {
      fetch(`/api/certificates/${cert.id}/mark-viewed`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'X-CSRFToken': getCsrfToken() },
      })
        .then((r) => {
          if (r.ok) {
            setCerts((prev) =>
              prev.map((c) => c.id === cert.id ? { ...c, is_new: false } : c)
            );
            window.dispatchEvent(new Event('certificate-badge-refresh'));
          }
        })
        .catch(() => {
          /* non-fatal */
        });
    }
  }

  async function handleSendEmail(recipientEmail: string) {
    if (!viewCert || !recipientEmail) return;
    setSending(true);
    try {
      const res = await fetch(`/api/certificates/${viewCert.id}/send-email`, {
        method:      'POST',
        credentials: 'include',
        headers:     {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify({ recipient_email: recipientEmail }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        toast.error(err.detail ?? 'Failed to send email.');
        return;
      }
      toast.success(`Certificate sent to ${recipientEmail}.`);
      setSendFlow('none');
      setSendChoice('');
      setRecipient('');
    } finally {
      setSending(false);
    }
  }

  const personalEmail = normalizeEmail(user?.email);
  const workEmailValue = normalizeEmail(workEmail);
  const handleRecipientChoiceChange = useCallback((value: string) => {
    setSendChoice(value as 'personal' | 'work' | '');
  }, []);

  function openSendFlow() {
    const uniqueEmails = Array.from(
      new Set(
        [personalEmail, workEmailValue]
          .filter(Boolean)
          .map((email) => email.toLowerCase()),
      ),
    );

    if (uniqueEmails.length === 0) {
      toast.error('No recipient email on file.');
      return;
    }

    if (uniqueEmails.length === 1) {
      setRecipient(uniqueEmails[0]);
      setSendFlow('confirm');
      return;
    }

    setSendChoice('');
    setRecipient('');
    setSendFlow('select');
  }

  function resolveSelectionEmail(): string {
    if (sendChoice === 'personal') return personalEmail.toLowerCase();
    if (sendChoice === 'work') return workEmailValue.toLowerCase();
    return '';
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (authPhase === 'spinner') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#2845D6]" />
      </div>
    );
  }
  if (authPhase !== 'done') {
    return (
      <div className="flex h-full items-center justify-center">
        <TextShimmer className="text-sm" duration={1.4}>Checking permissions…</TextShimmer>
      </div>
    );
  }
  if (loading) return <PageSkeleton />;

  const displayName = user
    ? [user.firstname, user.lastname].filter(Boolean).join(' ') || user.idnumber
    : '';
  const newCertCount = certs.filter((cert) => cert.is_new).length;
  const orderedCerts = [...certs].sort((a, b) => Number(b.is_new) - Number(a.is_new));

  return (
    <div className="w-full p-4 sm:p-6 space-y-6">
      {/* Page header */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-bold text-[var(--color-text-primary)]">My Certificates</h1>
        </div>
        {displayName && (
          <p className="text-xs text-[var(--color-text-muted)]">
            Professional Certifications and Achievements
          </p>
        )}
      </div>

      {/* Certificate grid */}
      {certs.length === 0 ? (
        <EmptyState
          title="No certificates yet"
          description="Your certificates will appear here once they have been issued."
          icons={[FileText, BadgeCheck, Award]}
        />
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="grid grid-cols-1 max-[480px]:grid-cols-1 min-[481px]:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))] gap-5"
        >
          {orderedCerts.map((cert, i) => (
            <GradientCard
              key={cert.id}
              title={cert.title}
              objective={cert.objective}
              category_name={cert.category_name}
              icon_key={cert.category_icon}
              index={i}
              is_new={cert.is_new}
              onClick={() => handleOpenCert(cert)}
              className="w-full lg:max-w-[24rem]"
            />
          ))}
        </motion.div>
      )}

      {/* PDF viewer modal */}
      <AnimatePresence>
        {viewCert && (
          <PDFModal
            key={`pdf-modal-${viewCert.id}`}
            cert={viewCert}
            onClose={() => {
              if (!sending) {
                setViewCert(null);
                setSendFlow('none');
                setSendChoice('');
                setRecipient('');
              }
            }}
            onSendRequest={openSendFlow}
            sending={sending}
          />
        )}

        {viewCert && sendFlow === 'select' && (
          <Modal
            key={`recipient-select-modal-${viewCert.id}`}
            open={true}
            onOpenChange={(open) => {
              if (!open && !sending) {
                setSendFlow('none');
                setSendChoice('');
              }
            }}
          >
            <ModalContent className="max-w-sm">
              <ModalHeader>
                <ModalTitle>Select recipient email</ModalTitle>
              </ModalHeader>
              <ModalBody className="space-y-2">
                <p className="text-xs text-[var(--color-text-muted)]">Choose where to send this certificate.</p>
                <ChoiceboxGroup
                  direction="column"
                  type="radio"
                  value={sendChoice}
                  onChange={handleRecipientChoiceChange}
                >
                  <ChoiceboxGroup.Item
                    value="personal"
                    title="Personal email"
                    description={personalEmail || 'No personal email on file'}
                    disabled={!personalEmail}
                  />
                  <ChoiceboxGroup.Item
                    value="work"
                    title="Work email"
                    description={workEmailValue || 'No work email on file'}
                    disabled={!workEmailValue}
                  />
                </ChoiceboxGroup>
              </ModalBody>
              <ModalFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!sending) {
                      setSendFlow('none');
                      setSendChoice('');
                    }
                  }}
                  disabled={sending}
                  className="text-xs text-xs font-normal py-2 px-4 rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const email = resolveSelectionEmail();
                    if (!email) return;
                    setRecipient(email);
                    void handleSendEmail(email);
                  }}
                  disabled={sending || !sendChoice}
                  className="text-xs font-normal py-2 px-4 rounded-lg"
                >
                  {sending ? (
                    <TextShimmer className="text-xs" duration={1.2}>Sending Email...</TextShimmer>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <Mail size={14} />
                      Send Email
                    </span>
                  )}
                </Button>
              </ModalFooter>
            </ModalContent>
          </Modal>
        )}

        {viewCert && sendFlow === 'confirm' && (
          <Modal
            key={`recipient-confirm-modal-${viewCert.id}`}
            open={true}
            onOpenChange={(open) => {
              if (!open && !sending) {
                setSendFlow('none');
                setRecipient('');
              }
            }}
          >
            <ModalContent className="max-w-sm">
              <ModalHeader>
                <ModalTitle>Send certificate email</ModalTitle>
              </ModalHeader>
              <ModalBody>
                <p className="text-xs text-[var(--color-text-muted)]">Send this certificate to {recipient}?</p>
              </ModalBody>
              <ModalFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!sending) {
                      setSendFlow('none');
                      setRecipient('');
                    }
                  }}
                  disabled={sending}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (!recipient) return;
                    void handleSendEmail(recipient);
                  }}
                  disabled={sending}
                  className="min-w-[128px] text-xs"
                >
                  {sending ? (
                    <TextShimmer className="text-xs" duration={1.2}>Sending Email...</TextShimmer>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <Mail size={14} />
                      Send Email
                    </span>
                  )}
                </Button>
              </ModalFooter>
            </ModalContent>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

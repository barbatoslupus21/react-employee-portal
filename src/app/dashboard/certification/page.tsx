'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mail, FileText, Award, BadgeCheck } from 'lucide-react';
import { GradientCard, GradientCardSkeleton } from '@/components/ui/gradient-card';
import { WaveLoader } from '@/components/ui/wave-loader';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/interactive-empty-state';
import { toast } from '@/components/ui/toast';
import { getCsrfToken } from '@/lib/csrf';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserData {
  id:        number;
  idnumber:  string;
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

// ── PDF Viewer Modal ───────────────────────────────────────────────────────────

function PDFModal({
  cert,
  onClose,
  onSend,
  sending,
}: {
  cert:    CertificateItem;
  onClose: () => void;
  onSend:  () => void;
  sending: boolean;
}) {
  return (
    <motion.div
      key="pdf-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
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
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{cert.category_name}</p>
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
        <div className="flex-1 overflow-hidden" style={{ minHeight: '400px' }}>
          <iframe
            src={toCertProxyUrl(cert.file_url)}
            className="w-full"
            style={{ height: '60vh', border: 'none' }}
            title={cert.title}
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
            onClick={onSend}
            disabled={sending}
            size="sm"
            className={cn('flex items-center gap-2 min-w-[160px] justify-center text-sm font-normal px-6 py-4', sending && 'pointer-events-none')}
          >
            {sending ? (
              <>
                <WaveLoader barCount={4} height={14} color="white" />
                <TextShimmer className="text-white text-sm">Sending Email...</TextShimmer>
              </>
            ) : (
              <>
                <Mail size={15} />
                Send to Email
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Page skeleton ──────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="mx-auto p-4 sm:p-6 space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-44 rounded-lg bg-[var(--color-border)] animate-pulse" />
        <div className="h-4 w-72 rounded bg-[var(--color-border)] animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pt-2">
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
      }).then((r) => {
        if (r.ok) {
          // Clear the is_new flag locally so the pill disappears immediately
          setCerts((prev) =>
            prev.map((c) => c.id === cert.id ? { ...c, is_new: false } : c)
          );
        }
      }).catch(() => {/* non-fatal */});
    }
  }

  // ── Send email ──────────────────────────────────
  async function handleSendEmail() {
    if (!viewCert) return;
    setSending(true);
    try {
      const res = await fetch(`/api/certificates/${viewCert.id}/send-email`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'X-CSRFToken': getCsrfToken() },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        toast.error(err.detail ?? 'Failed to send email.');
        return;
      }
      toast.success('Certificate sent to your email successfully.');
    } finally {
      setSending(false);
    }
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

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">My Certificates</h1>
        {displayName && (
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Certificates issued to {displayName}
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
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {certs.map((cert, i) => (
            <GradientCard
              key={cert.id}
              title={cert.title}
              objective={cert.objective}
              category_name={cert.category_name}
              icon_key={cert.category_icon}
              index={i}
              is_new={cert.is_new}
              onClick={() => handleOpenCert(cert)}
            />
          ))}
        </motion.div>
      )}

      {/* PDF viewer modal */}
      <AnimatePresence>
        {viewCert && (
          <PDFModal
            cert={viewCert}
            onClose={() => { if (!sending) setViewCert(null); }}
            onSend={handleSendEmail}
            sending={sending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

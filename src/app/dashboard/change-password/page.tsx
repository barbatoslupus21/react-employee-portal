'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Eye, EyeOff, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { getCsrfToken } from '@/lib/csrf';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserData {
  change_password: boolean;
  idnumber: string;
}

interface Policy {
  min_length:              number;
  require_uppercase:       boolean;
  require_lowercase:       boolean;
  require_number:          boolean;
  require_special_character: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function allPolicyOk(pw: string, policy: Policy | null): boolean {
  if (!policy) return true;
  if (pw.length < policy.min_length) return false;
  if (policy.require_uppercase && !/[A-Z]/.test(pw)) return false;
  if (policy.require_lowercase && !/[a-z]/.test(pw)) return false;
  if (policy.require_number    && !/\d/.test(pw)) return false;
  if (policy.require_special_character && !/[!@#$%^&*()\-_=+\[\]{};:'",.<>?/\\|`~]/.test(pw)) return false;
  return true;
}

function PolicyRule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${ok ? 'text-green-600' : 'text-[var(--color-text-muted)]'}`}>
      {ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      <span>{label}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ChangePasswordPage() {
  const router = useRouter();

  // ── Auth / loading ──────────────────────────────────────────────────────────
  const [loading,  setLoading]  = useState(true);
  const [user,     setUser]     = useState<UserData | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) { router.replace('/'); return; }
      const data: UserData = await res.json();
      // If no forced change is required, redirect away — nothing to do here.
      if (!data.change_password) { router.replace('/dashboard'); return; }
      setUser(data);
    } catch {
      router.replace('/');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  // ── Password policy ─────────────────────────────────────────────────────────
  const [policy, setPolicy] = useState<Policy | null>(null);

  useEffect(() => {
    fetch('/api/general-settings/password-policy', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: Policy | null) => { if (d) setPolicy(d); })
      .catch(() => {});
  }, []);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [current,     setCurrent]     = useState('');
  const [newPw,       setNewPw]       = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const canSubmit =
    !saving &&
    current.length > 0 &&
    newPw.length > 0 &&
    confirm.length > 0 &&
    newPw === confirm &&
    allPolicyOk(newPw, policy);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/user-profile/change-password', {
        method:      'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken':  getCsrfToken(),
        },
        body: JSON.stringify({
          current_password: current,
          new_password:     newPw,
          confirm_password: confirm,
        }),
      });

      if (res.ok) {
        router.replace('/dashboard');
      } else {
        const err = await res.json().catch(() => ({})) as Record<string, string | string[]>;
        const msg =
          (Array.isArray(err.current_password) ? err.current_password[0] : err.current_password) ??
          (Array.isArray(err.new_password)     ? err.new_password[0]     : err.new_password) ??
          (Array.isArray(err.confirm_password) ? err.confirm_password[0] : err.confirm_password) ??
          (typeof err.detail === 'string' ? err.detail : null) ??
          'Password change failed. Please try again.';
        setError(msg);
      }
    } catch {
      setError('Unable to reach the server. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Loading state ───────────────────────────────────────────────────────────
  if (loading || !user) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[#2845D6]" />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full items-start justify-center overflow-y-auto p-4 sm:p-8
      [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="w-full max-w-sm space-y-5 pt-4">

        {/* Security banner */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="flex items-start gap-3 rounded-xl border border-amber-200
            bg-amber-50 px-4 py-3.5 text-sm text-amber-800
            dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300"
        >
          <ShieldAlert size={17} className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">Password Reset Required</p>
            <p className="text-xs leading-relaxed">
              Your account password was reset by an administrator. You must set a new
              password before continuing. Do not use the default password as your permanent
              password.
            </p>
          </div>
        </motion.div>

        {/* Form card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut', delay: 0.05 }}
          className="rounded-2xl border border-[var(--color-border)]
            bg-[var(--color-bg-elevated)] p-6 shadow-sm space-y-5"
        >
          <div>
            <h1 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Change Password
            </h1>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Enter the default password, then choose a secure new password.
            </p>
          </div>

          {/* Inline error */}
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2
                text-xs text-red-700 dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-400"
            >
              {error}
            </motion.p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Current (default) password */}
            <Input
              label="Current Password"
              type={showCurrent ? 'text' : 'password'}
              value={current}
              onChange={e => setCurrent(e.target.value)}
              placeholder={`Repco_${user.idnumber}`}
              disabled={saving}
              trailingIcon={
                <button
                  type="button"
                  onClick={() => setShowCurrent(v => !v)}
                  className="h-7 w-4 flex items-center justify-center
                    text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  aria-label="Toggle current password visibility"
                >
                  {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
            />

            {/* New password */}
            <Input
              label="New Password"
              type={showNew ? 'text' : 'password'}
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="Enter a new secure password"
              disabled={saving}
              trailingIcon={
                <button
                  type="button"
                  onClick={() => setShowNew(v => !v)}
                  className="h-7 w-4 flex items-center justify-center
                    text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  aria-label="Toggle new password visibility"
                >
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
            />

            {/* Password policy checklist */}
            {policy && newPw.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-[var(--color-border)]
                  bg-[var(--color-bg)] p-3 space-y-1.5"
              >
                <PolicyRule
                  ok={newPw.length >= policy.min_length}
                  label={`At least ${policy.min_length} characters`}
                />
                {policy.require_uppercase && (
                  <PolicyRule ok={/[A-Z]/.test(newPw)} label="At least one uppercase letter (A–Z)" />
                )}
                {policy.require_lowercase && (
                  <PolicyRule ok={/[a-z]/.test(newPw)} label="At least one lowercase letter (a–z)" />
                )}
                {policy.require_number && (
                  <PolicyRule ok={/\d/.test(newPw)} label="At least one digit (0–9)" />
                )}
                {policy.require_special_character && (
                  <PolicyRule
                    ok={/[!@#$%^&*()\-_=+\[\]{};:'",.<>?/\\|`~]/.test(newPw)}
                    label="At least one special character"
                  />
                )}
              </motion.div>
            )}

            {/* Confirm password */}
            <Input
              label="Confirm New Password"
              type={showConfirm ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat your new password"
              disabled={saving}
              error={
                confirm.length > 0 && newPw !== confirm
                  ? 'Passwords do not match'
                  : undefined
              }
              success={
                confirm.length > 0 && newPw === confirm
                  ? 'Passwords match'
                  : undefined
              }
              trailingIcon={
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="h-7 w-4 flex items-center justify-center
                    text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  aria-label="Toggle confirm password visibility"
                >
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
            />

            <Button
              type="submit"
              disabled={!canSubmit}
              className="w-full"
            >
              {saving
                ? <TextShimmer className="text-sm text-white" duration={1.2}>Updating…</TextShimmer>
                : 'Set New Password'}
            </Button>

          </form>
        </motion.div>

      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { X, Eye, EyeOff, AlertCircle } from "lucide-react";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { getCsrfToken } from "@/lib/csrf";

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

type LoginError = { message: string };

export default function LoginModal({ open, onClose }: LoginModalProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [idnumber, setIdnumber] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<LoginError | null>(null);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setIdnumber("");
      setPassword("");
      setError(null);
      setLoading(false);
      setShowPassword(false);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Ensure the CSRF cookie is present before submitting.
      // It is normally seeded on page load, but lazy-seed here as a fallback.
      let csrfToken = getCsrfToken();
      if (!csrfToken) {
        await fetch('/api/auth/csrf', { credentials: 'include' });
        csrfToken = getCsrfToken();
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ username: idnumber, password }),
      });

      const data = await res.json();

      if (res.ok) {
        onClose();
        if (data?.user?.change_password) {
          router.push("/dashboard/change-password");
        } else {
          router.push("/dashboard");
        }
        return;
      }

      if (res.status === 403) {
        if (data.code === "account_locked") {
          setError({
            message:
              "Your account is locked. Please proceed to HR for unlocking.",
          });
        } else if (data.code === "account_inactive") {
          setError({
            message:
              "Your account has been deactivated. Please contact HR.",
          });
        } else {
          setError({ message: data.detail ?? "Access denied." });
        }
      } else {
        setError({ message: "Invalid ID number or password." });
      }
    } catch {
      setError({
        message: "Unable to reach the server. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          onClick={onClose}
          className="fixed inset-0 z-[90] flex items-center justify-center
            bg-[var(--color-modal-overlay)] backdrop-blur-md p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm rounded-2xl border
              border-[var(--color-border)] bg-[var(--color-bg-elevated)]
              shadow-2xl overflow-hidden"
          >
            {/* Close */}
            <button
              onClick={onClose}
              disabled={loading}
              className="absolute top-4 right-4 flex h-8 w-8 items-center
                justify-center rounded-full text-[var(--color-text-muted)]
                hover:bg-[var(--color-bg-card)] transition-colors duration-200
                disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Close login"
            >
              <X size={18} />
            </button>

            <div className="p-8">
              {/* Logo */}
              <div className="mb-8 text-center">
                <span className="text-lg font-black tracking-tight">
                  <span className="text-[#2845D6]">REP</span>
                  <span className="text-filled text-[var(--color-text-primary)]">
                    Connect
                  </span>
                </span>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  Coordinate • Communicate • Collaborate.
                </p>
              </div>

              {/* Error alert */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="mb-4 flex items-start gap-2.5 rounded-xl border
                      border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700
                      dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-400"
                  >
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{error.message}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Form */}
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label
                    htmlFor="login-idnumber"
                    className="mb-1.5 block text-xs font-medium
                      text-[var(--color-text-muted)] uppercase tracking-wider"
                  >
                    ID Number
                  </label>
                  <input
                    id="login-idnumber"
                    type="text"
                    autoComplete="username"
                    placeholder="Enter your ID number"
                    value={idnumber}
                    onChange={(e) => setIdnumber(e.target.value)}
                    disabled={loading}
                    required
                    className="w-full rounded-xl border border-[var(--color-border)]
                      bg-[var(--color-bg-card)] px-4 py-3 text-sm
                      text-[var(--color-text-primary)]
                      placeholder:text-[var(--color-text-muted)]
                      focus:border-[#2845D6] focus:outline-none
                      focus:ring-2 focus:ring-[#2845D6]/20
                      disabled:opacity-50 disabled:cursor-not-allowed
                      transition-all duration-200"
                  />
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="mb-1.5 block text-xs font-medium
                      text-[var(--color-text-muted)] uppercase tracking-wider"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      required
                      className="w-full rounded-xl border border-[var(--color-border)]
                        bg-[var(--color-bg-card)] px-4 py-3 pr-12 text-sm
                        text-[var(--color-text-primary)]
                        placeholder:text-[var(--color-text-muted)]
                        focus:border-[#2845D6] focus:outline-none
                        focus:ring-2 focus:ring-[#2845D6]/20
                        disabled:opacity-50 disabled:cursor-not-allowed
                        transition-all duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={loading}
                      className="absolute right-3 top-1/2 -translate-y-1/2
                        text-[var(--color-text-muted)]
                        hover:text-[var(--color-text-secondary)]
                        disabled:opacity-40
                        transition-colors duration-200"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !idnumber.trim() || !password}
                  className="mt-2 w-full rounded-full bg-[#2845D6] py-3 text-sm
                    font-semibold text-white transition-all duration-200
                    hover:bg-[#1e38b0] active:scale-[0.98]
                    disabled:opacity-70 disabled:cursor-not-allowed
                    disabled:active:scale-100"
                >
                  {loading ? (
                    <TextShimmer duration={1.2}>Authenticating…</TextShimmer>
                  ) : (
                    "Login"
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, ChevronUp } from "lucide-react";

// Versioned key — bump the version when you want all users to re-consent
const CONSENT_KEY = "repconnect-privacy-consent-v1";

const PRIVACY_NOTICE = `Introduction: Ryonan Electric Philippines ("we", "us", or "the Company") values your privacy. This notice explains what personal information we collect through the REPConnect portal, how we use it, how we keep it safe, and what rights you have over your data. This applies to all employees, trainees (OJT), and authorized users of the system.

What Information We Collect: When you use REPConnect, we may collect the following: personal details — your name, employee ID number, email address, and username; employment information — your job title, department, line assignment, and employment type (regular, OJT, etc.); payroll and finance data — payslips, allowances, loans, savings, and deduction records; leave and attendance records — leave requests, approval history, and attendance logs; training and evaluation data — training records, performance evaluations, and certificates; system activity — login times, actions performed, and notifications received; uploaded documents — files you submit such as forms, requests, or supporting documents.

How We Use Your Information: We use your information only for the following purposes: to manage your employment records, payroll, and benefits; to process leave requests, loans, allowances, and savings; to send you announcements, notifications, and important updates; to track training progress and performance evaluations; to generate reports needed for company operations; to improve the REPConnect system and your experience using it; to meet legal and regulatory requirements.

Who Can See Your Information: Your personal information is only shared with people who need it to do their job: HR and Finance staff — to manage your records, payroll, and benefits; your managers or supervisors — to approve requests and review performance; system administrators — to maintain and support the REPConnect portal; government agencies — only when required by Philippine law. We do not sell or share your personal information with outside companies for marketing or advertising.

How We Protect Your Information: We take the safety of your data seriously. We use the following measures to keep it secure: password-protected accounts with secure login; role-based access so only authorized people can view sensitive data; regular system updates and security checks; secure storage of all files and records.

How Long We Keep Your Data: We keep your personal information for as long as you are employed with the Company, and for a reasonable period after, as required by law or for record-keeping purposes. Once your data is no longer needed, it will be securely deleted or made anonymous.

Your Rights: Under the Data Privacy Act of 2012 (Republic Act No. 10173), you have the right to: be informed — know what data we collect and why; access — request a copy of your personal information; correct — ask us to fix any wrong or outdated information; erase or block — request deletion of your data when it is no longer needed; object — refuse or withdraw your consent at any time; get a copy — receive your data in a commonly used format; claim damages — seek compensation if your data is misused or mishandled. To exercise any of these rights, contact the HR Department or send an email to your system administrator.

Changes to This Notice: We may update this privacy notice from time to time. If we make significant changes, we will notify you through the REPConnect portal. We encourage you to review this notice regularly.

Contact Us: If you have any questions or concerns about this privacy notice or how your data is handled, please reach out to: HR Department — Ryonan Electric Philippines; MIS / System Administrator — REPConnect Support.

This privacy notice is effective as of January 1, 2025 and applies to all users of the REPConnect portal.`;

export default function PrivacyConsentModal() {
  // null = not yet checked (SSR / first render), true = show, false = hide
  const [show, setShow] = useState<boolean | null>(null);
  const [noticeExpanded, setNoticeExpanded] = useState(false);

  // On mount, check if user has already consented
  useEffect(() => {
    let accepted = false;
    try {
      accepted = localStorage.getItem(CONSENT_KEY) === "accepted";
    } catch {
      accepted = false;
    }
    setShow(!accepted);
  }, []);

  // Lock body scroll while visible
  useEffect(() => {
    if (show !== true) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [show]);

  const handleAgree = () => {
    try {
      localStorage.setItem(CONSENT_KEY, "accepted");
    } catch {
      // If localStorage is unavailable, proceed anyway
    }
    setShow(false);
  };

  const handleDecline = () => {
    // Try to close the tab; if that fails, navigate away
    try { window.close(); } catch { /* noop */ }
    window.location.href = "about:blank";
  };

  // Don't render anything until we know the consent status (avoids SSR flash)
  if (show === null) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="p-6 pb-4 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
                    Data Privacy Consent
                  </h2>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    REPConnect Employee Portal
                  </p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                Before using REPConnect, please read and agree to our Data Privacy Notice. By clicking{" "}
                <strong className="text-[var(--color-text-primary)]">I Agree</strong>, you confirm
                that you allow Ryonan Electric Philippines to collect, store, use, update, and manage
                your personal information as described, in accordance with the{" "}
                <strong className="text-[var(--color-text-primary)]">Data Privacy Act of 2012</strong>.
              </p>

              {/* Toggle full notice */}
              <button
                onClick={() => setNoticeExpanded((v) => !v)}
                className="flex items-center gap-2 text-sm font-semibold text-[#2845D6] hover:underline transition-colors"
              >
                {noticeExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {noticeExpanded ? "Hide" : "Read"} Full Privacy Notice
              </button>

              <AnimatePresence>
                {noticeExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="max-h-56 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 text-xs leading-relaxed text-[var(--color-text-muted)] whitespace-pre-line">
                      {PRIVACY_NOTICE}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer actions */}
            <div className="p-6 pt-4 border-t border-[var(--color-border)] flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button
                onClick={handleAgree}
                className="rounded-full bg-[#2845D6] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#1e38b0] transition-all active:scale-[0.97]"
              >
                I Agree
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

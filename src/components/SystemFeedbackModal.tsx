'use client';

import { useEffect, useState } from 'react';
import { getCsrfToken } from '@/lib/csrf';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { TextareaWithCharactersLeft } from '@/components/ui/textarea-with-characters-left';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/modal';
import { Rating } from '@/components/ui/rating';
import { Check, Eye, EyeOff, Lock, Pencil, Plus, Trash2, X } from "lucide-react";

interface SystemFeedbackModalProps {
  /** The currently logged-in user. Must have admin=false to see this modal. */
  userId: number;
  admin: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SystemFeedbackModal({ userId, admin, onOpenChange }: SystemFeedbackModalProps) {
  const sessionKey = `feedback_modal_dismissed_${userId}`;
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    // Admins never see this modal
    if (admin) return;

    // Already dismissed this session for this user
    if (sessionStorage.getItem(sessionKey) === 'true') return;

    const check = async () => {
      try {
        const statusRes = await fetch('/api/feedback/status', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!statusRes.ok) return;

        const statusData = (await statusRes.json()) as {
          feedback_enabled: boolean;
          show_feedback_modal: boolean;
          submitted_this_month: boolean;
          feedback_modal_appearance_count: number;
          feedback_modal_max_appearances: number;
        };

        if (statusData.feedback_enabled && statusData.show_feedback_modal) {
          setOpen(true);
        }
      } catch {
        // Silently ignore — non-critical UI
      }
    };

    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, userId]);

  const handleSkip = () => {
    sessionStorage.setItem(sessionKey, 'true');
    setOpen(false);
  };

  const handleSubmit = async () => {
    if (rating === 0 || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/feedback/records', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify({ rating, feedback_text: feedbackText.trim() }),
      });
      if (res.ok) {
        setSubmitted(true);
        sessionStorage.setItem(sessionKey, 'true');
        setTimeout(() => setOpen(false), 1200);
      }
    } catch {
      // Keep modal open — user can retry
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={() => {}} mobileVariant="dialog">
      <ModalContent className="max-w-md">
        <ModalHeader hideCloseButton>
          <ModalTitle>Share Your Feedback</ModalTitle>
        </ModalHeader>

        <ModalBody className="space-y-5 py-4">
          {submitted ? (
            <p className="text-center text-sm text-[var(--color-text-primary)]">
              Thank you for your feedback! 🎉
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <p className="text-xs text-[var(--color-text-muted)]">
                  How would you rate your experience?
                </p>
                <div className="flex justify-evenly py-3">
                  <div className="scale-150" style={{ transformOrigin: 'center' }}>
                    <Rating
                      rating={rating}
                      editable
                      onRatingChange={(r) => setRating(r)}
                      showValue={false}
                      size="lg"
                    />
                  </div>
                </div>
                {rating > 0 && (
                  <p className="text-center text-[11px] text-[var(--color-text-muted)]">
                    {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][rating]}
                  </p>
                )}
              </div>

              <TextareaWithCharactersLeft
                maxLength={2000}
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Tell us what you think..."
                rows={4}
              />
            </>
          )}
        </ModalBody>

        {!submitted && (
          <ModalFooter className="flex justify-between gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md px-4 py-2 text-xs font-normal text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              onClick={handleSkip}
              disabled={submitting}
            >
              Maybe Later
            </button>

            <button
              type="button"
              disabled={rating === 0 || submitting}
              onClick={() => void handleSubmit()}
              className={`inline-flex min-w-[90px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-normal text-white transition-opacity ${
                rating === 0 ? 'cursor-not-allowed bg-[#2845D6] opacity-40' : 'bg-[#2845D6] hover:bg-[#1f3eb5]'
              }`}
            >
              {submitting ? (
                <TextShimmer className="text-xs" duration={1.2}>
                  Submitting...
                </TextShimmer>
              ) : (
                <><Check size={13} /> Submit Feedback</>
              )}
            </button>
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  );
}

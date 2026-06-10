'use client';

import { useEffect, useState } from 'react';
import { getCsrfToken } from '@/lib/csrf';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/modal';

interface SystemUpdate {
  id: number;
  version: string;
  description: string;
  created_at: string;
}

interface WhatIsNewModalProps {
  userId: number;
  admin: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function WhatIsNewModal({ userId, admin, onOpenChange }: WhatIsNewModalProps) {
  const [open, setOpen] = useState(false);
  const [updates, setUpdates] = useState<SystemUpdate[]>([]);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (admin) return;

    const load = async () => {
      try {
        const res = await fetch('/api/feedback/updates/unseen', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as SystemUpdate[];
        if (data.length > 0) {
          setUpdates(data);
          setOpen(true);
        }
      } catch {
        // Non-critical — silently ignore
      }
    };

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, userId]);

  const handleGotIt = async () => {
    if (marking) return;
    setMarking(true);

    // Optimistic dismiss
    setOpen(false);

    try {
      await fetch('/api/feedback/updates/seen', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify({ update_ids: updates.map((u) => u.id) }),
      });
    } catch {
      // Dismissed optimistically — if this fails the modal won't reappear
      // until the next session, which is acceptable
    } finally {
      setMarking(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={() => {}} mobileVariant="dialog">
      <ModalContent className="max-w-md">
        <ModalHeader hideCloseButton>
          <ModalTitle>{"What's New"}</ModalTitle>
        </ModalHeader>

        <ModalBody className="space-y-4 py-4 min-h-[80px] max-h-[60vh] overflow-y-auto">
          {updates.map((update) => (
            <div key={update.id} className="space-y-1">
              <p className="text-xs font-bold text-[var(--color-text-primary)]">
                v{update.version}
              </p>
              <p className="text-xs leading-relaxed whitespace-pre-wrap break-words text-[var(--color-text-muted)]">
                {update.description}
              </p>
            </div>
          ))}
        </ModalBody>

        <ModalFooter className="flex justify-end">
          <button
            type="button"
            onClick={() => void handleGotIt()}
            disabled={marking}
            className="inline-flex items-center justify-center rounded-lg bg-[#2845D6] px-5 py-2 text-xs font-normal text-white hover:bg-[#1f3eb5] disabled:opacity-60"
          >
            Got It
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

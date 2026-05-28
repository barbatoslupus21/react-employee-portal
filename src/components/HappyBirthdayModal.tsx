'use client';

import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';

interface HappyBirthdayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  firstName?: string;
}

export function HappyBirthdayModal({ open, onOpenChange, firstName }: HappyBirthdayModalProps) {
  const greetingName = firstName ? `, ${firstName}` : '';

  return (
    <Modal open={open} onOpenChange={(nextOpen) => onOpenChange(nextOpen)} mobileVariant="dialog">
      <ModalContent className="max-w-sm">
        <ModalHeader hideCloseButton>
          <ModalTitle>Happy Birthday{greetingName}</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-4 py-4">
          <p className="text-sm text-[var(--color-text-primary)]">
            Wishing you a wonderful birthday filled with joy, laughter, and great memories.
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">
            We're sending you warm wishes for a bright and happy year ahead.
          </p>
        </ModalBody>
        <ModalFooter className="justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center justify-center rounded-lg bg-[#2845D6] px-4 py-2 text-xs font-normal text-white hover:bg-[#1f3eb5]"
          >
            Thank You
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

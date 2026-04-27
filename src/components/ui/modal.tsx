'use client';

import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-media-query';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';

const ModalContext = React.createContext<{ isMobile: boolean; open: boolean } | null>(null);

function useModalContext() {
  const context = React.useContext(ModalContext);
  if (!context) {
    throw new Error('Modal subcomponents must be used within <Modal>');
  }
  return context;
}

type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  dialogProps?: React.ComponentProps<typeof Dialog>;
  drawerProps?: React.ComponentProps<typeof Drawer>;
};

const Modal = ({ open, onOpenChange, dialogProps, drawerProps, children }: ModalProps) => {
  const isMobile = useIsMobile();
  const Component = isMobile ? Drawer : Dialog;
  const props = isMobile ? drawerProps : dialogProps;

  return (
    <ModalContext.Provider value={{ isMobile, open }}>
      <Component open={open} onOpenChange={onOpenChange} {...props}>
        {children}
      </Component>
    </ModalContext.Provider>
  );
};

type ModalTriggerProps = {
  className?: string;
  children: React.ReactNode;
  asChild?: boolean;
};

const ModalTrigger = ({ className, children, asChild }: ModalTriggerProps) => {
  const { isMobile } = useModalContext();
  const Component = isMobile ? DrawerTrigger : DialogTrigger;

  return (
    <Component className={className} asChild={asChild}>
      {children}
    </Component>
  );
};

type ModalCloseProps = {
  className?: string;
  children?: React.ReactNode;
  asChild?: boolean;
};

const ModalClose = ({ className, children, asChild }: ModalCloseProps) => {
  const { isMobile } = useModalContext();
  const Component = isMobile ? DrawerClose : DialogClose;

  return (
    <Component className={className} asChild={asChild}>
      {children}
    </Component>
  );
};

type ModalContentProps = {
  children: React.ReactNode;
  className?: string;
};

const ModalContent = ({ className, children }: ModalContentProps) => {
  const { isMobile, open } = useModalContext();

  if (isMobile) {
    return <DrawerContent className={className}>{children}</DrawerContent>;
  }

  // Desktop: framer-motion AnimatePresence drives the open/close animation.
  // tailwindcss-animate is not installed in this project, so Radix's
  // data-state CSS classes (animate-in, zoom-in-95, etc.) produce no effect.
  // We replicate the same animation as the Export Leave Report modal:
  // overlay fades in/out, content fades + scales + translates.
  return (
    <AnimatePresence>
      {open && (
        <DialogPrimitive.Portal forceMount>
          <DialogPrimitive.Overlay asChild forceMount>
            <motion.div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            />
          </DialogPrimitive.Overlay>
          <DialogPrimitive.Content asChild forceMount>
            <motion.div
              className={cn(
                'fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2',
                'flex flex-col max-h-[90vh] overflow-hidden',
                'border border-[var(--color-border)] bg-[var(--color-bg-elevated)]',
                'shadow-2xl sm:rounded-2xl',
                className,
              )}
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.18 }}
            >
              {children}
            </motion.div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      )}
    </AnimatePresence>
  );
};

const ModalHeader = ({
  className,
  children,
  hideCloseButton = false,
  ...props
}: React.ComponentProps<'div'> & { hideCloseButton?: boolean }) => {
  const { isMobile } = useModalContext();
  const headerClass = cn(
    'flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--color-border)]',
    className,
  );

  if (isMobile) {
    return (
      <DrawerHeader className={headerClass} {...props}>
        {children}
        {!hideCloseButton && (
          <DrawerClose className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] transition-colors">
            <X size={16} />
            <span className="sr-only">Close</span>
          </DrawerClose>
        )}
      </DrawerHeader>
    );
  }

  return (
    <div className={headerClass} {...props}>
      {children}
      {!hideCloseButton && (
        <DialogPrimitive.Close className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)] transition-colors">
          <X size={16} />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </div>
  );
};

type ModalTitleProps = {
  className?: string;
  children: React.ReactNode;
};

const ModalTitle = ({ className, children }: ModalTitleProps) => {
  const { isMobile } = useModalContext();
  const Component = isMobile ? DrawerTitle : DialogTitle;

  return <Component className={cn('text-base font-semibold text-[var(--color-text-primary)]', className)}>{children}</Component>;
};

type ModalDescriptionProps = {
  className?: string;
  children: React.ReactNode;
};

const ModalDescription = ({ className, children }: ModalDescriptionProps) => {
  const { isMobile } = useModalContext();
  const Component = isMobile ? DrawerDescription : DialogDescription;

  return <Component className={className}>{children}</Component>;
};

const ModalBody = ({ className, ...props }: React.ComponentProps<'div'>) => {
  return <div className={cn('flex-1 overflow-y-auto px-6 py-5', className)} {...props} />;
};

const ModalFooter = ({ className, ...props }: React.ComponentProps<'div'>) => {
  const { isMobile } = useModalContext();
  const footerClass = cn('flex items-center justify-end gap-2 px-6 pb-5 pt-0', className);

  if (isMobile) {
    return <DrawerFooter className={footerClass} {...props} />;
  }

  return <div className={footerClass} {...props} />;
};

export {
  Modal,
  ModalTrigger,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
};

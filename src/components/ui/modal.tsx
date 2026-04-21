'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-media-query';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
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

const ModalContext = React.createContext<{ isMobile: boolean } | null>(null);

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
    <ModalContext.Provider value={{ isMobile }}>
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
  hideCloseButton?: boolean;
};

const ModalContent = ({ className, children, hideCloseButton = false }: ModalContentProps) => {
  const { isMobile } = useModalContext();
  const Component = isMobile ? DrawerContent : DialogContent;

  return isMobile ? (
    <Component className={className}>{children}</Component>
  ) : (
    <Component className={className} hideCloseButton={hideCloseButton}>
      {children}
    </Component>
  );
};

const ModalHeader = ({ className, ...props }: React.ComponentProps<'div'>) => {
  const { isMobile } = useModalContext();
  const Component = isMobile ? DrawerHeader : DialogHeader;

  return <Component className={cn('border-b border-[var(--color-border)] px-4 py-3', className)} {...props} />;
};

type ModalTitleProps = {
  className?: string;
  children: React.ReactNode;
};

const ModalTitle = ({ className, children }: ModalTitleProps) => {
  const { isMobile } = useModalContext();
  const Component = isMobile ? DrawerTitle : DialogTitle;

  return <Component className={className}>{children}</Component>;
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
  return <div className={cn('px-4 py-4', className)} {...props} />;
};

const ModalFooter = ({ className, ...props }: React.ComponentProps<'div'>) => {
  const { isMobile } = useModalContext();
  const Component = isMobile ? DrawerFooter : DialogFooter;

  return <Component className={className} {...props} />;
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

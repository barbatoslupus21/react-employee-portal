"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import React, { useState, createContext, useContext } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

export interface SidebarLink {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

// ── Context ────────────────────────────────────────────────────────────

const SidebarContext = createContext<SidebarContextProps | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used within a SidebarProvider");
  return context;
};

// ── Provider ───────────────────────────────────────────────────────────

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);
  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

// ── Sidebar entry point ────────────────────────────────────────────────

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => (
  <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
    {children}
  </SidebarProvider>
);

// ── SidebarBody — renders both desktop and mobile ──────────────────────

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => (
  <>
    <DesktopSidebar {...props} />
    <MobileSidebar {...(props as React.ComponentProps<"div">)} />
  </>
);

// ── DesktopSidebar — absolute overlay, hover-expand ────────────────────
//
//  Key design decisions:
//  • position: absolute so expanding doesn't push main content
//  • h-full relative to the nearest positioned ancestor (the content row)
//  • hidden on mobile (md:flex)

const SIDEBAR_COLLAPSED = 60;
const SIDEBAR_EXPANDED = 240;

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate } = useSidebar();
  return (
    <motion.div
      className={cn(
        "absolute left-0 top-0 h-full z-30",
        "hidden md:flex flex-col",
        "bg-[var(--color-bg-elevated)] border-r border-[var(--color-border)]",
        "overflow-hidden",
        className
      )}
      style={{ maxWidth: SIDEBAR_EXPANDED }}
      initial={false}
      animate={{
        width: animate
          ? open
            ? SIDEBAR_EXPANDED
            : SIDEBAR_COLLAPSED
          : SIDEBAR_EXPANDED,
      }}
      transition={{ type: "spring", stiffness: 280, damping: 26, mass: 0.8 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      {...props}
    >
      {children}
    </motion.div>
  );
};

// ── MobileSidebar — slide-in drawer, no top-bar ────────────────────────
//
//  The drawer is triggered by external state (e.g. a Menu button in the
//  top navbar). It renders nothing until open, then animates in from the
//  left over an opaque backdrop. Hidden on md+ breakpoint.

export const MobileSidebar = ({
  className,
  children,
}: React.ComponentProps<"div">) => {
  const { open, setOpen } = useSidebar();
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden fixed inset-0 bg-black/40 z-[99]"
            onClick={() => setOpen(false)}
          />
          {/* Drawer */}
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className={cn(
              "md:hidden fixed inset-y-0 left-0 w-64 z-[100] flex flex-col",
              "bg-[var(--color-bg-elevated)] border-r border-[var(--color-border)]",
              className
            )}
          >
            <button
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center
                rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]
                transition-colors"
              onClick={() => setOpen(false)}
              aria-label="Close sidebar"
            >
              <X size={16} />
            </button>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ── SidebarLink ────────────────────────────────────────────────────────
//
//  Icon sits in a fixed 44px-wide slot so it never shifts horizontally or
//  vertically during expand/collapse. The label animates only opacity and
//  maxWidth (never display:none) to avoid any layout reflow that would
//  move the icon.

export const SidebarLink = ({
  link,
  className,
  active = false,
}: {
  link: SidebarLink;
  className?: string;
  active?: boolean;
}) => {
  const { open, animate } = useSidebar();
  return (
    <Link
      href={link.href}
      title={link.label}
      className={cn(
        "flex items-center h-10 rounded-lg transition-colors duration-150",
        active
          ? "bg-[#2845D6]/10 text-[#2845D6]"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]",
        className
      )}
    >
      {/* Fixed-width icon slot — always centered, never moves */}
      <span className="flex h-10 w-[40px] shrink-0 items-center justify-center">
        {link.icon}
      </span>

      {/* Label — always in DOM, animated via opacity+maxWidth only */}
      <motion.span
        initial={false}
        animate={{
          opacity: animate ? (open ? 1 : 0) : 1,
          maxWidth: animate ? (open ? 160 : 0) : 160,
        }}
        transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
        className="overflow-hidden whitespace-nowrap text-sm font-medium"
      >
        {link.label}
      </motion.span>
    </Link>
  );
};

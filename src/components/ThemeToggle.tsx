"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { motion, useReducedMotion } from "motion/react";

export default function ThemeToggle() {
  const { toggle } = useTheme();
  const prefersReduced = useReducedMotion();

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="relative flex h-9 w-9 items-center justify-center rounded-full
        border border-[var(--color-border)] bg-[var(--color-bg-card)]
        text-[var(--color-text-primary)] transition-colors duration-200
        hover:bg-[var(--color-border)]"
    >
      <motion.span
        key="theme-icon"
        initial={false}
        animate={{ rotate: prefersReduced ? 0 : 360 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex items-center justify-center"
      >
        {/* Sun for light mode (visible in dark), Moon for dark mode (visible in light) */}
        <Sun
          size={18}
          className="absolute transition-opacity duration-200
            opacity-0 [data-theme='dark']_&:opacity-100
            hidden [[data-theme='dark']_&]:block"
        />
        <Moon
          size={18}
          className="transition-opacity duration-200
            [[data-theme='dark']_&]:hidden"
        />
      </motion.span>
    </button>
  );
}

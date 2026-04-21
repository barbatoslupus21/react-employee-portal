'use client';

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Award,
  GraduationCap,
  Shield,
  BookOpen,
  CheckSquare,
  TrendingUp,
  Heart,
  FileText,
  ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Icon mapping ───────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  award:       Award,
  graduation:  GraduationCap,
  safety:      Shield,
  training:    BookOpen,
  compliance:  CheckSquare,
  performance: TrendingUp,
  health:      Heart,
};

// ── Gradient configs (orange → gray → purple → green, cycling) ─────────────────

const GRADIENT_CONFIGS = [
  {
    gradient: 'from-orange-500/15 via-orange-400/5 to-transparent',
    border:   'border-orange-500/25',
    iconBg:   'bg-orange-500/15',
    iconText: 'text-orange-500',
    badge:    'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    cta:      'text-orange-600 dark:text-orange-400',
  },
  {
    gradient: 'from-slate-500/15 via-slate-400/5 to-transparent',
    border:   'border-slate-400/25',
    iconBg:   'bg-slate-500/15',
    iconText: 'text-slate-500',
    badge:    'bg-slate-500/10 text-slate-600 dark:text-slate-400',
    cta:      'text-slate-600 dark:text-slate-400',
  },
  {
    gradient: 'from-purple-500/15 via-purple-400/5 to-transparent',
    border:   'border-purple-500/25',
    iconBg:   'bg-purple-500/15',
    iconText: 'text-purple-500',
    badge:    'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    cta:      'text-purple-600 dark:text-purple-400',
  },
  {
    gradient: 'from-emerald-500/15 via-emerald-400/5 to-transparent',
    border:   'border-emerald-500/25',
    iconBg:   'bg-emerald-500/15',
    iconText: 'text-emerald-500',
    badge:    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    cta:      'text-emerald-600 dark:text-emerald-400',
  },
] as const;

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface GradientCardProps {
  title:         string;
  objective:     string;
  category_name: string;
  icon_key:      string;
  /** 0-based index used to cycle through gradient colours */
  index?:        number;
  /** True when the certificate has never been viewed by this user */
  is_new?:       boolean;
  onClick?:      () => void;
  className?:    string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function GradientCard({
  title,
  objective,
  category_name,
  icon_key,
  index = 0,
  is_new = false,
  onClick,
  className,
}: GradientCardProps) {
  const reduceMotion = useReducedMotion();
  const cfg  = GRADIENT_CONFIGS[index % GRADIENT_CONFIGS.length];
  const Icon = ICON_MAP[icon_key] ?? FileText;

  return (
    <motion.div
      whileHover={reduceMotion ? {} : { y: -4 }}
      whileTap={reduceMotion ? {} : { scale: 0.98 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-[var(--color-bg-card)] cursor-pointer group',
        cfg.border,
        className,
      )}
    >
      {/* "New" pill — only visible while is_new is true */}
      {is_new && (
        <span
          className="absolute right-3 top-3 z-10 inline-flex items-center rounded-full
            bg-[#2845D6] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white
            shadow-sm"
        >
          New
        </span>
      )}
      {/* Diagonal gradient overlay */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80',
          cfg.gradient,
        )}
      />

      <div className="relative p-6 flex flex-col gap-3">
        {/* Icon */}
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            'transition-transform duration-200 group-hover:scale-110',
            cfg.iconBg,
          )}
        >
          <Icon size={22} className={cfg.iconText} />
        </div>

        {/* Category badge */}
        <span
          className={cn(
            'inline-flex items-center self-start rounded-full px-2.5 py-0.5',
            'text-[11px] font-semibold uppercase tracking-wider',
            cfg.badge,
          )}
        >
          {category_name}
        </span>

        {/* Title */}
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] leading-snug line-clamp-2">
          {title}
        </h3>

        {/* Objective */}
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed line-clamp-3 flex-1">
          {objective}
        </p>

        {/* CTA */}
        <div
          className={cn(
            'mt-1 flex items-center gap-1.5 text-xs font-semibold transition-colors',
            cfg.cta,
          )}
        >
          <span>See Certificate</span>
          <ArrowRight
            size={13}
            className="transition-transform duration-200 group-hover:translate-x-1"
          />
        </div>
      </div>
    </motion.div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

export function GradientCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 space-y-3',
        className,
      )}
    >
      <div className="h-11 w-11 rounded-xl bg-[var(--color-border)] animate-pulse" />
      <div className="h-4 w-20 rounded-full bg-[var(--color-border)] animate-pulse" />
      <div className="h-4 w-3/4 rounded bg-[var(--color-border)] animate-pulse" />
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-[var(--color-border)] animate-pulse" />
        <div className="h-3 w-5/6 rounded bg-[var(--color-border)] animate-pulse" />
        <div className="h-3 w-4/6 rounded bg-[var(--color-border)] animate-pulse" />
      </div>
      <div className="h-3 w-24 rounded bg-[var(--color-border)] animate-pulse" />
    </div>
  );
}

'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────
type Variant = 'default' | 'success' | 'error' | 'warning';

interface ActionButton {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  title?: string;
  description?: string;
  duration?: number;
  action?: ActionButton;
  onDismiss?: () => void;
}

// ── Design tokens (mapped to project CSS variables) ────────────────────────────
const BORDER_COLOR: Record<Variant, string> = {
  default: 'var(--color-border-strong)',
  success: 'rgba(22, 163, 74, 0.45)',
  error:   'rgba(220, 38, 38, 0.45)',
  warning: 'rgba(217, 119, 6, 0.45)',
};

const ICON_COLOR: Record<Variant, string> = {
  default: 'var(--color-text-muted)',
  success: '#16a34a',
  error:   '#dc2626',
  warning: '#d97706',
};

const TITLE_COLOR: Record<Variant, string> = {
  default: 'var(--color-text-primary)',
  success: '#16a34a',
  error:   '#dc2626',
  warning: '#d97706',
};

const ACTION_HOVER_BG: Record<Variant, string> = {
  default: 'rgba(0,0,0,0.06)',
  success: 'rgba(22,163,74,0.1)',
  error:   'rgba(220,38,38,0.1)',
  warning: 'rgba(217,119,6,0.1)',
};

const VARIANT_ICONS: Record<Variant, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  default: Info,
  success: CheckCircle,
  error:   AlertCircle,
  warning: AlertTriangle,
};

// ── Custom toast renderer ──────────────────────────────────────────────────────
function renderToast(variant: Variant, opts: ToastOptions) {
  const { title, description, duration = 4000, action, onDismiss } = opts;
  const Icon = VARIANT_ICONS[variant];

  sonnerToast.custom(
    (toastId) => (
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.95 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          width: '100%',
          maxWidth: '420px',
          minWidth: '420px',
          padding: '12px 16px',
          borderRadius: '12px',
          border: `1px solid ${BORDER_COLOR[variant]}`,
          background: 'var(--color-bg-elevated)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          fontFamily: 'inherit',
        }}
      >
        {/* Left: icon + text */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flex: 1, minWidth: 0 }}>
          <Icon size={20} style={{ color: ICON_COLOR[variant], flexShrink: 0, marginTop: '1px' }} />
          <div style={{ minWidth: 0 }}>
            {title && (
              <p
                style={{
                  margin: 0,
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  lineHeight: 1.3,
                  color: TITLE_COLOR[variant],
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {title}
              </p>
            )}
            <p
              style={{
                margin: title ? '2px 0 0' : 0,
                fontSize: '0.875rem',
                lineHeight: 1.4,
                color: 'var(--color-text-muted)',
              }}
            >
              {description}
            </p>
          </div>
        </div>

        {/* Right: action + dismiss */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {action && (
            <button
              onClick={() => {
                action.onClick();
                sonnerToast.dismiss(toastId);
              }}
              style={{
                fontSize: '11px',
                fontWeight: 500,
                padding: '3px 8px',
                borderRadius: '6px',
                border: `1px solid ${BORDER_COLOR[variant]}`,
                background: 'transparent',
                color: TITLE_COLOR[variant],
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = ACTION_HOVER_BG[variant]; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              {action.label}
            </button>
          )}
          <button
            onClick={() => {
              sonnerToast.dismiss(toastId);
              onDismiss?.();
            }}
            aria-label="Dismiss notification"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: 0,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-border-strong)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <X size={11} style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>
      </motion.div>
    ),
    { duration, position: 'bottom-right' }
  );
}

// ── Toaster provider (mount once globally) ─────────────────────────────────────
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      gap={8}
      toastOptions={{ unstyled: true, className: 'flex justify-end' }}
    />
  );
}

// ── Imperative toast API ───────────────────────────────────────────────────────
export const toast = {
  success: (message: string, opts?: ToastOptions) =>
    renderToast('success', { description: message, ...opts }),

  error: (message: string, opts?: ToastOptions) =>
    renderToast('error', { description: message, ...opts }),

  warning: (message: string, opts?: ToastOptions) =>
    renderToast('warning', { description: message, ...opts }),

  info: (message: string, opts?: ToastOptions) =>
    renderToast('default', { description: message, ...opts }),

  default: (message: string, opts?: ToastOptions) =>
    renderToast('default', { description: message, ...opts }),

  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
};

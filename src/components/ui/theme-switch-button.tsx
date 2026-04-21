'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThemeSwitchProps {
  className?: string;
}

export function ThemeSwitch({ className = '' }: ThemeSwitchProps) {
  const [theme, setTheme] = React.useState<'light' | 'dark'>('light');

  // Sync with our data-theme system on mount
  React.useEffect(() => {
    const root = document.documentElement;
    const saved =
      localStorage.getItem('repconnect-theme') ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(saved as 'light' | 'dark');
    root.setAttribute('data-theme', saved);
  }, []);

  // Also keep in sync if something else changes data-theme (e.g. the old hook)
  React.useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      const current = root.getAttribute('data-theme') as 'light' | 'dark';
      if (current) setTheme(current);
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = React.useCallback(() => {
    const root = document.documentElement;
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    root.setAttribute('data-theme', newTheme);
    try {
      localStorage.setItem('repconnect-theme', newTheme);
    } catch {
      // ignore
    }
  }, [theme]);

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className={cn(
        'relative flex h-8 w-8 items-center justify-center',
        'text-[var(--color-text-primary)] hover:opacity-70 transition-opacity overflow-hidden',
        className,
      )}
    >
      {/* Sun — shown when light mode is active */}
      <Sun
        className={cn(
          'absolute h-5 w-5 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          theme === 'light'
            ? 'scale-100 translate-y-0 opacity-100'
            : 'scale-50 translate-y-5 opacity-0',
        )}
      />
      {/* Moon — shown when dark mode is active */}
      <Moon
        className={cn(
          'absolute h-5 w-5 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          theme === 'dark'
            ? 'scale-100 translate-y-0 opacity-100'
            : 'scale-50 -translate-y-5 opacity-0',
        )}
      />
    </button>
  );
}

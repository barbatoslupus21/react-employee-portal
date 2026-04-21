'use client';

import React from 'react';
import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export default function SearchBar({ value, onChange, placeholder = 'Search...', className = '' }: SearchBarProps) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Search
        size={13}
        className="pointer-events-none absolute left-3 text-[var(--color-text-muted)]"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ outline: 'none' }}
        className="w-full h-8 rounded-lg border border-[var(--color-border)]
          bg-[var(--color-bg-elevated)] box-border py-4 pl-8 pr-3 text-xs
          text-[var(--color-text-primary)]
          placeholder:text-[var(--color-text-muted)] placeholder:italic
          focus:outline-none focus-visible:outline-none focus:border-[var(--color-border)] focus:shadow-none focus:ring-0
          transition-none"
      />
    </div>
  );
}

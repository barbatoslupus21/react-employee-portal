"use client";

import { motion } from "motion/react";
import { useState } from "react";

export interface Tab {
  id: string;
  label: string;
  badge?: number;
}

interface AnimatedTabsProps {
  tabs: Tab[];
  defaultTab?: string;
  onChange?: (tabId: string) => void;
  className?: string;
}

export function AnimatedTabs({
  tabs,
  defaultTab,
  onChange,
  className = "",
}: AnimatedTabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0].id);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    onChange?.(tabId);
  };

  return (
    <div
      className={`flex gap-0.5 rounded-lg bg-[var(--color-bg-card)] p-0.5 ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className="relative flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium
              outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#2845D6]"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            {/* Animated pill background */}
            {isActive && (
              <motion.span
                layoutId="animated-tab-pill"
                className="absolute inset-0 rounded-md bg-[var(--color-bg-elevated)]
                  shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
                transition={{ type: "spring", bounce: 0.2, duration: 0.45 }}
              />
            )}

            {/* Label */}
            <span
              className={`relative z-10 transition-colors duration-150 ${
                isActive
                  ? "text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              {tab.label}
            </span>

            {/* Optional badge */}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span
                className={`relative z-10 flex h-4 min-w-[16px] items-center justify-center
                  rounded-full px-1 text-[10px] font-semibold leading-none transition-colors duration-150 ${
                    isActive
                      ? "bg-[#2845D6] text-white"
                      : "bg-[var(--color-text-muted)]/20 text-[var(--color-text-muted)]"
                  }`}
              >
                {tab.badge > 99 ? "99+" : tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * ElasticSwitch — a boolean toggle with a spring-physics sliding pill.
 * Uses motion/react (framer-motion v12) `layout` animation for the elastic feel.
 *
 * Usage:
 *   import { ElasticSwitch } from "@/components/ui/elastic-switch-shadcnui"
 *   <ElasticSwitch />
 *
 * For a controlled version, pass `value` and `onChange`:
 *   <ElasticSwitch value={isOn} onChange={setIsOn} />
 */

import { motion } from "motion/react";
import { useState } from "react";

interface ElasticSwitchProps {
  /** Controlled value — if omitted the component manages its own state */
  value?: boolean;
  /** Called with the new boolean whenever the user clicks */
  onChange?: (next: boolean) => void;
  /** Extra wrapper class */
  className?: string;
  /** "sm" renders a compact 24×48px switch with no wrapper padding */
  size?: "sm" | "md";
}

export function ElasticSwitch({ value, onChange, className, size }: ElasticSwitchProps) {
  const [internal, setInternal] = useState(false);

  // Support both controlled and uncontrolled usage
  const isOn = value !== undefined ? value : internal;
  const sm = size === "sm";

  function toggle() {
    const next = !isOn;
    if (value === undefined) setInternal(next);
    onChange?.(next);
  }

  return (
    <div className={`flex items-center justify-center ${sm ? "" : "p-12"} ${className ?? ""}`}>
      <button
        type="button"
        onClick={toggle}
        aria-checked={isOn}
        role="switch"
        className={`relative ${sm ? "h-6 w-12" : "h-12 w-24"} rounded-full p-1 transition-colors duration-200 ${
          isOn
            ? "bg-[#2845D6]"
            : "bg-gray-300 dark:bg-gray-600"
        }`}
      >
        <motion.div
          layout
          transition={{
            type: "spring",
            stiffness: 700,
            damping: 30,
          }}
          className={`${sm ? "h-4 w-4" : "h-10 w-10"} rounded-full bg-white shadow-md ${isOn ? "ml-auto" : ""}`}
        />
      </button>
    </div>
  );
}

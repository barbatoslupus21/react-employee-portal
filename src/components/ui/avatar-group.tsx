"use client";
import Image from "next/image";
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

interface AvatarItem {
  id: number;
  name: string;
  image: string;
}

interface AvatarGroupProps {
  items: AvatarItem[];
  className?: string;
  maxVisible?: number;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES = {
  sm: "h-6 w-6 text-[9px]",
  md: "h-8 w-8 text-[10px]",
  lg: "h-10 w-10 text-xs",
};

function SingleAvatar({
  item,
  index,
  total,
  size,
  isHovered,
  onHover,
  onLeave,
}: {
  item: AvatarItem;
  index: number;
  total: number;
  size: "sm" | "md" | "lg";
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (isHovered && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setTooltipPos({
        top:  rect.top - 8,              // viewport-relative: 8px above the avatar
        left: rect.left + rect.width / 2, // centered on the avatar
      });
    }
  }, [isHovered]);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={{ marginLeft: index === 0 ? 0 : "-0.375rem", zIndex: total - index }}
    >
      {/* Tooltip — plain div handles fixed position + centering; motion.div handles animation only */}
      {mounted && isHovered && tooltipPos &&
        createPortal(
          <AnimatePresence>
            <div
              key={`tooltip-${item.id}`}
              style={{
                position: "fixed",
                top:  tooltipPos.top,
                left: tooltipPos.left,
                transform: "translate(-50%, -100%)",
                zIndex: 9999,
                pointerEvents: "none",
              }}
            >
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="whitespace-nowrap rounded-lg
                  bg-[var(--color-bg-elevated)] border border-[var(--color-border)]
                  shadow-xl px-2.5 py-1"
              >
                <p className="text-[11px] font-semibold text-[var(--color-text-primary)]">
                  {item.name}
                </p>
              </motion.div>
            </div>
          </AnimatePresence>,
          document.body
        )
      }

      {/* Avatar image */}
      <motion.div
        whileHover={{ scale: 1.1, zIndex: 100 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className="relative"
      >
        <Image
          src={item.image}
          alt={item.name}
          width={40}
          height={40}
          className={cn(
            "rounded-full object-cover border-2 border-[var(--color-bg-elevated)]",
            SIZE_CLASSES[size]
          )}
        />
      </motion.div>
    </div>
  );
}

export function AvatarGroup({
  items,
  className,
  maxVisible = 5,
  size = "sm",
}: AvatarGroupProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const visible   = items.slice(0, maxVisible);
  const remaining = items.length - maxVisible;

  return (
    <div className={cn("flex items-center", className)}>
      {visible.map((item, idx) => (
        <SingleAvatar
          key={item.id}
          item={item}
          index={idx}
          total={visible.length}
          size={size}
          isHovered={hoveredId === item.id}
          onHover={() => setHoveredId(item.id)}
          onLeave={() => setHoveredId(null)}
        />
      ))}

      {remaining > 0 && (
        <div
          className={cn(
            "flex items-center justify-center rounded-full font-semibold",
            "border-2 border-[var(--color-bg-elevated)]",
            "bg-[var(--color-bg-card)] text-[var(--color-text-muted)]",
            SIZE_CLASSES[size],
            "ml-[-0.375rem]"
          )}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}

export default AvatarGroup;

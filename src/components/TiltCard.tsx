"use client";

import { useCallback, useRef, type MouseEvent, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";

interface TiltCardProps {
  children: ReactNode;
  className?: string;
}

export default function TiltCard({ children, className = "" }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);

  const springConfig = { stiffness: 300, damping: 20 };
  const rotateX = useSpring(useTransform(y, [0, 1], [12, -12]), springConfig);
  const rotateY = useSpring(useTransform(x, [0, 1], [-12, 12]), springConfig);

  const glossX = useTransform(x, [0, 1], ["-50%", "150%"]);
  const glossY = useTransform(y, [0, 1], ["-50%", "150%"]);

  const handleMouseMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      x.set((e.clientX - rect.left) / rect.width);
      y.set((e.clientY - rect.top) / rect.height);
    },
    [x, y]
  );

  const handleMouseLeave = useCallback(() => {
    x.set(0.5);
    y.set(0.5);
  }, [x, y]);

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
        perspective: 800,
      }}
      className={`relative overflow-hidden rounded-2xl border p-6 sm:p-8
        bg-[var(--color-bg-card)] border-[var(--color-border)]
        shadow-[0_4px_24px_var(--color-card-shadow)]
        transition-shadow duration-300
        hover:shadow-[0_8px_40px_var(--color-card-shadow)]
        ${className}`}
    >
      {/* Gloss highlight */}
      <motion.div
        style={{
          left: glossX,
          top: glossY,
          transform: "translate(-50%, -50%)",
        }}
        className="pointer-events-none absolute h-[200%] w-[200%] rounded-full
          bg-[radial-gradient(circle,var(--color-gloss)_0%,transparent_60%)]
          opacity-60"
        aria-hidden
      />
      <div style={{ transform: "translateZ(20px)" }}>{children}</div>
    </motion.div>
  );
}

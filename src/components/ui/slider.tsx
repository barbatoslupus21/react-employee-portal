"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { motion, useMotionValue, useTransform, type MotionValue } from "framer-motion";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const sliderVariants = cva("relative flex w-full touch-none select-none items-center", {
  variants: {
    size: {
      default: "h-6",
      sm: "h-5",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

type SliderValue = number;

interface SliderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue">,
    VariantProps<typeof sliderVariants> {
  value: SliderValue;
  onChange: (value: SliderValue) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

function valueToPixel(v: number, min: number, max: number, trackWidth: number): number {
  if (max === min) return 0;
  const usable = Math.max(trackWidth - 18, 0);
  return ((v - min) / (max - min)) * usable;
}

function pixelToValue(px: number, min: number, max: number, step: number, trackWidth: number): number {
  const usable = Math.max(trackWidth - 18, 1);
  const raw = (px / usable) * (max - min) + min;
  const snapped = Math.round((raw - min) / step) * step + min;
  return Math.max(min, Math.min(max, snapped));
}

function Thumb({ motionX, active }: { motionX: MotionValue<number>; active: boolean }) {
  const scale = useTransform(motionX, (x) => (x >= 0 ? 1 : 1));
  return (
    <motion.span
      className="pointer-events-none absolute top-1/2 left-0 flex items-center justify-center"
      style={{ x: motionX, y: "-50%" }}
    >
      <motion.span
        className={cn(
          "block rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] shadow-sm",
          active ? "h-[18px] w-[18px]" : "h-[14px] w-[14px]",
        )}
        style={{ scale }}
      />
    </motion.span>
  );
}

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  ({ className, value, onChange, min = 0, max = 100, step = 1, disabled = false, size, ...props }, ref) => {
    const trackRef = React.useRef<HTMLDivElement>(null);
    const trackWidthRef = React.useRef(0);
    const dragging = React.useRef(false);
    const [isActive, setIsActive] = React.useState(false);
    const motionX = useMotionValue(0);

    React.useEffect(() => {
      const el = trackRef.current;
      if (!el) return;
      const ro = new ResizeObserver(([entry]) => {
        trackWidthRef.current = entry.contentRect.width;
        if (!dragging.current) {
          motionX.set(valueToPixel(value, min, max, entry.contentRect.width));
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, [min, max, value, motionX]);

    React.useEffect(() => {
      if (dragging.current) return;
      motionX.set(valueToPixel(value, min, max, trackWidthRef.current || 0));
    }, [value, min, max, motionX]);

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      dragging.current = true;
      setIsActive(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const localX = e.clientX - rect.left;
      const nextValue = pixelToValue(localX, min, max, step, rect.width);
      motionX.set(valueToPixel(nextValue, min, max, rect.width));
      onChange(nextValue);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const localX = e.clientX - rect.left;
      const nextValue = pixelToValue(localX, min, max, step, rect.width);
      motionX.set(valueToPixel(nextValue, min, max, rect.width));
      onChange(nextValue);
    };

    const handlePointerUp = () => {
      dragging.current = false;
      setIsActive(false);
    };

    const fillWidth = useTransform(motionX, (x) => x + 9);

    return (
      <div
        ref={ref}
        className={cn(sliderVariants({ size }), disabled && "opacity-50", className)}
        {...props}
      >
        <div
          ref={trackRef}
          className="relative h-6 w-full cursor-pointer"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--color-border)]" />
          <motion.div
            className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#2845D6]"
            style={{ width: fillWidth }}
          />
          <Thumb motionX={motionX} active={isActive} />
          <SliderPrimitive.Root
            className="sr-only"
            value={[value]}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onValueChange={(next) => onChange(next[0] ?? min)}
          >
            <SliderPrimitive.Track>
              <SliderPrimitive.Range />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb />
          </SliderPrimitive.Root>
        </div>
      </div>
    );
  },
);

Slider.displayName = 'Slider';

export { Slider };
export type { SliderProps };
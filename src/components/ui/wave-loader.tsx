'use client';

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

export interface WaveLoaderProps {
  barCount?:  number;
  height?:    number;
  color?:     string;
  className?: string;
}

export function WaveLoader({
  barCount = 5,
  height   = 28,
  color    = 'currentColor',
  className,
}: WaveLoaderProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn('flex items-end gap-[3px]', className)}
      style={{ height: `${height}px` }}
    >
      {Array.from({ length: barCount }).map((_, i) => (
        <motion.span
          key={i}
          style={{
            display:         'block',
            width:           4,
            height,
            backgroundColor: color,
            borderRadius:    9999,
            transformOrigin: 'bottom',
          }}
          animate={reduceMotion ? {} : { scaleY: [0.25, 1, 0.25] }}
          transition={{
            duration: 1.1,
            repeat:   Infinity,
            delay:    i * 0.14,
            ease:     'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

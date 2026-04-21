'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface AnimatedNumberProps {
  value: number;
  padStart?: number;
  className?: string;
}

export function AnimatedNumber({ value, padStart = 3, className }: AnimatedNumberProps) {
  const prevRef = useRef(value);
  const isIncreasing = value >= prevRef.current;

  // Update after every render so current render uses the previous value for direction
  useEffect(() => {
    prevRef.current = value;
  });

  const digits = String(value).padStart(padStart, '0').split('');

  return (
    <div className={cn('flex items-center', className)}>
      {digits.map((digit, i) => (
        <span
          key={i}
          className="relative inline-flex items-center justify-center overflow-hidden"
          style={{ width: '1ch', height: '1.1em', perspective: '600px' }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={`${i}-${digit}`}
              className="absolute inset-0 flex items-center justify-center"
              initial={{
                y: isIncreasing ? '-100%' : '100%',
                opacity: 0,
                rotateX: isIncreasing ? 90 : -90,
              }}
              animate={{ y: 0, opacity: 1, rotateX: 0 }}
              exit={{
                y: isIncreasing ? '100%' : '-100%',
                opacity: 0,
                rotateX: isIncreasing ? -90 : 90,
              }}
              transition={{
                duration: 0.7,
                // Rightmost digit (changes most) has 0 delay; cascade left
                delay: (digits.length - 1 - i) * 0.03,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {digit}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </div>
  );
}

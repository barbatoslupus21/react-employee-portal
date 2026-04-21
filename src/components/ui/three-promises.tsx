"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// REPConnect Three Promises data
const PROMISES = [
  {
    number: "01",
    title: "Achieving Speed",
    description:
      "Flexible responsiveness that is trusted by customers and partners, 'Achieving Speed'.",
    label: "Speed",
  },
  {
    number: "02",
    title: "Global Human Resource Development",
    description:
      "Realizing global human resource development that takes advantage of each individual's unique strengths.",
    label: "People",
  },
  {
    number: "03",
    title: "Advanced Technological Capabilities",
    description:
      "Empowering both people and machines to evolve through advanced technological capabilities and continuous kaizen improvements.",
    label: "Technology",
  },
];

// Direction-aware slide variants
const slideVariants = {
  enter: (direction: number) => ({
    opacity: 0,
    y: direction > 0 ? 40 : -40,
  }),
  center: {
    opacity: 1,
    y: 0,
  },
  exit: (direction: number) => ({
    opacity: 0,
    y: direction > 0 ? -40 : 40,
  }),
};

export function ThreePromises() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const prevIndexRef = useRef(0);

  const goNext = () => {
    setDirection(1);
    setActiveIndex((p) => (p + 1) % PROMISES.length);
  };
  const goPrev = () => {
    setDirection(-1);
    setActiveIndex((p) => (p - 1 + PROMISES.length) % PROMISES.length);
  };

  useEffect(() => {
    prevIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const t = setInterval(goNext, 3000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = PROMISES[activeIndex];

  return (
    <div
      className="relative w-full max-w-6xl mx-auto"
    >
      {/* Giant ghost number */}
      <motion.div
        className="absolute -left-4 top-1/2 -translate-y-1/2 text-[35rem] font-bold select-none pointer-events-none leading-none tracking-tighter"
        style={{
          color: 'var(--color-border-strong)',
          opacity: 0.25,
        }}
      >
        <AnimatePresence mode="wait" custom={direction}>
          <motion.span
            key={activeIndex}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="block"
          >
            {current.number}
          </motion.span>
        </AnimatePresence>
      </motion.div>

      {/* Content panel */}
      <div className="relative flex">
        {/* Left — vertical label + progress line */}
        <div className="flex flex-col items-center justify-center pr-10 border-r border-[var(--color-border)]">
          <motion.span
            className="text-xs font-mono text-[var(--color-text-muted)] tracking-widest uppercase text-filled"
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Our Promises
          </motion.span>

          {/* Progress bar */}
          <div className="relative h-28 w-px bg-[var(--color-border)] mt-6">
            <motion.div
              className="absolute top-0 left-0 w-full bg-[#5989f5] origin-top"
              animate={{ height: `${((activeIndex + 1) / PROMISES.length) * 100}%` }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>

        {/* Center — main content with slide animation */}
        <div className="flex-1 pl-10 py-10 overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={activeIndex}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Label badge */}
              <div className="mb-6">
                <span className="inline-flex items-center gap-2 text-xs font-mono text-[var(--color-text-muted)] border border-[var(--color-border)] rounded-full px-3 py-1 text-filled">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5989f5]" />
                  {current.label}
                </span>
              </div>

              {/* Title */}
              <h3 className="text-3xl md:text-4xl font-bold text-[var(--color-text-primary)] leading-tight text-filled mb-6">
                {current.title}
              </h3>

              {/* Description */}
              <p className="text-[var(--color-text-secondary)] leading-relaxed mb-10 max-w-md text-filled mt-6">
                {current.description}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Author row — index dots + nav buttons */}
          <div className="flex items-center justify-between">
            {/* Dot indicators */}
            <div className="flex items-center gap-2">
              {PROMISES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setDirection(i > activeIndex ? 1 : -1);
                    setActiveIndex(i);
                  }}
                  className="focus:outline-none"
                  aria-label={`Promise ${i + 1}`}
                >
                  <motion.div
                    animate={{
                      width: i === activeIndex ? 24 : 8,
                      backgroundColor: i === activeIndex ? '#5989f5' : 'var(--color-border-strong)',
                    }}
                    transition={{ duration: 0.3 }}
                    className="h-1.5 rounded-full"
                  />
                </button>
              ))}
            </div>

            {/* Nav buttons */}
            <div className="flex items-center gap-3">
              <motion.button
                onClick={goPrev}
                whileTap={{ scale: 0.94 }}
                className="w-11 h-11 rounded-full border border-[var(--color-border)] flex items-center justify-center hover:border-[#5989f5] hover:text-[#5989f5] text-[var(--color-text-primary)] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </motion.button>
              <motion.button
                onClick={goNext}
                whileTap={{ scale: 0.94 }}
                className="w-11 h-11 rounded-full border border-[var(--color-border)] flex items-center justify-center hover:border-[#5989f5] hover:text-[#5989f5] text-[var(--color-text-primary)] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

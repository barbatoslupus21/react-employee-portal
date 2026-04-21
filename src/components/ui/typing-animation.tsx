"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TypingAnimationProps {
  /** Array of words/phrases to cycle through */
  words: string[];
  /** Milliseconds per character while typing (default 80) */
  typeSpeed?: number;
  /** Milliseconds per character while deleting (default 40) */
  deleteSpeed?: number;
  /** Milliseconds to pause after the full word is typed (default 2000) */
  pauseDuration?: number;
  /** Milliseconds to wait before typing the next word (default 220) */
  waitDuration?: number;
  className?: string;
  /** Extra className applied to the blinking cursor element */
  cursorClassName?: string;
}

export function TypingAnimation({
  words,
  typeSpeed = 80,
  deleteSpeed = 40,
  pauseDuration = 2000,
  waitDuration = 220,
  className,
  cursorClassName,
}: TypingAnimationProps) {
  const [wordIndex, setWordIndex] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentWord = words[wordIndex] ?? "";

    // Still typing
    if (!isDeleting && charCount < currentWord.length) {
      const t = setTimeout(() => setCharCount((c) => c + 1), typeSpeed);
      return () => clearTimeout(t);
    }

    // Finished typing — pause then start deleting
    if (!isDeleting && charCount === currentWord.length) {
      const t = setTimeout(() => setIsDeleting(true), pauseDuration);
      return () => clearTimeout(t);
    }

    // Deleting chars one by one
    if (isDeleting && charCount > 0) {
      const t = setTimeout(() => setCharCount((c) => c - 1), deleteSpeed);
      return () => clearTimeout(t);
    }

    // Finished deleting — brief pause, then move to next word
    if (isDeleting && charCount === 0) {
      const t = setTimeout(() => {
        setIsDeleting(false);
        setWordIndex((i) => (i + 1) % words.length);
      }, waitDuration);
      return () => clearTimeout(t);
    }
  }, [charCount, isDeleting, wordIndex, words, typeSpeed, deleteSpeed, pauseDuration, waitDuration]);

  const displayed = (words[wordIndex] ?? "").substring(0, charCount);

  return (
    <span className={cn("inline", className)}>
      {displayed}
      {/* Block cursor — uses background-color so it's visible even when parent uses bg-clip-text */}
      <span
        aria-hidden
        className={cn("inline-block align-middle", cursorClassName)}
        style={{
          width: "2px",
          height: "0.8em",
          backgroundColor: "currentColor",
          marginLeft: "2px",
          verticalAlign: "middle",
          animation: "blink 1s step-end infinite",
        }}
      />
    </span>
  );
}

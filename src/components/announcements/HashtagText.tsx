'use client';

import React from 'react';

type HashtagTextProps = {
  text: string;
  className?: string;
};

/**
 * Renders text with hashtags (#word) highlighted in the brand blue color.
 * Uses React elements — never dangerouslySetInnerHTML (Risk 5).
 * Regex /#(\w+)/g handles numbers, underscores, end-of-sentence punctuation (Risk 6).
 */
export function HashtagText({ text, className }: HashtagTextProps) {
  if (!text) return null;

  // Split on /#(\w+)/ with capturing group so tokens alternate: [text, tag, text, tag, ...]
  const parts = text.split(/(#\w+)/g);

  return (
    <span className={className}>
      {parts.map((part, i) =>
        /^#\w+$/.test(part) ? (
          <span key={i} className="text-[#2845D6] font-medium">
            {part}
          </span>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </span>
  );
}

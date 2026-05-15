'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type MediaItem = {
  id: number;
  file: string;
  media_type: 'image' | 'video';
  order: number;
};

type MediaCarouselProps = {
  media: MediaItem[];
};

/**
 * Renders images and videos in a fixed-aspect-ratio container (Risk 7).
 * Videos: controls always visible, autoPlay never set (Risk 11).
 */
export function MediaCarousel({ media }: MediaCarouselProps) {
  const [index, setIndex] = useState(0);

  if (!media || media.length === 0) return null;

  const current = media[index];
  const hasPrev = index > 0;
  const hasNext = index < media.length - 1;

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-[var(--color-bg-subtle)]">
      {current.media_type === 'image' ? (
        <div className="aspect-[4/3] w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.file}
            alt="Announcement media"
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="aspect-video w-full">
          {/* autoPlay intentionally omitted (Risk 11) */}
          <video
            key={current.file}
            src={current.file}
            controls
            muted
            className="h-full w-full object-cover"
          />
        </div>
      )}

      {media.length > 1 && (
        <>
          {hasPrev && (
            <button
              type="button"
              onClick={() => setIndex((i) => i - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70 transition-colors"
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {hasNext && (
            <button
              type="button"
              onClick={() => setIndex((i) => i + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70 transition-colors"
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
          {/* Dot indicators */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {media.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
                }`}
                aria-label={`Go to item ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

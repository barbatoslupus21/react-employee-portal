'use client';

import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { MediaLightbox, type LightboxPostContext, type MediaItem } from './MediaLightbox';

export type { MediaItem };

type MediaCarouselProps = {
  media: MediaItem[];
  postContext: LightboxPostContext;
};

type CellProps = {
  item: MediaItem;
  index: number;
  onOpen: (index: number) => void;
  /** Extra Tailwind classes for layout positioning (e.g. flex-1, absolute inset-0) */
  className?: string;
};

function Cell({ item, index, onOpen, className = '' }: CellProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${item.media_type} ${index + 1}`}
      className={`relative cursor-pointer overflow-hidden ${className}`}
      onClick={() => onOpen(index)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen(index);
      }}
    >
      {item.media_type === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.file}
          alt=""
          className="h-full w-full object-cover object-center transition-transform duration-300 hover:scale-[1.03]"
        />
      ) : (
        <video
          src={item.file}
          muted
          playsInline
          className="h-full w-full object-cover object-center"
        />
      )}
    </div>
  );
}

export function MediaCarousel({ media, postContext }: MediaCarouselProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!media || media.length === 0) return null;

  const count = media.length;
  const hasOverflow = count > 3;
  const overflowCount = count - 3;

  return (
    <>
      {/* Collage — 2:1 aspect ratio, 2px black gap between tiles */}
      <div className="relative aspect-[2/1] w-full overflow-hidden bg-black">
        {/* ── 1 item: full bleed ── */}
        {count === 1 && (
          <div className="absolute inset-0">
            <Cell item={media[0]} index={0} onOpen={setLightboxIndex} className="h-full w-full" />
          </div>
        )}

        {/* ── 2 items: side-by-side ── */}
        {count === 2 && (
          <div className="absolute inset-0 flex gap-[2px] bg-[var(--color-bg-card)]">
            <Cell item={media[0]} index={0} onOpen={setLightboxIndex} className="flex-1" />
            <Cell item={media[1]} index={1} onOpen={setLightboxIndex} className="flex-1" />
          </div>
        )}

        {/* ── 3+ items: left full-height + right two rows ── */}
        {count >= 3 && (
          <div className="absolute inset-0 flex gap-[2px] bg-[var(--color-bg-card)]">
            {/* Left column — full height */}
            <Cell item={media[0]} index={0} onOpen={setLightboxIndex} className="flex-1" />

            {/* Right column — two equal rows */}
            <div className="flex flex-1 flex-col gap-[2px] overflow-hidden">
              <Cell item={media[1]} index={1} onOpen={setLightboxIndex} className="flex-1" />

              {/* Bottom-right — 3rd image always visible; overlay + counter only when 4+ images */}
              <div className="relative flex-1 overflow-hidden">
                {/* Wrapper avoids relative/absolute conflict inside Cell */}
                <div className="absolute inset-0">
                  <Cell item={media[2]} index={2} onOpen={setLightboxIndex} className="h-full w-full" />
                </div>
                {hasOverflow && (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`View ${overflowCount} more`}
                    className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/55 transition-colors hover:bg-black/60"
                    onClick={() => setLightboxIndex(2)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setLightboxIndex(2);
                    }}
                  >
                    <span className="text-lg font-semibold leading-none text-white drop-shadow">
                      +{overflowCount}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {lightboxIndex !== null && (
          <MediaLightbox
            media={media}
            initialIndex={lightboxIndex}
            postContext={postContext}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}


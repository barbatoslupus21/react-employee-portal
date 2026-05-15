'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { Star } from 'lucide-react';

const ratingVariants = cva('flex items-center', {
  variants: {
    size: {
      sm: 'gap-1.5',
      md: 'gap-2',
      lg: 'gap-2.5',
    },
  },
  defaultVariants: {
    size: 'sm',
  },
});

const starVariants = cva('', {
  variants: {
    size: {
      sm: 'w-4 h-4',
      md: 'w-5 h-5',
      lg: 'w-6 h-6',
    },
  },
  defaultVariants: {
    size: 'sm',
  },
});

const valueVariants = cva('text-muted-foreground', {
  variants: {
    size: {
      sm: 'text-xs',
      md: 'text-sm',
      lg: 'text-base',
    },
  },
  defaultVariants: {
    size: 'sm',
  },
});

function Rating({
  rating,
  maxRating = 5,
  size,
  className,
  starClassName,
  valueClassName,
  showValue = true,
  editable = false,
  onRatingChange,
  ...props
}: React.ComponentProps<'div'> &
  VariantProps<typeof ratingVariants> & {
    rating: number;
    maxRating?: number;
    showValue?: boolean;
    starClassName?: string;
    valueClassName?: string;
    editable?: boolean;
    onRatingChange?: (rating: number) => void;
  }) {
  const [hoveredRating, setHoveredRating] = React.useState<number | null>(null);
  const displayRating = editable && hoveredRating !== null ? hoveredRating : rating;

  const handleStarClick = (starRating: number) => {
    if (editable && onRatingChange) {
      onRatingChange(starRating);
    }
  };

  const handleStarMouseEnter = (starRating: number) => {
    if (editable) {
      setHoveredRating(starRating);
    }
  };

  const handleStarMouseLeave = () => {
    if (editable) {
      setHoveredRating(null);
    }
  };

  const renderStars = () => {
    const stars = [];

    for (let i = 1; i <= maxRating; i++) {
      const filled = displayRating >= i;
      const partiallyFilled = displayRating > i - 1 && displayRating < i;
      const fillPercentage = partiallyFilled ? (displayRating - (i - 1)) * 100 : 0;

      stars.push(
        <div
          key={i}
          className={cn('relative', editable && 'cursor-pointer')}
          onClick={() => handleStarClick(i)}
          onMouseEnter={() => handleStarMouseEnter(i)}
          onMouseLeave={handleStarMouseLeave}
        >
          <Star data-slot="rating-star-empty" className={cn(starVariants({ size }), 'text-slate-300')} />

          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              width: filled ? '100%' : `${fillPercentage}%`,
            }}
          >
            <Star
              data-slot="rating-star-filled"
              className={cn(starVariants({ size }), 'text-yellow-400 fill-yellow-400')}
            />
          </div>
        </div>,
      );
    }

    return stars;
  };

  return (
    <div data-slot="rating" className={cn(ratingVariants({ size }), className)} {...props}>
      <div className="flex items-center gap-2">{renderStars()}</div>
      {showValue && (
        <span
          data-slot="rating-value"
          className={cn(valueVariants({ size }), starClassName, valueClassName, 'text-xs text-[var(--color-text-muted)]')}
        >
          {displayRating.toFixed(1)}
        </span>
      )}
    </div>
  );
}

export { Rating };

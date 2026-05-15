"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface RatingInteractionProps {
  value?: number
  onChange?: (rating: number) => void
  className?: string
  disabled?: boolean
}

const ratingData = [
  { emoji: "😔", label: "Terrible", color: "from-red-400 to-red-500", shadowColor: "shadow-red-500/30" },
  { emoji: "😕", label: "Poor", color: "from-orange-400 to-orange-500", shadowColor: "shadow-orange-500/30" },
  { emoji: "😐", label: "Okay", color: "from-yellow-400 to-yellow-500", shadowColor: "shadow-yellow-500/30" },
  { emoji: "🙂", label: "Good", color: "from-lime-400 to-lime-500", shadowColor: "shadow-lime-500/30" },
  { emoji: "😍", label: "Amazing", color: "from-emerald-400 to-emerald-500", shadowColor: "shadow-emerald-500/30" },
]

export function RatingInteraction({ value = 0, onChange, className, disabled = false }: RatingInteractionProps) {
  const [rating, setRating] = useState(value)
  const [hoverRating, setHoverRating] = useState(0)

  useEffect(() => {
    setRating(value)
  }, [value])

  const handleClick = (value: number) => {
    if (disabled) return
    setRating(value)
    onChange?.(value)
  }

  const displayRating = hoverRating || rating

  return (
    <div className={cn('flex flex-col items-start gap-2', className)}>
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        {ratingData.map((item, i) => {
          const value = i + 1
          const isActive = value <= displayRating
          const isSelected = displayRating === value

          return (
            <button
              key={value}
              type="button"
              onClick={() => handleClick(value)}
              onMouseEnter={() => !disabled && setHoverRating(value)}
              onMouseLeave={() => !disabled && setHoverRating(0)}
              className="group relative flex min-w-[2.5rem] flex-col items-center justify-center focus:outline-none sm:min-w-[3.5rem]"
              aria-label={`Rate ${value}: ${item.label}`}
            >
              <div
                className={cn(
                  'relative flex h-10 w-10 items-center justify-center transition-all duration-300 ease-out sm:h-13 sm:w-14',
                  isActive ? 'scale-110' : 'scale-100 group-hover:scale-105',
                )}
              >
                <span
                  className={cn(
                    'text-2xl sm:text-3xl transition-all duration-300 ease-out select-none',
                    isActive
                      ? 'grayscale-0 drop-shadow-lg'
                      : 'grayscale opacity-40 group-hover:opacity-70 group-hover:grayscale-[0.3]',
                  )}
                >
                  {item.emoji}
                </span>
              </div>
              <span
                className={cn(
                  'text-[9px] font-semibold tracking-wide text-foreground transition-all duration-300 ease-out sm:text-[10px]',
                  isSelected ? 'opacity-100' : 'opacity-0',
                )}
              >
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

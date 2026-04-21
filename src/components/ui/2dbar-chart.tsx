"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export interface BarChartMonthItem {
  label: string
  month: number
  value: number
}

export function TwoDBarChart({
  monthData,
  label,
}: {
  monthData: BarChartMonthItem[]
  label: string
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Double rAF ensures the browser paints the initial height-0 state before
    // the entry animation starts so bars "grow in" on page load. Because
    // `mounted` stays true after the first paint, subsequent data updates
    // (e.g. after a leave submission) will transition bars from their current
    // height to the new value — never resetting to zero.
    let id1: number
    let id2: number
    id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setMounted(true))
    })
    return () => {
      cancelAnimationFrame(id1)
      cancelAnimationFrame(id2)
    }
  }, [])

  const maxValue = Math.max(1, ...monthData.map((item) => item.value))

  return (
    <div className="group relative flex h-full min-h-[280px] max-[480px]:min-h-[200px] w-full flex-col bg-transparent p-4 px-5 transition-shadow duration-300">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-muted)]">{label}</span>
        </div>
      </div>

      <div className="flex-1 flex items-stretch gap-3 min-h-[180px] max-[480px]:min-h-[120px] max-[480px]:gap-1">
        {monthData.map((item, index) => {
          const showBar = item.value > 0
          const targetHeight = showBar ? Math.max((item.value / maxValue) * 100, 8) : 0
          const heightPct = mounted ? targetHeight : 0
          const isHovered = hoveredIndex === index
          const isAnyHovered = hoveredIndex !== null
          const isNeighbor = hoveredIndex !== null && (index === hoveredIndex - 1 || index === hoveredIndex + 1)

          return (
            <button
              key={item.label}
              type="button"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="relative flex-1 h-full flex flex-col items-center justify-end focus:outline-none"
            >
              <div
                className={cn(
                  "w-full rounded-full origin-bottom",
                  !showBar && 'bg-transparent',
                )}
                style={{
                  height: `${heightPct}%`,
                  transition: 'height 0.8s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s ease-out, background-color 0.35s ease-out, opacity 0.35s ease-out',
                  transform: showBar && isHovered ? 'scaleX(1.07)' : 'scaleX(1)',
                  backgroundColor: showBar ? (isHovered ? 'var(--color-accent)' : '#4f86f7') : 'transparent',
                  opacity: showBar ? (isHovered ? 1 : isNeighbor ? 0.85 : isAnyHovered ? 0.75 : 1) : 0,
                }}
              />
              <span className="mt-3 text-[10px] max-[480px]:text-[8px] font-medium uppercase tracking-[0.18em] max-[480px]:tracking-[0.06em] text-[var(--color-text-muted)]">
                {item.label}
              </span>
              <span
                className={cn(
                  'absolute -top-8 rounded-md bg-white px-2 py-1 text-[10px] font-medium text-slate-900 shadow-sm transition-all duration-200 whitespace-nowrap',
                  showBar && isHovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1 pointer-events-none',
                )}
              >
                {item.value} {item.value === 1 ? 'day' : 'days'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

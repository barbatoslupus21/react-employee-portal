"use client"

import * as React from "react"
import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "@/lib/utils"

/**
 * Vercel-style animated tab strip.
 *
 * Features
 * ────────
 * - Hover highlight pill (slides smoothly on mouse-enter/leave)
 * - Active underline indicator (slides to the active tab)
 * - Optional Lucide-compatible icon per tab (16×16 area, size 12)
 * - Controlled mode: pass `activeTab` and `onTabChange` to drive from outside
 * - Uncontrolled mode: omit `activeTab` to let the component manage its own state
 *
 * Usage
 * ─────
 *  <Tabs
 *    tabs={[{ id: 'a', label: 'Tab A' }, { id: 'b', label: 'Tab B' }]}
 *    activeTab={active}
 *    onTabChange={setActive}
 *  />
 */

export interface Tab {
  id: string
  label: string
  /** optional icon rendered to the left of the label */
  icon?: React.ComponentType<{ size?: number; className?: string }>
  /** optional color CSS value for active state */
  color?: string
}

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  tabs: Tab[]
  /** Controlled active tab id. When provided the component syncs internally. */
  activeTab?: string
  /** Called when the user clicks a tab. Receives the tab id. */
  onTabChange?: (tabId: string) => void
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ className, tabs, activeTab, onTabChange, ...props }, ref) => {
    /** Derive initial activeIndex from controlled prop if given. */
    const [activeIndex, setActiveIndex] = useState<number>(() => {
      if (activeTab !== undefined) {
        const idx = tabs.findIndex(t => t.id === activeTab)
        return idx === -1 ? 0 : idx
      }
      return 0
    })

    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
    const [hoverStyle, setHoverStyle] = useState<React.CSSProperties>({})
    const [activeStyle, setActiveStyle] = useState<React.CSSProperties>({
      left: "0px",
      width: "0px",
    })

    const tabRefs = useRef<(HTMLDivElement | null)[]>([])

    // ── Sync controlled activeTab → internal activeIndex ─────────────────────
    useEffect(() => {
      if (activeTab === undefined) return
      const idx = tabs.findIndex(t => t.id === activeTab)
      if (idx !== -1 && idx !== activeIndex) setActiveIndex(idx)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, tabs])

    // ── Hover highlight position ──────────────────────────────────────────────
    useEffect(() => {
      if (hoveredIndex === null) return
      const el = tabRefs.current[hoveredIndex]
      if (el) {
        setHoverStyle({
          left: `${el.offsetLeft}px`,
          width: `${el.offsetWidth}px`,
        })
      }
    }, [hoveredIndex])

    // ── Active underline position ─────────────────────────────────────────────
    useEffect(() => {
      const el = tabRefs.current[activeIndex]
      if (el) {
        setActiveStyle({
          left: `${el.offsetLeft}px`,
          width: `${el.offsetWidth}px`,
        })
      }
    }, [activeIndex])

    // ── Initial position (paint before first interaction) ────────────────────
    useEffect(() => {
      requestAnimationFrame(() => {
        const firstEl = tabRefs.current[activeIndex] ?? tabRefs.current[0]
        if (firstEl) {
          setActiveStyle({
            left: `${firstEl.offsetLeft}px`,
            width: `${firstEl.offsetWidth}px`,
          })
        }
      })
      // Only run once on mount — activeIndex intentionally excluded
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
      <div ref={ref} className={cn("relative", className)} {...props}>
        <div className="relative">
          {/* ── Hover highlight pill ── */}
          <div
            className="pointer-events-none absolute h-full rounded-[6px] bg-[#0e0f1114] transition-all duration-300 ease-out dark:bg-[#ffffff1a]"
            style={{
              ...hoverStyle,
              opacity: hoveredIndex !== null ? 1 : 0,
            }}
          />

          {/* ── Active underline ── */}
          <div
            className="absolute bottom-[-6px] h-[2px] bg-[var(--color-accent)] transition-all duration-300 ease-out"
            style={activeStyle}
          />

          {/* ── Tab items ── */}
          <div className="relative flex items-center gap-x-[6px] overflow-x-auto py-1">
            {tabs.map((tab, index) => {
              const Icon = tab.icon
              const isActive = index === activeIndex

              return (
                <div
                  key={tab.id}
                  ref={el => { tabRefs.current[index] = el }}
                  role="tab"
                  aria-selected={isActive}
                  tabIndex={0}
                  className={cn(
                    "flex min-h-[30px] min-w-0 cursor-pointer select-none items-center justify-center gap-1.5 px-3 py-2 transition-colors duration-300",
                    "text-xs",
                    isActive ? "font-semibold text-[var(--color-accent)]" : "font-medium text-[var(--color-text-muted)]",
                  )}
                  style={tab.color ? { color: tab.color } : undefined}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={() => {
                    if (activeTab === undefined) setActiveIndex(index)
                    onTabChange?.(tab.id)
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      if (activeTab === undefined) setActiveIndex(index)
                      onTabChange?.(tab.id)
                    }
                  }}
                >
                  <AnimatePresence initial={false}>
                    {Icon && isActive && (
                      <motion.span
                        key="icon"
                        initial={{ opacity: 0, width: 0, marginRight: 0 }}
                        animate={{ opacity: 1, width: 'auto', marginRight: 2 }}
                        exit={{ opacity: 0, width: 0, marginRight: 0 }}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        className="inline-flex items-center overflow-hidden"
                      >
                        <Icon size={12} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <span className="text-xs font-medium leading-5 text-center whitespace-normal break-words max-w-[12rem]">
                    {tab.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  },
)

Tabs.displayName = "Tabs"

export { Tabs }

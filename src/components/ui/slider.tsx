"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

/**
 * Thin styled wrapper over base-ui's Slider, composing Root → Control → Track →
 * Indicator → Thumb so callers pass value/min/max/step/onValueChange directly.
 *
 * - `tickCount` renders evenly-spaced step marks on the track. A full-width rail
 *   sits behind an inset interactive track, so the first/last ticks (and the
 *   thumb at min/max) are slightly inside the visible ends.
 * - `tickLabels` (per-tick, null to omit) renders single-line labels centered
 *   under their tick; `activeIndex` bolds the current one.
 */
function Slider({
  className,
  tickCount,
  tickLabels,
  activeIndex,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  tickCount?: number
  tickLabels?: (string | null)[]
  activeIndex?: number
}) {
  const positions =
    tickCount && tickCount > 1
      ? Array.from({ length: tickCount }, (_, i) => (i / (tickCount - 1)) * 100)
      : []
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn("relative w-full select-none", className)}
      {...props}
    >
      <SliderPrimitive.Control className="relative flex h-8 w-full items-center px-3">
        {/* Full-width visual rail; the interactive Track is inset (px-3) so the
            first/last ticks — and the thumb at min/max — sit slightly inside. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted"
        />
        <SliderPrimitive.Track className="relative h-1.5 w-full rounded-full">
          <SliderPrimitive.Indicator className="absolute h-full rounded-full bg-primary" />
          {positions.map((pct, i) => (
            <span
              key={i}
              aria-hidden
              className="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/60"
              style={{ left: `${pct}%` }}
            />
          ))}
          <SliderPrimitive.Thumb className="size-4 rounded-full bg-primary shadow-sm outline-none transition-[box-shadow] focus-visible:ring-2 focus-visible:ring-ring data-[disabled]:opacity-50" />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
      {tickLabels && positions.length > 0 && (
        <div className="relative mx-3 mt-0.5 h-3.5 text-[10px] text-muted-foreground sm:text-[11px]">
          {positions.map((pct, i) => {
            const lbl = tickLabels[i]
            if (!lbl) return null
            return (
              <span
                key={i}
                style={{ left: `${pct}%` }}
                className={cn(
                  "absolute top-0 -translate-x-1/2 whitespace-nowrap leading-tight",
                  i === activeIndex && "font-semibold text-foreground",
                )}
              >
                {lbl}
              </span>
            )
          })}
        </div>
      )}
    </SliderPrimitive.Root>
  )
}

export { Slider }

"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

/**
 * Thin styled wrapper over base-ui's Slider, composing Root → Control → Track →
 * Indicator → Thumb so callers pass value/min/max/step/onValueChange directly.
 *
 * `tickCount` renders evenly-spaced step marks on the track (e.g. for a discrete
 * slider with N positions, pass N) so each step is visually indicated.
 */
function Slider({
  className,
  tickCount,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & { tickCount?: number }) {
  const ticks =
    tickCount && tickCount > 1
      ? Array.from({ length: tickCount }, (_, i) => (i / (tickCount - 1)) * 100)
      : []
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn("relative w-full select-none", className)}
      {...props}
    >
      <SliderPrimitive.Control className="flex w-full items-center py-2">
        <SliderPrimitive.Track className="relative h-1.5 w-full rounded-full bg-muted">
          <SliderPrimitive.Indicator className="absolute h-full rounded-full bg-primary" />
          {ticks.map((pct, i) => (
            <span
              key={i}
              aria-hidden
              className="pointer-events-none absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/30"
              style={{ left: `${pct}%` }}
            />
          ))}
          <SliderPrimitive.Thumb className="size-4 rounded-full bg-primary shadow-sm outline-none transition-[box-shadow] focus-visible:ring-2 focus-visible:ring-ring data-[disabled]:opacity-50" />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }

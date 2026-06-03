"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

/**
 * Thin styled wrapper over base-ui's Slider, composing Root → Control → Track →
 * Indicator → Thumb so callers pass value/min/max/step/onValueChange directly.
 */
function Slider({
  className,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn("relative w-full select-none", className)}
      {...props}
    >
      <SliderPrimitive.Control className="flex w-full items-center py-2">
        <SliderPrimitive.Track className="relative h-1.5 w-full rounded-full bg-muted">
          <SliderPrimitive.Indicator className="absolute h-full rounded-full bg-primary" />
          <SliderPrimitive.Thumb className="size-4 rounded-full bg-primary shadow-sm outline-none transition-[box-shadow] focus-visible:ring-2 focus-visible:ring-ring data-[disabled]:opacity-50" />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }

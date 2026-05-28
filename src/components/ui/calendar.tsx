"use client"

import { DayPicker, type DayPickerProps } from "react-day-picker"
import "react-day-picker/style.css"

import { cn } from "@/lib/utils"

export type CalendarProps = DayPickerProps

function Calendar({ className, ...props }: CalendarProps) {
  return (
    <DayPicker
      data-slot="calendar"
      className={cn("p-3", className)}
      {...props}
    />
  )
}

export { Calendar }

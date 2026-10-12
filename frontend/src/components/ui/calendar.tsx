import * as React from "react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import "react-day-picker/dist/style.css";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

// react-day-picker's default 44px day cells make the month ~330px wide, wider
// than the 280px date-picker popup, so the Saturday column spilled outside it.
const COMPACT_DAYS = {
  "--rdp-day-width": "36px",
  "--rdp-day-height": "36px",
  "--rdp-day_button-width": "34px",
  "--rdp-day_button-height": "34px",
} as React.CSSProperties;

export function Calendar({ className, showOutsideDays = true, style, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      style={{ ...COMPACT_DAYS, ...style }}
      {...props}
    />
  );
}


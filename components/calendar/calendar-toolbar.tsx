"use client";

import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  type CalendarViewMode,
  formatMonthYear,
  formatWeekRange,
  formatDayHeader,
} from "@/lib/calendar-utils";

interface CalendarToolbarProps {
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  currentDate: Date;
  onNavigate: (dir: -1 | 1) => void;
  onToday: () => void;
}

export function CalendarToolbar({
  viewMode,
  onViewModeChange,
  currentDate,
  onNavigate,
  onToday,
}: CalendarToolbarProps) {
  const label =
    viewMode === "month"
      ? formatMonthYear(currentDate)
      : viewMode === "week"
        ? formatWeekRange(currentDate)
        : formatDayHeader(currentDate);

  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onToday}
          className="text-xs font-medium"
        >
          Today
        </Button>

        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onNavigate(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onNavigate(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <h2 className="text-lg font-semibold">{label}</h2>
      </div>

      <div className="flex items-center gap-2">
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(v) => {
            if (v) onViewModeChange(v as CalendarViewMode);
          }}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="day" className="px-3 text-xs">
            Day
          </ToggleGroupItem>
          <ToggleGroupItem value="week" className="px-3 text-xs">
            Week
          </ToggleGroupItem>
          <ToggleGroupItem value="month" className="px-3 text-xs">
            Month
          </ToggleGroupItem>
        </ToggleGroup>

        <Button variant="ghost" size="icon" className="size-8">
          <List className="size-4" />
        </Button>
      </div>
    </div>
  );
}

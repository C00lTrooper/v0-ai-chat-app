"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    <div className="flex flex-col gap-2 border-b border-border px-4 py-2 md:flex-row md:items-center md:justify-between md:gap-0">
      {/* Row 1 on mobile: Today + label (left) | View selector (right). On desktop: Today, arrows, label. */}
      <div className="flex items-center justify-between gap-2 md:flex-1 md:justify-start">
        <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onToday}
              className="text-xs font-medium"
            >
              Today
            </Button>
            <h2 className="text-lg font-semibold md:hidden">{label}</h2>
          </div>
          <div className="hidden items-center md:flex">
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
          <h2 className="hidden text-lg font-semibold md:block">{label}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={viewMode}
            onValueChange={(v) => onViewModeChange(v as CalendarViewMode)}
          >
            <SelectTrigger
              size="sm"
              className="h-8 w-auto min-w-0 gap-1 rounded-lg border-border/60 bg-muted/40 px-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/60 md:hidden [&_svg]:text-muted-foreground"
            >
              <SelectValue placeholder="View" />
            </SelectTrigger>
            <SelectContent align="end" className="min-w-[5rem]">
              <SelectItem value="day" className="cursor-pointer py-2.5">
                Day
              </SelectItem>
              <SelectItem value="week" className="cursor-pointer py-2.5">
                Week
              </SelectItem>
              <SelectItem value="month" className="cursor-pointer py-2.5">
                Month
              </SelectItem>
            </SelectContent>
          </Select>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => {
              if (v) onViewModeChange(v as CalendarViewMode);
            }}
            variant="outline"
            size="sm"
            className="hidden md:flex"
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
        </div>
      </div>
      {/* Row 2 on mobile only: arrows on opposite sides */}
      <div className="flex w-full items-center justify-between md:hidden">
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
    </div>
  );
}

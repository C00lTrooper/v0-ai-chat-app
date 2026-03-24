"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  type CalendarEvent,
  type CalendarPhaseInfo,
  formatTime12h,
  parseTimeToHour,
  resolvePhaseViewEventColor,
} from "@/lib/calendar-utils";
import { cn } from "@/lib/utils";

interface DayTasksDialogProps {
  date: Date | null;
  events: CalendarEvent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEventClick: (event: CalendarEvent) => void;
  phaseViewProjectId?: string | null;
  projectPhasesByProjectId?: Record<string, CalendarPhaseInfo[]>;
}

export function DayTasksDialog({
  date,
  events,
  open,
  onOpenChange,
  onEventClick,
  phaseViewProjectId = null,
  projectPhasesByProjectId = {},
}: DayTasksDialogProps) {
  const sortedEvents = [...events].sort(
    (a, b) => parseTimeToHour(a.timeStr) - parseTimeToHour(b.timeStr),
  );

  const handleEventClick = (evt: CalendarEvent) => {
    onEventClick(evt);
    onOpenChange(false);
  };

  if (!date) return null;

  const dateLabel = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Tasks for {dateLabel}</DialogTitle>
          <DialogDescription>
            {sortedEvents.length} task{sortedEvents.length !== 1 ? "s" : ""}{" "}
            scheduled
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
          {sortedEvents.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground text-center">
              No tasks for this day.
            </p>
          ) : (
            <ul className="space-y-1">
              {sortedEvents.map((evt) => {
                const { hex, isOtherProject } = resolvePhaseViewEventColor(
                  evt,
                  phaseViewProjectId,
                  projectPhasesByProjectId,
                );
                const color = { hex };
                const isCompleted = evt.completed;
                const rowOpacity =
                  (isCompleted ? 0.72 : 1) * (isOtherProject ? 0.45 : 1);
                return (
                  <li key={evt.id}>
                    <button
                      type="button"
                      onClick={() => handleEventClick(evt)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/80",
                      )}
                      style={{
                        borderLeftWidth: 4,
                        borderLeftColor: color.hex,
                        opacity: rowOpacity,
                      }}
                    >
                      <span
                        className="shrink-0 w-14 text-xs font-medium text-muted-foreground"
                        style={{ color: color.hex }}
                      >
                        {formatTime12h(evt.timeStr)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-sm font-medium",
                            isCompleted &&
                              "line-through decoration-emerald-500/70 text-muted-foreground",
                          )}
                        >
                          {evt.taskName}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {evt.projectName}
                          {evt.phaseName ? ` · ${evt.phaseName}` : ""}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

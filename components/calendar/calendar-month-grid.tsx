"use client";

import { cn } from "@/lib/utils";
import {
  type CalendarEvent,
  type CalendarPhaseInfo,
  PROJECT_COLORS,
  getMonthViewDays,
  dateKey,
  isToday,
  isSameDay,
  formatTime12h,
  resolvePhaseViewEventColor,
  weekPhaseColumnRange,
} from "@/lib/calendar-utils";

const DAY_HEADERS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MAX_VISIBLE_EVENTS = 3;

interface CalendarMonthGridProps {
  currentDate: Date;
  selectedDate: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  onSelectDate: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  /** Called when "+N more" is clicked; use to show all tasks for that day in a modal. */
  onDayMoreClick?: (date: Date) => void;
  phaseViewProjectId: string | null;
  projectPhasesByProjectId: Record<string, CalendarPhaseInfo[]>;
}

export function CalendarMonthGrid({
  currentDate,
  selectedDate,
  eventsByDate,
  onSelectDate,
  onEventClick,
  onDayMoreClick,
  phaseViewProjectId,
  projectPhasesByProjectId,
}: CalendarMonthGridProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = getMonthViewDays(year, month);
  const phaseBands =
    phaseViewProjectId != null
      ? (projectPhasesByProjectId[phaseViewProjectId] ?? [])
      : [];
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-x-auto">
        <div className="w-full">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {DAY_HEADERS.map((name) => (
              <div
                key={name}
                className="py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {name}
              </div>
            ))}
          </div>

          {/* Week rows */}
          <div className="grid flex-1 auto-rows-fr">
            {weeks.map((week, wi) => (
              <div
                key={wi}
                className="relative grid grid-cols-7 border-b border-border last:border-b-0"
              >
                {phaseBands.map((phase) => {
                  const range = weekPhaseColumnRange(
                    week,
                    phase.start_date,
                    phase.end_date,
                  );
                  if (!range) return null;
                  const color =
                    PROJECT_COLORS[phase.colorIndex % PROJECT_COLORS.length];
                  const colFrac = 100 / 7;
                  return (
                    <div
                      key={`pv-${wi}-${phase.order}-${phase.start_date}`}
                      className="pointer-events-none absolute inset-y-0 z-0 overflow-hidden rounded-sm"
                      style={{
                        left: `${range.startCol * colFrac}%`,
                        width: `${(range.endCol - range.startCol + 1) * colFrac}%`,
                        backgroundColor: `${color.hex}20`,
                      }}
                    >
                      <div className="truncate px-1 pt-1 text-[8px] font-medium leading-tight text-foreground/35">
                        {phase.name}
                      </div>
                    </div>
                  );
                })}
                {week.map((day, di) => {
                  const inMonth = day.getMonth() === month;
                  const today = isToday(day);
                  const selected = isSameDay(day, selectedDate);
                  const key = dateKey(day);
                  const dayEvents = eventsByDate.get(key) ?? [];
                  const hasMore = dayEvents.length > MAX_VISIBLE_EVENTS;
                  const visible = dayEvents.slice(0, MAX_VISIBLE_EVENTS);

                  return (
                    <div
                      key={di}
                      className={cn(
                        "group relative z-[1] flex min-h-0 flex-col border-r border-border p-1 last:border-r-0",
                        !inMonth && "bg-muted/30",
                      )}
                      onClick={() => onSelectDate(day)}
                    >
                      {/* Day number */}
                      <div className="mb-0.5 flex justify-center">
                        <span
                          className={cn(
                            "flex size-6 items-center justify-center rounded-full text-xs",
                            today &&
                              "bg-primary font-bold text-primary-foreground",
                            !today && selected && "bg-accent font-semibold",
                            !today &&
                              !selected &&
                              inMonth &&
                              "text-foreground group-hover:bg-accent/50",
                            !inMonth && "text-muted-foreground/50",
                          )}
                        >
                          {day.getDate()}
                        </span>
                      </div>

                      {/* Events */}
                      <div className="flex min-h-0 flex-1 flex-col gap-px overflow-hidden">
                        {visible.map((evt) => {
                          const { hex, isOtherProject } =
                            resolvePhaseViewEventColor(
                              evt,
                              phaseViewProjectId,
                              projectPhasesByProjectId,
                            );
                          const color = { hex };
                          const isCompleted = evt.completed;
                          return (
                            <button
                              key={evt.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onEventClick(evt);
                              }}
                              className="relative z-[2] flex w-full items-center gap-1 truncate rounded px-1 py-px text-left text-[11px] leading-tight transition-opacity hover:opacity-80"
                              style={{
                                backgroundColor: isCompleted
                                  ? `${color.hex}10`
                                  : `${color.hex}18`,
                                borderLeft: `3px solid ${color.hex}`,
                                color: color.hex,
                                opacity: isCompleted
                                  ? 0.6
                                  : isOtherProject
                                    ? 0.42
                                    : 1,
                              }}
                              title={`${formatTime12h(evt.timeStr)} · ${evt.taskName}`}
                            >
                              <span className="shrink-0 font-medium">
                                {formatTime12h(evt.timeStr)}
                              </span>
                              <span className="mx-0.5 text-[9px] opacity-50">
                                ·
                              </span>
                              <span
                                className={`truncate ${
                                  isCompleted
                                    ? "line-through decoration-emerald-500/70"
                                    : ""
                                }`}
                              >
                                {evt.taskName}
                              </span>
                            </button>
                          );
                        })}
                        {hasMore && (
                          <button
                            className="mt-px px-1 text-left text-[10px] font-medium text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onDayMoreClick) {
                                onDayMoreClick(day);
                              } else {
                                onSelectDate(day);
                              }
                            }}
                          >
                            +{dayEvents.length - MAX_VISIBLE_EVENTS} more
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { cn } from "@/lib/utils";
import {
  type CalendarEvent,
  PROJECT_COLORS,
  getMonthViewDays,
  dateKey,
  isToday,
  isSameDay,
  formatTime12h,
} from "@/lib/calendar-utils";

const DAY_HEADERS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MAX_VISIBLE_EVENTS = 3;

interface CalendarMonthGridProps {
  currentDate: Date;
  selectedDate: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  onSelectDate: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

export function CalendarMonthGrid({
  currentDate,
  selectedDate,
  eventsByDate,
  onSelectDate,
  onEventClick,
}: CalendarMonthGridProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = getMonthViewDays(year, month);
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
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
          <div key={wi} className="grid grid-cols-7 border-b border-border last:border-b-0">
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
                    "group flex min-h-0 flex-col border-r border-border p-1 last:border-r-0",
                    !inMonth && "bg-muted/30",
                  )}
                  onClick={() => onSelectDate(day)}
                >
                  {/* Day number */}
                  <div className="mb-0.5 flex justify-center">
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-xs",
                        today && "bg-primary font-bold text-primary-foreground",
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
                      const color = PROJECT_COLORS[evt.colorIndex];
                      return (
                        <button
                          key={evt.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEventClick(evt);
                          }}
                          className="flex w-full items-center gap-1 truncate rounded px-1 py-px text-left text-[11px] leading-tight transition-opacity hover:opacity-80"
                          style={{
                            backgroundColor: `${color.hex}18`,
                            borderLeft: `3px solid ${color.hex}`,
                            color: color.hex,
                          }}
                          title={`${formatTime12h(evt.timeStr)} · ${evt.taskName}`}
                        >
                          <span className="shrink-0 font-medium">
                            {formatTime12h(evt.timeStr)}
                          </span>
                          <span className="mx-0.5 text-[9px] opacity-50">·</span>
                          <span className="truncate">{evt.taskName}</span>
                        </button>
                      );
                    })}
                    {hasMore && (
                      <button
                        className="mt-px px-1 text-left text-[10px] font-medium text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDate(day);
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
  );
}

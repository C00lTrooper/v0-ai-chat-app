"use client";

import {
  type CalendarEvent,
  PROJECT_COLORS,
  dateKey,
  isToday,
  formatTime12h,
  formatHour,
  parseTimeToHour,
} from "@/lib/calendar-utils";

const START_HOUR = 6;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const HOUR_HEIGHT = 64;

interface CalendarDayViewProps {
  currentDate: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  onEventClick: (event: CalendarEvent) => void;
}

export function CalendarDayView({
  currentDate,
  eventsByDate,
  onEventClick,
}: CalendarDayViewProps) {
  const key = dateKey(currentDate);
  const dayEvents = eventsByDate.get(key) ?? [];
  const today = isToday(currentDate);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Day header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {currentDate.toLocaleDateString("en-US", { weekday: "short" })}
          </span>
          <span
            className={`flex size-10 items-center justify-center rounded-full text-xl font-semibold ${today ? "bg-primary text-primary-foreground" : ""}`}
          >
            {currentDate.getDate()}
          </span>
        </div>
        <span className="text-sm text-muted-foreground">
          {dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
          {/* Hour rows */}
          {HOURS.map((hour, hi) => (
            <div
              key={hour}
              className="absolute left-0 right-0 flex border-b border-border/50"
              style={{ top: hi * HOUR_HEIGHT, height: HOUR_HEIGHT }}
            >
              <div className="flex w-16 shrink-0 items-start justify-end pr-3">
                <span className="-mt-2 text-[11px] text-muted-foreground">
                  {formatHour(hour)}
                </span>
              </div>
              <div className="flex-1 border-l border-border/50" />
            </div>
          ))}

          {/* Events */}
          {dayEvents.map((evt) => {
            const color = PROJECT_COLORS[evt.colorIndex];
            const hour = parseTimeToHour(evt.timeStr);
            const top = (hour - START_HOUR) * HOUR_HEIGHT;
            if (top < 0 || top >= HOURS.length * HOUR_HEIGHT) return null;

            return (
              <button
                key={evt.id}
                className="absolute right-2 z-10 flex items-start gap-2 overflow-hidden rounded-md px-3 py-2 text-left transition-opacity hover:opacity-80"
                style={{
                  top,
                  left: "4.5rem",
                  height: HOUR_HEIGHT - 4,
                  backgroundColor: `${color.hex}18`,
                  borderLeft: `4px solid ${color.hex}`,
                }}
                onClick={() => onEventClick(evt)}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold" style={{ color: color.hex }}>
                    {evt.taskName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime12h(evt.timeStr)} · {evt.phaseName}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

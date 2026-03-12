"use client";

import { cn } from "@/lib/utils";
import {
  type CalendarEvent,
  PROJECT_COLORS,
  getWeekViewDays,
  dateKey,
  isToday,
  isSameDay,
  formatTime12h,
  formatHour,
  parseTimeToHour,
  eventDurationHours,
} from "@/lib/calendar-utils";

const START_HOUR = 6;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const HOUR_HEIGHT = 60;

interface CalendarWeekGridProps {
  currentDate: Date;
  selectedDate: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  onSelectDate: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

export function CalendarWeekGrid({
  currentDate,
  selectedDate,
  eventsByDate,
  onSelectDate,
  onEventClick,
}: CalendarWeekGridProps) {
  const days = getWeekViewDays(currentDate);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Day headers */}
      <div className="flex border-b border-border">
        <div className="w-14 shrink-0" />
        {days.map((day, i) => {
          const today = isToday(day);
          const selected = isSameDay(day, selectedDate);
          return (
            <button
              key={i}
              className="flex flex-1 flex-col items-center border-l border-border py-2"
              onClick={() => onSelectDate(day)}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {day.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span
                className={cn(
                  "mt-0.5 flex size-7 items-center justify-center rounded-full text-sm",
                  today && "bg-primary font-bold text-primary-foreground",
                  selected && !today && "bg-accent font-semibold",
                  !today && !selected && "hover:bg-accent/50",
                )}
              >
                {day.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="flex flex-1 overflow-auto">
        {/* Hour labels */}
        <div className="w-14 shrink-0">
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="flex items-start justify-end pr-2"
              style={{ height: HOUR_HEIGHT }}
            >
              <span className="-mt-2 text-[10px] text-muted-foreground">
                {formatHour(hour)}
              </span>
            </div>
          ))}
        </div>

        {/* Day columns with events */}
        <div className="grid flex-1 grid-cols-7">
          {days.map((day, di) => {
            const key = dateKey(day);
            const dayEvents = eventsByDate.get(key) ?? [];

            return (
              <div key={di} className="relative border-l border-border/50">
                {/* Hour gridlines */}
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-border/50"
                    style={{ height: HOUR_HEIGHT }}
                  />
                ))}

                {/* Events */}
                {dayEvents.map((evt) => {
                  const color = PROJECT_COLORS[evt.colorIndex];
                  const startHour = parseTimeToHour(evt.timeStr);
                  const durationHours = eventDurationHours(evt);
                  const top = (startHour - START_HOUR) * HOUR_HEIGHT;
                  const height = Math.max(HOUR_HEIGHT / 2, durationHours * HOUR_HEIGHT) - 4;
                  if (top < 0 || top >= HOURS.length * HOUR_HEIGHT) return null;

                  const isCompleted = evt.completed;
                  const timeLabel = evt.endTimeStr
                    ? `${formatTime12h(evt.timeStr)} – ${formatTime12h(evt.endTimeStr)}`
                    : formatTime12h(evt.timeStr);

                  return (
                    <button
                      key={evt.id}
                      className="absolute inset-x-0.5 z-10 flex flex-col overflow-hidden rounded px-1.5 py-0.5 text-left text-[11px] leading-tight transition-opacity hover:opacity-80"
                      style={{
                        top,
                        height,
                        backgroundColor: isCompleted
                          ? `${color.hex}10`
                          : `${color.hex}20`,
                        borderLeft: `3px solid ${color.hex}`,
                        color: color.hex,
                        opacity: isCompleted ? 0.6 : 1,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(evt);
                      }}
                      title={`${timeLabel} · ${evt.taskName}`}
                    >
                      <span className="font-semibold">{timeLabel}</span>
                      <span
                        className={`truncate ${
                          isCompleted ? "line-through decoration-emerald-500/70" : ""
                        }`}
                      >
                        {evt.taskName}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

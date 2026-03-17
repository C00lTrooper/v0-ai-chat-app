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
  normalizeTimeString,
} from "@/lib/calendar-utils";
import { useEffect, useRef, useState } from "react";

const START_HOUR = 6;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const HOUR_HEIGHT = 60;
const DRAG_THRESHOLD_PX = 5;
const RESIZE_HANDLE_PX = 8;

interface CalendarWeekGridProps {
  currentDate: Date;
  selectedDate: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  onSelectDate: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  onEventDragEnd?: (
    event: CalendarEvent,
    newDate: Date,
    newStartTime: string,
    durationHours: number,
  ) => void;
}

export function CalendarWeekGrid({
  currentDate,
  selectedDate,
  eventsByDate,
  onSelectDate,
  onEventClick,
  onEventDragEnd,
}: CalendarWeekGridProps) {
  const days = getWeekViewDays(currentDate);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<{
    event: CalendarEvent;
    dayIndex: number;
    startClientX: number;
    startClientY: number;
    mode: "move" | "resize-top" | "resize-bottom";
    startHour: number;
    durationHours: number;
    deltaX: number;
    deltaY: number;
    hasExceededThreshold: boolean;
  } | null>(null);

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDragState((prev) =>
        prev
          ? {
              ...prev,
              deltaX: e.clientX - prev.startClientX,
              deltaY: e.clientY - prev.startClientY,
              hasExceededThreshold:
                prev.hasExceededThreshold ||
                Math.hypot(
                  e.clientX - prev.startClientX,
                  e.clientY - prev.startClientY,
                ) > DRAG_THRESHOLD_PX,
            }
          : null,
      );
    };

    const handleMouseUp = () => {
      if (!dragState) {
        return;
      }

      // If we never exceeded the drag threshold, treat as a simple click.
      if (!dragState.hasExceededThreshold) {
        setDragState(null);
        onEventClick(dragState.event);
        return;
      }

      if (!onEventDragEnd) {
        setDragState(null);
        return;
      }

      const totalHours = END_HOUR - START_HOUR;

      // Snap vertical movement to 15-minute increments in hours.
      const deltaHoursRaw = dragState.deltaY / HOUR_HEIGHT;
      const snappedDeltaHours = Math.round(deltaHoursRaw * 4) / 4;

      let newStartHour = dragState.startHour;
      let newDuration = dragState.durationHours;

      if (dragState.mode === "move") {
        newStartHour = dragState.startHour + snappedDeltaHours;
        newStartHour = Math.max(
          START_HOUR,
          Math.min(END_HOUR - dragState.durationHours, newStartHour),
        );
        newDuration = dragState.durationHours;
      } else if (dragState.mode === "resize-bottom") {
        newDuration = dragState.durationHours + snappedDeltaHours;
        newDuration = Math.max(
          0.25,
          Math.min(END_HOUR - dragState.startHour, newDuration),
        );
        newStartHour = dragState.startHour;
      } else if (dragState.mode === "resize-top") {
        const endHourFixed = dragState.startHour + dragState.durationHours;
        newStartHour = dragState.startHour + snappedDeltaHours;
        newStartHour = Math.max(
          START_HOUR,
          Math.min(endHourFixed - 0.25, newStartHour),
        );
        newDuration = endHourFixed - newStartHour;
      }

      // Snap resulting start hour to 15-minute increments and clamp.
      const relStart = newStartHour - START_HOUR;
      let relClamped = Math.max(0, Math.min(totalHours - newDuration, relStart));
      const relQuarter = Math.round(relClamped * 4) / 4;
      const finalStartHour = START_HOUR + relQuarter;

      const hour24 = Math.floor(finalStartHour); // 0–23
      const minutes = Math.round((finalStartHour - hour24) * 60); // 0–59
      const newStartTime = `${String(hour24).padStart(2, "0")}:${String(
        minutes,
      ).padStart(2, "0")}`; // "HH:MM" 24-hour

      // Horizontal movement only changes the day for move drags, not resizes.
      let newDayIndex = dragState.dayIndex;
      if (dragState.mode === "move") {
        const gridRect = gridRef.current?.getBoundingClientRect();
        const colWidth = gridRect ? gridRect.width / 7 : 0;
        if (colWidth > 0) {
          const dayOffset = Math.round(dragState.deltaX / colWidth);
          newDayIndex = Math.min(
            6,
            Math.max(0, dragState.dayIndex + dayOffset),
          );
        }
      }

      const weekDays = getWeekViewDays(currentDate);
      const baseDay = weekDays[0];
      const newDate = new Date(
        baseDay.getFullYear(),
        baseDay.getMonth(),
        baseDay.getDate() + newDayIndex,
      );

      onEventDragEnd(dragState.event, newDate, newStartTime, newDuration);

      setDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, onEventDragEnd, currentDate]);

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
        <div className="grid flex-1 grid-cols-7" ref={gridRef}>
          {days.map((day, di) => {
            const key = dateKey(day);
            const dayEvents = eventsByDate.get(key) ?? [];

            const isDraggingColumn =
              dragState && dragState.dayIndex === di ? dragState : null;

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
                  const snappedStartHour = Math.round(startHour * 4) / 4;
                  const durationHours = eventDurationHours(evt);
                  const baseTop = (snappedStartHour - START_HOUR) * HOUR_HEIGHT;
                  const baseHeight =
                    Math.max(HOUR_HEIGHT / 2, durationHours * HOUR_HEIGHT) - 4;

                  const isCompleted = evt.completed;
                  const timeLabel = evt.endTimeStr
                    ? `${formatTime12h(evt.timeStr)} – ${formatTime12h(
                        evt.endTimeStr,
                      )}`
                    : formatTime12h(evt.timeStr);

                  const isDragging =
                    dragState?.event.id === evt.id &&
                    dragState.dayIndex === di &&
                    dragState.hasExceededThreshold;

                  let top = baseTop;
                  let height = baseHeight;

                  if (isDragging && dragState) {
                    const snappedDeltaY =
                      Math.round(dragState.deltaY / (HOUR_HEIGHT / 4)) *
                      (HOUR_HEIGHT / 4);
                    const deltaHours = snappedDeltaY / HOUR_HEIGHT;

                    if (dragState.mode === "move") {
                      top = baseTop + snappedDeltaY;
                    } else if (dragState.mode === "resize-bottom") {
                      const newDuration = Math.max(
                        0.25,
                        durationHours + deltaHours,
                      );
                      height =
                        Math.max(
                          HOUR_HEIGHT / 4,
                          newDuration * HOUR_HEIGHT,
                        ) - 4;
                    } else if (dragState.mode === "resize-top") {
                      const endHourFixed =
                        snappedStartHour + durationHours;
                      let newStartHour = snappedStartHour + deltaHours;
                      newStartHour = Math.max(
                        START_HOUR,
                        Math.min(endHourFixed - 0.25, newStartHour),
                      );
                      const newDuration = endHourFixed - newStartHour;
                      top = (newStartHour - START_HOUR) * HOUR_HEIGHT;
                      height =
                        Math.max(
                          HOUR_HEIGHT / 4,
                          newDuration * HOUR_HEIGHT,
                        ) - 4;
                    }
                  }

                  if (top < 0 || top >= HOURS.length * HOUR_HEIGHT) return null;

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
                        opacity: isCompleted ? 0.6 : isDragging ? 0.8 : 1,
                      }}
                      onMouseDown={(e) => {
                        if (!onEventDragEnd) return;
                        e.preventDefault();
                        e.stopPropagation();

                        const rect =
                          (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                        const offsetY = e.clientY - rect.top;
                        let mode: "move" | "resize-top" | "resize-bottom" = "move";
                        if (offsetY <= RESIZE_HANDLE_PX) {
                          mode = "resize-top";
                        } else if (offsetY >= rect.height - RESIZE_HANDLE_PX) {
                          mode = "resize-bottom";
                        }

                        setDragState({
                          event: evt,
                          dayIndex: di,
                          startClientX: e.clientX,
                          startClientY: e.clientY,
                          mode,
                          startHour: snappedStartHour,
                          durationHours,
                          deltaX: 0,
                          deltaY: 0,
                          hasExceededThreshold: false,
                        });
                      }}
                      title={`${timeLabel} · ${evt.taskName}`}
                    >
                      <span className="font-semibold">{timeLabel}</span>
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

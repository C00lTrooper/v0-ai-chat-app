"use client";

import {
  type CalendarEvent,
  PROJECT_COLORS,
  dateKey,
  isToday,
  formatTime12h,
  formatHour,
  parseTimeToHour,
  eventDurationHours,
} from "@/lib/calendar-utils";
import { useRef } from "react";
import {
  useEventDragResize,
} from "@/components/calendar/use-event-drag-resize";

const START_HOUR = 6;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const HOUR_HEIGHT = 64;

interface CalendarDayViewProps {
  currentDate: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  onEventClick: (event: CalendarEvent) => void;
  onEventDragEnd?: (
    event: CalendarEvent,
    newDate: Date,
    newStartTime: string,
    durationHours: number,
  ) => void;
}

export function CalendarDayView({
  currentDate,
  eventsByDate,
  onEventClick,
  onEventDragEnd,
}: CalendarDayViewProps) {
  const key = dateKey(currentDate);
  const dayEvents = eventsByDate.get(key) ?? [];
  const today = isToday(currentDate);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const { dragState, beginDrag } = useEventDragResize({
    currentDate,
    startHour: START_HOUR,
    endHour: END_HOUR,
    hourHeight: HOUR_HEIGHT,
    hoursLength: HOURS.length,
    columnCount: 1,
    allowHorizontalMove: false,
    getGridRect: () => gridRef.current?.getBoundingClientRect() ?? null,
    onClick: onEventClick,
    onDrop: (args) => {
      if (!onEventDragEnd) return;
      const { event, newDate, newStartTime, durationHours } = args;
      onEventDragEnd(event, newDate, newStartTime, durationHours);
    },
  });

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
        <div
          ref={gridRef}
          className="relative"
          style={{ height: HOURS.length * HOUR_HEIGHT }}
        >
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

            const vis = (() => {
              if (!dragState) {
                const top = baseTop;
                const height = baseHeight;
                if (top < 0 || top >= HOURS.length * HOUR_HEIGHT) {
                  return { hidden: true as const };
                }
                return {
                  hidden: false as const,
                  top,
                  height,
                  isDragging: false,
                  previewDuration: durationHours,
                };
              }

              const baseTopLocal = (snappedStartHour - START_HOUR) * HOUR_HEIGHT;
              const baseHeightLocal =
                Math.max(HOUR_HEIGHT / 2, durationHours * HOUR_HEIGHT) - 4;
              const isDraggingLocal =
                dragState.event.id === evt.id &&
                dragState.dayIndex === 0 &&
                dragState.hasExceededThreshold;

              let top = baseTopLocal;
              let height = baseHeightLocal;
              let previewDuration = durationHours;

              if (isDraggingLocal) {
                const snappedDeltaY =
                  Math.round(dragState.deltaY / (HOUR_HEIGHT / 4)) *
                  (HOUR_HEIGHT / 4);
                const deltaHours = snappedDeltaY / HOUR_HEIGHT;

                if (dragState.mode === "move") {
                  top = baseTopLocal + snappedDeltaY;
                } else if (dragState.mode === "resize-bottom") {
                  const newDuration = Math.max(
                    0.25,
                    durationHours + deltaHours,
                  );
                  previewDuration = newDuration;
                  height =
                    Math.max(HOUR_HEIGHT / 4, newDuration * HOUR_HEIGHT) - 4;
                } else if (dragState.mode === "resize-top") {
                  const endHourFixed = snappedStartHour + durationHours;
                  let newStartHour = snappedStartHour + deltaHours;
                  newStartHour = Math.max(
                    START_HOUR,
                    Math.min(endHourFixed - 0.25, newStartHour),
                  );
                  const newDuration = endHourFixed - newStartHour;
                  previewDuration = newDuration;
                  top = (newStartHour - START_HOUR) * HOUR_HEIGHT;
                  height =
                    Math.max(HOUR_HEIGHT / 4, newDuration * HOUR_HEIGHT) - 4;
                }
              }

              if (top < 0 || top >= HOURS.length * HOUR_HEIGHT) {
                return { hidden: true as const };
              }

              return {
                hidden: false as const,
                top,
                height,
                isDragging: isDraggingLocal,
                previewDuration,
              };
            })();

            if (vis.hidden) return null;

            let durationLabel: string | null = null;
            if (vis.isDragging && dragState && dragState.mode !== "move") {
              const totalMins = Math.round(vis.previewDuration * 60);
              const hrs = Math.floor(totalMins / 60);
              const mins = totalMins % 60;
              if (hrs > 0 && mins > 0) {
                durationLabel = `${hrs}h ${mins}m`;
              } else if (hrs > 0) {
                durationLabel = `${hrs}h`;
              } else {
                durationLabel = `${mins}m`;
              }
            }

            return (
              <button
                key={evt.id}
                className="absolute right-2 z-10 flex items-start gap-2 overflow-hidden rounded-md px-3 py-2 text-left transition-opacity hover:opacity-80"
                style={{
                  top: vis.top,
                  left: "4.5rem",
                  height: vis.height,
                  backgroundColor: isCompleted ? `${color.hex}10` : `${color.hex}18`,
                  borderLeft: `4px solid ${color.hex}`,
                  opacity: isCompleted ? 0.6 : vis.isDragging ? 0.8 : 1,
                  cursor: "default",
                }}
                onMouseDown={(e) => {
                  if (!onEventDragEnd) return;
                  e.preventDefault();
                  e.stopPropagation();
                  beginDrag({
                    event: evt,
                    dayIndex: 0,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    mode: "move",
                    startHour: snappedStartHour,
                    durationHours,
                  });
                }}
              >
                {/* Top resize handle */}
                <div
                  className="absolute left-0 right-0 h-2 cursor-ns-resize"
                  style={{ top: 0 }}
                  onMouseDown={(e) => {
                    if (!onEventDragEnd) return;
                    e.preventDefault();
                    e.stopPropagation();
                    beginDrag({
                      event: evt,
                      dayIndex: 0,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      mode: "resize-top",
                      startHour: snappedStartHour,
                      durationHours,
                    });
                  }}
                />

                {/* Bottom resize handle */}
                <div
                  className="absolute left-0 right-0 h-2 cursor-ns-resize"
                  style={{ bottom: 0 }}
                  onMouseDown={(e) => {
                    if (!onEventDragEnd) return;
                    e.preventDefault();
                    e.stopPropagation();
                    beginDrag({
                      event: evt,
                      dayIndex: 0,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      mode: "resize-bottom",
                      startHour: snappedStartHour,
                      durationHours,
                    });
                  }}
                />

                {durationLabel && (
                  <div className="pointer-events-none absolute right-1 top-1 rounded bg-background/90 px-1 py-0.5 text-[10px] shadow">
                    {durationLabel}
                  </div>
                )}

                <div className="flex flex-col gap-0.5">
                  <span
                    className={`text-sm font-semibold ${
                      isCompleted ? "line-through decoration-emerald-500/70" : ""
                    }`}
                    style={{ color: color.hex }}
                  >
                    {evt.taskName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {timeLabel} · {evt.phaseName}
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

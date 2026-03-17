"use client";

import { useEffect, useState } from "react";
import type { CalendarEvent } from "@/lib/calendar-utils";

export type DragMode = "move" | "resize-top" | "resize-bottom";

export interface EventDragState {
  event: CalendarEvent;
  dayIndex: number;
  startClientX: number;
  startClientY: number;
  mode: DragMode;
  startHour: number;
  durationHours: number;
  deltaX: number;
  deltaY: number;
  hasExceededThreshold: boolean;
}

export const DRAG_THRESHOLD_PX = 5;
export const RESIZE_HANDLE_PX = 8;

interface UseEventDragResizeOptions {
  currentDate: Date;
  startHour: number;
  endHour: number;
  hourHeight: number;
  hoursLength: number;
  columnCount: number;
  allowHorizontalMove: boolean;
  getGridRect?: () => DOMRect | null;
  onClick: (event: CalendarEvent) => void;
  onDrop?: (args: {
    event: CalendarEvent;
    dayIndex: number;
    newDate: Date;
    newStartTime: string;
    durationHours: number;
  }) => void;
}

export function useEventDragResize(options: UseEventDragResizeOptions) {
  const {
    currentDate,
    startHour,
    endHour,
    hourHeight,
    hoursLength,
    columnCount,
    allowHorizontalMove,
    getGridRect,
    onClick,
    onDrop,
  } = options;

  const [dragState, setDragState] = useState<EventDragState | null>(null);

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
        onClick(dragState.event);
        return;
      }

      if (!onDrop) {
        setDragState(null);
        return;
      }

      const totalHours = endHour - startHour;

      // Snap vertical movement to 15-minute increments in hours.
      const deltaHoursRaw = dragState.deltaY / hourHeight;
      const snappedDeltaHours = Math.round(deltaHoursRaw * 4) / 4;

      let newStartHour = dragState.startHour;
      let newDuration = dragState.durationHours;

      if (dragState.mode === "move") {
        newStartHour = dragState.startHour + snappedDeltaHours;
        newStartHour = Math.max(
          startHour,
          Math.min(endHour - dragState.durationHours, newStartHour),
        );
        newDuration = dragState.durationHours;
      } else if (dragState.mode === "resize-bottom") {
        newDuration = dragState.durationHours + snappedDeltaHours;
        newDuration = Math.max(
          0.25,
          Math.min(endHour - dragState.startHour, newDuration),
        );
        newStartHour = dragState.startHour;
      } else if (dragState.mode === "resize-top") {
        const endHourFixed = dragState.startHour + dragState.durationHours;
        newStartHour = dragState.startHour + snappedDeltaHours;
        newStartHour = Math.max(
          startHour,
          Math.min(endHourFixed - 0.25, newStartHour),
        );
        newDuration = endHourFixed - newStartHour;
      }

      // Snap resulting start hour to 15-minute increments and clamp.
      const relStart = newStartHour - startHour;
      let relClamped = Math.max(0, Math.min(totalHours - newDuration, relStart));
      const relQuarter = Math.round(relClamped * 4) / 4;
      const finalStartHour = startHour + relQuarter;

      const hour24 = Math.floor(finalStartHour); // 0–23
      const minutes = Math.round((finalStartHour - hour24) * 60); // 0–59
      const newStartTime = `${String(hour24).padStart(2, "0")}:${String(
        minutes,
      ).padStart(2, "0")}`; // "HH:MM" 24-hour

      // Horizontal movement only changes the day for move drags when allowed.
      let newDayIndex = dragState.dayIndex;
      if (dragState.mode === "move" && allowHorizontalMove && getGridRect) {
        const gridRect = getGridRect();
        const colWidth = gridRect ? gridRect.width / columnCount : 0;
        if (colWidth > 0) {
          const dayOffset = Math.round(dragState.deltaX / colWidth);
          newDayIndex = Math.min(
            columnCount - 1,
            Math.max(0, dragState.dayIndex + dayOffset),
          );
        }
      }

      const baseDate = new Date(currentDate);
      baseDate.setDate(baseDate.getDate() - baseDate.getDay());
      const newDate = allowHorizontalMove
        ? new Date(
            baseDate.getFullYear(),
            baseDate.getMonth(),
            baseDate.getDate() + newDayIndex,
          )
        : new Date(currentDate);

      onDrop({
        event: dragState.event,
        dayIndex: newDayIndex,
        newDate,
        newStartTime,
        durationHours: newDuration,
      });

      setDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    dragState,
    currentDate,
    startHour,
    endHour,
    hourHeight,
    columnCount,
    allowHorizontalMove,
    getGridRect,
    onClick,
    onDrop,
  ]);

  function beginDrag(
    base: Omit<EventDragState, "deltaX" | "deltaY" | "hasExceededThreshold">,
  ) {
    setDragState({
      ...base,
      deltaX: 0,
      deltaY: 0,
      hasExceededThreshold: false,
    });
  }

  function getVisualPosition(args: {
    snappedStartHour: number;
    durationHours: number;
    dayIndex: number;
  }) {
    const { snappedStartHour, durationHours } = args;
    const baseTop = (snappedStartHour - startHour) * hourHeight;
    const baseHeight =
      Math.max(hourHeight / 2, durationHours * hourHeight) - 4;

    const isDragging =
      dragState &&
      dragState.event.id === args.eventId &&
      dragState.dayIndex === args.dayIndex &&
      dragState.hasExceededThreshold;

    let top = baseTop;
    let height = baseHeight;
    let previewDuration = durationHours;

    if (isDragging && dragState) {
      const snappedDeltaY =
        Math.round(dragState.deltaY / (hourHeight / 4)) * (hourHeight / 4);
      const deltaHours = snappedDeltaY / hourHeight;

      if (dragState.mode === "move") {
        top = baseTop + snappedDeltaY;
      } else if (dragState.mode === "resize-bottom") {
        const newDuration = Math.max(0.25, durationHours + deltaHours);
        previewDuration = newDuration;
        height =
          Math.max(hourHeight / 4, newDuration * hourHeight) - 4;
      } else if (dragState.mode === "resize-top") {
        const endHourFixed = snappedStartHour + durationHours;
        let newStartHour = snappedStartHour + deltaHours;
        newStartHour = Math.max(
          startHour,
          Math.min(endHourFixed - 0.25, newStartHour),
        );
        const newDuration = endHourFixed - newStartHour;
        previewDuration = newDuration;
        top = (newStartHour - startHour) * hourHeight;
        height =
          Math.max(hourHeight / 4, newDuration * hourHeight) - 4;
      }
    }

    if (top < 0 || top >= hoursLength * hourHeight) {
      return { hidden: true as const };
    }

    return {
      hidden: false as const,
      top,
      height,
      isDragging: !!isDragging,
      previewDuration,
    };
  }

  return {
    dragState,
    beginDrag,
    getVisualPosition,
  };
}


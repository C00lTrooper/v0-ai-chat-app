"use client";

import type { CalendarEvent } from "@/lib/calendar-utils";
import {
  usePointerDragCore,
  type PointerDragState,
} from "@/components/shared/usePointerDragCore";

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

type EventPayload = Omit<
  EventDragState,
  "deltaX" | "deltaY" | "hasExceededThreshold"
>;

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

  const {
    dragState: coreDrag,
    beginDrag: beginCoreDrag,
  } = usePointerDragCore<EventPayload>({
    onClick: (payload) => onClick(payload.event),
    onDrop: (state) => {
      if (!onDrop) return;

      const dragState: EventDragState = {
        ...state.payload,
        deltaX: state.deltaX,
        deltaY: state.deltaY,
        hasExceededThreshold: state.hasExceededThreshold,
      };

      const totalHours = endHour - startHour;

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

      const relStart = newStartHour - startHour;
      const relClamped = Math.max(0, Math.min(totalHours - newDuration, relStart));
      const relQuarter = Math.round(relClamped * 4) / 4;
      const finalStartHour = startHour + relQuarter;

      const hour24 = Math.floor(finalStartHour);
      const minutes = Math.round((finalStartHour - hour24) * 60);
      const newStartTime = `${String(hour24).padStart(2, "0")}:${String(
        minutes,
      ).padStart(2, "0")}`;

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
    },
  });

  function beginDrag(
    base: Omit<EventDragState, "deltaX" | "deltaY" | "hasExceededThreshold">,
  ) {
    const payload: EventPayload = {
      event: base.event,
      dayIndex: base.dayIndex,
      startClientX: base.startClientX,
      startClientY: base.startClientY,
      mode: base.mode,
      startHour: base.startHour,
      durationHours: base.durationHours,
    };

    beginCoreDrag({
      payload,
      startClientX: base.startClientX,
      startClientY: base.startClientY,
      deltaX: 0,
      deltaY: 0,
      hasExceededThreshold: false,
    });
  }

  function getVisualPosition(args: {
    eventId: string;
    snappedStartHour: number;
    durationHours: number;
    dayIndex: number;
  }) {
    const { snappedStartHour, durationHours, dayIndex } = args;
    const baseTop = (snappedStartHour - startHour) * hourHeight;
    const baseHeight =
      Math.max(hourHeight / 2, durationHours * hourHeight) - 4;

    const isDragging =
      dragState &&
      dragState.event.id === args.eventId &&
      dragState.dayIndex === dayIndex &&
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
    dragState: dragState ?? null,
    beginDrag,
    getVisualPosition,
  };
}


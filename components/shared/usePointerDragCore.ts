"use client";

import { useEffect, useState } from "react";

export interface PointerDragState<TPayload> {
  payload: TPayload;
  startClientX: number;
  startClientY: number;
  deltaX: number;
  deltaY: number;
  hasExceededThreshold: boolean;
}

export const DRAG_THRESHOLD_PX = 5;

interface UsePointerDragCoreOptions<TPayload> {
  onClick?: (payload: TPayload) => void;
  onDrop?: (state: PointerDragState<TPayload>) => void;
}

export function usePointerDragCore<TPayload>(
  options: UsePointerDragCoreOptions<TPayload>,
) {
  const { onClick, onDrop } = options;
  const [dragState, setDragState] =
    useState<PointerDragState<TPayload> | null>(null);

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
      if (!dragState) return;

      if (!dragState.hasExceededThreshold && onClick) {
        onClick(dragState.payload);
        setDragState(null);
        return;
      }

      if (dragState.hasExceededThreshold && onDrop) {
        onDrop(dragState);
      }

      setDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, onClick, onDrop]);

  function beginDrag(base: PointerDragState<TPayload>) {
    setDragState({
      ...base,
      deltaX: 0,
      deltaY: 0,
      hasExceededThreshold: false,
    });
  }

  return { dragState, beginDrag };
}


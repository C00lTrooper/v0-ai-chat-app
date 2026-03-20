"use client";

import { useMemo } from "react";
import { usePointerDragCore } from "@/components/shared/usePointerDragCore";

export type PhaseDragMode = "move" | "resize-left" | "resize-right";

export interface PhaseLayout {
  id: string;
  row: number;
  startDate: Date;
  endDate: Date;
}

export interface PhaseDragStatePayload {
  phaseId: string;
  mode: PhaseDragMode;
  row: number;
  originalStartDate: Date;
  originalEndDate: Date;
  rowPhasesSnapshot: PhaseLayout[];
}

export interface PhaseDragPreview {
  phaseId: string;
  mode: PhaseDragMode;
  startDate: Date;
  endDate: Date;
}

interface UseTimelinePhaseDragOptions {
  dayWidth: number;
  phases: PhaseLayout[];
  onClick?: (phaseId: string) => void;
  onDrop?: (args: {
    movedPhaseId: string;
    mode: PhaseDragMode;
    newStartDate: Date;
    newEndDate: Date;
    rowPhasesSnapshot: PhaseLayout[];
    deltaDays: number;
  }) => void;
}

export function useTimelinePhaseDrag(options: UseTimelinePhaseDragOptions) {
  const { dayWidth, phases, onClick, onDrop } = options;

  const phasesById = useMemo(() => {
    const map = new Map<string, PhaseLayout>();
    for (const p of phases) {
      map.set(p.id, p);
    }
    return map;
  }, [phases]);

  const { dragState, beginDrag } =
    usePointerDragCore<PhaseDragStatePayload>({
      onClick: (payload) => {
        if (!onClick) return;
        onClick(payload.phaseId);
      },
      onDrop: (state) => {
        if (!onDrop) return;
        const payload = state.payload;
        const pixelDeltaX = state.deltaX;
        const deltaDays = Math.round(pixelDeltaX / dayWidth);

        const basePhase = phasesById.get(payload.phaseId);
        if (!basePhase) return;

        const originalStart = payload.originalStartDate;
        const originalEnd = payload.originalEndDate;

        let newStart = new Date(originalStart);
        let newEnd = new Date(originalEnd);

        if (payload.mode === "move") {
          // Move start and end by the exact same day delta to preserve duration.
          newStart = new Date(originalStart);
          newEnd = new Date(originalEnd);
          newStart.setDate(newStart.getDate() + deltaDays);
          newEnd.setDate(newEnd.getDate() + deltaDays);
        } else if (payload.mode === "resize-left") {
          const candidate = new Date(originalStart);
          candidate.setDate(candidate.getDate() + deltaDays);
          if (candidate <= originalEnd) {
            newStart = candidate;
          } else {
            newStart = new Date(originalEnd);
          }
        } else if (payload.mode === "resize-right") {
          const candidate = new Date(originalEnd);
          candidate.setDate(candidate.getDate() + deltaDays);
          if (candidate >= originalStart) {
            newEnd = candidate;
          } else {
            newEnd = new Date(originalStart);
          }
        }

        const newDurationDays =
          Math.round(
            (newEnd.getTime() - newStart.getTime()) / 86_400_000,
          ) + 1;
        console.log("[TimelineDrag] drop compute", {
          phaseId: payload.phaseId,
          mode: payload.mode,
          pixelDeltaX,
          deltaDays,
          newStartDate: newStart.toISOString(),
          newEndDate: newEnd.toISOString(),
          newDurationDays,
        });

        onDrop({
          movedPhaseId: payload.phaseId,
          mode: payload.mode,
          newStartDate: newStart,
          newEndDate: newEnd,
          rowPhasesSnapshot: payload.rowPhasesSnapshot,
          deltaDays,
        });
      },
    });

  function beginPhaseDrag(args: {
    phaseId: string;
    mode: PhaseDragMode;
    clientX: number;
    clientY: number;
  }) {
    const phase = phasesById.get(args.phaseId);
    if (!phase) return;

    const rowPhasesSnapshot = phases
      .filter((p) => p.row === phase.row)
      .map((p) => ({
        id: p.id,
        row: p.row,
        startDate: new Date(p.startDate),
        endDate: new Date(p.endDate),
      }))
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    const originalStart = new Date(phase.startDate);
    const originalEnd = new Date(phase.endDate);
    const originalDurationDays =
      Math.round(
        (originalEnd.getTime() - originalStart.getTime()) / 86_400_000,
      ) + 1;
    console.log("[TimelineDrag] drag start", {
      phaseId: args.phaseId,
      mode: args.mode,
      originalStartDate: originalStart.toISOString(),
      originalEndDate: originalEnd.toISOString(),
      originalDurationDays,
    });

    beginDrag({
      payload: {
        phaseId: args.phaseId,
        mode: args.mode,
        row: phase.row,
        originalStartDate: originalStart,
        originalEndDate: originalEnd,
        rowPhasesSnapshot,
      },
      startClientX: args.clientX,
      startClientY: args.clientY,
      deltaX: 0,
      deltaY: 0,
      hasExceededThreshold: false,
    });
  }

  function getPhasePreview(phaseId: string): PhaseDragPreview | null {
    if (!dragState) return null;
    const payload = dragState.payload;
    if (!dragState.hasExceededThreshold || payload.phaseId !== phaseId) {
      return null;
    }
    const basePhase = phasesById.get(phaseId);
    if (!basePhase) return null;

    const pixelDeltaX = dragState.deltaX;
    const deltaDays = Math.round(pixelDeltaX / dayWidth);
    const originalStart = payload.originalStartDate;
    const originalEnd = payload.originalEndDate;

    let start = new Date(originalStart);
    let end = new Date(originalEnd);

    if (payload.mode === "move") {
      // Preview: shift both start and end by the same rounded day delta.
      start.setDate(start.getDate() + deltaDays);
      end.setDate(end.getDate() + deltaDays);
    } else if (payload.mode === "resize-left") {
      const candidate = new Date(originalStart);
      candidate.setDate(candidate.getDate() + deltaDays);
      if (candidate <= originalEnd) {
        start = candidate;
      } else {
        start = new Date(originalEnd);
      }
    } else if (payload.mode === "resize-right") {
      const candidate = new Date(originalEnd);
      candidate.setDate(candidate.getDate() + deltaDays);
      if (candidate >= originalStart) {
        end = candidate;
      } else {
        end = new Date(originalStart);
      }
    }

    const previewDurationDays =
      Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    console.log("[TimelineDrag] preview frame", {
      phaseId,
      mode: payload.mode,
      pixelDeltaX,
      deltaDays,
      previewStartDate: start.toISOString(),
      previewEndDate: end.toISOString(),
      previewDurationDays,
    });

    return {
      phaseId,
      mode: payload.mode,
      startDate: start,
      endDate: end,
    };
  }

  return {
    dragState,
    beginPhaseDrag,
    getPhasePreview,
  };
}


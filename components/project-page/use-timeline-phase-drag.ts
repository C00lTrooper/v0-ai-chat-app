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
          newStart = new Date(originalStart);
          newStart.setDate(newStart.getDate() + deltaDays);
          const durationDays =
            Math.max(
              1,
              Math.round(
                (originalEnd.getTime() - originalStart.getTime()) /
                  86_400_000,
              ) + 1,
            );
          newEnd = new Date(newStart);
          newEnd.setDate(newEnd.getDate() + durationDays - 1);
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

    beginDrag({
      payload: {
        phaseId: args.phaseId,
        mode: args.mode,
        row: phase.row,
        originalStartDate: new Date(phase.startDate),
        originalEndDate: new Date(phase.endDate),
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

    const deltaDays = Math.round(dragState.deltaX / dayWidth);
    const originalStart = payload.originalStartDate;
    const originalEnd = payload.originalEndDate;

    let start = new Date(originalStart);
    let end = new Date(originalEnd);

    if (payload.mode === "move") {
      start.setDate(start.getDate() + deltaDays);
      const durationDays =
        Math.max(
          1,
          Math.round(
            (originalEnd.getTime() - originalStart.getTime()) /
              86_400_000,
          ) + 1,
        );
      end = new Date(start);
      end.setDate(end.getDate() + durationDays - 1);
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


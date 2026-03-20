import type { Project } from "@/lib/project-schema";

/** Matches Convex / calendar: tasks without a phase use phaseOrder 0. */
export const UNASSIGNED_PHASE_ORDER = 0;

type WbsPhase = Project["project_wbs"][number];

/** ISO YYYY-MM-DD inclusive bounds using string compare. */
export function isTaskDateWithinPhase(
  taskDate: string,
  phase: Pick<WbsPhase, "start_date" | "end_date">,
): boolean {
  const d = taskDate.trim();
  const s = phase.start_date.trim();
  const e = phase.end_date.trim();
  return d.length > 0 && d >= s && d <= e;
}

export function phasesContainingTaskDate(
  phases: WbsPhase[],
  taskDate: string,
): WbsPhase[] {
  return phases.filter((p) => isTaskDateWithinPhase(taskDate, p));
}

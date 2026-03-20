import type { Project } from "./project-schema";

type WbsPhase = Project["project_wbs"][number];
type WbsTask = WbsPhase["tasks"][number];

/** Convex + UI sentinel: tasks without a phase use phaseOrder 0. */
export const UNASSIGNED_CONVEX_PHASE_ORDER = 0;

/** Internal label for WBS signatures and remapping (not shown in UI). */
export const UNASSIGNED_SIGNATURE_PHASE_LABEL = "__unassigned__";

export type ProjectWbsRemapSlice = {
  project_wbs: Project["project_wbs"];
  unassigned_tasks?: Project["unassigned_tasks"];
};

function compareIsoDateStrings(a: string, b: string): number {
  const ta = a?.trim() ?? "";
  const tb = b?.trim() ?? "";
  const c = ta.localeCompare(tb);
  if (c !== 0) return c;
  return 0;
}

/** Parse "HH:MM" or "H:MM AM" style to minutes; stable fallback for sort only. */
function timeToSortMinutes(time: string | undefined): number {
  const t = time?.trim() ?? "";
  if (!t) return 0;
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = parseInt(m24[1], 10);
    const min = parseInt(m24[2], 10);
    if (!Number.isNaN(h) && !Number.isNaN(min)) return h * 60 + min;
  }
  const m12 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const min = parseInt(m12[2], 10);
    const ap = m12[3].toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    if (!Number.isNaN(h) && !Number.isNaN(min)) return h * 60 + min;
  }
  return 0;
}

function compareTasksBySchedule(a: WbsTask, b: WbsTask): number {
  const cd = compareIsoDateStrings(a.date, b.date);
  if (cd !== 0) return cd;
  const ct = timeToSortMinutes(a.time) - timeToSortMinutes(b.time);
  if (ct !== 0) return ct;
  return String(a.name).localeCompare(String(b.name));
}

function comparePhasesByStart(a: WbsPhase, b: WbsPhase): number {
  const cs = compareIsoDateStrings(a.start_date, b.start_date);
  if (cs !== 0) return cs;
  const ce = compareIsoDateStrings(a.end_date, b.end_date);
  if (ce !== 0) return ce;
  return String(a.name).localeCompare(String(b.name));
}

/**
 * Reorders phases by start_date and tasks within each phase by date/time.
 * Assigns contiguous order starting at 1 (earliest phase / task = 1).
 */
export function assignWbsOrdersFromDates(
  wbs: Project["project_wbs"],
): Project["project_wbs"] {
  const sortedPhases = wbs.slice().sort(comparePhasesByStart);
  return sortedPhases.map((phase, phaseIdx) => {
    const tasks = (phase.tasks ?? []).slice().sort(compareTasksBySchedule);
    return {
      ...phase,
      order: phaseIdx + 1,
      tasks: tasks.map((task, taskIdx) => ({
        ...task,
        order: taskIdx + 1,
      })),
    };
  }) as Project["project_wbs"];
}

export function assignUnassignedTaskOrders(
  tasks: Project["unassigned_tasks"] | undefined,
): Project["unassigned_tasks"] {
  const list = (tasks ?? []).slice().sort(compareTasksBySchedule);
  return list.map((task, taskIdx) => ({
    ...task,
    order: taskIdx + 1,
  })) as Project["unassigned_tasks"];
}

export type WbsTaskSignature = {
  phaseName: string;
  taskName: string;
  date: string;
  time: string;
};

export function wbsTaskSignature(
  phaseName: string,
  task: WbsTask,
): WbsTaskSignature {
  return {
    phaseName: String(phaseName).trim(),
    taskName: String(task.name).trim(),
    date: String(task.date ?? "").trim(),
    time: String(task.time ?? "").trim(),
  };
}

export function signatureKey(s: WbsTaskSignature): string {
  return `${s.phaseName}\0${s.taskName}\0${s.date}\0${s.time}`;
}

export function lookupTaskSignatureKey(
  wbs: Project["project_wbs"],
  phaseOrder: number,
  taskOrder: number,
): string | null {
  const phase = wbs.find((p) => p.order === phaseOrder);
  if (!phase) return null;
  const task = phase.tasks?.find((t) => t.order === taskOrder);
  if (!task) return null;
  return signatureKey(wbsTaskSignature(phase.name, task));
}

export function lookupTaskSignatureKeyForRemap(
  slice: ProjectWbsRemapSlice,
  phaseOrder: number,
  taskOrder: number,
): string | null {
  if (phaseOrder === UNASSIGNED_CONVEX_PHASE_ORDER) {
    const task = (slice.unassigned_tasks ?? []).find(
      (t) => t.order === taskOrder,
    );
    if (!task) return null;
    return signatureKey(
      wbsTaskSignature(UNASSIGNED_SIGNATURE_PHASE_LABEL, task),
    );
  }
  return lookupTaskSignatureKey(slice.project_wbs, phaseOrder, taskOrder);
}

export type WbsTaskRemapSlot = {
  phaseOrder: number;
  taskOrder: number;
  key: string;
  phaseName: string;
  taskName: string;
  date: string;
  time: string;
};

export function listWbsTaskSlots(wbs: Project["project_wbs"]): WbsTaskRemapSlot[] {
  const out: WbsTaskRemapSlot[] = [];
  for (const phase of wbs) {
    for (const task of phase.tasks ?? []) {
      out.push({
        phaseOrder: phase.order,
        taskOrder: task.order,
        key: signatureKey(wbsTaskSignature(phase.name, task)),
        phaseName: phase.name,
        taskName: String(task.name).trim(),
        date: String(task.date ?? "").trim(),
        time: String(task.time ?? "").trim(),
      });
    }
  }
  return out;
}

export function listWbsTaskSlotsForRemap(
  slice: ProjectWbsRemapSlice,
): WbsTaskRemapSlot[] {
  const phaseSlots = listWbsTaskSlots(slice.project_wbs);
  const un = slice.unassigned_tasks ?? [];
  const unSlots: WbsTaskRemapSlot[] = un.map((task) => ({
    phaseOrder: UNASSIGNED_CONVEX_PHASE_ORDER,
    taskOrder: task.order,
    key: signatureKey(
      wbsTaskSignature(UNASSIGNED_SIGNATURE_PHASE_LABEL, task),
    ),
    phaseName: UNASSIGNED_SIGNATURE_PHASE_LABEL,
    taskName: String(task.name).trim(),
    date: String(task.date ?? "").trim(),
    time: String(task.time ?? "").trim(),
  }));
  return [...phaseSlots, ...unSlots];
}

export function resolveTaskInRemapSlice(
  slice: ProjectWbsRemapSlice,
  phaseOrder: number,
  taskOrder: number,
): { phaseName: string; task: WbsTask } | null {
  if (phaseOrder === UNASSIGNED_CONVEX_PHASE_ORDER) {
    const task = (slice.unassigned_tasks ?? []).find(
      (t) => t.order === taskOrder,
    );
    if (!task) return null;
    return { phaseName: UNASSIGNED_SIGNATURE_PHASE_LABEL, task };
  }
  const phase = slice.project_wbs.find((p) => p.order === phaseOrder);
  if (!phase) return null;
  const task = phase.tasks?.find((t) => t.order === taskOrder);
  if (!task) return null;
  return { phaseName: phase.name, task };
}

/** Stable multiset fingerprint for phase start/end (order-independent). */
export function phaseScheduleFingerprint(
  wbs: Array<{ name: string; start_date: string; end_date: string }>,
): string {
  return wbs
    .map((p) =>
      `${String(p.start_date).trim()}\0${String(p.end_date).trim()}\0${String(p.name).trim()}`,
    )
    .sort((a, b) => a.localeCompare(b))
    .join("\n");
}

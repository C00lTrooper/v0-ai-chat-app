import { action, internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { Project } from "../lib/project-schema";
import {
  normalizeProjectWbsOrders,
  remapConvexTasksForWbsChange,
} from "./wbsPersistence";

type PhaseIdString = string; // `${projectId}:${phaseOrder}`

interface WbsTask {
  order: number;
  name: string;
  description?: string;
  date: string;
  time: string;
  endTime?: string;
  completed?: boolean;
  anchored?: boolean;
  dependencies?: number[];
}

interface WbsPhase {
  order: number;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  tasks: WbsTask[];
}

interface ProjectJson {
  project_name: string;
  project_summary: Record<string, unknown>;
  project_wbs: WbsPhase[];
  project_milestones?: unknown[];
}

interface TaskSnapshot {
  taskOrder: number;
  taskName?: string;
  date: string;
  time: string;
  endTime?: string;
}

interface TaskChange {
  taskOrder: number;
  name: string;
  anchored: boolean;
  originalDate: string;
  originalTime: string;
  originalEndTime?: string;
  newDate?: string;
  newTime?: string;
  newEndTime?: string;
  movedDays?: number;
  unschedulable?: boolean;
  reason?: string;
}

type ConflictTier = "silent" | "toast" | "review";

const WORK_START = 9 * 60; // 9:00
const WORK_END = 18 * 60; // 6:00 PM
const MAX_MINUTES_PER_DAY = 8 * 60;
const MIN_TASK_MINUTES = 15;

async function authenticateUser(
  ctx: MutationCtx,
  token: string,
): Promise<Doc<"users">> {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();

  if (!session || session.expiresAt <= Date.now()) {
    throw new Error("Unauthenticated");
  }

  const user = await ctx.db.get(session.userId);
  if (!user) {
    throw new Error("User not found");
  }
  return user;
}

async function assertProjectAccess(
  ctx: MutationCtx,
  userId: Id<"users">,
  projectId: Id<"projects">,
): Promise<Doc<"projects">> {
  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Project not found");
  if (project.ownerId !== userId && !project.sharedWith.includes(userId)) {
    throw new Error("Not authorized");
  }
  return project;
}

function parseProjectData(data: string): ProjectJson {
  return JSON.parse(data) as ProjectJson;
}

function parsePhaseId(phaseId: PhaseIdString): {
  projectId: Id<"projects">;
  phaseOrder: number;
} {
  const [projectIdStr, phaseOrderStr] = phaseId.split(":");
  if (!projectIdStr || !phaseOrderStr) {
    throw new Error("Invalid phaseId");
  }
  const phaseOrder = Number(phaseOrderStr);
  if (!Number.isFinite(phaseOrder)) {
    throw new Error("Invalid phaseId phaseOrder");
  }
  return {
    projectId: projectIdStr as Id<"projects">,
    phaseOrder,
  };
}

function parseTimeToMinutes(time: string | undefined): number | null {
  if (!time) return null;
  const t = time.trim().toUpperCase();
  const match = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3];
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function dateDiffInDays(a: string, b: string): number {
  const aDate = new Date(a + "T00:00:00");
  const bDate = new Date(b + "T00:00:00");
  const msPerDay = 86_400_000;
  return Math.round((bDate.getTime() - aDate.getTime()) / msPerDay);
}

function* iterateDatesInclusive(start: string, end: string): Generator<string> {
  const current = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  while (current.getTime() <= endDate.getTime()) {
    yield current.toISOString().slice(0, 10);
    current.setDate(current.getDate() + 1);
  }
}

function topologicalSortTasks(tasks: WbsTask[]): WbsTask[] {
  // Deterministic Kahn-style topological sort with stable tie-breaking by `order`.
  const byOrder = new Map<number, WbsTask>();
  const allOrders: number[] = [];
  for (const t of tasks) {
    byOrder.set(t.order, t);
    allOrders.push(t.order);
  }
  allOrders.sort((a, b) => a - b);

  const inDegree = new Map<number, number>();
  const outgoing = new Map<number, number[]>();
  for (const order of allOrders) {
    inDegree.set(order, 0);
    outgoing.set(order, []);
  }

  for (const task of tasks) {
    const deps = task.dependencies ?? [];
    for (const dep of deps) {
      if (!byOrder.has(dep)) continue; // ignore deps outside this phase task set
      inDegree.set(task.order, (inDegree.get(task.order) ?? 0) + 1);
      outgoing.get(dep)?.push(task.order);
    }
  }

  const queue: number[] = [];
  for (const order of allOrders) {
    if ((inDegree.get(order) ?? 0) === 0) queue.push(order);
  }

  const result: WbsTask[] = [];
  const queued = new Set(queue);

  while (queue.length > 0) {
    queue.sort((a, b) => a - b); // stable deterministic behavior
    const order = queue.shift()!;
    queued.delete(order);
    const task = byOrder.get(order);
    if (!task) continue;
    result.push(task);

    for (const dependent of outgoing.get(order) ?? []) {
      const next = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, next);
      if (next === 0 && !queued.has(dependent)) {
        queue.push(dependent);
        queued.add(dependent);
      }
    }
  }

  // Cycle fallback: append remaining tasks by order.
  if (result.length !== tasks.length) {
    const used = new Set(result.map((t) => t.order));
    const remaining = tasks
      .filter((t) => !used.has(t.order))
      .slice()
      .sort((a, b) => a.order - b.order);
    return [...result, ...remaining];
  }

  return result;
}

function schedulePhaseTasks(
  phase: WbsPhase,
): {
  updatedPhase: WbsPhase;
  snapshots: TaskSnapshot[];
  changes: TaskChange[];
  tier: ConflictTier;
} {
  const now = Date.now();

  const anchored: WbsTask[] = [];
  const flexible: WbsTask[] = [];

  for (const task of phase.tasks) {
    const isAnchored = task.anchored === true;
    if (isAnchored) anchored.push(task);
    else flexible.push(task);
  }

  const snapshots: TaskSnapshot[] = [];
  for (const task of flexible) {
    snapshots.push({
      taskOrder: task.order,
      taskName: task.name,
      date: task.date,
      time: task.time,
      endTime: task.endTime,
    });
  }

  const workingMinutesPerDay = WORK_END - WORK_START;
  // Edge case: empty phase range (invalid dates)
  const phaseDates: string[] = [];
  for (const d of iterateDatesInclusive(phase.start_date, phase.end_date)) {
    phaseDates.push(d);
  }
  if (phaseDates.length === 0) {
    return {
      updatedPhase: phase,
      snapshots,
      changes: [],
      tier: "silent" as ConflictTier,
    };
  }

  type Interval = { start: number; end: number };

  const occupiedByDay = new Map<string, Interval[]>();
  function getOccupied(date: string): Interval[] {
    return occupiedByDay.get(date) ?? [];
  }

  function mergeIntervals(intervals: Interval[]): Interval[] {
    const sorted = intervals
      .slice()
      .filter((r) => r.end > r.start)
      .sort((a, b) => (a.start - b.start) || (a.end - b.end));
    const merged: Interval[] = [];
    for (const r of sorted) {
      const last = merged[merged.length - 1];
      if (!last) {
        merged.push({ start: r.start, end: r.end });
        continue;
      }
      if (r.start <= last.end) {
        last.end = Math.max(last.end, r.end);
      } else {
        merged.push({ start: r.start, end: r.end });
      }
    }
    return merged;
  }

  function getUsedMinutes(date: string): number {
    const merged = getOccupied(date);
    return merged.reduce((sum, r) => sum + (r.end - r.start), 0);
  }

  function addOccupied(date: string, start: number, end: number) {
    const intervals = getOccupied(date).concat([{ start, end }]);
    occupiedByDay.set(date, mergeIntervals(intervals));
  }

  function clampTaskDurationToDay(duration: number): number {
    // Never allow 0/negative duration; clamp to [15m, 8h/day].
    if (!Number.isFinite(duration) || duration <= 0) return MIN_TASK_MINUTES;
    return Math.max(MIN_TASK_MINUTES, Math.min(duration, MAX_MINUTES_PER_DAY));
  }

  function computeTaskStartEndMins(task: WbsTask): {
    startMins: number;
    endMins: number;
    durationMins: number;
  } {
    const rawStartMins = parseTimeToMinutes(task.time) ?? WORK_START;
    // Clamp to working window to keep scheduling math safe/consistent.
    const startMins = Math.min(
      WORK_END - MIN_TASK_MINUTES,
      Math.max(WORK_START, rawStartMins),
    );
    const endMinsParsed = parseTimeToMinutes(task.endTime);
    let durationMins: number;
    if (endMinsParsed != null && endMinsParsed > startMins) {
      durationMins = endMinsParsed - startMins;
    } else {
      // If duration is missing or invalid, default to 1 hour.
      durationMins = 60;
    }

    durationMins = clampTaskDurationToDay(durationMins);

    // Clamp inside working hours window.
    let endMins = Math.min(WORK_END, startMins + durationMins);

    // If the start is too close to WORK_END to fit the minimum duration,
    // shift the start left deterministically.
    if (endMins - startMins < MIN_TASK_MINUTES) {
      endMins = WORK_END;
      const shiftedStart = WORK_END - MIN_TASK_MINUTES;
      return {
        startMins: Math.max(WORK_START, shiftedStart),
        endMins,
        durationMins: endMins - Math.max(WORK_START, shiftedStart),
      };
    }

    return {
      startMins,
      endMins,
      durationMins: endMins - startMins,
    };
  }

  function findEarliestFitSlot(
    date: string,
    durationMins: number,
  ): Interval | null {
    const merged = getOccupied(date).slice().sort((a, b) => a.start - b.start);
    let cursor = WORK_START;
    for (const interval of merged) {
      const gap = interval.start - cursor;
      if (gap >= durationMins) {
        const start = cursor;
        const end = start + durationMins;
        if (end <= WORK_END) return { start, end };
      }
      cursor = Math.max(cursor, interval.end);
      if (cursor >= WORK_END) break;
    }
    const remaining = WORK_END - cursor;
    if (remaining >= durationMins) {
      return { start: cursor, end: cursor + durationMins };
    }
    return null;
  }

  function findLargestFitInEarliestGap(
    date: string,
    requestedDuration: number,
  ): { slot: Interval; usedDuration: number } | null {
    const merged = getOccupied(date).slice().sort((a, b) => a.start - b.start);
    let cursor = WORK_START;
    const used = getUsedMinutes(date);
    const remainingCap = Math.max(0, MAX_MINUTES_PER_DAY - used);
    if (remainingCap < MIN_TASK_MINUTES) return null;

    for (const interval of merged) {
      const gapStart = cursor;
      const gapLen = interval.start - cursor;
      if (gapLen >= MIN_TASK_MINUTES) {
        const possible = Math.min(requestedDuration, gapLen, remainingCap);
        if (possible >= MIN_TASK_MINUTES) {
          const start = gapStart;
          const end = start + possible;
          return { slot: { start, end }, usedDuration: possible };
        }
      }
      cursor = Math.max(cursor, interval.end);
      if (cursor >= WORK_END) break;
    }

    const gapLen = WORK_END - cursor;
    if (gapLen >= MIN_TASK_MINUTES) {
      const possible = Math.min(requestedDuration, gapLen, remainingCap);
      if (possible >= MIN_TASK_MINUTES) {
        return { slot: { start: cursor, end: cursor + possible }, usedDuration: possible };
      }
    }
    return null;
  }

  function withinPhaseBounds(date: string, startMins: number, endMins: number): boolean {
    if (date < phase.start_date || date > phase.end_date) return false;
    if (startMins < WORK_START || endMins > WORK_END) return false;
    if (endMins <= startMins) return false;
    return true;
  }

  // Seed occupied intervals with anchored tasks (fixed points).
  for (const date of phaseDates) occupiedByDay.set(date, []);

  for (const task of anchored) {
    const date = task.date;
    if (date < phase.start_date || date > phase.end_date) {
      // Anchored tasks outside phase boundaries don't affect redistribution inside this phase.
      continue;
    }
    const { startMins, endMins, durationMins } = computeTaskStartEndMins(task);
    if (durationMins < MIN_TASK_MINUTES) continue;
    addOccupied(date, startMins, endMins);
  }

  // Normalize anchored occupancy by merging.
  for (const date of phaseDates) {
    occupiedByDay.set(date, mergeIntervals(getOccupied(date)));
  }

  const sortedFlexible = topologicalSortTasks(flexible);

  // Precompute flexible requested durations (for deciding spread vs dense).
  const requestedDurationByOrder = new Map<number, number>();
  let requestedFlexibleMinutesTotal = 0;
  for (const task of sortedFlexible) {
    const { durationMins } = computeTaskStartEndMins(task);
    requestedDurationByOrder.set(task.order, durationMins);
    requestedFlexibleMinutesTotal += durationMins;
  }

  // Compute available minutes in phase considering anchored occupancy and 8h/day cap.
  let availableMinutesTotal = 0;
  for (const date of phaseDates) {
    const used = getUsedMinutes(date);
    availableMinutesTotal += Math.max(0, MAX_MINUTES_PER_DAY - used);
  }

  const useDensePacking = requestedFlexibleMinutesTotal >= availableMinutesTotal;
  const totalFlexibleTasks = sortedFlexible.length;

  const changes: TaskChange[] = [];

  console.log("[scheduling] runSchedulingEngine phase", {
    phaseStart: phase.start_date,
    phaseEnd: phase.end_date,
    phaseOrderTasks: phase.tasks.length,
    flexibleTasks: totalFlexibleTasks,
    anchoredTasks: anchored.length,
    densePacking: useDensePacking,
    requestedFlexibleMinutesTotal,
    availableMinutesTotal,
    ts: now,
  });

  for (let idx = 0; idx < sortedFlexible.length; idx++) {
    const task = sortedFlexible[idx];
    const originalDate = task.date;
    const originalTime = task.time;
    const originalEndTime = task.endTime;

    const requestedDuration = requestedDurationByOrder.get(task.order) ?? 60;
    const durationMin = MIN_TASK_MINUTES;
    const durationDesired = clampTaskDurationToDay(requestedDuration);

    console.log("[scheduling] flexible task before", {
      taskOrder: task.order,
      name: task.name,
      originalDate,
      originalTime,
      originalEndTime,
      requestedDurationMins: durationDesired,
    });

    let chosenDate: string | null = null;
    let chosenInterval: Interval | null = null;
    let usedDuration = 0;
    let durationReduced = false;

    function* candidateDays(): Generator<string> {
      if (useDensePacking) {
        yield* phaseDates;
        return;
      }

      const phaseLengthDays = phaseDates.length;
      if (totalFlexibleTasks === 0) return;
      const position = (idx + 0.5) / totalFlexibleTasks; // 0..1
      const targetDayIndex = Math.min(
        phaseLengthDays - 1,
        Math.max(0, Math.floor(position * phaseLengthDays)),
      );

      for (let radius = 0; radius < phaseLengthDays; radius++) {
        const left = targetDayIndex - radius;
        const right = targetDayIndex + radius;
        if (radius === 0) {
          if (left >= 0 && left < phaseLengthDays) yield phaseDates[left];
          continue;
        }
        const leftOk = left >= 0 && left < phaseLengthDays;
        const rightOk = right >= 0 && right < phaseLengthDays;
        // tie-break toward earlier day for determinism
        if (leftOk) yield phaseDates[left];
        if (rightOk) yield phaseDates[right];
      }
    }

    for (const date of candidateDays()) {
      // Ensure date is still within phase range
      if (date < phase.start_date || date > phase.end_date) continue;

      // Fast fail if day has no capacity left
      const remainingCap = Math.max(0, MAX_MINUTES_PER_DAY - getUsedMinutes(date));
      if (remainingCap < durationMin) continue;

      // Try exact requested duration first
      const exactSlot = findEarliestFitSlot(date, durationDesired);
      if (exactSlot) {
        chosenDate = date;
        chosenInterval = exactSlot;
        usedDuration = durationDesired;
        break;
      }

      // Otherwise, try to fit as large as possible in earliest available gap
      const largest = findLargestFitInEarliestGap(date, durationDesired);
      if (largest) {
        chosenDate = date;
        chosenInterval = largest.slot;
        usedDuration = largest.usedDuration;
        durationReduced = usedDuration < durationDesired;
        break;
      }
    }

    if (chosenDate && chosenInterval) {
      addOccupied(chosenDate, chosenInterval.start, chosenInterval.end);
      task.date = chosenDate;
      task.time = minutesToTime(chosenInterval.start);
      task.endTime = minutesToTime(chosenInterval.end);

      const movedDays = dateDiffInDays(originalDate, chosenDate);
      changes.push({
        taskOrder: task.order,
        name: task.name,
        anchored: false,
        originalDate,
        originalTime,
        originalEndTime,
        newDate: task.date,
        newTime: task.time,
        newEndTime: task.endTime,
        movedDays: Math.abs(movedDays),
        unschedulable: durationReduced ? true : undefined,
        reason: durationReduced
          ? "Duration reduced to fit within phase capacity"
          : undefined,
      });
    } else {
      // No conflict-free slot available for the requested duration.
      // Final fallback: if possible, still place the task into the next available
      // 15-minute slot to guarantee it gets repositioned deterministically.
      let minChosenDate: string | null = null;
      let minChosenInterval: Interval | null = null;
      for (const date of candidateDays()) {
        const minSlot = findEarliestFitSlot(date, MIN_TASK_MINUTES);
        if (minSlot) {
          minChosenDate = date;
          minChosenInterval = minSlot;
          break;
        }
      }

      if (minChosenDate && minChosenInterval) {
        addOccupied(minChosenDate, minChosenInterval.start, minChosenInterval.end);
        task.date = minChosenDate;
        task.time = minutesToTime(minChosenInterval.start);
        task.endTime = minutesToTime(minChosenInterval.end);

        const movedDays = dateDiffInDays(originalDate, minChosenDate);
        changes.push({
          taskOrder: task.order,
          name: task.name,
          anchored: false,
          originalDate,
          originalTime,
          originalEndTime,
          newDate: task.date,
          newTime: task.time,
          newEndTime: task.endTime,
          movedDays: Math.abs(movedDays),
          unschedulable: true,
          reason: "Placed at minimum 15-minute slot (duration reduced to fit)",
        });
      } else {
        // Nothing fits even for 15 minutes; keep within-phase clamping in repair pass.
        changes.push({
          taskOrder: task.order,
          name: task.name,
          anchored: false,
          originalDate,
          originalTime,
          originalEndTime,
          unschedulable: true,
          reason: "No available slot within phase boundaries",
        });
      }
    }

    console.log("[scheduling] flexible task after", {
      taskOrder: task.order,
      date: task.date,
      time: task.time,
      endTime: task.endTime,
    });
  }

  // Validation / repair pass:
  // Ensure all flexible tasks end up with valid start/end inside phase boundaries.
  for (const task of flexible) {
    const { startMins, endMins } = computeTaskStartEndMins(task);
    const valid = withinPhaseBounds(task.date, startMins, endMins);
    if (valid) continue;

    console.warn("[scheduling] repair task outside bounds", {
      taskOrder: task.order,
      original: { date: task.date, time: task.time, endTime: task.endTime },
      phase: { start: phase.start_date, end: phase.end_date },
    });

    // Rebuild occupancy excluding this task: anchored + all other flexible tasks that already look valid.
    const repairOccupied = new Map<string, Interval[]>();
    for (const date of phaseDates) repairOccupied.set(date, []);

    for (const a of anchored) {
      if (a.date < phase.start_date || a.date > phase.end_date) continue;
      const { startMins: s, endMins: e } = computeTaskStartEndMins(a);
      addOccupiedTo(repairOccupied, a.date, s, e);
    }

    // Helper to add/merge into repairOccupied.
    function addOccupiedTo(map: Map<string, Interval[]>, date: string, start: number, end: number) {
      const cur = map.get(date) ?? [];
      cur.push({ start, end });
      map.set(date, mergeIntervals(cur));
    }

    for (const other of flexible) {
      if (other.order === task.order) continue;
      const { startMins: s, endMins: e } = computeTaskStartEndMins(other);
      if (!withinPhaseBounds(other.date, s, e)) continue;
      addOccupiedTo(repairOccupied, other.date, s, e);
    }

    // Try dense earliest fit to repair deterministically.
    let repaired = false;
    for (const date of phaseDates) {
      const used = (repairOccupied.get(date) ?? []).reduce((sum, r) => sum + (r.end - r.start), 0);
      const remainingCap = Math.max(0, MAX_MINUTES_PER_DAY - used);
      if (remainingCap < MIN_TASK_MINUTES) continue;

      const requested = requestedDurationByOrder.get(task.order) ?? 60;
      const durationDesired = clampTaskDurationToDay(requested);

      const getOccupiedRepair = () => mergeIntervals(repairOccupied.get(date) ?? []);
      const prevOccupied = getOccupiedRepair();
      const findSlot = (durationMins: number): Interval | null => {
        let cursor = WORK_START;
        for (const interval of prevOccupied) {
          const gap = interval.start - cursor;
          if (gap >= durationMins) {
            const start = cursor;
            const end = start + durationMins;
            if (end <= WORK_END) return { start, end };
          }
          cursor = Math.max(cursor, interval.end);
          if (cursor >= WORK_END) break;
        }
        if (WORK_END - cursor >= durationMins) return { start: cursor, end: cursor + durationMins };
        return null;
      };

      const exact = findSlot(durationDesired);
      const chosen = exact
        ? { slot: exact, usedDuration: durationDesired, reduced: false }
        : (() => {
            // largest fit in earliest gap (respecting remaining cap)
            const merged = prevOccupied;
            let cursor = WORK_START;
            for (const interval of merged) {
              const gapLen = interval.start - cursor;
              if (gapLen >= MIN_TASK_MINUTES) {
                const possible = Math.min(durationDesired, gapLen, remainingCap);
                if (possible >= MIN_TASK_MINUTES) {
                  return { slot: { start: cursor, end: cursor + possible }, usedDuration: possible, reduced: possible < durationDesired };
                }
              }
              cursor = Math.max(cursor, interval.end);
              if (cursor >= WORK_END) break;
            }
            const gapLen = WORK_END - cursor;
            if (gapLen >= MIN_TASK_MINUTES) {
              const possible = Math.min(durationDesired, gapLen, remainingCap);
              if (possible >= MIN_TASK_MINUTES) {
                return { slot: { start: cursor, end: cursor + possible }, usedDuration: possible, reduced: possible < durationDesired };
              }
            }
            return null;
          })();

      if (!chosen) continue;

      // Apply repair into the task fields.
      task.date = date;
      task.time = minutesToTime(chosen.slot.start);
      task.endTime = minutesToTime(chosen.slot.end);
      repaired = true;
      break;
    }

    if (!repaired) {
      // Last resort: clamp into working hours window without moving dates beyond phase boundaries.
      const clampedDate = task.date < phase.start_date ? phase.start_date : task.date > phase.end_date ? phase.end_date : task.date;
      const { startMins, durationMins } = computeTaskStartEndMins(task);
      const s = Math.min(Math.max(startMins, WORK_START), WORK_END - MIN_TASK_MINUTES);
      const e = Math.min(WORK_END, s + Math.max(MIN_TASK_MINUTES, durationMins));
      task.date = clampedDate;
      task.time = minutesToTime(s);
      task.endTime = minutesToTime(e);
    }

    console.log("[scheduling] repair task after", {
      taskOrder: task.order,
      date: task.date,
      time: task.time,
      endTime: task.endTime,
    });
  }

  const unschedulableCount = changes.filter((c) => Boolean(c.unschedulable)).length;
  const significant = changes.filter(
    (c) => !c.unschedulable && (c.movedDays ?? 0) >= 1,
  ).length;

  let tier: ConflictTier = "silent";
  if (unschedulableCount > 0 || significant > 5) {
    tier = "review";
  } else if (significant >= 2 && significant <= 5) {
    tier = "toast";
  } else {
    tier = "silent";
  }

  return {
    updatedPhase: phase,
    snapshots,
    changes,
    tier,
  };
}

export const runSchedulingEngineInternal = internalMutation({
  args: {
    token: v.string(),
    phaseId: v.string(),
  },
  returns: v.object({
    tier: v.union(v.literal("silent"), v.literal("toast"), v.literal("review")),
    phaseId: v.string(),
    snapshotId: v.id("schedulingSnapshots"),
    changes: v.array(
      v.object({
        taskOrder: v.number(),
        name: v.string(),
        anchored: v.boolean(),
        originalDate: v.string(),
        originalTime: v.string(),
        originalEndTime: v.optional(v.string()),
        newDate: v.optional(v.string()),
        newTime: v.optional(v.string()),
        newEndTime: v.optional(v.string()),
        movedDays: v.optional(v.number()),
        unschedulable: v.optional(v.boolean()),
        reason: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const { projectId, phaseOrder } = parsePhaseId(args.phaseId);
    const project = await assertProjectAccess(ctx, user._id, projectId);

    const previousDataJson = project.data;
    const parsed = parseProjectData(project.data);
    const phase = parsed.project_wbs.find((p) => p.order === phaseOrder);
    if (!phase) {
      throw new Error("Phase not found");
    }

    // Deduplicate very recent runs to avoid double-scheduling when the UI also
    // triggers the engine for the same phase via the public action.
    const recentSnapshot = await ctx.db
      .query("schedulingSnapshots")
      .withIndex("by_project_phase_user", (q) =>
        q
          .eq("projectId", projectId)
          .eq("phaseOrder", phaseOrder)
          .eq("userId", user._id),
      )
      .order("desc")
      .take(1);
    if (
      recentSnapshot.length === 1 &&
      Date.now() - recentSnapshot[0].createdAt <= 10_000
    ) {
      return {
        tier: "silent" as const,
        phaseId: args.phaseId,
        snapshotId: recentSnapshot[0]._id,
        changes: [] as TaskChange[],
      };
    }

    const phaseName = phase.name;

    const { updatedPhase, snapshots, changes, tier } = schedulePhaseTasks(phase);

    parsed.project_wbs = parsed.project_wbs.map((p) =>
      p.order === phaseOrder ? updatedPhase : p,
    );

    const normalized = normalizeProjectWbsOrders(parsed as Project);
    const snapshotPhaseOrder =
      normalized.project_wbs.find((p) => p.name === phaseName)?.order ??
      phaseOrder;

    await remapConvexTasksForWbsChange(
      ctx,
      projectId,
      previousDataJson,
      normalized,
    );

    const snapshotId = await ctx.db.insert("schedulingSnapshots", {
      userId: user._id,
      projectId,
      phaseOrder: snapshotPhaseOrder,
      snapshot: snapshots,
      createdAt: Date.now(),
    });

    await ctx.db.patch(projectId, {
      data: JSON.stringify(normalized),
      updatedAt: Date.now(),
    });

    return {
      tier,
      phaseId: args.phaseId,
      snapshotId,
      changes,
    };
  },
});

type RunSchedulingResult = {
  tier: ConflictTier;
  phaseId: string;
  snapshotId: Id<"schedulingSnapshots">;
  changes: TaskChange[];
};

export const runSchedulingEngine = action({
  args: {
    token: v.string(),
    phaseId: v.string(),
  },
  returns: v.object({
    tier: v.union(v.literal("silent"), v.literal("toast"), v.literal("review")),
    phaseId: v.string(),
    snapshotId: v.id("schedulingSnapshots"),
    changes: v.array(
      v.object({
        taskOrder: v.number(),
        name: v.string(),
        anchored: v.boolean(),
        originalDate: v.string(),
        originalTime: v.string(),
        originalEndTime: v.optional(v.string()),
        newDate: v.optional(v.string()),
        newTime: v.optional(v.string()),
        newEndTime: v.optional(v.string()),
        movedDays: v.optional(v.number()),
        unschedulable: v.optional(v.boolean()),
        reason: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, args): Promise<RunSchedulingResult> => {
    return await ctx.runMutation(
      internal.scheduling.runSchedulingEngineInternal,
      args,
    );
  },
});

export const undoLastSchedulingRun = internalMutation({
  args: {
    token: v.string(),
    phaseId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const { projectId, phaseOrder } = parsePhaseId(args.phaseId);
    await assertProjectAccess(ctx, user._id, projectId);

    const now = Date.now();
    const snapshots = await ctx.db
      .query("schedulingSnapshots")
      .withIndex("by_project_phase_user", (q) =>
        q
          .eq("projectId", projectId)
          .eq("phaseOrder", phaseOrder)
          .eq("userId", user._id),
      )
      .order("desc")
      .take(5);

    const recent = snapshots.find(
      (s) => now - s.createdAt <= 24 * 60 * 60 * 1000,
    );
    if (!recent) {
      return false;
    }

    const project = await ctx.db.get(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const previousDataJson = project.data;
    const parsed = parseProjectData(project.data);
    const phase = parsed.project_wbs.find((p) => p.order === phaseOrder);
    if (!phase) {
      throw new Error("Phase not found");
    }

    const consumed = new Set<number>();
    phase.tasks = phase.tasks.map((t) => {
      const i = recent.snapshot.findIndex((s, idx) => {
        if (consumed.has(idx)) return false;
        if (s.taskName != null && s.taskName.length > 0) {
          return s.taskName === t.name;
        }
        return s.taskOrder === t.order;
      });
      if (i < 0) return t;
      consumed.add(i);
      const snap = recent.snapshot[i];
      return {
        ...t,
        date: snap.date,
        time: snap.time,
        endTime: snap.endTime,
      };
    });

    parsed.project_wbs = parsed.project_wbs.map((p) =>
      p.order === phaseOrder ? phase : p,
    );

    const normalizedUndo = normalizeProjectWbsOrders(parsed as Project);
    await remapConvexTasksForWbsChange(
      ctx,
      projectId,
      previousDataJson,
      normalizedUndo,
    );

    await ctx.db.patch(projectId, {
      data: JSON.stringify(normalizedUndo),
      updatedAt: Date.now(),
    });

    // Optionally delete the snapshot after use
    await ctx.db.delete(recent._id);

    return true;
  },
});

// ---------------------------------------------------------------------------
// Project-level deferred recalculation (runs the engine for every phase)
// ---------------------------------------------------------------------------

function makeRunId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const runProjectSchedulingEngineInternal = internalMutation({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
  },
  returns: v.object({
    runId: v.string(),
    phasesProcessed: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    await assertProjectAccess(ctx, user._id, args.projectId);

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const previousDataJson = project.data;
    const parsed = parseProjectData(project.data);
    if (!Array.isArray(parsed.project_wbs)) {
      throw new Error("Invalid project WBS");
    }

    const runId = makeRunId();
    const createdAt = Date.now();

    const updatedPhases = [];
    const pendingSnapshots: Array<{
      phaseName: string;
      snapshots: TaskSnapshot[];
    }> = [];
    let phasesProcessed = 0;

    for (const phase of parsed.project_wbs) {
      const { updatedPhase, snapshots } = schedulePhaseTasks(phase);

      pendingSnapshots.push({ phaseName: phase.name, snapshots });
      updatedPhases.push(updatedPhase);
      phasesProcessed++;
    }

    const nextProject = {
      ...parsed,
      project_wbs: updatedPhases,
    };

    const normalizedProject = normalizeProjectWbsOrders(nextProject as Project);

    for (const pending of pendingSnapshots) {
      const np = normalizedProject.project_wbs.find(
        (p) => p.name === pending.phaseName,
      );
      const phaseOrder = np?.order ?? 0;
      await ctx.db.insert("schedulingSnapshots", {
        userId: user._id,
        projectId: args.projectId,
        phaseOrder,
        runId,
        snapshot: pending.snapshots,
        createdAt,
      });
    }

    await remapConvexTasksForWbsChange(
      ctx,
      args.projectId,
      previousDataJson,
      normalizedProject,
    );

    await ctx.db.patch(args.projectId, {
      data: JSON.stringify(normalizedProject),
      updatedAt: Date.now(),
      needsReschedule: false,
    });

    return { runId, phasesProcessed };
  },
});

export const runProjectSchedulingEngine = action({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
  },
  returns: v.object({
    runId: v.string(),
    phasesProcessed: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ runId: string; phasesProcessed: number }> => {
    return await ctx.runMutation(
      internal.scheduling.runProjectSchedulingEngineInternal,
      args,
    );
  },
});

export const undoLastProjectSchedulingRunInternal = internalMutation({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    await assertProjectAccess(ctx, user._id, args.projectId);

    const latest = await ctx.db
      .query("schedulingSnapshots")
      .withIndex("by_project_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", user._id),
      )
      .order("desc")
      .take(1);

    if (latest.length !== 1) return false;
    const latestDoc = latest[0];
    if (Date.now() - latestDoc.createdAt > 24 * 60 * 60 * 1000) {
      return false;
    }
    const runId = latestDoc.runId;
    if (!runId) return false;

    const docs = await ctx.db
      .query("schedulingSnapshots")
      .withIndex("by_project_user_runId", (q) =>
        q.eq("projectId", args.projectId)
          .eq("userId", user._id)
          .eq("runId", runId),
      )
      .take(50);

    const byPhase = new Map<number, Doc<"schedulingSnapshots">>();
    for (const d of docs) {
      byPhase.set(d.phaseOrder, d);
    }

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const parsed = parseProjectData(project.data);

    for (const phase of parsed.project_wbs) {
      const doc = byPhase.get(phase.order);
      if (!doc) continue;

      const map = new Map<number, { date: string; time: string; endTime?: string }>();
      for (const snap of doc.snapshot) {
        map.set(snap.taskOrder, { date: snap.date, time: snap.time, endTime: snap.endTime });
      }

      phase.tasks = phase.tasks.map((t) => {
        const snap = map.get(t.order);
        if (!snap) return t;
        return {
          ...t,
          date: snap.date,
          time: snap.time,
          ...(snap.endTime ? { endTime: snap.endTime } : {}),
        };
      });
    }

    await ctx.db.patch(args.projectId, {
      data: JSON.stringify(parsed),
      updatedAt: Date.now(),
      needsReschedule: false,
    });

    // Delete snapshot docs for that run.
    for (const d of docs) {
      await ctx.db.delete(d._id);
    }

    return true;
  },
});

export const undoLastProjectSchedulingRun = mutation({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    return await ctx.runMutation(
      internal.scheduling.undoLastProjectSchedulingRunInternal,
      args,
    );
  },
});


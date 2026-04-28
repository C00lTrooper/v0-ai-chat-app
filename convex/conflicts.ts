import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserDoc } from "./lib/requireUser";

function parseTimeToMinutes(time: string): number {
  const t = time.trim().toUpperCase();
  const match = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!match) return 9 * 60;
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

function rangesOverlap(
  a1: number, a2: number,
  b1: number, b2: number,
): boolean {
  return a1 < b2 && b1 < a2;
}

const DEFAULT_DURATION_MINS = 60;
const WORK_START = 8 * 60;
const WORK_END = 18 * 60;

interface TaskSlot {
  projectId: string;
  projectName: string;
  phaseOrder: number;
  taskOrder: number;
  title: string;
  date: string;
  startMins: number;
  endMins: number;
}

interface Conflict {
  type: "time_overlap" | "event_overlap" | "daily_limit";
  description: string;
}

interface SuggestedSlot {
  date: string;
  startTime: string;
  endTime: string;
}

async function getAccessibleProjects(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"projects">[]> {
  const owned = await ctx.db
    .query("projects")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", userId))
    .collect();
  const shares = await ctx.db
    .query("projectShares")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const shared: Doc<"projects">[] = [];
  const ownedIds = new Set(owned.map((p) => p._id));
  for (const share of shares) {
    if (ownedIds.has(share.projectId)) continue;
    const project = await ctx.db.get(share.projectId);
    if (project) shared.push(project);
  }
  return [...owned, ...shared];
}

function gatherTaskSlots(
  projects: Doc<"projects">[],
): TaskSlot[] {
  const slots: TaskSlot[] = [];
  for (const p of projects) {
    try {
      const data = JSON.parse(p.data);
      for (const phase of data.project_wbs || []) {
        for (const task of phase.tasks || []) {
          if (task.completed) continue;
          const startMins = parseTimeToMinutes(task.time || "9:00 AM");
          const endMins = task.endTime
            ? parseTimeToMinutes(task.endTime)
            : startMins + DEFAULT_DURATION_MINS;
          slots.push({
            projectId: p._id as string,
            projectName: p.projectName,
            phaseOrder: phase.order,
            taskOrder: task.order,
            title: task.name,
            date: task.date,
            startMins,
            endMins: Math.max(endMins, startMins + 1),
          });
        }
      }
    } catch {
      // skip invalid
    }
  }
  return slots;
}

function findFreeSlots(
  occupiedRanges: Array<{ start: number; end: number }>,
  durationMins: number,
  date: string,
): SuggestedSlot[] {
  const sorted = [...occupiedRanges].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }

  const free: SuggestedSlot[] = [];
  let cursor = WORK_START;
  for (const block of merged) {
    if (block.start - cursor >= durationMins) {
      free.push({
        date,
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(cursor + durationMins),
      });
    }
    cursor = Math.max(cursor, block.end);
  }
  if (WORK_END - cursor >= durationMins) {
    free.push({
      date,
      startTime: minutesToTime(cursor),
      endTime: minutesToTime(cursor + durationMins),
    });
  }
  return free.slice(0, 3);
}

export const checkTimeConflicts = query({
  args: {
    date: v.string(),
    startTime: v.string(),
    endTime: v.optional(v.string()),
    excludeTaskKey: v.optional(v.string()),
    excludeEventId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);
    const projects = await getAccessibleProjects(ctx, user._id);
    const allSlots = gatherTaskSlots(projects);

    const proposedStart = parseTimeToMinutes(args.startTime);
    const proposedEnd = args.endTime
      ? parseTimeToMinutes(args.endTime)
      : proposedStart + DEFAULT_DURATION_MINS;

    const conflicts: Conflict[] = [];

    const slotsOnDate = allSlots.filter((s) => s.date === args.date);

    for (const slot of slotsOnDate) {
      if (args.excludeTaskKey) {
        const [pid, po, to] = args.excludeTaskKey.split(":");
        if (
          slot.projectId === pid &&
          slot.phaseOrder === Number(po) &&
          slot.taskOrder === Number(to)
        ) {
          continue;
        }
      }

      if (rangesOverlap(proposedStart, proposedEnd, slot.startMins, slot.endMins)) {
        conflicts.push({
          type: "time_overlap",
          description: `Overlaps with "${slot.title}" (${minutesToTime(slot.startMins)} – ${minutesToTime(slot.endMins)}) in ${slot.projectName}`,
        });
      }
    }

    const calendarEvents = await ctx.db
      .query("calendarEvents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(200);

    for (const evt of calendarEvents) {
      if (args.excludeEventId && (evt._id as string) === args.excludeEventId) {
        continue;
      }
      if (args.date >= evt.startDate && args.date <= evt.endDate) {
        conflicts.push({
          type: "event_overlap",
          description: `Overlaps with calendar event "${evt.title}" (${evt.startDate} to ${evt.endDate})`,
        });
      }
    }

    const dailyLimit = user.dailyTaskLimit;
    if (dailyLimit && dailyLimit > 0) {
      let count = slotsOnDate.length;
      if (args.excludeTaskKey) {
        const [pid, po, to] = args.excludeTaskKey.split(":");
        const excluded = slotsOnDate.find(
          (s) =>
            s.projectId === pid &&
            s.phaseOrder === Number(po) &&
            s.taskOrder === Number(to),
        );
        if (excluded) count--;
      }
      if (count >= dailyLimit) {
        conflicts.push({
          type: "daily_limit",
          description: `${args.date} already has ${count} task${count === 1 ? "" : "s"} (limit: ${dailyLimit})`,
        });
      }
    }

    const occupiedOnDate = slotsOnDate
      .filter((s) => {
        if (!args.excludeTaskKey) return true;
        const [pid, po, to] = args.excludeTaskKey.split(":");
        return !(
          s.projectId === pid &&
          s.phaseOrder === Number(po) &&
          s.taskOrder === Number(to)
        );
      })
      .map((s) => ({ start: s.startMins, end: s.endMins }));

    const durationMins = proposedEnd - proposedStart;
    const suggestedSlots = findFreeSlots(
      occupiedOnDate,
      Math.max(durationMins, 30),
      args.date,
    );

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      suggestedSlots,
      dailyTaskCount: slotsOnDate.length,
      dailyTaskLimit: dailyLimit ?? null,
    };
  },
});

export const setDailyTaskLimit = mutation({
  args: {
    limit: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);
    await ctx.db.patch(user._id, {
      dailyTaskLimit: args.limit ?? undefined,
    });
    return { ok: true as const };
  },
});

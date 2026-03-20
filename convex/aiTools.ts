import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { Project } from "../lib/project-schema";
import { UNASSIGNED_CONVEX_PHASE_ORDER } from "../lib/wbs-order-from-dates";
import {
  normalizeProjectWbsOrders,
  remapConvexTasksForWbsChange,
} from "./wbsPersistence";

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
  if (!user) throw new Error("User not found");
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

interface WbsTask {
  order: number;
  name: string;
  description?: string;
  date: string;
  time: string;
  endTime?: string;
  completed?: boolean;
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
  unassigned_tasks?: WbsTask[];
}

function parseProjectData(data: string): ProjectJson {
  return JSON.parse(data) as ProjectJson;
}

function ensureUnassignedTasks(parsed: ProjectJson): WbsTask[] {
  if (!parsed.unassigned_tasks) parsed.unassigned_tasks = [];
  return parsed.unassigned_tasks;
}

function findWbsTaskRef(
  parsed: ProjectJson,
  phaseOrder: number,
  taskOrder: number,
): WbsTask | null {
  if (phaseOrder === UNASSIGNED_CONVEX_PHASE_ORDER) {
    return (
      ensureUnassignedTasks(parsed).find((t) => t.order === taskOrder) ?? null
    );
  }
  const phase = parsed.project_wbs.find((p) => p.order === phaseOrder);
  if (!phase) return null;
  return phase.tasks.find((t) => t.order === taskOrder) ?? null;
}

function extractWbsTask(
  parsed: ProjectJson,
  phaseOrder: number,
  taskOrder: number,
): WbsTask | null {
  if (phaseOrder === UNASSIGNED_CONVEX_PHASE_ORDER) {
    const list = ensureUnassignedTasks(parsed);
    const i = list.findIndex((t) => t.order === taskOrder);
    if (i < 0) return null;
    const [t] = list.splice(i, 1);
    return t;
  }
  const phase = parsed.project_wbs.find((p) => p.order === phaseOrder);
  if (!phase) return null;
  const i = phase.tasks.findIndex((t) => t.order === taskOrder);
  if (i < 0) return null;
  const [t] = phase.tasks.splice(i, 1);
  return t;
}

function appendTaskToPhase(
  parsed: ProjectJson,
  phaseOrder: number,
  task: WbsTask,
): void {
  const phase = parsed.project_wbs.find((p) => p.order === phaseOrder);
  if (!phase) throw new Error("Phase not found");
  phase.tasks.push({ ...task, order: 0 });
}

async function saveProjectWithNormalizedWbs(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  previousDataJson: string,
  parsed: ProjectJson,
): Promise<Project> {
  const normalized = normalizeProjectWbsOrders(parsed as Project);
  await remapConvexTasksForWbsChange(
    ctx,
    projectId,
    previousDataJson,
    normalized,
  );
  await ctx.db.patch(projectId, {
    data: JSON.stringify(normalized),
    updatedAt: Date.now(),
  });
  return normalized;
}

export const createTask = mutation({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
    phaseOrder: v.optional(v.number()),
    title: v.string(),
    dueDate: v.string(),
    time: v.optional(v.string()),
    endTime: v.optional(v.string()),
    parentTaskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const project = await assertProjectAccess(ctx, user._id, args.projectId);

    const previousDataJson = project.data;
    const parsed = parseProjectData(project.data);

    const newTask: WbsTask = {
      order: 0,
      name: args.title,
      date: args.dueDate,
      time: args.time || "9:00 AM",
      ...(args.endTime ? { endTime: args.endTime } : {}),
      completed: false,
    };

    let phaseNameForPlacement: string | null = null;
    if (args.phaseOrder === undefined) {
      ensureUnassignedTasks(parsed).push(newTask);
    } else {
      const phase = parsed.project_wbs.find((p) => p.order === args.phaseOrder);
      if (!phase) throw new Error("Phase not found");
      phaseNameForPlacement = phase.name;
      phase.tasks.push(newTask);
    }

    const normalized = await saveProjectWithNormalizedWbs(
      ctx,
      args.projectId,
      previousDataJson,
      parsed,
    );

    let placedPhaseOrder: number;
    let placed: WbsTask | undefined;

    if (args.phaseOrder === undefined) {
      placed = normalized.unassigned_tasks?.find(
        (t) =>
          t.name === args.title.trim() && t.date === args.dueDate.trim(),
      );
      if (!placed) {
        throw new Error("Failed to place new unassigned task after normalization");
      }
      placedPhaseOrder = UNASSIGNED_CONVEX_PHASE_ORDER;
    } else {
      const newPhase = normalized.project_wbs.find(
        (p) => p.name === phaseNameForPlacement,
      );
      placed = newPhase?.tasks.find(
        (t) =>
          t.name === args.title.trim() && t.date === args.dueDate.trim(),
      );
      if (!newPhase || !placed) {
        throw new Error("Failed to place new task after normalization");
      }
      placedPhaseOrder = newPhase.order;
    }

    const taskId = await ctx.db.insert("tasks", {
      projectId: args.projectId,
      phaseOrder: placedPhaseOrder,
      taskOrder: placed.order,
      title: args.title,
      createdAt: Date.now(),
      parentTaskId: args.parentTaskId,
    });

    return {
      taskId,
      phaseOrder: placedPhaseOrder,
      taskOrder: placed.order,
      title: args.title,
    };
  },
});

export const updateTaskStatus = mutation({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
    phaseOrder: v.number(),
    taskOrder: v.number(),
    completed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const project = await assertProjectAccess(ctx, user._id, args.projectId);

    const previousDataJson = project.data;
    const parsed = parseProjectData(project.data);
    const task = findWbsTaskRef(parsed, args.phaseOrder, args.taskOrder);
    if (!task) throw new Error("Task not found");

    task.completed = args.completed;

    await saveProjectWithNormalizedWbs(
      ctx,
      args.projectId,
      previousDataJson,
      parsed,
    );

    return { title: task.name, completed: args.completed };
  },
});

export const relocateProjectWbsTask = mutation({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
    fromPhaseOrder: v.number(),
    taskOrder: v.number(),
    newDate: v.string(),
    newStartTime: v.optional(v.string()),
    newEndTime: v.optional(v.string()),
    target: v.union(
      v.object({
        kind: v.literal("phase"),
        phaseOrder: v.number(),
      }),
      v.object({ kind: v.literal("unassigned") }),
    ),
  },
  returns: v.object({
    title: v.string(),
    phaseOrder: v.number(),
    taskOrder: v.number(),
    newDate: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const project = await assertProjectAccess(ctx, user._id, args.projectId);

    const previousDataJson = project.data;
    const parsed = parseProjectData(project.data);

    const moved = extractWbsTask(
      parsed,
      args.fromPhaseOrder,
      args.taskOrder,
    );
    if (!moved) throw new Error("Task not found");

    moved.date = args.newDate;
    if (args.newStartTime !== undefined && args.newStartTime.trim() !== "") {
      moved.time = args.newStartTime;
    }
    if (args.newEndTime !== undefined) {
      if (args.newEndTime.trim() === "") {
        delete moved.endTime;
      } else {
        moved.endTime = args.newEndTime.trim();
      }
    }

    if (args.target.kind === "unassigned") {
      ensureUnassignedTasks(parsed).push(moved);
    } else {
      if (args.target.phaseOrder === UNASSIGNED_CONVEX_PHASE_ORDER) {
        throw new Error("Invalid target phase");
      }
      appendTaskToPhase(parsed, args.target.phaseOrder, moved);
    }

    const normalized = await saveProjectWithNormalizedWbs(
      ctx,
      args.projectId,
      previousDataJson,
      parsed,
    );

    const title = moved.name;
    const nm = moved.name.trim();
    const dt = moved.date.trim();
    const tm = moved.time.trim();

    for (const ph of normalized.project_wbs) {
      const t = ph.tasks?.find(
        (x) =>
          x.name.trim() === nm &&
          x.date.trim() === dt &&
          x.time.trim() === tm,
      );
      if (t) {
        return {
          title,
          phaseOrder: ph.order,
          taskOrder: t.order,
          newDate: args.newDate,
        };
      }
    }
    const u = (normalized.unassigned_tasks ?? []).find(
      (x) =>
        x.name.trim() === nm &&
        x.date.trim() === dt &&
        x.time.trim() === tm,
    );
    if (u) {
      return {
        title,
        phaseOrder: UNASSIGNED_CONVEX_PHASE_ORDER,
        taskOrder: u.order,
        newDate: args.newDate,
      };
    }

    throw new Error("Failed to resolve task after relocation");
  },
});

export const updateTaskDueDate = mutation({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
    phaseOrder: v.number(),
    taskOrder: v.number(),
    newDate: v.string(),
    newStartTime: v.optional(v.string()),
    newEndTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const project = await assertProjectAccess(ctx, user._id, args.projectId);

    const previousDataJson = project.data;
    const parsed = parseProjectData(project.data);
    const task = findWbsTaskRef(parsed, args.phaseOrder, args.taskOrder);
    if (!task) throw new Error("Task not found");

    task.date = args.newDate;
    if (args.newStartTime) task.time = args.newStartTime;
    if (args.newEndTime !== undefined) {
      task.endTime = args.newEndTime || undefined;
    }

    await saveProjectWithNormalizedWbs(
      ctx,
      args.projectId,
      previousDataJson,
      parsed,
    );

    return {
      title: task.name,
      newDate: args.newDate,
      newStartTime: args.newStartTime ?? null,
      newEndTime: args.newEndTime ?? null,
    };
  },
});

export const updateTaskTime = mutation({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
    phaseOrder: v.number(),
    taskOrder: v.number(),
    newStartTime: v.string(),
    newEndTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const project = await assertProjectAccess(ctx, user._id, args.projectId);

    const previousDataJson = project.data;
    const parsed = parseProjectData(project.data);
    const task = findWbsTaskRef(parsed, args.phaseOrder, args.taskOrder);
    if (!task) throw new Error("Task not found");

    task.time = args.newStartTime;
    if (args.newEndTime !== undefined) {
      if (args.newEndTime.trim() === "") {
        delete task.endTime;
      } else {
        task.endTime = args.newEndTime.trim();
      }
    }

    await saveProjectWithNormalizedWbs(
      ctx,
      args.projectId,
      previousDataJson,
      parsed,
    );

    return {
      title: task.name,
      newStartTime: args.newStartTime,
      newEndTime: args.newEndTime ?? null,
    };
  },
});

export const deleteProjectWbsTask = mutation({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
    phaseOrder: v.number(),
    taskOrder: v.number(),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const project = await assertProjectAccess(ctx, user._id, args.projectId);
    if (project.ownerId !== user._id) {
      throw new Error("Only the project owner can delete tasks");
    }

    const taskDoc = await ctx.db
      .query("tasks")
      .withIndex("by_project_phase_task", (q) =>
        q
          .eq("projectId", args.projectId)
          .eq("phaseOrder", args.phaseOrder)
          .eq("taskOrder", args.taskOrder),
      )
      .unique();

    if (taskDoc) {
      const subs = await ctx.db
        .query("subtasks")
        .withIndex("by_taskId", (q) => q.eq("taskId", taskDoc._id))
        .collect();
      for (const s of subs) {
        await ctx.db.delete(s._id);
      }
      await ctx.db.delete(taskDoc._id);
    }

    const previousDataJson = project.data;
    const parsed = parseProjectData(project.data);

    if (args.phaseOrder === UNASSIGNED_CONVEX_PHASE_ORDER) {
      const list = ensureUnassignedTasks(parsed);
      const next = list.filter((t) => t.order !== args.taskOrder);
      if (next.length === list.length) throw new Error("Task not found");
      parsed.unassigned_tasks = next;
    } else {
      const phase = parsed.project_wbs.find((p) => p.order === args.phaseOrder);
      if (!phase) throw new Error("Phase not found");
      const nextTasks = phase.tasks.filter((t) => t.order !== args.taskOrder);
      if (nextTasks.length === phase.tasks.length) {
        throw new Error("Task not found");
      }
      phase.tasks = nextTasks;
    }

    await saveProjectWithNormalizedWbs(
      ctx,
      args.projectId,
      previousDataJson,
      parsed,
    );

    return { ok: true as const };
  },
});

export const createCalendarEvent = mutation({
  args: {
    token: v.string(),
    title: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);

    if (args.projectId) {
      await assertProjectAccess(ctx, user._id, args.projectId);
    }

    const eventId = await ctx.db.insert("calendarEvents", {
      userId: user._id,
      projectId: args.projectId,
      title: args.title,
      startDate: args.startDate,
      endDate: args.endDate,
      createdAt: Date.now(),
    });

    return { eventId, title: args.title };
  },
});

export const moveCalendarEvent = mutation({
  args: {
    token: v.string(),
    eventId: v.id("calendarEvents"),
    newStartDate: v.string(),
    newEndDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.userId !== user._id) throw new Error("Not authorized");

    await ctx.db.patch(args.eventId, {
      startDate: args.newStartDate,
      endDate: args.newEndDate,
    });

    return { title: event.title, newStartDate: args.newStartDate, newEndDate: args.newEndDate };
  },
});

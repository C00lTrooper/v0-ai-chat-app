import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

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
  date: string;
  time: string;
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
}

function parseProjectData(data: string): ProjectJson {
  return JSON.parse(data) as ProjectJson;
}

export const createTask = mutation({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
    phaseOrder: v.number(),
    title: v.string(),
    dueDate: v.string(),
    time: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const project = await assertProjectAccess(ctx, user._id, args.projectId);

    const parsed = parseProjectData(project.data);
    const phase = parsed.project_wbs.find((p) => p.order === args.phaseOrder);
    if (!phase) throw new Error("Phase not found");

    const maxOrder = phase.tasks.reduce((max, t) => Math.max(max, t.order), -1);
    const newTask: WbsTask = {
      order: maxOrder + 1,
      name: args.title,
      date: args.dueDate,
      time: args.time || "9:00 AM",
      completed: false,
    };
    phase.tasks.push(newTask);

    await ctx.db.patch(args.projectId, {
      data: JSON.stringify(parsed),
      updatedAt: Date.now(),
    });

    const taskId = await ctx.db.insert("tasks", {
      projectId: args.projectId,
      phaseOrder: args.phaseOrder,
      taskOrder: newTask.order,
      title: args.title,
      createdAt: Date.now(),
    });

    return {
      taskId,
      phaseOrder: args.phaseOrder,
      taskOrder: newTask.order,
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

    const parsed = parseProjectData(project.data);
    const phase = parsed.project_wbs.find((p) => p.order === args.phaseOrder);
    if (!phase) throw new Error("Phase not found");

    const task = phase.tasks.find((t) => t.order === args.taskOrder);
    if (!task) throw new Error("Task not found");

    task.completed = args.completed;

    await ctx.db.patch(args.projectId, {
      data: JSON.stringify(parsed),
      updatedAt: Date.now(),
    });

    return { title: task.name, completed: args.completed };
  },
});

export const updateTaskDueDate = mutation({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
    phaseOrder: v.number(),
    taskOrder: v.number(),
    newDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const project = await assertProjectAccess(ctx, user._id, args.projectId);

    const parsed = parseProjectData(project.data);
    const phase = parsed.project_wbs.find((p) => p.order === args.phaseOrder);
    if (!phase) throw new Error("Phase not found");

    const task = phase.tasks.find((t) => t.order === args.taskOrder);
    if (!task) throw new Error("Task not found");

    task.date = args.newDate;

    await ctx.db.patch(args.projectId, {
      data: JSON.stringify(parsed),
      updatedAt: Date.now(),
    });

    return { title: task.name, newDate: args.newDate };
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

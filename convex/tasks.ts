import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

async function authenticateUser(
  ctx: QueryCtx | MutationCtx,
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

async function assertCanAccessProject(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  projectId: Id<"projects">,
): Promise<Doc<"projects">> {
  const project = await ctx.db.get(projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  const isOwner = project.ownerId === userId;
  const isShared = project.sharedWith.includes(userId);
  if (!isOwner && !isShared) {
    throw new Error("Not authorized");
  }

  return project;
}

export const ensureTaskForProjectWbsTask = mutation({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
    phaseOrder: v.number(),
    taskOrder: v.number(),
    title: v.string(),
  },
  returns: v.object({
    taskId: v.id("tasks"),
  }),
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    await assertCanAccessProject(ctx, user._id, args.projectId);

    const existing = await ctx.db
      .query("tasks")
      .withIndex("by_project_phase_task", (q) =>
        q
          .eq("projectId", args.projectId)
          .eq("phaseOrder", args.phaseOrder)
          .eq("taskOrder", args.taskOrder),
      )
      .unique()
      .catch(() => null);

    if (existing) {
      return { taskId: existing._id };
    }

    const now = Date.now();
    const taskId = await ctx.db.insert("tasks", {
      projectId: args.projectId,
      phaseOrder: args.phaseOrder,
      taskOrder: args.taskOrder,
      title: args.title,
      createdAt: now,
    });

    return { taskId };
  },
});

export const listSubtasks = query({
  args: {
    token: v.string(),
    taskId: v.id("tasks"),
  },
  returns: v.array(
    v.object({
      _id: v.id("subtasks"),
      title: v.string(),
      completed: v.boolean(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Task not found");
    }

    await assertCanAccessProject(ctx, user._id, task.projectId);

    const docs = await ctx.db
      .query("subtasks")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect();

    return docs.map((s) => ({
      _id: s._id,
      title: s.title,
      completed: s.completed,
      createdAt: s.createdAt,
    }));
  },
});

export const createSubtasks = mutation({
  args: {
    token: v.string(),
    taskId: v.id("tasks"),
    titles: v.array(v.string()),
  },
  returns: v.array(v.id("subtasks")),
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Task not found");
    }

    await assertCanAccessProject(ctx, user._id, task.projectId);

    const now = Date.now();
    const ids: Id<"subtasks">[] = [];

    for (const rawTitle of args.titles) {
      const title = rawTitle.trim();
      if (!title) continue;

      const id = await ctx.db.insert("subtasks", {
        taskId: args.taskId,
        title,
        completed: false,
        createdAt: now,
      });
      ids.push(id);
    }

    return ids;
  },
});

export const toggleSubtaskCompleted = mutation({
  args: {
    token: v.string(),
    subtaskId: v.id("subtasks"),
    completed: v.boolean(),
  },
  returns: v.id("subtasks"),
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const subtask = await ctx.db.get(args.subtaskId);
    if (!subtask) {
      throw new Error("Subtask not found");
    }

    const task = await ctx.db.get(subtask.taskId);
    if (!task) {
      throw new Error("Parent task not found");
    }

    await assertCanAccessProject(ctx, user._id, task.projectId);

    await ctx.db.patch(args.subtaskId, {
      completed: args.completed,
    });

    return args.subtaskId;
  },
});

export const deleteSubtask = mutation({
  args: {
    token: v.string(),
    subtaskId: v.id("subtasks"),
  },
  returns: v.id("subtasks"),
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const subtask = await ctx.db.get(args.subtaskId);
    if (!subtask) {
      throw new Error("Subtask not found");
    }

    const task = await ctx.db.get(subtask.taskId);
    if (!task) {
      throw new Error("Parent task not found");
    }

    await assertCanAccessProject(ctx, user._id, task.projectId);

    await ctx.db.delete(args.subtaskId);
    return args.subtaskId;
  },
});

export const listSubtasksForProject = query({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
  },
  returns: v.array(
    v.object({
      phaseOrder: v.number(),
      taskOrder: v.number(),
      taskId: v.id("tasks"),
      subtasks: v.array(
        v.object({
          _id: v.id("subtasks"),
          title: v.string(),
          completed: v.boolean(),
          createdAt: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    await assertCanAccessProject(ctx, user._id, args.projectId);

    const tasksForProject = await ctx.db
      .query("tasks")
      .withIndex("by_project_phase_task", (q) =>
        q.eq("projectId", args.projectId),
      )
      .collect();

    const results: Array<{
      phaseOrder: number;
      taskOrder: number;
      taskId: Id<"tasks">;
      subtasks: Array<{
        _id: Id<"subtasks">;
        title: string;
        completed: boolean;
        createdAt: number;
      }>;
    }> = [];

    for (const task of tasksForProject) {
      const subs = await ctx.db
        .query("subtasks")
        .withIndex("by_taskId", (q) => q.eq("taskId", task._id))
        .order("asc")
        .collect();

      results.push({
        phaseOrder: task.phaseOrder,
        taskOrder: task.taskOrder,
        taskId: task._id,
        subtasks: subs.map((s) => ({
          _id: s._id,
          title: s.title,
          completed: s.completed,
          createdAt: s.createdAt,
        })),
      });
    }

    return results;
  },
});


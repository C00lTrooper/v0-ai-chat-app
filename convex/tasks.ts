import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserDoc } from "./lib/requireUser";

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
    projectId: v.id("projects"),
    phaseOrder: v.number(),
    taskOrder: v.number(),
    title: v.string(),
  },
  returns: v.object({
    taskId: v.id("tasks"),
  }),
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);
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
    const user = await requireUserDoc(ctx);
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
    taskId: v.id("tasks"),
    titles: v.array(v.string()),
  },
  returns: v.array(v.id("subtasks")),
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);
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
    subtaskId: v.id("subtasks"),
    completed: v.boolean(),
  },
  returns: v.id("subtasks"),
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);
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
    subtaskId: v.id("subtasks"),
  },
  returns: v.id("subtasks"),
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);
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
    const user = await requireUserDoc(ctx);
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


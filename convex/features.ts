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

export const listByProject = query({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    await assertCanAccessProject(ctx, user._id, args.projectId);

    const features = await ctx.db
      .query("features")
      .withIndex("by_project_order", (q) =>
        q.eq("projectId", args.projectId),
      )
      .collect();

    return features.map((f) => ({
      _id: f._id,
      projectId: f.projectId,
      phaseOrder: f.phaseOrder,
      name: f.name,
      description: f.description,
      createdAt: f.createdAt,
      order: f.order,
    }));
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
    phaseOrder: v.number(),
    name: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    await assertCanAccessProject(ctx, user._id, args.projectId);

    const existing = await ctx.db
      .query("features")
      .withIndex("by_project_phase", (q) =>
        q.eq("projectId", args.projectId).eq("phaseOrder", args.phaseOrder),
      )
      .collect();

    const now = Date.now();
    const maxOrder =
      existing.reduce((max, f) => (f.order > max ? f.order : max), -1) + 1;

    const featureId = await ctx.db.insert("features", {
      projectId: args.projectId,
      phaseOrder: args.phaseOrder,
      name: args.name.trim(),
      description: args.description.trim(),
      createdAt: now,
      order: maxOrder,
    });

    return { featureId };
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    featureId: v.id("features"),
    name: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const feature = await ctx.db.get(args.featureId);
    if (!feature) {
      throw new Error("Feature not found");
    }

    await assertCanAccessProject(ctx, user._id, feature.projectId);

    await ctx.db.patch(args.featureId, {
      name: args.name.trim(),
      description: args.description.trim(),
    });

    return { ok: true as const };
  },
});

export const movePhase = mutation({
  args: {
    token: v.string(),
    featureId: v.id("features"),
    phaseOrder: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const feature = await ctx.db.get(args.featureId);
    if (!feature) {
      throw new Error("Feature not found");
    }

    await assertCanAccessProject(ctx, user._id, feature.projectId);

    if (feature.phaseOrder === args.phaseOrder) {
      return { ok: true as const };
    }

    const existingInTarget = await ctx.db
      .query("features")
      .withIndex("by_project_phase", (q) =>
        q.eq("projectId", feature.projectId).eq("phaseOrder", args.phaseOrder),
      )
      .collect();
    const nextOrder =
      existingInTarget.reduce((max, f) => (f.order > max ? f.order : max), -1) +
      1;

    await ctx.db.patch(args.featureId, {
      phaseOrder: args.phaseOrder,
      order: nextOrder,
    });

    return { ok: true as const };
  },
});

export const save = mutation({
  args: {
    token: v.string(),
    featureId: v.id("features"),
    name: v.string(),
    description: v.string(),
    phaseOrder: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const feature = await ctx.db.get(args.featureId);
    if (!feature) {
      throw new Error("Feature not found");
    }

    await assertCanAccessProject(ctx, user._id, feature.projectId);

    let nextOrder: number | undefined;
    if (feature.phaseOrder !== args.phaseOrder) {
      const existingInTarget = await ctx.db
        .query("features")
        .withIndex("by_project_phase", (q) =>
          q.eq("projectId", feature.projectId).eq("phaseOrder", args.phaseOrder),
        )
        .collect();
      nextOrder =
        existingInTarget.reduce((max, f) => (f.order > max ? f.order : max), -1) +
        1;
    }

    await ctx.db.patch(args.featureId, {
      name: args.name.trim(),
      description: args.description.trim(),
      phaseOrder: args.phaseOrder,
      ...(nextOrder !== undefined ? { order: nextOrder } : {}),
    });

    return { ok: true as const };
  },
});

export const reorder = mutation({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
    orderedIds: v.array(v.id("features")),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    await assertCanAccessProject(ctx, user._id, args.projectId);

    let order = 0;
    for (const id of args.orderedIds) {
      const feature = await ctx.db.get(id);
      if (!feature || feature.projectId !== args.projectId) continue;
      await ctx.db.patch(id, { order });
      order += 1;
    }

    return { ok: true as const };
  },
});

export const deleteFeature = mutation({
  args: {
    token: v.string(),
    featureId: v.id("features"),
    mode: v.union(v.literal("delete_tasks"), v.literal("unassign_tasks")),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const feature = await ctx.db.get(args.featureId);
    if (!feature) {
      throw new Error("Feature not found");
    }

    await assertCanAccessProject(ctx, user._id, feature.projectId);

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project_phase_task", (q) =>
        q.eq("projectId", feature.projectId),
      )
      .collect();

    for (const task of tasks) {
      if (task.featureId !== args.featureId) continue;
      if (args.mode === "delete_tasks") {
        await ctx.db.delete(task._id);
      } else {
        await ctx.db.patch(task._id, { featureId: undefined });
      }
    }

    await ctx.db.delete(args.featureId);

    return { ok: true as const };
  },
});

export const linkTaskToFeature = mutation({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
    phaseOrder: v.number(),
    taskOrder: v.number(),
    featureId: v.id("features"),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    await assertCanAccessProject(ctx, user._id, args.projectId);

    const feature = await ctx.db.get(args.featureId);
    if (!feature || feature.projectId !== args.projectId) {
      throw new Error("Feature not found in project");
    }

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

    if (!existing) {
      const now = Date.now();
      const taskId = await ctx.db.insert("tasks", {
        projectId: args.projectId,
        phaseOrder: args.phaseOrder,
        taskOrder: args.taskOrder,
        title: feature.name,
        createdAt: now,
        parentTaskId: undefined,
        featureId: args.featureId,
      });
      return { taskId, featureId: args.featureId };
    }

    await ctx.db.patch(existing._id, { featureId: args.featureId });
    return { taskId: existing._id, featureId: args.featureId };
  },
});

export const unlinkTaskFromFeature = mutation({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
    phaseOrder: v.number(),
    taskOrder: v.number(),
  },
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

    if (!existing) {
      return { ok: true as const };
    }

    await ctx.db.patch(existing._id, { featureId: undefined });
    return { ok: true as const };
  },
});

export const listTasksForProject = query({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const project = await assertCanAccessProject(ctx, user._id, args.projectId);

    let phases: Array<{
      order: number;
      name: string;
      tasks: Array<{
        order: number;
        name: string;
        date: string;
        completed: boolean;
        time?: string;
        endTime?: string;
      }>;
    }> = [];

    try {
      const parsed = JSON.parse(project.data) as {
        project_wbs?: Array<{
          order: number;
          name: string;
          tasks?: Array<{
            order: number;
            name: string;
            date: string;
            completed?: boolean;
            time?: string;
            endTime?: string;
          }>;
        }>;
      };
      phases =
        parsed.project_wbs?.map((p) => ({
          order: p.order,
          name: p.name,
          tasks:
            p.tasks?.map((t) => ({
              order: t.order,
              name: t.name,
              date: t.date,
              completed: Boolean((t as { completed?: boolean }).completed),
              time: (t as { time?: string }).time,
              endTime: (t as { endTime?: string }).endTime,
            })) ?? [],
        })) ?? [];
    } catch {
      // ignore invalid project data, fall back to tasks table only
    }

    const taskDocs = await ctx.db
      .query("tasks")
      .withIndex("by_project_phase_task", (q) =>
        q.eq("projectId", args.projectId),
      )
      .collect();
    const byKey = new Map<string, (typeof taskDocs)[number]>();
    for (const t of taskDocs) {
      byKey.set(`${t.phaseOrder}:${t.taskOrder}`, t);
    }

    const results: Array<{
      _id: Id<"tasks"> | null;
      projectId: Id<"projects">;
      phaseOrder: number;
      taskOrder: number;
      title: string;
      featureId: Id<"features"> | null;
      phaseName: string;
      date: string;
      completed: boolean;
      time: string | null;
      endTime: string | null;
    }> = [];

    for (const phase of phases) {
      for (const t of phase.tasks) {
        const key = `${phase.order}:${t.order}`;
        const doc = byKey.get(key);
        results.push({
          _id: doc?._id ?? null,
          projectId: args.projectId,
          phaseOrder: phase.order,
          taskOrder: t.order,
          title: doc?.title ?? t.name,
          featureId: doc?.featureId ?? null,
          phaseName: phase.name,
          date: t.date,
          completed:
            doc?.featureId != null
              ? Boolean(
                  (t as {
                    completed?: boolean;
                  }).completed,
                )
              : Boolean(t.completed),
          time: t.time ?? null,
          endTime: t.endTime ?? null,
        });
        if (doc) {
          byKey.delete(key);
        }
      }
    }

    for (const doc of byKey.values()) {
      const phase = phases.find((p) => p.order === doc.phaseOrder);
      results.push({
        _id: doc._id,
        projectId: doc.projectId,
        phaseOrder: doc.phaseOrder,
        taskOrder: doc.taskOrder,
        title: doc.title,
        featureId: doc.featureId ?? null,
        phaseName: phase?.name ?? `Phase ${doc.phaseOrder + 1}`,
        date: "",
        completed: false,
        time: null,
        endTime: null,
      });
    }

    return results;
  },
});


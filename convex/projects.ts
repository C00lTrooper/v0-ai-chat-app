import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { Project } from "../lib/project-schema";
import { phaseScheduleFingerprint } from "../lib/wbs-order-from-dates";
import {
  normalizeProjectWbsOrders,
  remapConvexTasksForWbsChange,
} from "./wbsPersistence";
import { requireUserDoc } from "./lib/requireUser";

/** Full JSON envelope for new projects (empty WBS until user adds phases or runs generator). */
function buildInitialProjectData(args: {
  projectName: string;
  summaryName: string;
  objective: string;
  targetDate: string;
}): string {
  const name = args.projectName.trim() || "Project";
  const summary = args.summaryName.trim() || name;
  const objective =
    args.objective.trim() || "Objective not specified. Update in Overview.";
  const targetDate =
    args.targetDate.trim() || new Date().toISOString().slice(0, 10);

  return JSON.stringify({
    project_name: name,
    project_summary: {
      name: summary,
      objective,
      duration: 0,
      estimated_budget: 0,
      target_date: targetDate,
    },
    project_wbs: [],
    project_milestones: [],
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUserDoc(ctx);

    const owned = await ctx.db
      .query("projects")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
      .collect();

    const shares = await ctx.db
      .query("projectShares")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const shared: Array<Doc<"projects">> = [];
    const ownedIds = new Set(owned.map((p) => p._id));

    for (const share of shares) {
      if (ownedIds.has(share.projectId)) continue;
      const project = await ctx.db.get(share.projectId);
      if (project) shared.push(project);
    }

    const all = [...owned, ...shared];

    return all.map((p) => ({
      _id: p._id,
      slug: p.slug,
      projectName: p.projectName,
      summaryName: p.summaryName,
      objective: p.objective,
      targetDate: p.targetDate,
      isOwner: p.ownerId === user._id,
    }));
  },
});

export const listWithTasks = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUserDoc(ctx);

    const owned = await ctx.db
      .query("projects")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
      .collect();

    const shares = await ctx.db
      .query("projectShares")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const shared: Array<Doc<"projects">> = [];
    const ownedIds = new Set(owned.map((p) => p._id));

    for (const share of shares) {
      if (ownedIds.has(share.projectId)) continue;
      const project = await ctx.db.get(share.projectId);
      if (project) shared.push(project);
    }

    const all = [...owned, ...shared];

    return all.map((p) => ({
      _id: p._id,
      slug: p.slug,
      projectName: p.projectName,
      summaryName: p.summaryName,
      data: p.data,
      isOwner: p.ownerId === user._id,
    }));
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);

    const project = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!project) return null;

    const isOwner = project.ownerId === user._id;
    const isShared = project.sharedWith.includes(user._id);
    if (!isOwner && !isShared) return null;

    return {
      _id: project._id,
      slug: project.slug,
      projectName: project.projectName,
      summaryName: project.summaryName,
      objective: project.objective,
      targetDate: project.targetDate,
      data: project.data,
      isOwner,
    };
  },
});

export const getById = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project) return null;

    const isOwner = project.ownerId === user._id;
    const isShared = project.sharedWith.includes(user._id);
    if (!isOwner && !isShared) return null;

    return {
      _id: project._id,
      slug: project.slug,
      projectName: project.projectName,
      summaryName: project.summaryName,
      objective: project.objective,
      targetDate: project.targetDate,
      data: project.data,
      isOwner,
    };
  },
});

export const getNeedsReschedule = query({
  args: { projectId: v.id("projects") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) return false;

    const isOwner = project.ownerId === user._id;
    const isShared = project.sharedWith.includes(user._id);
    if (!isOwner && !isShared) return false;

    return project.needsReschedule ?? false;
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const create = mutation({
  args: {
    slug: v.string(),
    projectName: v.string(),
    summaryName: v.string(),
    objective: v.string(),
    targetDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);
    const now = Date.now();

    let slug = args.slug;
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (existing) {
      slug = `${slug}-${now}`;
    }

    const data = buildInitialProjectData({
      projectName: args.projectName,
      summaryName: args.summaryName,
      objective: args.objective,
      targetDate: args.targetDate,
    });

    const projectId = await ctx.db.insert("projects", {
      ownerId: user._id,
      slug,
      sharedWith: [],
      projectName: args.projectName,
      summaryName: args.summaryName,
      objective: args.objective,
      targetDate: args.targetDate,
      data,
      needsReschedule: false,
      createdAt: now,
      updatedAt: now,
    });

    return { projectId, slug };
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    projectName: v.optional(v.string()),
    summaryName: v.optional(v.string()),
    objective: v.optional(v.string()),
    targetDate: v.optional(v.string()),
    data: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.ownerId !== user._id) {
      throw new Error("Not found or not authorized");
    }

    let dataToWrite: string | undefined = args.data;
    let rescheduleOldFp: string | undefined;
    let rescheduleNewFp: string | undefined;

    if (args.data !== undefined) {
      let parsedIncoming: Project | null = null;
      try {
        parsedIncoming = JSON.parse(args.data) as Project;
      } catch {
        parsedIncoming = null;
      }

      let oldParsed: Project | null = null;
      try {
        oldParsed = JSON.parse(project.data) as Project;
      } catch {
        oldParsed = null;
      }

      if (
        parsedIncoming &&
        Array.isArray(parsedIncoming.project_wbs) &&
        parsedIncoming.project_wbs.length > 0
      ) {
        const normalized = normalizeProjectWbsOrders(parsedIncoming);
        dataToWrite = JSON.stringify(normalized);

        await remapConvexTasksForWbsChange(
          ctx,
          args.projectId,
          project.data,
          normalized,
        );

        const oldPhases = oldParsed?.project_wbs ?? [];
        rescheduleOldFp = phaseScheduleFingerprint(oldPhases);
        rescheduleNewFp = phaseScheduleFingerprint(normalized.project_wbs);
      }
    }

    await ctx.db.patch(args.projectId, {
      ...(args.projectName !== undefined && {
        projectName: args.projectName,
      }),
      ...(args.summaryName !== undefined && {
        summaryName: args.summaryName,
      }),
      ...(args.objective !== undefined && { objective: args.objective }),
      ...(args.targetDate !== undefined && { targetDate: args.targetDate }),
      ...(dataToWrite !== undefined && { data: dataToWrite }),
      updatedAt: Date.now(),
    });

    if (
      rescheduleOldFp !== undefined &&
      rescheduleNewFp !== undefined &&
      rescheduleOldFp !== rescheduleNewFp
    ) {
      await ctx.db.patch(args.projectId, {
        needsReschedule: true,
        updatedAt: Date.now(),
      });
    }

    return { ok: true as const };
  },
});

export const remove = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.ownerId !== user._id) {
      throw new Error("Not found or not authorized");
    }

    // Delete all chats and their messages for this project
    const chats = await ctx.db
      .query("chats")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const chat of chats) {
      const messages = await ctx.db
        .query("chatMessages")
        .withIndex("by_chatId", (q) => q.eq("chatId", chat._id))
        .collect();

      for (const msg of messages) {
        await ctx.db.delete(msg._id);
      }

      await ctx.db.delete(chat._id);
    }

    // Delete all share records for this project
    const shares = await ctx.db
      .query("projectShares")
      .withIndex("by_projectId_and_userId", (q) =>
        q.eq("projectId", args.projectId),
      )
      .collect();

    for (const share of shares) {
      await ctx.db.delete(share._id);
    }

    await ctx.db.delete(args.projectId);
    return { ok: true as const };
  },
});

export const share = mutation({
  args: {
    projectId: v.id("projects"),
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.ownerId !== user._id) {
      throw new Error("Not found or not authorized");
    }

    const targetUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) =>
        q.eq("email", args.userEmail.trim().toLowerCase()),
      )
      .unique();

    if (!targetUser) {
      throw new Error("User not found");
    }

    if (project.sharedWith.includes(targetUser._id)) {
      return { ok: true as const };
    }

    await ctx.db.patch(args.projectId, {
      sharedWith: [...project.sharedWith, targetUser._id],
    });

    await ctx.db.insert("projectShares", {
      projectId: args.projectId,
      userId: targetUser._id,
    });

    return { ok: true as const };
  },
});

export const unshare = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.ownerId !== user._id) {
      throw new Error("Not found or not authorized");
    }

    await ctx.db.patch(args.projectId, {
      sharedWith: project.sharedWith.filter((id) => id !== args.userId),
    });

    const shareRecord = await ctx.db
      .query("projectShares")
      .withIndex("by_projectId_and_userId", (q) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId),
      )
      .unique();

    if (shareRecord) {
      await ctx.db.delete(shareRecord._id);
    }

    return { ok: true as const };
  },
});

// ---------------------------------------------------------------------------
// Projects page
// ---------------------------------------------------------------------------

async function getAccessibleProjects(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Array<Doc<"projects">>> {
  const owned = await ctx.db
    .query("projects")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", userId))
    .collect();

  const shares = await ctx.db
    .query("projectShares")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();

  const shared: Array<Doc<"projects">> = [];
  const ownedIds = new Set(owned.map((p) => p._id));

  for (const share of shares) {
    if (ownedIds.has(share.projectId)) continue;
    const project = await ctx.db.get(share.projectId);
    if (project) shared.push(project);
  }

  return [...owned, ...shared];
}

export const listForPage = query({
  args: {},
  handler: async (ctx) => {
    let user;
    try {
      user = await requireUserDoc(ctx);
    } catch {
      return [];
    }
    const all = await getAccessibleProjects(ctx, user._id);
    const results = [];

    for (const p of all) {
      let totalTasks = 0;
      let completedTasks = 0;

      try {
        const parsed = JSON.parse(p.data);
        const wbs = parsed.project_wbs || [];
        for (const phase of wbs) {
          for (const task of phase.tasks || []) {
            totalTasks++;
            if (task.completed) completedTasks++;
          }
        }
      } catch {
        // data may not be valid JSON yet
      }

      const collaboratorEmails: Array<string> = [];
      for (const uid of p.sharedWith) {
        const u = await ctx.db.get(uid);
        if (u) collaboratorEmails.push(u.email);
      }

      results.push({
        _id: p._id,
        slug: p.slug,
        projectName: p.projectName,
        summaryName: p.summaryName,
        pinned: p.pinned ?? false,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt,
        isOwner: p.ownerId === user._id,
        totalTasks,
        completedTasks,
        collaboratorEmails,
      });
    }

    return results;
  },
});

export const togglePin = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);
    const project = await ctx.db.get(args.projectId);

    if (!project) throw new Error("Not found");
    if (
      project.ownerId !== user._id &&
      !project.sharedWith.includes(user._id)
    ) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.projectId, {
      pinned: !(project.pinned ?? false),
    });

    return { ok: true as const };
  },
});

export const rename = mutation({
  args: {
    projectId: v.id("projects"),
    projectName: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);
    const project = await ctx.db.get(args.projectId);

    if (!project || project.ownerId !== user._id) {
      throw new Error("Not found or not authorized");
    }

    await ctx.db.patch(args.projectId, {
      projectName: args.projectName,
      updatedAt: Date.now(),
    });

    return { ok: true as const };
  },
});

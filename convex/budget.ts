import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireUserDoc } from "./lib/requireUser";

// ---------------------------------------------------------------------------
// Category queries & mutations
// ---------------------------------------------------------------------------

export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUserDoc(ctx);
    return await ctx.db
      .query("budgetCategories")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const createCategory = mutation({
  args: {
    name: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);
    return await ctx.db.insert("budgetCategories", {
      userId: user._id,
      name: args.name,
      color: args.color,
      createdAt: Date.now(),
    });
  },
});

// ---------------------------------------------------------------------------
// Transaction queries & mutations
// ---------------------------------------------------------------------------

export const listTransactionsByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();

    const owned = transactions.filter((t) => t.userId === user._id);

    const categoryIds = [...new Set(owned.map((t) => t.categoryId))];
    const categories: Record<string, Doc<"budgetCategories">> = {};
    for (const id of categoryIds) {
      const cat = await ctx.db.get(id);
      if (cat) categories[id] = cat;
    }

    return owned.map((t) => ({
      ...t,
      category: categories[t.categoryId] ?? null,
    }));
  },
});

export const listTransactions = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUserDoc(ctx);
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    const categoryIds = [...new Set(transactions.map((t) => t.categoryId))];
    const categories: Record<string, Doc<"budgetCategories">> = {};
    for (const id of categoryIds) {
      const cat = await ctx.db.get(id);
      if (cat) categories[id] = cat;
    }

    const projectIds = [
      ...new Set(transactions.map((t) => t.projectId).filter(Boolean)),
    ];
    const projects: Record<string, Doc<"projects">> = {};
    for (const id of projectIds) {
      if (!id) continue;
      const proj = await ctx.db.get(id);
      if (proj) projects[id] = proj;
    }

    return transactions.map((t) => ({
      ...t,
      category: categories[t.categoryId] ?? null,
      project: t.projectId ? (projects[t.projectId] ?? null) : null,
    }));
  },
});

export const createTransaction = mutation({
  args: {
    title: v.string(),
    amount: v.number(),
    type: v.union(v.literal("income"), v.literal("expense")),
    categoryId: v.id("budgetCategories"),
    projectId: v.optional(v.id("projects")),
    date: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);

    const category = await ctx.db.get(args.categoryId);
    if (!category || category.userId !== user._id) {
      throw new Error("Category not found");
    }

    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.ownerId !== user._id) {
        throw new Error("Project not found");
      }
    }

    return await ctx.db.insert("transactions", {
      userId: user._id,
      title: args.title,
      amount: args.amount,
      type: args.type,
      categoryId: args.categoryId,
      projectId: args.projectId,
      date: args.date,
      createdAt: Date.now(),
    });
  },
});

export const updateTransaction = mutation({
  args: {
    id: v.id("transactions"),
    title: v.string(),
    amount: v.number(),
    type: v.union(v.literal("income"), v.literal("expense")),
    categoryId: v.id("budgetCategories"),
    projectId: v.optional(v.id("projects")),
    date: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.userId !== user._id) {
      throw new Error("Transaction not found");
    }

    const category = await ctx.db.get(args.categoryId);
    if (!category || category.userId !== user._id) {
      throw new Error("Category not found");
    }

    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.ownerId !== user._id) {
        throw new Error("Project not found");
      }
    }

    await ctx.db.patch(args.id, {
      title: args.title,
      amount: args.amount,
      type: args.type,
      categoryId: args.categoryId,
      projectId: args.projectId,
      date: args.date,
    });
  },
});

export const deleteTransaction = mutation({
  args: {
    id: v.id("transactions"),
  },
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.userId !== user._id) {
      throw new Error("Transaction not found");
    }

    await ctx.db.delete(args.id);
  },
});

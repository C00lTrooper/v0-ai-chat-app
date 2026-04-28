import { mutation } from "./_generated/server";
import { requireUserDoc } from "./lib/requireUser";
import { deleteProjectCascade } from "./lib/deleteProjectCascade";

/** Call once after sign-in so queries can resolve the Convex `users` row. */
export const ensureCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserDoc(ctx);
    return { ok: true as const };
  },
});

export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUserDoc(ctx);

    const ownedProjects = await ctx.db
      .query("projects")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
      .collect();

    for (const project of ownedProjects) {
      await deleteProjectCascade(ctx, project._id);
    }

    const membershipShares = await ctx.db
      .query("projectShares")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const share of membershipShares) {
      const proj = await ctx.db.get(share.projectId);
      if (proj) {
        await ctx.db.patch(proj._id, {
          sharedWith: proj.sharedWith.filter((id) => id !== user._id),
        });
      }
      await ctx.db.delete(share._id);
    }

    const remainingTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const t of remainingTransactions) {
      await ctx.db.delete(t._id);
    }

    const categories = await ctx.db
      .query("budgetCategories")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const c of categories) {
      await ctx.db.delete(c._id);
    }

    const userEvents = await ctx.db
      .query("calendarEvents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const ev of userEvents) {
      await ctx.db.delete(ev._id);
    }

    await ctx.db.delete(user._id);

    return { ok: true as const };
  },
});

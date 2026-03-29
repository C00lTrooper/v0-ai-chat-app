import { mutation } from "./_generated/server";
import { requireUserDoc } from "./lib/requireUser";

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

    // Delete all projects owned by this user (and their related data)
    const ownedProjects = await ctx.db
      .query("projects")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
      .collect();

    for (const project of ownedProjects) {
      const chats = await ctx.db
        .query("chats")
        .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
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

      const shares = await ctx.db
        .query("projectShares")
        .withIndex("by_projectId_and_userId", (q) =>
          q.eq("projectId", project._id),
        )
        .collect();

      for (const share of shares) {
        await ctx.db.delete(share._id);
      }

      await ctx.db.delete(project._id);
    }

    const membershipShares = await ctx.db
      .query("projectShares")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const share of membershipShares) {
      const project = await ctx.db.get("projects", share.projectId);
      if (project) {
        await ctx.db.patch(project._id, {
          sharedWith: project.sharedWith.filter((id) => id !== user._id),
        });
      }
      await ctx.db.delete(share._id);
    }

    await ctx.db.delete(user._id);

    return { ok: true as const };
  },
});

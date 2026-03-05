import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateSessionToken(): string {
  const rand = () => Math.random().toString(36).slice(2);
  return `${rand()}${rand()}${Date.now().toString(36)}`;
}

export const signup = mutation({
  args: {
    email: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const email = normalizeEmail(args.email);

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (existingUser) {
      return {
        ok: false as const,
        errorCode: "email_taken" as const,
      };
    }

    const userId = await ctx.db.insert("users", {
      email,
      passwordHash: args.passwordHash,
      createdAt: now,
    });

    const token = generateSessionToken();
    const expiresAt = now + SESSION_TTL_MS;

    await ctx.db.insert("sessions", {
      userId,
      token,
      expiresAt,
      createdAt: now,
    });

    return {
      ok: true as const,
      token,
      userId,
      email,
      expiresAt,
    };
  },
});

export const loginWithPassword = mutation({
  args: {
    email: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const email = normalizeEmail(args.email);

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (!existingUser || existingUser.passwordHash !== args.passwordHash) {
      return {
        ok: false as const,
        errorCode: "invalid_credentials" as const,
      };
    }

    const token = generateSessionToken();
    const expiresAt = now + SESSION_TTL_MS;

    await ctx.db.insert("sessions", {
      userId: existingUser._id,
      token,
      expiresAt,
      createdAt: now,
    });

    return {
      ok: true as const,
      token,
      userId: existingUser._id,
      email: existingUser.email,
      expiresAt,
    };
  },
});

export const getSession = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!session) {
      return null;
    }

    const now = Date.now();
    if (session.expiresAt <= now) {
      return null;
    }

    const user = await ctx.db.get("users", session.userId);
    if (!user) {
      return null;
    }

    return {
      userId: user._id,
      email: user.email,
      expiresAt: session.expiresAt,
    };
  },
});

export const logout = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (session) {
      await ctx.db.delete(session._id);
    }

    return null;
  },
});

export const deleteAccount = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!session || session.expiresAt <= Date.now()) {
      throw new Error("Unauthenticated");
    }

    const user = await ctx.db.get("users", session.userId);
    if (!user) {
      return { ok: true as const };
    }

    // Delete all sessions for this user
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const s of sessions) {
      await ctx.db.delete(s._id);
    }

    // Delete all projects owned by this user (and their related data)
    const ownedProjects = await ctx.db
      .query("projects")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
      .collect();

    for (const project of ownedProjects) {
      // Delete chats and messages for this project
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

      // Delete all share records for this project
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

    // Remove user from projects shared with them
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

    // Finally delete the user document
    await ctx.db.delete(user._id);

    return { ok: true as const };
  },
});


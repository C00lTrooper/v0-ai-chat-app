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


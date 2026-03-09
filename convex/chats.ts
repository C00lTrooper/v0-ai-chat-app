import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { Id } from "./_generated/dataModel";

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

async function assertProjectAccess(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  projectId: Id<"projects">,
): Promise<Doc<"projects">> {
  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Project not found");

  if (project.ownerId !== user._id && !project.sharedWith.includes(user._id)) {
    throw new Error("Not authorized");
  }

  return project;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const listByProject = query({
  args: { token: v.string(), projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    await assertProjectAccess(ctx, user, args.projectId);

    const chat = await ctx.db
      .query("chats")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .first();

    if (!chat) return { chatId: null, messages: [] };

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_chatId", (q) => q.eq("chatId", chat._id))
      .order("asc")
      .collect();

    return {
      chatId: chat._id as string,
      messages: messages.map((m) => ({
        _id: m._id as string,
        role: m.role,
        content: m.content,
        reasoning: m.reasoning,
        createdAt: m.createdAt,
      })),
    };
  },
});

export const listChatsByProject = query({
  args: { token: v.string(), projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    await assertProjectAccess(ctx, user, args.projectId);

    const chats = await ctx.db
      .query("chats")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();

    const result = [];
    for (const chat of chats) {
      const messages = await ctx.db
        .query("chatMessages")
        .withIndex("by_chatId", (q) => q.eq("chatId", chat._id))
        .collect();
      result.push({
        _id: chat._id,
        projectId: chat.projectId,
        name: chat.name ?? null,
        createdAt: chat.createdAt,
        messageCount: messages.length,
      });
    }
    return result;
  },
});

export const getChatWithMessages = query({
  args: { token: v.string(), chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const chat = await ctx.db.get(args.chatId);
    if (!chat) return null;
    await assertProjectAccess(ctx, user, chat.projectId);

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .order("asc")
      .collect();

    return {
      chatId: chat._id,
      projectId: chat.projectId,
      name: chat.name ?? null,
      createdAt: chat.createdAt,
      messages: messages.map((m) => ({
        _id: m._id as string,
        role: m.role,
        content: m.content,
        reasoning: m.reasoning,
        createdAt: m.createdAt,
      })),
    };
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const createChat = mutation({
  args: {
    token: v.string(),
    projectId: v.id("projects"),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const project = await assertProjectAccess(ctx, user, args.projectId);

    const now = Date.now();

    const chatId = await ctx.db.insert("chats", {
      projectId: args.projectId,
      name: args.name ?? undefined,
      createdAt: now,
    });

    const trimmedData = project.data?.trim();
    if (trimmedData && trimmedData !== "{}") {
      await ctx.db.insert("chatMessages", {
        chatId,
        role: "assistant",
        content: trimmedData,
        createdAt: now,
      });
    }

    return { chatId };
  },
});

export const sendMessage = mutation({
  args: {
    token: v.string(),
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    reasoning: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const chat = await ctx.db.get(args.chatId);
    if (!chat) throw new Error("Chat not found");
    await assertProjectAccess(ctx, user, chat.projectId);

    const messageId = await ctx.db.insert("chatMessages", {
      chatId: args.chatId,
      role: args.role,
      content: args.content,
      reasoning: args.reasoning,
      createdAt: Date.now(),
    });

    return { messageId, chatId: args.chatId };
  },
});

export const renameChat = mutation({
  args: {
    token: v.string(),
    chatId: v.id("chats"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const chat = await ctx.db.get(args.chatId);
    if (!chat) throw new Error("Chat not found");
    await assertProjectAccess(ctx, user, chat.projectId);

    await ctx.db.patch(args.chatId, { name: args.name.trim() || undefined });
    return { ok: true as const };
  },
});

export const deleteChat = mutation({
  args: {
    token: v.string(),
    chatId: v.id("chats"),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const chat = await ctx.db.get(args.chatId);
    if (!chat) throw new Error("Chat not found");
    await assertProjectAccess(ctx, user, chat.projectId);

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }
    await ctx.db.delete(args.chatId);
    return { ok: true as const };
  },
});

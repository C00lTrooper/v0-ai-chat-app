import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_userId", ["userId"]),

  projects: defineTable({
    ownerId: v.id("users"),
    slug: v.string(),
    sharedWith: v.array(v.id("users")),
    shareToken: v.optional(v.string()),
    projectName: v.string(),
    summaryName: v.string(),
    objective: v.string(),
    targetDate: v.string(),
    data: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_slug", ["slug"])
    .index("by_shareToken", ["shareToken"]),

  projectShares: defineTable({
    projectId: v.id("projects"),
    userId: v.id("users"),
  })
    .index("by_userId", ["userId"])
    .index("by_projectId_and_userId", ["projectId", "userId"]),

  chats: defineTable({
    projectId: v.id("projects"),
    createdAt: v.number(),
  }).index("by_projectId", ["projectId"]),

  chatMessages: defineTable({
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    reasoning: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_chatId", ["chatId"]),
});

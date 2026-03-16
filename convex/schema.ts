import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    dailyTaskLimit: v.optional(v.number()),
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
    pinned: v.optional(v.boolean()),
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
    projectId: v.optional(v.id("projects")),
    userId: v.optional(v.id("users")),
    name: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_projectId", ["projectId"]),

  chatMessages: defineTable({
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    reasoning: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_chatId", ["chatId"]),

  tasks: defineTable({
    projectId: v.id("projects"),
    phaseOrder: v.number(),
    taskOrder: v.number(),
    title: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
    parentTaskId: v.optional(v.id("tasks")),
  }).index("by_project_phase_task", ["projectId", "phaseOrder", "taskOrder"]),

  subtasks: defineTable({
    taskId: v.id("tasks"),
    title: v.string(),
    completed: v.boolean(),
    createdAt: v.number(),
  }).index("by_taskId", ["taskId"]),

  budgetCategories: defineTable({
    userId: v.id("users"),
    name: v.string(),
    color: v.string(),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),

  transactions: defineTable({
    userId: v.id("users"),
    title: v.string(),
    amount: v.number(),
    type: v.union(v.literal("income"), v.literal("expense")),
    categoryId: v.id("budgetCategories"),
    projectId: v.optional(v.id("projects")),
    date: v.number(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_date", ["userId", "date"])
    .index("by_projectId", ["projectId"]),

  calendarEvents: defineTable({
    userId: v.id("users"),
    projectId: v.optional(v.id("projects")),
    title: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_projectId", ["projectId"]),
});

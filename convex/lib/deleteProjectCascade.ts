import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Deletes all database rows scoped to a project, then deletes the project.
 * Caller must authorize (e.g. project owner).
 */
export async function deleteProjectCascade(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<void> {
  const pid = projectId;

  const chats = await ctx.db
    .query("chats")
    .withIndex("by_projectId", (q) => q.eq("projectId", pid))
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
    .withIndex("by_projectId_and_userId", (q) => q.eq("projectId", pid))
    .collect();

  for (const share of shares) {
    await ctx.db.delete(share._id);
  }

  const snapshots = await ctx.db
    .query("schedulingSnapshots")
    .withIndex("by_project_user", (q) => q.eq("projectId", pid))
    .collect();

  for (const s of snapshots) {
    await ctx.db.delete(s._id);
  }

  const calendarEventRows = await ctx.db
    .query("calendarEvents")
    .withIndex("by_projectId", (q) => q.eq("projectId", pid))
    .collect();

  for (const ev of calendarEventRows) {
    await ctx.db.delete(ev._id);
  }

  const transactionRows = await ctx.db
    .query("transactions")
    .withIndex("by_projectId", (q) => q.eq("projectId", pid))
    .collect();

  for (const t of transactionRows) {
    await ctx.db.delete(t._id);
  }

  let taskRows = await ctx.db
    .query("tasks")
    .withIndex("by_project_phase_task", (q) => q.eq("projectId", pid))
    .collect();

  while (taskRows.length > 0) {
    const hasChild = (parentId: (typeof taskRows)[number]["_id"]) =>
      taskRows.some((t) => t.parentTaskId === parentId);
    let leaves = taskRows.filter((t) => !hasChild(t._id));
    if (leaves.length === 0) {
      leaves = [taskRows[0]];
    }

    for (const task of leaves) {
      const subs = await ctx.db
        .query("subtasks")
        .withIndex("by_taskId", (q) => q.eq("taskId", task._id))
        .collect();
      for (const sub of subs) {
        await ctx.db.delete(sub._id);
      }
      await ctx.db.delete(task._id);
    }

    taskRows = await ctx.db
      .query("tasks")
      .withIndex("by_project_phase_task", (q) => q.eq("projectId", pid))
      .collect();
  }

  const featureRows = await ctx.db
    .query("features")
    .withIndex("by_project_order", (q) => q.eq("projectId", pid))
    .collect();

  for (const f of featureRows) {
    await ctx.db.delete(f._id);
  }

  await ctx.db.delete(pid);
}

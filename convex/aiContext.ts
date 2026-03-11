import { query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

async function authenticateUser(
  ctx: QueryCtx,
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
  if (!user) throw new Error("User not found");
  return user;
}

async function getAccessibleProjects(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"projects">[]> {
  const owned = await ctx.db
    .query("projects")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", userId))
    .collect();

  const shares = await ctx.db
    .query("projectShares")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();

  const shared: Doc<"projects">[] = [];
  const ownedIds = new Set(owned.map((p) => p._id));
  for (const share of shares) {
    if (ownedIds.has(share.projectId)) continue;
    const project = await ctx.db.get(share.projectId);
    if (project) shared.push(project);
  }

  return [...owned, ...shared];
}

export const getContext = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.token);
    const projects = await getAccessibleProjects(ctx, user._id);

    const projectSummaries = [];
    for (const p of projects) {
      let totalTasks = 0;
      let completedTasks = 0;
      const tasks: Array<{
        phaseOrder: number;
        phaseName: string;
        taskOrder: number;
        title: string;
        dueDate: string;
        startTime: string;
        endTime?: string;
        completed: boolean;
      }> = [];

      try {
        const data = JSON.parse(p.data);
        for (const phase of data.project_wbs || []) {
          for (const task of phase.tasks || []) {
            totalTasks++;
            if (task.completed) completedTasks++;
            tasks.push({
              phaseOrder: phase.order,
              phaseName: phase.name,
              taskOrder: task.order,
              title: task.name,
              dueDate: task.date,
              startTime: task.time || "9:00 AM",
              endTime: task.endTime || undefined,
              completed: Boolean(task.completed),
            });
          }
        }
      } catch {
        // data may not be valid JSON
      }

      const status =
        totalTasks > 0 && completedTasks === totalTasks
          ? "completed"
          : totalTasks > 0
            ? "active"
            : "planning";

      projectSummaries.push({
        id: p._id as string,
        name: p.projectName,
        slug: p.slug,
        status,
        completionPct: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        totalTasks,
        completedTasks,
        targetDate: p.targetDate,
        tasks,
      });
    }

    const calendarEvents = await ctx.db
      .query("calendarEvents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(200);

    const calendarEventSummaries = [];
    for (const e of calendarEvents) {
      let projectName: string | undefined;
      if (e.projectId) {
        const proj = projects.find((p) => p._id === e.projectId);
        if (proj) projectName = proj.projectName;
      }
      calendarEventSummaries.push({
        id: e._id as string,
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate,
        projectId: e.projectId ? (e.projectId as string) : undefined,
        projectName,
      });
    }

    return {
      userName: user.email.split("@")[0],
      projects: projectSummaries,
      calendarEvents: calendarEventSummaries,
    };
  },
});

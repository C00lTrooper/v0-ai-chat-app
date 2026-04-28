import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { Project } from "../lib/project-schema";
import {
  normalizeProjectWbsOrders,
  remapConvexTasksForWbsChange,
} from "./wbsPersistence";
import { requireUserDoc } from "./lib/requireUser";

function taskKey(name: string, date: string, time: string): string {
  return `${name.trim()}|${date.trim()}|${time.trim()}`;
}

function wbsTaskFromGenerated(t: {
  name: string;
  description: string;
  date: string;
  time: string;
  endTime?: string;
}): Project["project_wbs"][number]["tasks"][number] {
  return {
    order: 0,
    name: t.name.trim(),
    description: (t.description ?? "").trim(),
    date: t.date.trim(),
    time: t.time.trim(),
    ...(t.endTime?.trim() ? { endTime: t.endTime.trim() } : {}),
    completed: false,
  };
}

type PendingFeatureLink = {
  featureId: Id<"features">;
  phaseOrder: number;
  key: string;
};

function resolveLinks(
  normalized: Project,
  links: PendingFeatureLink[],
): Array<{ featureId: Id<"features">; phaseOrder: number; taskOrder: number }> {
  const usedSlots = new Set<string>();
  const out: Array<{
    featureId: Id<"features">;
    phaseOrder: number;
    taskOrder: number;
  }> = [];

  for (const link of links) {
    const phase = normalized.project_wbs.find(
      (p) => p.order === link.phaseOrder,
    );
    if (!phase) continue;

    for (const task of phase.tasks) {
      const k = taskKey(task.name, task.date, task.time);
      if (k !== link.key) continue;
      const slot = `${link.phaseOrder}:${task.order}`;
      if (usedSlots.has(slot)) continue;
      usedSlots.add(slot);
      out.push({
        featureId: link.featureId,
        phaseOrder: link.phaseOrder,
        taskOrder: task.order,
      });
      break;
    }
  }

  return out;
}

export const commitIncrementalGeneration = mutation({
  args: {
    projectId: v.id("projects"),
    newPhases: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        start_date: v.string(),
        end_date: v.string(),
        tasks: v.array(
          v.object({
            name: v.string(),
            description: v.string(),
            date: v.string(),
            time: v.string(),
            endTime: v.optional(v.string()),
          }),
        ),
      }),
    ),
    newFeatures: v.array(
      v.object({
        phaseOrder: v.number(),
        name: v.string(),
        description: v.string(),
        tasks: v.array(
          v.object({
            name: v.string(),
            description: v.string(),
            date: v.string(),
            time: v.string(),
            endTime: v.optional(v.string()),
          }),
        ),
      }),
    ),
    tasksForExistingPhases: v.array(
      v.object({
        phaseOrder: v.number(),
        tasks: v.array(
          v.object({
            name: v.string(),
            description: v.string(),
            date: v.string(),
            time: v.string(),
            endTime: v.optional(v.string()),
          }),
        ),
      }),
    ),
    tasksForExistingFeatures: v.array(
      v.object({
        phaseOrder: v.number(),
        featureName: v.string(),
        tasks: v.array(
          v.object({
            name: v.string(),
            description: v.string(),
            date: v.string(),
            time: v.string(),
            endTime: v.optional(v.string()),
          }),
        ),
      }),
    ),
  },
  returns: v.object({
    phasesAdded: v.number(),
    featuresAdded: v.number(),
    tasksAdded: v.number(),
    phaseOrdersWithNewTasks: v.array(v.number()),
  }),
  handler: async (ctx, args) => {
    const user = await requireUserDoc(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.ownerId !== user._id) {
      throw new Error("Not found or not authorized");
    }

    let parsed: Project;
    try {
      parsed = JSON.parse(project.data) as Project;
    } catch {
      throw new Error("Invalid project data");
    }

    if (!Array.isArray(parsed.project_wbs)) {
      parsed.project_wbs = [] as unknown as Project["project_wbs"];
    }

    const pendingLinks: PendingFeatureLink[] = [];
    let tasksAdded = 0;
    let phasesAdded = 0;
    let featuresAdded = 0;
    const phaseOrdersWithTasks = new Set<number>();

    const ensurePhase = (phaseOrder: number): Project["project_wbs"][number] => {
      let phase = parsed.project_wbs.find((p) => p.order === phaseOrder);
      if (!phase) {
        throw new Error(`Phase order ${phaseOrder} not found`);
      }
      return phase;
    };

    let nextPhaseOrder =
      parsed.project_wbs.length > 0
        ? Math.max(...parsed.project_wbs.map((p) => p.order)) + 1
        : 1;

    for (const ph of args.newPhases) {
      const tasks = ph.tasks.map((t) => wbsTaskFromGenerated(t));
      tasksAdded += tasks.length;
      if (tasks.length) {
        phaseOrdersWithTasks.add(nextPhaseOrder);
      }
      parsed.project_wbs.push({
        order: nextPhaseOrder,
        name: ph.name.trim(),
        description: ph.description.trim(),
        start_date: ph.start_date.trim(),
        end_date: ph.end_date.trim(),
        tasks,
      });
      nextPhaseOrder += 1;
      phasesAdded += 1;
    }

    const now = Date.now();

    for (const nf of args.newFeatures) {
      const phase = ensurePhase(nf.phaseOrder);
      const existingFeats = await ctx.db
        .query("features")
        .withIndex("by_project_phase", (q) =>
          q.eq("projectId", args.projectId).eq("phaseOrder", nf.phaseOrder),
        )
        .collect();
      const maxFeatOrder =
        existingFeats.reduce((m, f) => (f.order > m ? f.order : m), -1) + 1;

      const featureId = await ctx.db.insert("features", {
        projectId: args.projectId,
        phaseOrder: nf.phaseOrder,
        name: nf.name.trim(),
        description: nf.description.trim(),
        createdAt: now,
        order: maxFeatOrder,
      });
      featuresAdded += 1;

      for (const t of nf.tasks) {
        const wt = wbsTaskFromGenerated(t);
        phase.tasks = [...(phase.tasks ?? []), wt];
        tasksAdded += 1;
        phaseOrdersWithTasks.add(nf.phaseOrder);
        pendingLinks.push({
          featureId,
          phaseOrder: nf.phaseOrder,
          key: taskKey(wt.name, wt.date, wt.time),
        });
      }
    }

    for (const block of args.tasksForExistingPhases) {
      const phase = ensurePhase(block.phaseOrder);
      for (const t of block.tasks) {
        const wt = wbsTaskFromGenerated(t);
        phase.tasks = [...(phase.tasks ?? []), wt];
        tasksAdded += 1;
        phaseOrdersWithTasks.add(block.phaseOrder);
      }
    }

    for (const block of args.tasksForExistingFeatures) {
      const phase = ensurePhase(block.phaseOrder);
      const feats = await ctx.db
        .query("features")
        .withIndex("by_project_phase", (q) =>
          q.eq("projectId", args.projectId).eq("phaseOrder", block.phaseOrder),
        )
        .collect();
      const feature = feats.find(
        (f) => f.name.trim() === block.featureName.trim(),
      );
      if (!feature) {
        continue;
      }

      for (const t of block.tasks) {
        const wt = wbsTaskFromGenerated(t);
        phase.tasks = [...(phase.tasks ?? []), wt];
        tasksAdded += 1;
        phaseOrdersWithTasks.add(block.phaseOrder);
        pendingLinks.push({
          featureId: feature._id,
          phaseOrder: block.phaseOrder,
          key: taskKey(wt.name, wt.date, wt.time),
        });
      }
    }

    const normalized = normalizeProjectWbsOrders(parsed);
    const previousDataJson = project.data;

    await remapConvexTasksForWbsChange(
      ctx,
      args.projectId,
      previousDataJson,
      normalized,
    );

    await ctx.db.patch(args.projectId, {
      data: JSON.stringify(normalized),
      updatedAt: Date.now(),
    });

    const resolved = resolveLinks(normalized, pendingLinks);

    for (const r of resolved) {
      const phase = normalized.project_wbs.find((p) => p.order === r.phaseOrder);
      const task = phase?.tasks.find((t) => t.order === r.taskOrder);
      const title = task?.name ?? "Task";
      const description = task?.description?.trim() || undefined;

      const existing = await ctx.db
        .query("tasks")
        .withIndex("by_project_phase_task", (q) =>
          q
            .eq("projectId", args.projectId)
            .eq("phaseOrder", r.phaseOrder)
            .eq("taskOrder", r.taskOrder),
        )
        .unique()
        .catch(() => null);

      if (existing) {
        await ctx.db.patch(existing._id, {
          featureId: r.featureId,
          title,
          ...(description !== undefined ? { description } : {}),
        });
      } else {
        await ctx.db.insert("tasks", {
          projectId: args.projectId,
          phaseOrder: r.phaseOrder,
          taskOrder: r.taskOrder,
          title,
          createdAt: now,
          parentTaskId: undefined,
          featureId: r.featureId,
          ...(description !== undefined ? { description } : {}),
        });
      }
    }

    return {
      phasesAdded,
      featuresAdded,
      tasksAdded,
      phaseOrdersWithNewTasks: Array.from(phaseOrdersWithTasks),
    };
  },
});

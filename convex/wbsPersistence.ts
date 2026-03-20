import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { Project } from "../lib/project-schema";
import {
  assignWbsOrdersFromDates,
  assignUnassignedTaskOrders,
  listWbsTaskSlotsForRemap,
  lookupTaskSignatureKeyForRemap,
  resolveTaskInRemapSlice,
  UNASSIGNED_SIGNATURE_PHASE_LABEL,
  type ProjectWbsRemapSlice,
} from "../lib/wbs-order-from-dates";

export function normalizeProjectWbsOrders(parsed: Project): Project {
  const unassigned = assignUnassignedTaskOrders(parsed.unassigned_tasks);
  if (!Array.isArray(parsed.project_wbs) || parsed.project_wbs.length === 0) {
    return { ...parsed, unassigned_tasks: unassigned };
  }
  return {
    ...parsed,
    project_wbs: assignWbsOrdersFromDates(parsed.project_wbs),
    unassigned_tasks: unassigned,
  };
}

function sliceFromParsed(project: Project | null | undefined): ProjectWbsRemapSlice | null {
  if (!project || !Array.isArray(project.project_wbs)) return null;
  return {
    project_wbs: project.project_wbs,
    unassigned_tasks: project.unassigned_tasks,
  };
}

export async function remapConvexTasksForWbsChange(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  previousDataJson: string,
  normalizedProject: Project,
): Promise<void> {
  let oldSlice: ProjectWbsRemapSlice | null = null;
  try {
    const o = JSON.parse(previousDataJson) as Project;
    oldSlice = sliceFromParsed(o);
  } catch {
    oldSlice = null;
  }

  if (
    !oldSlice?.project_wbs?.length &&
    !(oldSlice?.unassigned_tasks?.length ?? 0)
  ) {
    return;
  }

  if (!oldSlice) {
    return;
  }

  const newSlice: ProjectWbsRemapSlice = {
    project_wbs: normalizedProject.project_wbs,
    unassigned_tasks: normalizedProject.unassigned_tasks,
  };

  const newSlots = listWbsTaskSlotsForRemap(newSlice);
  const used = new Set<number>();
  const convexTasks = await ctx.db
    .query("tasks")
    .withIndex("by_project_phase_task", (q) => q.eq("projectId", projectId))
    .collect();

  for (const doc of convexTasks) {
    const oldKey = lookupTaskSignatureKeyForRemap(
      oldSlice,
      doc.phaseOrder,
      doc.taskOrder,
    );

    let idx =
      oldKey !== null
        ? newSlots.findIndex((slot, i) => !used.has(i) && slot.key === oldKey)
        : -1;

    if (idx < 0) {
      const resolved = resolveTaskInRemapSlice(
        oldSlice,
        doc.phaseOrder,
        doc.taskOrder,
      );
      if (resolved) {
        const name = String(resolved.task.name).trim();
        const time = String(resolved.task.time ?? "").trim();
        const isUn = resolved.phaseName === UNASSIGNED_SIGNATURE_PHASE_LABEL;
        idx = newSlots.findIndex((slot, i) => {
          if (used.has(i)) return false;
          const pn = isUn
            ? slot.phaseName === UNASSIGNED_SIGNATURE_PHASE_LABEL
            : slot.phaseName === resolved.phaseName;
          return (
            pn &&
            slot.taskName === name &&
            slot.time === time
          );
        });
      }
    }

    if (idx < 0) continue;

    used.add(idx);
    const slot = newSlots[idx];
    if (
      doc.phaseOrder !== slot.phaseOrder ||
      doc.taskOrder !== slot.taskOrder
    ) {
      await ctx.db.patch(doc._id, {
        phaseOrder: slot.phaseOrder,
        taskOrder: slot.taskOrder,
      });
    }
  }
}

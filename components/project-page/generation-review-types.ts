import type {
  GeneratedFeature,
  GeneratedPhase,
  GeneratedWbsTask,
  IncrementalGenerationResponse,
} from "@/lib/generate-project-content-schema";
import type { Project } from "@/lib/project-schema";

export type ReviewTaskNode = {
  id: string;
  checked: boolean;
  name: string;
  description: string;
  date: string;
  time: string;
  endTime?: string;
};

export type ReviewFeatureNode = {
  id: string;
  checked: boolean;
  expanded: boolean;
  name: string;
  description: string;
  phaseOrder: number;
  tasks: ReviewTaskNode[];
  isNew: boolean;
  existingFeatureId?: string;
};

export type ReviewPhaseNode = {
  id: string;
  checked: boolean;
  expanded: boolean;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  /** Set for existing WBS phases only */
  phaseOrder?: number;
  features: ReviewFeatureNode[];
  unassignedTasks: ReviewTaskNode[];
  isNew: boolean;
};

export function mapTasks(tasks: GeneratedWbsTask[]): ReviewTaskNode[] {
  return tasks.map((t) => ({
    id: crypto.randomUUID(),
    checked: true,
    name: t.name,
    description: t.description ?? "",
    date: t.date,
    time: t.time,
    endTime: t.endTime,
  }));
}

export function buildReviewTreeFromResponse(
  res: IncrementalGenerationResponse,
  project: Project,
): ReviewPhaseNode[] {
  const out: ReviewPhaseNode[] = [];

  for (const np of res.newPhases) {
    out.push({
      id: crypto.randomUUID(),
      checked: true,
      expanded: true,
      name: np.name,
      description: np.description,
      start_date: np.start_date,
      end_date: np.end_date,
      isNew: true,
      features: [],
      unassignedTasks: mapTasks(np.tasks),
    });
  }

  const existingPhaseOrders = new Set<number>();
  for (const nf of res.newFeatures) existingPhaseOrders.add(nf.phaseOrder);
  for (const x of res.tasksForExistingPhases) existingPhaseOrders.add(x.phaseOrder);
  for (const x of res.tasksForExistingFeatures) existingPhaseOrders.add(x.phaseOrder);

  const sortedOrders = Array.from(existingPhaseOrders).sort((a, b) => a - b);

  for (const po of sortedOrders) {
    const phaseMeta = project.project_wbs?.find((p) => p.order === po);
    if (!phaseMeta) continue;

    const featuresForPhase: ReviewFeatureNode[] = [];

    for (const nf of res.newFeatures.filter((x) => x.phaseOrder === po)) {
      featuresForPhase.push({
        id: crypto.randomUUID(),
        checked: true,
        expanded: true,
        name: nf.name,
        description: nf.description,
        phaseOrder: po,
        isNew: true,
        tasks: mapTasks(nf.tasks),
      });
    }

    const byFeatureName = new Map<string, GeneratedWbsTask[]>();
    for (const block of res.tasksForExistingFeatures) {
      if (block.phaseOrder !== po) continue;
      const key = block.featureName.trim();
      const list = byFeatureName.get(key) ?? [];
      list.push(...block.tasks);
      byFeatureName.set(key, list);
    }

    for (const [featureName, tasks] of byFeatureName) {
      featuresForPhase.push({
        id: crypto.randomUUID(),
        checked: true,
        expanded: true,
        name: featureName,
        description: "",
        phaseOrder: po,
        isNew: false,
        tasks: mapTasks(tasks),
      });
    }

    const unassigned =
      res.tasksForExistingPhases.find((x) => x.phaseOrder === po)?.tasks ?? [];

    const hasContent =
      featuresForPhase.length > 0 || unassigned.length > 0;
    if (!hasContent) continue;

    out.push({
      id: crypto.randomUUID(),
      checked: true,
      expanded: true,
      name: phaseMeta.name,
      description: phaseMeta.description,
      start_date: phaseMeta.start_date,
      end_date: phaseMeta.end_date,
      phaseOrder: po,
      isNew: false,
      features: featuresForPhase,
      unassignedTasks: mapTasks(unassigned),
    });
  }

  return out;
}

export function taskToPayload(t: ReviewTaskNode) {
  return {
    name: t.name,
    description: t.description,
    date: t.date,
    time: t.time,
    endTime: t.endTime,
  };
}

function phaseHasSelection(phase: ReviewPhaseNode): boolean {
  if (phase.unassignedTasks.some((t) => t.checked)) return true;
  return phase.features.some((f) => f.tasks.some((t) => t.checked));
}

export function buildCommitPayloadFromTree(
  phases: ReviewPhaseNode[],
  project: Project,
): {
  newPhases: GeneratedPhase[];
  newFeatures: GeneratedFeature[];
  tasksForExistingPhases: { phaseOrder: number; tasks: GeneratedWbsTask[] }[];
  tasksForExistingFeatures: {
    phaseOrder: number;
    featureName: string;
    tasks: GeneratedWbsTask[];
  }[];
} {
  const newPhases: GeneratedPhase[] = [];
  const newFeatures: GeneratedFeature[] = [];
  const tasksForExistingPhases: {
    phaseOrder: number;
    tasks: GeneratedWbsTask[];
  }[] = [];
  const tasksForExistingFeatures: {
    phaseOrder: number;
    featureName: string;
    tasks: GeneratedWbsTask[];
  }[] = [];

  const wbs = project.project_wbs ?? [];
  const existingMax = wbs.length ? Math.max(...wbs.map((p) => p.order)) : 0;

  let newIdx = 0;
  const phaseOrderByClientId = new Map<string, number>();
  for (const phase of phases) {
    if (phase.isNew) {
      phaseOrderByClientId.set(phase.id, existingMax + 1 + newIdx);
      newIdx += 1;
    }
  }

  for (const phase of phases) {
    if (!phaseHasSelection(phase)) continue;

    if (phase.isNew) {
      const ut = phase.unassignedTasks.filter((t) => t.checked).map(taskToPayload);
      const po = phaseOrderByClientId.get(phase.id)!;

      newPhases.push({
        name: phase.name,
        description: phase.description,
        start_date: phase.start_date,
        end_date: phase.end_date,
        tasks: ut,
      });

      for (const f of phase.features) {
        if (!f.isNew) continue;
        const ft = f.tasks.filter((t) => t.checked).map(taskToPayload);
        if (ft.length === 0) continue;
        newFeatures.push({
          phaseOrder: po,
          name: f.name,
          description: f.description,
          tasks: ft,
        });
      }
      continue;
    }

    const po = phase.phaseOrder!;

    for (const f of phase.features) {
      const ft = f.tasks.filter((t) => t.checked).map(taskToPayload);
      if (ft.length === 0) continue;
      if (f.isNew) {
        newFeatures.push({
          phaseOrder: po,
          name: f.name,
          description: f.description,
          tasks: ft,
        });
      } else {
        tasksForExistingFeatures.push({
          phaseOrder: po,
          featureName: f.name,
          tasks: ft,
        });
      }
    }

    const ut = phase.unassignedTasks.filter((t) => t.checked).map(taskToPayload);
    if (ut.length) {
      tasksForExistingPhases.push({ phaseOrder: po, tasks: ut });
    }
  }

  return {
    newPhases,
    newFeatures,
    tasksForExistingPhases,
    tasksForExistingFeatures,
  };
}

import type { Project } from "@/lib/project-schema";

export type GenerationFlags = {
  generatePhases: boolean;
  generateFeatures: boolean;
  tasksForPhases: boolean;
  tasksForFeatures: boolean;
};

export type ExistingFeatureSummary = {
  _id: string;
  phaseOrder: number;
  name: string;
  description: string;
};

function summarizeProject(p: Project): string {
  const lines: string[] = [];
  lines.push(`project_name: ${p.project_name}`);
  lines.push(
    `summary: ${p.project_summary?.name ?? ""} | objective: ${p.project_summary?.objective ?? ""} | target_date: ${p.project_summary?.target_date ?? ""}`,
  );
  for (const ph of (p.project_wbs ?? []).slice().sort((a, b) => a.order - b.order)) {
    lines.push(
      `Phase order=${ph.order} name=${JSON.stringify(ph.name)} description=${JSON.stringify(ph.description)} start=${ph.start_date} end=${ph.end_date}`,
    );
    for (const t of ph.tasks ?? []) {
      lines.push(
        `  Task order=${t.order} name=${JSON.stringify(t.name)} desc=${JSON.stringify(t.description ?? "")} date=${t.date} time=${t.time} end=${t.endTime ?? ""}`,
      );
    }
  }
  const un = p.unassigned_tasks ?? [];
  if (un.length) {
    lines.push("Unassigned tasks:");
    for (const t of un) {
      lines.push(
        `  Task order=${t.order} name=${JSON.stringify(t.name)} date=${t.date}`,
      );
    }
  }
  return lines.join("\n");
}

export function buildIncrementalGenerationSystemMessage(): {
  role: "system";
  content: string;
} {
  return {
    role: "system",
    content: `You are a senior project planner. The user has an existing project with phases, optional features, and tasks. You must output ONLY a single JSON object (no markdown) matching this exact shape:
{
  "newPhases": [ { "name", "description", "start_date", "end_date", "tasks": [ { "name", "description", "date", "time", "endTime" } ] } ],
  "newFeatures": [ { "phaseOrder": number, "name", "description", "tasks": [ ... ] } ],
  "tasksForExistingPhases": [ { "phaseOrder": number, "tasks": [ ... ] } ],
  "tasksForExistingFeatures": [ { "phaseOrder": number, "featureName": string, "tasks": [ ... ] } ]
}

Rules:
- Every array may be empty. Only fill arrays that correspond to what the user asked to generate.
- NEVER duplicate or paraphrase existing task titles or feature names from the context. Create only genuinely NEW items that fill gaps.
- Do not repeat existing phase names for newPhases.
- phaseOrder in newFeatures, tasksForExistingPhases, and tasksForExistingFeatures must refer to EXISTING phase order values from the context (unless you are not generating those sections).
- For tasks: "name" is short (<=5 words). "description" is 2–4 practical sentences. "date" is YYYY-MM-DD. "time" and "endTime" are like "9:00 AM" / "10:30 AM", within 09:00–17:00, end strictly after start, duration <= 2 hours.
- newPhases: full new phases with their own date ranges and tasks (tasks are phase-level, not tied to a feature row).
- newFeatures: NEW feature records to add under an existing phase; include tasks for that feature in the same object's tasks array when generating tasks for those features.
- tasksForExistingPhases: NEW tasks to add under an existing phase but NOT under any feature (unassigned within that phase in the product UI).
- tasksForExistingFeatures: NEW tasks for an EXISTING feature; match featureName exactly to the feature name in the provided feature list.`,
  };
}

export function buildIncrementalGenerationUserContent(args: {
  project: Project;
  projectName: string;
  summaryName: string;
  objective: string;
  targetDate: string;
  features: ExistingFeatureSummary[];
  flags: GenerationFlags;
  targetPhaseOrders: number[];
  targetFeatureKeys: string[];
  additionalInstructions: string;
}): string {
  const flagLine = [
    args.flags.generatePhases && "Generate NEW phases (newPhases)",
    args.flags.generateFeatures && "Generate NEW features under selected phases (newFeatures)",
    args.flags.tasksForPhases &&
      "Generate NEW phase-level tasks for selected phases (tasksForExistingPhases)",
    args.flags.tasksForFeatures &&
      "Generate NEW tasks for selected existing features (tasksForExistingFeatures)",
  ]
    .filter(Boolean)
    .join("\n");

  const phasesLine =
    args.targetPhaseOrders.length > 0
      ? `Target phase orders (subset): ${args.targetPhaseOrders.join(", ")}`
      : "No phases targeted (only generate phases if requested and appropriate).";

  const featLine =
    args.targetFeatureKeys.length > 0
      ? `Target existing features (id|phaseOrder|name): ${args.targetFeatureKeys.join(" ; ")}`
      : "All existing features allowed for task generation when tasksForExistingFeatures is on.";

  const featBlock =
    args.features.length === 0
      ? "(No features in database yet.)"
      : args.features
          .map(
            (f) =>
              `id=${f._id} phaseOrder=${f.phaseOrder} name=${JSON.stringify(f.name)} desc=${JSON.stringify(f.description)}`,
          )
          .join("\n");

  const extra = args.additionalInstructions.trim()
    ? `\nAdditional instructions:\n${args.additionalInstructions.trim()}`
    : "";

  return (
    `Project header:\n- projectName: ${args.projectName}\n- summaryName: ${args.summaryName}\n- objective: ${args.objective}\n- targetDate: ${args.targetDate}\n\n` +
    `Existing features (Convex):\n${featBlock}\n\n` +
    `Existing WBS (do not duplicate):\n${summarizeProject(args.project)}\n\n` +
    `What to generate:\n${flagLine || "(nothing — return empty arrays)"}\n${phasesLine}\n${featLine}${extra}`
  );
}

export function buildRegenerateSystemMessage(): { role: "system"; content: string } {
  return {
    role: "system",
    content: `You output a single JSON object, no markdown. Either:
{ "replacementPhase": { "name", "description", "start_date", "end_date", "tasks": [...] } }
OR
{ "replacementFeature": { "phaseOrder", "name", "description", "tasks": [...] } }

Replace only the subtree you are asked to regenerate. Tasks use the same rules as incremental generation (dates, times, descriptions).`,
  };
}

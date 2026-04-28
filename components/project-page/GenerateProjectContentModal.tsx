"use client";

import * as React from "react";
import { useConvex, useQuery } from "convex/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "@/hooks/use-toast";
import type { Project } from "@/lib/project-schema";
import type { ProjectData } from "@/components/project-page/types";
import { GenerationReviewTree } from "@/components/project-page/GenerationReviewTree";
import {
  buildCommitPayloadFromTree,
  buildReviewTreeFromResponse,
  mapTasks,
  type ReviewPhaseNode,
} from "@/components/project-page/generation-review-types";
import type { IncrementalGenerationResponse } from "@/lib/generate-project-content-schema";
import { projectPrimaryButtonClassName } from "@/lib/project-primary-button";
import { ChevronsUpDown } from "lucide-react";

type GenerateProjectContentModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectData;
  ready: boolean;
};

export function GenerateProjectContentModal({
  open,
  onOpenChange,
  project,
  ready,
}: GenerateProjectContentModalProps) {
  const convex = useConvex();
  const [step, setStep] = React.useState<"form" | "review">("form");
  const [genPhases, setGenPhases] = React.useState(false);
  const [genFeatures, setGenFeatures] = React.useState(false);
  const [genTasksPhases, setGenTasksPhases] = React.useState(false);
  const [genTasksFeatures, setGenTasksFeatures] = React.useState(false);
  const [additionalInstructions, setAdditionalInstructions] =
    React.useState("");
  const [selectedPhaseOrders, setSelectedPhaseOrders] = React.useState<
    Set<number>
  >(new Set());
  const [selectedFeatureIds, setSelectedFeatureIds] = React.useState<
    Set<string>
  >(new Set());
  const [reviewPhases, setReviewPhases] = React.useState<ReviewPhaseNode[]>(
    [],
  );
  const [generating, setGenerating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [regeneratingId, setRegeneratingId] = React.useState<string | null>(
    null,
  );

  const features = useQuery(
    api.features.listByProject,
    open && ready
      ? {
          projectId: project._id as Id<"projects">,
        }
      : "skip",
  );

  let parsedProject: Project | null = null;
  try {
    parsedProject = JSON.parse(project.data) as Project;
  } catch {
    parsedProject = null;
  }

  const wbsPhases = (parsedProject?.project_wbs ?? [])
    .slice()
    .sort((a, b) => a.order - b.order);

  React.useEffect(() => {
    if (!open) return;
    setStep("form");
    setReviewPhases([]);
    let orders: number[] = [];
    try {
      const p = JSON.parse(project.data) as Project;
      orders = (p.project_wbs ?? []).map((ph) => ph.order);
    } catch {
      orders = [];
    }
    setSelectedPhaseOrders(new Set(orders));
  }, [open, project.data]);

  React.useEffect(() => {
    if (!open) return;
    if (features === undefined) return;
    setSelectedFeatureIds(new Set(features.map((f) => f._id as string)));
  }, [open, features]);

  const summaryLines = React.useMemo(() => {
    const featByPhase = new Map<number, number>();
    for (const f of features ?? []) {
      featByPhase.set(f.phaseOrder, (featByPhase.get(f.phaseOrder) ?? 0) + 1);
    }
    return wbsPhases.map((p) => {
      const tc = p.tasks?.length ?? 0;
      const fc = featByPhase.get(p.order) ?? 0;
      return `${p.name}: ${fc} feature(s), ${tc} task(s)`;
    });
  }, [wbsPhases, features]);

  const togglePhaseOrder = (order: number) => {
    setSelectedPhaseOrders((prev) => {
      const next = new Set(prev);
      if (next.has(order)) next.delete(order);
      else next.add(order);
      return next;
    });
  };

  const toggleFeatureId = (id: string) => {
    setSelectedFeatureIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const targetPhaseOrdersList = React.useMemo(
    () => Array.from(selectedPhaseOrders).sort((a, b) => a - b),
    [selectedPhaseOrders],
  );

  const targetFeatureKeysList = React.useMemo(() => {
    const list = features ?? [];
    return list
      .filter((f) => selectedFeatureIds.has(f._id as string))
      .map(
        (f) =>
          `${f._id}|${f.phaseOrder}|${f.name}`,
      );
  }, [features, selectedFeatureIds]);

  const handleGenerate = async () => {
    if (!ready || !parsedProject) return;
    if (
      !genPhases &&
      !genFeatures &&
      !genTasksPhases &&
      !genTasksFeatures
    ) {
      toast({
        variant: "destructive",
        title: "Select at least one item to generate.",
      });
      return;
    }
    if (
      (genFeatures || genTasksPhases || genTasksFeatures) &&
      wbsPhases.length === 0
    ) {
      toast({
        variant: "destructive",
        title: "Add at least one phase before generating features or tasks.",
      });
      return;
    }
    if (
      (genFeatures || genTasksPhases) &&
      targetPhaseOrdersList.length === 0
    ) {
      toast({
        variant: "destructive",
        title: "Select at least one target phase.",
      });
      return;
    }
    if (
      genTasksFeatures &&
      targetFeatureKeysList.length === 0
    ) {
      toast({
        variant: "destructive",
        title: "Select at least one target feature.",
      });
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/generate-project-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project._id,
          project: parsedProject,
          projectName: project.projectName,
          summaryName: project.summaryName,
          objective: project.objective,
          targetDate: project.targetDate,
          features: features ?? [],
          generatePhases: genPhases,
          generateFeatures: genFeatures,
          tasksForPhases: genTasksPhases,
          tasksForFeatures: genTasksFeatures,
          targetPhaseOrders: targetPhaseOrdersList,
          targetFeatureKeys: targetFeatureKeysList,
          additionalInstructions,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: json.error || "Generation failed",
          description: typeof json.details === "string" ? json.details : undefined,
        });
        return;
      }
      const data = json.data as IncrementalGenerationResponse | undefined;
      if (!data) {
        toast({
          variant: "destructive",
          title: "Invalid response.",
        });
        return;
      }
      const tree = buildReviewTreeFromResponse(data, parsedProject);
      if (tree.length === 0) {
        toast({
          title: "Nothing to review",
          description: "The model returned no new content. Try different options.",
        });
        return;
      }
      setReviewPhases(tree);
      setStep("review");
    } finally {
      setGenerating(false);
    }
  };

  const handleConfirmSave = async () => {
    if (!ready || !parsedProject) return;
    const payload = buildCommitPayloadFromTree(reviewPhases, parsedProject);
    const total =
      payload.newPhases.length +
      payload.newFeatures.length +
      payload.tasksForExistingPhases.length +
      payload.tasksForExistingFeatures.length;
    if (total === 0) {
      toast({
        variant: "destructive",
        title: "Nothing selected to save.",
      });
      return;
    }

    setSaving(true);
    try {
      const result = await convex.mutation(
        api.projectGeneration.commitIncrementalGeneration,
        {
          projectId: project._id as Id<"projects">,
          newPhases: payload.newPhases,
          newFeatures: payload.newFeatures,
          tasksForExistingPhases: payload.tasksForExistingPhases,
          tasksForExistingFeatures: payload.tasksForExistingFeatures,
        },
      );

      if (result.tasksAdded > 0) {
        for (const po of result.phaseOrdersWithNewTasks) {
          try {
            await convex.mutation(api.scheduling.runSchedulingEngine, {
              phaseId: `${project._id}:${po}`,
            });
          } catch {
            // continue other phases
          }
        }
      }

      const parts: string[] = [];
      if (result.phasesAdded) parts.push(`${result.phasesAdded} phase(s)`);
      if (result.featuresAdded) parts.push(`${result.featuresAdded} feature(s)`);
      if (result.tasksAdded) parts.push(`${result.tasksAdded} task(s)`);
      toast({
        title: "Created",
        description: parts.length ? parts.join(", ") : "No items created",
      });
      onOpenChange(false);
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to save generated content.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRegeneratePhase = async (phaseId: string) => {
    if (!ready || !parsedProject) return;
    const phase = reviewPhases.find((p) => p.id === phaseId);
    if (!phase) return;
    setRegeneratingId(`phase:${phaseId}`);
    try {
      const subtree = {
        name: phase.name,
        description: phase.description,
        start_date: phase.start_date,
        end_date: phase.end_date,
        unassignedTasks: phase.unassignedTasks.map((t) => ({
          name: t.name,
          description: t.description,
          date: t.date,
          time: t.time,
          endTime: t.endTime,
        })),
        features: phase.features.map((f) => ({
          name: f.name,
          description: f.description,
          tasks: f.tasks.map((t) => ({
            name: t.name,
            description: t.description,
            date: t.date,
            time: t.time,
            endTime: t.endTime,
          })),
        })),
      };
      const res = await fetch("/api/generate-project-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "regenerate",
          projectId: project._id,
          scope: "phase",
          subtree: JSON.stringify(subtree),
          additionalInstructions,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.data?.replacementPhase) {
        toast({
          variant: "destructive",
          title: json.error || "Regenerate failed",
        });
        return;
      }
      const rep = json.data.replacementPhase;
      setReviewPhases((prev) =>
        prev.map((p) =>
          p.id === phaseId
            ? {
                ...p,
                name: rep.name,
                description: rep.description,
                start_date: rep.start_date,
                end_date: rep.end_date,
                unassignedTasks: mapTasks(rep.tasks).map((t) => ({
                  ...t,
                  checked: true,
                })),
              }
            : p,
        ),
      );
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleRegenerateFeature = async (
    phaseId: string,
    featureId: string,
  ) => {
    if (!ready || !parsedProject) return;
    const phase = reviewPhases.find((p) => p.id === phaseId);
    const feature = phase?.features.find((f) => f.id === featureId);
    if (!feature) return;
    setRegeneratingId(`feature:${featureId}`);
    try {
      const subtree = {
        phaseOrder: feature.phaseOrder,
        name: feature.name,
        description: feature.description,
        tasks: feature.tasks.map((t) => ({
          name: t.name,
          description: t.description,
          date: t.date,
          time: t.time,
          endTime: t.endTime,
        })),
      };
      const res = await fetch("/api/generate-project-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "regenerate",
          projectId: project._id,
          scope: "feature",
          subtree: JSON.stringify(subtree),
          additionalInstructions,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.data?.replacementFeature) {
        toast({
          variant: "destructive",
          title: json.error || "Regenerate failed",
        });
        return;
      }
      const rep = json.data.replacementFeature;
      setReviewPhases((prev) =>
        prev.map((p) =>
          p.id === phaseId
            ? {
                ...p,
                features: p.features.map((f) =>
                  f.id === featureId
                    ? {
                        ...f,
                        name: rep.name,
                        description: rep.description,
                        tasks: mapTasks(rep.tasks).map((t) => ({
                          ...t,
                          checked: true,
                        })),
                      }
                    : f,
                ),
              }
            : p,
        ),
      );
    } finally {
      setRegeneratingId(null);
    }
  };

  const hasSelectablePhases = wbsPhases.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[min(90vh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg",
          step === "review" && "sm:max-w-2xl",
        )}
      >
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Generate Project Content</DialogTitle>
        </DialogHeader>

        {step === "form" ? (
          <ScrollArea className="max-h-[min(70vh,560px)] px-6 py-4">
            <div className="space-y-4 pr-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Current structure
                </p>
                <div className="mt-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  {summaryLines.length === 0 ? (
                    <p>No phases yet.</p>
                  ) : (
                    <ul className="list-inside list-disc space-y-1">
                      {summaryLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">What to generate</p>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={genPhases}
                    onCheckedChange={(v) => setGenPhases(v === true)}
                  />
                  Phases
                </label>
                <label
                  className={cn(
                    "flex items-center gap-2 text-sm",
                    !hasSelectablePhases && "pointer-events-none opacity-50",
                  )}
                >
                  <Checkbox
                    checked={genFeatures}
                    onCheckedChange={(v) => setGenFeatures(v === true)}
                    disabled={!hasSelectablePhases}
                  />
                  Features
                </label>
                <label
                  className={cn(
                    "flex items-center gap-2 text-sm",
                    !hasSelectablePhases && "pointer-events-none opacity-50",
                  )}
                >
                  <Checkbox
                    checked={genTasksPhases}
                    onCheckedChange={(v) => setGenTasksPhases(v === true)}
                    disabled={!hasSelectablePhases}
                  />
                  Tasks for phases
                </label>
                <label
                  className={cn(
                    "flex items-center gap-2 text-sm",
                    !hasSelectablePhases && "pointer-events-none opacity-50",
                  )}
                >
                  <Checkbox
                    checked={genTasksFeatures}
                    onCheckedChange={(v) => setGenTasksFeatures(v === true)}
                    disabled={!hasSelectablePhases}
                  />
                  Tasks for features
                </label>
              </div>

              {(genFeatures || genTasksPhases) && hasSelectablePhases && (
                <div className="space-y-2">
                  <Label>Target phases</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between font-normal"
                      >
                        {selectedPhaseOrders.size === wbsPhases.length
                          ? "All phases"
                          : `${selectedPhaseOrders.size} selected`}
                        <ChevronsUpDown className="ml-2 size-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
                      <div className="max-h-48 space-y-2 overflow-y-auto">
                        {wbsPhases.map((p) => (
                          <label
                            key={p.order}
                            className="flex cursor-pointer items-center gap-2 text-sm"
                          >
                            <Checkbox
                              checked={selectedPhaseOrders.has(p.order)}
                              onCheckedChange={() => togglePhaseOrder(p.order)}
                            />
                            <span className="truncate">{p.name}</span>
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {genTasksFeatures && hasSelectablePhases && (
                <div className="space-y-2">
                  <Label>Target features</Label>
                  {(features ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No features in this project yet.
                    </p>
                  ) : (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-between font-normal"
                        >
                          {selectedFeatureIds.size === (features ?? []).length
                            ? "All features"
                            : `${selectedFeatureIds.size} selected`}
                          <ChevronsUpDown className="ml-2 size-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[var(--radix-popover-trigger-width)] p-2"
                        align="start"
                      >
                        <div className="max-h-48 space-y-2 overflow-y-auto">
                          {(features ?? []).map((f) => {
                            const phaseName =
                              wbsPhases.find((p) => p.order === f.phaseOrder)
                                ?.name ?? `Phase ${f.phaseOrder}`;
                            return (
                              <label
                                key={f._id}
                                className="flex cursor-pointer items-center gap-2 text-sm"
                              >
                                <Checkbox
                                  checked={selectedFeatureIds.has(
                                    f._id as string,
                                  )}
                                  onCheckedChange={() =>
                                    toggleFeatureId(f._id as string)
                                  }
                                />
                                <span className="truncate">
                                  {f.name}{" "}
                                  <span className="text-muted-foreground">
                                    ({phaseName})
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="gen-extra-instructions">
                  Additional instructions (optional)
                </Label>
                <Textarea
                  id="gen-extra-instructions"
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  placeholder='e.g. "Focus on backend first"'
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="px-6 py-4">
            <GenerationReviewTree
              phases={reviewPhases}
              setPhases={setReviewPhases}
              onRegeneratePhase={handleRegeneratePhase}
              onRegenerateFeature={handleRegenerateFeature}
              regeneratingId={regeneratingId}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4">
          {step === "review" ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("form")}
                disabled={saving}
              >
                Back
              </Button>
              <Button
                type="button"
                className={projectPrimaryButtonClassName}
                disabled={saving}
                onClick={() => void handleConfirmSave()}
              >
                {saving ? "Saving…" : "Confirm save"}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={generating}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className={projectPrimaryButtonClassName}
                disabled={generating}
                onClick={() => void handleGenerate()}
              >
                {generating ? "Generating…" : "Generate"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

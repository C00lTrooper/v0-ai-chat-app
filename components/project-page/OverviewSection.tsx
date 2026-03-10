import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Users, CalendarClock, Target, Layers, Plus, Pencil, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/convex/_generated/api";
import { toast } from "@/hooks/use-toast";
import type { Id } from "@/convex/_generated/dataModel";
import type { Project } from "@/lib/project-schema";
import type { ProjectData } from "@/components/project-page/types";

type Phase = Project["project_wbs"][number];

type OverviewSectionProps = {
  project: ProjectData;
  onTargetDateChange?: (newDate: string) => void;
};

export function OverviewSection({ project, onTargetDateChange }: OverviewSectionProps) {
  const { sessionToken } = useAuth();
  const updateProject = useMutation(api.projects.update);
  const [updatingTargetDate, setUpdatingTargetDate] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => {
    if (!project.targetDate) return undefined;
    const d = new Date(project.targetDate);
    return Number.isNaN(d.getTime()) ? undefined : d;
  });

  const [editingObjective, setEditingObjective] = useState(false);
  const [objectiveDraft, setObjectiveDraft] = useState(project.objective);
  const [updatingObjective, setUpdatingObjective] = useState(false);

  const canEditTargetDate = project.isOwner && !!sessionToken;
  const canEditObjective = project.isOwner && !!sessionToken;
  const canEditFeatures = project.isOwner && !!sessionToken;
  const displayTargetDate =
    selectedDate?.toLocaleDateString() || project.targetDate || "Select date";

  const handleSelectTargetDate = async (date: Date | undefined) => {
    if (!date || !canEditTargetDate) return;
    if (!sessionToken) return;

    setUpdatingTargetDate(true);
    try {
      const iso = date.toISOString().slice(0, 10);
      await updateProject({
        token: sessionToken,
        projectId: project._id as Id<"projects">,
        targetDate: iso,
      });
      setSelectedDate(date);
      onTargetDateChange?.(iso);
      toast({ title: "Target date updated." });
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to update target date.",
      });
    } finally {
      setUpdatingTargetDate(false);
    }
  };

  let parsedProject: Project | null = null;
  try {
    if (project.data) parsedProject = JSON.parse(project.data) as Project;
  } catch {
    // data may be empty or invalid
  }

  const [features, setFeatures] = useState<Phase[]>(() =>
    parsedProject?.project_wbs
      ? [...parsedProject.project_wbs].sort((a, b) => a.order - b.order)
      : [],
  );
  const [editingFeatureIndex, setEditingFeatureIndex] = useState<number | null>(
    null,
  );
  const [featureDraftName, setFeatureDraftName] = useState("");
  const [featureDraftDescription, setFeatureDraftDescription] = useState("");
  const [updatingFeatures, setUpdatingFeatures] = useState(false);

  useEffect(() => {
    if (!parsedProject?.project_wbs?.length) {
      setFeatures([]);
      return;
    }
    setFeatures(
      [...parsedProject.project_wbs].sort((a, b) => a.order - b.order),
    );
  }, [project.data]);

  const persistFeatures = async (nextFeatures: Phase[]) => {
    if (!sessionToken || updatingFeatures) return;
    if (!parsedProject) return;
    setUpdatingFeatures(true);
    try {
      const updatedProject: Project = {
        ...parsedProject,
        project_wbs: nextFeatures.map((phase, index) => ({
          ...phase,
          order: index,
        })) as Project["project_wbs"],
      };
      await updateProject({
        token: sessionToken,
        projectId: project._id as Id<"projects">,
        data: JSON.stringify(updatedProject),
      });
      setFeatures(
        [...updatedProject.project_wbs].sort((a, b) => a.order - b.order),
      );
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to update features.",
      });
    } finally {
      setUpdatingFeatures(false);
    }
  };

  const startEditFeature = (index: number) => {
    const feature = features[index];
    setEditingFeatureIndex(index);
    setFeatureDraftName(feature?.name ?? "");
    setFeatureDraftDescription(feature?.description ?? "");
  };

  const saveFeatureEdit = async () => {
    if (editingFeatureIndex === null) return;
    const trimmedName = featureDraftName.trim();
    const trimmedDescription = featureDraftDescription.trim();
    if (!trimmedName || !trimmedDescription) return;
    const nextFeatures = features.map((f, idx) =>
      idx === editingFeatureIndex
        ? { ...f, name: trimmedName, description: trimmedDescription }
        : f,
    );
    setEditingFeatureIndex(null);
    await persistFeatures(nextFeatures);
    toast({ title: "Feature updated." });
  };

  const moveFeature = async (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= features.length) return;
    const nextFeatures = [...features];
    const [removed] = nextFeatures.splice(index, 1);
    nextFeatures.splice(newIndex, 0, removed);
    await persistFeatures(nextFeatures);
  };

  const deleteFeature = async (index: number) => {
    if (index < 0 || index >= features.length) return;
    const nextFeatures = features.filter((_, i) => i !== index);
    setEditingFeatureIndex(null);
    await persistFeatures(nextFeatures);
    toast({ title: "Feature deleted." });
  };

  const addFeature = async () => {
    if (!parsedProject) return;
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    const todayStr = today.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const newFeature: Phase = {
      order: features.length,
      name: "New feature",
      description: "Describe this feature",
      start_date: todayStr,
      end_date: endStr,
      tasks: [],
    };
    const nextFeatures = [...features, newFeature];
    await persistFeatures(nextFeatures);
    toast({ title: "Feature added." });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Project summary and key metrics
      </p>

      <div className="mt-6 flex w-full flex-col gap-4 sm:w-1/2 lg:w-1/3">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Users className="size-4" />
            Role
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {project.isOwner ? "Owner" : "Collaborator"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CalendarClock className="size-4" />
            Target Date
          </div>
          {canEditTargetDate ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="mt-2 inline-flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={updatingTargetDate}
                >
                  <span className="truncate">{displayTargetDate}</span>
                  <CalendarClock className="ml-2 size-4 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleSelectTargetDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          ) : (
            <p className="mt-2 text-sm font-semibold text-foreground">
              {project.targetDate || "Not set"}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
            <div className="flex items-center gap-2">
              <Target className="size-4" />
              Objective
            </div>
            {canEditObjective && !editingObjective && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setObjectiveDraft(project.objective);
                  setEditingObjective(true);
                }}
              >
                <Pencil className="size-4" />
                <span className="sr-only">Edit objective</span>
              </Button>
            )}
          </div>
          {canEditObjective && editingObjective ? (
            <div className="mt-2 space-y-2">
              <textarea
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={objectiveDraft}
                onChange={(e) => setObjectiveDraft(e.target.value)}
                placeholder="Describe the project objective"
                disabled={updatingObjective}
                rows={Math.min(
                  4,
                  Math.max(2, (objectiveDraft.match(/\n/g)?.length ?? 0) + 1),
                )}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setObjectiveDraft(project.objective);
                    setEditingObjective(false);
                  }}
                  disabled={updatingObjective}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!sessionToken || updatingObjective) return;
                    setUpdatingObjective(true);
                    try {
                      await updateProject({
                        token: sessionToken,
                        projectId: project._id as Id<"projects">,
                        objective: objectiveDraft,
                      });
                      toast({ title: "Objective updated." });
                      setEditingObjective(false);
                    } catch {
                      toast({
                        variant: "destructive",
                        title: "Failed to update objective.",
                      });
                    } finally {
                      setUpdatingObjective(false);
                    }
                  }}
                >
                  {updatingObjective ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-foreground">
              {objectiveDraft || "No objective yet"}
            </p>
          )}
        </div>
      </div>

      {features.length ? (
        <div className="mt-6 w-full">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
              <div className="flex items-center gap-2">
                <Layers className="size-4" />
                High-level features
              </div>
              {canEditFeatures && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={addFeature}
                  disabled={updatingFeatures}
                >
                  <Plus className="mr-1 size-3" />
                  Add feature
                </Button>
              )}
            </div>
            <div className="mt-2">
              <Table className="text-sm">
                <TableBody>
                  {features.map((phase, index) => {
                    const isEditing = editingFeatureIndex === index;
                    return (
                      <TableRow key={index}>
                        <TableCell className="w-28 align-top text-xs font-medium text-muted-foreground">
                          Feature {index + 1}
                        </TableCell>
                        <TableCell className="align-top">
                          {canEditFeatures && isEditing ? (
                            <div className="space-y-2">
                              <Input
                                value={featureDraftName}
                                onChange={(e) =>
                                  setFeatureDraftName(e.target.value)
                                }
                                placeholder="Feature name"
                                className="h-8 text-sm"
                                disabled={updatingFeatures}
                              />
                              <textarea
                                className="w-full resize-none rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={featureDraftDescription}
                                onChange={(e) =>
                                  setFeatureDraftDescription(e.target.value)
                                }
                                rows={3}
                                disabled={updatingFeatures}
                              />
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => setEditingFeatureIndex(null)}
                                  disabled={updatingFeatures}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={saveFeatureEdit}
                                  disabled={updatingFeatures}
                                >
                                  Save
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="font-medium">{phase.name}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {phase.description}
                              </div>
                            </>
                          )}
                        </TableCell>
                        <TableCell className="w-32 align-top text-right">
                          {canEditFeatures && !isEditing && (
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground hover:text-foreground"
                                onClick={() => moveFeature(index, -1)}
                                disabled={index === 0 || updatingFeatures}
                              >
                                <ChevronUp className="size-3" />
                                <span className="sr-only">Move up</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground hover:text-foreground"
                                onClick={() => moveFeature(index, 1)}
                                disabled={
                                  index === features.length - 1 ||
                                  updatingFeatures
                                }
                              >
                                <ChevronDown className="size-3" />
                                <span className="sr-only">Move down</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground hover:text-foreground"
                                onClick={() => startEditFeature(index)}
                                disabled={updatingFeatures}
                              >
                                <Pencil className="size-3" />
                                <span className="sr-only">Edit feature</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => void deleteFeature(index)}
                                disabled={updatingFeatures}
                              >
                                <Trash2 className="size-3" />
                                <span className="sr-only">Delete feature</span>
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


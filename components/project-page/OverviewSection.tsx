import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import {
  Users,
  CalendarClock,
  Target,
  Layers,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

export function OverviewSection({
  project,
  onTargetDateChange,
}: OverviewSectionProps) {
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
      ? [...parsedProject.project_wbs].sort((a, b) =>
          a.start_date.localeCompare(b.start_date),
        )
      : [],
  );
  const [editingFeatureIndex, setEditingFeatureIndex] = useState<number | null>(
    null,
  );
  const [featureDraftName, setFeatureDraftName] = useState("");
  const [featureDraftDescription, setFeatureDraftDescription] = useState("");
  const [featureDraftStart, setFeatureDraftStart] = useState("");
  const [featureDraftEnd, setFeatureDraftEnd] = useState("");
  const [phaseStartPickerOpen, setPhaseStartPickerOpen] = useState(false);
  const [phaseEndPickerOpen, setPhaseEndPickerOpen] = useState(false);
  const [deletePhaseIndex, setDeletePhaseIndex] = useState<number | null>(null);
  const [updatingFeatures, setUpdatingFeatures] = useState(false);

  const parsePhaseDate = (s: string): Date | undefined => {
    const trimmed = s?.trim();
    if (!trimmed) return undefined;
    const withNoon = trimmed.includes("T") ? trimmed : `${trimmed}T12:00:00`;
    const d = new Date(withNoon);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  const toLocalYYYYMMDD = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  useEffect(() => {
    if (!parsedProject?.project_wbs?.length) {
      setFeatures([]);
      return;
    }
    setFeatures(
      [...parsedProject.project_wbs].sort((a, b) =>
        a.start_date.localeCompare(b.start_date),
      ),
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
        [...updatedProject.project_wbs].sort((a, b) =>
          a.start_date.localeCompare(b.start_date),
        ),
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
    setFeatureDraftStart(feature?.start_date ?? "");
    setFeatureDraftEnd(feature?.end_date ?? "");
  };

  const saveFeatureEdit = async () => {
    if (editingFeatureIndex === null) return;
    const trimmedName = featureDraftName.trim();
    const trimmedDescription = featureDraftDescription.trim();
    const trimmedStart = featureDraftStart.trim();
    const trimmedEnd = featureDraftEnd.trim();
    if (!trimmedName || !trimmedDescription || !trimmedStart || !trimmedEnd) {
      toast({
        variant: "destructive",
        title: "Name, description, and start/end dates are required.",
      });
      return;
    }
    const startDate = parsePhaseDate(trimmedStart);
    const endDate = parsePhaseDate(trimmedEnd);
    if (!startDate || !endDate) {
      toast({
        variant: "destructive",
        title: "Start and end dates must be valid.",
      });
      return;
    }
    if (endDate < startDate) {
      toast({
        variant: "destructive",
        title: "End date must be on or after start date.",
      });
      return;
    }
    const isoStart = toLocalYYYYMMDD(startDate);
    const isoEnd = toLocalYYYYMMDD(endDate);
    const nextFeatures = features.map((f, idx) =>
      idx === editingFeatureIndex
        ? {
            ...f,
            name: trimmedName,
            description: trimmedDescription,
            start_date: isoStart,
            end_date: isoEnd,
          }
        : f,
    );
    setEditingFeatureIndex(null);
    setPhaseStartPickerOpen(false);
    setPhaseEndPickerOpen(false);
    await persistFeatures(nextFeatures);
    toast({ title: "Phase updated." });
  };

  const deleteFeature = async (index: number) => {
    if (index < 0 || index >= features.length) return;
    const nextFeatures = features.filter((_, i) => i !== index);
    setEditingFeatureIndex(null);
    setDeletePhaseIndex(null);
    await persistFeatures(nextFeatures);
    toast({ title: "Phase deleted." });
  };

  const phaseToDelete =
    deletePhaseIndex != null ? features[deletePhaseIndex] : null;

  const addFeature = async () => {
    if (!parsedProject) return;
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    const todayStr = today.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const newFeature: Phase = {
      order: features.length,
      name: "New phase",
      description: "Describe this phase",
      start_date: todayStr,
      end_date: endStr,
      tasks: [],
    };
    const nextFeatures = [...features, newFeature];
    await persistFeatures(nextFeatures);
    toast({ title: "Phase added." });
  };

  return (
    <div className="min-w-0">
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Overview</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Project summary and key metrics
      </p>

      <div className="mt-4 flex w-full flex-col gap-3 sm:mt-6 sm:w-1/2 sm:gap-4 lg:w-1/3">
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Users className="size-4 shrink-0" />
            Role
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {project.isOwner ? "Owner" : "Collaborator"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CalendarClock className="size-4 shrink-0" />
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

        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
            <div className="flex min-w-0 items-center gap-2">
              <Target className="size-4 shrink-0" />
              <span className="truncate">Objective</span>
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
        <div className="mt-4 w-full min-w-0 sm:mt-6">
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
              <div className="flex items-center gap-2">
                <Layers className="size-4 shrink-0" />
                Project Phases
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
                  Add phase
                </Button>
              )}
            </div>
            {/* Stacked phase cards: use for small/medium viewports to avoid cramped table */}
            <div className="mt-2 space-y-2 lg:hidden">
              {features.map((phase, index) => {
                const isEditing = editingFeatureIndex === index;
                return (
                  <div
                    key={index}
                    className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm"
                  >
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Phase {index + 1}
                    </p>
                    {canEditFeatures && isEditing ? (
                      <div className="mt-2 space-y-2">
                        <Input
                          value={featureDraftName}
                          onChange={(e) =>
                            setFeatureDraftName(e.target.value)
                          }
                          placeholder="Phase name"
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
                        <div className="grid gap-2 text-xs text-muted-foreground">
                          <div className="flex flex-col gap-1">
                            <span>Start date</span>
                            <Popover
                              open={phaseStartPickerOpen}
                              onOpenChange={(open) => {
                                setPhaseStartPickerOpen(open);
                                if (open) setPhaseEndPickerOpen(false);
                              }}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 w-full justify-start text-left font-normal text-xs"
                                  disabled={updatingFeatures}
                                >
                                  <CalendarClock className="mr-2 size-3.5 shrink-0 text-muted-foreground" />
                                  {parsePhaseDate(featureDraftStart)
                                    ? parsePhaseDate(
                                        featureDraftStart,
                                      )!.toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                      })
                                    : "Pick start date"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="w-auto p-3">
                                <div className="space-y-3">
                                  <span className="text-xs font-medium text-muted-foreground">
                                    Pick start date
                                  </span>
                                  <Calendar
                                    mode="single"
                                    selected={parsePhaseDate(featureDraftStart)}
                                    onSelect={(d) => {
                                      if (d) {
                                        setFeatureDraftStart(toLocalYYYYMMDD(d));
                                        setPhaseStartPickerOpen(false);
                                      }
                                    }}
                                    initialFocus
                                  />
                                  <div className="flex justify-end pt-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="xs"
                                      className="h-7 px-2 text-[11px]"
                                      onClick={() => {
                                        setFeatureDraftStart(
                                          toLocalYYYYMMDD(new Date()),
                                        );
                                        setPhaseStartPickerOpen(false);
                                      }}
                                      disabled={updatingFeatures}
                                    >
                                      Today
                                    </Button>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span>End date</span>
                            <Popover
                              open={phaseEndPickerOpen}
                              onOpenChange={(open) => {
                                setPhaseEndPickerOpen(open);
                                if (open) setPhaseStartPickerOpen(false);
                              }}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 w-full justify-start text-left font-normal text-xs"
                                  disabled={updatingFeatures}
                                >
                                  <CalendarClock className="mr-2 size-3.5 shrink-0 text-muted-foreground" />
                                  {parsePhaseDate(featureDraftEnd)
                                    ? parsePhaseDate(
                                        featureDraftEnd,
                                      )!.toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                      })
                                    : "Pick end date"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="w-auto p-3">
                                <div className="space-y-3">
                                  <span className="text-xs font-medium text-muted-foreground">
                                    Pick end date
                                  </span>
                                  <Calendar
                                    mode="single"
                                    selected={parsePhaseDate(featureDraftEnd)}
                                    onSelect={(d) => {
                                      if (d) {
                                        setFeatureDraftEnd(toLocalYYYYMMDD(d));
                                        setPhaseEndPickerOpen(false);
                                      }
                                    }}
                                    initialFocus
                                  />
                                  <div className="flex justify-end pt-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="xs"
                                      className="h-7 px-2 text-[11px]"
                                      onClick={() => {
                                        setFeatureDraftEnd(
                                          toLocalYYYYMMDD(new Date()),
                                        );
                                        setPhaseEndPickerOpen(false);
                                      }}
                                      disabled={updatingFeatures}
                                    >
                                      Today
                                    </Button>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              setEditingFeatureIndex(null);
                              setPhaseStartPickerOpen(false);
                              setPhaseEndPickerOpen(false);
                            }}
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
                        <p className="mt-0.5 font-medium text-foreground">
                          {phase.name}
                        </p>
                        {phase.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                            {phase.description}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {phase.start_date} → {phase.end_date}
                        </p>
                        {canEditFeatures && (
                          <div className="mt-2 flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => startEditFeature(index)}
                              disabled={updatingFeatures}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={() => setDeletePhaseIndex(index)}
                              disabled={updatingFeatures}
                            >
                              Delete
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Desktop: table (only when enough width) */}
            <div className="mt-2 hidden min-w-0 overflow-x-auto lg:block">
              <Table className="text-sm">
                <TableBody>
                  {features.map((phase, index) => {
                    const isEditing = editingFeatureIndex === index;
                    return (
                      <TableRow key={index}>
                        <TableCell className="w-28 align-top text-xs font-medium text-muted-foreground">
                          Phase {index + 1}
                        </TableCell>
                        <TableCell className="min-w-0 align-top">
                          {canEditFeatures && isEditing ? (
                            <div className="min-w-0 space-y-2">
                              <Input
                                value={featureDraftName}
                                onChange={(e) =>
                                  setFeatureDraftName(e.target.value)
                                }
                                placeholder="Phase name"
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
                              <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground min-[800px]:grid-cols-2">
                                <div className="flex min-w-0 flex-col gap-1">
                                  <span>Start date</span>
                                  <Popover
                                    open={phaseStartPickerOpen}
                                    onOpenChange={(open) => {
                                      setPhaseStartPickerOpen(open);
                                      if (open) setPhaseEndPickerOpen(false);
                                    }}
                                  >
                                    <PopoverTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="h-8 w-full min-w-0 justify-start text-left font-normal text-xs"
                                        disabled={updatingFeatures}
                                      >
                                        <CalendarClock className="mr-2 size-3.5 shrink-0 text-muted-foreground" />
                                        {parsePhaseDate(featureDraftStart)
                                          ? parsePhaseDate(
                                              featureDraftStart,
                                            )!.toLocaleDateString("en-US", {
                                              month: "short",
                                              day: "numeric",
                                              year: "numeric",
                                            })
                                          : "Pick start date"}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="start">
                                      <div className="space-y-3">
                                        <span className="text-xs font-medium text-muted-foreground">
                                          Pick start date
                                        </span>
                                        <Calendar
                                          mode="single"
                                          selected={parsePhaseDate(
                                            featureDraftStart,
                                          )}
                                          onSelect={(d) => {
                                            if (d) {
                                              setFeatureDraftStart(
                                                toLocalYYYYMMDD(d),
                                              );
                                              setPhaseStartPickerOpen(false);
                                            }
                                          }}
                                          initialFocus
                                        />
                                        <div className="flex justify-end gap-2 pt-1">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="xs"
                                            className="h-7 px-2 text-[11px]"
                                            onClick={() => {
                                              setFeatureDraftStart(
                                                toLocalYYYYMMDD(new Date()),
                                              );
                                              setPhaseStartPickerOpen(false);
                                            }}
                                            disabled={updatingFeatures}
                                          >
                                            Today
                                          </Button>
                                        </div>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </div>
                                <div className="flex min-w-0 flex-col gap-1">
                                  <span>End date</span>
                                  <Popover
                                    open={phaseEndPickerOpen}
                                    onOpenChange={(open) => {
                                      setPhaseEndPickerOpen(open);
                                      if (open) setPhaseStartPickerOpen(false);
                                    }}
                                  >
                                    <PopoverTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="h-8 w-full min-w-0 justify-start text-left font-normal text-xs"
                                        disabled={updatingFeatures}
                                      >
                                        <CalendarClock className="mr-2 size-3.5 shrink-0 text-muted-foreground" />
                                        {parsePhaseDate(featureDraftEnd)
                                          ? parsePhaseDate(
                                              featureDraftEnd,
                                            )!.toLocaleDateString("en-US", {
                                              month: "short",
                                              day: "numeric",
                                              year: "numeric",
                                            })
                                          : "Pick end date"}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="start">
                                      <div className="space-y-3">
                                        <span className="text-xs font-medium text-muted-foreground">
                                          Pick end date
                                        </span>
                                        <Calendar
                                          mode="single"
                                          selected={parsePhaseDate(
                                            featureDraftEnd,
                                          )}
                                          onSelect={(d) => {
                                            if (d) {
                                              setFeatureDraftEnd(
                                                toLocalYYYYMMDD(d),
                                              );
                                              setPhaseEndPickerOpen(false);
                                            }
                                          }}
                                          initialFocus
                                        />
                                        <div className="flex justify-end gap-2 pt-1">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="xs"
                                            className="h-7 px-2 text-[11px]"
                                            onClick={() => {
                                              setFeatureDraftEnd(
                                                toLocalYYYYMMDD(new Date()),
                                              );
                                              setPhaseEndPickerOpen(false);
                                            }}
                                            disabled={updatingFeatures}
                                          >
                                            Today
                                          </Button>
                                        </div>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => {
                                    setEditingFeatureIndex(null);
                                    setPhaseStartPickerOpen(false);
                                    setPhaseEndPickerOpen(false);
                                  }}
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
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                {phase.start_date} → {phase.end_date}
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
                                onClick={() => setDeletePhaseIndex(index)}
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

      <AlertDialog
        open={deletePhaseIndex !== null}
        onOpenChange={(open) => !open && setDeletePhaseIndex(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete phase</AlertDialogTitle>
            <AlertDialogDescription>
              {phaseToDelete ? (
                <>
                  Are you sure you want to delete{" "}
                  <span className="font-medium text-foreground">
                    {phaseToDelete.name}
                  </span>
                  ? This cannot be undone.
                </>
              ) : (
                "Are you sure you want to delete this phase? This cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletePhaseIndex(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deletePhaseIndex != null && void deleteFeature(deletePhaseIndex)
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

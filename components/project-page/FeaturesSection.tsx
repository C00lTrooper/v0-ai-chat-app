"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  Layers,
  MoreVertical,
  Plus,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Project } from "@/lib/project-schema";
import type { ProjectData } from "@/components/project-page/types";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { convexClient } from "@/lib/convex";

type FeaturesSectionProps = {
  project: ProjectData;
};

type ParsedPhase = Project["project_wbs"][number];

export function FeaturesSection({ project }: FeaturesSectionProps) {
  const { sessionToken } = useAuth();
  const [parsedProject, phases] = useMemo(() => {
    try {
      const parsed = JSON.parse(project.data) as Project;
      const sorted =
        parsed.project_wbs?.slice().sort((a, b) => a.order - b.order) ?? [];
      return [parsed, sorted] as const;
    } catch {
      return [null, [] as ParsedPhase[]] as const;
    }
  }, [project.data]);

  const features = useQuery(
    api.features.listByProject,
    sessionToken
      ? { token: sessionToken, projectId: project._id as Id<"projects"> }
      : "skip",
  );

  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(
    () => new Set(phases.map((p) => p.order)),
  );

  const [newFeaturePhase, setNewFeaturePhase] = useState<number | null>(null);
  const [newFeatureName, setNewFeatureName] = useState("");
  const [newFeatureDescription, setNewFeatureDescription] = useState("");
  const [taskPickerOpenFor, setTaskPickerOpenFor] = useState<string | null>(null);
  const [taskSearch, setTaskSearch] = useState("");
  const [searchAllTasks, setSearchAllTasks] = useState(false);
  const [expandedTaskLists, setExpandedTaskLists] = useState<Set<string>>(
    () => new Set(),
  );
  const [featureToDelete, setFeatureToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteFeatureStep, setDeleteFeatureStep] = useState<
    "choose" | "confirm_delete_tasks" | null
  >(null);

  const [featureToEditId, setFeatureToEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPhaseOrder, setEditPhaseOrder] = useState<number | null>(null);
  const [editTaskPickerOpen, setEditTaskPickerOpen] = useState(false);
  const [editTaskSearch, setEditTaskSearch] = useState("");
  const [editSearchAllTasks, setEditSearchAllTasks] = useState(false);
  const [optimisticallyHiddenTasks, setOptimisticallyHiddenTasks] = useState<
    Set<string>
  >(() => new Set());

  const groupedByPhase = useMemo(() => {
    const map = new Map<number, typeof features>();
    if (!features) return map;
    for (const f of features) {
      const list = map.get(f.phaseOrder) ?? [];
      list.push(f);
      map.set(f.phaseOrder, list);
    }
    for (const [key, list] of map) {
      list.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
      map.set(key, list);
    }
    return map;
  }, [features]);

  const allTasksForProject = useQuery(
    api.features.listTasksForProject,
    sessionToken
      ? { token: sessionToken, projectId: project._id as Id<"projects"> }
      : "skip",
  );

  const handleTogglePhase = (order: number) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(order)) {
        next.delete(order);
      } else {
        next.add(order);
      }
      return next;
    });
  };

  const toggleTaskListExpanded = (featureId: string) => {
    setExpandedTaskLists((prev) => {
      const next = new Set(prev);
      if (next.has(featureId)) {
        next.delete(featureId);
      } else {
        next.add(featureId);
      }
      return next;
    });
  };

  const openNewFeatureModal = (phaseOrder: number) => {
    setNewFeaturePhase(phaseOrder);
    setNewFeatureName("");
    setNewFeatureDescription("");
  };

  const closeNewFeatureModal = () => {
    setNewFeaturePhase(null);
  };

  const handleCreateFeature = async () => {
    if (
      !sessionToken ||
      !convexClient ||
      newFeaturePhase === null ||
      !newFeatureName.trim() ||
      !newFeatureDescription.trim()
    ) {
      return;
    }

    await convexClient.mutation(api.features.create, {
      token: sessionToken,
      projectId: project._id as Id<"projects">,
      phaseOrder: newFeaturePhase,
      name: newFeatureName.trim(),
      description: newFeatureDescription.trim(),
    });

    closeNewFeatureModal();
  };

  const editingFeature = useMemo(() => {
    if (!features || !featureToEditId) return null;
    return (
      features.find((f) => (f._id as string) === featureToEditId) ?? null
    );
  }, [features, featureToEditId]);

  const editingFeatureTasks = useMemo(() => {
    if (!allTasksForProject || !featureToEditId) return [];
    const tasks = allTasksForProject
      .filter(
        (t) => t.featureId === featureToEditId || t.featureId === (featureToEditId as unknown),
      )
      .slice()
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? -1 : 1;
        const da = a.date || "9999-12-31";
        const db = b.date || "9999-12-31";
        if (da !== db) return da.localeCompare(db);
        const ta = (a.time as string | null) || "23:59";
        const tb = (b.time as string | null) || "23:59";
        return ta.localeCompare(tb);
      });

    return tasks.filter(
      (t) => !optimisticallyHiddenTasks.has(`${t.phaseOrder}:${t.taskOrder}`),
    );
  }, [allTasksForProject, featureToEditId, optimisticallyHiddenTasks]);

  const openEditModal = (feature: { _id: string; name: string; description: string; phaseOrder: number; }) => {
    setFeatureToEditId(feature._id);
    setEditName(feature.name);
    setEditDescription(feature.description);
    setEditPhaseOrder(feature.phaseOrder);
    setEditTaskPickerOpen(false);
    setEditTaskSearch("");
    setEditSearchAllTasks(false);
    setOptimisticallyHiddenTasks(new Set());
  };

  const closeEditModal = () => {
    setFeatureToEditId(null);
    setEditName("");
    setEditDescription("");
    setEditPhaseOrder(null);
    setEditTaskPickerOpen(false);
    setEditTaskSearch("");
    setEditSearchAllTasks(false);
    setOptimisticallyHiddenTasks(new Set());
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Features</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Capture key capabilities between phases and tasks.
          </p>
        </div>
      </div>

      {!parsedProject || phases.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No phases yet</p>
          <p className="mt-1 text-xs">
            Start by defining project phases in the Overview tab, or use the sidebar
            generator to create a draft plan. Once phases exist, you&apos;ll be able
            to organize features by phase here.
          </p>
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {phases.map((phase) => {
          const phaseFeatures = groupedByPhase.get(phase.order) ?? [];
          const isExpanded = expandedPhases.has(phase.order);

          return (
            <div
              key={phase.order}
              className="rounded-xl border border-border bg-card"
            >
              <div
                role="button"
                aria-expanded={isExpanded}
                tabIndex={0}
                onClick={() => handleTogglePhase(phase.order)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleTogglePhase(phase.order);
                  }
                }}
                className="flex w-full items-center justify-between gap-2 rounded-t-xl px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                  <Layers className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{phase.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {phaseFeatures.length} feature
                    {phaseFeatures.length === 1 ? "" : "s"}
                  </span>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  className="text-[11px] px-2 py-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    openNewFeatureModal(phase.order);
                  }}
                >
                  <Plus className="mr-1.5 size-3" />
                  Add feature
                </Button>
              </div>
              {isExpanded && (
                <div className="space-y-3 border-t border-border px-4 py-3">
                  {phase.description ? (
                    <p className="text-xs text-muted-foreground">
                      {phase.description}
                    </p>
                  ) : null}
                  {phaseFeatures.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No features defined for this phase yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {phaseFeatures.map((f) => {
                        const featureTasks =
                          allTasksForProject
                            ?.filter(
                              (t) =>
                                t.featureId === (f._id as string) ||
                                t.featureId === f._id,
                            )
                            .slice()
                            .sort((a, b) => {
                              if (a.completed !== b.completed) {
                                // Completed tasks first
                                return a.completed ? -1 : 1;
                              }
                              const da = a.date || "9999-12-31";
                              const db = b.date || "9999-12-31";
                              if (da !== db) {
                                // Earlier dates (more urgent) first
                                return da.localeCompare(db);
                              }
                              const ta = (a.time as string | null) || "23:59";
                              const tb = (b.time as string | null) || "23:59";
                              return ta.localeCompare(tb);
                            }) ?? [];
                        const completedCount = featureTasks.filter(
                          (t) => t.completed,
                        ).length;
                        const totalCount = featureTasks.length;
                        const pct =
                          totalCount > 0
                            ? Math.round((completedCount / totalCount) * 100)
                            : 0;

                        const baseTasks = allTasksForProject ?? [];
                        const availableTasks = searchAllTasks
                          ? baseTasks
                          : baseTasks.filter((t) => {
                              const inSamePhase = t.phaseOrder === f.phaseOrder;
                              const isLinkedToThis =
                                t.featureId === (f._id as string) ||
                                t.featureId === f._id;
                              const isUnassigned = t.featureId === null;
                              return inSamePhase && (isLinkedToThis || isUnassigned);
                            });

                        const filteredTasks = availableTasks.filter((t) => {
                          if (!taskSearch.trim()) return true;
                          const q = taskSearch.toLowerCase();
                          return (
                            t.title.toLowerCase().includes(q) ||
                            t.phaseName.toLowerCase().includes(q)
                          );
                        });

                        const isPickerOpen = taskPickerOpenFor === f._id;
                        const showAllTasks =
                          expandedTaskLists.has(f._id as string);
                        const visibleFeatureTasks = showAllTasks
                          ? featureTasks
                          : featureTasks.slice(0, 5);

                        const toggleTaskLink = async (task: {
                          phaseOrder: number;
                          taskOrder: number;
                          featureId: string | null;
                        }) => {
                          if (!sessionToken || !convexClient) return;
                          if (
                            task.featureId === (f._id as string) ||
                            task.featureId === f._id
                          ) {
                            await convexClient.mutation(
                              api.features.unlinkTaskFromFeature,
                              {
                                token: sessionToken,
                                projectId: project._id as Id<"projects">,
                                phaseOrder: task.phaseOrder,
                                taskOrder: task.taskOrder,
                              },
                            );
                          } else {
                            await convexClient.mutation(
                              api.features.linkTaskToFeature,
                              {
                                token: sessionToken,
                                projectId: project._id as Id<"projects">,
                                phaseOrder: task.phaseOrder,
                                taskOrder: task.taskOrder,
                                featureId: f._id as Id<"features">,
                              },
                            );
                          }
                        };

                        const toggleTaskCompleted = async (task: {
                          phaseOrder: number;
                          taskOrder: number;
                          completed: boolean;
                        }) => {
                          if (!sessionToken || !convexClient) return;
                          await convexClient.mutation(
                            api.aiTools.updateTaskStatus,
                            {
                              token: sessionToken,
                              projectId: project._id as Id<"projects">,
                              phaseOrder: task.phaseOrder,
                              taskOrder: task.taskOrder,
                              completed: !task.completed,
                            },
                          );
                        };

                        return (
                          <Card
                            key={f._id}
                            className="border-border/70 bg-muted/30 p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-semibold">
                                    {f.name}
                                  </span>
                                  <BadgeCheck className="size-3 text-emerald-500" />
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {f.description}
                                </p>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  >
                                    <MoreVertical className="size-4" />
                                    <span className="sr-only">Open menu</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() =>
                                      openEditModal({
                                        _id: f._id as string,
                                        name: f.name,
                                        description: f.description,
                                        phaseOrder: f.phaseOrder,
                                      })
                                    }
                                  >
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() =>
                                      setFeatureToDelete({
                                        id: f._id as string,
                                        name: f.name,
                                      })
                                    }
                                  >
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>
                                  {completedCount}/{totalCount} tasks
                                </span>
                                <Progress
                                  value={pct}
                                  className="h-1.5 w-24 bg-muted"
                                />
                                <span>{pct}%</span>
                              </div>
                              <Popover
                                open={isPickerOpen}
                                onOpenChange={(open) => {
                                  setTaskPickerOpenFor(open ? (f._id as string) : null);
                                  if (!open) {
                                    setTaskSearch("");
                                    setSearchAllTasks(false);
                                  }
                                }}
                              >
                                <PopoverTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1.5 px-3 py-1.5"
                                  >
                                    <span className="text-xs sm:text-sm">
                                      Add tasks
                                    </span>
                                    <ChevronDown className="size-4" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                  align="end"
                                  className="w-72 p-2 space-y-2"
                                >
                                  <Input
                                    placeholder="Search tasks..."
                                    value={taskSearch}
                                    onChange={(e) => setTaskSearch(e.target.value)}
                                    className="h-8 text-xs"
                                  />
                                  <div className="flex items-center justify-between gap-2 px-0.5 pt-1">
                                    <span className="text-[10px] text-muted-foreground">
                                      Showing{" "}
                                      {searchAllTasks
                                        ? "all project tasks"
                                        : "unassigned & linked tasks"}
                                    </span>
                                    <button
                                      type="button"
                                      className="text-[10px] font-medium text-primary hover:underline"
                                      onClick={() =>
                                        setSearchAllTasks((prev) => !prev)
                                      }
                                    >
                                      {searchAllTasks ? "Limit to feature scope" : "Search all tasks"}
                                    </button>
                                  </div>
                                  <div className="max-h-64 space-y-1 overflow-y-auto pt-1">
                                    {filteredTasks.length === 0 ? (
                                      <p className="px-1 py-2 text-xs text-muted-foreground">
                                        No matching tasks.
                                      </p>
                                    ) : (
                                      filteredTasks.map((task) => {
                                        const checked =
                                          task.featureId === (f._id as string) ||
                                          task.featureId === f._id;
                                        return (
                                          <div
                                            key={`${task.phaseOrder}:${task.taskOrder}`}
                                            role="button"
                                            tabIndex={0}
                                            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted"
                                            onClick={() => toggleTaskLink(task)}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                toggleTaskLink(task);
                                              }
                                            }}
                                          >
                                            <Checkbox
                                              checked={checked}
                                              className="h-3.5 w-3.5"
                                            />
                                            <div className="flex flex-col">
                                              <span className="font-medium">
                                                {task.title}
                                              </span>
                                              <span className="text-[10px] text-muted-foreground">
                                                {task.phaseName}
                                                {task.date
                                                  ? ` • ${task.date}`
                                                  : null}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>
                            {featureTasks.length > 0 && (
                              <div className="mt-3 space-y-1.5">
                                {visibleFeatureTasks.map((task) => {
                                  const completed = task.completed;
                                  const hasTime =
                                    (task.time ?? null) !== null ||
                                    (task.endTime ?? null) !== null;
                                  const timeLabel = hasTime
                                    ? task.endTime
                                      ? `${task.time} – ${task.endTime}`
                                      : task.time
                                    : null;
                                  const metaLabel =
                                    task.date || timeLabel
                                      ? [task.date, timeLabel]
                                          .filter(Boolean)
                                          .join(" · ")
                                      : null;

                                  return (
                                    <div
                                      key={`feature-task-${task.phaseOrder}:${task.taskOrder}`}
                                      className="flex items-center justify-between gap-2 rounded-md bg-background/40 px-2 py-1.5 text-xs"
                                    >
                                      <div className="flex items-center gap-2">
                                        <Checkbox
                                          checked={completed}
                                          className="h-3.5 w-3.5"
                                          onCheckedChange={() =>
                                            toggleTaskCompleted({
                                              phaseOrder: task.phaseOrder,
                                              taskOrder: task.taskOrder,
                                              completed,
                                            })
                                          }
                                        />
                                        <div className="flex flex-col">
                                          <span
                                            className={
                                              completed
                                                ? "line-through text-muted-foreground"
                                                : ""
                                            }
                                          >
                                            {task.title}
                                          </span>
                                          {metaLabel && (
                                            <span className="text-[10px] text-muted-foreground">
                                              {metaLabel}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <Badge
                                        variant={completed ? "outline" : "secondary"}
                                        className="h-5 px-1.5 text-[10px]"
                                      >
                                        {completed ? "Done" : "Planned"}
                                      </Badge>
                                    </div>
                                  );
                                })}
                                {featureTasks.length > 5 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleTaskListExpanded(f._id as string)
                                    }
                                    className="mt-0.5 text-[11px] font-medium text-primary hover:underline"
                                  >
                                    {showAllTasks
                                      ? "Show less"
                                      : `Show ${featureTasks.length - 5} more`}
                                  </button>
                                )}
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={newFeaturePhase !== null} onOpenChange={closeNewFeatureModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Feature</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              placeholder="Feature name"
              value={newFeatureName}
              onChange={(e) => setNewFeatureName(e.target.value)}
            />
            <Textarea
              rows={5}
              placeholder="Detailed description (multi-sentence, explain scope and outcome)"
              value={newFeatureDescription}
              onChange={(e) => setNewFeatureDescription(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeNewFeatureModal}>
              Cancel
            </Button>
            <Button onClick={handleCreateFeature} disabled={!sessionToken}>
              Create Feature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={featureToEditId !== null}
        onOpenChange={(open) => {
          if (!open) closeEditModal();
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Feature</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-3">
              <Input
                className="h-11 text-lg font-semibold"
                placeholder="Feature name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Phase
                </span>
                <Select
                  value={editPhaseOrder === null ? "" : String(editPhaseOrder)}
                  onValueChange={async (v) => {
                    const next = Number(v);
                    setEditPhaseOrder(next);
                    if (!sessionToken || !convexClient || !featureToEditId) return;
                    await convexClient.mutation(api.features.movePhase, {
                      token: sessionToken,
                      featureId: featureToEditId as Id<"features">,
                      phaseOrder: next,
                    });
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[340px]">
                    <SelectValue placeholder="Select a phase" />
                  </SelectTrigger>
                  <SelectContent>
                    {phases.map((p) => (
                      <SelectItem key={p.order} value={String(p.order)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">
                Description
              </span>
              <Textarea
                rows={5}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Describe the feature..."
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Tasks Overview</div>
                  <div className="text-xs text-muted-foreground">
                    Tasks currently linked to this feature
                  </div>
                </div>
                <Popover
                  open={editTaskPickerOpen}
                  onOpenChange={(open) => {
                    setEditTaskPickerOpen(open);
                    if (!open) {
                      setEditTaskSearch("");
                      setEditSearchAllTasks(false);
                    }
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Plus className="size-4" />
                      Add Tasks
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-2 space-y-2">
                    <Input
                      placeholder="Search tasks..."
                      value={editTaskSearch}
                      onChange={(e) => setEditTaskSearch(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <div className="flex items-center justify-between gap-2 px-0.5 pt-1">
                      <span className="text-[10px] text-muted-foreground">
                        Showing{" "}
                        {editSearchAllTasks
                          ? "all project tasks"
                          : "unassigned & linked tasks"}
                      </span>
                      <button
                        type="button"
                        className="text-[10px] font-medium text-primary hover:underline"
                        onClick={() => setEditSearchAllTasks((prev) => !prev)}
                      >
                        {editSearchAllTasks
                          ? "Limit to feature scope"
                          : "Search all tasks"}
                      </button>
                    </div>
                    <div className="max-h-64 space-y-1 overflow-y-auto pt-1">
                      {(() => {
                        const baseTasks = allTasksForProject ?? [];
                        const featureId = featureToEditId;
                        if (!featureId || !editingFeature) return null;

                        const availableTasks = editSearchAllTasks
                          ? baseTasks
                          : baseTasks.filter((t) => {
                              const inSamePhase = t.phaseOrder === editingFeature.phaseOrder;
                              const isLinkedToThis = t.featureId === featureId || t.featureId === (featureId as unknown);
                              const isUnassigned = t.featureId === null;
                              return inSamePhase && (isLinkedToThis || isUnassigned);
                            });

                        const filtered = availableTasks.filter((t) => {
                          if (!editTaskSearch.trim()) return true;
                          const q = editTaskSearch.toLowerCase();
                          return (
                            t.title.toLowerCase().includes(q) ||
                            t.phaseName.toLowerCase().includes(q)
                          );
                        });

                        if (filtered.length === 0) {
                          return (
                            <p className="px-1 py-2 text-xs text-muted-foreground">
                              No matching tasks.
                            </p>
                          );
                        }

                        return filtered.map((task) => {
                          const checked =
                            task.featureId === featureId || task.featureId === (featureId as unknown);
                          return (
                            <div
                              key={`${task.phaseOrder}:${task.taskOrder}`}
                              role="button"
                              tabIndex={0}
                              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted"
                              onClick={async () => {
                                if (!sessionToken || !convexClient || !featureId) return;
                                if (checked) {
                                  await convexClient.mutation(
                                    api.features.unlinkTaskFromFeature,
                                    {
                                      token: sessionToken,
                                      projectId: project._id as Id<"projects">,
                                      phaseOrder: task.phaseOrder,
                                      taskOrder: task.taskOrder,
                                    },
                                  );
                                } else {
                                  await convexClient.mutation(
                                    api.features.linkTaskToFeature,
                                    {
                                      token: sessionToken,
                                      projectId: project._id as Id<"projects">,
                                      phaseOrder: task.phaseOrder,
                                      taskOrder: task.taskOrder,
                                      featureId: featureId as Id<"features">,
                                    },
                                  );
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  (e.currentTarget as HTMLDivElement).click();
                                }
                              }}
                            >
                              <Checkbox checked={checked} className="h-3.5 w-3.5" />
                              <div className="flex flex-col">
                                <span className="font-medium">{task.title}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {task.phaseName}
                                  {task.date ? ` • ${task.date}` : null}
                                </span>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="max-h-72 overflow-y-auto rounded-md border border-border bg-background">
                {editingFeatureTasks.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground">
                    No tasks linked to this feature yet.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {editingFeatureTasks.map((t) => {
                      const key = `${t.phaseOrder}:${t.taskOrder}`;
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between gap-3 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {t.title}
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge
                                variant={t.completed ? "outline" : "secondary"}
                                className="h-5 px-1.5 text-[10px]"
                              >
                                {t.completed ? "Done" : "Planned"}
                              </Badge>
                              {t.date ? <span>Due {t.date}</span> : <span>No due date</span>}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={async () => {
                              if (!sessionToken || !convexClient) return;
                              setOptimisticallyHiddenTasks((prev) => {
                                const next = new Set(prev);
                                next.add(key);
                                return next;
                              });
                              try {
                                await convexClient.mutation(
                                  api.features.unlinkTaskFromFeature,
                                  {
                                    token: sessionToken,
                                    projectId: project._id as Id<"projects">,
                                    phaseOrder: t.phaseOrder,
                                    taskOrder: t.taskOrder,
                                  },
                                );
                              } catch {
                                setOptimisticallyHiddenTasks((prev) => {
                                  const next = new Set(prev);
                                  next.delete(key);
                                  return next;
                                });
                              }
                            }}
                            aria-label="Unlink task from feature"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between gap-3">
            <Button
              variant="destructive"
              className="mr-auto"
              onClick={() => {
                if (!editingFeature) return;
                closeEditModal();
                setFeatureToDelete({
                  id: editingFeature._id as string,
                  name: editingFeature.name,
                });
              }}
            >
              Delete Feature
            </Button>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={closeEditModal}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (
                    !sessionToken ||
                    !convexClient ||
                    !featureToEditId ||
                    editPhaseOrder === null
                  )
                    return;
                  await convexClient.mutation(api.features.save, {
                    token: sessionToken,
                    featureId: featureToEditId as Id<"features">,
                    name: editName,
                    description: editDescription,
                    phaseOrder: editPhaseOrder,
                  });
                  closeEditModal();
                }}
                disabled={!sessionToken}
              >
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={featureToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setFeatureToDelete(null);
            setDeleteFeatureStep(null);
          } else if (deleteFeatureStep === null) {
            setDeleteFeatureStep("choose");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteFeatureStep === "confirm_delete_tasks"
                ? "Delete all tasks in this feature?"
                : "Delete feature?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {featureToDelete
                ? deleteFeatureStep === "confirm_delete_tasks"
                  ? `Are you sure you want to permanently delete the feature “${featureToDelete.name}” and all of its tasks? This action cannot be undone.`
                  : `What should happen to tasks linked to “${featureToDelete.name}”?`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteFeatureStep === "confirm_delete_tasks" ? (
            <AlertDialogFooter className="items-center sm:justify-center">
              <AlertDialogCancel
                onClick={() => {
                  setDeleteFeatureStep("choose");
                }}
              >
                Back
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={async (e) => {
                  // Keep dialog open until mutation finishes.
                  e.preventDefault();
                  if (!featureToDelete || !sessionToken || !convexClient) return;
                  await convexClient.mutation(api.features.deleteFeature, {
                    token: sessionToken,
                    featureId: featureToDelete.id as Id<"features">,
                    mode: "delete_tasks",
                  });
                  setFeatureToDelete(null);
                  setDeleteFeatureStep(null);
                }}
              >
                Yes, delete all tasks
              </AlertDialogAction>
            </AlertDialogFooter>
          ) : (
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setFeatureToDelete(null);
                  setDeleteFeatureStep(null);
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                variant="outline"
                onClick={async (e) => {
                  e.preventDefault();
                  if (!featureToDelete || !sessionToken || !convexClient) return;
                  await convexClient.mutation(api.features.deleteFeature, {
                    token: sessionToken,
                    featureId: featureToDelete.id as Id<"features">,
                    mode: "unassign_tasks",
                  });
                  setFeatureToDelete(null);
                  setDeleteFeatureStep(null);
                }}
              >
                Keep tasks (unassign)
              </AlertDialogAction>
              <AlertDialogAction
                onClick={(e) => {
                  // Keep dialog open while moving to the second confirmation step.
                  e.preventDefault();
                  setDeleteFeatureStep("confirm_delete_tasks");
                }}
              >
                Delete tasks and feature
              </AlertDialogAction>
            </AlertDialogFooter>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


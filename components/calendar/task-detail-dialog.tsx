"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Clock,
  FolderOpen,
  Layers,
  CheckCircle2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth-provider";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type CalendarEvent,
  PROJECT_COLORS,
  normalizeTimeString,
  parseTimeToHour,
} from "@/lib/calendar-utils";

interface TaskDetailDialogProps {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDetailDialog({
  event,
  open,
  onOpenChange,
}: TaskDetailDialogProps) {
  const { sessionToken } = useAuth();
  const [taskId, setTaskId] = useState<Id<"tasks"> | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [draftSubtasks, setDraftSubtasks] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [taskStartTime, setTaskStartTime] = useState(event?.timeStr ?? "");
  const [taskEndTime, setTaskEndTime] = useState(event?.endTimeStr ?? "");
  const [isUpdatingTime, setIsUpdatingTime] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const ensureTask = useMutation(api.tasks.ensureTaskForProjectWbsTask);
  const createSubtasks = useMutation(api.tasks.createSubtasks);
  const toggleSubtaskCompleted = useMutation(api.tasks.toggleSubtaskCompleted);
  const deleteSubtaskMut = useMutation(api.tasks.deleteSubtask);
  const updateTaskTime = useMutation(api.aiTools.updateTaskTime);
  const updateTaskStatus = useMutation(api.aiTools.updateTaskStatus);

  const subtasks = useQuery(
    api.tasks.listSubtasks,
    sessionToken && taskId ? { token: sessionToken, taskId } : "skip",
  );

  useEffect(() => {
    if (!open || !event || !sessionToken) {
      setTaskId(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const result = await ensureTask({
          token: sessionToken,
          projectId: event.projectId as Id<"projects">,
          phaseOrder: event.phaseOrder,
          taskOrder: event.taskOrder,
          title: event.taskName,
        });
        if (!cancelled) {
          setTaskId(result.taskId);
        }
      } catch {
        if (!cancelled) {
          toast({
            variant: "destructive",
            title: "Failed to load task details.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, event, sessionToken, ensureTask]);

  useEffect(() => {
    setTaskStartTime(event?.timeStr ?? "");
    setTaskEndTime(event?.endTimeStr ?? "");
  }, [event]);

  const color = useMemo(
    () => (event ? PROJECT_COLORS[event.colorIndex] : PROJECT_COLORS[0]),
    [event],
  );

  if (!event) return null;

  const handleMarkTaskDone = async () => {
    if (!sessionToken || isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    try {
      await updateTaskStatus({
        token: sessionToken,
        projectId: event.projectId as Id<"projects">,
        phaseOrder: event.phaseOrder,
        taskOrder: event.taskOrder,
        completed: true,
      });
      toast({ title: "Task marked as done." });
      onOpenChange(false);
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to update task status.",
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleToggleSubtask = async (
    subtaskId: Id<"subtasks">,
    completed: boolean,
  ) => {
    if (!sessionToken) return;
    try {
      await toggleSubtaskCompleted({
        token: sessionToken,
        subtaskId,
        completed,
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to update subtask.",
      });
    }
  };

  const handleUpdateTime = async () => {
    if (!sessionToken || !event || isUpdatingTime) return;
    const startTrimmed = taskStartTime.trim();
    if (!startTrimmed) {
      toast({
        variant: "destructive",
        title: "Enter a start time (e.g. 9:00 AM).",
      });
      return;
    }
    const normalizedStart = normalizeTimeString(startTrimmed);
    if (!normalizedStart) {
      toast({
        variant: "destructive",
        title: "Start time format is invalid. Use e.g. 9:00 AM or 9am.",
      });
      return;
    }
    const endTrimmed = taskEndTime.trim();
    let normalizedEnd: string | undefined;
    if (endTrimmed) {
      normalizedEnd = normalizeTimeString(endTrimmed) ?? undefined;
      if (!normalizedEnd) {
        toast({
          variant: "destructive",
          title: "End time format is invalid. Use e.g. 10:00 AM or 10am.",
        });
        return;
      }
      if (parseTimeToHour(normalizedEnd) <= parseTimeToHour(normalizedStart)) {
        toast({
          variant: "destructive",
          title: "End time must be after start time.",
        });
        return;
      }
    }
    setIsUpdatingTime(true);
    try {
      await updateTaskTime({
        token: sessionToken,
        projectId: event.projectId as Id<"projects">,
        phaseOrder: event.phaseOrder,
        taskOrder: event.taskOrder,
        newStartTime: normalizedStart,
        newEndTime: normalizedEnd,
      });
      setTaskStartTime(normalizedStart);
      setTaskEndTime(normalizedEnd ?? "");
      toast({ title: "Task time updated." });
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to update task time.",
      });
    } finally {
      setIsUpdatingTime(false);
    }
  };

  const handleStartTimeBlur = () => {
    const t = taskStartTime.trim();
    if (!t) return;
    const normalized = normalizeTimeString(t);
    if (normalized) setTaskStartTime(normalized);
  };

  const handleEndTimeBlur = () => {
    const t = taskEndTime.trim();
    if (!t) return;
    const normalized = normalizeTimeString(t);
    if (normalized) setTaskEndTime(normalized);
  };

  const handleGenerateSubtasks = async () => {
    if (!event || !sessionToken || !taskId || isGenerating) return;
    setIsGenerating(true);
    try {
      const response = await fetch("/api/generate-subtasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskTitle: event.taskName,
          taskDescription: `${event.phaseName} in project ${event.projectName}`,
          projectName: event.projectName,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(json.subtasks)) {
        throw new Error(
          typeof json.error === "string" ? json.error : "Failed to generate",
        );
      }
      setDraftSubtasks(json.subtasks as string[]);
      setReviewOpen(true);
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to generate subtasks.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveSubtasks = async () => {
    if (!sessionToken || !taskId) return;
    const titles = draftSubtasks
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (titles.length === 0) {
      setReviewOpen(false);
      return;
    }
    try {
      await createSubtasks({
        token: sessionToken,
        taskId,
        titles,
      });
      setReviewOpen(false);
      toast({ title: "Subtasks saved." });
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to save subtasks.",
      });
    }
  };

  const handleAddSubtask = async () => {
    if (!sessionToken || !taskId) return;
    const title = newSubtaskTitle.trim();
    if (!title || isAddingSubtask) return;
    setIsAddingSubtask(true);
    try {
      await createSubtasks({
        token: sessionToken,
        taskId,
        titles: [title],
      });
      setNewSubtaskTitle("");
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to add subtask.",
      });
    } finally {
      setIsAddingSubtask(false);
    }
  };

  const handleDeleteSubtask = async (subtaskId: Id<"subtasks">) => {
    if (!sessionToken) return;
    try {
      await deleteSubtaskMut({
        token: sessionToken,
        subtaskId,
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to delete subtask.",
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span
                className="mt-0.5 size-3 shrink-0 rounded-sm"
                style={{ backgroundColor: color.hex }}
              />
              <div>
                <DialogTitle className="text-base">
                  {event.taskName}
                </DialogTitle>
                <DialogDescription className="mt-0.5">
                  {event.projectName}
                </DialogDescription>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {!event.completed && (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={handleMarkTaskDone}
                    disabled={!sessionToken || isUpdatingStatus}
                  >
                    Mark as done
                  </Button>
                )}
                {event.completed && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <CheckCircle2 className="size-3" />
                    Completed
                  </span>
                )}
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            {event.taskDescription && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {event.taskDescription}
              </p>
            )}
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="size-4 text-muted-foreground" />
              <span>
                {event.date.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Clock className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Start</span>
                  <Input
                    value={taskStartTime}
                    onChange={(e) => setTaskStartTime(e.target.value)}
                    onBlur={handleStartTimeBlur}
                    placeholder="9:00 AM"
                    className={cn(
                      "h-8 w-24 text-xs",
                      taskStartTime.trim() &&
                        !normalizeTimeString(taskStartTime.trim()) &&
                        "border-destructive focus-visible:ring-destructive",
                    )}
                    aria-invalid={
                      !!taskStartTime.trim() &&
                      !normalizeTimeString(taskStartTime.trim())
                    }
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">End</span>
                  <Input
                    value={taskEndTime}
                    onChange={(e) => setTaskEndTime(e.target.value)}
                    onBlur={handleEndTimeBlur}
                    placeholder="10:00 AM (optional)"
                    className={cn(
                      "h-8 w-24 text-xs",
                      taskEndTime.trim() &&
                        !normalizeTimeString(taskEndTime.trim()) &&
                        "border-destructive focus-visible:ring-destructive",
                    )}
                    aria-invalid={
                      !!taskEndTime.trim() &&
                      !normalizeTimeString(taskEndTime.trim())
                    }
                  />
                </div>
                <Button
                  type="button"
                  size="xs"
                  className="h-8 px-2 text-[11px]"
                  onClick={handleUpdateTime}
                  disabled={
                    isUpdatingTime || !taskStartTime.trim() || !sessionToken
                  }
                >
                  Save
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <FolderOpen className="size-4 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: color.hex }}
                />
                <span>{event.projectName}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Layers className="size-4 text-muted-foreground" />
              <span>{event.phaseName}</span>
            </div>

            {sessionToken && taskId && (
              <div className="mt-2 space-y-2 border-t pt-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Subtasks
                  </span>
                  {subtasks !== undefined && subtasks.length === 0 && (
                    <Button
                      variant="outline"
                      size="xs"
                      className="h-7 px-2 text-[11px]"
                      onClick={handleGenerateSubtasks}
                      disabled={isGenerating}
                    >
                      {isGenerating ? (
                        <Spinner className="mr-1 size-3" />
                      ) : (
                        <Sparkles className="mr-1 size-3" />
                      )}
                      Break into subtasks
                    </Button>
                  )}
                </div>
                {subtasks === undefined ? (
                  <p className="text-xs text-muted-foreground">
                    Loading subtasks…
                  </p>
                ) : subtasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No subtasks yet.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {subtasks.map((subtask) => (
                      <div
                        key={subtask._id}
                        className="flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted/70"
                      >
                        <Checkbox
                          checked={subtask.completed}
                          onCheckedChange={(checked) =>
                            handleToggleSubtask(
                              subtask._id as Id<"subtasks">,
                              Boolean(checked),
                            )
                          }
                        />
                        <span
                          className={cn(
                            "flex-1 text-xs",
                            subtask.completed &&
                              "line-through text-muted-foreground",
                          )}
                        >
                          {subtask.title}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            handleDeleteSubtask(subtask._id as Id<"subtasks">)
                          }
                        >
                          <Trash2 className="size-3" />
                          <span className="sr-only">Delete subtask</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="Add subtask"
                    className="h-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleAddSubtask();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="xs"
                    className="h-8 px-2 text-[11px]"
                    onClick={handleAddSubtask}
                    disabled={
                      !newSubtaskTitle.trim() ||
                      isAddingSubtask ||
                      !sessionToken
                    }
                  >
                    Add
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review subtasks</DialogTitle>
            <DialogDescription>
              Edit, remove, or add subtasks before saving them to this task.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 space-y-2">
            {draftSubtasks.map((title, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={title}
                  onChange={(e) => {
                    const next = [...draftSubtasks];
                    next[index] = e.target.value;
                    setDraftSubtasks(next);
                  }}
                  placeholder="Subtask title"
                  className="h-8 text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    setDraftSubtasks((prev) =>
                      prev.filter((_, i) => i !== index),
                    );
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => setDraftSubtasks((prev) => [...prev, ""])}
            >
              Add subtask
            </Button>
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReviewOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveSubtasks}
              disabled={
                draftSubtasks.every((t) => !t.trim()) ||
                !sessionToken ||
                !taskId
              }
            >
              Save subtasks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

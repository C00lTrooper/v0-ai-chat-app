"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar as CalendarIcon,
  Clock,
  FolderOpen,
  Layers,
  CheckCircle2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { convexClient } from "@/lib/convex";
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
import { projectPrimaryButtonClassName } from "@/lib/project-primary-button";
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
  dateKey,
  parseYmdLocal,
} from "@/lib/calendar-utils";
import type { Project } from "@/lib/project-schema";
import {
  UNASSIGNED_PHASE_ORDER,
  isTaskDateWithinPhase,
  phasesContainingTaskDate,
} from "@/lib/task-phase-date";
import { TaskPhaseDateConflictDialog } from "@/components/calendar/task-phase-date-conflict-dialog";
import {
  ScheduleTimeSelects,
  addOneHourFromTime,
  hhmm24ToNormalized12h,
  timeStrToHHMM,
} from "@/components/schedule-time-selects";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function convexTimeFromScheduleHHMM(hhmm: string): string | null {
  return hhmm24ToNormalized12h(hhmm) ?? normalizeTimeString(hhmm.trim());
}

/** First day/time in [phaseStart, phaseEnd] with no conflicts, using suggested slots like generate-project. */
async function findFirstFreeSlotInPhaseRange(options: {
  token: string;
  phaseStartYmd: string;
  phaseEndYmd: string;
  startNorm: string;
  endNorm: string;
  excludeTaskKey: string;
}): Promise<{ date: string; startTime: string; endTime: string } | null> {
  if (!convexClient) return null;
  const start = parseYmdLocal(options.phaseStartYmd);
  const end = parseYmdLocal(options.phaseEndYmd);
  if (!start || !end) return null;
  const cur = new Date(start);
  const endD = new Date(end);
  while (cur.getTime() <= endD.getTime()) {
    const ymd = dateKey(cur);
    let startT = options.startNorm;
    let endT = options.endNorm;
    let attempts = 0;
    while (attempts < 5) {
      const result = await convexClient.query(api.conflicts.checkTimeConflicts, {
        token: options.token,
        date: ymd,
        startTime: startT,
        endTime: endT,
        excludeTaskKey: options.excludeTaskKey,
      });
      if (!result.hasConflicts) {
        return { date: ymd, startTime: startT, endTime: endT };
      }
      if (!result.suggestedSlots?.length) break;
      const sl = result.suggestedSlots[0];
      startT = sl.startTime;
      endT = sl.endTime;
      attempts += 1;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return null;
}

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
  const router = useRouter();
  const { sessionToken } = useAuth();
  const [taskId, setTaskId] = useState<Id<"tasks"> | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [draftSubtasks, setDraftSubtasks] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [taskStartHHMM, setTaskStartHHMM] = useState(() =>
    timeStrToHHMM(event?.timeStr ?? "9:00 AM"),
  );
  const [taskEndHHMM, setTaskEndHHMM] = useState(() => {
    const start = timeStrToHHMM(event?.timeStr ?? "9:00 AM");
    return event?.endTimeStr
      ? timeStrToHHMM(event.endTimeStr)
      : addOneHourFromTime(start);
  });
  const [isUpdatingTime, setIsUpdatingTime] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [taskDate, setTaskDate] = useState(
    event ? dateKey(event.date) : dateKey(new Date()),
  );
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [isUpdatingDate, setIsUpdatingDate] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const [phaseConflictOpen, setPhaseConflictOpen] = useState(false);
  const [pendingConflictYmd, setPendingConflictYmd] = useState<string | null>(
    null,
  );
  const [phaseConflictBusy, setPhaseConflictBusy] = useState(false);
  const [phaseDateMismatchOpen, setPhaseDateMismatchOpen] = useState(false);
  const [phaseMismatchBusy, setPhaseMismatchBusy] = useState(false);
  const [phaseMismatchCtx, setPhaseMismatchCtx] = useState<{
    phaseOrder: number;
    taskOrder: number;
    targetPhaseOrder: number;
    phaseStartYmd: string;
    phaseEndYmd: string;
    phaseName: string;
  } | null>(null);
  const [isUpdatingPhase, setIsUpdatingPhase] = useState(false);

  const projectDoc = useQuery(
    api.projects.getById,
    sessionToken && event
      ? { token: sessionToken, projectId: event.projectId as Id<"projects"> }
      : "skip",
  );

  const ensureTask = useMutation(api.tasks.ensureTaskForProjectWbsTask);
  const createSubtasks = useMutation(api.tasks.createSubtasks);
  const toggleSubtaskCompleted = useMutation(api.tasks.toggleSubtaskCompleted);
  const deleteSubtaskMut = useMutation(api.tasks.deleteSubtask);
  const updateTaskTime = useMutation(api.aiTools.updateTaskTime);
  const updateTaskStatus = useMutation(api.aiTools.updateTaskStatus);
  const updateTaskDueDate = useMutation(api.aiTools.updateTaskDueDate);
  const relocateProjectWbsTask = useMutation(
    api.aiTools.relocateProjectWbsTask,
  );
  const deleteProjectWbsTask = useMutation(api.aiTools.deleteProjectWbsTask);

  const subtasks = useQuery(
    api.tasks.listSubtasks,
    sessionToken && taskId && !isDeletingTask
      ? { token: sessionToken, taskId }
      : "skip",
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
    const start = timeStrToHHMM(event?.timeStr ?? "9:00 AM");
    setTaskStartHHMM(start);
    setTaskEndHHMM(
      event?.endTimeStr
        ? timeStrToHHMM(event.endTimeStr)
        : addOneHourFromTime(start),
    );
    if (event) {
      setTaskDate(dateKey(event.date));
    }
  }, [event]);

  useEffect(() => {
    if (!open) {
      setDatePickerOpen(false);
      setDeleteConfirmOpen(false);
    }
  }, [open]);

  const color = useMemo(
    () => (event ? PROJECT_COLORS[event.colorIndex] : PROJECT_COLORS[0]),
    [event],
  );

  const projectPhaseOptions = useMemo(() => {
    if (!projectDoc?.data) return [] as { order: number; name: string }[];
    try {
      const p = JSON.parse(projectDoc.data) as Project;
      return (p.project_wbs ?? [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((ph) => ({ order: ph.order, name: ph.name }));
    } catch {
      return [];
    }
  }, [projectDoc?.data]);

  if (!event) return null;

  const handleDeleteTask = async () => {
    if (!sessionToken || !event || isDeletingTask) return;
    setIsDeletingTask(true);
    try {
      await deleteProjectWbsTask({
        token: sessionToken,
        projectId: event.projectId as Id<"projects">,
        phaseOrder: event.phaseOrder,
        taskOrder: event.taskOrder,
      });
      setTaskId(null);
      toast({ title: "Task deleted." });
      setDeleteConfirmOpen(false);
      onOpenChange(false);
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to delete task.",
      });
    } finally {
      setIsDeletingTask(false);
    }
  };

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
    const normalizedStart = convexTimeFromScheduleHHMM(taskStartHHMM);
    if (!normalizedStart) {
      toast({
        variant: "destructive",
        title: "Start time is invalid.",
      });
      return;
    }
    const normalizedEnd = convexTimeFromScheduleHHMM(taskEndHHMM);
    if (!normalizedEnd) {
      toast({
        variant: "destructive",
        title: "End time is invalid.",
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
      setTaskStartHHMM(timeStrToHHMM(normalizedStart));
      setTaskEndHHMM(timeStrToHHMM(normalizedEnd));
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

  const handleUpdateDate = async (newDate: string) => {
    if (!sessionToken || !event || isUpdatingDate) return;
    if (!newDate) {
      toast({
        variant: "destructive",
        title: "Select a valid date.",
      });
      return;
    }
    setIsUpdatingDate(true);
    try {
      await updateTaskDueDate({
        token: sessionToken,
        projectId: event.projectId as Id<"projects">,
        phaseOrder: event.phaseOrder,
        taskOrder: event.taskOrder,
        newDate,
      });
      setTaskDate(newDate);
      toast({ title: "Task date updated." });
    } catch {
      if (event) setTaskDate(dateKey(event.date));
      toast({
        variant: "destructive",
        title: "Failed to update task date.",
      });
    } finally {
      setIsUpdatingDate(false);
    }
  };

  const considerDateChange = async (ymd: string) => {
    if (!sessionToken || !event) return;

    const assignedToPhase = event.phaseOrder >= 1;
    if (!assignedToPhase) {
      await handleUpdateDate(ymd);
      return;
    }

    let parsed: Project | null = null;
    if (projectDoc?.data) {
      try {
        parsed = JSON.parse(projectDoc.data) as Project;
      } catch {
        parsed = null;
      }
    }

    const phase = parsed?.project_wbs?.find(
      (p) => p.order === event.phaseOrder,
    );
    if (!phase) {
      await handleUpdateDate(ymd);
      return;
    }

    if (isTaskDateWithinPhase(ymd, phase)) {
      await handleUpdateDate(ymd);
      return;
    }

    setPendingConflictYmd(ymd);
    setPhaseConflictOpen(true);
  };

  const handlePhaseChange = async (value: string) => {
    if (!sessionToken || !event || !projectDoc?.isOwner) return;
    const newPhaseOrder = Number.parseInt(value, 10);
    if (
      !Number.isFinite(newPhaseOrder) ||
      newPhaseOrder === event.phaseOrder
    ) {
      return;
    }

    const startNorm = convexTimeFromScheduleHHMM(taskStartHHMM);
    const endNorm = convexTimeFromScheduleHHMM(taskEndHHMM);
    if (!startNorm || !endNorm) {
      toast({
        variant: "destructive",
        title: "Set valid start and end times before changing phase.",
      });
      return;
    }
    if (parseTimeToHour(endNorm) <= parseTimeToHour(startNorm)) {
      toast({
        variant: "destructive",
        title: "End time must be after start time.",
      });
      return;
    }

    let parsed: Project | null = null;
    try {
      if (projectDoc.data) parsed = JSON.parse(projectDoc.data) as Project;
    } catch {
      parsed = null;
    }

    const ymd = taskDate.trim();
    let targetPhaseForBounds: Project["project_wbs"][number] | undefined;
    if (newPhaseOrder >= 1) {
      targetPhaseForBounds = parsed?.project_wbs?.find(
        (p) => p.order === newPhaseOrder,
      );
      if (!targetPhaseForBounds) {
        toast({
          variant: "destructive",
          title: "Phase not found.",
        });
        return;
      }
    }

    setIsUpdatingPhase(true);
    try {
      const result = await relocateProjectWbsTask({
        token: sessionToken,
        projectId: event.projectId as Id<"projects">,
        fromPhaseOrder: event.phaseOrder,
        taskOrder: event.taskOrder,
        newDate: ymd,
        newStartTime: startNorm,
        newEndTime: endNorm,
        target:
          newPhaseOrder === UNASSIGNED_PHASE_ORDER
            ? { kind: "unassigned" }
            : { kind: "phase", phaseOrder: newPhaseOrder },
      });

      toast({ title: "Task phase updated." });

      if (
        newPhaseOrder >= 1 &&
        targetPhaseForBounds &&
        !isTaskDateWithinPhase(ymd, targetPhaseForBounds)
      ) {
        const tp = targetPhaseForBounds;
        setPhaseMismatchCtx({
          phaseOrder: result.phaseOrder,
          taskOrder: result.taskOrder,
          targetPhaseOrder: newPhaseOrder,
          phaseStartYmd: tp.start_date.trim(),
          phaseEndYmd: tp.end_date.trim(),
          phaseName: tp.name,
        });
        setPhaseDateMismatchOpen(true);
      } else {
        setPhaseMismatchCtx(null);
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to change phase.",
      });
    } finally {
      setIsUpdatingPhase(false);
    }
  };

  const handlePhaseMismatchKeepDate = () => {
    setPhaseDateMismatchOpen(false);
    setPhaseMismatchCtx(null);
  };

  const handlePhaseMismatchMoveIntoPhase = async () => {
    if (!sessionToken || !event || !phaseMismatchCtx) return;
    const startNorm = convexTimeFromScheduleHHMM(taskStartHHMM);
    const endNorm = convexTimeFromScheduleHHMM(taskEndHHMM);
    if (!startNorm || !endNorm) {
      toast({
        variant: "destructive",
        title: "Set valid start and end times before rescheduling.",
      });
      return;
    }
    if (parseTimeToHour(endNorm) <= parseTimeToHour(startNorm)) {
      toast({
        variant: "destructive",
        title: "End time must be after start time.",
      });
      return;
    }

    setPhaseMismatchBusy(true);
    try {
      const excludeKey = `${event.projectId}:${phaseMismatchCtx.phaseOrder}:${phaseMismatchCtx.taskOrder}`;
      const slot = await findFirstFreeSlotInPhaseRange({
        token: sessionToken,
        phaseStartYmd: phaseMismatchCtx.phaseStartYmd,
        phaseEndYmd: phaseMismatchCtx.phaseEndYmd,
        startNorm,
        endNorm,
        excludeTaskKey: excludeKey,
      });

      if (!slot) {
        toast({
          variant: "destructive",
          title: "No free slot found in this phase range.",
          description: "Try adjusting the phase dates in Overview.",
        });
        return;
      }

      await relocateProjectWbsTask({
        token: sessionToken,
        projectId: event.projectId as Id<"projects">,
        fromPhaseOrder: phaseMismatchCtx.phaseOrder,
        taskOrder: phaseMismatchCtx.taskOrder,
        newDate: slot.date,
        newStartTime: slot.startTime,
        newEndTime: slot.endTime,
        target: {
          kind: "phase",
          phaseOrder: phaseMismatchCtx.targetPhaseOrder,
        },
      });

      setTaskDate(slot.date);
      setTaskStartHHMM(timeStrToHHMM(slot.startTime));
      setTaskEndHHMM(timeStrToHHMM(slot.endTime));
      toast({ title: "Task moved into the phase schedule." });
      setPhaseDateMismatchOpen(false);
      setPhaseMismatchCtx(null);
    } catch {
      toast({
        variant: "destructive",
        title: "Could not reschedule within the phase.",
      });
    } finally {
      setPhaseMismatchBusy(false);
    }
  };

  const conflictMatchingPhases =
    pendingConflictYmd && projectDoc?.data
      ? (() => {
          try {
            const p = JSON.parse(projectDoc.data) as Project;
            return phasesContainingTaskDate(
              p.project_wbs ?? [],
              pendingConflictYmd,
            );
          } catch {
            return [];
          }
        })()
      : [];

  const handlePhaseConflictKeep = () => {
    if (event) setTaskDate(dateKey(event.date));
    setPendingConflictYmd(null);
    setPhaseConflictOpen(false);
  };

  const runRelocate = async (
    target: { kind: "phase"; phaseOrder: number } | { kind: "unassigned" },
  ) => {
    if (!sessionToken || !event || !pendingConflictYmd) return;
    setPhaseConflictBusy(true);
    try {
      const startNorm = convexTimeFromScheduleHHMM(taskStartHHMM);
      const endNorm = convexTimeFromScheduleHHMM(taskEndHHMM);
      if (!startNorm || !endNorm) {
        toast({
          variant: "destructive",
          title: "Set valid start and end times before resolving.",
        });
        return;
      }
      if (parseTimeToHour(endNorm) <= parseTimeToHour(startNorm)) {
        toast({
          variant: "destructive",
          title: "End time must be after start time.",
        });
        return;
      }
      await relocateProjectWbsTask({
        token: sessionToken,
        projectId: event.projectId as Id<"projects">,
        fromPhaseOrder: event.phaseOrder,
        taskOrder: event.taskOrder,
        newDate: pendingConflictYmd,
        newStartTime: startNorm,
        newEndTime: endNorm,
        target:
          target.kind === "phase"
            ? { kind: "phase" as const, phaseOrder: target.phaseOrder }
            : { kind: "unassigned" as const },
      });
      setTaskDate(pendingConflictYmd);
      toast({ title: "Task schedule updated." });
      setPhaseConflictOpen(false);
      setPendingConflictYmd(null);
      onOpenChange(false);
    } catch {
      toast({
        variant: "destructive",
        title: "Could not update task.",
      });
    } finally {
      setPhaseConflictBusy(false);
    }
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

  const handleViewInCalendar = () => {
    if (!event) return;
    onOpenChange(false);
    router.push(`/calendar?task=${encodeURIComponent(event.id)}`);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton
          className={cn(
            "flex w-[min(100vw-1rem,100%)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-0",
            "max-h-[min(92dvh,calc(100dvh-1rem))]",
            "sm:max-h-[min(90dvh,calc(100dvh-2rem))] sm:max-w-2xl",
            "lg:max-w-5xl",
          )}
          onInteractOutside={(e) => {
            if (phaseConflictOpen || phaseDateMismatchOpen) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (phaseConflictOpen || phaseDateMismatchOpen) e.preventDefault();
          }}
        >
          <DialogHeader className="shrink-0 space-y-3 border-b border-border/60 px-5 pb-4 pt-5 text-left sm:px-6 sm:pb-5 sm:pt-6 sm:pr-14">
            <div className="space-y-3 pr-10 sm:pr-0">
              <DialogTitle className="text-base leading-snug sm:text-lg">
                {event.taskName}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-2">
                {!event.completed ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    className={cn(projectPrimaryButtonClassName, "w-fit")}
                    onClick={handleMarkTaskDone}
                    disabled={!sessionToken || isUpdatingStatus}
                  >
                    <CheckCircle2 className="size-4" aria-hidden />
                    Mark as done
                  </Button>
                ) : (
                  <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <CheckCircle2 className="size-3" />
                    Completed
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-fit gap-1.5"
                  onClick={handleViewInCalendar}
                >
                  <CalendarIcon className="size-4" aria-hidden />
                  View in calendar
                </Button>
                {projectDoc?.isOwner ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 w-fit gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteConfirmOpen(true)}
                    disabled={!sessionToken || isDeletingTask}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Delete task
                  </Button>
                ) : null}
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div
              className={cn(
                "flex flex-col gap-5 px-5 py-4 sm:px-6 sm:py-5",
                sessionToken &&
                  taskId &&
                  "lg:flex-row lg:items-stretch lg:gap-0 lg:py-0",
              )}
            >
              <div
                className={cn(
                  "min-w-0 flex-1 space-y-3",
                  sessionToken && taskId && "lg:px-6 lg:py-5",
                )}
              >
                {event.taskDescription && (
                  <p className="text-xs text-muted-foreground leading-relaxed sm:text-sm">
                    {event.taskDescription}
                  </p>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color.hex }}
                    />
                    <span className="break-words">{event.projectName}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Layers className="size-4 shrink-0 text-muted-foreground" />
                  {projectDoc?.isOwner && sessionToken ? (
                    <Select
                      value={String(event.phaseOrder)}
                      onValueChange={(v) => void handlePhaseChange(v)}
                      disabled={
                        isUpdatingPhase ||
                        isUpdatingTime ||
                        isUpdatingDate ||
                        isDeletingTask ||
                        !projectDoc.data
                      }
                    >
                      <SelectTrigger
                        className="h-9 min-h-9 min-w-0 max-w-full flex-1 text-left text-sm font-normal text-foreground sm:max-w-xs"
                        aria-label="Task phase"
                      >
                        <SelectValue placeholder="Phase" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="z-[100] max-h-72">
                        <SelectItem
                          value={String(UNASSIGNED_PHASE_ORDER)}
                          className="text-xs"
                        >
                          Unassigned
                        </SelectItem>
                        {projectPhaseOptions.map((ph) => (
                          <SelectItem
                            key={ph.order}
                            value={String(ph.order)}
                            className="text-xs"
                          >
                            {ph.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="min-w-0 break-words">
                      {event.phaseOrder === UNASSIGNED_PHASE_ORDER
                        ? "Unassigned"
                        : event.phaseName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
                  <Popover
                    open={datePickerOpen}
                    onOpenChange={setDatePickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="default"
                        className={cn(
                          "h-9 min-h-9 min-w-0 max-w-full flex-1 justify-start px-3 py-2 border-input bg-transparent text-left text-sm font-normal text-foreground shadow-xs",
                          "sm:max-w-xs",
                          "whitespace-normal break-words hover:bg-accent/80 hover:text-foreground",
                          "dark:bg-input/30 dark:hover:bg-input/50",
                        )}
                        disabled={!sessionToken || isUpdatingDate}
                        aria-label="Task date"
                      >
                        {taskDate || "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={
                          taskDate ? parseYmdLocal(taskDate) : undefined
                        }
                        onSelect={(date) => {
                          if (!date) return;
                          const ymd = dateKey(date);
                          setDatePickerOpen(false);
                          void considerDateChange(ymd);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <Clock className="mt-1 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-3 rounded-xl border border-border bg-muted/20 p-3 sm:p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Schedule
                    </p>
                    <ScheduleTimeSelects
                      label="Start time"
                      value={taskStartHHMM}
                      onChange={setTaskStartHHMM}
                    />
                    <div className="space-y-2 border-t border-border/60 pt-3 sm:pt-4">
                      <ScheduleTimeSelects
                        label="End time"
                        value={taskEndHHMM}
                        onChange={setTaskEndHHMM}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className={cn(
                        "h-9 w-full text-xs sm:w-auto",
                        projectPrimaryButtonClassName,
                      )}
                      onClick={handleUpdateTime}
                      disabled={isUpdatingTime || !sessionToken}
                    >
                      {isUpdatingTime ? "Saving…" : "Save time"}
                    </Button>
                  </div>
                </div>
              </div>

              {sessionToken && taskId && (
                <div
                  className={cn(
                    "flex min-h-0 w-full min-w-0 flex-col space-y-2 border-t border-border pt-4",
                    "lg:max-w-md lg:shrink-0 lg:border-t-0 lg:border-l lg:px-6 lg:py-5",
                    "lg:bg-muted/15",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Subtasks
                    </span>
                    {subtasks !== undefined && subtasks.length === 0 && (
                      <Button
                        variant="outline"
                        size="sm"
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
                              "min-w-0 flex-1 text-xs",
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
                            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
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
                  <div className="mt-1 flex min-w-0 items-center gap-2">
                    <Input
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      placeholder="Add subtask"
                      className="h-8 min-w-0 flex-1 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleAddSubtask();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 shrink-0 px-2 text-[11px]"
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
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes “{event.taskName}” from the project schedule.
              Subtasks saved for this task will also be removed. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingTask}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={isDeletingTask}
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteTask();
              }}
            >
              {isDeletingTask ? <Spinner className="size-4" /> : "Delete task"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={phaseDateMismatchOpen}
        onOpenChange={(o) => {
          if (!o && !phaseMismatchBusy) handlePhaseMismatchKeepDate();
        }}
      >
        <DialogContent className="max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Date outside phase</DialogTitle>
            <DialogDescription>
              This task&apos;s date is outside the selected phase (
              {phaseMismatchCtx?.phaseName ?? "phase"}:{" "}
              {phaseMismatchCtx
                ? `${phaseMismatchCtx.phaseStartYmd} – ${phaseMismatchCtx.phaseEndYmd}`
                : ""}
              ). Keep the original date or move it into the phase?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              disabled={phaseMismatchBusy}
              onClick={handlePhaseMismatchKeepDate}
            >
              Keep original date
            </Button>
            <Button
              type="button"
              size="sm"
              className={cn(
                "w-full sm:w-auto",
                projectPrimaryButtonClassName,
              )}
              disabled={phaseMismatchBusy}
              onClick={() => void handlePhaseMismatchMoveIntoPhase()}
            >
              {phaseMismatchBusy ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Scheduling…
                </>
              ) : (
                "Move into phase"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskPhaseDateConflictDialog
        open={phaseConflictOpen}
        onOpenChange={(o) => {
          if (!o && !phaseConflictBusy) {
            handlePhaseConflictKeep();
          }
        }}
        taskTitle={event.taskName}
        currentPhaseName={event.phaseName}
        newDateLabel={
          pendingConflictYmd
            ? (parseYmdLocal(pendingConflictYmd)?.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              }) ?? pendingConflictYmd)
            : ""
        }
        matchingPhases={conflictMatchingPhases.map((p) => ({
          order: p.order,
          name: p.name,
          start_date: p.start_date,
          end_date: p.end_date,
        }))}
        onKeepInPhase={handlePhaseConflictKeep}
        onMoveToPhase={(phaseOrder) =>
          runRelocate({ kind: "phase", phaseOrder })
        }
        onRemoveFromPhase={() => runRelocate({ kind: "unassigned" })}
        busy={phaseConflictBusy}
      />

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

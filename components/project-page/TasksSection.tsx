import { Fragment, useEffect, useMemo, useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { useConvexReady } from "@/hooks/use-convex-ready";
import {
  CheckSquare,
  Layers,
  CheckCircle2,
  Circle,
  MoreVertical,
  CalendarClock,
  Plus,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  ScheduleTimeSelects,
  addOneHourFromTime,
  formatTime24,
  parseTime24,
  snapMinuteToStep,
} from "@/components/schedule-time-selects";
import { TaskDetailDialog } from "@/components/calendar/task-detail-dialog";
import { cn } from "@/lib/utils";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { dateKey, type CalendarEvent } from "@/lib/calendar-utils";
import type { Project } from "@/lib/project-schema";
import type { ProjectData } from "@/components/project-page/types";
import { UNASSIGNED_PHASE_ORDER } from "@/lib/task-phase-date";
import { projectPrimaryButtonClassName } from "@/lib/project-primary-button";

function buildCalendarEventForTask(
  project: ProjectData,
  parsed: Project,
  phaseOrder: number,
  taskOrder: number,
): CalendarEvent | null {
  if (phaseOrder === UNASSIGNED_PHASE_ORDER) {
    const task = (parsed.unassigned_tasks ?? []).find(
      (t) => t.order === taskOrder,
    );
    if (!task) return null;
    const taskWithEnd = task as { endTime?: string; description?: string };
    const date = new Date(task.date + "T00:00:00");
    const isCompleted = Boolean((task as { completed?: boolean }).completed);
    return {
      id: `${project._id}-${phaseOrder}-${task.order}`,
      projectId: project._id,
      projectName: project.projectName || project.summaryName,
      phaseName: "Unassigned",
      taskName: task.name,
      taskDescription: taskWithEnd.description,
      date,
      timeStr: task.time,
      ...(taskWithEnd.endTime ? { endTimeStr: taskWithEnd.endTime } : {}),
      colorIndex: 0,
      completed: isCompleted,
      phaseOrder,
      taskOrder: task.order,
    };
  }
  const phase = parsed.project_wbs?.find((p) => p.order === phaseOrder);
  const task = phase?.tasks?.find((t) => t.order === taskOrder);
  if (!phase || !task) return null;
  const taskWithEnd = task as { endTime?: string; description?: string };
  const date = new Date(task.date + "T00:00:00");
  const isCompleted = Boolean((task as { completed?: boolean }).completed);
  return {
    id: `${project._id}-${phase.order}-${task.order}`,
    projectId: project._id,
    projectName: project.projectName || project.summaryName,
    phaseName: phase.name,
    taskName: task.name,
    taskDescription: taskWithEnd.description,
    date,
    timeStr: task.time,
    ...(taskWithEnd.endTime ? { endTimeStr: taskWithEnd.endTime } : {}),
    colorIndex: 0,
    completed: isCompleted,
    phaseOrder: phase.order,
    taskOrder: task.order,
  };
}

function parseISODate(s: string): Date | undefined {
  const t = s?.trim();
  if (!t) return undefined;
  const d = new Date(`${t}T12:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function formatTaskDateLabel(iso: string): string {
  const d = parseISODate(iso);
  if (!d) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type TaskRef = {
  phaseOrder: number;
  taskOrder: number;
  taskName: string;
  completed: boolean;
};

type TasksSectionProps = {
  project: ProjectData;
  onTaskCompleted?: (
    phaseOrder: number,
    taskOrder: number,
    completed: boolean,
  ) => Promise<void> | void;
};

export function TasksSection({
  project,
  onTaskCompleted,
}: TasksSectionProps) {
  const convex = useConvex();
  const ready = useConvexReady();

  let parsedProject: Project | null = null;
  try {
    if (project.data) parsedProject = JSON.parse(project.data) as Project;
  } catch {
    // data may be empty or invalid
  }

  const phases =
    parsedProject?.project_wbs?.slice().sort((a, b) => a.order - b.order) ?? [];

  const [pendingTask, setPendingTask] = useState<TaskRef | null>(null);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false);
  const [newTaskPhaseSelect, setNewTaskPhaseSelect] = useState<string>(
    "__none__",
  );
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskDate, setNewTaskDate] = useState("");
  const [newTaskTime, setNewTaskTime] = useState("");
  const [newTaskEndTime, setNewTaskEndTime] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const [newTaskDatePickerOpen, setNewTaskDatePickerOpen] = useState(false);

  const projectSubtasks = useQuery(
    api.tasks.listSubtasksForProject,
    ready
      ? { projectId: project._id as Id<"projects"> }
      : "skip",
  );

  useEffect(() => {
    if (!detailOpen || detailEvent === null) return;
    let parsed: Project | null = null;
    try {
      if (project.data) parsed = JSON.parse(project.data) as Project;
    } catch {
      return;
    }
    if (!parsed) return;
    const next = buildCalendarEventForTask(
      project,
      parsed,
      detailEvent.phaseOrder,
      detailEvent.taskOrder,
    );
    if (!next) return;
    setDetailEvent((prev) => {
      if (!prev || prev.id !== next.id) return prev;
      if (
        prev.timeStr === next.timeStr &&
        prev.endTimeStr === next.endTimeStr &&
        dateKey(prev.date) === dateKey(next.date) &&
        prev.taskName === next.taskName &&
        prev.phaseName === next.phaseName &&
        prev.completed === next.completed &&
        prev.taskDescription === next.taskDescription
      ) {
        return prev;
      }
      return next;
    });
  }, [
    project.data,
    detailOpen,
    detailEvent?.phaseOrder,
    detailEvent?.taskOrder,
    project._id,
    project.projectName,
    project.summaryName,
  ]);

  const subtasksByKey = useMemo(() => {
    const map = new Map<
      string,
      {
        _id: string;
        title: string;
        completed: boolean;
        createdAt: number;
      }[]
    >();
    if (!projectSubtasks) return map;
    for (const entry of projectSubtasks) {
      const key = `${entry.phaseOrder}:${entry.taskOrder}`;
      map.set(key, entry.subtasks);
    }
    return map;
  }, [projectSubtasks]);

  const handleRequestToggle = (task: TaskRef) => {
    setPendingTask(task);
  };

  const handleConfirm = async () => {
    if (!pendingTask) return;
    await onTaskCompleted?.(
      pendingTask.phaseOrder,
      pendingTask.taskOrder,
      !pendingTask.completed,
    );
    setPendingTask(null);
  };

  const handleCancel = () => {
    setPendingTask(null);
  };

  const openNewTaskDialog = (phaseOrder?: number) => {
    const todayIso = new Date().toISOString().slice(0, 10);
    setNewTaskPhaseSelect(
      phaseOrder !== undefined ? String(phaseOrder) : "__none__",
    );
    setNewTaskDialogOpen(true);
    setNewTaskName("");
    setNewTaskDescription("");
    setNewTaskDate(todayIso);
    setNewTaskTime("09:00");
    setNewTaskEndTime(addOneHourFromTime("09:00"));
    setNewTaskDatePickerOpen(false);
  };

  const closeNewTaskDialog = () => {
    setNewTaskDialogOpen(false);
    setNewTaskDatePickerOpen(false);
  };

  const handleCreateTask = async () => {
    if (!ready || !convex || !parsedProject || !newTaskDialogOpen) {
      return;
    }
    const name = newTaskName.trim();
    const date = newTaskDate.trim();
    if (!name || !date) return;
    if (
      newTaskPhaseSelect !== "__none__" &&
      !phases.some((p) => String(p.order) === newTaskPhaseSelect)
    ) {
      return;
    }
    const startParts = parseTime24(newTaskTime.trim()) ?? { h: 9, m: 0 };
    const timeNorm = formatTime24(startParts.h, snapMinuteToStep(startParts.m));
    const endParts = parseTime24(newTaskEndTime.trim());
    if (!endParts) return;
    const endNorm = formatTime24(endParts.h, snapMinuteToStep(endParts.m));

    setCreatingTask(true);
    try {
      const newEntry = {
        order: 0,
        name,
        description: newTaskDescription.trim(),
        date,
        time: timeNorm,
        endTime: endNorm,
        completed: false,
      };

      const updated: Project =
        newTaskPhaseSelect === "__none__"
          ? {
              ...parsedProject,
              unassigned_tasks: [
                ...(parsedProject.unassigned_tasks ?? []),
                newEntry,
              ],
            }
          : {
              ...parsedProject,
              project_wbs: parsedProject.project_wbs.map((phase) => {
                if (phase.order !== Number(newTaskPhaseSelect)) return phase;
                const tasks = (phase.tasks ?? []).slice();
                return {
                  ...phase,
                  tasks: [...tasks, newEntry],
                };
              }) as Project["project_wbs"],
            };

      const dataStr = JSON.stringify(updated);
      await convex.mutation(api.projects.update, {
        projectId: project._id as Id<"projects">,
        data: dataStr,
      });
      closeNewTaskDialog();
    } finally {
      setCreatingTask(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage and track project tasks
      </p>
      {!phases.length && (
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-muted-foreground">
          <CheckSquare className="mb-3 size-10" />
          <p className="text-sm font-medium">No phases yet</p>
          <p className="mt-1 text-xs">
            Start by adding phases in the Overview tab, then come back here to
            create tasks.
          </p>
        </div>
      )}
      <div className="mt-6 space-y-6">
        {(() => {
          const unassigned = (parsedProject?.unassigned_tasks ?? [])
            .slice()
            .sort((a, b) => a.order - b.order);
          if (unassigned.length === 0) return null;
          const phaseKey = UNASSIGNED_PHASE_ORDER;
          return (
            <div
              key="unassigned-tasks"
              className="rounded-xl border border-dashed border-border bg-muted/10 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium text-muted-foreground">
                <div className="flex min-w-0 items-center gap-2">
                  <Layers className="size-4 shrink-0" />
                  <span className="truncate text-foreground">Unassigned</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className={projectPrimaryButtonClassName}
                  onClick={() => openNewTaskDialog()}
                >
                  <Plus className="size-4" aria-hidden />
                  Add task
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Tasks without a phase still appear on your calendar and can be
                moved into a phase later.
              </p>
              <div className="mt-3 space-y-2 md:hidden">
                {unassigned.map((task, taskIndex) => {
                  const isCompleted = Boolean(
                    (task as { completed?: boolean }).completed,
                  );
                  const key = `${phaseKey}:${task.order}`;
                  const subtasksForTask = subtasksByKey.get(key) ?? [];
                  const hasSubtasks = subtasksForTask.length > 0;
                  const displayNum = taskIndex + 1;
                  return (
                    <div
                      key={key}
                      role="button"
                      tabIndex={0}
                      className="w-full min-w-0 rounded-lg border border-border/70 bg-muted/30 p-3 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() =>
                        handleRequestToggle({
                          phaseOrder: phaseKey,
                          taskOrder: task.order,
                          taskName: task.name,
                          completed: isCompleted,
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleRequestToggle({
                            phaseOrder: phaseKey,
                            taskOrder: task.order,
                            taskName: task.name,
                            completed: isCompleted,
                          });
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-start gap-2">
                          {isCompleted ? (
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                          ) : (
                            <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-medium leading-snug">
                              {task.name}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex shrink-0 rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-foreground/85">
                                #{displayNum}
                              </span>
                              <span className="inline-flex max-w-full shrink-0 items-center rounded-md border border-border/60 bg-background/90 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                                {formatTaskDateLabel(task.date)}
                              </span>
                              <span className="inline-flex min-w-0 max-w-full items-center rounded-md border border-border/60 bg-background/90 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                                {(task as { endTime?: string }).endTime
                                  ? `${task.time} – ${(task as { endTime?: string }).endTime}`
                                  : task.time}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            const date = new Date(task.date + "T00:00:00");
                            const taskWithEnd = task as {
                              endTime?: string;
                              description?: string;
                            };
                            const eventForDialog: CalendarEvent = {
                              id: `${project._id}-${phaseKey}-${task.order}`,
                              projectId: project._id,
                              projectName:
                                project.projectName || project.summaryName,
                              phaseName: "Unassigned",
                              taskName: task.name,
                              taskDescription: taskWithEnd.description,
                              date,
                              timeStr: task.time,
                              ...(taskWithEnd.endTime
                                ? { endTimeStr: taskWithEnd.endTime }
                                : {}),
                              colorIndex: 0,
                              completed: isCompleted,
                              phaseOrder: phaseKey,
                              taskOrder: task.order,
                            };
                            setDetailEvent(eventForDialog);
                            setDetailOpen(true);
                          }}
                        >
                          <MoreVertical className="size-4" />
                          <span className="sr-only">
                            View details and subtasks
                          </span>
                        </Button>
                      </div>
                      {hasSubtasks && (
                        <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                          {subtasksForTask.slice(0, 3).map((subtask) => (
                            <div
                              key={subtask._id}
                              className="flex items-center gap-2 text-[11px] text-muted-foreground"
                            >
                              {subtask.completed ? (
                                <CheckCircle2 className="size-3 text-emerald-500" />
                              ) : (
                                <Circle className="size-3" />
                              )}
                              <span
                                className={cn(
                                  subtask.completed &&
                                    "line-through text-muted-foreground/70",
                                )}
                              >
                                {subtask.title}
                              </span>
                            </div>
                          ))}
                          {subtasksForTask.length > 3 && (
                            <p className="text-[11px] text-muted-foreground">
                              +{subtasksForTask.length - 3} more subtasks
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 hidden md:block">
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">Status</TableHead>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead className="min-w-[8rem]">Task</TableHead>
                      <TableHead className="min-w-[9rem] max-w-[11rem]">
                        When
                      </TableHead>
                      <TableHead className="w-20 text-right">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unassigned.map((task, taskIndex) => {
                      const isCompleted = Boolean(
                        (task as { completed?: boolean }).completed,
                      );
                      const key = `${phaseKey}:${task.order}`;
                      const subtasksForTask = subtasksByKey.get(key) ?? [];
                      const displayNum = taskIndex + 1;
                      return (
                        <Fragment key={key}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() =>
                              handleRequestToggle({
                                phaseOrder: phaseKey,
                                taskOrder: task.order,
                                taskName: task.name,
                                completed: isCompleted,
                              })
                            }
                          >
                            <TableCell className="w-10 align-middle">
                              {isCompleted ? (
                                <CheckCircle2 className="size-4 text-emerald-500" />
                              ) : (
                                <Circle className="size-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell className="w-8 font-medium text-muted-foreground">
                              {displayNum}
                            </TableCell>
                            <TableCell className="max-w-[min(28rem,45vw)] font-medium">
                              <span className="line-clamp-2 break-words">
                                {task.name}
                              </span>
                            </TableCell>
                            <TableCell className="align-top text-muted-foreground">
                              <div className="flex min-w-0 flex-col gap-0.5 text-xs leading-tight">
                                <span className="tabular-nums">
                                  {formatTaskDateLabel(task.date)}
                                </span>
                                <span className="break-words text-[11px] opacity-90">
                                  {(task as { endTime?: string }).endTime
                                    ? `${task.time} – ${(task as { endTime?: string }).endTime}`
                                    : task.time}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const date = new Date(
                                    task.date + "T00:00:00",
                                  );
                                  const taskWithEnd = task as {
                                    endTime?: string;
                                    description?: string;
                                  };
                                  const eventForDialog: CalendarEvent = {
                                    id: `${project._id}-${phaseKey}-${task.order}`,
                                    projectId: project._id,
                                    projectName:
                                      project.projectName ||
                                      project.summaryName,
                                    phaseName: "Unassigned",
                                    taskName: task.name,
                                    taskDescription: taskWithEnd.description,
                                    date,
                                    timeStr: task.time,
                                    ...(taskWithEnd.endTime
                                      ? { endTimeStr: taskWithEnd.endTime }
                                      : {}),
                                    colorIndex: 0,
                                    completed: isCompleted,
                                    phaseOrder: phaseKey,
                                    taskOrder: task.order,
                                  };
                                  setDetailEvent(eventForDialog);
                                  setDetailOpen(true);
                                }}
                              >
                                <MoreVertical className="size-4" />
                                <span className="sr-only">
                                  View details and subtasks
                                </span>
                              </Button>
                            </TableCell>
                          </TableRow>
                          {subtasksForTask.length > 0 && (
                            <TableRow className="bg-muted/30">
                              <TableCell colSpan={5} className="align-top">
                                <div className="pl-8 space-y-1">
                                  {subtasksForTask.map((subtask) => (
                                    <div
                                      key={subtask._id}
                                      className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/70"
                                    >
                                      {subtask.completed ? (
                                        <CheckCircle2 className="size-3 text-emerald-500" />
                                      ) : (
                                        <Circle className="size-3" />
                                      )}
                                      <span
                                        className={cn(
                                          subtask.completed &&
                                            "line-through text-muted-foreground/70",
                                        )}
                                      >
                                        {subtask.title}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          );
        })()}
        {phases.map((phase, phaseIndex) => {
          const tasks = (phase.tasks ?? [])
            .slice()
            .sort((a, b) => a.order - b.order);
          return (
            <div
              key={phaseIndex}
              className="rounded-xl border border-border bg-card p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium text-muted-foreground">
                <div className="flex min-w-0 items-center gap-2">
                  <Layers className="size-4 shrink-0" />
                  <span className="truncate text-foreground">{phase.name}</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className={projectPrimaryButtonClassName}
                  onClick={() => openNewTaskDialog(phase.order)}
                >
                  <Plus className="size-4" aria-hidden />
                  Add task
                </Button>
              </div>
              {phase.description ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {phase.description}
                </p>
              ) : null}
              {/* Mobile: stacked task cards */}
              <div className="mt-3 space-y-2 md:hidden">
                {tasks.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
                    No tasks in this phase yet. Tap{" "}
                    <span className="font-medium text-foreground">
                      + Add task
                    </span>{" "}
                    above.
                  </p>
                ) : null}
                {tasks.map((task, taskIndex) => {
                  const isCompleted = Boolean(
                    (task as { completed?: boolean }).completed,
                  );
                  const key = `${phase.order}:${task.order}`;
                  const subtasksForTask = subtasksByKey.get(key) ?? [];
                  const hasSubtasks = subtasksForTask.length > 0;
                  const displayNum = taskIndex + 1;

                  return (
                    <div
                      key={key}
                      role="button"
                      tabIndex={0}
                      className="w-full min-w-0 rounded-lg border border-border/70 bg-muted/30 p-3 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() =>
                        handleRequestToggle({
                          phaseOrder: phase.order,
                          taskOrder: task.order,
                          taskName: task.name,
                          completed: isCompleted,
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleRequestToggle({
                            phaseOrder: phase.order,
                            taskOrder: task.order,
                            taskName: task.name,
                            completed: isCompleted,
                          });
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-start gap-2">
                          {isCompleted ? (
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                          ) : (
                            <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-medium leading-snug">
                              {task.name}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex shrink-0 rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-foreground/85">
                                #{displayNum}
                              </span>
                              <span className="inline-flex max-w-full shrink-0 items-center rounded-md border border-border/60 bg-background/90 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                                {formatTaskDateLabel(task.date)}
                              </span>
                              <span className="inline-flex min-w-0 max-w-full items-center rounded-md border border-border/60 bg-background/90 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                                {(task as { endTime?: string }).endTime
                                  ? `${task.time} – ${(task as { endTime?: string }).endTime}`
                                  : task.time}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            const date = new Date(task.date + "T00:00:00");
                            const taskWithEnd = task as {
                              endTime?: string;
                              description?: string;
                            };
                            const eventForDialog: CalendarEvent = {
                              id: `${project._id}-${phase.order}-${task.order}`,
                              projectId: project._id,
                              projectName:
                                project.projectName || project.summaryName,
                              phaseName: phase.name,
                              taskName: task.name,
                              taskDescription: taskWithEnd.description,
                              date,
                              timeStr: task.time,
                              ...(taskWithEnd.endTime
                                ? { endTimeStr: taskWithEnd.endTime }
                                : {}),
                              colorIndex: 0,
                              completed: isCompleted,
                              phaseOrder: phase.order,
                              taskOrder: task.order,
                            };
                            setDetailEvent(eventForDialog);
                            setDetailOpen(true);
                          }}
                        >
                          <MoreVertical className="size-4" />
                          <span className="sr-only">
                            View details and subtasks
                          </span>
                        </Button>
                      </div>
                      {hasSubtasks && (
                        <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                          {subtasksForTask.slice(0, 3).map((subtask) => (
                            <div
                              key={subtask._id}
                              className="flex items-center gap-2 text-[11px] text-muted-foreground"
                            >
                              {subtask.completed ? (
                                <CheckCircle2 className="size-3 text-emerald-500" />
                              ) : (
                                <Circle className="size-3" />
                              )}
                              <span
                                className={cn(
                                  subtask.completed &&
                                    "line-through text-muted-foreground/70",
                                )}
                              >
                                {subtask.title}
                              </span>
                            </div>
                          ))}
                          {subtasksForTask.length > 3 && (
                            <p className="text-[11px] text-muted-foreground">
                              +{subtasksForTask.length - 3} more subtasks
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop: table layout */}
              <div className="mt-3 hidden md:block">
                {tasks.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-8 text-center text-sm text-muted-foreground">
                    No tasks in this phase yet. Use{" "}
                    <span className="font-medium text-foreground">
                      + Add task
                    </span>{" "}
                    to create one.
                  </p>
                ) : (
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">Status</TableHead>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead className="min-w-[8rem]">Task</TableHead>
                        <TableHead className="min-w-[9rem] max-w-[11rem]">
                          When
                        </TableHead>
                        <TableHead className="w-20 text-right">
                          Details
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tasks.map((task, taskIndex) => {
                        const isCompleted = Boolean(
                          (task as { completed?: boolean }).completed,
                        );
                        const key = `${phase.order}:${task.order}`;
                        const subtasksForTask = subtasksByKey.get(key) ?? [];
                        const displayNum = taskIndex + 1;

                        return (
                          <Fragment key={key}>
                            <TableRow
                              className="cursor-pointer hover:bg-muted/40"
                              onClick={() =>
                                handleRequestToggle({
                                  phaseOrder: phase.order,
                                  taskOrder: task.order,
                                  taskName: task.name,
                                  completed: isCompleted,
                                })
                              }
                            >
                              <TableCell className="w-10 align-middle">
                                {isCompleted ? (
                                  <CheckCircle2 className="size-4 text-emerald-500" />
                                ) : (
                                  <Circle className="size-4 text-muted-foreground" />
                                )}
                              </TableCell>
                              <TableCell className="w-8 font-medium text-muted-foreground">
                                {displayNum}
                              </TableCell>
                              <TableCell className="max-w-[min(28rem,45vw)] font-medium">
                                <span className="line-clamp-2 break-words">
                                  {task.name}
                                </span>
                              </TableCell>
                              <TableCell className="align-top text-muted-foreground">
                                <div className="flex min-w-0 flex-col gap-0.5 text-xs leading-tight">
                                  <span className="tabular-nums">
                                    {formatTaskDateLabel(task.date)}
                                  </span>
                                  <span className="break-words text-[11px] opacity-90">
                                    {(task as { endTime?: string }).endTime
                                      ? `${task.time} – ${(task as { endTime?: string }).endTime}`
                                      : task.time}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const date = new Date(
                                      task.date + "T00:00:00",
                                    );
                                    const taskWithEnd = task as {
                                      endTime?: string;
                                      description?: string;
                                    };
                                    const eventForDialog: CalendarEvent = {
                                      id: `${project._id}-${phase.order}-${task.order}`,
                                      projectId: project._id,
                                      projectName:
                                        project.projectName ||
                                        project.summaryName,
                                      phaseName: phase.name,
                                      taskName: task.name,
                                      taskDescription: taskWithEnd.description,
                                      date,
                                      timeStr: task.time,
                                      ...(taskWithEnd.endTime
                                        ? { endTimeStr: taskWithEnd.endTime }
                                        : {}),
                                      colorIndex: 0,
                                      completed: isCompleted,
                                      phaseOrder: phase.order,
                                      taskOrder: task.order,
                                    };
                                    setDetailEvent(eventForDialog);
                                    setDetailOpen(true);
                                  }}
                                >
                                  <MoreVertical className="size-4" />
                                  <span className="sr-only">
                                    View details and subtasks
                                  </span>
                                </Button>
                              </TableCell>
                            </TableRow>
                            {subtasksForTask.length > 0 && (
                              <TableRow className="bg-muted/30">
                                <TableCell colSpan={5} className="align-top">
                                  <div className="pl-8 space-y-1">
                                    {subtasksForTask.map((subtask) => (
                                      <div
                                        key={subtask._id}
                                        className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/70"
                                      >
                                        {subtask.completed ? (
                                          <CheckCircle2 className="size-3 text-emerald-500" />
                                        ) : (
                                          <Circle className="size-3" />
                                        )}
                                        <span
                                          className={cn(
                                            subtask.completed &&
                                              "line-through text-muted-foreground/70",
                                          )}
                                        >
                                          {subtask.title}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <AlertDialog open={!!pendingTask} onOpenChange={handleCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingTask?.completed
                ? "Mark task as not done?"
                : "Mark task as done?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTask
                ? pendingTask.completed
                  ? `Do you want to mark “${pendingTask.taskName}” as not completed?`
                  : `Do you want to mark “${pendingTask.taskName}” as completed?`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }),
                projectPrimaryButtonClassName,
              )}
            >
              {pendingTask?.completed ? "Mark as not done" : "Mark as done"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <TaskDetailDialog
        event={detailEvent}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />

      <Dialog
        open={newTaskDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeNewTaskDialog();
        }}
      >
        <DialogContent
          showCloseButton
          className={cn(
            "flex max-h-[min(92dvh,92vh)] w-[min(100%,calc(100vw-1rem))] max-w-md flex-col gap-0 overflow-hidden border-border bg-card p-0 sm:max-w-md",
          )}
        >
          <DialogHeader className="shrink-0 space-y-1 border-b border-border bg-muted/30 px-6 py-4 pr-14 text-left">
            <DialogTitle className="text-lg">New task</DialogTitle>
            <DialogDescription>
              Set when this task happens. You can edit details later from the
              task menu.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Phase
                </label>
                <Select
                  value={newTaskPhaseSelect}
                  onValueChange={setNewTaskPhaseSelect}
                >
                  <SelectTrigger className="h-10 bg-background">
                    <SelectValue placeholder="Choose phase" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No phase</SelectItem>
                    {phases.map((p) => (
                      <SelectItem key={p.order} value={String(p.order)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Title
                </label>
                <Input
                  autoFocus
                  placeholder="What needs to be done?"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  className="h-10 bg-background"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Description{" "}
                  <span className="font-normal opacity-80">(optional)</span>
                </label>
                <Textarea
                  rows={3}
                  placeholder="Context, acceptance criteria, links…"
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  className="resize-none bg-background text-sm"
                />
              </div>
              <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Schedule
                </p>
                <div className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Date
                  </span>
                  <Popover
                    open={newTaskDatePickerOpen}
                    onOpenChange={setNewTaskDatePickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 w-full justify-start gap-2 border-border bg-background text-left font-normal"
                      >
                        <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">
                          {parseISODate(newTaskDate)
                            ? parseISODate(newTaskDate)!.toLocaleDateString(
                                "en-US",
                                {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                },
                              )
                            : "Pick a date"}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={parseISODate(newTaskDate)}
                        onSelect={(d) => {
                          if (d) {
                            setNewTaskDate(d.toISOString().slice(0, 10));
                            setNewTaskDatePickerOpen(false);
                          }
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <ScheduleTimeSelects
                  label="Start time"
                  value={newTaskTime}
                  onChange={setNewTaskTime}
                />
                <div className="space-y-2 border-t border-border/60 pt-4">
                  <ScheduleTimeSelects
                    label="End time"
                    value={newTaskEndTime}
                    onChange={setNewTaskEndTime}
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter
            className={cn(
              "shrink-0 gap-2 border-t border-border bg-muted/20 px-6 py-4 sm:justify-end",
              "pb-[max(1rem,env(safe-area-inset-bottom))]",
            )}
          >
            <Button
              variant="outline"
              onClick={closeNewTaskDialog}
              disabled={creatingTask}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className={projectPrimaryButtonClassName}
              onClick={handleCreateTask}
              disabled={creatingTask}
            >
              {creatingTask ? "Creating…" : "Create task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { CheckSquare, Layers, CheckCircle2, Circle, MoreVertical } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { TaskDetailDialog } from "@/components/calendar/task-detail-dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CalendarEvent } from "@/lib/calendar-utils";
import type { Project } from "@/lib/project-schema";
import type { ProjectData } from "@/components/project-page/types";

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

export function TasksSection({ project, onTaskCompleted }: TasksSectionProps) {
  const { sessionToken } = useAuth();

  let parsedProject: Project | null = null;
  try {
    if (project.data) parsedProject = JSON.parse(project.data) as Project;
  } catch {
    // data may be empty or invalid
  }

  const phases =
    parsedProject?.project_wbs?.slice().sort((a, b) => a.order - b.order) ?? [];
  const hasTasks = phases.some((p) => p.tasks?.length);

  const [pendingTask, setPendingTask] = useState<TaskRef | null>(null);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const projectSubtasks = useQuery(
    api.tasks.listSubtasksForProject,
    sessionToken
      ? { token: sessionToken, projectId: project._id as Id<"projects"> }
      : "skip",
  );

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

  if (!hasTasks) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage and track project tasks
        </p>
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-muted-foreground">
          <CheckSquare className="mb-3 size-10" />
          <p className="text-sm font-medium">No tasks yet</p>
          <p className="mt-1 text-xs">
            Generate the project from the sidebar to create tasks.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage and track project tasks
      </p>
      <div className="mt-6 space-y-6">
        {phases.map((phase, phaseIndex) => {
          const tasks = (phase.tasks ?? [])
            .slice()
            .sort((a, b) => a.order - b.order);
          if (tasks.length === 0) return null;
          return (
            <div
              key={phaseIndex}
              className="rounded-xl border border-border bg-card p-5"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Layers className="size-4" />
                {phase.name}
              </div>
              {phase.description ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {phase.description}
                </p>
              ) : null}
              <div className="mt-3">
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">Status</TableHead>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Task</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead className="w-20 text-right">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task) => {
                      const isCompleted = Boolean(
                        (task as { completed?: boolean }).completed,
                      );
                      const key = `${phase.order}:${task.order}`;
                      const subtasksForTask = subtasksByKey.get(key) ?? [];

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
                              {task.order + 1}
                            </TableCell>
                            <TableCell className="font-medium">
                              {task.name}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {task.date}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {(task as { endTime?: string }).endTime
                                ? `${task.time} – ${(task as { endTime?: string }).endTime}`
                                : task.time}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const date = new Date(task.date + "T00:00:00");
                                  const taskWithEnd = task as { endTime?: string };
                                  const eventForDialog: CalendarEvent = {
                                    id: `${project._id}-${phase.order}-${task.order}`,
                                    projectId: project._id,
                                    projectName:
                                      project.projectName || project.summaryName,
                                    phaseName: phase.name,
                                    taskName: task.name,
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
                              <TableCell colSpan={6} className="align-top">
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
            <AlertDialogAction onClick={handleConfirm}>
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
    </div>
  );
}


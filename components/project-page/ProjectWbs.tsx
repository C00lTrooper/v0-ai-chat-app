"use client";

import { useState } from "react";
import type { Project } from "@/lib/project-schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
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
import { CheckCircle2, Circle } from "lucide-react";

type ProjectWbsProps = {
  project: Project;
};

type TaskRef = {
  phaseIndex: number;
  taskOrder: number;
  taskName: string;
};

function formatDate(date: string) {
  return date;
}

export function ProjectWbs({ project }: ProjectWbsProps) {
  const phases = project.project_wbs.slice().sort((a, b) => a.order - b.order);

  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [pendingTask, setPendingTask] = useState<TaskRef | null>(null);

  const makeTaskId = (phaseIndex: number, taskOrder: number) =>
    `${phaseIndex}-${taskOrder}`;

  const handleRequestComplete = (task: TaskRef) => {
    const id = makeTaskId(task.phaseIndex, task.taskOrder);
    if (completed[id]) return;
    setPendingTask(task);
  };

  const handleConfirm = () => {
    if (!pendingTask) return;
    const id = makeTaskId(pendingTask.phaseIndex, pendingTask.taskOrder);
    setCompleted((prev) => ({ ...prev, [id]: true }));
    setPendingTask(null);
  };

  const handleCancel = () => {
    setPendingTask(null);
  };

  return (
    <section aria-labelledby="project-wbs-heading" className="space-y-4">
      <h2
        id="project-wbs-heading"
        className="text-lg font-semibold tracking-tight"
      >
        WBS - Task Breakdown
      </h2>

      <div className="space-y-4">
        {phases.map((phase, phaseIndex) => (
          <Card key={phase.order}>
            <CardHeader>
              <CardTitle className="text-base font-medium">
                Phase {phaseIndex + 1} - {phase.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">{phase.description}</p>

              <Table>
                <TableBody>
                  {phase.tasks?.map((task) => {
                    const label = `${phaseIndex + 1}.${task.order}`;
                    const id = makeTaskId(phaseIndex, task.order);
                    const isCompleted =
                      !!completed[id] ||
                      Boolean((task as { completed?: boolean }).completed);

                    return (
                      <TableRow
                        key={task.order}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() =>
                          !isCompleted &&
                          handleRequestComplete({
                            phaseIndex,
                            taskOrder: task.order,
                            taskName: task.name,
                          })
                        }
                      >
                        <TableCell className="w-6 align-middle">
                          {isCompleted ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="w-24 text-muted-foreground">
                          {label}
                        </TableCell>
                        <TableCell className="font-medium">
                          {task.name}
                        </TableCell>
                        <TableCell className="w-40 text-right text-muted-foreground">
                          {(task as { endTime?: string }).endTime
                            ? `${formatDate(task.date)} ${task.time} – ${(task as { endTime?: string }).endTime}`
                            : `${formatDate(task.date)} ${task.time}`}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={!!pendingTask} onOpenChange={handleCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark task as done?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTask
                ? `Do you want to mark “${pendingTask.taskName}” as completed?`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              Mark as done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

"use client";

import type { Project } from "@/lib/project-schema";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, Circle } from "lucide-react";

type ProjectWbsProps = {
  project: Project;
};

function formatDate(date: string) {
  return date;
}

export function ProjectWbs({ project }: ProjectWbsProps) {
  const phases = project.project_wbs.slice().sort((a, b) => a.order - b.order);

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
                    // Placeholder: all tasks start as planned (not yet completed).
                    const isCompleted = false;

                    return (
                      <TableRow key={task.order}>
                        <TableCell className="w-24 text-muted-foreground">
                          {label}
                        </TableCell>
                        <TableCell className="font-medium">
                          {task.name}
                        </TableCell>
                        <TableCell className="w-40 text-right text-muted-foreground">
                          {`${formatDate(task.date)} ${task.time}`}
                        </TableCell>
                        <TableCell className="w-6 text-right">
                          {isCompleted ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground" />
                          )}
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
    </section>
  );
}


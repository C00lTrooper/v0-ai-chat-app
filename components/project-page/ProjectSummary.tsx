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

type ProjectSummaryProps = {
  project: Project;
};

export function ProjectSummary({ project }: ProjectSummaryProps) {
  const summary = project.project_summary;

  return (
    <section aria-labelledby="project-summary-heading" className="space-y-4">
      <h2
        id="project-summary-heading"
        className="text-lg font-semibold tracking-tight"
      >
        Project Summary
      </h2>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            {summary.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table className="text-sm">
            <TableBody>
              <TableRow>
                <TableCell className="w-40 font-medium text-muted-foreground">
                  Name
                </TableCell>
                <TableCell>{summary.name}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-muted-foreground">
                  Objective
                </TableCell>
                <TableCell className="max-w-xl">
                  <p className="leading-relaxed">{summary.objective}</p>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-muted-foreground">
                  Duration
                </TableCell>
                <TableCell>{summary.duration} days</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-muted-foreground">
                  Target date
                </TableCell>
                <TableCell>{summary.target_date}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-muted-foreground">
                  Estimated budget
                </TableCell>
                <TableCell>${summary.estimated_budget.toLocaleString()}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}


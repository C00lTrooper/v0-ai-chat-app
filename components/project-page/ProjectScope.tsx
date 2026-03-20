"use client";

import type { Project } from "@/lib/project-schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

type ProjectScopeProps = {
  project: Project;
};

export function ProjectScope({ project }: ProjectScopeProps) {
  const features = project.project_wbs
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((phase, index) => ({
      id: index + 1,
      name: phase.name,
      description: phase.description,
    }));

  return (
    <section aria-labelledby="project-scope-heading" className="space-y-4">
      <h2
        id="project-scope-heading"
        className="text-lg font-semibold tracking-tight"
      >
        Project Scope
      </h2>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Project Phases
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table className="text-sm">
            <TableBody>
              {features.map((feature) => (
                <TableRow key={feature.id}>
                  <TableCell className="w-32 font-medium text-muted-foreground">
                    Phase {feature.id}
                  </TableCell>
                  <TableCell className="font-medium">{feature.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {feature.description}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}

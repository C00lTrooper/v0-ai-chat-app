"use client";

import type { Project } from "@/lib/project-schema";
import { ProjectSummary } from "./ProjectSummary";
import { ProjectScope } from "./ProjectScope";
import { ProjectWbs } from "./ProjectWbs";

type ProjectPlanPageProps = {
  project: Project;
};

export function ProjectPlanPage({ project }: ProjectPlanPageProps) {
  return (
    <main className="min-h-dvh bg-muted/40 px-4 py-8 md:px-8 lg:px-16">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Project Plan: {project.project_name}
          </h1>
        </header>

        <div className="space-y-8">
          <ProjectSummary project={project} />
          <ProjectScope project={project} />
          <ProjectWbs project={project} />
        </div>
      </div>
    </main>
  );
}


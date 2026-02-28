"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderOpen, Calendar, ExternalLink } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";

type ProjectMeta = {
  slug: string;
  project_name: string;
  summary_name: string;
  objective: string;
  target_date: string;
};

export function ProjectsView() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.projects)) {
          setProjects(data.projects);
        } else {
          setError(data.error ?? "Failed to load projects");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? "Failed to load projects");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen className="size-6 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>
              Projects created from chat will appear here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        {projects.map((p) => (
          <Card key={p.slug} className="transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate text-base">
                    {p.project_name || p.summary_name}
                  </CardTitle>
                  {p.summary_name && p.summary_name !== p.project_name && (
                    <CardDescription className="mt-0.5 truncate">
                      {p.summary_name}
                    </CardDescription>
                  )}
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/projects/${p.slug}`} className="gap-1.5">
                    View
                    <ExternalLink className="size-3.5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {p.objective && (
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {p.objective}
                </p>
              )}
              {p.target_date && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="size-3.5" />
                  Target: {p.target_date}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}

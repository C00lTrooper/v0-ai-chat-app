"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderOpen, Calendar, ExternalLink, MessageSquare } from "lucide-react";
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
import { useAuth } from "@/components/auth-provider";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type ProjectMeta = {
  _id: string;
  slug: string;
  projectName: string;
  summaryName: string;
  objective: string;
  targetDate: string;
  isOwner: boolean;
};

interface ProjectsViewProps {
  onOpenChat?: (projectId: Id<"projects">) => void;
}

export function ProjectsView({ onOpenChat }: ProjectsViewProps) {
  const { sessionToken } = useAuth();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionToken || !convexClient) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const result = await convexClient.query(api.projects.list, {
          token: sessionToken,
        });
        if (!cancelled) setProjects(result);
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load projects",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

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
          <Card key={p._id} className="transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate text-base">
                    {p.projectName || p.summaryName}
                  </CardTitle>
                  {p.summaryName && p.summaryName !== p.projectName && (
                    <CardDescription className="mt-0.5 truncate">
                      {p.summaryName}
                    </CardDescription>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {onOpenChat && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      onClick={() =>
                        onOpenChat(p._id as Id<"projects">)
                      }
                    >
                      <MessageSquare className="size-3.5" />
                      Chat
                    </Button>
                  )}
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/projects/${p.slug}`} className="gap-1.5">
                      View
                      <ExternalLink className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {p.objective && (
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {p.objective}
                </p>
              )}
              {p.targetDate && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="size-3.5" />
                  Target: {p.targetDate}
                </div>
              )}
              {!p.isOwner && (
                <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  Shared with you
                </span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}

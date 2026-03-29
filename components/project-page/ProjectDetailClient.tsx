"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useConvex, useConvexAuth } from "convex/react";
import { useRedirectIfSignedOut } from "@/hooks/use-redirect-if-signed-out";
import { ConvexSessionShell } from "@/components/convex-session-shell";
import { api } from "@/convex/_generated/api";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, } from "@/components/ui/alert-dialog";
import { ProjectPlanPage } from "./ProjectPlanPage";
import type { Project } from "@/lib/project-schema";
import type { Id } from "@/convex/_generated/dataModel";

export function ProjectDetailClient({ slug }: { slug: string }) {
  useRedirectIfSignedOut();
  const { isAuthenticated } = useConvexAuth();
  const convex = useConvex();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [projectId, setProjectId] = useState<Id<"projects"> | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    void (async () => {
      try {
        const result = await convex.query(api.projects.getBySlug, {
          slug,
        });
        if (cancelled) return;

        if (result) {
          setProject(JSON.parse(result.data) as Project);
          setProjectId(result._id as Id<"projects">);
          setIsOwner(!!result.isOwner);
        } else {
          setNotFound(true);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, isAuthenticated, convex]);

  const handleDelete = useCallback(async () => {
    if (!isAuthenticated || !projectId) return;
    setIsDeleting(true);
    try {
      await convex.mutation(api.projects.remove, {
        projectId,
      });
      router.push("/");
    } finally {
      setIsDeleting(false);
    }
  }, [isAuthenticated, projectId, router, convex]);

  return (
    <ConvexSessionShell>
      {loading ? (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
      ) : notFound || !project ? (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Project not found.</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/" className="gap-1.5">
            <ChevronLeft className="size-4" />
            Back to Chat
          </Link>
        </Button>
      </div>
      ) : (
    <>
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/" className="gap-1.5">
              <ChevronLeft className="size-4" />
              Back to Chat
            </Link>
          </Button>

          <div className="flex items-center gap-2">
            {projectId && (
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link href={`/?projectId=${projectId}`}>
                  <MessageSquare className="size-3.5" />
                  Open Chat
                </Link>
              </Button>
            )}

            {isOwner && projectId && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={isDeleting}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete this project?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the project and its shared
                    access. Chat history may still remain, but this project
                    overview will no longer be available. This action cannot be
                    undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    Delete project
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          </div>
        </div>
      </div>
      <ProjectPlanPage project={project} />
    </>
      )}
    </ConvexSessionShell>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatHeader } from "@/components/chat-header";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  CheckSquare,
  MessageSquare,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Sparkles,
  GanttChart,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import { TimelineSection } from "@/components/project-page/TimelineSection";
import { OverviewSection } from "@/components/project-page/OverviewSection";
import { TasksSection } from "@/components/project-page/TasksSection";
import { ChatSection } from "@/components/project-page/ChatSection";
import { SettingsSection } from "@/components/project-page/SettingsSection";
import type { Project } from "@/lib/project-schema";
import type { ProjectData, Section } from "@/components/project-page/types";

type NavItem = {
  id: Section;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "timeline", label: "Timeline", icon: GanttChart },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "settings", label: "Settings", icon: Settings },
];

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function ProjectPageSkeleton() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <ChatHeader hasMessages={false} onClear={() => {}} />
      <div className="flex min-h-0 flex-1 overflow-hidden pt-14">
        <aside className="flex min-h-0 w-48 shrink-0 flex-col overflow-y-hidden border-r border-border bg-muted/30 sm:w-56 md:w-64">
          <div className="space-y-1 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2">
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto p-8">
          <Skeleton className="mb-2 h-8 w-48" />
          <Skeleton className="mb-8 h-4 w-72" />
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
            </div>
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section placeholders
// ---------------------------------------------------------------------------

function SectionContent({
  section,
  project,
  onTaskCompleted,
}: {
  section: Section;
  project: ProjectData;
  onTaskCompleted?: (
    phaseOrder: number,
    taskOrder: number,
    completed: boolean,
  ) => Promise<void> | void;
}) {
  switch (section) {
    case "overview":
      return <OverviewSection project={project} />;
    case "tasks":
      return (
        <TasksSection project={project} onTaskCompleted={onTaskCompleted} />
      );
    case "chat":
      return <ChatSection project={project} />;
    case "timeline":
      return <TimelineSection project={project} />;
    case "settings":
      return <SettingsSection />;
  }
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function ProjectPageClient({ projectId }: { projectId: string }) {
  const { isAuthenticated, sessionToken } = useAuth();
  const router = useRouter();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const sidebarMinimized = isMobile || sidebarCollapsed;

  useEffect(() => {
    if (!isAuthenticated || !sessionToken) {
      router.replace("/login");
      return;
    }

    if (!convexClient) return;

    let cancelled = false;

    void (async () => {
      try {
        const result = await convexClient.query(api.projects.getById, {
          token: sessionToken,
          projectId: projectId as Id<"projects">,
        });
        if (cancelled) return;

        if (result) {
          setProject(result);
        } else {
          toast({
            variant: "destructive",
            title: "You don't have access to this project.",
          });
          router.replace("/projects");
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.message.includes("Unauthenticated")) {
          router.replace("/login");
        } else {
          toast({
            variant: "destructive",
            title: "You don't have access to this project.",
          });
          router.replace("/projects");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, isAuthenticated, sessionToken, router]);

  if (loading) {
    return <ProjectPageSkeleton />;
  }

  if (!project) return null;

  const needsGeneration = (() => {
    if (!project.data || project.data === "{}") return true;
    try {
      const parsed = JSON.parse(project.data) as { project_wbs?: unknown[] };
      return !parsed?.project_wbs?.length;
    } catch {
      return true;
    }
  })();

  const handleTaskCompleted = async (
    phaseOrder: number,
    taskOrder: number,
    completed: boolean,
  ) => {
    if (!sessionToken || !convexClient || !project) return;

    let parsed: Project;
    try {
      parsed = JSON.parse(project.data) as Project;
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to update task status.",
      });
      return;
    }

    const updatedProjectWbs = parsed.project_wbs.map((phase) =>
      phase.order === phaseOrder
        ? {
            ...phase,
            tasks: phase.tasks.map((task) =>
              task.order === taskOrder ? { ...task, completed } : task,
            ),
          }
        : phase,
    ) as Project["project_wbs"];

    const updated: Project = {
      ...parsed,
      project_wbs: updatedProjectWbs,
    };

    const dataStr = JSON.stringify(updated);

    try {
      await convexClient.mutation(api.projects.update, {
        token: sessionToken,
        projectId: project._id as Id<"projects">,
        data: dataStr,
      });
      setProject((prev) =>
        prev
          ? {
              ...prev,
              data: dataStr,
            }
          : prev,
      );
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to update task status.",
      });
    }
  };

  const handleGenerateProject = async () => {
    if (!sessionToken || !project || generating) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: project.projectName,
          summaryName: project.summaryName,
          objective: project.objective || "",
          targetDate: project.targetDate || "",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: json.error || "Failed to generate project",
          description: json.details,
        });
        return;
      }
      if (!convexClient || !json.data) {
        toast({
          variant: "destructive",
          title: "Invalid response from server.",
        });
        return;
      }
      const generatedTargetDate =
        json.data.project_summary?.target_date?.trim() || "";
      const shouldUpdateTargetDate =
        !project.targetDate?.trim() && generatedTargetDate;

      await convexClient.mutation(api.projects.update, {
        token: sessionToken,
        projectId: project._id as Id<"projects">,
        data: JSON.stringify(json.data),
        ...(shouldUpdateTargetDate && { targetDate: generatedTargetDate }),
      });
      setProject((prev) =>
        prev
          ? {
              ...prev,
              data: JSON.stringify(json.data),
              ...(shouldUpdateTargetDate && {
                targetDate: generatedTargetDate,
              }),
            }
          : null,
      );
      toast({
        title: "Project generated",
        description: "WBS and tasks have been created.",
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <ChatHeader
        hasMessages={false}
        onClear={() => router.push("/chat")}
        projectName={project.projectName}
        projectId={project._id}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden pt-14">
        <aside
          className={cn(
            "flex min-h-0 shrink-0 flex-col overflow-y-hidden border-r border-border bg-muted/30 transition-[width] duration-200",
            sidebarMinimized ? "w-14" : "w-48 sm:w-56 md:w-64",
          )}
        >
          <nav className="min-h-0 flex-1 space-y-0.5 overflow-hidden p-2">
            {project.isOwner && needsGeneration && (
              <div className="mb-2">
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleGenerateProject}
                        disabled={generating}
                        className={cn(
                          "flex w-full items-center rounded-lg py-2 text-sm font-medium transition-colors",
                          sidebarMinimized
                            ? "justify-center px-0"
                            : "gap-3 px-3",
                          "bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50",
                        )}
                      >
                        <Sparkles className="size-4 shrink-0" />
                        {!sidebarMinimized && (
                          <span>
                            {generating ? "Generating…" : "Generate project"}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {generating
                        ? "Generating…"
                        : "Generate WBS and tasks from project info"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
            <TooltipProvider delayDuration={0}>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                const button = (
                  <button
                    onClick={() => setActiveSection(item.id)}
                    className={cn(
                      "flex w-full items-center rounded-lg py-2 text-sm font-medium transition-colors",
                      sidebarMinimized ? "justify-center px-0" : "gap-3 px-3",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {!sidebarMinimized && <span>{item.label}</span>}
                  </button>
                );
                return (
                  <span key={item.id}>
                    {sidebarMinimized ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{button}</TooltipTrigger>
                        <TooltipContent side="right">
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      button
                    )}
                  </span>
                );
              })}
            </TooltipProvider>
          </nav>
          {!isMobile && (
            <div className="border-t border-border p-2">
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setSidebarCollapsed((c) => !c)}
                      className={cn(
                        "flex w-full items-center rounded-lg py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                        sidebarMinimized ? "justify-center px-0" : "gap-3 px-3",
                      )}
                    >
                      {sidebarMinimized ? (
                        <PanelLeft className="size-4 shrink-0" />
                      ) : (
                        <>
                          <PanelLeftClose className="size-4 shrink-0" />
                          <span>Collapse</span>
                        </>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {sidebarMinimized ? "Expand sidebar" : "Collapse sidebar"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto p-8">
          <SectionContent
            section={activeSection}
            project={project}
            onTaskCompleted={handleTaskCompleted}
          />
        </main>
      </div>
    </div>
  );
}

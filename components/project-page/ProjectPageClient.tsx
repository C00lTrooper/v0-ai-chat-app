"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { useAuth } from "@/components/auth-provider";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatHeader } from "@/components/chat-header";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/project-schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LayoutDashboard,
  CheckSquare,
  MessageSquare,
  CalendarDays,
  Settings,
  Target,
  CalendarClock,
  Users,
  Layers,
  PanelLeftClose,
  PanelLeft,
  Sparkles,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import type { Id } from "@/convex/_generated/dataModel";

type Section = "overview" | "tasks" | "chat" | "calendar" | "settings";

type NavItem = {
  id: Section;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "settings", label: "Settings", icon: Settings },
];

type ProjectData = {
  _id: string;
  slug: string;
  projectName: string;
  summaryName: string;
  objective: string;
  targetDate: string;
  data: string;
  isOwner: boolean;
};

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

function OverviewSection({ project }: { project: ProjectData }) {
  let parsedProject: Project | null = null;
  try {
    if (project.data) parsedProject = JSON.parse(project.data) as Project;
  } catch {
    // data may be empty or invalid
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Project summary and key metrics
      </p>

      <div className="mt-6 flex w-full flex-col gap-4 sm:w-1/2 lg:w-1/3">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Users className="size-4" />
            Role
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {project.isOwner ? "Owner" : "Collaborator"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CalendarClock className="size-4" />
            Target Date
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {project.targetDate}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Target className="size-4" />
            Objective
          </div>
          <p className="mt-2 text-sm text-foreground">{project.objective}</p>
        </div>
      </div>

      {parsedProject?.project_wbs?.length ? (
        <div className="mt-6 w-full">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Layers className="size-4" />
              High-level features
            </div>
            <div className="mt-2">
              <Table className="text-sm">
                <TableBody>
                  {parsedProject.project_wbs
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((phase, index) => (
                      <TableRow key={index}>
                        <TableCell className="w-32 font-medium text-muted-foreground">
                          Feature {index + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {phase.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {phase.description}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TasksSection({ project }: { project: ProjectData }) {
  let parsedProject: Project | null = null;
  try {
    if (project.data) parsedProject = JSON.parse(project.data) as Project;
  } catch {
    // data may be empty or invalid
  }

  const phases =
    parsedProject?.project_wbs
      ?.slice()
      .sort((a, b) => a.order - b.order)
      ?? [];
  const hasTasks = phases.some((p) => p.tasks?.length);

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
          const tasks = (phase.tasks ?? []).slice().sort((a, b) => a.order - b.order);
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
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Task</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task, taskIndex) => (
                      <TableRow key={taskIndex}>
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
                          {task.time}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChatSection({ project }: { project: ProjectData }) {
  const router = useRouter();
  const { sessionToken } = useAuth();
  const chats = useQuery(
    api.chats.listChatsByProject,
    sessionToken && project._id
      ? { token: sessionToken, projectId: project._id as Id<"projects"> }
      : "skip",
  );
  const createChatMut = useMutation(api.chats.createChat);
  const deleteChatMut = useMutation(api.chats.deleteChat);
  const renameChatMut = useMutation(api.chats.renameChat);

  const [renameChatId, setRenameChatId] = useState<Id<"chats"> | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteChatId, setDeleteChatId] = useState<Id<"chats"> | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleOpenChat = (chatId: Id<"chats">) => {
    router.push(`/chat?chatId=${chatId}`);
  };

  const handleNewChat = async () => {
    if (!sessionToken || !project._id) return;
    setCreating(true);
    try {
      const { chatId } = await createChatMut({
        token: sessionToken,
        projectId: project._id as Id<"projects">,
      });
      router.push(`/chat?chatId=${chatId}`);
    } catch {
      toast({ variant: "destructive", title: "Failed to create chat." });
    } finally {
      setCreating(false);
    }
  };

  const handleRenameSubmit = async () => {
    if (!sessionToken || !renameChatId || !renameValue.trim()) {
      setRenameChatId(null);
      return;
    }
    try {
      await renameChatMut({
        token: sessionToken,
        chatId: renameChatId,
        name: renameValue.trim(),
      });
      toast({ title: "Chat renamed." });
      setRenameChatId(null);
      setRenameValue("");
    } catch {
      toast({ variant: "destructive", title: "Failed to rename chat." });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!sessionToken || !deleteChatId) return;
    setDeleting(true);
    try {
      await deleteChatMut({ token: sessionToken, chatId: deleteChatId });
      toast({ title: "Chat deleted." });
      setDeleteChatId(null);
    } catch {
      toast({ variant: "destructive", title: "Failed to delete chat." });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Chat</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Project conversations and AI assistance
      </p>

      <div className="mt-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            Chats in this project
          </span>
          <Button
            size="sm"
            onClick={handleNewChat}
            disabled={creating}
            className="shrink-0"
          >
            <Plus className="size-4" />
            New chat
          </Button>
        </div>

        {chats === undefined ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-muted-foreground">
            <MessageSquare className="mb-3 size-10" />
            <p className="text-sm font-medium">No chats yet</p>
            <p className="mt-1 text-xs">
              Start a new chat or open one from the Chat page linked to this
              project.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={handleNewChat}
              disabled={creating}
            >
              <Plus className="size-4" />
              New chat
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {chats.map((chat) => (
              <li
                key={chat._id}
                className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/30"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left text-sm font-medium text-foreground hover:underline"
                  onClick={() => handleOpenChat(chat._id)}
                >
                  {chat.name?.trim() || `Chat · ${chat.messageCount} message${chat.messageCount === 1 ? "" : "s"}`}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 h-8 w-8"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="size-4" />
                      <span className="sr-only">Options</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameChatId(chat._id);
                        setRenameValue(chat.name ?? "");
                      }}
                    >
                      <Pencil className="size-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteChatId(chat._id);
                      }}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={!!renameChatId}
        onOpenChange={(open) => {
          if (!open) {
            setRenameChatId(null);
            setRenameValue("");
          }
        }}
      >
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Chat name"
              onKeyDown={(e) => e.key === "Enter" && handleRenameSubmit()}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenameChatId(null);
                setRenameValue("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleRenameSubmit} disabled={!renameValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteChatId} onOpenChange={() => setDeleteChatId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              All messages in this chat will be permanently deleted. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CalendarSection() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Project timeline and milestones
      </p>
      <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-muted-foreground">
        <CalendarDays className="mb-3 size-10" />
        <p className="text-sm font-medium">Calendar coming soon</p>
        <p className="mt-1 text-xs">
          View deadlines and milestones at a glance.
        </p>
      </div>
    </div>
  );
}

function SettingsSection() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Project configuration and access control
      </p>
      <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-muted-foreground">
        <Settings className="mb-3 size-10" />
        <p className="text-sm font-medium">Settings coming soon</p>
        <p className="mt-1 text-xs">
          Manage project members, permissions, and more.
        </p>
      </div>
    </div>
  );
}

function SectionContent({
  section,
  project,
}: {
  section: Section;
  project: ProjectData;
}) {
  switch (section) {
    case "overview":
      return <OverviewSection project={project} />;
    case "tasks":
      return <TasksSection project={project} />;
    case "chat":
      return <ChatSection project={project} />;
    case "calendar":
      return <CalendarSection />;
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
        toast({ variant: "destructive", title: "Invalid response from server." });
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
      toast({ title: "Project generated", description: "WBS and tasks have been created." });
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
                          sidebarMinimized ? "justify-center px-0" : "gap-3 px-3",
                          "bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50",
                        )}
                      >
                        <Sparkles className="size-4 shrink-0" />
                        {!sidebarMinimized && (
                          <span>{generating ? "Generating…" : "Generate project"}</span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {generating ? "Generating…" : "Generate WBS and tasks from project info"}
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
          <SectionContent section={activeSection} project={project} />
        </main>
      </div>
    </div>
  );
}

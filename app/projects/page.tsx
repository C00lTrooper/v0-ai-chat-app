"use client";

import "./projects.css";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth-provider";
import { ChatHeader } from "@/components/chat-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
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
  DialogDescription,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import {
  Pin,
  Layers,
  MoreVertical,
  PinOff,
  Pencil,
  Trash2,
  Search,
  FolderOpen,
  Plus,
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

type ProjectCardData = {
  _id: Id<"projects">;
  slug: string;
  projectName: string;
  summaryName: string;
  pinned: boolean;
  updatedAt: number;
  createdAt: number;
  isOwner: boolean;
  totalTasks: number;
  completedTasks: number;
  collaboratorEmails: string[];
};

function daysAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function completionPercent(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

function statusFromCompletion(percent: number): {
  label: string;
  color: string;
} {
  if (percent >= 90) return { label: "Live", color: "bg-emerald-500" };
  return { label: "Building", color: "bg-blue-500" };
}

function ProjectCard({
  project,
  sessionToken,
}: {
  project: ProjectCardData;
  sessionToken: string;
}) {
  const router = useRouter();
  const togglePin = useMutation(api.projects.togglePin);
  const renameMut = useMutation(api.projects.rename);
  const removeMut = useMutation(api.projects.remove);

  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newName, setNewName] = useState(project.projectName);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isCardHovered, setIsCardHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const percent = completionPercent(project.completedTasks, project.totalTasks);
  const status = statusFromCompletion(percent);

  const handlePin = async () => {
    await togglePin({ token: sessionToken, projectId: project._id });
  };

  const handleRename = async () => {
    if (!newName.trim() || newName === project.projectName) {
      setRenameOpen(false);
      return;
    }
    setRenaming(true);
    try {
      await renameMut({
        token: sessionToken,
        projectId: project._id,
        projectName: newName.trim(),
      });
    } finally {
      setRenaming(false);
      setRenameOpen(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await removeMut({ token: sessionToken, projectId: project._id });
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <>
      <div
        className="group relative flex min-w-0 cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-lg"
        onClick={() => router.push(`/projects/${project._id}`)}
        onMouseEnter={() => setIsCardHovered(true)}
        onMouseLeave={() => setIsCardHovered(false)}
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-lg font-semibold">
            {project.projectName.charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-bold text-foreground">
                {project.projectName}
              </h3>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  status.label === "Live"
                    ? "bg-emerald-500/15 text-emerald-500"
                    : "bg-blue-500/15 text-blue-500"
                }`}
              >
                <span className={`size-1.5 rounded-full ${status.color}`} />
                {status.label}
              </span>
            </div>
          </div>

          <div
            className={`shrink-0 transition-opacity duration-200 md:opacity-0 ${isCardHovered || menuOpen ? "md:opacity-100" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-md group-hover:bg-muted/80 hover:bg-muted data-[state=open]:bg-muted"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem onClick={handlePin}>
                  {project.pinned ? (
                    <PinOff className="size-4" />
                  ) : (
                    <Pin className="size-4" />
                  )}
                  <span>{project.pinned ? "Unpin" : "Pin"}</span>
                </DropdownMenuItem>
                {project.isOwner && (
                  <>
                    <DropdownMenuItem
                      onClick={() => {
                        setNewName(project.projectName);
                        setRenameOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                      <span>Rename</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2 className="size-4" />
                      <span>Delete</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{percent}% Completed</span>
            <span>
              {project.completedTasks}/{project.totalTasks} tasks
            </span>
          </div>
          <Progress value={percent} className="h-1.5" />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            Last updated {daysAgo(project.updatedAt)}
          </span>

          {project.collaboratorEmails.length > 0 && (
            <div className="flex -space-x-1.5">
              {project.collaboratorEmails.slice(0, 3).map((email) => (
                <Avatar key={email} className="size-5 border border-card">
                  <AvatarFallback className="text-[9px] font-medium">
                    {email.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}
              {project.collaboratorEmails.length > 3 && (
                <Avatar className="size-5 border border-card">
                  <AvatarFallback className="text-[8px] font-medium">
                    +{project.collaboratorEmails.length - 3}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>
              Enter a new name for this project.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
            }}
            placeholder="Project name"
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameOpen(false)}
              disabled={renaming}
            >
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={renaming}>
              {renaming ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{project.projectName}&rdquo;
              and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function slugFromName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return base || `project-${Date.now()}`;
}

export default function ProjectsPage() {
  const router = useRouter();
  const { isAuthenticated, sessionToken } = useAuth();
  const [search, setSearch] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const createProject = useMutation(api.projects.create);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  const projects = useQuery(
    api.projects.listForPage,
    sessionToken ? { token: sessionToken } : "skip",
  );

  const filtered = useMemo(() => {
    if (!projects) return [];
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter((p) => p.projectName.toLowerCase().includes(q));
  }, [projects, search]);

  const pinned = useMemo(() => filtered.filter((p) => p.pinned), [filtered]);
  const other = useMemo(() => filtered.filter((p) => !p.pinned), [filtered]);

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name || !sessionToken) return;
    setCreating(true);
    try {
      const result = await createProject({
        token: sessionToken,
        slug: slugFromName(name),
        projectName: name,
        summaryName: name,
        objective: newProjectDescription.trim(),
        targetDate: "",
      });
      setNewProjectOpen(false);
      setNewProjectName("");
      setNewProjectDescription("");
      router.push(`/projects/${result.projectId}`);
    } finally {
      setCreating(false);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <ChatHeader hasMessages={false} onClear={() => router.push("/chat")} />

      <main className="flex-1 overflow-y-auto pt-14">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Projects
          </h1>

          <div className="mt-4 flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 shadow-xs">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects"
                className="h-6 w-full min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground focus-visible:outline-none"
              />
            </div>
            <Button
              onClick={() => setNewProjectOpen(true)}
              className="shrink-0"
            >
              <Plus className="size-4" />
              New project
            </Button>
          </div>

          <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New project</DialogTitle>
                <DialogDescription>
                  Create a new project. You can add more details and tasks
                  later.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label htmlFor="new-project-name">Name</Label>
                  <Input
                    id="new-project-name"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Project name"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateProject();
                    }}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="new-project-description">Description</Label>
                  <Input
                    id="new-project-description"
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    placeholder="Brief description or objective"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateProject();
                    }}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setNewProjectOpen(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateProject}
                  disabled={creating || !newProjectName.trim()}
                >
                  {creating ? "Creating…" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {projects === undefined ? (
            <div className="flex items-center justify-center py-24">
              <Spinner className="size-8 text-muted-foreground" />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-24 text-muted-foreground">
              <FolderOpen className="size-10" />
              <p className="text-sm">No projects yet</p>
              <p className="text-xs">Create a project to get started.</p>
            </div>
          ) : (
            <>
              {pinned.length > 0 && (
                <section className="mt-8">
                  <div className="projects-section-label flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Pin className="size-4" />
                    Pinned
                  </div>
                  <div className="projects-grid">
                    {pinned.map((p) => (
                      <div key={p._id} className="min-w-0">
                        <ProjectCard project={p} sessionToken={sessionToken!} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {other.length > 0 && (
                <section className="mt-8">
                  <div className="projects-section-label flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Layers className="size-4" />
                    Other
                  </div>
                  <div className="projects-grid">
                    {other.map((p) => (
                      <div key={p._id} className="min-w-0">
                        <ProjectCard project={p} sessionToken={sessionToken!} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {filtered.length === 0 && search.trim() && (
                <div className="flex flex-col items-center justify-center gap-2 py-24 text-muted-foreground">
                  <Search className="size-8" />
                  <p className="text-sm">
                    No projects matching &ldquo;{search}&rdquo;
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

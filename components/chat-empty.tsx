"use client";

import { Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Id } from "@/convex/_generated/dataModel";

interface ChatEmptyProps {
  projects: Array<{ _id: Id<"projects">; projectName: string }>;
  linkedProjectId: Id<"projects"> | null;
  linkedProjectName: string | null;
  activeProjectName: string | null;
  onLinkProject: (projectId: Id<"projects">) => void;
  onClearLink: () => void;
}

export function ChatEmpty({
  projects,
  linkedProjectId,
  linkedProjectName,
  activeProjectName,
  onLinkProject,
  onClearLink,
}: ChatEmptyProps) {
  const hasActiveProject = !!activeProjectName;

  if (hasActiveProject) {
    return (
      <div className="flex flex-col items-center px-4 pb-40 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance">
          What can I help you with?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          Send a message to start the conversation
          {activeProjectName ? ` in ${activeProjectName}` : ""}.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-4 pb-40 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance">
        What can I help you with?
      </h1>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        Link this chat to a project so messages are saved there, or just ask
        anything.
      </p>

      <div className="mt-8 flex flex-col items-center gap-3 w-full max-w-md">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Link2 className="size-4 shrink-0" />
          Link to a project
        </div>
        {linkedProjectId ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5 w-full">
            <span className="flex-1 truncate text-left text-sm font-medium text-foreground">
              {linkedProjectName ?? "Project"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 h-8 px-2 text-muted-foreground hover:text-foreground"
              onClick={onClearLink}
              aria-label="Clear project link"
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : projects.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No projects yet. Create one from the Projects page.
          </p>
        ) : (
          <Select
            onValueChange={(value) => onLinkProject(value as Id<"projects">)}
          >
            <SelectTrigger className="w-full max-w-sm">
              <SelectValue placeholder="Choose a project…" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p._id} value={p._id}>
                  {p.projectName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {linkedProjectId ? (
          <p className="text-xs text-muted-foreground">
            Your first message will create the chat for this project.
          </p>
        ) : null}
      </div>
    </div>
  );
}

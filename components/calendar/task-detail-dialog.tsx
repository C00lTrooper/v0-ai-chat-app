"use client";

import { Calendar, Clock, FolderOpen, Layers, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { type CalendarEvent, PROJECT_COLORS, formatTime12h } from "@/lib/calendar-utils";

interface TaskDetailDialogProps {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDetailDialog({
  event,
  open,
  onOpenChange,
}: TaskDetailDialogProps) {
  if (!event) return null;

  const color = PROJECT_COLORS[event.colorIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span
              className="mt-0.5 size-3 shrink-0 rounded-sm"
              style={{ backgroundColor: color.hex }}
            />
            <div>
              <DialogTitle className="text-base">{event.taskName}</DialogTitle>
              <DialogDescription className="mt-0.5">
                {event.projectName}
              </DialogDescription>
            </div>
            {event.completed && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 className="size-3" />
                Completed
              </span>
            )}
          </div>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-3 text-sm">
            <Calendar className="size-4 text-muted-foreground" />
            <span>
              {event.date.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Clock className="size-4 text-muted-foreground" />
            <span>{formatTime12h(event.timeStr)}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <FolderOpen className="size-4 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: color.hex }}
              />
              <span>{event.projectName}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Layers className="size-4 text-muted-foreground" />
            <span>{event.phaseName}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

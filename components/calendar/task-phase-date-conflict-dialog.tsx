"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ConflictPhaseOption = {
  order: number;
  name: string;
  start_date: string;
  end_date: string;
};

type TaskPhaseDateConflictDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle: string;
  currentPhaseName: string;
  newDateLabel: string;
  matchingPhases: ConflictPhaseOption[];
  onKeepInPhase: () => void;
  onMoveToPhase: (phaseOrder: number) => void | Promise<void>;
  onRemoveFromPhase: () => void | Promise<void>;
  busy?: boolean;
};

export function TaskPhaseDateConflictDialog({
  open,
  onOpenChange,
  taskTitle,
  currentPhaseName,
  newDateLabel,
  matchingPhases,
  onKeepInPhase,
  onMoveToPhase,
  onRemoveFromPhase,
  busy = false,
}: TaskPhaseDateConflictDialogProps) {
  const [pick, setPick] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    if (matchingPhases.length === 1) {
      setPick(String(matchingPhases[0].order));
    } else if (matchingPhases.length > 0) {
      setPick(String(matchingPhases[0].order));
    } else {
      setPick("");
    }
  }, [open, matchingPhases]);

  const canMove = matchingPhases.length > 0;
  const selectedOrder = pick ? parseInt(pick, 10) : NaN;
  const moveDisabled =
    !canMove || !Number.isFinite(selectedOrder) || busy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Date outside current phase</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-left text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">{taskTitle}</span>{" "}
                is in phase{" "}
                <span className="font-medium text-foreground">
                  {currentPhaseName}
                </span>
                , but the new date ({newDateLabel}) does not fall within that
                phase&apos;s schedule.
              </p>
              <p className="font-medium text-foreground">
                How should this be resolved?
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium text-foreground">Keep in phase</p>
            <p className="mt-1 text-muted-foreground">
              Discard the new date and keep the task in{" "}
              <span className="font-medium text-foreground">
                {currentPhaseName}
              </span>{" "}
              with its previous date.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full sm:w-auto"
              disabled={busy}
              onClick={onKeepInPhase}
            >
              Keep in phase
            </Button>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium text-foreground">Move to matching phase</p>
            {canMove ? (
              <>
                <p className="mt-1 text-muted-foreground">
                  Reassign the task to a phase whose dates include the new date.
                </p>
                {matchingPhases.length > 1 ? (
                  <div className="mt-3 space-y-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Target phase
                    </span>
                    <Select value={pick} onValueChange={setPick}>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Choose phase" />
                      </SelectTrigger>
                      <SelectContent>
                        {matchingPhases.map((p) => (
                          <SelectItem key={p.order} value={String(p.order)}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full sm:w-auto"
                  disabled={moveDisabled}
                  onClick={() => {
                    if (!Number.isFinite(selectedOrder)) return;
                    void onMoveToPhase(selectedOrder);
                  }}
                >
                  Move to matching phase
                </Button>
              </>
            ) : (
              <p className="mt-1 text-muted-foreground">
                No phase in this project includes that date. Add or extend a
                phase in Overview, or pick another option.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium text-foreground">Remove from phase</p>
            <p className="mt-1 text-muted-foreground">
              Save the new date and leave the task unassigned (no phase).
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full sm:w-auto"
              disabled={busy}
              onClick={() => void onRemoveFromPhase()}
            >
              Remove from phase
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

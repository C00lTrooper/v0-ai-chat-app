"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  ListTodo,
  RefreshCw,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { taskDurationLabel } from "@/lib/generation-time-estimate";
import type {
  ReviewFeatureNode,
  ReviewPhaseNode,
  ReviewTaskNode,
} from "@/components/project-page/generation-review-types";

type TreeCheckboxProps = {
  checked: boolean;
  indeterminate?: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
};

function TreeCheckbox({
  checked,
  indeterminate,
  onCheckedChange,
  disabled,
}: TreeCheckboxProps) {
  return (
    <Checkbox
      disabled={disabled}
      checked={
        indeterminate ? ("indeterminate" as const) : checked
      }
      onCheckedChange={(v) => onCheckedChange(v === true)}
      className="shrink-0"
    />
  );
}

function countPhaseSummary(phase: ReviewPhaseNode): {
  featureCount: number;
  taskCount: number;
} {
  let taskCount = phase.unassignedTasks.length;
  let featureCount = phase.features.length;
  for (const f of phase.features) {
    taskCount += f.tasks.length;
  }
  return { featureCount, taskCount };
}

type GenerationReviewTreeProps = {
  phases: ReviewPhaseNode[];
  setPhases: React.Dispatch<React.SetStateAction<ReviewPhaseNode[]>>;
  onRegeneratePhase: (phaseId: string) => Promise<void>;
  onRegenerateFeature: (phaseId: string, featureId: string) => Promise<void>;
  regeneratingId: string | null;
};

export function GenerationReviewTree({
  phases,
  setPhases,
  onRegeneratePhase,
  onRegenerateFeature,
  regeneratingId,
}: GenerationReviewTreeProps) {
  const setPhaseExpanded = (id: string, expanded: boolean) => {
    setPhases((prev) =>
      prev.map((p) => (p.id === id ? { ...p, expanded } : p)),
    );
  };

  const setFeatureExpanded = (
    phaseId: string,
    featureId: string,
    expanded: boolean,
  ) => {
    setPhases((prev) =>
      prev.map((p) =>
        p.id !== phaseId
          ? p
          : {
              ...p,
              features: p.features.map((f) =>
                f.id === featureId ? { ...f, expanded } : f,
              ),
            },
      ),
    );
  };

  const updatePhaseCheck = (phaseId: string, checked: boolean) => {
    setPhases((prev) =>
      prev.map((p) => {
        if (p.id !== phaseId) return p;
        return {
          ...p,
          checked,
          unassignedTasks: p.unassignedTasks.map((t) => ({ ...t, checked })),
          features: p.features.map((f) => ({
            ...f,
            checked,
            tasks: f.tasks.map((t) => ({ ...t, checked })),
          })),
        };
      }),
    );
  };

  const updateFeatureCheck = (
    phaseId: string,
    featureId: string,
    checked: boolean,
  ) => {
    setPhases((prev) =>
      prev.map((p) => {
        if (p.id !== phaseId) return p;
        return {
          ...p,
          features: p.features.map((f) =>
            f.id === featureId
              ? {
                  ...f,
                  checked,
                  tasks: f.tasks.map((t) => ({ ...t, checked })),
                }
              : f,
          ),
        };
      }),
    );
  };

  const updateTaskCheck = (
    phaseId: string,
    featureId: string | null,
    taskId: string,
    checked: boolean,
  ) => {
    setPhases((prev) =>
      prev.map((p) => {
        if (p.id !== phaseId) return p;
        if (featureId === null) {
          return {
            ...p,
            unassignedTasks: p.unassignedTasks.map((t) =>
              t.id === taskId ? { ...t, checked } : t,
            ),
          };
        }
        return {
          ...p,
          features: p.features.map((f) =>
            f.id !== featureId
              ? f
              : {
                  ...f,
                  tasks: f.tasks.map((t) =>
                    t.id === taskId ? { ...t, checked } : t,
                  ),
                },
          ),
        };
      }),
    );
  };

  function computePhaseCheckState(phase: ReviewPhaseNode): {
    checked: boolean;
    indeterminate: boolean;
  } {
    const taskStates: boolean[] = [
      ...phase.unassignedTasks.map((t) => t.checked),
      ...phase.features.flatMap((f) => f.tasks.map((t) => t.checked)),
    ];
    if (taskStates.length === 0) {
      return { checked: false, indeterminate: false };
    }
    const all = taskStates.every(Boolean);
    const some = taskStates.some(Boolean);
    if (all) return { checked: true, indeterminate: false };
    if (some) return { checked: false, indeterminate: true };
    return { checked: false, indeterminate: false };
  }

  const renamePhase = (phaseId: string, name: string) => {
    setPhases((prev) =>
      prev.map((p) => (p.id === phaseId ? { ...p, name } : p)),
    );
  };

  const renameFeature = (
    phaseId: string,
    featureId: string,
    name: string,
  ) => {
    setPhases((prev) =>
      prev.map((p) =>
        p.id !== phaseId
          ? p
          : {
              ...p,
              features: p.features.map((f) =>
                f.id === featureId ? { ...f, name } : f,
              ),
            },
      ),
    );
  };

  const renameTask = (
    phaseId: string,
    featureId: string | null,
    taskId: string,
    name: string,
  ) => {
    setPhases((prev) =>
      prev.map((p) => {
        if (p.id !== phaseId) return p;
        if (featureId === null) {
          return {
            ...p,
            unassignedTasks: p.unassignedTasks.map((t) =>
              t.id === taskId ? { ...t, name } : t,
            ),
          };
        }
        return {
          ...p,
          features: p.features.map((f) =>
            f.id !== featureId
              ? f
              : {
                  ...f,
                  tasks: f.tasks.map((t) =>
                    t.id === taskId ? { ...t, name } : t,
                  ),
                },
          ),
        };
      }),
    );
  };

  return (
    <div className="max-h-[min(60vh,520px)] space-y-1 overflow-y-auto rounded-lg border border-border p-2">
      {phases.map((phase) => (
        <PhaseRow
          key={phase.id}
          phase={phase}
          onToggleExpand={() =>
            setPhaseExpanded(phase.id, !phase.expanded)
          }
          onCheck={(c) => updatePhaseCheck(phase.id, c)}
          phaseCheckState={computePhaseCheckState(phase)}
          onRename={(name) => renamePhase(phase.id, name)}
          onRegenerate={() => onRegeneratePhase(phase.id)}
          regenerating={regeneratingId === `phase:${phase.id}`}
          onFeatureExpand={(fid, ex) =>
            setFeatureExpanded(phase.id, fid, ex)
          }
          onFeatureCheck={(fid, c) => updateFeatureCheck(phase.id, fid, c)}
          onTaskCheck={(fid, tid, c) =>
            updateTaskCheck(phase.id, fid, tid, c)
          }
          onRenameFeature={(fid, name) =>
            renameFeature(phase.id, fid, name)
          }
          onRenameTask={(fid, tid, name) =>
            renameTask(phase.id, fid, tid, name)
          }
          onRegenerateFeature={(fid) =>
            onRegenerateFeature(phase.id, fid)
          }
          regeneratingFeatureId={regeneratingId}
        />
      ))}
    </div>
  );
}

function PhaseRow({
  phase,
  onToggleExpand,
  onCheck,
  phaseCheckState,
  onRename,
  onRegenerate,
  regenerating,
  onFeatureExpand,
  onFeatureCheck,
  onTaskCheck,
  onRenameFeature,
  onRenameTask,
  onRegenerateFeature,
  regeneratingFeatureId,
}: {
  phase: ReviewPhaseNode;
  onToggleExpand: () => void;
  onCheck: (c: boolean) => void;
  phaseCheckState: { checked: boolean; indeterminate: boolean };
  onRename: (name: string) => void;
  onRegenerate: () => void;
  regenerating: boolean;
  onFeatureExpand: (featureId: string, expanded: boolean) => void;
  onFeatureCheck: (featureId: string, c: boolean) => void;
  onTaskCheck: (featureId: string | null, taskId: string, c: boolean) => void;
  onRenameFeature: (featureId: string, name: string) => void;
  onRenameTask: (
    featureId: string | null,
    taskId: string,
    name: string,
  ) => void;
  onRegenerateFeature: (featureId: string) => void;
  regeneratingFeatureId: string | null;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(phase.name);
  const { featureCount, taskCount } = countPhaseSummary(phase);
  const dim =
    !phaseCheckState.checked && !phaseCheckState.indeterminate;

  return (
    <div className={cn(dim && "opacity-50")}>
      <div className="flex items-center gap-1 rounded-md py-1 pr-1 hover:bg-muted/40">
        <button
          type="button"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          onClick={onToggleExpand}
          aria-expanded={phase.expanded}
        >
          {phase.expanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </button>
        <TreeCheckbox
          checked={phaseCheckState.checked}
          indeterminate={phaseCheckState.indeterminate}
          onCheckedChange={onCheck}
        />
        {phase.expanded ? (
          <FolderOpen className="size-4 shrink-0 text-amber-600/90" />
        ) : (
          <Folder className="size-4 shrink-0 text-amber-600/90" />
        )}
        {editing ? (
          <Input
            className="h-8 flex-1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              onRename(draft.trim() || phase.name);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onRename(draft.trim() || phase.name);
                setEditing(false);
              }
            }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-sm font-medium"
            onClick={() => {
              setDraft(phase.name);
              setEditing(true);
            }}
          >
            {phase.name}
          </button>
        )}
        {!phase.expanded && (featureCount > 0 || taskCount > 0) && (
          <Badge variant="secondary" className="shrink-0 text-xs font-normal">
            {featureCount} feat., {taskCount} tasks
          </Badge>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          disabled={regenerating}
          onClick={onRegenerate}
          title="Regenerate phase"
        >
          <RefreshCw
            className={cn("size-4", regenerating && "animate-spin")}
          />
        </Button>
      </div>
      {phase.expanded && (
        <div className="ml-6 border-l border-border/60 pl-2">
          {phase.features.map((f) => (
            <FeatureRow
              key={f.id}
              feature={f}
              phaseId={phase.id}
              dimParent={dim}
              onToggleExpand={() => onFeatureExpand(f.id, !f.expanded)}
              onCheck={(c) => onFeatureCheck(f.id, c)}
              onTaskCheck={(tid, c) => onTaskCheck(f.id, tid, c)}
              onRename={(name) => onRenameFeature(f.id, name)}
              onRenameTask={(tid, name) => onRenameTask(f.id, tid, name)}
              onRegenerate={() => onRegenerateFeature(f.id)}
              regenerating={regeneratingFeatureId === `feature:${f.id}`}
            />
          ))}
          {phase.unassignedTasks.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2 py-1 text-xs font-medium text-muted-foreground">
                <Folder className="size-3.5" />
                Unassigned tasks
              </div>
              {phase.unassignedTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  dimParent={dim}
                  onCheck={(c) => onTaskCheck(null, t.id, c)}
                  onRename={(name) => onRenameTask(null, t.id, name)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function featureCheckState(f: ReviewFeatureNode): {
  checked: boolean;
  indeterminate: boolean;
} {
  const states = f.tasks.map((t) => t.checked);
  const all = states.length > 0 && states.every(Boolean);
  const some = states.some(Boolean);
  if (all) return { checked: true, indeterminate: false };
  if (some) return { checked: false, indeterminate: true };
  return { checked: false, indeterminate: false };
}

function FeatureRow({
  feature,
  dimParent,
  onToggleExpand,
  onCheck,
  onTaskCheck,
  onRename,
  onRenameTask,
  onRegenerate,
  regenerating,
}: {
  feature: ReviewFeatureNode;
  phaseId: string;
  dimParent: boolean;
  onToggleExpand: () => void;
  onCheck: (c: boolean) => void;
  onTaskCheck: (taskId: string, c: boolean) => void;
  onRename: (name: string) => void;
  onRenameTask: (taskId: string, name: string) => void;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(feature.name);
  const fc = featureCheckState(feature);
  const dim = dimParent || (!fc.checked && !fc.indeterminate);
  const taskCount = feature.tasks.length;

  return (
    <div className={cn("mb-1", dim && "opacity-50")}>
      <div className="flex items-center gap-1 rounded-md py-1 pr-1 hover:bg-muted/40">
        <button
          type="button"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          onClick={onToggleExpand}
        >
          {feature.expanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </button>
        <TreeCheckbox
          checked={fc.checked}
          indeterminate={fc.indeterminate}
          onCheckedChange={onCheck}
        />
        {feature.expanded ? (
          <FolderOpen className="size-4 shrink-0 text-sky-600/90" />
        ) : (
          <Folder className="size-4 shrink-0 text-sky-600/90" />
        )}
        {editing ? (
          <Input
            className="h-8 flex-1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              onRename(draft.trim() || feature.name);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onRename(draft.trim() || feature.name);
                setEditing(false);
              }
            }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-sm font-medium"
            onClick={() => {
              setDraft(feature.name);
              setEditing(true);
            }}
          >
            {feature.name}
          </button>
        )}
        {!feature.expanded && taskCount > 0 && (
          <Badge variant="secondary" className="shrink-0 text-xs font-normal">
            {taskCount} tasks
          </Badge>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          disabled={regenerating}
          onClick={onRegenerate}
          title="Regenerate feature"
        >
          <RefreshCw
            className={cn("size-4", regenerating && "animate-spin")}
          />
        </Button>
      </div>
      {feature.expanded && (
        <div className="ml-6 border-l border-border/60 pl-2">
          {feature.tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              dimParent={dim}
              onCheck={(c) => onTaskCheck(t.id, c)}
              onRename={(name) => onRenameTask(t.id, name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  dimParent,
  onCheck,
  onRename,
}: {
  task: ReviewTaskNode;
  dimParent: boolean;
  onCheck: (c: boolean) => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(task.name);
  const dim = dimParent || !task.checked;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md py-1 pr-1 hover:bg-muted/40",
        dim && "opacity-50",
      )}
    >
      <div className="w-8 shrink-0" />
      <Checkbox
        checked={task.checked}
        onCheckedChange={(v) => onCheck(v === true)}
        className="shrink-0"
      />
      <ListTodo className="size-4 shrink-0 text-muted-foreground" />
      {editing ? (
        <Input
          className="h-8 flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            onRename(draft.trim() || task.name);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onRename(draft.trim() || task.name);
              setEditing(false);
            }
          }}
          autoFocus
        />
      ) : (
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-sm"
          onClick={() => {
            setDraft(task.name);
            setEditing(true);
          }}
        >
          {task.name}
        </button>
      )}
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {taskDurationLabel(task.time, task.endTime)}
      </span>
    </div>
  );
}

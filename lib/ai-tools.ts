export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type ToolCallStatus = "pending" | "confirmed" | "rejected";

export interface ConflictInfo {
  type: "time_overlap" | "event_overlap" | "daily_limit";
  description: string;
}

export interface SuggestedSlot {
  date: string;
  startTime: string;
  endTime: string;
}

export interface ConflictWarning {
  conflicts: ConflictInfo[];
  suggestedSlots: SuggestedSlot[];
  dailyTaskCount: number;
  dailyTaskLimit: number | null;
}

export interface ToolCallWithStatus {
  toolCall: ToolCall;
  status: ToolCallStatus;
  resultMessage?: string;
  linkedEntity?: LinkedEntity;
  conflictWarning?: ConflictWarning;
}

export const READ_ONLY_TOOLS = ["checkTimeConflicts"] as const;

export interface LinkedEntity {
  type: "task" | "project" | "event";
  id: string;
  name: string;
  projectId?: string;
  projectSlug?: string;
}

export interface AiContext {
  userName: string;
  todayDate: string;
  dailyTaskLimit?: number | null;
  currentProjectId?: string;
  currentProjectName?: string;
  projects: AiProjectSummary[];
  calendarEvents: AiCalendarEvent[];
}

export interface AiProjectSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  completionPct: number;
  totalTasks: number;
  completedTasks: number;
  targetDate: string;
  tasks: AiTaskSummary[];
}

export interface AiTaskSummary {
  phaseOrder: number;
  phaseName: string;
  taskOrder: number;
  title: string;
  description?: string;
  dueDate: string;
  startTime: string;
  endTime?: string;
  completed: boolean;
}

export interface AiCalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  projectId?: string;
  projectName?: string;
}

export function buildToolConfirmationText(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "createTask": {
      const timePart = args.time ? ` at **${args.time}**` : "";
      const endPart = args.endTime ? ` – **${args.endTime}**` : "";
      return `Create task **"${args.title}"** in project **${args.projectName}** (phase: ${args.phaseName}), due **${args.dueDate}**${timePart}${endPart}`;
    }
    case "updateTaskStatus":
      return `Mark task **"${args.taskName}"** in project **${args.projectName}** as **${args.completed ? "complete" : "incomplete"}**`;
    case "updateTaskDueDate": {
      const dtTimePart = args.newStartTime ? ` at **${args.newStartTime}**` : "";
      const dtEndPart = args.newEndTime ? ` – **${args.newEndTime}**` : "";
      return `Reschedule task **"${args.taskName}"** in project **${args.projectName}** to **${args.newDate}**${dtTimePart}${dtEndPart}`;
    }
    case "updateTaskTime":
      return args.newEndTime
        ? `Update task **"${args.taskName}"** in project **${args.projectName}** to **${args.newStartTime}** – **${args.newEndTime}**`
        : `Update task **"${args.taskName}"** in project **${args.projectName}** to **${args.newStartTime}**`;
    case "createCalendarEvent":
      return `Create calendar event **"${args.title}"** from **${args.startDate}** to **${args.endDate}**${args.projectName ? ` (linked to ${args.projectName})` : ""}`;
    case "moveCalendarEvent":
      return `Move calendar event **"${args.eventTitle}"** to **${args.newStartDate}** – **${args.newEndDate}**`;
    case "checkTimeConflicts":
      return `Checking for scheduling conflicts on **${args.date}** at **${args.startTime}**${args.endTime ? ` – **${args.endTime}**` : ""}...`;
    default:
      return `Execute action: ${name}`;
  }
}

export const REFERENCE_REGEX = /\{\{(project|task|event):([^}]+)\}\}/g;

export interface ParsedReference {
  type: "project" | "task" | "event";
  raw: string;
  projectId?: string;
  projectSlug?: string;
  phaseOrder?: number;
  taskOrder?: number;
  name: string;
}

export function parseReference(match: string): ParsedReference | null {
  const inner = match.slice(2, -2);
  const [type, ...rest] = inner.split(":");

  if (type === "project" && rest.length >= 2) {
    return { type: "project", raw: match, projectId: rest[0], name: rest.slice(1).join(":") };
  }
  if (type === "task" && rest.length >= 4) {
    return {
      type: "task",
      raw: match,
      projectId: rest[0],
      phaseOrder: parseInt(rest[1], 10),
      taskOrder: parseInt(rest[2], 10),
      name: rest.slice(3).join(":"),
    };
  }
  if (type === "event" && rest.length >= 2) {
    return { type: "event", raw: match, projectId: rest[0], name: rest.slice(1).join(":") };
  }
  return null;
}

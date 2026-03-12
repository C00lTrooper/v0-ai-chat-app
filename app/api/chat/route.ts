import type { AiContext } from "@/lib/ai-tools";

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "createTask",
      description:
        "Create a new task in a project phase. Use when the user asks to add, create, or schedule a new task. Task titles should describe a clear, concrete outcome (e.g. 'Draft hero section copy') rather than a generic label.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "The project ID to add the task to" },
          projectName: { type: "string", description: "The project name (for display)" },
          phaseOrder: { type: "number", description: "The phase order number to add the task to" },
          phaseName: { type: "string", description: "The phase name (for display)" },
          title: { type: "string", description: "The task title" },
          dueDate: { type: "string", description: "Due date in YYYY-MM-DD format" },
          time: { type: "string", description: "Start time, e.g. 9:00 AM" },
          endTime: { type: "string", description: "Optional end time, e.g. 10:00 AM" },
          parentTaskId: {
            type: "string",
            description:
              "Optional parent task id. Use when creating automatic chunk subtasks so they can be grouped.",
          },
        },
        required: ["projectId", "projectName", "phaseOrder", "phaseName", "title", "dueDate"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "updateTaskStatus",
      description:
        "Mark a task as complete or incomplete. Use when the user says they finished a task or wants to undo completion.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "The project ID" },
          projectName: { type: "string", description: "The project name" },
          phaseOrder: { type: "number", description: "Phase order number" },
          taskOrder: { type: "number", description: "Task order number within the phase" },
          taskName: { type: "string", description: "Task name (for display)" },
          completed: { type: "boolean", description: "true = complete, false = incomplete" },
        },
        required: ["projectId", "projectName", "phaseOrder", "taskOrder", "taskName", "completed"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "updateTaskDueDate",
      description:
        "Reschedule a task to a new due date and optionally update its time. Use when the user asks to move, postpone, or reschedule a task.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "The project ID" },
          projectName: { type: "string", description: "The project name" },
          phaseOrder: { type: "number", description: "Phase order number" },
          taskOrder: { type: "number", description: "Task order number" },
          taskName: { type: "string", description: "Task name (for display)" },
          newDate: { type: "string", description: "New due date in YYYY-MM-DD format" },
          newStartTime: { type: "string", description: "Optional new start time, e.g. 2:00 PM" },
          newEndTime: { type: "string", description: "Optional new end time, e.g. 3:00 PM" },
        },
        required: ["projectId", "projectName", "phaseOrder", "taskOrder", "taskName", "newDate"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "updateTaskTime",
      description:
        "Set a task's start and optional end time (e.g. 9:00 AM, 10:30 AM). Use when the user asks to change when a task is scheduled during the day.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "The project ID" },
          projectName: { type: "string", description: "The project name" },
          phaseOrder: { type: "number", description: "Phase order number" },
          taskOrder: { type: "number", description: "Task order number" },
          taskName: { type: "string", description: "Task name (for display)" },
          newStartTime: { type: "string", description: "Start time, e.g. 9:00 AM" },
          newEndTime: { type: "string", description: "Optional end time, e.g. 10:00 AM" },
        },
        required: ["projectId", "projectName", "phaseOrder", "taskOrder", "taskName", "newStartTime"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "createCalendarEvent",
      description:
        "Add an event to the calendar with a start and end date. Use for meetings, phases, milestones, or any dated event.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          startDate: { type: "string", description: "Start date in YYYY-MM-DD format" },
          endDate: { type: "string", description: "End date in YYYY-MM-DD format" },
          projectId: { type: "string", description: "Optional project ID to link the event to" },
          projectName: { type: "string", description: "Optional project name for display" },
        },
        required: ["title", "startDate", "endDate"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "moveCalendarEvent",
      description: "Move an existing calendar event to new dates.",
      parameters: {
        type: "object",
        properties: {
          eventId: { type: "string", description: "The calendar event ID" },
          eventTitle: { type: "string", description: "Event title (for display)" },
          newStartDate: { type: "string", description: "New start date in YYYY-MM-DD format" },
          newEndDate: { type: "string", description: "New end date in YYYY-MM-DD format" },
        },
        required: ["eventId", "eventTitle", "newStartDate", "newEndDate"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "checkTimeConflicts",
      description:
        "Check for scheduling conflicts on a given date and time window. ALWAYS call this BEFORE any createTask, updateTaskDueDate, updateTaskTime, createCalendarEvent, or moveCalendarEvent to detect overlapping tasks, calendar events, and daily task limits. The system will auto-execute this and return conflict data so you can advise the user.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Target date in YYYY-MM-DD format" },
          startTime: { type: "string", description: "Proposed start time, e.g. 2:00 PM" },
          endTime: { type: "string", description: "Proposed end time, e.g. 3:00 PM. Defaults to 1 hour if omitted." },
          excludeTaskKey: {
            type: "string",
            description: "Optional. 'projectId:phaseOrder:taskOrder' of a task being rescheduled, to exclude it from conflict detection.",
          },
          excludeEventId: {
            type: "string",
            description: "Optional. Calendar event ID being moved, to exclude from conflict detection.",
          },
        },
        required: ["date", "startTime"],
      },
    },
  },
];

function buildSystemPrompt(context: AiContext): string {
  const projectLines = context.projects.map((p) => {
    const tasksDue = p.tasks
      .filter((t) => !t.completed && t.dueDate <= context.todayDate)
      .length;
    const overdue = tasksDue > 0 ? ` (${tasksDue} overdue)` : "";
    return `  - {{project:${p.id}:${p.name}}} — ${p.status}, ${p.completionPct}% complete (${p.completedTasks}/${p.totalTasks} tasks), target: ${p.targetDate}${overdue}`;
  });

  const allTasks = context.projects.flatMap((p) =>
    p.tasks.map((t) => ({
      ...t,
      projectId: p.id,
      projectName: p.name,
    })),
  );

  const taskLines = allTasks.map((t) => {
    const timeRange = t.endTime
      ? `${t.startTime} – ${t.endTime}`
      : t.startTime;
    const desc = t.description ? ` Description: ${t.description}` : "";
    return `  - [${t.completed ? "x" : " "}] {{task:${t.projectId}:${t.phaseOrder}:${t.taskOrder}:${t.title}}} — Project: ${t.projectName}, Phase ${t.phaseOrder} (${t.phaseName}), Due: ${t.dueDate}, Time: ${timeRange}.${desc}`;
  });

  const eventLines = context.calendarEvents.map(
    (e) =>
      `  - {{event:${e.id}:${e.title}}} — ${e.startDate} to ${e.endDate}${e.projectName ? ` (${e.projectName})` : ""}`,
  );

  const dailyLimitNote = context.dailyTaskLimit
    ? `\n- Daily task limit: ${context.dailyTaskLimit} tasks per day`
    : "";

  const currentProjectNote = context.currentProjectId
    ? `\nThe user is currently viewing project: ${context.currentProjectName} (ID: ${context.currentProjectId}). Default actions to this project unless otherwise specified.`
    : "";

  return `You are a helpful project management AI assistant. You help users manage their projects, tasks, and calendar events.

## User Context
- User: ${context.userName}
- Today: ${context.todayDate}${dailyLimitNote}${currentProjectNote}

## Projects
${projectLines.length > 0 ? projectLines.join("\n") : "  (no projects yet)"}

## All Tasks
${taskLines.length > 0 ? taskLines.join("\n") : "  (no tasks yet)"}

## Calendar Events
${eventLines.length > 0 ? eventLines.join("\n") : "  (no calendar events yet)"}

## Behavior Rules
1. For read-only questions (task lists, project status, calendar queries), answer conversationally using the context above. No tool call needed.
2. For write actions (creating tasks, updating status, rescheduling, calendar events), ALWAYS use the appropriate tool. The user will see a confirmation card and must confirm before the action executes.
3. When referencing projects in your responses, use this exact format: {{project:PROJECT_ID:Project Name}}
4. When referencing tasks, use: {{task:PROJECT_ID:PHASE_ORDER:TASK_ORDER:Task Name}}
5. When referencing calendar events, use: {{event:EVENT_ID:Event Title}}
6. Never expose raw database IDs in plain text. Always wrap them in the reference format above so they render as clickable links.
7. Be concise and helpful. Use markdown for formatting.
8. When creating tasks, pick the most relevant existing phase. If the user doesn't specify, choose the best match.
9. Dates should be in YYYY-MM-DD format for tool calls.
10. Times should be in 12-hour format (e.g. "9:00 AM", "2:30 PM") for tool calls. Every task has a startTime; endTime is optional.
11. When the user asks about scheduled times (e.g. "what do I have at 3pm?"), use the startTime/endTime data above to answer. When moving a task to a new time, use updateTaskTime (same day) or updateTaskDueDate with newStartTime/newEndTime (different day).

## Conflict Detection Rules
12. **ALWAYS call checkTimeConflicts BEFORE any scheduling action** (createTask, updateTaskDueDate, updateTaskTime, createCalendarEvent, moveCalendarEvent). This is mandatory — never skip this step.
13. When checkTimeConflicts returns conflicts, present them clearly with a ⚠️ warning. Show each conflict (time overlaps, calendar event overlaps, daily limit) and offer 2-3 alternative time slots from the suggestedSlots field.
14. If the user asks to schedule at a conflicting time, show the conflict and alternatives, then ask if they want to proceed anyway or pick an alternative. Only call the write tool after the user decides.
15. When rescheduling multiple tasks at once, check conflicts sequentially for each task, distributing across free slots. Present the full proposed schedule for confirmation before executing any writes.
16. When rescheduling a task, pass its excludeTaskKey (projectId:phaseOrder:taskOrder) to checkTimeConflicts so it doesn't conflict with itself.
17. When moving a calendar event, pass its excludeEventId to checkTimeConflicts.
18. When planning or creating tasks, prefer breaking work into focused chunks of roughly 45–75 minutes, aiming for about 60 minutes per task when possible.
19. Task names must be clear, specific, and outcome-based (e.g. "Outline onboarding email sequence" instead of "Emails" or "Misc work"). Avoid generic or vague titles.`;
}

export async function POST(request: Request) {
  const { messages, context, useClaudeFirstPrompt } = await request.json();

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "OPENROUTER_API_KEY is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const model = useClaudeFirstPrompt
      ? "anthropic/claude-opus-4.5"
      : "google/gemini-3-flash-preview";

    const systemMessage = context
      ? { role: "system", content: buildSystemPrompt(context as AiContext) }
      : null;

    const apiMessages = [
      ...(systemMessage ? [systemMessage] : []),
      ...(Array.isArray(messages) ? messages : []),
    ];

    const body: Record<string, unknown> = {
      model,
      messages: apiMessages,
      stream: true,
    };

    if (context) {
      body.tools = TOOLS;
      body.tool_choice = "auto";
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({
          error: `OpenRouter API error: ${response.status}`,
          details: errorText,
        }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        error: "Failed to connect to OpenRouter",
        details: details || undefined,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

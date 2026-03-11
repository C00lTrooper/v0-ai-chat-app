import type { AiContext } from "@/lib/ai-tools";

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "createTask",
      description:
        "Create a new task in a project phase. Use when the user asks to add, create, or schedule a new task.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "The project ID to add the task to" },
          projectName: { type: "string", description: "The project name (for display)" },
          phaseOrder: { type: "number", description: "The phase order number to add the task to" },
          phaseName: { type: "string", description: "The phase name (for display)" },
          title: { type: "string", description: "The task title" },
          dueDate: { type: "string", description: "Due date in YYYY-MM-DD format" },
          time: { type: "string", description: "Estimated time, e.g. '2 hours'" },
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
        "Reschedule a task to a new due date. Use when the user asks to move, postpone, or reschedule a task.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "The project ID" },
          projectName: { type: "string", description: "The project name" },
          phaseOrder: { type: "number", description: "Phase order number" },
          taskOrder: { type: "number", description: "Task order number" },
          taskName: { type: "string", description: "Task name (for display)" },
          newDate: { type: "string", description: "New due date in YYYY-MM-DD format" },
        },
        required: ["projectId", "projectName", "phaseOrder", "taskOrder", "taskName", "newDate"],
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

  const taskLines = allTasks.map(
    (t) =>
      `  - [${t.completed ? "x" : " "}] {{task:${t.projectId}:${t.phaseOrder}:${t.taskOrder}:${t.title}}} — Project: ${t.projectName}, Phase ${t.phaseOrder} (${t.phaseName}), Due: ${t.dueDate}`,
  );

  const eventLines = context.calendarEvents.map(
    (e) =>
      `  - {{event:${e.id}:${e.title}}} — ${e.startDate} to ${e.endDate}${e.projectName ? ` (${e.projectName})` : ""}`,
  );

  const currentProjectNote = context.currentProjectId
    ? `\nThe user is currently viewing project: ${context.currentProjectName} (ID: ${context.currentProjectId}). Default actions to this project unless otherwise specified.`
    : "";

  return `You are a helpful project management AI assistant. You help users manage their projects, tasks, and calendar events.

## User Context
- User: ${context.userName}
- Today: ${context.todayDate}${currentProjectNote}

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
9. Dates should be in YYYY-MM-DD format for tool calls.`;
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

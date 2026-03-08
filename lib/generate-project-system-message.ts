/**
 * System message for the generate-project API: given project info,
 * respond with a single JSON object matching the project schema.
 */
const generateTemplate = {
  project_name: "string",
  project_summary: {
    name: "string",
    objective: "string",
    duration: "integer (days)",
    estimated_budget: "integer",
    target_date: "YYYY-MM-DD",
  },
  project_wbs: [
    {
      order: "integer (0-based)",
      name: "string",
      description: "string",
      start_date: "YYYY-MM-DD",
      end_date: "YYYY-MM-DD",
      tasks: [
        {
          order: "integer (0-based)",
          name: "string",
          date: "YYYY-MM-DD",
          time: "HH:MM or HH:MM:SS",
        },
      ],
    },
  ],
  project_milestones: [
    {
      name: "string",
      description: "string",
      target_date: "YYYY-MM-DD",
    },
  ],
};

export function buildGenerateProjectSystemMessage() {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const time = now.toTimeString().split(" ")[0];

  return {
    role: "system" as const,
    content:
      `You are a project planning assistant. Today's date is ${today} and the current time is ${time} (server local time). Use these for computing start/end dates and schedules.\n\n` +
      "The user will provide project name, summary, objective, and optionally a target date. Respond ONLY with a single JSON object that strictly follows this template. Use realistic values: proper dates (YYYY-MM-DD), times (HH:MM or HH:MM:SS), and at least one phase in project_wbs with at least one task. Include project_milestones if appropriate. Do not include any explanations or markdown. The template is:\n\n" +
      JSON.stringify(generateTemplate, null, 2),
  };
}

import newProjectTemplate from "@/prompts/new_project.json"

export function buildNewProjectSystemMessage() {
  const now = new Date()
  const today = now.toISOString().split("T")[0]
  const time = now.toTimeString().split(" ")[0] // HH:MM:SS in server local time

  return {
    role: "system" as const,
    content:
      `You are a project planning assistant. Today's date is ${today} and the current time is ${time} (server local time). Always treat these as the current calendar date and time when interpreting the user's request, computing durations, or reasoning about schedules.\n\n` +
      "For the user's first message, respond ONLY with a single JSON object that strictly follows this template, replacing the example types with realistic values derived from the user's request. Do not include any explanations, comments, or prose. Do NOT wrap the JSON in markdown or code fences. The template is:\n\n" +
      JSON.stringify(newProjectTemplate, null, 2),
  }
}


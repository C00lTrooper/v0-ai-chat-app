import newProjectTemplate from "@/prompts/new_project.json"

export function buildNewProjectSystemMessage() {
  return {
    role: "system" as const,
    content:
      "You are a project planning assistant. For the user's first message, respond ONLY with a single JSON object that strictly follows this template, replacing the example types with realistic values derived from the user's request. Do not include any explanations, comments, or prose. Do NOT wrap the JSON in markdown or code fences. The template is:\n\n" +
      JSON.stringify(newProjectTemplate, null, 2),
  }
}


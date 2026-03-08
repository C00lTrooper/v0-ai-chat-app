import { buildGenerateProjectSystemMessage } from "@/lib/generate-project-system-message";
import { extractFirstJsonObject } from "@/lib/parse-project-json";
import { ProjectSchema } from "@/lib/project-schema";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const {
    projectName,
    summaryName,
    objective,
    targetDate,
  }: {
    projectName?: string;
    summaryName?: string;
    objective?: string;
    targetDate?: string;
  } = body;

  if (!projectName || typeof projectName !== "string" || !projectName.trim()) {
    return new Response(
      JSON.stringify({ error: "projectName is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "OPENROUTER_API_KEY is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const summary = summaryName?.trim() || projectName.trim();
  const objectiveText = (objective?.trim() || "").replace(/\n/g, " ");
  const target = (targetDate?.trim() || "").replace(/\n/g, " ");

  const systemMessage = buildGenerateProjectSystemMessage();
  const userContent =
    `Create a full project plan (WBS with phases and tasks, and milestones) for:\n\n` +
    `- Project name: ${projectName.trim()}\n` +
    `- Summary name: ${summary}\n` +
    `- Objective: ${objectiveText || "(none provided)"}\n` +
    (target ? `- Target date: ${target}\n` : "- Target date: (choose a reasonable date)\n");

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4",
        messages: [
          systemMessage,
          { role: "user" as const, content: userContent },
        ],
        stream: false,
      }),
    });

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

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return new Response(
        JSON.stringify({ error: "Empty or invalid model response" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    const raw = extractFirstJsonObject(content);
    const validated = ProjectSchema.safeParse(raw);
    if (!validated.success) {
      return new Response(
        JSON.stringify({
          error: "Generated project did not match schema",
          details: validated.error.flatten(),
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ data: validated.data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({
        error: "Failed to generate project",
        details: details || undefined,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

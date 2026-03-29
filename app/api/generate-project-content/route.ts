import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { extractFirstJsonObject } from "@/lib/parse-project-json";
import type { Project } from "@/lib/project-schema";
import {
  buildIncrementalGenerationSystemMessage,
  buildIncrementalGenerationUserContent,
  buildRegenerateSystemMessage,
  type ExistingFeatureSummary,
  type GenerationFlags,
} from "@/lib/generate-project-content-prompt";
import {
  incrementalGenerationResponseSchema,
  regenerateResponseSchema,
} from "@/lib/generate-project-content-schema";
import type { Id } from "@/convex/_generated/dataModel";

const MODEL = "google/gemini-3-flash-preview";

async function verifyOwnerAccess(
  convexJwt: string,
  projectId: Id<"projects">,
): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return false;
  const client = new ConvexHttpClient(url);
  client.setAuth(convexJwt);
  const row = await client.query(api.projects.getById, { projectId });
  return Boolean(row?.isOwner);
}

export async function POST(request: Request) {
  const { userId, getToken } = await auth();
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const convexJwt = await getToken({ template: "convex" });
  if (!convexJwt) {
    return new Response(
      JSON.stringify({ error: "Missing Convex JWT (Clerk Convex template)" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "regenerate" ? "regenerate" : "generate";

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "OPENROUTER_API_KEY is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const projectIdRaw = body.projectId;
  if (typeof projectIdRaw !== "string" || !projectIdRaw) {
    return new Response(
      JSON.stringify({ error: "projectId is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const projectId = projectIdRaw as Id<"projects">;
  const ok = await verifyOwnerAccess(convexJwt, projectId);
  if (!ok) {
    return new Response(
      JSON.stringify({ error: "Not authorized" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  if (mode === "regenerate") {
    const scope = body.scope === "feature" ? "feature" : "phase";
    const additionalInstructions =
      typeof body.additionalInstructions === "string"
        ? body.additionalInstructions
        : "";
    const subtree =
      typeof body.subtree === "string" ? body.subtree : JSON.stringify(body.subtreeJson ?? {});

    const userContent =
      `Regenerate this ${scope} subtree. Return only replacementPhase or replacementFeature JSON.\n\n` +
      `Subtree JSON:\n${subtree}\n\n` +
      (additionalInstructions.trim()
        ? `Extra instructions:\n${additionalInstructions.trim()}`
        : "");

    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [buildRegenerateSystemMessage(), { role: "user", content: userContent }],
            stream: false,
          }),
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

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        return new Response(
          JSON.stringify({ error: "Empty or invalid model response" }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        );
      }

      const raw = extractFirstJsonObject(content);
      const validated = regenerateResponseSchema.safeParse(raw);
      if (!validated.success) {
        return new Response(
          JSON.stringify({
            error: "Regenerate response did not match schema",
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
        JSON.stringify({ error: "Failed to regenerate", details }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // --- generate ---
  let project: Project;
  try {
    project =
      typeof body.project === "object" && body.project !== null
        ? (body.project as Project)
        : (JSON.parse(String(body.projectJson)) as Project);
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid project payload" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const projectName =
    typeof body.projectName === "string" ? body.projectName : "";
  const summaryName =
    typeof body.summaryName === "string" ? body.summaryName : "";
  const objective = typeof body.objective === "string" ? body.objective : "";
  const targetDate =
    typeof body.targetDate === "string" ? body.targetDate : "";

  const flags: GenerationFlags = {
    generatePhases: Boolean(body.generatePhases),
    generateFeatures: Boolean(body.generateFeatures),
    tasksForPhases: Boolean(body.tasksForPhases),
    tasksForFeatures: Boolean(body.tasksForFeatures),
  };

  const targetPhaseOrders = Array.isArray(body.targetPhaseOrders)
    ? body.targetPhaseOrders.filter((n: unknown) => typeof n === "number")
    : [];

  const targetFeatureKeys = Array.isArray(body.targetFeatureKeys)
    ? body.targetFeatureKeys.filter((s: unknown) => typeof s === "string")
    : [];

  const features: ExistingFeatureSummary[] = Array.isArray(body.features)
    ? body.features
        .map((f: unknown) => {
          if (!f || typeof f !== "object") return null;
          const o = f as Record<string, unknown>;
          if (
            typeof o._id !== "string" ||
            typeof o.phaseOrder !== "number" ||
            typeof o.name !== "string"
          ) {
            return null;
          }
          return {
            _id: o._id,
            phaseOrder: o.phaseOrder,
            name: o.name,
            description:
              typeof o.description === "string" ? o.description : "",
          };
        })
        .filter(Boolean) as ExistingFeatureSummary[]
    : [];

  const additionalInstructions =
    typeof body.additionalInstructions === "string"
      ? body.additionalInstructions
      : "";

  const userContent = buildIncrementalGenerationUserContent({
    project,
    projectName,
    summaryName,
    objective,
    targetDate,
    features,
    flags,
    targetPhaseOrders,
    targetFeatureKeys,
    additionalInstructions,
  });

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          buildIncrementalGenerationSystemMessage(),
          { role: "user", content: userContent },
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
    const validated = incrementalGenerationResponseSchema.safeParse(raw);
    if (!validated.success) {
      return new Response(
        JSON.stringify({
          error: "Generated content did not match schema",
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
      JSON.stringify({ error: "Failed to generate project content", details }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

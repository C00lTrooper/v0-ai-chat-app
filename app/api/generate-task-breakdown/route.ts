export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const projectName =
    typeof body.projectName === "string" ? body.projectName.trim() : "";
  const phaseName =
    typeof body.phaseName === "string" ? body.phaseName.trim() : "";
  const totalMinutes =
    typeof body.totalMinutes === "number" && body.totalMinutes > 0
      ? Math.min(body.totalMinutes, 8 * 60)
      : 120;

  if (!title) {
    return new Response(
      JSON.stringify({ error: "title is required" }),
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

  const contextLines: string[] = [
    `You are an expert project planner breaking a single task into smaller implementation steps.`,
    ``,
    `Parent task: ${title}`,
    `Total available time (approx): ${totalMinutes} minutes.`,
  ];

  if (description) {
    contextLines.push(`Description: ${description}`);
  }
  if (projectName) {
    contextLines.push(`Project: ${projectName}`);
  }
  if (phaseName) {
    contextLines.push(`Phase: ${phaseName}`);
  }

  contextLines.push(
    ``,
    `Requirements:`,
    `- 3 to 8 steps maximum.`,
    `- Each step must be self-contained and clearly describe a concrete action and outcome.`,
    `- Prefer steps between 30 and 75 minutes (never more than 120).`,
    `- Together, the steps should fully complete the parent task.`,
    ``,
    `Return ONLY valid JSON: an array of objects with this shape:`,
    `[{ "title": "do something specific", "minutes": 45 }, ...]`,
  );

  const prompt = contextLines.join("\n");

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You decompose tasks into concrete implementation steps with realistic time estimates. Respond with JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        stream: false,
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return new Response(
        JSON.stringify({
          error: "Failed to generate task breakdown",
          details: text,
        }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const data = await response.json();
    const rawContent =
      typeof data.choices?.[0]?.message?.content === "string"
        ? data.choices[0].message.content.trim()
        : "";

    let steps: { title: string; minutes: number }[] = [];

    const coerceSteps = (value: unknown) => {
      if (!Array.isArray(value)) return;
      const out: { title: string; minutes: number }[] = [];
      for (const item of value) {
        if (!item) continue;
        const t =
          typeof (item as any).title === "string"
            ? (item as any).title.trim()
            : typeof item === "string"
            ? (item as string).trim()
            : "";
        const mRaw = (item as any).minutes;
        const m =
          typeof mRaw === "number" && mRaw > 0 && mRaw < 6 * 60
            ? mRaw
            : 45;
        if (!t) continue;
        out.push({ title: t, minutes: m });
      }
      if (out.length) steps = out;
    };

    try {
      const parsed = JSON.parse(rawContent);
      coerceSteps(parsed);
    } catch {
      const match = rawContent.match(/\[([\s\S]*)\]/);
      if (match) {
        try {
          const fallback = JSON.parse(match[0]);
          coerceSteps(fallback);
        } catch {
          // ignore
        }
      }
    }

    if (!steps.length) {
      return new Response(
        JSON.stringify({
          error: "Model returned no usable breakdown steps",
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    // Cap to 8 steps
    const limited = steps.slice(0, 8);

    return new Response(JSON.stringify({ steps: limited }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({
        error: "Failed to generate task breakdown",
        details,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}


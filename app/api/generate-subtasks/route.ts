export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const taskTitle =
    typeof body.taskTitle === "string" ? body.taskTitle.trim() : "";
  const taskDescription =
    typeof body.taskDescription === "string"
      ? body.taskDescription.trim()
      : "";
  const projectName =
    typeof body.projectName === "string" ? body.projectName.trim() : "";

  if (!taskTitle) {
    return new Response(
      JSON.stringify({ error: "taskTitle is required" }),
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

  const pieces = [
    `You are an expert project planner helping break a single task into smaller subtasks.`,
    ``,
    `Task: ${taskTitle}`,
  ];

  if (taskDescription) {
    pieces.push(`Context: ${taskDescription}`);
  }

  if (projectName) {
    pieces.push(`Project: ${projectName}`);
  }

  pieces.push(
    ``,
    `Return ONLY a JSON array of 3–6 short, actionable subtask titles, no explanations or extra fields.`,
  );

  const prompt = pieces.join("\n");

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
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                "You break tasks into concise, concrete subtasks. Respond with JSON only.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          stream: false,
          max_tokens: 300,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      return new Response(
        JSON.stringify({
          error: "Failed to generate subtasks",
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

    let subtasks: string[] = [];

    try {
      const parsed = JSON.parse(rawContent);
      if (Array.isArray(parsed)) {
        subtasks = parsed
          .map((item) =>
            typeof item === "string"
              ? item.trim()
              : typeof item?.title === "string"
              ? item.title.trim()
              : "",
          )
          .filter((t) => t.length > 0);
      }
    } catch {
      // If the model didn't return pure JSON, attempt a simple fallback parse.
      const match = rawContent.match(/\[([\s\S]*)\]/);
      if (match) {
        try {
          const fallback = JSON.parse(match[0]);
          if (Array.isArray(fallback)) {
            subtasks = fallback
              .map((item) =>
                typeof item === "string"
                  ? item.trim()
                  : typeof item?.title === "string"
                  ? item.title.trim()
                  : "",
              )
              .filter((t) => t.length > 0);
          }
        } catch {
          // ignore
        }
      }
    }

    if (subtasks.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Model returned no usable subtasks",
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    const limited = subtasks.slice(0, 6);

    return new Response(JSON.stringify({ subtasks: limited }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({
        error: "Failed to generate subtasks",
        details,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}


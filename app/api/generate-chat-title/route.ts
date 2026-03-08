export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    return new Response(
      JSON.stringify({ error: "message is required" }),
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

  const truncated =
    message.length > 500 ? message.slice(0, 497) + "…" : message;

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
                "You are a helpful assistant. Reply with only a short chat title (max 5–6 words) that summarizes the following message. No quotes, no punctuation at the end, just the title.",
            },
            { role: "user", content: truncated },
          ],
          stream: false,
          max_tokens: 30,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      return new Response(
        JSON.stringify({
          error: "Failed to generate title",
          details: text,
        }),
        { status: response.status, headers: { "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const raw =
      data.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, "") ??
      "";
    const title = raw.slice(0, 80) || "New chat";

    return new Response(JSON.stringify({ title }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: "Failed to generate title", details }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

import { buildNewProjectSystemMessage } from "@/lib/new-project-system-message"

export async function POST(request: Request) {
  const { messages } = await request.json()

  // For the very first user message, prepend a system instruction that
  // tells the model to answer using the new_project.json template.
  const outboundMessages =
    Array.isArray(messages) && messages.length === 1
      ? [buildNewProjectSystemMessage(), ...messages]
      : messages

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "OPENROUTER_API_KEY is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }

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
          messages: outboundMessages,
          stream: true,
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return new Response(
        JSON.stringify({ error: `OpenRouter API error: ${response.status}`, details: errorText }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      )
    }

    // Stream the response back to the client
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to connect to OpenRouter", details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}

export function extractFirstJsonObject(text: string): unknown {
  let trimmed = text.trim()

  // Handle ```json ... ``` fenced blocks if present
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) {
    trimmed = fenceMatch[1].trim()
  }

  const firstBrace = trimmed.indexOf("{")
  const lastBrace = trimmed.lastIndexOf("}")

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("No JSON object found in response")
  }

  const jsonSlice = trimmed.slice(firstBrace, lastBrace + 1)
  return JSON.parse(jsonSlice)
}


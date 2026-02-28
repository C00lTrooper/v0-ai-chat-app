"use client"

import { useState, useCallback, useRef } from "react"
import { extractFirstJsonObject } from "@/lib/parse-project-json"
import type { Project } from "@/lib/project-schema"

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  reasoning?: string
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(
    async (content: string) => {
      const isFirstExchange = messages.length === 0

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
      }

      setMessages((prev) => [...prev, userMessage])
      setIsLoading(true)
      setError(null)

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        reasoning: "",
      }

      setMessages((prev) => [...prev, assistantMessage])

      const abortController = new AbortController()
      abortControllerRef.current = abortController

      try {
        const apiMessages = [
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content },
        ]

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
          signal: abortController.signal,
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "Failed to send message")
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error("No response body")

        const decoder = new TextDecoder()
        let buffer = ""
        let fullAssistantContent = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith("data: ")) continue
            const data = trimmed.slice(6)
            if (data === "[DONE]") continue

            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta

              if (delta?.reasoning) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? {
                          ...m,
                          reasoning: (m.reasoning || "") + delta.reasoning,
                        }
                      : m,
                  ),
                )
              }

              if (delta?.content) {
                fullAssistantContent += delta.content
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, content: m.content + delta.content }
                      : m,
                  ),
                )
              }
            } catch {
              // Skip malformed JSON chunks
            }
          }
        }

        // After the first assistant reply for a new project, try to extract, save & validate JSON.
        if (isFirstExchange && fullAssistantContent.trim()) {
          try {
            const parsed = extractFirstJsonObject(fullAssistantContent)
            const saveResponse = await fetch("/api/projects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(parsed),
            })

            if (!saveResponse.ok) {
              const errorData = await saveResponse.json().catch(() => null)
              const message =
                errorData?.error ??
                "Failed to validate or save the project JSON"
              setError(message)
            }
          } catch {
            // If the first response is not valid JSON, surface a soft error.
            setError("The first response was not valid project JSON.")
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        const errorMessage = (err as Error).message || "Something went wrong"
        setError(errorMessage)
        setMessages((prev) => prev.filter((m) => m.id !== assistantMessage.id))
      } finally {
        setIsLoading(false)
        abortControllerRef.current = null
      }
    },
    [messages],
  )

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsLoading(false)
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  const loadProjectIntoChat = useCallback((project: Project) => {
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: JSON.stringify(project, null, 2),
    }

    setMessages((prev) => [...prev, assistantMessage])
  }, [])

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    stopGeneration,
    clearMessages,
    loadProjectIntoChat,
  }
}

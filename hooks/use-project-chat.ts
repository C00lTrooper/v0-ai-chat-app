"use client"

import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useAuth } from "@/components/auth-provider"
import { convexClient } from "@/lib/convex"
import { extractFirstJsonObject } from "@/lib/parse-project-json"
import { ProjectSchema } from "@/lib/project-schema"
import type { Id } from "@/convex/_generated/dataModel"

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  reasoning?: string
}

function slugify(name: string, fallback: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback
  )
}

export function useProjectChat({
  activeProjectId,
  onProjectCreated,
  useClaudeFirstPrompt,
}: {
  activeProjectId: Id<"projects"> | null
  onProjectCreated: (projectId: Id<"projects">, slug: string) => void
  useClaudeFirstPrompt: boolean
}) {
  const { sessionToken } = useAuth()
  const hasCreatedProjectRef = useRef(false)

  // ---- Convex real-time query (active when a project is selected) --------
  const chatData = useQuery(
    api.chats.listByProject,
    activeProjectId && sessionToken
      ? { token: sessionToken, projectId: activeProjectId }
      : "skip",
  )

  const sendMessageMutation = useMutation(api.chats.sendMessage)

  // ---- Local state for new-project chat (before project exists) ----------
  const [localMessages, setLocalMessages] = useState<Message[]>([])
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Reset local state when switching projects
  useEffect(() => {
    setLocalMessages([])
    setStreamingMessage(null)
    setError(null)
    setIsLoading(false)
    abortRef.current?.abort()
    abortRef.current = null
    // When starting a brand new chat (no active project), allow one project creation again
    if (!activeProjectId) {
      hasCreatedProjectRef.current = false
    }
  }, [activeProjectId])

  // ---- Combined messages -------------------------------------------------
  const messages: Message[] = useMemo(() => {
    let base: Message[]

    if (activeProjectId && chatData) {
      base = chatData.messages.map((m) => ({
        id: m._id,
        role: m.role as "user" | "assistant",
        content: m.content,
        reasoning: m.reasoning ?? undefined,
      }))
    } else if (activeProjectId) {
      // Query still loading — show nothing yet
      base = []
    } else {
      base = localMessages
    }

    if (streamingMessage) return [...base, streamingMessage]
    return base
  }, [activeProjectId, chatData, localMessages, streamingMessage])

  // ---- Streaming helper --------------------------------------------------
  async function streamResponse(
    apiMessages: Array<{ role: string; content: string }>,
    signal: AbortSignal,
    onDelta: (delta: { content?: string; reasoning?: string }) => void,
    useClaudeFirstPrompt: boolean,
  ): Promise<{ fullContent: string; fullReasoning: string }> {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: apiMessages, useClaudeFirstPrompt }),
      signal,
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || "Failed to send message")
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    const decoder = new TextDecoder()
    let buffer = ""
    let fullContent = ""
    let fullReasoning = ""

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
            fullReasoning += delta.reasoning
            onDelta({ reasoning: delta.reasoning })
          }
          if (delta?.content) {
            fullContent += delta.content
            onDelta({ content: delta.content })
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    return { fullContent, fullReasoning }
  }

  // ---- Send a message ----------------------------------------------------
  const sendMessage = useCallback(
    async (content: string) => {
      if (!sessionToken) return

      const isNewProjectChat = !activeProjectId
      const isFirstExchange =
        isNewProjectChat &&
        !hasCreatedProjectRef.current &&
        localMessages.length === 0

      // 1. Persist user message (or queue locally)
      if (activeProjectId) {
        await sendMessageMutation({
          token: sessionToken,
          projectId: activeProjectId,
          role: "user",
          content,
        })
      } else {
        setLocalMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "user", content },
        ])
      }

      // 2. Prepare streaming placeholder
      setIsLoading(true)
      setError(null)

      const streamId = crypto.randomUUID()
      setStreamingMessage({ id: streamId, role: "assistant", content: "", reasoning: "" })

      const abortController = new AbortController()
      abortRef.current = abortController

      try {
        // Build the message history for the API
        const history: Array<{ role: string; content: string }> = activeProjectId
          ? (chatData?.messages ?? []).map((m) => ({
              role: m.role,
              content: m.content,
            }))
          : localMessages.map((m) => ({ role: m.role, content: m.content }))

        const apiMessages = [...history, { role: "user" as const, content }]

        // 3. Stream the AI response
        const { fullContent, fullReasoning } = await streamResponse(
          apiMessages,
          abortController.signal,
          (delta) => {
            setStreamingMessage((prev) => {
              if (!prev) return prev
              return {
                ...prev,
                content: delta.content ? prev.content + delta.content : prev.content,
                reasoning: delta.reasoning
                  ? (prev.reasoning || "") + delta.reasoning
                  : prev.reasoning,
              }
            })
          },
          useClaudeFirstPrompt,
        )

        // 4. Persist results
        if (activeProjectId) {
          // Active project — save assistant response
          await sendMessageMutation({
            token: sessionToken,
            projectId: activeProjectId,
            role: "assistant",
            content: fullContent,
            reasoning: fullReasoning || undefined,
          })
        } else if (
          isFirstExchange &&
          !hasCreatedProjectRef.current &&
          fullContent.trim() &&
          convexClient
        ) {
          // New-project flow — create project, then persist both messages
          try {
            const raw = extractFirstJsonObject(fullContent)
            const validated = ProjectSchema.safeParse(raw)

            if (validated.success) {
              const project = validated.data
              const slug = slugify(
                project.project_name || project.project_summary.name,
                `project-${Date.now()}`,
              )

              const result = await convexClient.mutation(api.projects.create, {
                token: sessionToken,
                slug,
                projectName: project.project_name,
                summaryName: project.project_summary.name,
                objective: project.project_summary.objective,
                targetDate: project.project_summary.target_date,
                data: JSON.stringify(project),
              })

              // Persist the conversation into the new project's chat
              await sendMessageMutation({
                token: sessionToken,
                projectId: result.projectId,
                role: "user",
                content,
              })
              await sendMessageMutation({
                token: sessionToken,
                projectId: result.projectId,
                role: "assistant",
                content: fullContent,
                reasoning: fullReasoning || undefined,
              })

              onProjectCreated(result.projectId, result.slug)
              hasCreatedProjectRef.current = true
            } else {
              setError("The AI response was not valid project JSON.")
              setLocalMessages((prev) => [
                ...prev,
                { id: streamId, role: "assistant", content: fullContent, reasoning: fullReasoning },
              ])
            }
          } catch {
            setError("Failed to save the project.")
            setLocalMessages((prev) => [
              ...prev,
              { id: streamId, role: "assistant", content: fullContent, reasoning: fullReasoning },
            ])
          }
        } else {
          // Follow-up in a not-yet-saved chat
          setLocalMessages((prev) => [
            ...prev,
            { id: streamId, role: "assistant", content: fullContent, reasoning: fullReasoning },
          ])
        }

        setStreamingMessage(null)
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setStreamingMessage(null)
          return
        }
        setError((err as Error).message || "Something went wrong")
        setStreamingMessage(null)
      } finally {
        setIsLoading(false)
        abortRef.current = null
      }
    },
    [
      activeProjectId,
      sessionToken,
      chatData,
      localMessages,
      sendMessageMutation,
      onProjectCreated,
      useClaudeFirstPrompt,
    ],
  )

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort()
    setIsLoading(false)
  }, [])

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    stopGeneration,
  }
}

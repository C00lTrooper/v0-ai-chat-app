"use client"

import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useAuth } from "@/components/auth-provider"
import type { Id } from "@/convex/_generated/dataModel"

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  reasoning?: string
}

export function useProjectChat({
  activeChatId,
  projectToLink,
  onProjectLinked,
  useClaudeFirstPrompt,
}: {
  activeChatId: Id<"chats"> | null
  projectToLink: Id<"projects"> | null
  onProjectLinked: (chatId: Id<"chats">) => void
  useClaudeFirstPrompt: boolean
}) {
  const { sessionToken } = useAuth()

  const chatData = useQuery(
    api.chats.getChatWithMessages,
    activeChatId && sessionToken
      ? { token: sessionToken, chatId: activeChatId }
      : "skip",
  )

  const sendMessageMutation = useMutation(api.chats.sendMessage)
  const createChatMutation = useMutation(api.chats.createChat)
  const renameChatMutation = useMutation(api.chats.renameChat)

  // ---- Local state for new-project chat (before project exists) ----------
  const [localMessages, setLocalMessages] = useState<Message[]>([])
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setLocalMessages([])
    setStreamingMessage(null)
    setError(null)
    setIsLoading(false)
    abortRef.current?.abort()
    abortRef.current = null
  }, [activeChatId])

  const messages: Message[] = useMemo(() => {
    let base: Message[]
    if (activeChatId && chatData) {
      base = chatData.messages.map((m) => ({
        id: m._id,
        role: m.role as "user" | "assistant",
        content: m.content,
        reasoning: m.reasoning ?? undefined,
      }))
    } else if (activeChatId) {
      base = []
    } else {
      base = localMessages
    }
    if (streamingMessage) return [...base, streamingMessage]
    return base
  }, [activeChatId, chatData, localMessages, streamingMessage])

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
      const errorData = await response.json().catch(() => ({}))
      const message = errorData.error || "Failed to send message"
      const details = errorData.details ? ` ${errorData.details}` : ""
      throw new Error(message + details)
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

  const sendMessage = useCallback(
    async (content: string) => {
      if (!sessionToken) return

      const wasEmptyChat =
        activeChatId && (chatData?.messages.length ?? 0) === 0

      let effectiveChatId: Id<"chats"> | null = activeChatId

      if (!effectiveChatId && projectToLink) {
        const { chatId } = await createChatMutation({
          token: sessionToken,
          projectId: projectToLink,
        })
        effectiveChatId = chatId
      }

      if (effectiveChatId) {
        await sendMessageMutation({
          token: sessionToken,
          chatId: effectiveChatId,
          role: "user",
          content,
        })
      } else {
        setLocalMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "user", content },
        ])
      }

      setIsLoading(true)
      setError(null)
      const streamId = crypto.randomUUID()
      setStreamingMessage({ id: streamId, role: "assistant", content: "", reasoning: "" })
      const abortController = new AbortController()
      abortRef.current = abortController

      try {
        // If the chat was created from a project, the very first assistant
        // message is the raw project overview JSON. We want that to show up
        // in the UI, but we *never* want to send it back to the model,
        // otherwise the AI keeps echoing the overview.
        const initialAssistantContent =
          chatData?.messages?.[0]?.role === "assistant"
            ? chatData.messages[0].content.trim()
            : ""

        // Build history from existing messages, but strip out any assistant
        // message whose content exactly matches that initial project overview.
        const history: Array<{ role: string; content: string }> =
          effectiveChatId && chatData
            ? chatData.messages
                .filter((m, index) => {
                  if (!initialAssistantContent) return true
                  return !(
                    m.role === "assistant" &&
                    m.content.trim() === initialAssistantContent
                  )
                })
                .map((m) => ({ role: m.role, content: m.content }))
            : effectiveChatId
              ? []
              : localMessages.map((m) => ({ role: m.role, content: m.content }))
        const apiMessages = [...history, { role: "user" as const, content }]

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

        if (effectiveChatId) {
          await sendMessageMutation({
            token: sessionToken,
            chatId: effectiveChatId,
            role: "assistant",
            content: fullContent,
            reasoning: fullReasoning || undefined,
          })
          if (projectToLink && !activeChatId) {
            onProjectLinked(effectiveChatId)
          }
          const isFirstMessage =
            (projectToLink && !activeChatId) || wasEmptyChat
          if (isFirstMessage && content.trim()) {
            try {
              const titleRes = await fetch("/api/generate-chat-title", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: content }),
              })
              if (titleRes.ok) {
                const { title } = (await titleRes.json()) as { title?: string }
                if (title?.trim()) {
                  await renameChatMutation({
                    token: sessionToken,
                    chatId: effectiveChatId,
                    name: title.trim().slice(0, 80),
                  })
                }
              }
            } catch {
              // ignore title failure
            }
          }
        } else {
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
      activeChatId,
      projectToLink,
      sessionToken,
      chatData,
      localMessages,
      sendMessageMutation,
      createChatMutation,
      renameChatMutation,
      onProjectLinked,
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

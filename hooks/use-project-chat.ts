"use client"

import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useAuth } from "@/components/auth-provider"
import type { Id } from "@/convex/_generated/dataModel"
import type { AiContext, ToolCallWithStatus, LinkedEntity } from "@/lib/ai-tools"
import { buildToolConfirmationText } from "@/lib/ai-tools"

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  reasoning?: string
  toolCalls?: ToolCallWithStatus[]
}

interface StreamingToolCall {
  id: string
  name: string
  arguments: string
}

export function useProjectChat({
  activeChatId,
  projectToLink,
  onProjectLinked,
  useClaudeFirstPrompt,
  aiContext,
  currentProjectId,
}: {
  activeChatId: Id<"chats"> | null
  projectToLink: Id<"projects"> | null
  onProjectLinked: (chatId: Id<"chats">) => void
  useClaudeFirstPrompt: boolean
  aiContext?: AiContext | null
  currentProjectId?: string | null
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

  const createTaskMutation = useMutation(api.aiTools.createTask)
  const updateTaskStatusMutation = useMutation(api.aiTools.updateTaskStatus)
  const updateTaskDueDateMutation = useMutation(api.aiTools.updateTaskDueDate)
  const updateTaskTimeMutation = useMutation(api.aiTools.updateTaskTime)
  const createCalendarEventMutation = useMutation(api.aiTools.createCalendarEvent)
  const moveCalendarEventMutation = useMutation(api.aiTools.moveCalendarEvent)

  const [localMessages, setLocalMessages] = useState<Message[]>([])
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null)
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCallWithStatus[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const activeChatIdRef = useRef(activeChatId)
  activeChatIdRef.current = activeChatId

  useEffect(() => {
    setLocalMessages([])
    setStreamingMessage(null)
    setPendingToolCalls(null)
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

    if (pendingToolCalls) {
      const copy = [...base]
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "assistant") {
          copy[i] = { ...copy[i], toolCalls: pendingToolCalls }
          break
        }
      }
      base = copy
    }

    if (streamingMessage) return [...base, streamingMessage]
    return base
  }, [activeChatId, chatData, localMessages, pendingToolCalls, streamingMessage])

  async function streamResponse(
    apiMessages: Array<{ role: string; content: string }>,
    signal: AbortSignal,
    onDelta: (delta: { content?: string; reasoning?: string }) => void,
    onToolCallDelta: () => void,
    useClaudeFirstPrompt: boolean,
    context?: AiContext | null,
  ): Promise<{ fullContent: string; fullReasoning: string; toolCalls: StreamingToolCall[] }> {
    const body: Record<string, unknown> = { messages: apiMessages, useClaudeFirstPrompt }
    if (context) body.context = context

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
    const toolCalls: StreamingToolCall[] = []

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

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!toolCalls[idx]) {
                toolCalls[idx] = { id: tc.id || "", name: "", arguments: "" }
              }
              if (tc.id) toolCalls[idx].id = tc.id
              if (tc.function?.name) toolCalls[idx].name = tc.function.name
              if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments
            }
            onToolCallDelta()
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    return { fullContent, fullReasoning, toolCalls }
  }

  const confirmToolCall = useCallback(
    async (_messageId: string, toolCallId: string) => {
      if (!sessionToken || !pendingToolCalls) return

      const tc = pendingToolCalls.find((t) => t.toolCall.id === toolCallId)
      if (!tc || tc.status !== "pending") return

      const args = tc.toolCall.arguments
      let resultMessage = ""
      let linkedEntity: LinkedEntity | undefined

      try {
        switch (tc.toolCall.name) {
          case "createTask": {
            const result = await createTaskMutation({
              token: sessionToken,
              projectId: args.projectId as Id<"projects">,
              phaseOrder: args.phaseOrder as number,
              title: args.title as string,
              dueDate: args.dueDate as string,
              time: (args.time as string) || undefined,
              endTime: (args.endTime as string) || undefined,
            })
            resultMessage = `Task "${result.title}" created successfully.`
            linkedEntity = {
              type: "task",
              id: `${args.projectId}:${result.phaseOrder}:${result.taskOrder}`,
              name: result.title,
              projectId: args.projectId as string,
            }
            break
          }
          case "updateTaskStatus": {
            const result = await updateTaskStatusMutation({
              token: sessionToken,
              projectId: args.projectId as Id<"projects">,
              phaseOrder: args.phaseOrder as number,
              taskOrder: args.taskOrder as number,
              completed: args.completed as boolean,
            })
            resultMessage = `Task "${result.title}" marked as ${result.completed ? "complete" : "incomplete"}.`
            linkedEntity = {
              type: "task",
              id: `${args.projectId}:${args.phaseOrder}:${args.taskOrder}`,
              name: result.title,
              projectId: args.projectId as string,
            }
            break
          }
          case "updateTaskDueDate": {
            const result = await updateTaskDueDateMutation({
              token: sessionToken,
              projectId: args.projectId as Id<"projects">,
              phaseOrder: args.phaseOrder as number,
              taskOrder: args.taskOrder as number,
              newDate: args.newDate as string,
              newStartTime: (args.newStartTime as string) || undefined,
              newEndTime: (args.newEndTime as string) || undefined,
            })
            const timePart = result.newStartTime
              ? result.newEndTime
                ? ` at ${result.newStartTime} – ${result.newEndTime}`
                : ` at ${result.newStartTime}`
              : ""
            resultMessage = `Task "${result.title}" rescheduled to ${result.newDate}${timePart}.`
            linkedEntity = {
              type: "task",
              id: `${args.projectId}:${args.phaseOrder}:${args.taskOrder}`,
              name: result.title,
              projectId: args.projectId as string,
            }
            break
          }
          case "updateTaskTime": {
            const result = await updateTaskTimeMutation({
              token: sessionToken,
              projectId: args.projectId as Id<"projects">,
              phaseOrder: args.phaseOrder as number,
              taskOrder: args.taskOrder as number,
              newStartTime: args.newStartTime as string,
              newEndTime: (args.newEndTime as string) || undefined,
            })
            const timeStr = result.newEndTime
              ? `${result.newStartTime} – ${result.newEndTime}`
              : result.newStartTime
            resultMessage = `Task "${result.title}" time updated to ${timeStr}.`
            linkedEntity = {
              type: "task",
              id: `${args.projectId}:${args.phaseOrder}:${args.taskOrder}`,
              name: result.title,
              projectId: args.projectId as string,
            }
            break
          }
          case "createCalendarEvent": {
            const result = await createCalendarEventMutation({
              token: sessionToken,
              title: args.title as string,
              startDate: args.startDate as string,
              endDate: args.endDate as string,
              projectId: args.projectId
                ? (args.projectId as Id<"projects">)
                : undefined,
            })
            resultMessage = `Calendar event "${result.title}" created.`
            linkedEntity = {
              type: "event",
              id: result.eventId,
              name: result.title,
              projectId: args.projectId as string | undefined,
            }
            break
          }
          case "moveCalendarEvent": {
            const result = await moveCalendarEventMutation({
              token: sessionToken,
              eventId: args.eventId as Id<"calendarEvents">,
              newStartDate: args.newStartDate as string,
              newEndDate: args.newEndDate as string,
            })
            resultMessage = `Calendar event "${result.title}" moved to ${result.newStartDate} – ${result.newEndDate}.`
            linkedEntity = {
              type: "event",
              id: args.eventId as string,
              name: result.title,
            }
            break
          }
          default:
            resultMessage = "Unknown action."
        }

        setPendingToolCalls((prev) =>
          prev?.map((t) =>
            t.toolCall.id === toolCallId
              ? { ...t, status: "confirmed" as const, resultMessage, linkedEntity }
              : t,
          ) ?? null,
        )

        const chatId = activeChatIdRef.current
        if (chatId && sessionToken) {
          await sendMessageMutation({
            token: sessionToken,
            chatId,
            role: "assistant",
            content: `✅ ${resultMessage}`,
          })
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Action failed"
        setPendingToolCalls((prev) =>
          prev?.map((t) =>
            t.toolCall.id === toolCallId
              ? { ...t, status: "rejected" as const, resultMessage: errMsg }
              : t,
          ) ?? null,
        )
      }
    },
    [
      sessionToken,
      pendingToolCalls,
      createTaskMutation,
      updateTaskStatusMutation,
      updateTaskDueDateMutation,
      updateTaskTimeMutation,
      createCalendarEventMutation,
      moveCalendarEventMutation,
      sendMessageMutation,
    ],
  )

  const rejectToolCall = useCallback(
    (_messageId: string, toolCallId: string) => {
      setPendingToolCalls((prev) =>
        prev?.map((t) =>
          t.toolCall.id === toolCallId
            ? { ...t, status: "rejected" as const, resultMessage: "Action cancelled by user." }
            : t,
        ) ?? null,
      )
    },
    [],
  )

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

      setPendingToolCalls(null)
      setIsLoading(true)
      setError(null)
      const streamId = crypto.randomUUID()
      setStreamingMessage({ id: streamId, role: "assistant", content: "", reasoning: "" })
      const abortController = new AbortController()
      abortRef.current = abortController

      try {
        const initialAssistantContent =
          chatData?.messages?.[0]?.role === "assistant"
            ? chatData.messages[0].content.trim()
            : ""

        const history: Array<{ role: string; content: string }> =
          effectiveChatId && chatData
            ? chatData.messages
                .filter((m) => {
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

        const last20 = history.slice(-20)
        const apiMessages = [...last20, { role: "user" as const, content }]

        const enrichedContext: AiContext | null = aiContext
          ? {
              ...aiContext,
              currentProjectId: currentProjectId || undefined,
              currentProjectName: currentProjectId
                ? aiContext.projects.find((p) => p.id === currentProjectId)?.name
                : undefined,
            }
          : null

        const { fullContent, fullReasoning, toolCalls } = await streamResponse(
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
          () => {
            setStreamingMessage((prev) => {
              if (!prev) return prev
              if (!prev.content) {
                return { ...prev, content: "Processing your request..." }
              }
              return prev
            })
          },
          useClaudeFirstPrompt,
          enrichedContext,
        )

        const parsedToolCalls: ToolCallWithStatus[] = toolCalls
          .filter((tc) => tc.name)
          .map((tc) => {
            let parsedArgs: Record<string, unknown> = {}
            try {
              parsedArgs = JSON.parse(tc.arguments)
            } catch {
              parsedArgs = {}
            }
            return {
              toolCall: { id: tc.id || crypto.randomUUID(), name: tc.name, arguments: parsedArgs },
              status: "pending" as const,
            }
          })

        const hasToolCalls = parsedToolCalls.length > 0
        let finalContent = fullContent

        if (hasToolCalls && !finalContent.trim()) {
          finalContent = parsedToolCalls
            .map((tc) => buildToolConfirmationText(tc.toolCall.name, tc.toolCall.arguments))
            .join("\n\n")
          finalContent += "\n\nShall I proceed?"
        }

        if (effectiveChatId) {
          await sendMessageMutation({
            token: sessionToken,
            chatId: effectiveChatId,
            role: "assistant",
            content: finalContent,
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
            {
              id: streamId,
              role: "assistant",
              content: finalContent,
              reasoning: fullReasoning,
            },
          ])
        }

        if (hasToolCalls) {
          setPendingToolCalls(parsedToolCalls)
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
      aiContext,
      currentProjectId,
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
    confirmToolCall,
    rejectToolCall,
  }
}

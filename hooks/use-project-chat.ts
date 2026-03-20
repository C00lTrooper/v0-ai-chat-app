"use client"

import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useAuth } from "@/components/auth-provider"
import { convexClient } from "@/lib/convex"
import type { Id } from "@/convex/_generated/dataModel"
import type { AiContext, ToolCallWithStatus, LinkedEntity, ConflictWarning } from "@/lib/ai-tools"
import { buildToolConfirmationText, READ_ONLY_TOOLS } from "@/lib/ai-tools"

// Task breakdown configuration
const BREAKDOWN_THRESHOLD_MINUTES = 2 * 60 // default: 2 hours
const MIN_CHUNK_MINUTES = 30
const MAX_CHUNK_MINUTES = 60

function parseTimeToMinutesClient(time: string | undefined): number | null {
  if (!time) return null
  const t = time.trim().toUpperCase()
  const match = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/)
  if (!match) return null
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const ampm = match[3]
  if (ampm === "PM" && hours < 12) hours += 12
  if (ampm === "AM" && hours === 12) hours = 0
  return hours * 60 + minutes
}

function minutesToTimeClient(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`
}

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
  aiContext,
  currentProjectId,
}: {
  activeChatId: Id<"chats"> | null
  projectToLink: Id<"projects"> | null
  onProjectLinked: (chatId: Id<"chats">) => void
  aiContext?: AiContext | null
  currentProjectId?: string | null
}) {
  const { sessionToken } = useAuth()

  const UNASSIGNED_CHAT_STORAGE_KEY = "unassignedChatMessages"

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
    if (!activeChatId && typeof window !== "undefined") {
      try {
        const stored = window.sessionStorage.getItem(UNASSIGNED_CHAT_STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored) as Message[]
          if (Array.isArray(parsed)) {
            setLocalMessages(parsed)
          }
        }
      } catch {
        // ignore malformed storage
      }
    } else {
      setLocalMessages([])
    }
  }, [activeChatId])

  useEffect(() => {
    if (!activeChatId && typeof window !== "undefined") {
      try {
        if (localMessages.length === 0) {
          window.sessionStorage.removeItem(UNASSIGNED_CHAT_STORAGE_KEY)
        } else {
          window.sessionStorage.setItem(
            UNASSIGNED_CHAT_STORAGE_KEY,
            JSON.stringify(localMessages),
          )
        }
      } catch {
        // storage failures are non-fatal
      }
    }
  }, [activeChatId, localMessages])

  useEffect(() => {
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
    apiMessages: Array<{ role: string; content?: string | null; tool_calls?: unknown[]; tool_call_id?: string }>,
    signal: AbortSignal,
    onDelta: (delta: { content?: string; reasoning?: string }) => void,
    onToolCallDelta: () => void,
    context?: AiContext | null,
  ): Promise<{ fullContent: string; fullReasoning: string; toolCalls: StreamingToolCall[] }> {
    const body: Record<string, unknown> = { messages: apiMessages }
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

  function isReadOnlyTool(name: string): boolean {
    return (READ_ONLY_TOOLS as readonly string[]).includes(name)
  }

  async function executeReadOnlyTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
  ): Promise<unknown> {
    if (name === "checkTimeConflicts" && convexClient) {
      return await convexClient.query(api.conflicts.checkTimeConflicts, {
        token,
        date: args.date as string,
        startTime: args.startTime as string,
        endTime: (args.endTime as string) || undefined,
        excludeTaskKey: (args.excludeTaskKey as string) || undefined,
        excludeEventId: (args.excludeEventId as string) || undefined,
      })
    }
    return { error: "Unknown read-only tool" }
  }

  async function runConflictCheck(
    args: Record<string, unknown>,
    token: string,
  ): Promise<ConflictWarning | undefined> {
    if (!convexClient) return undefined
    const date = (args.dueDate ?? args.newDate ?? args.startDate ?? args.newStartDate) as string | undefined
    const startTime = (args.time ?? args.newStartTime ?? args.startTime) as string | undefined
    if (!date || !startTime) return undefined

    const endTime = (args.endTime ?? args.newEndTime ?? args.endDate) as string | undefined
    const excludeTaskKey = args.taskOrder !== undefined
      ? `${args.projectId}:${args.phaseOrder}:${args.taskOrder}`
      : undefined
    const excludeEventId = args.eventId as string | undefined

    try {
      const result = await convexClient.query(api.conflicts.checkTimeConflicts, {
        token,
        date,
        startTime,
        endTime: endTime || undefined,
        excludeTaskKey: excludeTaskKey || undefined,
        excludeEventId: excludeEventId || undefined,
      })
      if (result.hasConflicts) {
        return {
          conflicts: result.conflicts,
          suggestedSlots: result.suggestedSlots,
          dailyTaskCount: result.dailyTaskCount,
          dailyTaskLimit: result.dailyTaskLimit,
        }
      }
    } catch {
      // non-fatal
    }
    return undefined
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
              ...(typeof args.phaseOrder === "number"
                ? { phaseOrder: args.phaseOrder }
                : {}),
              title: args.title as string,
              dueDate: args.dueDate as string,
              time: (args.time as string) || undefined,
              endTime: (args.endTime as string) || undefined,
              parentTaskId: args.parentTaskId
                ? (args.parentTaskId as Id<"tasks">)
                : undefined,
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

  const resetUnassignedChat = useCallback(() => {
    setLocalMessages([])
    setStreamingMessage(null)
    setPendingToolCalls(null)
    setError(null)
    setIsLoading(false)
    abortRef.current?.abort()
    abortRef.current = null
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(UNASSIGNED_CHAT_STORAGE_KEY)
      } catch {
        // ignore storage errors
      }
    }
  }, [])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!sessionToken) return

      const wasEmptyChat =
        activeChatId && (chatData?.messages.length ?? 0) === 0

      const chatMissingOnServer = activeChatId && chatData === null

      if (chatMissingOnServer && typeof window !== "undefined") {
        window.localStorage.removeItem("lastOpenedChatId")
      }

      let effectiveChatId: Id<"chats"> | null = chatMissingOnServer
        ? null
        : activeChatId

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

        const enrichedContext: AiContext | null = aiContext
          ? {
              ...aiContext,
              currentProjectId: currentProjectId || undefined,
              currentProjectName: currentProjectId
                ? aiContext.projects.find((p) => p.id === currentProjectId)?.name
                : undefined,
            }
          : null

        type ApiMsg = { role: string; content?: string | null; tool_calls?: unknown[]; tool_call_id?: string }
        let currentApiMessages: ApiMsg[] = [...last20, { role: "user" as const, content }]

        let finalContent = ""
        let finalReasoning = ""
        let finalWriteToolCalls: ToolCallWithStatus[] = []
        const MAX_TOOL_ROUNDS = 3

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          setStreamingMessage({ id: streamId, role: "assistant", content: "", reasoning: "" })

          const { fullContent, fullReasoning, toolCalls } = await streamResponse(
            currentApiMessages,
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
                  return { ...prev, content: "Checking for conflicts..." }
                }
                return prev
              })
            },
            enrichedContext,
          )

          const readOnlyTCs = toolCalls.filter((tc) => tc.name && isReadOnlyTool(tc.name))
          const writeTCs = toolCalls.filter((tc) => tc.name && !isReadOnlyTool(tc.name))

          if (readOnlyTCs.length > 0 && writeTCs.length === 0 && sessionToken) {
            const assistantMsg: ApiMsg = {
              role: "assistant",
              content: fullContent || null,
              tool_calls: readOnlyTCs.map((tc) => ({
                id: tc.id || crypto.randomUUID(),
                type: "function",
                function: { name: tc.name, arguments: tc.arguments },
              })),
            }
            const toolResultMsgs: ApiMsg[] = []
            for (const tc of readOnlyTCs) {
              let parsedArgs: Record<string, unknown> = {}
              try { parsedArgs = JSON.parse(tc.arguments) } catch { /* skip */ }
              const result = await executeReadOnlyTool(tc.name, parsedArgs, sessionToken)
              toolResultMsgs.push({
                role: "tool",
                tool_call_id: tc.id || "",
                content: JSON.stringify(result),
              })
            }
            currentApiMessages = [...currentApiMessages, assistantMsg, ...toolResultMsgs]
            continue
          }

          finalContent = fullContent
          finalReasoning = fullReasoning

          const parsedToolCalls: ToolCallWithStatus[] = writeTCs
            .map((tc) => {
              let parsedArgs: Record<string, unknown> = {}
              try { parsedArgs = JSON.parse(tc.arguments) } catch { parsedArgs = {} }
              return {
                toolCall: { id: tc.id || crypto.randomUUID(), name: tc.name, arguments: parsedArgs },
                status: "pending" as const,
              }
            })
          // Automatic task breakdown: expand long createTask calls into AI-generated subtasks
          const expandedToolCalls: ToolCallWithStatus[] = []
          for (const tc of parsedToolCalls) {
            if (tc.toolCall.name !== "createTask") {
              expandedToolCalls.push(tc)
              continue
            }

            const args = tc.toolCall.arguments
            const startMins = parseTimeToMinutesClient(args.time as string | undefined)
            const endMins = parseTimeToMinutesClient(args.endTime as string | undefined)

            if (startMins == null || endMins == null || endMins <= startMins) {
              expandedToolCalls.push(tc)
              continue
            }

            const duration = endMins - startMins
            if (duration <= BREAKDOWN_THRESHOLD_MINUTES) {
              expandedToolCalls.push(tc)
              continue
            }

            let steps: { title: string; minutes: number }[] | null = null
            try {
              const resp = await fetch("/api/generate-task-breakdown", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: args.title as string,
                  description: "",
                  projectName: args.projectName as string | undefined,
                  phaseName: args.phaseName as string | undefined,
                  totalMinutes: duration,
                }),
              })
              const json = await resp.json().catch(() => ({}))
              if (resp.ok && Array.isArray(json.steps)) {
                steps = json.steps
                  .map((s: any) => ({
                    title: typeof s.title === "string" ? s.title.trim() : "",
                    minutes:
                      typeof s.minutes === "number" && s.minutes > 0
                        ? Math.min(Math.max(s.minutes, MIN_CHUNK_MINUTES), MAX_CHUNK_MINUTES)
                        : 60,
                  }))
                  .filter((s) => s.title.length > 0)
              }
            } catch {
              // fall through to time-based split
            }

            const groupId = crypto.randomUUID()
            let cursor = startMins

            if (steps && steps.length > 0) {
              for (const step of steps) {
                if (cursor >= endMins) break
                const allotted = Math.min(step.minutes, MAX_CHUNK_MINUTES)
                const chunkStart = cursor
                const chunkEnd = Math.min(chunkStart + allotted, endMins)
                cursor = chunkEnd

                expandedToolCalls.push({
                  ...tc,
                  toolCall: {
                    ...tc.toolCall,
                    id: crypto.randomUUID(),
                    arguments: {
                      ...args,
                      title: step.title,
                      time: minutesToTimeClient(chunkStart),
                      endTime: minutesToTimeClient(chunkEnd),
                    },
                  },
                  status: "pending",
                  // @ts-expect-error: ad-hoc metadata for grouping
                  groupId,
                })
              }
            } else {
              // Fallback: even time-based split without changing title semantics
              const totalMinutes = duration
              const idealChunks = Math.ceil(totalMinutes / 60)
              const chunkCount = Math.max(1, idealChunks)
              const chunkMinutes = Math.max(
                MIN_CHUNK_MINUTES,
                Math.min(MAX_CHUNK_MINUTES, 60),
              )

              while (cursor < endMins) {
                const chunkStart = cursor
                const chunkEnd = Math.min(chunkStart + chunkMinutes, endMins)
                cursor = chunkEnd

                expandedToolCalls.push({
                  ...tc,
                  toolCall: {
                    ...tc.toolCall,
                    id: crypto.randomUUID(),
                    arguments: {
                      ...args,
                      time: minutesToTimeClient(chunkStart),
                      endTime: minutesToTimeClient(chunkEnd),
                    },
                  },
                  status: "pending",
                  // @ts-expect-error: ad-hoc metadata for grouping
                  groupId,
                })
              }
            }
          }

          if (expandedToolCalls.length > 0 && sessionToken && convexClient) {
            // Proactively snap created tasks to the nearest free slot using conflict suggestions
            for (const tc of expandedToolCalls) {
              if (tc.toolCall.name !== "createTask") continue
              const args = tc.toolCall.arguments
              const date = args.dueDate as string | undefined
              const time = args.time as string | undefined
              const endTime = (args.endTime as string | undefined) || undefined
              if (!date || !time) continue
              try {
                const result = await convexClient.query(api.conflicts.checkTimeConflicts, {
                  token: sessionToken,
                  date,
                  startTime: time,
                  endTime,
                  excludeTaskKey: undefined,
                  excludeEventId: undefined,
                })
                if (result.hasConflicts && result.suggestedSlots.length > 0) {
                  const slot = result.suggestedSlots[0]
                  args.dueDate = slot.date
                  args.time = slot.startTime
                  args.endTime = slot.endTime
                }
              } catch {
                // non-fatal; conflicts will still be surfaced below
              }
            }
          }

          if (expandedToolCalls.length > 0 && sessionToken) {
            for (const tc of expandedToolCalls) {
              const schedulingTools = [
                "createTask",
                "updateTaskDueDate",
                "updateTaskTime",
                "createCalendarEvent",
                "moveCalendarEvent",
              ]
              if (schedulingTools.includes(tc.toolCall.name)) {
                tc.conflictWarning = await runConflictCheck(tc.toolCall.arguments, sessionToken)
              }
            }
          }

          finalWriteToolCalls = expandedToolCalls
          break
        }

        const hasToolCalls = finalWriteToolCalls.length > 0

        if (hasToolCalls && !finalContent.trim()) {
          finalContent = finalWriteToolCalls
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
            reasoning: finalReasoning || undefined,
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
              reasoning: finalReasoning,
            },
          ])
        }

        if (hasToolCalls) {
          setPendingToolCalls(finalWriteToolCalls)
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
    resetUnassignedChat,
  }
}

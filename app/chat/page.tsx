"use client";

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  Suspense,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRedirectIfSignedOut } from "@/hooks/use-redirect-if-signed-out";
import { ConvexSessionShell } from "@/components/convex-session-shell";
import { useProjectChat } from "@/hooks/use-project-chat";
import { ChatHeader } from "@/components/chat-header";
import { ChatMessage } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";
import { ChatEmpty } from "@/components/chat-empty";
import { SettingsDebug } from "@/components/settings-debug";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatControls } from "@/components/chat-controls";
import { AlertCircle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { Project } from "@/lib/project-schema";
import type { AiContext } from "@/lib/ai-tools";
import type { Id } from "@/convex/_generated/dataModel";

function ChatPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useRedirectIfSignedOut();
  const { isAuthenticated } = useConvexAuth();

  const initialChatId = searchParams.get("chatId");
  const initialProjectId = searchParams.get("projectId");

  const getPersistedChatId = (): Id<"chats"> | null => {
    if (typeof window === "undefined") return null;
    const stored = window.localStorage.getItem("lastOpenedChatId");
    return stored ? (stored as Id<"chats">) : null;
  };

  const [activeChatId, setActiveChatId] = useState<Id<"chats"> | null>(
    initialChatId
      ? (initialChatId as Id<"chats">)
      : initialProjectId
        ? null
        : getPersistedChatId(),
  );
  const [projectToLinkId, setProjectToLinkId] = useState<Id<"projects"> | null>(
    initialProjectId ? (initialProjectId as Id<"projects">) : null,
  );
  const projects = useQuery(api.projects.list, isAuthenticated ? {} : "skip");
  const chatData = useQuery(
    api.chats.getChatWithMessages,
    activeChatId && isAuthenticated ? { chatId: activeChatId } : "skip",
  );
  const projectDataForChat = useQuery(
    api.projects.getById,
    chatData?.projectId && isAuthenticated
      ? { projectId: chatData.projectId as Id<"projects"> }
      : "skip",
  );

  const aiContextData = useQuery(
    api.aiContext.getContext,
    isAuthenticated ? {} : "skip",
  );

  const aiContext: AiContext | null = useMemo(() => {
    if (!aiContextData) return null;
    return {
      userName: aiContextData.userName,
      todayDate: new Date().toISOString().split("T")[0],
      projects: aiContextData.projects,
      calendarEvents: aiContextData.calendarEvents,
    };
  }, [aiContextData]);

  const currentProjectId = chatData?.projectId
    ? (chatData.projectId as string)
    : projectToLinkId
      ? (projectToLinkId as string)
      : null;

  const linkedProjectName =
    projectToLinkId && projects
      ? (projects.find((p) => p._id === projectToLinkId)?.projectName ?? null)
      : null;
  const activeProjectName =
    chatData?.projectId && projects
      ? (projects.find((p) => p._id === chatData.projectId)?.projectName ??
        null)
      : null;

  const liveProject: Project | null = useMemo(() => {
    if (!projectDataForChat?.data) return null;
    try {
      return JSON.parse(projectDataForChat.data) as Project;
    } catch {
      return null;
    }
  }, [projectDataForChat]);

  useEffect(() => {
    if (activeChatId) {
      window.localStorage.setItem("lastOpenedChatId", activeChatId);
    }
  }, [activeChatId]);

  useEffect(() => {
    if (activeChatId && chatData === null) {
      setActiveChatId(null);
      window.localStorage.removeItem("lastOpenedChatId");
      if (searchParams.get("chatId")) {
        router.replace("/chat", { scroll: false });
      }
    }
  }, [activeChatId, chatData, router, searchParams]);

  useEffect(() => {
    if (activeChatId && !searchParams.get("chatId")) {
      router.replace(`/chat?chatId=${activeChatId}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const chatIdParam = searchParams.get("chatId");
    const projectIdParam = searchParams.get("projectId");

    if (chatIdParam) {
      setActiveChatId(chatIdParam as Id<"chats">);
    } else if (!projectIdParam && !chatIdParam) {
      const persisted = getPersistedChatId();
      if (persisted) {
        setActiveChatId(persisted);
      } else {
        setActiveChatId(null);
      }
    } else {
      setActiveChatId(null);
    }

    if (!chatIdParam && projectIdParam) {
      setProjectToLinkId(projectIdParam as Id<"projects">);
    }
  }, [searchParams]);

  const handleProjectLinked = useCallback(
    (chatId: Id<"chats">) => {
      setActiveChatId(chatId);
      setProjectToLinkId(null);
      router.replace(`/chat?chatId=${chatId}`, { scroll: false });
    },
    [router],
  );

  const {
    messages,
    isLoading,
    error,
    sendMessage,
    stopGeneration,
    confirmToolCall,
    rejectToolCall,
    resetUnassignedChat,
  } = useProjectChat({
    activeChatId,
    projectToLink: projectToLinkId,
    onProjectLinked: handleProjectLinked,
    aiContext,
    currentProjectId,
  });

  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasProjectOverview, setHasProjectOverview] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsAtBottom(entry.isIntersecting);
      },
      { root: null, threshold: 0.25 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [messages]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.querySelector("[data-project-overview]");
    setHasProjectOverview(!!el);
  }, [messages]);

  const scrollToOverview = () => {
    const el = document.querySelector<HTMLElement>("[data-project-overview]");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleNewChat = useCallback(() => {
    resetUnassignedChat();
    setActiveChatId(null);
    setProjectToLinkId(null);
    window.localStorage.removeItem("lastOpenedChatId");
    if (searchParams.get("chatId")) {
      router.replace("/chat", { scroll: false });
    }
  }, [resetUnassignedChat, searchParams, router]);

  return (
    <ConvexSessionShell>
      <>
      <div className="flex h-dvh flex-col bg-background">
        <ChatHeader
          hasMessages={messages.length > 0}
          onClear={handleNewChat}
          projectName={activeProjectName ?? undefined}
          projectId={chatData?.projectId as string | undefined}
        />

        <ScrollArea className="flex-1 pt-14">
          {messages.length === 0 ? (
            <div className="flex min-h-[calc(100dvh-theme(spacing.14))] flex-col justify-center">
              <ChatEmpty
                projects={projects ?? []}
                linkedProjectId={projectToLinkId}
                linkedProjectName={linkedProjectName}
                activeProjectName={activeProjectName ?? null}
                onLinkProject={setProjectToLinkId}
                onClearLink={() => setProjectToLinkId(null)}
              />
            </div>
          ) : (
            <div className="mx-auto max-w-3xl divide-y divide-border pb-40">
              {messages.map((message, index) => {
                const isFirstAssistant =
                  message.role === "assistant" &&
                  messages.findIndex((m) => m.role === "assistant") === index;

                return (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    liveProject={isFirstAssistant ? liveProject : null}
                    onConfirmToolCall={confirmToolCall}
                    onRejectToolCall={rejectToolCall}
                  />
                );
              })}
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-destructive">
                  <AlertCircle className="size-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        <ChatControls
          hasMessages={messages.length > 0}
          hasProjectOverview={hasProjectOverview}
          isAtBottom={isAtBottom}
          isLoading={isLoading}
          onViewOverview={scrollToOverview}
          onBackToChat={scrollToBottom}
          onSendQuickPrompt={sendMessage}
        />

        <ChatInput
          onSend={sendMessage}
          onStop={stopGeneration}
          isLoading={isLoading}
        />
      </div>

      <SettingsDebug
        messages={messages}
        isLoading={isLoading}
        error={error}
        onClear={handleNewChat}
      />
      </>
    </ConvexSessionShell>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-background">
          <Spinner className="size-8 text-muted-foreground" />
        </div>
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}

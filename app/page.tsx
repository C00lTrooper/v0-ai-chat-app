"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProjectChat } from "@/hooks/use-project-chat";
import { ChatHeader, type AppTab } from "@/components/chat-header";
import { ChatMessage } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";
import { ChatEmpty } from "@/components/chat-empty";
import { CalendarView } from "@/components/calendar-view";
import { SettingsDebug } from "@/components/settings-debug";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatControls } from "@/components/chat-controls";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import type { Id } from "@/convex/_generated/dataModel";

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<AppTab>("chat");

  const initialProjectId = searchParams.get("projectId");
  const [activeProjectId, setActiveProjectId] = useState<Id<"projects"> | null>(
    initialProjectId ? (initialProjectId as Id<"projects">) : null,
  );
  const [useClaudeFirstPrompt, setUseClaudeFirstPrompt] = useState(false);

  useEffect(() => {
    const projectIdParam = searchParams.get("projectId");
    if (projectIdParam) {
      setActiveProjectId(projectIdParam as Id<"projects">);
    }
  }, [searchParams]);

  const handleProjectCreated = useCallback(
    (projectId: Id<"projects">, _slug: string) => {
      setActiveProjectId(projectId);
    },
    [],
  );

  const { messages, isLoading, error, sendMessage, stopGeneration } =
    useProjectChat({
      activeProjectId,
      onProjectCreated: handleProjectCreated,
      useClaudeFirstPrompt,
    });

  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasProjectOverview, setHasProjectOverview] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("useClaudeFirstPrompt");
    if (stored !== null) {
      setUseClaudeFirstPrompt(stored === "true");
    }
  }, []);

  const handleUseClaudeFirstPromptChange = useCallback((value: boolean) => {
    setUseClaudeFirstPrompt(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "useClaudeFirstPrompt",
        value ? "true" : "false",
      );
    }
  }, []);

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
    setActiveProjectId(null);
    if (searchParams.get("projectId")) {
      router.replace("/", { scroll: false });
    }
  }, [searchParams, router]);

  const handleTabChange = useCallback((tab: AppTab) => {
    setActiveTab(tab);
  }, []);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <div className="flex h-dvh flex-col bg-background">
        <ChatHeader
          activeTab={activeTab}
          onTabChange={handleTabChange}
          hasMessages={messages.length > 0}
          onClear={handleNewChat}
        />

        {activeTab === "calendar" ? (
          <div className="flex-1 overflow-hidden pt-14">
            <CalendarView />
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 pt-14">
              {messages.length === 0 ? (
                <div className="flex min-h-[calc(100dvh-theme(spacing.14))] flex-col justify-center">
                  <ChatEmpty onSuggestionClick={sendMessage} />
                </div>
              ) : (
                <div className="mx-auto max-w-3xl divide-y divide-border pb-40">
                  {messages.map((message) => (
                    <ChatMessage key={message.id} message={message} />
                  ))}
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
          </>
        )}
      </div>

      <SettingsDebug
        messages={messages}
        isLoading={isLoading}
        error={error}
        onClear={handleNewChat}
        useClaudeFirstPrompt={useClaudeFirstPrompt}
        onUseClaudeFirstPromptChange={handleUseClaudeFirstPromptChange}
      />
    </>
  );
}

"use client";

import { useRef, useEffect, useState } from "react";
import { useChat } from "@/hooks/use-chat";
import { ChatHeader, type AppTab } from "@/components/chat-header";
import { ChatMessage } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";
import { ChatEmpty } from "@/components/chat-empty";
import { ProjectsView } from "@/components/projects-view";
import { CalendarView } from "@/components/calendar-view";
import { SettingsDebug } from "@/components/settings-debug";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatControls } from "@/components/chat-controls";
import { ChatQuickButtons } from "@/components/chat-quick-buttons";
import { AlertCircle } from "lucide-react";

export default function ChatPage() {
  const [activeTab, setActiveTab] = useState<AppTab>("chat");
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    stopGeneration,
    clearMessages,
  } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasProjectOverview, setHasProjectOverview] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Track whether the bottom of the chat is visible
  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsAtBottom(entry.isIntersecting);
      },
      {
        root: null,
        threshold: 0.25,
      },
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [messages]);

  // Track whether we have a structured project overview in the chat
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

  return (
    <>
      <div className="flex h-dvh flex-col bg-background">
        <ChatHeader
          activeTab={activeTab}
          onTabChange={setActiveTab}
          hasMessages={messages.length > 0}
          onClear={clearMessages}
        />

        {activeTab === "projects" ? (
          <div className="flex-1 pt-14">
            <ProjectsView />
          </div>
        ) : activeTab === "calendar" ? (
          <div className="flex-1 overflow-auto">
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
        onClear={clearMessages}
      />
    </>
  );
}

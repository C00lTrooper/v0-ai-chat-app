"use client";

import { useRef, useEffect, useState } from "react";
import { useChat } from "@/hooks/use-chat";
import { ChatHeader } from "@/components/chat-header";
import { ChatMessage } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";
import { ChatEmpty } from "@/components/chat-empty";
import { SettingsDebug } from "@/components/settings-debug";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatJumpButton } from "@/components/chat-jump-button";
import { AlertCircle } from "lucide-react";

export default function ChatPage() {
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
        <ChatHeader hasMessages={messages.length > 0} onClear={clearMessages} />

        <ScrollArea className="flex-1">
          {messages.length === 0 ? (
            <ChatEmpty onSuggestionClick={sendMessage} />
          ) : (
            <div className="mx-auto max-w-3xl divide-y divide-border">
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

        <ChatJumpButton
          hasMessages={messages.length > 0}
          hasProjectOverview={hasProjectOverview}
          isAtBottom={isAtBottom}
          onViewOverview={scrollToOverview}
          onBackToChat={scrollToBottom}
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
        onClear={clearMessages}
      />
    </>
  );
}

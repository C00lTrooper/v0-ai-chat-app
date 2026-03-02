"use client";

import { ChatFloatingButton } from "@/components/chat-floating-button";

interface ChatQuickButtonsProps {
  isLoading: boolean;
  onSend: (message: string) => void;
}

export function ChatQuickButtons({ isLoading, onSend }: ChatQuickButtonsProps) {
  const handleQuickPrompt = (prompt: string) => {
    if (isLoading) return;
    onSend(prompt);
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-20 flex justify-end px-4"
      style={{ bottom: "7.5rem" }}
    >
      <div className="flex flex-col gap-2">
        <ChatFloatingButton
          label="Step by step"
          onClick={() =>
            handleQuickPrompt(
              "For my next question and future answers, please reason and respond step by step. Explain your thought process clearly.",
            )
          }
        />
        <ChatFloatingButton
          label="Next task"
          onClick={() =>
            handleQuickPrompt(
              "Given our current conversation, what is the single next most important task I should work on? Answer with one clear, actionable next task.",
            )
          }
        />
      </div>
    </div>
  );
}


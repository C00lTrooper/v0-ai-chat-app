"use client";

import { ChevronsUp, ChevronsDown } from "lucide-react";
import { ChatFloatingButton } from "@/components/chat-floating-button";

interface ChatControlsProps {
  hasMessages: boolean;
  hasProjectOverview: boolean;
  isAtBottom: boolean;
  isLoading: boolean;
  onViewOverview: () => void;
  onBackToChat: () => void;
  onSendQuickPrompt: (message: string) => void;
}

export function ChatControls({
  hasMessages,
  hasProjectOverview,
  isAtBottom,
  isLoading,
  onViewOverview,
  onBackToChat,
  onSendQuickPrompt,
}: ChatControlsProps) {
  if (!hasMessages) {
    return null;
  }

  const isOverviewMode = isAtBottom && hasProjectOverview;
  const jumpLabel = isOverviewMode ? "View overview" : "Back to chat";
  const JumpIcon = isOverviewMode ? ChevronsUp : ChevronsDown;
  const handleJumpClick = isOverviewMode ? onViewOverview : onBackToChat;

  const handleQuickPrompt = (prompt: string) => {
    if (isLoading) return;
    onSendQuickPrompt(prompt);
  };

  const showJumpButton = hasMessages && (hasProjectOverview || !isAtBottom);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-20 flex justify-center"
      style={{ bottom: "7.5rem" }}
    >
      <div className="flex w-full max-w-3xl items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <ChatFloatingButton
            label="Step by step"
            onClick={() =>
              handleQuickPrompt("Give me a step by step plan for the project")
            }
          />
          <ChatFloatingButton
            label="Next task"
            onClick={() =>
              handleQuickPrompt("What is my next most important task?")
            }
          />
        </div>
        {showJumpButton && (
          <ChatFloatingButton
            label={jumpLabel}
            icon={JumpIcon}
            onClick={handleJumpClick}
          />
        )}
      </div>
    </div>
  );
}

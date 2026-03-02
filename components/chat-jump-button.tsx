"use client";

import { ChevronsUp, ChevronsDown } from "lucide-react";
import { ChatFloatingButton } from "@/components/chat-floating-button";

interface ChatJumpButtonProps {
  hasMessages: boolean;
  hasProjectOverview: boolean;
  isAtBottom: boolean;
  onViewOverview: () => void;
  onBackToChat: () => void;
}

export function ChatJumpButton({
  hasMessages,
  hasProjectOverview,
  isAtBottom,
  onViewOverview,
  onBackToChat,
}: ChatJumpButtonProps) {
  if (!hasMessages || (!hasProjectOverview && isAtBottom)) {
    return null;
  }

  const isOverviewMode = isAtBottom && hasProjectOverview;
  const label = isOverviewMode ? "View overview" : "Back to chat";
  const Icon = isOverviewMode ? ChevronsUp : ChevronsDown;
  const handleClick = isOverviewMode ? onViewOverview : onBackToChat;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-20 flex justify-center"
      style={{ bottom: "7.5rem" }}
    >
      <ChatFloatingButton label={label} icon={Icon} onClick={handleClick} />
    </div>
  );
}


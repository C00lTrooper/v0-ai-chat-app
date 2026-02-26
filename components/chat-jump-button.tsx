"use client";

import { Button } from "@/components/ui/button";
import { ChevronsUp, ChevronsDown } from "lucide-react";

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
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-20 flex justify-center">
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full border-border bg-background px-5 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
      >
        {label}
        <Icon className="h-4 w-4" />
      </Button>
    </div>
  );
}


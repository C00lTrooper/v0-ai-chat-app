"use client";

import { Button } from "@/components/ui/button";
import type { ComponentType } from "react";

interface ChatFloatingButtonProps {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
}

export function ChatFloatingButton({
  label,
  icon: Icon,
  onClick,
}: ChatFloatingButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="pointer-events-auto inline-flex items-center gap-2 rounded-md border border-border bg-background px-5 py-2 text-sm font-medium shadow-md hover:bg-accent hover:text-accent-foreground dark:border-white dark:bg-white dark:text-black dark:hover:bg-white/90"
    >
      {label}
      {Icon ? <Icon className="h-4 w-4" /> : null}
    </Button>
  );
}


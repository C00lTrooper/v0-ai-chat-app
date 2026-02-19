"use client"

import { Bot, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ChatHeaderProps {
  hasMessages: boolean
  onClear: () => void
}

export function ChatHeader({ hasMessages, onClear }: ChatHeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Bot className="size-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground leading-none">
            DeepSeek R1
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">via OpenRouter</p>
        </div>
      </div>
      {hasMessages && (
        <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground">
          <RotateCcw className="size-4" />
          New Chat
        </Button>
      )}
    </header>
  )
}

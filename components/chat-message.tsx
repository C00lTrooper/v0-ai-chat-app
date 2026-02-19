"use client"

import { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import { Bot, User, ChevronDown, ChevronRight, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Message } from "@/hooks/use-chat"

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user"
  const [showReasoning, setShowReasoning] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={cn(
        "group flex gap-3 px-4 py-5",
        isUser ? "bg-transparent" : "bg-muted/40"
      )}
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-accent text-accent-foreground border border-border"
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>

      <div className="flex-1 space-y-2 overflow-hidden">
        <p className="text-sm font-medium text-foreground">
          {isUser ? "You" : "DeepSeek R1"}
        </p>

        {!isUser && message.reasoning && (
          <div className="rounded-lg border border-border bg-muted/50 overflow-hidden">
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {showReasoning ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              Reasoning
            </button>
            {showReasoning && (
              <div className="px-3 pb-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {message.reasoning}
              </div>
            )}
          </div>
        )}

        {isUser ? (
          <p className="text-sm leading-relaxed text-foreground">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content || (message.reasoning ? "Thinking..." : "")}
            </ReactMarkdown>
          </div>
        )}

        {!isUser && message.content && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleCopy}
              className="text-muted-foreground hover:text-foreground"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              <span className="sr-only">Copy message</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

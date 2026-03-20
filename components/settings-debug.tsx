"use client";

import { Settings2 } from "lucide-react";
import type { Message } from "@/hooks/use-chat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface SettingsDebugProps {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  onClear: () => void;
}

export function SettingsDebug({
  messages,
  isLoading,
  error,
  onClear,
}: SettingsDebugProps) {
  const hasMessages = messages.length > 0;
  const recentMessages = messages.slice(-5).reverse();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="fixed bottom-6 right-6 z-50">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-lg"
                variant="outline"
                className={cn(
                  "rounded-full shadow-lg border-border bg-background/90 backdrop-blur",
                  "hover:bg-background focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                )}
                aria-label="Open settings & debug panel"
              >
                <Settings2 className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={8}>Settings &amp; debug</TooltipContent>
          </Tooltip>
        </div>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings &amp; Debug</DialogTitle>
          <DialogDescription>
            Inspect chat state and basic runtime info. Extend this modal to add your own settings.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          <section className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs">
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
              App state
            </h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              <div>
                <dt className="text-muted-foreground">Messages</dt>
                <dd className="font-mono text-[0.75rem]">{messages.length}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Streaming</dt>
                <dd className="font-mono text-[0.75rem]">
                  {isLoading ? "yes" : "no"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last error</dt>
                <dd className="font-mono text-[0.75rem]">
                  {error ? "present" : "none"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Environment</dt>
                <dd className="font-mono text-[0.75rem]">
                  {process.env.NODE_ENV ?? "unknown"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs">
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Model
            </h3>
            <p className="mt-2 text-[0.7rem] text-muted-foreground/90">
              Chat and project generation use{" "}
              <span className="font-mono text-foreground/90">
                google/gemini-3-flash-preview
              </span>{" "}
              via OpenRouter.
            </p>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                Recent messages
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={onClear}
                disabled={!hasMessages}
                className="h-7 px-2 text-[0.7rem]"
              >
                Clear conversation
              </Button>
            </div>
            {hasMessages ? (
              <ScrollArea className="max-h-56 rounded-md border border-border bg-muted/40 px-3 py-2">
                <ul className="space-y-2 text-xs">
                  {recentMessages.map((message) => (
                    <li
                      key={message.id}
                      className="border-l-2 border-border pl-2"
                    >
                      <div className="mb-0.5 flex items-center justify-between gap-2">
                        <span className="font-semibold capitalize text-muted-foreground">
                          {message.role}
                        </span>
                        {message.reasoning && (
                          <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[0.65rem] font-mono text-muted-foreground">
                            reasoning
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-[0.7rem] leading-relaxed text-foreground/90 line-clamp-3">
                        {message.content || message.reasoning}
                      </p>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            ) : (
              <p className="text-xs text-muted-foreground">
                No messages yet. Start chatting to see debug info here.
              </p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}


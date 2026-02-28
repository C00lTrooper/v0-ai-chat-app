"use client";

import { useTheme } from "next-themes";
import {
  Bot,
  FolderOpen,
  MessageSquare,
  RotateCcw,
  Sun,
  Moon,
  CircleUser,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type AppTab = "chat" | "projects";

interface ChatHeaderProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  hasMessages: boolean;
  onClear: () => void;
}

export function ChatHeader({
  activeTab,
  onTabChange,
  hasMessages,
  onClear,
}: ChatHeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bot className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground leading-none">
              Gemini 3 Flash
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              via OpenRouter
            </p>
          </div>
        </div>
        <Tabs
          value={activeTab}
          onValueChange={(v) => onTabChange(v as AppTab)}
          className="w-auto"
        >
          <TabsList className="h-8">
            <TabsTrigger value="chat" className="gap-1.5 px-3 text-xs">
              <MessageSquare className="size-3.5" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="projects" className="gap-1.5 px-3 text-xs">
              <FolderOpen className="size-3.5" />
              Projects
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex min-w-[7rem] items-center justify-end gap-2">
        {activeTab === "chat" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className={`text-muted-foreground ${!hasMessages ? "invisible" : ""}`}
            tabIndex={hasMessages ? 0 : -1}
          >
            <RotateCcw className="size-4" />
            New Chat
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleTheme}
          className="relative text-muted-foreground"
        >
          <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="bg-foreground text-background transition-none hover:bg-foreground hover:text-background dark:hover:bg-foreground dark:hover:text-background"
        >
          <CircleUser className="size-4" />
          <span className="sr-only">Profile</span>
        </Button>
      </div>
    </header>
  );
}

"use client";

import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  LogOut,
  MessageSquare,
  RotateCcw,
  Settings,
  Sun,
  CircleUser,
  Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/components/auth-provider";

export type AppTab = "chat" | "calendar";

interface ChatHeaderProps {
  activeTab?: AppTab;
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
  const router = useRouter();
  const { logout, userEmail } = useAuth();

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-foreground"
            onClick={() => router.push("/projects")}
          >
            <Home className="size-5" />
            <span className="sr-only">Projects</span>
          </Button>
        </div>
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
            <TabsTrigger value="calendar" className="gap-1.5 px-3 text-xs">
              <CalendarDays className="size-3.5" />
              Calendar
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="bg-foreground text-background transition-none hover:bg-foreground hover:text-background dark:hover:bg-foreground dark:hover:text-background"
            >
              <CircleUser className="size-4" />
              <span className="sr-only">Profile menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">
                Signed in as
              </span>
              <span className="truncate text-sm font-medium">
                {userEmail ?? "guest@example.com"}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={toggleTheme}
              className="flex items-center gap-2"
            >
              <Sun className="size-4" />
              <span>Toggle theme</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                router.push("/account");
              }}
            >
              <CircleUser className="size-4" />
              <span>Account</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                router.push("/settings");
              }}
            >
              <Settings className="size-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                logout();
                router.push("/login");
              }}
            >
              <LogOut className="size-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

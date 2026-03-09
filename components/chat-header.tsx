"use client";

import { useTheme } from "next-themes";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/auth-provider";

interface ChatHeaderProps {
  hasMessages: boolean;
  onClear: () => void;
  projectName?: string;
  projectId?: string;
}

export function ChatHeader({
  hasMessages,
  onClear,
  projectName,
  projectId,
}: ChatHeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { logout, userEmail } = useAuth();

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-foreground"
          onClick={() => router.push("/projects")}
        >
          <Home className="size-5" />
          <span className="sr-only">Projects</span>
        </Button>
        {projectName && (
          <>
            <span className="shrink-0 text-muted-foreground/70" aria-hidden>
              \
            </span>
            {projectId ? (
              <button
                type="button"
                onClick={() => router.push(`/projects/${projectId}`)}
                className="truncate text-sm font-medium text-foreground hover:underline"
              >
                {projectName}
              </button>
            ) : (
              <span className="truncate text-sm font-medium text-foreground">
                {projectName}
              </span>
            )}
          </>
        )}
      </div>
      <div className="flex min-w-[7rem] items-center justify-end gap-2">
        {pathname === "/chat" && (
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
        <nav className="flex items-center gap-1" aria-label="App navigation">
          <Select
            value={
              pathname === "/chat" || pathname === "/calendar"
                ? pathname
                : "/chat"
            }
            onValueChange={(value) => router.push(value)}
          >
            <SelectTrigger
              size="sm"
              className="h-8 min-w-[7.25rem] gap-1.5 rounded-lg border-border/60 bg-muted/40 px-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/60 md:hidden [&_svg]:text-muted-foreground"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" className="min-w-[7.25rem]">
              <SelectItem value="/chat" className="cursor-pointer gap-2 py-2.5">
                <MessageSquare className="size-4" />
                Chat
              </SelectItem>
              <SelectItem
                value="/calendar"
                className="cursor-pointer gap-2 py-2.5"
              >
                <CalendarDays className="size-4" />
                Calendar
              </SelectItem>
            </SelectContent>
          </Select>
          <div className="hidden items-center gap-1 md:flex">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 px-3 text-sm h-8"
              asChild
            >
              <Link
                href="/chat"
                className={`flex items-center gap-1.5 truncate text-sm ${
                  pathname === "/chat"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MessageSquare className="size-3.5" />
                Chat
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 px-3 text-sm h-8"
              asChild
            >
              <Link
                href="/calendar"
                className={`flex items-center gap-1.5 truncate text-sm ${
                  pathname === "/calendar"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <CalendarDays className="size-3.5" />
                Calendar
              </Link>
            </Button>
          </div>
        </nav>
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

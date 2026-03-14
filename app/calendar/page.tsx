"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChatHeader } from "@/components/chat-header";
import { CalendarView } from "@/components/calendar-view";
import { useAuth } from "@/components/auth-provider";

export default function CalendarPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <ChatHeader hasMessages={false} onClear={() => {}} />
      <div className="flex min-h-0 flex-1 flex-col pt-14">
        <CalendarView />
      </div>
    </div>
  );
}

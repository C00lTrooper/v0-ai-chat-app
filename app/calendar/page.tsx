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
    <div className="flex h-dvh flex-col bg-background">
      <ChatHeader hasMessages={false} onClear={() => {}} />
      <div className="flex-1 overflow-hidden pt-14">
        <CalendarView />
      </div>
    </div>
  );
}

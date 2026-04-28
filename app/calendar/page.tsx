"use client";

import { ChatHeader } from "@/components/chat-header";
import { CalendarView } from "@/components/calendar-view";
import { ConvexSessionShell } from "@/components/convex-session-shell";
import { useRedirectIfSignedOut } from "@/hooks/use-redirect-if-signed-out";

export default function CalendarPage() {
  useRedirectIfSignedOut();

  return (
    <ConvexSessionShell>
      <div className="flex h-dvh flex-col overflow-hidden bg-background">
        <ChatHeader hasMessages={false} onClear={() => {}} />
        <div className="flex min-h-0 flex-1 flex-col pt-14">
          <CalendarView />
        </div>
      </div>
    </ConvexSessionShell>
  );
}

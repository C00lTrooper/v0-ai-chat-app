"use client";

import { useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import {
  User,
  Shield,
  Link2,
  Monitor,
  AlertTriangle,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChatHeader } from "@/components/chat-header";
import { ConvexSessionShell } from "@/components/convex-session-shell";
import { useRedirectIfSignedOut } from "@/hooks/use-redirect-if-signed-out";
import { ProfileSection } from "./ProfileSection";
import { SecuritySection } from "./SecuritySection";
import { ConnectedAccountsSection } from "./ConnectedAccountsSection";
import { DevicesSection } from "./DevicesSection";
import { DangerZoneSection } from "./DangerZoneSection";

type SettingsSection =
  | "profile"
  | "security"
  | "connected-accounts"
  | "devices"
  | "danger-zone";

const NAV_ITEMS: {
  id: SettingsSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "security", label: "Security", icon: Shield },
  { id: "connected-accounts", label: "Connected Accounts", icon: Link2 },
  { id: "devices", label: "Devices", icon: Monitor },
  { id: "danger-zone", label: "Danger Zone", icon: AlertTriangle },
];

export function SettingsPageClient() {
  useRedirectIfSignedOut();
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("profile");
  const { user, isLoaded } = useUser();
  const clerk = useClerk();

  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress;

  return (
    <ConvexSessionShell>
      <div className="flex h-dvh flex-col overflow-hidden bg-background">
        <ChatHeader hasMessages={false} onClear={() => {}} />
        <div className="flex min-h-0 flex-1 overflow-hidden pt-14">
          {/* Sidebar */}
          <aside className="flex min-h-0 w-48 shrink-0 flex-col overflow-y-hidden border-r border-border bg-muted/30 sm:w-56 md:w-64">
            {/* User identity */}
            {isLoaded && user && (
              <div className="border-b border-border p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="size-9 shrink-0">
                    <AvatarImage
                      src={user.imageUrl}
                      alt=""
                      className="object-cover"
                    />
                    <AvatarFallback className="text-xs font-medium">
                      {user.firstName?.[0]?.toUpperCase() ??
                        email?.[0]?.toUpperCase() ??
                        "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {user.fullName ?? user.username ?? "Account"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {email ?? ""}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      item.id === "danger-zone" &&
                        !active &&
                        "hover:text-destructive",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Footer: sign out */}
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={async () => {
                  await clerk.signOut({ redirectUrl: "/sign-in" });
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="size-4 shrink-0" />
                <span>Sign out</span>
              </button>
            </div>
          </aside>

          {/* Main content */}
          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:p-8">
            {activeSection === "profile" && <ProfileSection />}
            {activeSection === "security" && <SecuritySection />}
            {activeSection === "connected-accounts" && (
              <ConnectedAccountsSection />
            )}
            {activeSection === "devices" && <DevicesSection />}
            {activeSection === "danger-zone" && <DangerZoneSection />}
          </main>
        </div>
      </div>
    </ConvexSessionShell>
  );
}

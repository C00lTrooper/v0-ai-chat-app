"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { ChatHeader, type AppTab } from "@/components/chat-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function AccountPage() {
  const router = useRouter();
  const { isAuthenticated, userEmail } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-dvh bg-background">
      <ChatHeader
        activeTab="chat"
        onTabChange={(tab: AppTab) => {
          // For now, any tab click just returns to the main app,
          // which controls the actual tab content.
          router.push("/");
        }}
        hasMessages={false}
        onClear={() => {}}
      />
      <main className="px-4 pt-16 pb-16">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage your profile and subscription for this chat workspace.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>
                  Basic information about the account currently signed in.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Email
                  </p>
                  <p className="text-sm">
                    {userEmail ?? "demo@example.com"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Status
                  </p>
                  <Badge variant="outline" className="text-xs">
                    Signed in
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Plan</CardTitle>
                <CardDescription>
                  Subscription details for this workspace.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Current plan
                  </p>
                  <p className="text-sm font-medium">Developer (demo)</p>
                  <p className="text-xs text-muted-foreground">
                    Unlimited chat during the preview period.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-center"
                  onClick={() => router.push("/settings")}
                >
                  Manage billing in settings
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}


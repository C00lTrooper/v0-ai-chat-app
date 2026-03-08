"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { ChatHeader } from "@/components/chat-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

export default function AccountPage() {
  const router = useRouter();
  const { isAuthenticated, userEmail, sessionToken, logout } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);

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
      <ChatHeader hasMessages={false} onClear={() => {}} />
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
                <div className="pt-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-center border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        Delete account
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Delete your account?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete your projects, chats,
                          and access to shared projects. This action cannot be
                          undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          disabled={isDeleting}
                          onClick={async () => {
                            if (!sessionToken || !convexClient) return;
                            setIsDeleting(true);
                            try {
                              await convexClient.mutation(
                                api.auth.deleteAccount,
                                { token: sessionToken },
                              );
                            } finally {
                              setIsDeleting(false);
                              await logout();
                              router.replace("/login");
                            }
                          }}
                        >
                          Delete account
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
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


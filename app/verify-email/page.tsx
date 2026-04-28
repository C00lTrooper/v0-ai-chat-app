"use client";

import { Show } from "@clerk/nextjs";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
export default function VerifyEmailPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded || !user) return;
    if (user.primaryEmailAddress?.verification?.status === "verified") {
      router.replace("/chat");
    }
  }, [isLoaded, user, router]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <Show when="signed-out" fallback={null}>
        <p className="text-muted-foreground text-sm">
          Sign in to verify your email.
        </p>
      </Show>
      <Show when="signed-in">
        <div className="max-w-md space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Verify your email
          </h1>
          <p className="text-muted-foreground text-sm">
            We sent a verification link to{" "}
            <span className="font-medium text-foreground">
              {user?.primaryEmailAddress?.emailAddress ?? "your address"}
            </span>
            . Open the link, then return here — you will be redirected
            automatically.
          </p>
          <p className="text-muted-foreground text-xs">
            Did not receive it? Check spam or use your Clerk account settings to
            resend.
          </p>
        </div>
      </Show>
    </div>
  );
}

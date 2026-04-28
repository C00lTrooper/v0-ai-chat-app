"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Redirects to /sign-in only after Clerk confirms there is no session.
 * Does not redirect while Clerk is loading or while Convex is still syncing
 * the JWT — avoids /chat ↔ /sign-in flicker loops.
 */
export function useRedirectIfSignedOut() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      try {
        window.localStorage.removeItem("lastOpenedChatId");
      } catch {
        /* ignore */
      }
      router.replace("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  return { isLoaded, isSignedIn };
}

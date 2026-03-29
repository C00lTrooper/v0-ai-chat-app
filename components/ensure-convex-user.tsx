"use client";

import { useConvexAuth } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useState, type ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";

/**
 * Provisions the Convex `users` row on first sign-in (queries cannot insert).
 * Blocks the tree until the row exists so authenticated queries do not race
 * and throw "Unauthenticated" from requireUserDoc.
 */
export function EnsureConvexUser({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { isLoaded, isSignedIn } = useAuth();
  const ensure = useMutation(api.users.ensureCurrentUser);
  const [userRowReady, setUserRowReady] = useState(false);

  useEffect(() => {
    if (!isSignedIn) {
      setUserRowReady(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (!isLoaded || isLoading || !isSignedIn || !isAuthenticated) return;

    let cancelled = false;
    void ensure({})
      .then(() => {
        if (!cancelled) setUserRowReady(true);
      })
      .catch((err) => {
        console.error("ensureCurrentUser failed", err);
        // Unblock so the user is not stuck; queries may still error until retry/refresh.
        if (!cancelled) setUserRowReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isLoading, isSignedIn, isAuthenticated, ensure]);

  if (isSignedIn && isAuthenticated && !userRowReady) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}

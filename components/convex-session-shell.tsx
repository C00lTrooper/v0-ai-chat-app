"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** After this, show troubleshooting instead of an endless spinner. */
const CONVEX_SYNC_TIMEOUT_MS = 15_000;

/**
 * Full-screen gate: Clerk loaded → signed in → Convex JWT accepted.
 * If Convex never becomes ready (missing Clerk JWT template `convex`, wrong issuer, etc.),
 * shows help text instead of loading forever.
 */
export function ConvexSessionShell({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [slowSync, setSlowSync] = useState(false);

  useEffect(() => {
    if (!isLoading || !isSignedIn) {
      setSlowSync(false);
      return;
    }
    const t = window.setTimeout(
      () => setSlowSync(true),
      CONVEX_SYNC_TIMEOUT_MS,
    );
    return () => window.clearTimeout(t);
  }, [isLoading, isSignedIn]);

  if (!isLoaded) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  if (!isSignedIn) {
    return null;
  }

  if (isLoading && !slowSync) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background px-4">
        <Spinner className="size-8 text-muted-foreground" />
        <p className="text-muted-foreground text-center text-sm">
          Connecting to your workspace…
        </p>
      </div>
    );
  }

  if ((isLoading && slowSync) || (!isLoading && !isAuthenticated)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTitle>Backend session not ready</AlertTitle>
          <AlertDescription className="mt-3 space-y-3 text-sm">
            <p>
              You are signed in with Clerk, but Convex could not validate your
              session. Usually the Clerk JWT template for Convex is missing or
              misconfigured.
            </p>
            <ol className="list-decimal space-y-2 pl-4">
              <li>
                <strong>Turn on Clerk&apos;s Convex integration</strong> (this
                creates the JWT template the app needs): open{" "}
                <a
                  href="https://dashboard.clerk.com/last-active?path=integrations"
                  className="font-medium underline underline-offset-2"
                  target="_blank"
                  rel="noreferrer"
                >
                  Clerk → Integrations
                </a>
                , find <strong>Convex</strong>, and connect it. Alternatively:{" "}
                <a
                  href="https://dashboard.clerk.com/apps/setup/convex"
                  className="font-medium underline underline-offset-2"
                  target="_blank"
                  rel="noreferrer"
                >
                  Clerk Convex setup
                </a>
                .
              </li>
              <li>
                If you add the template manually:{" "}
                <strong>JWT Templates</strong> → name must be{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">convex</code>{" "}
                (lowercase). Audience must match{" "}
                <code className="rounded bg-muted px-1">convex</code> — see{" "}
                <a
                  href="https://docs.convex.dev/auth/clerk"
                  className="font-medium underline underline-offset-2"
                  target="_blank"
                  rel="noreferrer"
                >
                  Convex + Clerk
                </a>
                .
              </li>
              <li>
                After changing auth, run{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  npx convex dev
                </code>{" "}
                so <code className="rounded bg-muted px-1">auth.config.ts</code>{" "}
                syncs. Ensure{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  CLERK_JWT_ISSUER_DOMAIN
                </code>{" "}
                in the{" "}
                <a
                  href="https://dashboard.convex.dev"
                  className="font-medium underline underline-offset-2"
                  target="_blank"
                  rel="noreferrer"
                >
                  Convex dashboard
                </a>{" "}
                matches your Clerk <strong>Frontend API</strong> URL (same as in{" "}
                <code className="rounded bg-muted px-1">.env.local</code>).
              </li>
            </ol>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
}

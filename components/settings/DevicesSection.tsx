"use client";

import { useState } from "react";
import { useSessionList, useSession } from "@clerk/nextjs";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Monitor, Smartphone, Laptop, LogOut, Loader2 } from "lucide-react";

function DeviceIcon({
  isMobile,
  deviceType,
}: {
  isMobile?: boolean;
  deviceType?: string | null;
}) {
  if (isMobile)
    return (
      <Smartphone className="size-4 shrink-0 text-muted-foreground" />
    );
  if (deviceType === "desktop")
    return <Monitor className="size-4 shrink-0 text-muted-foreground" />;
  return <Laptop className="size-4 shrink-0 text-muted-foreground" />;
}

export function DevicesSection() {
  const { sessions, isLoaded } = useSessionList();
  const { session: currentSession } = useSession();
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  async function endClientSession(
    session: NonNullable<typeof sessions>[number],
  ) {
    await session.end();
  }

  const handleRevoke = async (sessionId: string) => {
    const target = sessions?.find((s) => s.id === sessionId);
    if (!target) return;
    setRevoking(sessionId);
    try {
      await endClientSession(target);
    } catch (err) {
      console.error(err);
    } finally {
      setRevoking(null);
    }
  };

  const handleRevokeAll = async () => {
    if (!sessions) return;
    setRevokingAll(true);
    try {
      const others = sessions.filter((s) => s.id !== currentSession?.id);
      await Promise.all(others.map((s) => endClientSession(s)));
    } catch (err) {
      console.error(err);
    } finally {
      setRevokingAll(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  const activeSessions =
    sessions?.filter((s) => s.status === "active") ?? [];
  const otherSessions = activeSessions.filter(
    (s) => s.id !== currentSession?.id,
  );

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View and manage all active sessions on your account.
          </p>
        </div>
        {otherSessions.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRevokeAll}
            disabled={revokingAll}
            className="shrink-0 border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {revokingAll && <Loader2 className="size-4 animate-spin" />}
            Sign out all other devices
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {activeSessions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No active sessions found.
          </p>
        )}

        {activeSessions.map((session) => {
          const isCurrent = session.id === currentSession?.id;
          const activity = (
            session as typeof session & {
              latestActivity?: {
                browserName?: string | null;
                browserVersion?: string | null;
                city?: string | null;
                country?: string | null;
                isMobile?: boolean;
                deviceType?: string | null;
              };
            }
          ).latestActivity;
          const browserLabel = [
            activity?.browserName,
            activity?.browserVersion,
          ]
            .filter(Boolean)
            .join(" ");
          const locationLabel = [activity?.city, activity?.country]
            .filter(Boolean)
            .join(", ");
          const lastActiveLabel = session.lastActiveAt
            ? formatDistanceToNow(new Date(session.lastActiveAt), {
                addSuffix: true,
              })
            : null;

          return (
            <div
              key={session.id}
              className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3"
            >
              <div className="mt-0.5">
                <DeviceIcon
                  isMobile={activity?.isMobile}
                  deviceType={activity?.deviceType}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">
                    {browserLabel || "Unknown browser"}
                  </p>
                  {isCurrent && (
                    <Badge className="border-0 bg-primary/10 text-xs text-primary">
                      This device
                    </Badge>
                  )}
                </div>
                {locationLabel && (
                  <p className="text-xs text-muted-foreground">
                    {locationLabel}
                  </p>
                )}
                {lastActiveLabel && (
                  <p className="text-xs text-muted-foreground">
                    Last active {lastActiveLabel}
                  </p>
                )}
              </div>
              {!isCurrent && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevoke(session.id)}
                  disabled={revoking === session.id}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  {revoking === session.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <LogOut className="size-4" />
                  )}
                  Sign out
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

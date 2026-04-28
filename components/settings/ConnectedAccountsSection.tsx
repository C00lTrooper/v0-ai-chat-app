"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  facebook: "Facebook",
  apple: "Apple",
  microsoft: "Microsoft / Azure AD",
  twitter: "Twitter / X",
  discord: "Discord",
  linkedin: "LinkedIn",
};

// Providers that can be connected — extend as needed
const CONNECTABLE_PROVIDERS: { provider: string; strategy: string }[] = [
  { provider: "google", strategy: "oauth_google" },
  { provider: "github", strategy: "oauth_github" },
];

function ProviderAvatar({ provider }: { provider: string }) {
  return (
    <div
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold uppercase text-muted-foreground"
    >
      {provider[0]}
    </div>
  );
}

function clerkError(err: unknown): string {
  if (err && typeof err === "object" && "errors" in err) {
    const errors = (err as { errors?: Array<{ message: string }> }).errors;
    if (errors?.[0]?.message) return errors[0].message;
  }
  return "An error occurred. Please try again.";
}

export function ConnectedAccountsSection() {
  const { user, isLoaded } = useUser();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [connectError, setConnectError] = useState("");

  const handleConnect = async (strategy: string) => {
    if (!user) return;
    setConnecting(strategy);
    setConnectError("");
    try {
      const ea = await user.createExternalAccount({
        strategy: strategy as Parameters<
          typeof user.createExternalAccount
        >[0]["strategy"],
        redirectUrl: window.location.href,
      });
      const redirectUrl =
        ea.verification?.externalVerificationRedirectURL?.href;
      if (redirectUrl) {
        window.location.href = redirectUrl;
      }
    } catch (err) {
      setConnectError(clerkError(err));
      setConnecting(null);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    if (!user) return;
    setDisconnecting(accountId);
    try {
      const account = user.externalAccounts.find((a) => a.id === accountId);
      if (account) await account.destroy();
    } catch (err) {
      console.error(clerkError(err));
    } finally {
      setDisconnecting(null);
    }
  };

  if (!isLoaded) return null;

  const availableToConnect = CONNECTABLE_PROVIDERS.filter(({ provider }) => {
    return !(user?.externalAccounts ?? []).some((a) => a.provider === provider);
  });

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Connected accounts
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Link social accounts for faster sign-in.
        </p>
      </div>

      {/* Active connections */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Connected
        </h2>
        {!user?.externalAccounts.length ? (
          <p className="text-sm text-muted-foreground">
            No accounts connected yet.
          </p>
        ) : (
          <div className="space-y-2">
            {user.externalAccounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3"
              >
                <ProviderAvatar provider={account.provider} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {PROVIDER_LABELS[account.provider] ?? account.provider}
                  </p>
                  {account.emailAddress && (
                    <p className="truncate text-xs text-muted-foreground">
                      {account.emailAddress}
                    </p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className="shrink-0 border-green-200 text-xs text-green-700 dark:border-green-800 dark:text-green-400"
                >
                  Connected
                </Badge>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDisconnect(account.id)}
                  disabled={disconnecting === account.id}
                  aria-label={`Disconnect ${PROVIDER_LABELS[account.provider] ?? account.provider}`}
                >
                  {disconnecting === account.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Available to connect */}
      {availableToConnect.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Add account
          </h2>
          {connectError && (
            <p className="text-sm text-destructive">{connectError}</p>
          )}
          <div className="space-y-2">
            {availableToConnect.map(({ provider, strategy }) => (
              <div
                key={provider}
                className="flex items-center gap-3 rounded-xl border border-border px-4 py-3"
              >
                <ProviderAvatar provider={provider} />
                <p className="flex-1 text-sm font-medium">
                  {PROVIDER_LABELS[provider] ?? provider}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleConnect(strategy)}
                  disabled={connecting === strategy}
                >
                  {connecting === strategy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Connect
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

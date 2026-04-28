"use client";

import { useState } from "react";
import { useUser, useSignIn } from "@clerk/nextjs";
import {
  Eye,
  EyeOff,
  Loader2,
  Shield,
  ShieldCheck,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function clerkError(err: unknown): string {
  if (err && typeof err === "object" && "errors" in err) {
    const errors = (err as { errors?: Array<{ message: string }> }).errors;
    if (errors?.[0]?.message) return errors[0].message;
  }
  return "An error occurred. Please try again.";
}

export function SecuritySection() {
  const { user, isLoaded } = useUser();
  const { signIn } = useSignIn();

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Password reset email
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // TOTP / 2FA
  const [totpDialogOpen, setTotpDialogOpen] = useState(false);
  const [totpSecret, setTotpSecret] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpError, setTotpError] = useState("");
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [disabling2fa, setDisabling2fa] = useState(false);

  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress;

  const handleChangePassword = async () => {
    if (!user) return;
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords don't match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    setPasswordError("");
    setChangingPassword(true);
    try {
      await user.updatePassword({
        currentPassword,
        newPassword,
        signOutOfOtherSessions: false,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err) {
      setPasswordError(clerkError(err));
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSendResetEmail = async () => {
    if (!signIn || !email) return;
    setSendingReset(true);
    try {
      await signIn.create({
        identifier: email,
        // @ts-expect-error — PrepareSignIn typings omit password reset; valid at runtime.
        strategy: "reset_password_email_code",
      });
      setResetSent(true);
    } catch (err) {
      console.error(clerkError(err));
    } finally {
      setSendingReset(false);
    }
  };

  const handleEnable2FA = async () => {
    if (!user) return;
    setTotpLoading(true);
    setTotpError("");
    try {
      const totp = await user.createTOTP();
      setTotpSecret(totp.secret ?? "");
      setTotpDialogOpen(true);
    } catch (err) {
      setTotpError(clerkError(err));
    } finally {
      setTotpLoading(false);
    }
  };

  const handleVerifyTOTP = async () => {
    if (!user || totpCode.length !== 6) return;
    setTotpLoading(true);
    setTotpError("");
    try {
      await user.verifyTOTP({ code: totpCode });
      setTotpDialogOpen(false);
      setTotpCode("");
      setTotpSecret("");
    } catch (err) {
      setTotpError(clerkError(err));
    } finally {
      setTotpLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!user) return;
    setDisabling2fa(true);
    try {
      await user.disableTOTP();
    } catch (err) {
      console.error(clerkError(err));
    } finally {
      setDisabling2fa(false);
    }
  };

  const copySecret = async () => {
    await navigator.clipboard.writeText(totpSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  if (!isLoaded) return null;

  const passwordEnabled = user?.passwordEnabled ?? false;
  const twoFactorEnabled = user?.twoFactorEnabled ?? false;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your password and two-factor authentication.
        </p>
      </div>

      {/* Password */}
      <section className="space-y-4 rounded-xl border border-border p-5">
        {passwordEnabled ? (
          <>
            <div>
              <h2 className="text-base font-semibold">Change password</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Update your account password below.
              </p>
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="sec-currentPw">Current password</Label>
                <div className="relative">
                  <Input
                    id="sec-currentPw"
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((s) => !s)}
                    className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground"
                    aria-label={showCurrent ? "Hide password" : "Show password"}
                  >
                    {showCurrent ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sec-newPw">New password</Label>
                <div className="relative">
                  <Input
                    id="sec-newPw"
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((s) => !s)}
                    className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground"
                    aria-label={showNew ? "Hide password" : "Show password"}
                  >
                    {showNew ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sec-confirmPw">Confirm new password</Label>
                <Input
                  id="sec-confirmPw"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
              {passwordSuccess && (
                <p className="text-sm text-green-700 dark:text-green-400">
                  Password updated successfully.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  onClick={handleChangePassword}
                  disabled={
                    changingPassword ||
                    !currentPassword ||
                    !newPassword ||
                    !confirmPassword
                  }
                  size="sm"
                >
                  {changingPassword && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  Update password
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSendResetEmail}
                  disabled={sendingReset || resetSent || !email}
                  className="text-muted-foreground"
                >
                  {resetSent ? (
                    <>
                      <Check className="size-4" />
                      Reset email sent
                    </>
                  ) : sendingReset ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    "Forgot password?"
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold">Password</h2>
            <p className="text-sm text-muted-foreground">
              Your account uses a social sign-in provider and does not have a
              password set.
            </p>
          </>
        )}
      </section>

      {/* Two-factor authentication */}
      <section className="space-y-4 rounded-xl border border-border p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
              Two-factor authentication
              {twoFactorEnabled ? (
                <Badge className="border-0 bg-green-100 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  Enabled
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  Disabled
                </Badge>
              )}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {twoFactorEnabled
                ? "Your account is protected with an authenticator app."
                : "Add an extra layer of security using an authenticator app (TOTP)."}
            </p>
          </div>
          <div className="shrink-0">
            {twoFactorEnabled ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisable2FA}
                disabled={disabling2fa}
                className="border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                {disabling2fa && <Loader2 className="size-4 animate-spin" />}
                Disable 2FA
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEnable2FA}
                disabled={totpLoading}
              >
                {totpLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Shield className="size-4" />
                )}
                Enable 2FA
              </Button>
            )}
          </div>
        </div>
        {totpError && !totpDialogOpen && (
          <p className="text-sm text-destructive">{totpError}</p>
        )}
      </section>

      {/* TOTP setup dialog */}
      <Dialog
        open={totpDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setTotpCode("");
            setTotpError("");
          }
          setTotpDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5" />
              Set up authenticator app
            </DialogTitle>
            <DialogDescription>
              Enter the secret key in your authenticator app (e.g. Google
              Authenticator, Authy), then enter the 6-digit code to verify.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium">Secret key</p>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                <code className="flex-1 break-all font-mono text-xs">
                  {totpSecret}
                </code>
                <button
                  type="button"
                  onClick={copySecret}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Copy secret"
                >
                  {copiedSecret ? (
                    <Check className="size-4 text-green-500" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Copy this key into your authenticator app under &quot;Enter
                setup key&quot;.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="totp-code">Verification code</Label>
              <Input
                id="totp-code"
                value={totpCode}
                onChange={(e) =>
                  setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
              />
              {totpError && (
                <p className="text-sm text-destructive">{totpError}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleVerifyTOTP}
                disabled={totpLoading || totpCode.length !== 6}
                className="flex-1"
              >
                {totpLoading && <Loader2 className="size-4 animate-spin" />}
                Verify and enable
              </Button>
              <Button
                variant="outline"
                onClick={() => setTotpDialogOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

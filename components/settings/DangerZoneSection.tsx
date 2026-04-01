"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { api } from "@/convex/_generated/api";

const CONFIRM_PHRASE = "delete my account";

export function DangerZoneSection() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const deleteAccountMutation = useMutation(api.users.deleteAccount);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleDelete = async () => {
    if (!user || isDeleting) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      await deleteAccountMutation({});
      const res = await fetch("/api/account/delete-clerk", { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          typeof j.error === "string" ? j.error : "Failed to remove sign-in",
        );
      }
      router.replace("/sign-in");
      router.refresh();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "An error occurred.",
      );
      setIsDeleting(false);
    }
  };

  if (!isLoaded) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-destructive">
          Danger zone
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Irreversible actions. These cannot be undone — proceed with caution.
        </p>
      </div>

      {/* Delete account card */}
      <div className="rounded-xl border border-destructive/40 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="flex-1 space-y-1">
            <h2 className="text-base font-semibold">Delete account</h2>
            <p className="text-sm text-muted-foreground">
              Permanently deletes your account and all associated data —
              projects, chats, and shared project access. This action cannot be
              undone.
            </p>
          </div>
        </div>

        <div className="mt-4 pl-8">
          <AlertDialog
            open={dialogOpen}
            onOpenChange={(open) => {
              if (!open) {
                setConfirmText("");
                setDeleteError("");
              }
              setDialogOpen(open);
            }}
          >
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                Delete my account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete your projects, chats, and access
                  to shared projects, then remove your sign-in credentials. This
                  action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="space-y-2 py-1">
                <Label htmlFor="confirm-delete" className="text-sm">
                  Type{" "}
                  <span className="font-mono font-semibold">
                    {CONFIRM_PHRASE}
                  </span>{" "}
                  to confirm
                </Label>
                <Input
                  id="confirm-delete"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={CONFIRM_PHRASE}
                  autoComplete="off"
                />
                {deleteError && (
                  <p className="text-sm text-destructive">{deleteError}</p>
                )}
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel
                  disabled={isDeleting}
                  onClick={() => setConfirmText("")}
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={isDeleting || confirmText !== CONFIRM_PHRASE}
                  onClick={(e) => {
                    e.preventDefault();
                    void handleDelete();
                  }}
                  className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60"
                >
                  {isDeleting && <Loader2 className="size-4 animate-spin" />}
                  Delete account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

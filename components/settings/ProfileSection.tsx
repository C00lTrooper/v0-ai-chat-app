"use client";

import { useState, useRef, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { Camera, Check, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function clerkError(err: unknown): string {
  if (err && typeof err === "object" && "errors" in err) {
    const errors = (err as { errors?: Array<{ message: string }> }).errors;
    if (errors?.[0]?.message) return errors[0].message;
  }
  return "An error occurred. Please try again.";
}

export function ProfileSection() {
  const { user, isLoaded } = useUser();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
      setUsername(user.username ?? "");
    }
  }, [user]);

  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress;
  const isEmailVerified =
    user?.primaryEmailAddress?.verification?.status === "verified";

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveError("");
    try {
      const updates: Parameters<typeof user.update>[0] = {
        firstName,
        lastName,
      };
      if (user.username !== null) {
        updates.username = username;
      }
      await user.update(updates);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError(clerkError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingImage(true);
    try {
      await user.setProfileImage({ file });
    } catch (err) {
      console.error(clerkError(err));
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!isLoaded) {
    return (
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
        <Skeleton className="h-10 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your personal information and profile picture.
        </p>
      </div>

      {/* Avatar upload */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Profile picture</Label>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="size-16">
              <AvatarImage
                src={user?.imageUrl}
                alt=""
                className="object-cover"
              />
              <AvatarFallback className="text-lg font-medium">
                {user?.firstName?.[0]?.toUpperCase() ??
                  email?.[0]?.toUpperCase() ??
                  "?"}
              </AvatarFallback>
            </Avatar>
            {uploadingImage && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/75">
                <Loader2 className="size-5 animate-spin" />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
            >
              <Camera className="size-3.5" />
              Upload photo
            </Button>
            <p className="text-xs text-muted-foreground">
              JPG, PNG or GIF · max 10 MB
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
        </div>
      </div>

      {/* Name */}
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="settings-firstName">First name</Label>
            <Input
              id="settings-firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-lastName">Last name</Label>
            <Input
              id="settings-lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
            />
          </div>
        </div>

        {user?.username !== null && (
          <div className="space-y-2">
            <Label htmlFor="settings-username">Username</Label>
            <Input
              id="settings-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
            />
          </div>
        )}
      </div>

      {/* Email (read-only) */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Email address</Label>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <span className="flex-1 text-sm">{email ?? "—"}</span>
          <Badge
            variant="outline"
            className={
              isEmailVerified
                ? "shrink-0 border-green-200 text-xs text-green-700 dark:border-green-800 dark:text-green-400"
                : "shrink-0 text-xs"
            }
          >
            {isEmailVerified ? "Verified" : "Unverified"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Email address is managed through your account sign-in method.
        </p>
      </div>

      {/* Save */}
      <div className="space-y-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </>
          ) : saved ? (
            <>
              <Check className="size-4" />
              Saved
            </>
          ) : (
            "Save changes"
          )}
        </Button>
        {saveError && (
          <p className="text-sm text-destructive">{saveError}</p>
        )}
      </div>
    </div>
  );
}

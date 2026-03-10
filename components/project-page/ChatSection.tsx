import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { MessageSquare, Plus, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/convex/_generated/api";
import { toast } from "@/hooks/use-toast";
import type { Id } from "@/convex/_generated/dataModel";
import type { ProjectData } from "@/components/project-page/types";

type ChatSectionProps = {
  project: ProjectData;
};

export function ChatSection({ project }: ChatSectionProps) {
  const router = useRouter();
  const { sessionToken } = useAuth();
  const chats = useQuery(
    api.chats.listChatsByProject,
    sessionToken && project._id
      ? { token: sessionToken, projectId: project._id as Id<"projects"> }
      : "skip",
  );
  const deleteChatMut = useMutation(api.chats.deleteChat);
  const renameChatMut = useMutation(api.chats.renameChat);

  const [renameChatId, setRenameChatId] = useState<Id<"chats"> | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteChatId, setDeleteChatId] = useState<Id<"chats"> | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleOpenChat = (chatId: Id<"chats">) => {
    router.push(`/chat?chatId=${chatId}`);
  };

  const handleNewChat = () => {
    if (!sessionToken || !project._id) return;
    setCreating(true);
    router.push(`/chat?projectId=${project._id}`);
    setCreating(false);
  };

  const handleRenameSubmit = async () => {
    if (!sessionToken || !renameChatId || !renameValue.trim()) {
      setRenameChatId(null);
      return;
    }
    try {
      await renameChatMut({
        token: sessionToken,
        chatId: renameChatId,
        name: renameValue.trim(),
      });
      toast({ title: "Chat renamed." });
      setRenameChatId(null);
      setRenameValue("");
    } catch {
      toast({ variant: "destructive", title: "Failed to rename chat." });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!sessionToken || !deleteChatId) return;
    setDeleting(true);
    try {
      await deleteChatMut({ token: sessionToken, chatId: deleteChatId });
      toast({ title: "Chat deleted." });
      setDeleteChatId(null);
    } catch {
      toast({ variant: "destructive", title: "Failed to delete chat." });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Chat</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Project conversations and AI assistance
      </p>

      <div className="mt-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            Chats in this project
          </span>
          <Button
            size="sm"
            onClick={handleNewChat}
            disabled={creating}
            className="shrink-0"
          >
            <Plus className="size-4" />
            New chat
          </Button>
        </div>

        {chats === undefined ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-muted-foreground">
            <MessageSquare className="mb-3 size-10" />
            <p className="text-sm font-medium">No chats yet</p>
            <p className="mt-1 text-xs">
              Start a new chat or open one from the Chat page linked to this
              project.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={handleNewChat}
              disabled={creating}
            >
              <Plus className="size-4" />
              New chat
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {chats.map((chat) => (
              <li
                key={chat._id}
                className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/30"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left text-sm font-medium text-foreground hover:underline"
                  onClick={() => handleOpenChat(chat._id)}
                >
                  {chat.name?.trim() ||
                    `Chat · ${chat.messageCount} message${chat.messageCount === 1 ? "" : "s"}`}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 h-8 w-8"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="size-4" />
                      <span className="sr-only">Options</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameChatId(chat._id);
                        setRenameValue(chat.name ?? "");
                      }}
                    >
                      <Pencil className="size-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteChatId(chat._id);
                      }}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={!!renameChatId}
        onOpenChange={(open) => {
          if (!open) {
            setRenameChatId(null);
            setRenameValue("");
          }
        }}
      >
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Chat name"
              onKeyDown={(e) => e.key === "Enter" && handleRenameSubmit()}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenameChatId(null);
                setRenameValue("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleRenameSubmit} disabled={!renameValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteChatId}
        onOpenChange={() => setDeleteChatId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              All messages in this chat will be permanently deleted. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


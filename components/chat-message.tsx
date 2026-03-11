"use client";

import { useState, Fragment, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Bot,
  User,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Loader2,
  Calendar,
  ListTodo,
  FolderKanban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Message } from "@/hooks/use-chat";
import type { ToolCallWithStatus } from "@/lib/ai-tools";
import { extractFirstJsonObject } from "@/lib/parse-project-json";
import { ProjectSchema, type Project } from "@/lib/project-schema";
import { ProjectSummary } from "@/components/project-page/ProjectSummary";
import { ProjectScope } from "@/components/project-page/ProjectScope";
import { ProjectWbs } from "@/components/project-page/ProjectWbs";
import { REFERENCE_REGEX, parseReference } from "@/lib/ai-tools";

function ReferenceChip({
  type,
  name,
  projectId,
}: {
  type: "project" | "task" | "event";
  name: string;
  projectId?: string;
}) {
  const icon =
    type === "project" ? (
      <FolderKanban className="size-3" />
    ) : type === "task" ? (
      <ListTodo className="size-3" />
    ) : (
      <Calendar className="size-3" />
    );

  const href =
    type === "project" && projectId
      ? `/projects/${projectId}`
      : type === "task" && projectId
        ? `/projects/${projectId}`
        : null;

  const chip = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        type === "project" &&
          "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
        type === "task" &&
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
        type === "event" &&
          "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300",
        href && "cursor-pointer hover:opacity-80",
      )}
    >
      {icon}
      {name}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="no-underline">
        {chip}
      </Link>
    );
  }

  return chip;
}

function renderContentWithChips(content: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  const regex = new RegExp(REFERENCE_REGEX.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <Fragment key={`text-${lastIndex}`}>
          {content.slice(lastIndex, match.index)}
        </Fragment>,
      );
    }

    const ref = parseReference(match[0]);
    if (ref) {
      parts.push(
        <ReferenceChip
          key={`ref-${match.index}`}
          type={ref.type}
          name={ref.name}
          projectId={ref.projectId}
        />,
      );
    } else {
      parts.push(
        <Fragment key={`raw-${match.index}`}>{match[0]}</Fragment>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(
      <Fragment key={`text-${lastIndex}`}>
        {content.slice(lastIndex)}
      </Fragment>,
    );
  }

  return parts;
}

function stripReferences(content: string): string {
  return content.replace(
    new RegExp(REFERENCE_REGEX.source, "g"),
    (full) => {
      const ref = parseReference(full);
      return ref ? ref.name : full;
    },
  );
}

function ToolCallCard({
  tc,
  onConfirm,
  onReject,
}: {
  tc: ToolCallWithStatus;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm();
    setLoading(false);
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-3 mt-2",
        tc.status === "pending" && "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30",
        tc.status === "confirmed" && "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30",
        tc.status === "rejected" && "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30",
      )}
    >
      {tc.status === "pending" && (
        <>
          <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
            <ListTodo className="size-4 shrink-0" />
            <span className="font-medium">Action Required</span>
          </div>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {loading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Check className="size-3" />
              )}
              Confirm
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onReject}
              disabled={loading}
            >
              <XCircle className="size-3" />
              Cancel
            </Button>
          </div>
        </>
      )}

      {tc.status === "confirmed" && (
        <div className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          <div>
            <span className="font-medium text-emerald-700 dark:text-emerald-300">
              {tc.resultMessage}
            </span>
            {tc.linkedEntity && (
              <div className="mt-1.5">
                <Link
                  href={
                    tc.linkedEntity.projectId
                      ? `/projects/${tc.linkedEntity.projectId}`
                      : "#"
                  }
                  className="inline-flex items-center gap-1.5 no-underline"
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                      "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
                      "hover:opacity-80 transition-opacity",
                    )}
                  >
                    <ArrowRight className="size-3" />
                    {tc.linkedEntity.name}
                  </span>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {tc.status === "rejected" && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <XCircle className="size-4 shrink-0" />
          <span>{tc.resultMessage || "Action cancelled."}</span>
        </div>
      )}
    </div>
  );
}

function MarkdownWithChips({ content }: { content: string }) {
  const hasReferences = REFERENCE_REGEX.test(content);
  REFERENCE_REGEX.lastIndex = 0;

  if (!hasReferences) {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content || "Thinking..."}
        </ReactMarkdown>
      </div>
    );
  }

  const cleanMarkdown = stripReferences(content);
  const chipElements = renderContentWithChips(content);
  const hasOnlyChips = cleanMarkdown.trim() === "";

  if (hasOnlyChips) {
    return <div className="flex flex-wrap gap-1.5">{chipElements}</div>;
  }

  return (
    <div className="space-y-2">
      <div className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {cleanMarkdown}
        </ReactMarkdown>
      </div>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {chipElements.filter(
          (el) =>
            el !== null &&
            typeof el === "object" &&
            "key" in el &&
            typeof el.key === "string" &&
            el.key.startsWith("ref-"),
        )}
      </div>
    </div>
  );
}

export function ChatMessage({
  message,
  liveProject,
  onConfirmToolCall,
  onRejectToolCall,
}: {
  message: Message;
  liveProject?: Project | null;
  onConfirmToolCall?: (messageId: string, toolCallId: string) => void;
  onRejectToolCall?: (messageId: string, toolCallId: string) => void;
}) {
  const isUser = message.role === "user";
  const [showReasoning, setShowReasoning] = useState(false);
  const [copied, setCopied] = useState(false);

  let project: Project | null = liveProject ?? null;

  if (!project && !isUser && message.content) {
    try {
      const unknown = extractFirstJsonObject(message.content);
      const parsed = ProjectSchema.safeParse(unknown);
      if (parsed.success) {
        project = parsed.data;
      }
    } catch {
      project = null;
    }
  }

  const handleCopy = () => {
    const cleanText = stripReferences(message.content);
    navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "group flex gap-3 px-4 py-5",
        isUser ? "bg-transparent" : "bg-muted/40",
      )}
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-accent text-accent-foreground border border-border",
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>

      <div className="flex-1 space-y-2 overflow-hidden">
        <p className="text-sm font-medium text-foreground">
          {isUser ? "You" : "AI Assistant"}
        </p>

        {!isUser && message.reasoning && (
          <div className="rounded-lg border border-border bg-muted/50 overflow-hidden">
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {showReasoning ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              Reasoning
            </button>
            {showReasoning && (
              <div className="px-3 pb-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {message.reasoning}
              </div>
            )}
          </div>
        )}

        {isUser ? (
          <p className="text-sm leading-relaxed text-foreground">
            {message.content}
          </p>
        ) : project ? (
          <div
            data-project-overview
            className="mt-1 space-y-6 rounded-xl border bg-background p-4 shadow-sm"
          >
            <h2 className="text-base font-semibold tracking-tight">
              Project Plan: {project.project_name}
            </h2>
            <div className="space-y-6">
              <ProjectSummary project={project} />
              <ProjectScope project={project} />
              <ProjectWbs project={project} />
            </div>
          </div>
        ) : (
          <MarkdownWithChips content={message.content || (message.reasoning ? "Thinking..." : "")} />
        )}

        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-2 mt-3">
            {message.toolCalls.map((tc) => (
              <ToolCallCard
                key={tc.toolCall.id}
                tc={tc}
                onConfirm={() =>
                  onConfirmToolCall?.(message.id, tc.toolCall.id)
                }
                onReject={() =>
                  onRejectToolCall?.(message.id, tc.toolCall.id)
                }
              />
            ))}
          </div>
        )}

        {!isUser && message.content && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleCopy}
              className="text-muted-foreground hover:text-foreground"
            >
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              <span className="sr-only">Copy message</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

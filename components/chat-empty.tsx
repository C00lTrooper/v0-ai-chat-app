"use client";

import { Code, Lightbulb, BookOpen } from "lucide-react";

interface ChatEmptyProps {
  onSuggestionClick: (suggestion: string) => void;
}

const suggestions = [
  {
    icon: Code,
    label: "Write code",
    prompt: "Write a React hook that debounces a value with TypeScript",
  },
  {
    icon: Lightbulb,
    label: "Brainstorm",
    prompt: "Give me 5 creative project ideas using AI APIs",
  },
  {
    icon: BookOpen,
    label: "Explain",
    prompt: "Explain how transformers work in machine learning",
  },
];

export function ChatEmpty({ onSuggestionClick }: ChatEmptyProps) {
  return (
    <div className="flex flex-col items-center px-4 pb-40 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance">
        What can I help you with?
      </h1>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        Powered by Gemini 3 Flash via OpenRouter. Ask me anything.
      </p>
      <div className="mt-8 grid w-full max-w-lg gap-3 sm:grid-cols-3">
        {suggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => onSuggestionClick(s.prompt)}
            className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <s.icon className="size-5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {s.label}
            </span>
            <span className="text-xs text-muted-foreground line-clamp-2">
              {s.prompt}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

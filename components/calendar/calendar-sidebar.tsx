"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  type CalendarProject,
  PROJECT_COLORS,
  getMonthViewDays,
  isSameDay,
  isToday,
} from "@/lib/calendar-utils";

const DAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];

interface CalendarSidebarProps {
  currentDate: Date;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  projects: CalendarProject[];
  visibleProjectIds: Set<string>;
  onToggleProject: (id: string) => void;
}

export function CalendarSidebar({
  currentDate,
  selectedDate,
  onSelectDate,
  projects,
  visibleProjectIds,
  onToggleProject,
}: CalendarSidebarProps) {
  const [miniMonth, setMiniMonth] = useState(
    () => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
  );
  const [projectsOpen, setProjectsOpen] = useState(true);

  const miniDays = getMonthViewDays(
    miniMonth.getFullYear(),
    miniMonth.getMonth(),
  );

  const navigateMini = (dir: -1 | 1) => {
    setMiniMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + dir, 1),
    );
  };

  const handleSelectDay = (day: Date) => {
    onSelectDate(day);
    if (day.getMonth() !== miniMonth.getMonth()) {
      setMiniMonth(new Date(day.getFullYear(), day.getMonth(), 1));
    }
  };

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-border bg-background md:w-60 md:border-b-0 md:border-r">
      <div className="p-3 pb-1">
        {/* Mini calendar header */}
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">
            {miniMonth.toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </span>
          <div className="flex">
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => navigateMini(-1)}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => navigateMini(1)}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Day name headers */}
        <div className="mb-0.5 grid grid-cols-7">
          {DAY_NAMES.map((name, i) => (
            <div
              key={i}
              className="text-center text-[10px] font-medium text-muted-foreground"
            >
              {name}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7">
          {miniDays.map((day, i) => {
            const inMonth = day.getMonth() === miniMonth.getMonth();
            const selected = isSameDay(day, selectedDate);
            const today = isToday(day);
            return (
              <button
                key={i}
                onClick={() => handleSelectDay(day)}
                className={cn(
                  "mx-auto flex size-7 items-center justify-center rounded-full text-xs transition-colors",
                  !inMonth && "text-muted-foreground/40",
                  inMonth && !selected && !today && "text-foreground",
                  today &&
                    !selected &&
                    "bg-primary font-bold text-primary-foreground",
                  selected &&
                    today &&
                    "bg-primary font-bold text-primary-foreground ring-2 ring-primary/30",
                  selected &&
                    !today &&
                    "bg-accent font-semibold text-accent-foreground",
                  !selected && !today && "hover:bg-accent/50",
                )}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {/* My Projects */}
      <div className="mt-2 flex-1 overflow-y-auto px-3">
        <Collapsible open={projectsOpen} onOpenChange={setProjectsOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center justify-between py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
              My Projects
              <ChevronUp
                className={cn(
                  "size-3.5 transition-transform",
                  !projectsOpen && "rotate-180",
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-0.5 pb-2">
              {projects.length === 0 && (
                <p className="py-2 text-xs text-muted-foreground">
                  No projects yet
                </p>
              )}
              {projects.map((project) => {
                const color = PROJECT_COLORS[project.colorIndex];
                const visible = visibleProjectIds.has(project._id);
                return (
                  <button
                    key={project._id}
                    onClick={() => onToggleProject(project._id)}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent/50"
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-[3px] border transition-colors",
                      )}
                      style={{
                        backgroundColor: visible ? color.hex : "transparent",
                        borderColor: visible
                          ? color.hex
                          : "var(--color-border)",
                      }}
                    >
                      {visible && (
                        <svg
                          viewBox="0 0 12 12"
                          className="size-2.5 text-white"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{project.projectName}</span>
                  </button>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Categories (derived from project colors) */}
      <div className="border-t border-border px-3 py-3">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Categories
        </p>
        <div className="space-y-1">
          {(["Work", "Education", "Personal"] as const).map((cat, i) => (
            <div key={cat} className="flex items-center gap-2 text-sm">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: PROJECT_COLORS[i].hex }}
              />
              {cat}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

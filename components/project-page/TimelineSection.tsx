"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { Project } from "@/lib/project-schema";
import { PROJECT_COLORS, formatDayHeader } from "@/lib/calendar-utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useAuth } from "@/components/auth-provider";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import {
  CheckCircle2,
  Circle,
  ZoomIn,
  ZoomOut,
  GanttChart,
  Plus,
} from "lucide-react";

type ZoomLevel = "day" | "week";

type Phase = Project["project_wbs"][number];

interface PhaseWithLayout {
  phase: Phase;
  startDate: Date;
  endDate: Date;
  colorIndex: number;
  row: number;
  projectId?: string;
  projectName?: string;
}

function parseDate(dateStr: string): Date | null {
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86_400_000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}`;
}

function assignRows(phases: PhaseWithLayout[]): PhaseWithLayout[] {
  const sorted = [...phases].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  );
  const rowEnds: number[] = [];

  for (const phase of sorted) {
    let assigned = -1;
    for (let r = 0; r < rowEnds.length; r++) {
      if (phase.startDate.getTime() > rowEnds[r]) {
        assigned = r;
        break;
      }
    }
    if (assigned === -1) {
      assigned = rowEnds.length;
      rowEnds.push(0);
    }
    rowEnds[assigned] = phase.endDate.getTime();
    phase.row = assigned;
  }

  return sorted;
}

export interface TimelineSectionProps {
  project: {
    _id: string;
    data: string;
    projectName: string;
    isOwner: boolean;
  };
}

export function TimelineSection({ project }: TimelineSectionProps) {
  const { sessionToken } = useAuth();
  const [zoom, setZoom] = useState<ZoomLevel>("week");
  const [selectedPhase, setSelectedPhase] = useState<PhaseWithLayout | null>(
    null,
  );
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [viewAll, setViewAll] = useState(false);
  const [allPhases, setAllPhases] = useState<PhaseWithLayout[] | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const projectPhases = useMemo(() => {
    let parsed: Project | null = null;
    try {
      if (project.data) parsed = JSON.parse(project.data) as Project;
    } catch {
      return [];
    }
    if (!parsed?.project_wbs?.length) return [];

    const mapped: PhaseWithLayout[] = [];
    for (let i = 0; i < parsed.project_wbs.length; i++) {
      const p = parsed.project_wbs[i];
      const start = parseDate(p.start_date);
      const end = parseDate(p.end_date);
      if (!start || !end) continue;
      if (end < start) continue;
      mapped.push({
        phase: p,
        startDate: start,
        endDate: end,
        colorIndex: i % PROJECT_COLORS.length,
        row: 0,
      });
    }

    return assignRows(mapped);
  }, [project.data]);

  useEffect(() => {
    if (!viewAll) return;
    if (!sessionToken || !convexClient) return;

    let cancelled = false;
    setLoadingAll(true);

    void (async () => {
      try {
        const result = await convexClient.query(api.projects.listWithTasks, {
          token: sessionToken,
        });
        if (cancelled) return;

        const mapped: PhaseWithLayout[] = [];
        result.forEach(
          (
            p: {
              _id: string;
              projectName: string;
              summaryName: string;
              data: string;
            },
            idx: number,
          ) => {
            let parsed: Project | null = null;
            try {
              parsed = JSON.parse(p.data) as Project;
            } catch {
              return;
            }
            if (!parsed.project_wbs?.length) return;

            const colorIndex = idx % PROJECT_COLORS.length;
            for (const phase of parsed.project_wbs) {
              const start = parseDate(phase.start_date);
              const end = parseDate(phase.end_date);
              if (!start || !end) continue;
              if (end < start) continue;
              mapped.push({
                phase,
                startDate: start,
                endDate: end,
                colorIndex,
                row: 0,
                projectId: p._id,
                projectName: p.projectName || p.summaryName,
              });
            }
          },
        );

        setAllPhases(assignRows(mapped));
      } catch {
        if (!cancelled) setAllPhases([]);
      } finally {
        if (!cancelled) setLoadingAll(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewAll, sessionToken]);

  const phases = viewAll ? allPhases ?? [] : projectPhases;

  const hasPhases = phases.length > 0;

  const LEGEND_COLLAPSED_COUNT = 6;
  const showLegendToggle = phases.length > LEGEND_COLLAPSED_COUNT;
  const visibleLegendPhases = legendExpanded
    ? phases
    : phases.slice(0, LEGEND_COLLAPSED_COUNT);

  const { timelineStart, totalDays, timelineEnd } = useMemo(() => {
    if (!hasPhases) {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 37);
      return { timelineStart: start, totalDays: 37, timelineEnd: end };
    }

    let earliest = phases[0].startDate;
    let latest = phases[0].endDate;
    for (const p of phases) {
      if (p.startDate < earliest) earliest = p.startDate;
      if (p.endDate > latest) latest = p.endDate;
    }

    const padStart = new Date(earliest);
    padStart.setDate(padStart.getDate() - 3);
    const padEnd = new Date(latest);
    padEnd.setDate(padEnd.getDate() + 7);

    return {
      timelineStart: padStart,
      totalDays: daysBetween(padStart, padEnd),
      timelineEnd: padEnd,
    };
  }, [phases, hasPhases]);

  const dayWidth = zoom === "day" ? 72 : 24;
  const totalWidth = totalDays * dayWidth;
  const ROW_HEIGHT = 72;
  const maxRow = hasPhases ? Math.max(...phases.map((p) => p.row)) : 0;
  const rows = maxRow + 1;
  const rowsHeight = rows * ROW_HEIGHT;
  const chartHeight = rowsHeight + 32;
  const rowOffsetBase = (chartHeight - rowsHeight) / 2;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOffset = daysBetween(timelineStart, today);
  const todayX = todayOffset * dayWidth;
  const showToday = todayOffset >= 0 && todayOffset <= totalDays;

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !hasPhases) return;

    const target = showToday
      ? todayX
      : phases[0]
        ? daysBetween(timelineStart, phases[0].startDate) * dayWidth
        : 0;

    el.scrollLeft = Math.max(0, target - el.clientWidth / 2);
  }, [todayX, zoom, showToday, hasPhases, phases, timelineStart, dayWidth]);

  const dateMarkers = useMemo(() => {
    const markers: {
      date: Date;
      x: number;
      label: string;
      isMonthStart: boolean;
    }[] = [];

    for (let d = 0; d <= totalDays; d++) {
      const date = new Date(timelineStart);
      date.setDate(date.getDate() + d);
      const x = d * dayWidth;

      if (zoom === "day") {
        markers.push({
          date,
          x,
          label: formatDateShort(date),
          isMonthStart: date.getDate() === 1,
        });
      } else if (date.getDay() === 1 || d === 0) {
        markers.push({
          date,
          x,
          label: formatDateShort(date),
          isMonthStart: date.getDate() <= 7 && date.getDay() === 1,
        });
      }
    }

    return markers;
  }, [totalDays, dayWidth, timelineStart, zoom]);

  const monthSegments = useMemo(() => {
    const segments: { label: string; x: number; width: number }[] = [];
    if (totalDays <= 0) return segments;

    let currentMonth = -1;
    let currentYear = -1;
    let segmentStartDay = 0;

    const pushSegment = (
      startDay: number,
      endDay: number,
      month: number,
      year: number,
    ) => {
      if (endDay <= startDay) return;
      const startX = startDay * dayWidth;
      const width = (endDay - startDay) * dayWidth;
      const date = new Date(timelineStart);
      date.setMonth(month);
      date.setFullYear(year);
      const label = date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      segments.push({ label, x: startX, width });
    };

    for (let d = 0; d <= totalDays; d++) {
      const date = new Date(timelineStart);
      date.setDate(date.getDate() + d);
      const m = date.getMonth();
      const y = date.getFullYear();
      if (currentMonth === -1) {
        currentMonth = m;
        currentYear = y;
        segmentStartDay = 0;
      } else if (m !== currentMonth || y !== currentYear) {
        pushSegment(segmentStartDay, d, currentMonth, currentYear);
        currentMonth = m;
        currentYear = y;
        segmentStartDay = d;
      }
    }

    if (currentMonth !== -1) {
      pushSegment(segmentStartDay, totalDays + 1, currentMonth, currentYear);
    }

    return segments;
  }, [timelineStart, totalDays, dayWidth]);

  if (!hasPhases) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Timeline</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visualize project phases on a timeline
        </p>
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-muted-foreground">
          <GanttChart className="mb-3 size-10" />
          <p className="text-sm font-medium">No phases yet</p>
          <p className="mt-1 text-xs">
            Generate the project from the sidebar to create phases and tasks.
          </p>
          {project.isOwner && (
            <Button variant="outline" size="sm" className="mt-4">
              <Plus className="size-4" />
              Add Phase
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Timeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {viewAll
              ? "Visualize phases across all projects"
              : "Visualize project phases on a timeline"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            <Button
              variant={zoom === "week" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setZoom("week")}
              className="h-7 px-2.5 text-xs"
            >
              <ZoomOut className="mr-1 size-3" />
              Weeks
            </Button>
            <Button
              variant={zoom === "day" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setZoom("day")}
              className="h-7 px-2.5 text-xs"
            >
              <ZoomIn className="mr-1 size-3" />
              Days
            </Button>
          </div>
          <Button
            variant={viewAll ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => setViewAll((v) => !v)}
            disabled={viewAll && loadingAll}
          >
            {viewAll ? "All projects" : "This project only"}
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap gap-3">
          {visibleLegendPhases.map((p, i) => (
            <button
              key={`${p.projectId ?? project._id}-${p.phase.order}-${i}`}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
              onClick={() => setSelectedPhase(p)}
            >
              <div
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: PROJECT_COLORS[p.colorIndex].hex }}
              />
              <span className="max-w-[140px] truncate">
                {viewAll && p.projectName
                  ? `${p.projectName}: ${p.phase.name}`
                  : p.phase.name}
              </span>
            </button>
          ))}
        </div>
        {showLegendToggle && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2.5 text-[11px] whitespace-nowrap"
            onClick={() => setLegendExpanded((v) => !v)}
          >
            {legendExpanded
              ? "Show fewer"
              : `See all ${phases.length.toString()}`}
          </Button>
        )}
      </div>

      {/* High-level info */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Range: {formatDateRange(timelineStart, timelineEnd)}</span>
        <span>
          {phases.length} phase{phases.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Timeline */}
      <div
        ref={scrollContainerRef}
        className="mt-4 flex-1 min-h-0 overflow-x-auto rounded-xl border border-border bg-card"
      >
        <div
          style={{ width: totalWidth, minWidth: "100%" }}
          className="relative"
        >
          {/* Date axis */}
          <div className="border-b border-border bg-muted/30">
            {/* Month band */}
            <div className="relative h-7 border-b border-border/60">
              {monthSegments.map((seg, i) => (
                <div
                  key={i}
                  className="absolute top-0 flex h-full items-center justify-center px-1 text-[11px] font-semibold text-muted-foreground"
                  style={{ left: seg.x, width: seg.width }}
                >
                  <span className="truncate">{seg.label}</span>
                </div>
              ))}
            </div>
            {/* Day / week ticks */}
            <div className="relative h-10">
              {dateMarkers.map((marker, i) => (
                <div
                  key={i}
                  className="absolute bottom-0 flex flex-col items-start"
                  style={{ left: marker.x }}
                >
                  <span
                    className={cn(
                      "whitespace-nowrap pb-2 pl-1 text-[10px]",
                      marker.isMonthStart
                        ? "font-semibold text-foreground"
                        : "font-medium text-muted-foreground",
                    )}
                    title={formatDayHeader(marker.date)}
                  >
                    {marker.label}
                  </span>
                  <div className="h-2 w-px bg-border" />
                </div>
              ))}
            </div>
          </div>

          {/* Chart body */}
          <div className="relative" style={{ height: chartHeight }}>
            {/* Vertical grid lines */}
            {dateMarkers.map((marker, i) => (
              <div
                key={i}
                className="absolute top-0 w-px bg-border/20"
                style={{ left: marker.x, height: chartHeight }}
              />
            ))}

            {/* Today marker */}
            {showToday && (
              <div
                className="absolute top-0 z-20 w-0.5 bg-primary"
                style={{ left: todayX, height: chartHeight }}
              >
                <div className="absolute -left-[14px] -top-[22px] rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold leading-tight text-primary-foreground shadow-sm">
                  Today
                </div>
              </div>
            )}

            {/* Phase bars */}
            {phases.map((p, i) => {
              const startOffset = daysBetween(timelineStart, p.startDate);
              const duration = daysBetween(p.startDate, p.endDate) + 1;
              const left = startOffset * dayWidth;
              const width = Math.max(duration * dayWidth, dayWidth);
              const top = rowOffsetBase + p.row * ROW_HEIGHT;
              const color = PROJECT_COLORS[p.colorIndex].hex;

              const completedTasks =
                p.phase.tasks?.filter((t) => t.completed).length ?? 0;
              const totalTasks = p.phase.tasks?.length ?? 0;

              return (
                <button
                  key={i}
                  type="button"
                  className="absolute flex cursor-pointer items-center gap-2 overflow-hidden rounded-md border px-3 text-left text-xs font-medium text-white shadow-sm transition-all hover:brightness-110 hover:shadow-md active:scale-[0.995]"
                  style={{
                    left,
                    width,
                    top,
                    height: ROW_HEIGHT - 12,
                    backgroundColor: color,
                    borderColor: `${color}80`,
                  }}
                  onClick={() => setSelectedPhase(p)}
                >
                  <span className="truncate">{p.phase.name}</span>
                  {totalTasks > 0 && (
                    <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] leading-tight">
                      {completedTasks}/{totalTasks}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Phase detail sheet */}
      <Sheet
        open={!!selectedPhase}
        onOpenChange={(open) => {
          if (!open) setSelectedPhase(null);
        }}
      >
        <SheetContent side="right" className="overflow-y-auto">
          {selectedPhase && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <div
                    className="size-3 shrink-0 rounded-sm"
                    style={{
                      backgroundColor:
                        PROJECT_COLORS[selectedPhase.colorIndex].hex,
                    }}
                  />
                  {selectedPhase.phase.name}
                </SheetTitle>
                <SheetDescription>
                  {formatDateRange(
                    selectedPhase.startDate,
                    selectedPhase.endDate,
                  )}
                </SheetDescription>
              </SheetHeader>

              {selectedPhase.phase.description && (
                <p className="px-4 text-sm text-muted-foreground">
                  {selectedPhase.phase.description}
                </p>
              )}

              <div className="px-4 pb-6">
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  Tasks ({selectedPhase.phase.tasks?.length ?? 0})
                </h3>
                {!selectedPhase.phase.tasks?.length ? (
                  <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                    No tasks in this phase.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {selectedPhase.phase.tasks
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((task, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-3 rounded-lg border border-border bg-background p-3"
                        >
                          {task.completed ? (
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                          ) : (
                            <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "text-sm font-medium",
                                task.completed &&
                                  "text-muted-foreground line-through",
                              )}
                            >
                              {task.name}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span
                                className={cn(
                                  "rounded-full px-1.5 py-0.5",
                                  task.completed
                                    ? "bg-emerald-500/10 text-emerald-600"
                                    : "bg-amber-500/10 text-amber-600",
                                )}
                              >
                                {task.completed ? "Done" : "Pending"}
                              </span>
                              <span>Due: {task.date}</span>
                              {task.time && <span>{task.time}</span>}
                            </div>
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

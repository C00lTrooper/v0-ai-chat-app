"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { CalendarSidebar } from "@/components/calendar/calendar-sidebar";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { CalendarMonthGrid } from "@/components/calendar/calendar-month-grid";
import { CalendarWeekGrid } from "@/components/calendar/calendar-week-grid";
import { CalendarDayView } from "@/components/calendar/calendar-day-view";
import { TaskDetailDialog } from "@/components/calendar/task-detail-dialog";
import { DayTasksDialog } from "@/components/calendar/day-tasks-dialog";
import { useCalendarData } from "@/hooks/use-calendar-data";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "@/hooks/use-toast";
import {
  type CalendarViewMode,
  type CalendarEvent,
  groupEventsByDate,
  dateKey,
  parseTimeToHour,
  normalizeTimeString,
} from "@/lib/calendar-utils";
import type { Id } from "@/convex/_generated/dataModel";

export function CalendarView() {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [visibleProjectIds, setVisibleProjectIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dayTasksModalDate, setDayTasksModalDate] = useState<Date | null>(
    null,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [pendingReschedule, setPendingReschedule] = useState<{
    event: CalendarEvent;
    newDate: Date;
    newStartTime: string;
    durationHours: number;
  } | null>(null);
  const [isRescheduling, setIsRescheduling] = useState(false);

  const { sessionToken } = useAuth();
  const updateTaskTime = useMutation(api.aiTools.updateTaskTime);
  const updateTaskDueDate = useMutation(api.aiTools.updateTaskDueDate);

  const { projects, events, loading } = useCalendarData();

  // Auto-enable all projects once loaded
  useEffect(() => {
    if (projects.length > 0 && visibleProjectIds.size === 0) {
      setVisibleProjectIds(new Set(projects.map((p) => p._id)));
    }
  }, [projects, visibleProjectIds.size]);

  const filteredEvents = useMemo(
    () => events.filter((e) => visibleProjectIds.has(e.projectId)),
    [events, visibleProjectIds],
  );

  const eventsByDate = useMemo(
    () => groupEventsByDate(filteredEvents),
    [filteredEvents],
  );

  const navigate = useCallback(
    (direction: -1 | 1) => {
      setCurrentDate((prev) => {
        const d = new Date(prev);
        if (viewMode === "month") d.setMonth(d.getMonth() + direction);
        else if (viewMode === "week") d.setDate(d.getDate() + 7 * direction);
        else d.setDate(d.getDate() + direction);
        return d;
      });
    },
    [viewMode],
  );

  const goToToday = useCallback(() => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  }, []);

  const handleSelectDate = useCallback(
    (date: Date) => {
      setSelectedDate(date);
      setCurrentDate(date);
      setViewMode("day");
    },
    [],
  );

  const toggleProject = useCallback((id: string) => {
    setVisibleProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleEventClick = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
    setDialogOpen(true);
  }, []);

  const handleEventDragEnd = useCallback(
    (
      event: CalendarEvent,
      newDate: Date,
      newStartTime: string,
      durationHours: number,
    ) => {
      setPendingReschedule({ event, newDate, newStartTime, durationHours });
    },
    [],
  );

  const handleConfirmReschedule = useCallback(async () => {
    if (!pendingReschedule || !sessionToken || isRescheduling) return;
    setIsRescheduling(true);
    const { event, newDate, newStartTime, durationHours } = pendingReschedule;
    try {
      // All calculations in 24-hour space
      const startHour = parseTimeToHour(newStartTime);
      const endHourFloat = startHour + durationHours;
      const endHourInt = Math.floor(endHourFloat);
      const endMinutes = Math.round((endHourFloat - endHourInt) * 60);
      let displayHour = endHourInt % 12;
      if (displayHour === 0) displayHour = 12;
      const period = endHourInt >= 12 ? "PM" : "AM";
      const newEndTime = `${displayHour}:${String(endMinutes).padStart(
        2,
        "0",
      )} ${period}`;

      // Debug logging for PM drag calculations
      console.log("[Calendar drag] Saving reschedule", {
        rawNewStartTime: newStartTime,
        parsedStartHour: startHour,
        durationHours,
        endHourFloat,
        endHourInt,
        endMinutes,
        newEndTime,
      });

      await updateTaskTime({
        token: sessionToken,
        projectId: event.projectId as Id<"projects">,
        phaseOrder: event.phaseOrder,
        taskOrder: event.taskOrder,
        newStartTime,
        newEndTime,
      });

      const oldDateKey = dateKey(event.date);
      const newDateKey = dateKey(newDate);
      if (oldDateKey !== newDateKey) {
        await updateTaskDueDate({
          token: sessionToken,
          projectId: event.projectId as Id<"projects">,
          phaseOrder: event.phaseOrder,
          taskOrder: event.taskOrder,
          newDate: newDateKey,
        });
      }

      toast({ title: "Task rescheduled." });
      setPendingReschedule(null);
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to reschedule task.",
      });
    } finally {
      setIsRescheduling(false);
    }
  }, [
    isRescheduling,
    pendingReschedule,
    sessionToken,
    updateTaskDueDate,
    updateTaskTime,
  ]);

  const handleCancelReschedule = useCallback(() => {
    setPendingReschedule(null);
  }, []);

  const handleDayMoreClick = useCallback((date: Date) => {
    setDayTasksModalDate(date);
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <CalendarSidebar
        currentDate={currentDate}
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
        projects={projects}
        visibleProjectIds={visibleProjectIds}
        onToggleProject={toggleProject}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <CalendarToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          currentDate={currentDate}
          onNavigate={navigate}
          onToday={goToToday}
        />

        {viewMode === "month" && (
          <CalendarMonthGrid
            currentDate={currentDate}
            selectedDate={selectedDate}
            eventsByDate={eventsByDate}
            onSelectDate={handleSelectDate}
            onEventClick={handleEventClick}
            onDayMoreClick={handleDayMoreClick}
          />
        )}

        {viewMode === "week" && (
          <CalendarWeekGrid
            currentDate={currentDate}
            selectedDate={selectedDate}
            eventsByDate={eventsByDate}
            onSelectDate={handleSelectDate}
            onEventClick={handleEventClick}
            onEventDragEnd={handleEventDragEnd}
          />
        )}

        {viewMode === "day" && (
          <CalendarDayView
            currentDate={currentDate}
            eventsByDate={eventsByDate}
            onEventClick={handleEventClick}
            onEventDragEnd={handleEventDragEnd}
          />
        )}
      </div>

      <TaskDetailDialog
        event={selectedEvent}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <DayTasksDialog
        date={dayTasksModalDate}
        events={
          dayTasksModalDate
            ? eventsByDate.get(dateKey(dayTasksModalDate)) ?? []
            : []
        }
        open={dayTasksModalDate !== null}
        onOpenChange={(open) => !open && setDayTasksModalDate(null)}
        onEventClick={handleEventClick}
      />

      <Dialog
        open={pendingReschedule !== null}
        onOpenChange={(open) => {
          if (!open) setPendingReschedule(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm reschedule</DialogTitle>
            <DialogDescription>
              {pendingReschedule && (
                <>
                  You&apos;re about to move{" "}
                  <span className="font-medium">
                    {pendingReschedule.event.taskName}
                  </span>{" "}
                  to{" "}
                  {pendingReschedule.newDate.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                  ,{" "}
                  {pendingReschedule.newStartTime}
                  {(() => {
                    const startHour = parseTimeToHour(
                      pendingReschedule.newStartTime,
                    );
                    const endHourFloat = startHour + pendingReschedule.durationHours;
                    const endHourInt = Math.floor(endHourFloat);
                    const endMinutes = Math.round(
                      (endHourFloat - endHourInt) * 60,
                    );
                    let displayHour = endHourInt % 12;
                    if (displayHour === 0) displayHour = 12;
                    const period = endHourInt >= 12 ? "PM" : "AM";
                    const endLabel = `${displayHour}:${String(
                      endMinutes,
                    ).padStart(2, "0")} ${period}`;
                    return ` – ${endLabel}`;
                  })()}
                  .
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancelReschedule}
              disabled={isRescheduling}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmReschedule}
              disabled={isRescheduling || !sessionToken}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { CalendarSidebar } from "@/components/calendar/calendar-sidebar";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { CalendarMonthGrid } from "@/components/calendar/calendar-month-grid";
import { CalendarWeekGrid } from "@/components/calendar/calendar-week-grid";
import { CalendarDayView } from "@/components/calendar/calendar-day-view";
import { TaskDetailDialog } from "@/components/calendar/task-detail-dialog";
import { useCalendarData } from "@/hooks/use-calendar-data";
import { Spinner } from "@/components/ui/spinner";
import {
  type CalendarViewMode,
  type CalendarEvent,
  groupEventsByDate,
} from "@/lib/calendar-utils";

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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <CalendarSidebar
        currentDate={currentDate}
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
        projects={projects}
        visibleProjectIds={visibleProjectIds}
        onToggleProject={toggleProject}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
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
          />
        )}

        {viewMode === "week" && (
          <CalendarWeekGrid
            currentDate={currentDate}
            selectedDate={selectedDate}
            eventsByDate={eventsByDate}
            onSelectDate={handleSelectDate}
            onEventClick={handleEventClick}
          />
        )}

        {viewMode === "day" && (
          <CalendarDayView
            currentDate={currentDate}
            eventsByDate={eventsByDate}
            onEventClick={handleEventClick}
          />
        )}
      </div>

      <TaskDetailDialog
        event={selectedEvent}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}

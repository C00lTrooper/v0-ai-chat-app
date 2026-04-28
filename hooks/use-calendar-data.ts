"use client";

import { useMemo } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type {
  CalendarEvent,
  CalendarPhaseInfo,
  CalendarProject,
} from "@/lib/calendar-utils";
import { PROJECT_COLORS } from "@/lib/calendar-utils";

interface ProjectWbsTask {
  order: number;
  name: string;
  date: string;
  time: string;
  endTime?: string;
  completed?: boolean;
}

interface ProjectWbs {
  order: number;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  tasks: ProjectWbsTask[];
}

interface ProjectData {
  project_wbs?: ProjectWbs[];
  unassigned_tasks?: ProjectWbsTask[];
}

interface RawProject {
  _id: string;
  slug: string;
  projectName: string;
  summaryName: string;
  data: string;
  isOwner: boolean;
}

interface RawCalendarEvent {
  _id: string;
  title: string;
  startDate: string;
  endDate: string;
  projectId?: string;
}

export function useCalendarData() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const ready = !isLoading && isAuthenticated;

  const rawProjects = useQuery(
    api.projects.listWithTasks,
    ready ? {} : "skip",
  );

  const contextResult = useQuery(
    api.aiContext.getContext,
    ready ? {} : "skip",
  );

  const rawCalendarEvents: RawCalendarEvent[] = useMemo(() => {
    if (!contextResult?.calendarEvents) return [];
    return contextResult.calendarEvents.map((e) => ({
      _id: e.id,
      title: e.title,
      startDate: e.startDate,
      endDate: e.endDate,
      projectId: e.projectId,
    }));
  }, [contextResult]);

  const loading =
    (ready && rawProjects === undefined) ||
    (ready && contextResult === undefined);

  const { projects, events, projectPhasesByProjectId } = useMemo(() => {
    const projectsList: RawProject[] = Array.isArray(rawProjects) ? rawProjects : [];
    const projects: CalendarProject[] = [];
    const events: CalendarEvent[] = [];
    const projectPhasesByProjectId: Record<string, CalendarPhaseInfo[]> = {};

    projectsList.forEach((rp, idx) => {
      const colorIndex = idx % 8;
      projects.push({
        _id: rp._id,
        projectName: rp.projectName || rp.summaryName,
        colorIndex,
      });

      try {
        const data: ProjectData = JSON.parse(rp.data);
        if (!data.project_wbs) return;

        const wbs = data.project_wbs;
        const phaseInfos: CalendarPhaseInfo[] = [];
        for (let pi = 0; pi < wbs.length; pi++) {
          const ph = wbs[pi];
          phaseInfos.push({
            order: ph.order,
            name: ph.name,
            start_date: ph.start_date,
            end_date: ph.end_date,
            colorIndex: pi % PROJECT_COLORS.length,
          });
        }
        projectPhasesByProjectId[rp._id] = phaseInfos;

        for (const phase of data.project_wbs) {
          for (const task of phase.tasks) {
            const parsed = new Date(task.date + "T00:00:00");
            if (isNaN(parsed.getTime())) continue;

            events.push({
              id: `${rp._id}-${phase.order}-${task.order}`,
              projectId: rp._id,
              projectName: rp.projectName || rp.summaryName,
              phaseName: phase.name,
              taskName: task.name,
              date: parsed,
              timeStr: task.time,
              ...(task.endTime ? { endTimeStr: task.endTime } : {}),
              colorIndex,
              completed: Boolean(task.completed),
              phaseOrder: phase.order,
              taskOrder: task.order,
            });
          }
        }

        for (const task of data.unassigned_tasks ?? []) {
          const parsed = new Date(task.date + "T00:00:00");
          if (isNaN(parsed.getTime())) continue;

          events.push({
            id: `${rp._id}-0-${task.order}`,
            projectId: rp._id,
            projectName: rp.projectName || rp.summaryName,
            phaseName: "Unassigned",
            taskName: task.name,
            date: parsed,
            timeStr: task.time,
            ...(task.endTime ? { endTimeStr: task.endTime } : {}),
            colorIndex,
            completed: Boolean(task.completed),
            phaseOrder: 0,
            taskOrder: task.order,
          });
        }
      } catch {
        // invalid JSON
      }
    });

    for (const ce of rawCalendarEvents) {
      const startDate = new Date(ce.startDate + "T00:00:00");
      if (isNaN(startDate.getTime())) continue;

      const linkedProject = ce.projectId
        ? projects.find((p) => p._id === ce.projectId)
        : null;

      events.push({
        id: `cal-${ce._id}`,
        projectId: ce.projectId || "",
        projectName: linkedProject?.projectName || "Calendar",
        phaseName: "Event",
        taskName: ce.title,
        date: startDate,
        timeStr: "9:00 AM",
        colorIndex: linkedProject?.colorIndex ?? 7,
        completed: false,
        phaseOrder: -1,
        taskOrder: -1,
      });
    }

    return { projects, events, projectPhasesByProjectId };
  }, [rawProjects, rawCalendarEvents]);

  return { projects, events, projectPhasesByProjectId, loading };
}

"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/components/auth-provider";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { CalendarEvent, CalendarProject } from "@/lib/calendar-utils";

interface ProjectWbsTask {
  order: number;
  name: string;
  date: string;
  time: string;
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
}

interface RawProject {
  _id: string;
  slug: string;
  projectName: string;
  summaryName: string;
  data: string;
  isOwner: boolean;
}

export function useCalendarData() {
  const { sessionToken } = useAuth();
  const [rawProjects, setRawProjects] = useState<RawProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionToken || !convexClient) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const result = await convexClient.query(api.projects.listWithTasks, {
          token: sessionToken,
        });
        if (!cancelled) setRawProjects(result);
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  const { projects, events } = useMemo(() => {
    const projects: CalendarProject[] = [];
    const events: CalendarEvent[] = [];

    rawProjects.forEach((rp, idx) => {
      const colorIndex = idx % 8;
      projects.push({
        _id: rp._id,
        projectName: rp.projectName || rp.summaryName,
        colorIndex,
      });

      try {
        const data: ProjectData = JSON.parse(rp.data);
        if (!data.project_wbs) return;

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
              colorIndex,
              completed: Boolean(task.completed),
              phaseOrder: phase.order,
              taskOrder: task.order,
            });
          }
        }
      } catch {
        // invalid JSON
      }
    });

    return { projects, events };
  }, [rawProjects]);

  return { projects, events, loading };
}

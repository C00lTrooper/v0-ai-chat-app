export type CalendarViewMode = "month" | "week" | "day";

export interface CalendarProject {
  _id: string;
  projectName: string;
  colorIndex: number;
}

export interface CalendarEvent {
  id: string;
  projectId: string;
  projectName: string;
  phaseName: string;
  taskName: string;
  taskDescription?: string;
  date: Date;
  timeStr: string;
  /** End time (e.g. "10:00 AM"). If absent, event is shown as 1-hour block from timeStr. */
  endTimeStr?: string;
  colorIndex: number;
  completed: boolean;
  phaseOrder: number;
  taskOrder: number;
}

/** Phase row from project WBS with timeline-aligned color (array index % palette). */
export interface CalendarPhaseInfo {
  order: number;
  name: string;
  start_date: string;
  end_date: string;
  colorIndex: number;
}

export const PROJECT_COLORS = [
  { name: "Blue", hex: "#3b82f6" },
  { name: "Red", hex: "#ef4444" },
  { name: "Green", hex: "#22c55e" },
  { name: "Purple", hex: "#a855f7" },
  { name: "Orange", hex: "#f97316" },
  { name: "Teal", hex: "#14b8a6" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Amber", hex: "#f59e0b" },
];

const PHASE_VIEW_OTHER_PROJECT_HEX = "#737373";
/** Tasks on the focused project but not in a numbered phase (unassigned / synthetic). */
const PHASE_VIEW_NON_PHASE_HEX = "#64748b";

export type PhaseViewColorResolution = {
  hex: string;
  /** When true, render with extra opacity reduction for “other project” muting. */
  isOtherProject: boolean;
};

/**
 * Resolve bar / task color when optional calendar “phase view” is active.
 * Timeline colors match `TimelineSection`: `colorIndex = indexInProjectWbs % palette`.
 */
export function resolvePhaseViewEventColor(
  evt: CalendarEvent,
  phaseViewProjectId: string | null,
  projectPhasesByProjectId: Record<string, CalendarPhaseInfo[]>,
): PhaseViewColorResolution {
  if (!phaseViewProjectId) {
    return {
      hex: PROJECT_COLORS[evt.colorIndex % PROJECT_COLORS.length].hex,
      isOtherProject: false,
    };
  }
  if (evt.projectId !== phaseViewProjectId) {
    return { hex: PHASE_VIEW_OTHER_PROJECT_HEX, isOtherProject: true };
  }
  if (evt.phaseOrder < 1) {
    return { hex: PHASE_VIEW_NON_PHASE_HEX, isOtherProject: false };
  }
  const phases = projectPhasesByProjectId[evt.projectId];
  const ph = phases?.find((p) => p.order === evt.phaseOrder);
  const ci = ph?.colorIndex ?? evt.colorIndex;
  return {
    hex: PROJECT_COLORS[ci % PROJECT_COLORS.length].hex,
    isOtherProject: false,
  };
}

/** Inclusive column range [startCol, endCol] for a phase on a 7-day week, or null if no overlap. */
export function weekPhaseColumnRange(
  weekDays: Date[],
  phaseStartYmd: string,
  phaseEndYmd: string,
): { startCol: number; endCol: number } | null {
  let startCol = -1;
  let endCol = -1;
  for (let i = 0; i < weekDays.length; i++) {
    const k = dateKey(weekDays[i]);
    if (k >= phaseStartYmd && k <= phaseEndYmd) {
      if (startCol < 0) startCol = i;
      endCol = i;
    }
  }
  if (startCol < 0) return null;
  return { startCol, endCol };
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Parse `YYYY-MM-DD` as a local calendar date (midnight local).
 * `new Date("YYYY-MM-DD")` is UTC in JS and shifts the day in many timezones.
 */
export function parseYmdLocal(ymd: string): Date | undefined {
  const m = ymd.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) {
    return undefined;
  }
  return dt;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export function getMonthViewDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const startDayOfWeek = firstDay.getDay();
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(year, month, 1 - startDayOfWeek + i));
  }
  return days;
}

export function getWeekViewDays(date: Date): Date[] {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(new Date(d.getFullYear(), d.getMonth(), d.getDate() + i));
  }
  return days;
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function formatWeekRange(date: Date): string {
  const days = getWeekViewDays(date);
  const s = days[0];
  const e = days[6];
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (s.getMonth() !== e.getMonth()) {
    return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}, ${s.getFullYear()}`;
  }
  return `${s.toLocaleDateString("en-US", { month: "long" })} ${s.getDate()} – ${e.getDate()}, ${s.getFullYear()}`;
}

export function formatDayHeader(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Parse a time string to fractional hours since midnight. Returns 9 if invalid. */
export function parseTimeToHour(time: string): number {
  const t = time.trim();
  if (!t) return 9;
  // Match "9:00 AM", "9:00AM", "9:00am", "14:00", etc.
  const match = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = (match[3] ?? "").toUpperCase();
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    return hours + minutes / 60;
  }
  // Fallback: "9am", "9:00am", "9" -> normalize then parse
  const normalized = normalizeTimeString(t);
  if (normalized) {
    const m = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
    if (m) {
      let h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      const p = m[3];
      if (p === "PM" && h < 12) h += 12;
      if (p === "AM" && h === 12) h = 0;
      return h + min / 60;
    }
  }
  return 9;
}

/**
 * Normalize a loose time string to "H:MM AM/PM" or "HH:MM AM/PM".
 * Handles: "9", "9am", "9:00", "09:00", "9:30 pm", "12:00", "12:00 am", etc.
 * Returns null if the input is invalid (empty, non-time, or out-of-range).
 */
export function normalizeTimeString(input: string): string | null {
  const t = input.trim();
  if (!t) return null;

  // Already in expected form (optional space before AM/PM)
  const strict = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (strict) {
    const h = parseInt(strict[1], 10);
    const m = parseInt(strict[2], 10);
    if (h < 0 || h > 12 || m < 0 || m > 59) return null;
    if (h === 0) return null; // 0:00 should be 12:00 AM
    const period = strict[3].toUpperCase();
    return `${h}:${strict[2]} ${period === "AM" ? "AM" : "PM"}`;
  }

  // With optional :minutes and optional am/pm
  const loose = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (loose) {
    let h = parseInt(loose[1], 10);
    const m = Math.min(59, Math.max(0, parseInt(loose[2] ?? "0", 10)));
    const ampm = (loose[3] ?? "").toUpperCase();

    if (h < 0 || h > 23) return null;
    if (h > 12 && !ampm) return null; // 13-23 without PM is ambiguous, reject
    if (ampm === "AM") {
      if (h === 12) h = 0; // 12:00 AM
    } else if (ampm === "PM") {
      if (h !== 12) h += 12; // 1-11 PM
    }
    // no ampm: 1-11 -> AM, 12 -> noon (12)

    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const period = h < 12 ? "AM" : "PM";
    return `${displayHour}:${String(m).padStart(2, "0")} ${period}`;
  }

  return null;
}

/** Duration in hours (fractional). Uses endTimeStr if set, else 1 hour. */
export function eventDurationHours(evt: CalendarEvent): number {
  const start = parseTimeToHour(evt.timeStr);
  const end = evt.endTimeStr
    ? parseTimeToHour(evt.endTimeStr)
    : start + 1;
  return Math.max(0, end - start) || 1;
}

export function formatTime12h(time: string): string {
  const t = time.trim();
  if (!t) return "—";
  // Match "9:00 AM", "9:00AM", "9:00am", "14:00"
  const match = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const ampm = match[3];
    if (ampm) return `${hours}:${minutes}${ampm.toLowerCase()}`;
    const period = hours >= 12 ? "pm" : "am";
    if (hours > 12) hours -= 12;
    if (hours === 0) hours = 12;
    return `${hours}:${minutes}${period}`;
  }
  // Fallback: "9am", "9:00am", "9" -> normalize for display
  const normalized = normalizeTimeString(t);
  if (normalized) return normalized;
  return t;
}

export function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

export function groupEventsByDate(
  events: CalendarEvent[],
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = dateKey(event.date);
    const list = map.get(key) ?? [];
    list.push(event);
    map.set(key, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => parseTimeToHour(a.timeStr) - parseTimeToHour(b.timeStr));
  }
  return map;
}

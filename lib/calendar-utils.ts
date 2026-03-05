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
  date: Date;
  timeStr: string;
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

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

export function parseTimeToHour(time: string): number {
  const t = time.trim().toUpperCase();
  const match = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!match) return 9;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3];
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return hours + minutes / 60;
}

export function formatTime12h(time: string): string {
  const t = time.trim().toUpperCase();
  const match = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!match) return time;
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = match[3];
  if (ampm) return `${hours}:${minutes}${ampm.toLowerCase()}`;
  const period = hours >= 12 ? "pm" : "am";
  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes}${period}`;
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

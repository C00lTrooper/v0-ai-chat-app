/** Parse "9:00 AM" style times to minutes from midnight. */
export function parseTimeToMinutes(time: string | undefined): number | null {
  if (!time) return null;
  const t = time.trim().toUpperCase();
  const match = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3];
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function taskDurationLabel(time: string, endTime?: string): string {
  const s = parseTimeToMinutes(time);
  const e = endTime ? parseTimeToMinutes(endTime) : null;
  if (s == null || e == null || e <= s) return "—";
  const mins = e - s;
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

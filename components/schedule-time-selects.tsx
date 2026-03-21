"use client";

import { parseTimeToHour } from "@/lib/calendar-utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const MINUTE_STEP = 5;
export const MINUTE_OPTIONS = Array.from(
  { length: 60 / MINUTE_STEP },
  (_, i) => i * MINUTE_STEP,
);

export function parseTime24(s: string): { h: number; m: number } | null {
  const t = s?.trim();
  if (!t) return null;
  const match = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const min = parseInt(match[2], 10);
  if (
    Number.isNaN(h) ||
    Number.isNaN(min) ||
    h < 0 ||
    h > 23 ||
    min < 0 ||
    min > 59
  ) {
    return null;
  }
  return { h, m: min };
}

export function formatTime24(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function snapMinuteToStep(m: number, step = MINUTE_STEP): number {
  const s = Math.round(m / step) * step;
  return Math.min(55, Math.max(0, s));
}

export function formatHour12Label(h24: number): string {
  if (h24 === 0) return "12 AM";
  if (h24 < 12) return `${h24} AM`;
  if (h24 === 12) return "12 PM";
  return `${h24 - 12} PM`;
}

/** Convert calendar / WBS time strings (12h or loose) to HH:MM for selects. */
export function timeStrToHHMM(s: string): string {
  const frac = parseTimeToHour(s?.trim() ? s : "9:00 AM");
  const h = Math.floor(frac);
  const m = snapMinuteToStep(Math.round((frac - h) * 60));
  return formatTime24(h, m);
}

export function addOneHourFromTime(hhmm: string): string {
  const p = parseTime24(hhmm);
  if (!p) return "10:00";
  const d = new Date(1970, 0, 1, p.h, p.m, 0, 0);
  d.setHours(d.getHours() + 1);
  return formatTime24(d.getHours(), snapMinuteToStep(d.getMinutes()));
}

/** 24h "HH:MM" → "H:MM AM/PM" for APIs that use normalizeTimeString (rejects 13–23 without AM/PM). */
export function hhmm24ToNormalized12h(hhmm: string): string | null {
  const p = parseTime24(hhmm.trim());
  if (!p) return null;
  const h = p.h;
  const m = p.m;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function ScheduleTimeSelects({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const p = parseTime24(value);
  const h = p?.h ?? 9;
  const m = snapMinuteToStep(p?.m ?? 0);

  return (
    <div className="space-y-2">
      {label ? (
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      ) : null}
      <div className="flex min-w-0 gap-2">
        <Select
          value={String(h)}
          onValueChange={(hv) => {
            const nh = parseInt(hv, 10);
            const cur = parseTime24(value);
            const mm = snapMinuteToStep(cur?.m ?? 0);
            onChange(formatTime24(nh, mm));
          }}
        >
          <SelectTrigger className="h-10 min-w-0 flex-1 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[100] max-h-60">
            {Array.from({ length: 24 }, (_, i) => (
              <SelectItem key={i} value={String(i)}>
                {formatHour12Label(i)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(m)}
          onValueChange={(mv) => {
            const nm = parseInt(mv, 10);
            const cur = parseTime24(value);
            const hh = cur?.h ?? 9;
            onChange(formatTime24(hh, nm));
          }}
        >
          <SelectTrigger className="h-10 w-[104px] shrink-0 bg-background tabular-nums">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[100] max-h-60">
            {MINUTE_OPTIONS.map((min) => (
              <SelectItem key={min} value={String(min)}>
                :{String(min).padStart(2, "0")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

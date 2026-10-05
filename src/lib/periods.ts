import type { Season } from "./constants";
import { PERIOD_ORDER, TIFFIN_AFTER_PERIOD } from "./constants";
import {
  getSchoolDayIndexNow,
  getSchoolToday,
  getZonedParts,
  wallClockToInstant,
  type ZonedParts,
} from "./school-time";

// Durations in minutes (same for summer & winter)
const PERIOD_DURATIONS: Record<number, number> = {
  1: 35,
  2: 40,
  3: 40,
  4: 40,
  5: 45,
  6: 40,
  7: 40,
};
const TIFFIN_DURATION = 20;

// Start times (HH:MM) per season
const SEASON_START: Record<Season, string> = {
  summer: "08:30",
  winter: "09:10",
};

interface TimeBlock {
  label: string; // "Period 1" | "Tiffin"
  periodNumber?: number;
  start: Date;
  end: Date;
  startLabel: string;
  endLabel: string;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Build all blocks for a given day's schedule (relative to midnight reference date). */
export function buildSchedule(season: Season, reference: Date): TimeBlock[] {
  const startMin = toMinutes(SEASON_START[season]);
  const blocks: TimeBlock[] = [];
  let cursor = startMin;

  // The school day is the one in the school's timezone, not the runtime's — on a
  // UTC server that is a different calendar day for six hours out of every 24.
  const day = getZonedParts(reference);

  for (const p of PERIOD_ORDER) {
    const startLabel = formatMinutes(cursor);
    const duration = PERIOD_DURATIONS[p];
    cursor += duration;
    const endLabel = formatMinutes(cursor);
    blocks.push({
      label: `Period ${p}`,
      periodNumber: p,
      start: atMinutes(day, startLabel),
      end: atMinutes(day, endLabel),
      startLabel,
      endLabel,
    });

    if (p === TIFFIN_AFTER_PERIOD) {
      const tStart = formatMinutes(cursor);
      cursor += TIFFIN_DURATION;
      const tEnd = formatMinutes(cursor);
      blocks.push({
        label: "Tiffin",
        start: atMinutes(day, tStart),
        end: atMinutes(day, tEnd),
        startLabel: tStart,
        endLabel: tEnd,
      });
    }
  }

  return blocks;
}

/**
 * The instant at which `hhmm` falls on the school day described by `day`.
 *
 * Deliberately not `date.setHours(...)`: that reads the wall clock of whatever
 * timezone the code happens to run in, which put the bell at 14:30 for a school
 * in UTC+6 whenever the server was UTC.
 */
function atMinutes(day: ZonedParts, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return wallClockToInstant(day.year, day.month, day.day, h * 60 + m);
}

export interface CurrentPeriodResult {
  kind: "before" | "period" | "tiffin" | "after";
  periodNumber?: number;
  timeLabel?: string; // "08:30 - 09:05"
  block?: TimeBlock;
  nextPeriodLabel?: string;
}

/** Determine what is currently happening given a `now` date and season. */
export function getCurrentPeriod(now: Date, season: Season): CurrentPeriodResult {
  // buildSchedule derives the school day from the school's timezone, so the
  // blocks are real instants that `now` can be compared against in any timezone.
  const blocks = buildSchedule(season, now);
  const ms = now.getTime();

  for (const b of blocks) {
    if (ms >= b.start.getTime() && ms < b.end.getTime()) {
      if (b.periodNumber) {
        return {
          kind: "period",
          periodNumber: b.periodNumber,
          timeLabel: `${b.startLabel} - ${b.endLabel}`,
          block: b,
        };
      }
      return {
        kind: "tiffin",
        timeLabel: `${b.startLabel} - ${b.endLabel}`,
        block: b,
      };
    }
  }

  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  if (ms < first.start.getTime()) {
    return { kind: "before", nextPeriodLabel: first.startLabel, block: first };
  }
  return {
    kind: "after",
    nextPeriodLabel: formatMinutes(toMinutes(last.endLabel) + 15),
    block: last,
  };
}

/** Get the end-of-day "after school" threshold so the view can show nothing running. */
export function getSchoolDayWindow(season: Season, reference: Date): {
  start: Date;
  end: Date;
} {
  const blocks = buildSchedule(season, reference);
  return { start: blocks[0].start, end: blocks[blocks.length - 1].end };
}

/**
 * Map a *calendar date* to the school day index. Sunday=0 .. Thursday=4.
 * Returns null for Friday/Saturday.
 *
 * The argument is a date, not an instant: callers build it from a `YYYY-MM-DD`
 * string (`new Date(ymd + "T00:00:00")`), where reading `getDay()` off the local
 * midnight of that date is exactly right.
 *
 * To ask what day *right now* is, use `getSchoolDayIndexNow()` instead. Mixing
 * the two up is what made the public dashboard show one weekday's routine under
 * another weekday's heading: `getDay()` on a bare `new Date()` answers for the
 * server's timezone (UTC in production), not the school's.
 */
export function getSchoolDayIndex(date: Date): number | null {
  const jsDay = date.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
  if (jsDay === 5 || jsDay === 6) return null; // Fri, Sat
  return jsDay; // Sun..Thu already 0..4
}

/**
 * Today's date at the school as YYYY-MM-DD.
 *
 * Anchored to `SCHOOL_TIME_ZONE`, so the server in UTC and the visitor's browser
 * in UTC+6 always agree on the calendar day. Use this rather than
 * `new Date().toISOString()` (UTC) or the bare local getters (wrong server TZ).
 */
export { getSchoolToday, getSchoolDayIndexNow };

/**
 * The date picked in the browser's UI is the single source of truth. Server
 * revalidation trusts it as-is so that planning 2–3 days ahead (or further)
 * lands on exactly the picked date & weekday — not silently coerced to the
 * server's "today".
 */
export function resolveAdjustDate(adjustDate: string): string | null {
  if (!adjustDate) return null;
  return adjustDate;
}

/**
 * Format a *calendar date* Date as "YYYY-MM-DD".
 *
 * Local getters, not `toISOString()`: the value is a date the code constructed at
 * local midnight (`new Date(y, m - 1, d)`) for calendar arithmetic, so reading
 * local fields back is what round-trips. For "what date is it at the school
 * right now", use `getSchoolToday()` instead.
 */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The school week (Sunday..Saturday) containing `reference`.
 *
 * Aligns with the routine model, where `day` 0 is Sunday and 4 is Thursday, so
 * all five teaching days of a week always share one range. This is the window
 * "live class showing" uses: a substitute's cover appears in the weekly grids
 * for the rest of the week it was made in, then disappears on its own.
 *
 * The default reference is "now at the school" rather than the runtime's now, so
 * the Sunday/Saturday edges cannot land on the wrong day when the server is in
 * a different timezone. The arithmetic below is plain calendar maths on that
 * date and is therefore timezone-independent.
 */
export function getSchoolWeekRange(reference?: Date): {
  start: string;
  end: string;
} {
  const parts = getZonedParts(reference);
  const sunday = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day - parts.weekday),
  );
  const saturday = new Date(sunday.getTime() + 6 * 86_400_000);
  const ymd = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { start: ymd(sunday), end: ymd(saturday) };
}

export type { TimeBlock };

/**
 * Single source of truth for "what time is it at the school".
 *
 * Every "today" in this app used to come from plain local-time getters
 * (`getDate()`, `getDay()`). That is only correct when the server happens to run
 * in the school's timezone — and on Vercel `TZ` is unset, so the server is UTC
 * while the school is UTC+6. Between 00:00 and 06:00 local the server's
 * calendar day was one behind, and the public dashboard shipped yesterday's
 * routine rows under today's date.
 *
 * So the zone is pinned here instead of inherited from the runtime, and every
 * date/period calculation goes through this module. The constant is
 * `NEXT_PUBLIC_`-prefixed on purpose: that is the only way Next.js inlines the
 * *same* value into the server bundle and the client bundle, so the HTML the
 * server renders and the period the browser computes can never disagree.
 */
export const SCHOOL_TIME_ZONE =
  process.env.NEXT_PUBLIC_SCHOOL_TIME_ZONE ?? "Asia/Dhaka";

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
  /** 0 = Sunday .. 6 = Saturday */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SCHOOL_TIME_ZONE,
  hourCycle: "h23", // avoids the "24:00" quirk of the default hour cycle
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Split an instant into calendar fields in the school's timezone. */
export function getZonedParts(reference: Date = new Date()): ZonedParts {
  const out: Partial<ZonedParts> = {};
  for (const part of formatter.formatToParts(reference)) {
    if (part.type === "literal") continue;
    if (part.type === "weekday") out.weekday = WEEKDAY_INDEX[part.value] ?? 0;
    else out[part.type as "year" | "month" | "day" | "hour" | "minute" | "second"] =
      Number(part.value);
  }
  return {
    year: out.year ?? 1970,
    month: out.month ?? 1,
    day: out.day ?? 1,
    hour: out.hour ?? 0,
    minute: out.minute ?? 0,
    second: out.second ?? 0,
    weekday: out.weekday ?? 0,
  };
}

/**
 * Milliseconds to add to a UTC instant to get the school's wall clock, i.e.
 * `partsAsIfUtc - instant`. Derived purely from formatted fields so it is
 * correct for any zone, DST transitions included.
 */
function zoneOffsetMs(reference: Date): number {
  const p = getZonedParts(reference);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // formatToParts truncates sub-second precision; drop it from the instant too
  // so the two sides are measured against the same whole second.
  return asIfUtc - Math.floor(reference.getTime() / 1000) * 1000;
}

/**
 * Turn a school's wall-clock time into the real instant it happens.
 *
 * `naive` is the wall clock read as if it were UTC; the zone offset is then
 * subtracted. The first pass uses the offset at the naive instant, the second
 * re-reads the offset at the corrected instant, which is what keeps the answer
 * right across a DST change. (Asia/Dhaka has no DST, but this stays general so
 * a school in a zone that does still works.)
 */
export function wallClockToInstant(
  year: number,
  month: number,
  day: number,
  minutes: number,
): Date {
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0) + minutes * 60_000;
  const firstPass = naive - zoneOffsetMs(new Date(naive));
  const secondPass = naive - zoneOffsetMs(new Date(firstPass));
  return new Date(secondPass);
}

/** Today's date at the school as YYYY-MM-DD. */
export function getSchoolToday(reference?: Date): string {
  const p = getZonedParts(reference);
  const month = String(p.month).padStart(2, "0");
  const day = String(p.day).padStart(2, "0");
  return `${p.year}-${month}-${day}`;
}

/**
 * The current school day index, 0 = Sunday .. 4 = Thursday, or null for the
 * Friday/Saturday weekend.
 *
 * Use this for "now". `getSchoolDayIndex()` in ./periods is the other thing: it
 * maps a *calendar date* to a weekday and is what every date-string caller wants.
 */
export function getSchoolDayIndexNow(reference?: Date): number | null {
  const { weekday } = getZonedParts(reference);
  if (weekday === 5 || weekday === 6) return null; // Fri, Sat
  return weekday; // Sun..Thu already 0..4
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * The school week (Sunday..Saturday) containing the reference instant, as
 * YYYY-MM-DD bounds.
 *
 * Plain calendar arithmetic on the school's own Y/M/D, so no ambient timezone
 * can shift the Sunday or Saturday edge.
 */
export function getSchoolWeekBoundsNow(reference?: Date): {
  start: string;
  end: string;
} {
  const { year, month, day, weekday } = getZonedParts(reference);
  // Days-from-civil style arithmetic in UTC: pure calendar maths, timezone
  // cannot move the result onto a neighbouring day.
  const sunday = new Date(Date.UTC(year, month - 1, day - weekday));
  const saturday = new Date(sunday.getTime() + 6 * 86_400_000);
  const ymd = (d: Date) =>
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  return { start: ymd(sunday), end: ymd(saturday) };
}
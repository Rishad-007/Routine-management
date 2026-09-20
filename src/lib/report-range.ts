import { getTodayLocal } from "./periods";

export type ReportGranularity = "day" | "week" | "month" | "year";

export interface ReportRange {
  granularity: ReportGranularity;
  /** The user-selected anchor date (YYYY-MM-DD) that produced this range. */
  anchor: string;
  start: string;
  end: string;
  label: string;
}

export const REPORT_GRANULARITIES: ReportGranularity[] = [
  "day",
  "week",
  "month",
  "year",
];

export const REPORT_GRANULARITY_LABELS: Record<ReportGranularity, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
  year: "Yearly",
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const JS_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function isValidYmd(s: string | undefined): s is string {
  if (!s) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= lastDayOfMonth(y, mo - 1);
}

/** Add a signed number of days to a YYYY-MM-DD local date. */
export function addDays(anchor: string, delta: number): string {
  const [y, m, d] = anchor.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Move an anchor date by one logical period (for prev/next navigation).
 * Day = +/-1 day, week = +/-7 days, month/year = same day index in adjacent
 * period (clamped to the target month's last day).
 */
export function shiftAnchor(
  anchor: string,
  granularity: ReportGranularity,
  delta: number,
): string {
  if (granularity === "day") return addDays(anchor, delta);
  if (granularity === "week") return addDays(anchor, delta * 7);
  const [y, m, d] = anchor.split("-").map(Number);
  if (granularity === "month") {
    const target = new Date(y, m - 1 + delta, 1);
    const day = Math.min(d, lastDayOfMonth(target.getFullYear(), target.getMonth()));
    const mm = String(target.getMonth() + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${target.getFullYear()}-${mm}-${dd}`;
  }
  return `${y + delta}-01-01`;
}

/** Map a YYYY-MM-DD local date to the school day index (Sun..Thu = 0..4) or null on weekends. */
export function getSchoolDayIndexYmd(ymd: string): number | null {
  const [y, m, d] = ymd.split("-").map(Number);
  const jsDay = new Date(y, m - 1, d).getDay();
  return jsDay < 5 ? jsDay : null;
}

/** Full label like "Sunday, 20 September 2026". */
export function formatFullDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${JS_DAYS[dt.getDay()]}, ${d} ${MONTHS[m - 1]} ${y}`;
}

/** Short label like "Sep 20". */
export function shortLabel(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}`;
}

/**
 * Build the effective report range for a granularity anchored at a local date.
 * Week = the Sunday–Thursday *school week* containing the anchor (a weekend
 * anchor snaps back to that week's Sunday).
 */
export function getReportRange(
  granularity: ReportGranularity,
  anchor: string,
): ReportRange {
  if (granularity === "day") {
    return {
      granularity,
      anchor,
      start: anchor,
      end: anchor,
      label: formatFullDate(anchor),
    };
  }
  const [y, m, d] = anchor.split("-").map(Number);
  if (granularity === "week") {
    const jsDay = new Date(y, m - 1, d).getDay();
    const sunday = addDays(anchor, -jsDay);
    const thursday = addDays(sunday, 4);
    return {
      granularity,
      anchor,
      start: sunday,
      end: thursday,
      label: `${shortLabel(sunday)} – ${shortLabel(thursday)}`,
    };
  }
  if (granularity === "month") {
    const start = `${anchor.slice(0, 7)}-01`;
    const end = `${y}-${String(m).padStart(2, "0")}-${lastDayOfMonth(y, m - 1)}`;
    return {
      granularity,
      anchor,
      start,
      end,
      label: `${MONTHS[m - 1]}, ${y}`,
    };
  }
  return {
    granularity,
    anchor,
    start: `${y}-01-01`,
    end: `${y}-12-31`,
    label: String(y),
  };
}

/** Count school days (Sun–Thu) inside a range. */
export function countSchoolDays(range: ReportRange): number {
  let count = 0;
  let cursor = range.start;
  while (cursor <= range.end) {
    if (getSchoolDayIndexYmd(cursor) !== null) count++;
    cursor = addDays(cursor, 1);
  }
  return Math.max(count, 1);
}

/** Validate URL params and fall back to "this week" / today. */
export function resolveReportParams(
  rawRange?: string,
  rawDate?: string,
): ReportRange {
  const granularity: ReportGranularity = REPORT_GRANULARITIES.includes(
    rawRange as ReportGranularity,
  )
    ? (rawRange as ReportGranularity)
    : "week";
  const anchor = isValidYmd(rawDate) ? (rawDate as string) : getTodayLocal();
  return getReportRange(granularity, anchor);
}
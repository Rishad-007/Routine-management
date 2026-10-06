import { PERIOD_ORDER } from "./constants";
import type { TeacherUnavailabilityRow, UnavailableReason } from "./types";

/**
 * Teacher unavailability helpers.
 *
 * A teacher is unavailable because an admin declared it on a DATE, not because
 * of anything in the weekly routine — so unlike suspension (which filters
 * routine rows and is a purely live overlay), this is a lookup keyed on
 * (date, teacher, period) that sits alongside the index rather than inside it.
 *
 * The two scopes the UI exposes are distinguished only by `is_whole_day`:
 *
 *   is_whole_day = true   out the whole day. Consumed by /admin/adjust,
 *                         /admin/assign, /admin/free-teachers, the absence
 *                         report and the dashboard.
 *   is_whole_day = false  blocked at these periods only. Consumed by
 *                         /admin/adjust alone, the one surface scoped to a
 *                         calendar date. Per-period records are an operational
 *                         note about a single day rather than an absence, so
 *                         they deliberately do not feed the report.
 *
 * Both are written as one row per period (a whole-day save writes all seven),
 * so `isUnavailableAt` answers the same question for either scope and only the
 * consumers that care about the distinction look at the flag.
 *
 * These helpers are pure and safe to import from both server and client code.
 */

/** Human label for a stored reason. */
export const UNAVAILABLE_REASON_LABELS: Record<UnavailableReason, string> = {
  on_leave: "On leave",
  exam_duty: "Exam duty",
  official_work: "Official work",
  other: "Other",
};

export function reasonLabel(reason: string): string {
  return (
    UNAVAILABLE_REASON_LABELS[reason as UnavailableReason] ?? reason ?? "Unavailable"
  );
}

/** One teacher's unavailability at one period on the indexed date. */
export interface UnavailabilityEntry {
  reason: UnavailableReason;
  note: string | null;
  isWholeDay: boolean;
}

/** teacherId -> periodNumber -> entry, for a single date. */
export type UnavailabilityIndex = Map<string, Map<number, UnavailabilityEntry>>;

/**
 * Index every record for one date.
 *
 * Rows for other dates are dropped rather than kept alongside: callers almost
 * always want "for this day", and keeping them would make `isWholeDayUnavailable`
 * report a week-long absence as a single-day one.
 *
 * Returns an empty map when nothing is recorded, and the loop short-circuits
 * before allocating per-teacher maps in that case.
 */
export function unavailabilityIndex(
  rows: TeacherUnavailabilityRow[],
  date: string,
): UnavailabilityIndex {
  const index: UnavailabilityIndex = new Map();
  if (!date) return index;

  for (const row of rows) {
    if (row.absent_date !== date) continue;

    let byPeriod = index.get(row.teacher_id);
    if (!byPeriod) index.set(row.teacher_id, (byPeriod = new Map()));

    byPeriod.set(row.period_number, {
      reason: row.reason,
      note: row.note,
      isWholeDay: row.is_whole_day,
    });
  }

  return index;
}

/**
 * Is this teacher blocked at this period on the indexed date?
 *
 * Answers for BOTH scopes, which is why it does not look at `isWholeDay`: a
 * whole-day save writes all seven periods, so set membership is the whole test.
 * This is the check /admin/adjust gates assignments with.
 */
export function isUnavailableAt(
  index: UnavailabilityIndex,
  teacherId: string,
  period: number,
): boolean {
  return index.get(teacherId)?.has(period) ?? false;
}

/**
 * Is this teacher declared out for the WHOLE day?
 *
 * True if any of their rows for the date carries the flag. Checking `some`
 * rather than "all seven present" is deliberate: `is_whole_day` records the
 * admin's intent, and treating a partially-written save as a per-period one
 * would hide a declared absence from every surface except /admin/adjust.
 *
 * Callers wanting only this scope (the report, the dashboard, /admin/assign,
 * /admin/free-teachers) must use this and never `isUnavailableAt`, or
 * per-period records would leak into surfaces you chose to exclude them from.
 */
export function isWholeDayUnavailable(
  index: UnavailabilityIndex,
  teacherId: string,
): boolean {
  const byPeriod = index.get(teacherId);
  if (!byPeriod) return false;
  for (const entry of byPeriod.values()) {
    if (entry.isWholeDay) return true;
  }
  return false;
}

/** First recorded entry for a teacher on the indexed date, for badge text. */
export function unavailableEntry(
  index: UnavailabilityIndex,
  teacherId: string,
): UnavailabilityEntry | null {
  const byPeriod = index.get(teacherId);
  if (!byPeriod || byPeriod.size === 0) return null;
  return byPeriod.values().next().value ?? null;
}

/** Sorted period numbers a teacher is blocked at on the indexed date. */
export function unavailablePeriods(
  index: UnavailabilityIndex,
  teacherId: string,
): number[] {
  const byPeriod = index.get(teacherId);
  if (!byPeriod) return [];
  return PERIOD_ORDER.filter((p) => byPeriod.has(p));
}

/**
 * Ids of every teacher with any record on the indexed date.
 *
 * Includes per-period records. Use only where the whole day/any period
 * distinction does not matter — the /admin/adjust substitute sheet, where both
 * scopes apply.
 */
export function unavailableTeacherIds(
  index: UnavailabilityIndex,
): Set<string> {
  return new Set(index.keys());
}

/**
 * Ids of every teacher declared out for the WHOLE day on the indexed date.
 *
 * The only scope the absence report, the dashboard, /admin/assign and
 * /admin/free-teachers honour.
 */
export function wholeDayTeacherIds(index: UnavailabilityIndex): Set<string> {
  const ids = new Set<string>();
  for (const teacherId of index.keys()) {
    if (isWholeDayUnavailable(index, teacherId)) ids.add(teacherId);
  }
  return ids;
}

/**
 * Resolve a weekday (0=Sun .. 4=Thu) to its date inside a Sunday-anchored week.
 *
 * /admin/assign and /admin/free-teachers are per-weekday with no date picker,
 * while unavailability is per calendar date, so both anchor the weekday to the
 * current school week. Kept here rather than at the call sites so the two
 * surfaces cannot disagree about where the date comes from.
 */
export function weekDateForDay(weekStart: string, day: number): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const date = new Date(y, m - 1, d + day);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dom = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dom}`;
}

/**
 * `teacherId -> period -> tooltip` for one calendar date's routine coverage.
 *
 * A period is absent from a teacher's map exactly when they are free then, so
 * the presence of the key is the busy signal and there is no second structure to
 * keep in sync. Built on the server by the Mark Unavailable page and read there
 * by `<PeriodStrip>` to show which of a teacher's periods are real classes —
 * i.e. which ones a declaration actually leaves uncovered.
 *
 * Plain objects rather than a Map because it crosses the RSC boundary, where
 * only serializable values survive.
 */
export type BusyLabels = Record<string, Record<number, string>>;

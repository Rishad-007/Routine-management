import { TIFFIN_AFTER_PERIOD } from "./constants";
import {
  getSchoolWeekRange,
  getSchoolToday,
} from "./periods";
import type { AdjustmentRow, RoutineRow } from "./types";

export type WarningLevel = "yellow" | "red" | "ok";

/** Apply date-scoped substitutions to a weekly routine snapshot. */
export function applyAdjustmentsToRoutines(
  routines: RoutineRow[],
  adjustments: AdjustmentRow[],
  adjustDate: string,
): RoutineRow[] {
  const byCell = new Map(
    adjustments
      .filter((a) => a.adjust_date === adjustDate)
      .map((a) => [`${a.section_id}:${a.period_number}:${a.is_tag}`, a]),
  );

  return routines.map((routine) => {
    const adjustment = byCell.get(
      `${routine.section_id}:${routine.period_number}:${routine.is_tag}`,
    );
    if (!adjustment?.new_teacher_id) return routine;
    return { ...routine, teacher_id: adjustment.new_teacher_id };
  });
}

/** School week (Sunday..Saturday) that an adjustment belongs to, as YYYY-MM-DD. */
function weekBoundsFor(adjustDate: string): { start: string; end: string } {
  const [y, m, d] = adjustDate.split("-").map(Number);
  return getSchoolWeekRange(new Date(y, m - 1, d));
}

/** Day-of-week (0=Sun..4=Thu) for an adjustment's date, or null at a weekend. */
function dayOfAdjustment(adjustDate: string): number | null {
  const [y, m, d] = adjustDate.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow > 4 ? null : dow;
}

/**
 * Overlay every substitution in a school week onto the weekly routine.
 *
 * The key includes the routine's `day`, which `applyAdjustmentsToRoutines`
 * above omits. That omission is why both of its callers had to pre-filter the
 * week down to a single weekday before calling it: with a dayless key the same
 * section+period matched on every weekday and one Wednesday cover silently
 * rewrote the Monday, Tuesday and Thursday slots too. Keying on day makes a
 * whole-week application correct, which is what live class showing needs.
 *
 * Each adjustment is placed on the weekday its date actually falls on, so a
 * cover made for Tuesday shows in the Tuesday column and leaves every other
 * column on its base routine. Friday and Saturday are skipped outright (see
 * `dayOfAdjustment` below), since the school week is Sunday..Thursday.
 *
 * Also honours `new_subject_id` / `new_room_id`. The single-date version above
 * only swapped `teacher_id`, so a subject-only or room-only adjustment rendered
 * differently here than in the public grids, which do honour them.
 *
 * Swapped rows are stamped `is_adjusted: true` plus `original_teacher_id`,
 * because the `routines` view hardcodes both to false/null — without a
 * provenance marker nothing downstream can tell a real weekly class from a
 * temporary cover.
 */
export function applyWeekAdjustmentsToRoutines(
  routines: RoutineRow[],
  adjustments: AdjustmentRow[],
  reference?: Date,
): RoutineRow[] {
  const bounds = reference
    ? getSchoolWeekRange(reference)
    : weekBoundsFor(getSchoolToday());

  const byCell = new Map<string, AdjustmentRow>();
  for (const a of adjustments) {
    if (a.adjust_date < bounds.start || a.adjust_date > bounds.end) continue;
    const dow = dayOfAdjustment(a.adjust_date);
    if (dow === null) continue;
    byCell.set(`${a.section_id}:${dow}:${a.period_number}:${a.is_tag}`, a);
  }

  if (byCell.size === 0) return routines;

  return routines.map((routine) => {
    const adjustment = byCell.get(
      `${routine.section_id}:${routine.day}:${routine.period_number}:${routine.is_tag}`,
    );
    if (!adjustment) return routine;

    const changes: Partial<RoutineRow> = { is_adjusted: true };
    if (adjustment.new_teacher_id) {
      changes.teacher_id = adjustment.new_teacher_id;
      changes.original_teacher_id = routine.teacher_id;
    }
    if (adjustment.new_subject_id) changes.subject_id = adjustment.new_subject_id;
    if (adjustment.new_room_id) changes.room_id = adjustment.new_room_id;

    return { ...routine, ...changes };
  });
}

export interface TeacherDayLoad {
  teacherId: string;
  day: number;
  periodCount: number;
  consecutiveStretch: number;
  level: WarningLevel;
  reasons: string[];
}

/** Returns the count of distinct periods a teacher has on a given day. */
export function countDayPeriods(
  routines: RoutineRow[],
  teacherId: string,
  day: number,
): number {
  const periods = new Set(
    routines
      .filter((r) => r.day === day && r.teacher_id === teacherId)
      .map((r) => r.period_number),
  );
  return periods.size;
}

/** Longest consecutive run of periods for a teacher on a day (tiffin breaks continuity). */
export function longestConsecutiveStretch(
  routines: RoutineRow[],
  teacherId: string,
  day: number,
): number {
  const periods = [
    ...new Set(
      routines
        .filter((r) => r.day === day && r.teacher_id === teacherId)
        .map((r) => r.period_number),
    ),
  ].sort((a, b) => a - b);

  let best = 0;
  let run = 0;
  let prev = 0;
  for (const p of periods) {
    // period 4 -> 5 has a tiffin gap, so it resets the run
    const contiguous =
      run > 0 && p === prev + 1 && p !== TIFFIN_AFTER_PERIOD + 1;
    run = contiguous ? run + 1 : 1;
    prev = p;
    if (run > best) best = run;
  }
  return best;
}

/**
 * Grade a day's load.
 * Yellow: continuous 3 periods OR 5 total in a day.
 * Red: continuous 4 periods OR 6 total in a day.
 *
 * Shared by the scanning and the indexed variants so the two can never drift.
 */
function gradeDayLoad(
  periodCount: number,
  consecutiveStretch: number,
): { level: WarningLevel; reasons: string[] } {
  let level: WarningLevel = "ok";
  const reasons: string[] = [];

  if (consecutiveStretch >= 4) {
    level = "red";
    reasons.push(`Continuous ${consecutiveStretch} periods`);
  } else if (consecutiveStretch >= 3) {
    level = "yellow";
    reasons.push(`Continuous ${consecutiveStretch} periods`);
  }

  if (periodCount >= 6) {
    level = "red";
    reasons.push(`${periodCount} periods in a day`);
  } else if (periodCount >= 5 && level !== "red") {
    level = "yellow";
    reasons.push(`${periodCount} periods in a day`);
  }

  return { level, reasons };
}

/** Compute load + warning level for a teacher on a day. */
export function teacherDayLoad(
  routines: RoutineRow[],
  teacherId: string,
  day: number,
): TeacherDayLoad {
  const periodCount = countDayPeriods(routines, teacherId, day);
  const consecutiveStretch = longestConsecutiveStretch(
    routines,
    teacherId,
    day,
  );
  const { level, reasons } = gradeDayLoad(periodCount, consecutiveStretch);
  return { teacherId, day, periodCount, consecutiveStretch, level, reasons };
}

/**
 * Check if a teacher is already assigned to a given day+period in ANY section.
 * (Excludes an optional routine id, e.g. the cell being edited.)
 */
export function isTeacherBusy(
  routines: RoutineRow[],
  teacherId: string,
  day: number,
  period: number,
  excludeRoutineId?: string,
): boolean {
  return routines.some(
    (r) =>
      r.teacher_id === teacherId &&
      r.day === day &&
      r.period_number === period &&
      r.id !== excludeRoutineId,
  );
}

// ---------------------------------------------------------------------------
// Indexed variants
//
// The scanning helpers above each walk the whole routine array. Screens that
// ask about all 167 teachers across 7 periods therefore do millions of row
// visits per render — fine at the 1000 rows the old truncated reads returned,
// noticeably slow now that reads are complete (3000+). These build the same
// answers from a single pass and then answer in O(1).
// ---------------------------------------------------------------------------

export interface RoutineIndex {
  /** "day:period" -> ids of teachers occupying it (primary AND tag). */
  busyAt: Map<string, Set<string>>;
  /**
   * "day:period" -> ids of teachers occupying it ONLY because of a
   * substitution (rows stamped `is_adjusted` by applyWeekAdjustmentsToRoutines).
   *
   * Lets the UI answer "is this teacher genuinely free, or only holding a
   * one-week cover?" — the whole point of live class showing. Purely
   * presentational: `busyAt` stays authoritative for double-booking checks, so
   * nothing here can let a substitute be double-booked.
   */
  adjustedAt: Map<string, Set<string>>;
  /** teacherId -> day -> distinct period numbers taught. */
  byTeacherDay: Map<string, Map<number, Set<number>>>;
  /** teacherId -> distinct (day, period) cells across the week. */
  weeklyTotal: Map<string, number>;
}

/** Index a routine snapshot in one pass. */
export function buildRoutineIndex(routines: RoutineRow[]): RoutineIndex {
  const busyAt = new Map<string, Set<string>>();
  const adjustedAt = new Map<string, Set<string>>();
  const byTeacherDay = new Map<string, Map<number, Set<number>>>();

  for (const r of routines) {
    if (!r.teacher_id) continue;

    const cell = `${r.day}:${r.period_number}`;
    let occupants = busyAt.get(cell);
    if (!occupants) busyAt.set(cell, (occupants = new Set()));
    occupants.add(r.teacher_id);

    if (r.is_adjusted) {
      let covers = adjustedAt.get(cell);
      if (!covers) adjustedAt.set(cell, (covers = new Set()));
      covers.add(r.teacher_id);
    }

    let days = byTeacherDay.get(r.teacher_id);
    if (!days) byTeacherDay.set(r.teacher_id, (days = new Map()));
    let periods = days.get(r.day);
    if (!periods) days.set(r.day, (periods = new Set()));
    periods.add(r.period_number);
  }

  const weeklyTotal = new Map<string, number>();
  for (const [teacherId, days] of byTeacherDay) {
    let total = 0;
    for (const periods of days.values()) total += periods.size;
    weeklyTotal.set(teacherId, total);
  }

  return { busyAt, adjustedAt, byTeacherDay, weeklyTotal };
}

/** Is this teacher holding the cell because of a substitution rather than their own class? */
export function isCoveringIndexed(
  index: RoutineIndex,
  teacherId: string,
  day: number,
  period: number,
): boolean {
  return index.adjustedAt.get(`${day}:${period}`)?.has(teacherId) ?? false;
}

/** Indexed `isTeacherBusy`. Tag sessions count as busy, matching the DB trigger. */
export function isBusyIndexed(
  index: RoutineIndex,
  teacherId: string,
  day: number,
  period: number,
): boolean {
  return index.busyAt.get(`${day}:${period}`)?.has(teacherId) ?? false;
}

/** Indexed `countDayPeriods`. */
export function dayCountIndexed(
  index: RoutineIndex,
  teacherId: string,
  day: number,
): number {
  return index.byTeacherDay.get(teacherId)?.get(day)?.size ?? 0;
}

/** Shared empty set so the common "no classes that day" case allocates nothing. */
const NO_PERIODS: ReadonlySet<number> = new Set();

/**
 * Indexed set of periods a teacher occupies on a given day.
 *
 * Tag sessions are included, matching `isBusyIndexed` and the DB trigger, so a
 * grid built from this can never contradict the double-booking check. O(1): it
 * reads the index built once in `buildRoutineIndex` rather than rescanning
 * routines per teacher.
 *
 * Treat the result as read-only. The empty case is a shared instance, so a
 * caller that mutated it would corrupt the answer for every other teacher.
 */
export function busyPeriodsIndexed(
  index: RoutineIndex,
  teacherId: string,
  day: number,
): ReadonlySet<number> {
  return index.byTeacherDay.get(teacherId)?.get(day) ?? NO_PERIODS;
}

/** Indexed `longestConsecutiveStretch` — same tiffin rule. */
export function stretchIndexed(
  index: RoutineIndex,
  teacherId: string,
  day: number,
): number {
  const set = index.byTeacherDay.get(teacherId)?.get(day);
  if (!set) return 0;
  const periods = [...set].sort((a, b) => a - b);

  let best = 0;
  let run = 0;
  let prev = 0;
  for (const p of periods) {
    // period 4 -> 5 has a tiffin gap, so it resets the run
    const contiguous =
      run > 0 && p === prev + 1 && p !== TIFFIN_AFTER_PERIOD + 1;
    run = contiguous ? run + 1 : 1;
    prev = p;
    if (run > best) best = run;
  }
  return best;
}

/** Indexed `teacherDayLoad`. */
export function teacherDayLoadIndexed(
  index: RoutineIndex,
  teacherId: string,
  day: number,
): TeacherDayLoad {
  const periodCount = dayCountIndexed(index, teacherId, day);
  const consecutiveStretch = stretchIndexed(index, teacherId, day);
  const { level, reasons } = gradeDayLoad(periodCount, consecutiveStretch);
  return { teacherId, day, periodCount, consecutiveStretch, level, reasons };
}

/** Indexed `allTeacherLoads` — same shape, one pass instead of O(teachers x days x rows). */
export function allTeacherLoadsIndexed(
  index: RoutineIndex,
): Map<string, TeacherDayLoad[]> {
  const map = new Map<string, TeacherDayLoad[]>();
  for (const [teacherId, days] of index.byTeacherDay) {
    const loads: TeacherDayLoad[] = [];
    for (const day of days.keys()) {
      loads.push(teacherDayLoadIndexed(index, teacherId, day));
    }
    map.set(teacherId, loads);
  }
  return map;
}

/** Aggregate load map for all teachers across the routine set. */
export function allTeacherLoads(
  routines: RoutineRow[],
): Map<string, TeacherDayLoad[]> {
  const map = new Map<string, TeacherDayLoad[]>();
  const teachers = new Set(routines.map((r) => r.teacher_id).filter(Boolean));
  for (const t of Array.from(teachers)) {
    if (!t) continue;
    const days = new Set(
      routines.filter((r) => r.teacher_id === t).map((r) => r.day),
    );
    const loads: TeacherDayLoad[] = [];
    for (const d of Array.from(days)) {
      loads.push(teacherDayLoad(routines, t, d));
    }
    map.set(t, loads);
  }
  return map;
}

export interface AssignmentSimulation {
  level: "ok" | "yellow" | "red";
  reasons: string[];
  count: number;
  stretch: number;
}

/**
 * Simulate a teacher taking a day+period.
 *
 * Replaces whatever currently occupies the cell for that section
 * (identified by sectionId+day+period+isTag) and inserts the candidate into it,
 * then grades the result:
 *
 * - busy: the candidate already teaches another section at day+period
 *   (hard block, cannot be force-approved).
 * - day load: red when the teacher ALREADY has 5 classes that day, yellow at 4.
 * - continuous: yellow when the new class makes a run of 3, red at 4 or more.
 *   Tiffin (after period 4) breaks runs, so a pre-tiffin class never joins a
 *   post-tiffin one.
 *
 * `count`/`stretch` returned are the true POST-assignment projections.
 */
export function simulateTeacherAssignment(
  routines: RoutineRow[],
  teacherId: string,
  day: number,
  period: number,
  excludeSectionId?: string,
  isTag = false,
): AssignmentSimulation {
  const existingCell = routines.find(
    (r) =>
      r.day === day &&
      r.period_number === period &&
      r.is_tag === isTag &&
      (excludeSectionId ? r.section_id === excludeSectionId : true) &&
      r.teacher_id !== teacherId,
  );

  const simulated = routines.filter(
    (r) =>
      !(
        r.day === day &&
        r.period_number === period &&
        r.is_tag === isTag &&
        r.section_id === existingCell?.section_id
      ),
  );

  const inserted: RoutineRow = {
    id: "simulated",
    section_id: existingCell?.section_id ?? excludeSectionId ?? "",
    day,
    period_number: period,
    teacher_id: teacherId,
    subject_id: existingCell?.subject_id ?? null,
    room_id: existingCell?.room_id ?? null,
    is_tag: isTag,
    is_adjusted: false,
    original_teacher_id: null,
  };
  simulated.push(inserted);

  const count = countDayPeriods(simulated, teacherId, day);
  const stretch = longestConsecutiveStretch(simulated, teacherId, day);
  const busy = isTeacherBusy(simulated, teacherId, day, period, inserted.id);

  const reasons: string[] = [];

  if (busy) {
    reasons.push("Teacher already assigned elsewhere at this period");
  }

  // Load rule grades against the ALREADY-assigned count (the day the teacher
  // had before this class). count - 1 excludes the projected row.
  const alreadyAssigned = count - 1;
  if (alreadyAssigned >= 5) {
    reasons.push(`${alreadyAssigned} classes already that day`);
  } else if (alreadyAssigned === 4) {
    reasons.push(`${alreadyAssigned} classes already that day`);
  }

  // Continuous rule grades the projected run.
  if (stretch >= 4) {
    reasons.push(`Would have ${stretch} consecutive periods`);
  } else if (stretch === 3) {
    reasons.push(`Would have ${stretch} consecutive periods`);
  }

  const isRed = busy || alreadyAssigned >= 5 || stretch >= 4;
  const isYellow = !isRed && (alreadyAssigned === 4 || stretch === 3);

  const level: "ok" | "yellow" | "red" = isRed
    ? "red"
    : isYellow
      ? "yellow"
      : "ok";

  return { level, reasons, count, stretch };
}

export interface WeeklyLoad {
  teacherId: string;
  perDay: Record<number, number>;
  total: number;
  todayLevels: WarningLevel[];
}

/** Weekly + per-day load summary for a teacher (useful for the assignment sidebar). */
export function weeklyLoad(
  routines: RoutineRow[],
  teacherId: string,
): WeeklyLoad {
  const perDay: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  const countedPeriods = new Map<number, Set<number>>();
  for (const r of routines) {
    if (r.teacher_id === teacherId) {
      if (!countedPeriods.has(r.day)) countedPeriods.set(r.day, new Set());
      const periods = countedPeriods.get(r.day)!;
      if (!periods.has(r.period_number)) {
        periods.add(r.period_number);
        perDay[r.day] = (perDay[r.day] ?? 0) + 1;
      }
    }
  }
  const total = Object.values(perDay).reduce((a, b) => a + b, 0);
  const todayLevels = [0, 1, 2, 3, 4].map(
    (d) => teacherDayLoad(routines, teacherId, d).level,
  );
  return { teacherId, perDay, total, todayLevels };
}

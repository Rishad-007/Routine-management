import { TIFFIN_AFTER_PERIOD } from "./constants";
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
  /** teacherId -> day -> distinct period numbers taught. */
  byTeacherDay: Map<string, Map<number, Set<number>>>;
  /** teacherId -> distinct (day, period) cells across the week. */
  weeklyTotal: Map<string, number>;
}

/** Index a routine snapshot in one pass. */
export function buildRoutineIndex(routines: RoutineRow[]): RoutineIndex {
  const busyAt = new Map<string, Set<string>>();
  const byTeacherDay = new Map<string, Map<number, Set<number>>>();

  for (const r of routines) {
    if (!r.teacher_id) continue;

    const cell = `${r.day}:${r.period_number}`;
    let occupants = busyAt.get(cell);
    if (!occupants) busyAt.set(cell, (occupants = new Set()));
    occupants.add(r.teacher_id);

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

  return { busyAt, byTeacherDay, weeklyTotal };
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

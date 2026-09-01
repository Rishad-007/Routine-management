import { TIFFIN_AFTER_PERIOD } from "./constants";
import type { RoutineRow } from "./types";

export type WarningLevel = "yellow" | "red" | "ok";

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
  day: number
): number {
  const periods = new Set(
    routines
      .filter((r) => r.day === day && r.teacher_id === teacherId)
      .map((r) => r.period_number)
  );
  return periods.size;
}

/** Longest consecutive run of periods for a teacher on a day (tiffin breaks continuity). */
export function longestConsecutiveStretch(
  routines: RoutineRow[],
  teacherId: string,
  day: number
): number {
  const periods = [...new Set(
    routines
      .filter((r) => r.day === day && r.teacher_id === teacherId)
      .map((r) => r.period_number)
  )].sort((a, b) => a - b);

  let best = 0;
  let run = 0;
  let prev = 0;
  for (const p of periods) {
    // period 4 -> 5 has a tiffin gap, so it resets the run
    const contiguous = run > 0 && p === prev + 1 && p !== TIFFIN_AFTER_PERIOD + 1;
    run = contiguous ? run + 1 : 1;
    prev = p;
    if (run > best) best = run;
  }
  return best;
}

/**
 * Compute load + warning level for a teacher on a day.
 * Yellow: continuous 3 periods OR 5 total in a day.
 * Red: continuous 4 periods OR 6 total in a day.
 */
export function teacherDayLoad(
  routines: RoutineRow[],
  teacherId: string,
  day: number
): TeacherDayLoad {
  const periodCount = countDayPeriods(routines, teacherId, day);
  const consecutiveStretch = longestConsecutiveStretch(routines, teacherId, day);

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
  excludeRoutineId?: string
): boolean {
  return routines.some(
    (r) =>
      r.teacher_id === teacherId &&
      r.day === day &&
      r.period_number === period &&
      r.id !== excludeRoutineId
  );
}

/** Aggregate load map for all teachers across the routine set. */
export function allTeacherLoads(
  routines: RoutineRow[]
): Map<string, TeacherDayLoad[]> {
  const map = new Map<string, TeacherDayLoad[]>();
  const teachers = new Set(routines.map((r) => r.teacher_id).filter(Boolean));
  for (const t of Array.from(teachers)) {
    if (!t) continue;
    const days = new Set(routines.filter((r) => r.teacher_id === t).map((r) => r.day));
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
 * Simulate assigning a teacher to a day+period.
 * Removes any existing assignment at that cell (identified by sectionId+day+period)
 * and inserts the new one, then checks the adjusted thresholds.
 *
 * Thresholds (teacher-first adjust):
 * - yellow: >= 4 periods that day, OR creates 3-consecutive, OR teacher is busy at day+period
 * - red: >= 5 periods that day, OR creates 4-consecutive
 */
export function simulateTeacherAssignment(
  routines: RoutineRow[],
  teacherId: string,
  day: number,
  period: number,
  excludeSectionId?: string
): AssignmentSimulation {
  const existingCell = routines.find(
    (r) =>
      r.day === day &&
      r.period_number === period &&
      (excludeSectionId ? r.section_id === excludeSectionId : true) &&
      r.teacher_id !== teacherId
  );

  const simulated = routines.filter(
    (r) => !(r.day === day && r.period_number === period && r.section_id === existingCell?.section_id)
  );

  const count = countDayPeriods(simulated, teacherId, day);
  const stretch = longestConsecutiveStretch(simulated, teacherId, day);
  const busy = isTeacherBusy(simulated, teacherId, day, period);

  const reasons: string[] = [];

  if (busy) {
    reasons.push("Teacher already assigned elsewhere at this period");
  }

  if (count >= 5) {
    reasons.push(`${count + 1} periods that day (exceeds safe limit)`);
  } else if (count >= 4) {
    reasons.push(`${count + 1} periods that day`);
  }

  if (stretch >= 4) {
    reasons.push(`Would create ${stretch + 1} consecutive periods`);
  } else if (stretch >= 3) {
    reasons.push(`Would create ${stretch + 1} consecutive periods`);
  }

  const isRed = busy || count >= 5 || stretch >= 4;
  const isYellow = !isRed && (count >= 4 || stretch >= 3);

  const level: "ok" | "yellow" | "red" = isRed ? "red" : isYellow ? "yellow" : "ok";

  return { level, reasons, count: count + 1, stretch: stretch + 1 };
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
  teacherId: string
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
  const todayLevels = [0, 1, 2, 3, 4].map((d) =>
    teacherDayLoad(routines, teacherId, d).level
  );
  return { teacherId, perDay, total, todayLevels };
}

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

/** Returns the count of periods a teacher has on a given day. */
export function countDayPeriods(
  routines: RoutineRow[],
  teacherId: string,
  day: number
): number {
  return routines.filter(
    (r) => r.day === day && r.teacher_id === teacherId
  ).length;
}

/** Longest consecutive run of periods for a teacher on a day (tiffin breaks continuity). */
export function longestConsecutiveStretch(
  routines: RoutineRow[],
  teacherId: string,
  day: number
): number {
  const periods = routines
    .filter((r) => r.day === day && r.teacher_id === teacherId)
    .map((r) => r.period_number)
    .sort((a, b) => a - b);

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
  let total = 0;
  for (const r of routines) {
    if (r.teacher_id === teacherId) {
      perDay[r.day] = (perDay[r.day] ?? 0) + 1;
      total++;
    }
  }
  const todayLevels = [0, 1, 2, 3, 4].map((d) =>
    teacherDayLoad(routines, teacherId, d).level
  );
  return { teacherId, perDay, total, todayLevels };
}

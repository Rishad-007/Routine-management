import { DAY_ORDER, PERIOD_ORDER, TIFFIN_AFTER_PERIOD } from "./constants";

export interface RoutinePreviewSourceRow {
  teacher_id: string | null;
  day: number;
  period_number: number;
  section_id: string;
  subject_id: string | null;
  room_id: string | null;
  is_tag: boolean;
  /**
   * Set when this row is occupied by a substitution rather than the teacher's
   * own weekly class (see applyWeekAdjustmentsToRoutines). Optional so callers
   * that pass raw un-overlaid routines — the base routine editor, for one — keep
   * working unchanged.
   */
  is_adjusted?: boolean;
  original_teacher_id?: string | null;
}

export interface TeacherRoutinePreviewCell {
  period: number;
  subject: string;
  classLabel: string;
  room: string;
  isTag: boolean;
  continuous: number;
  /** This cell is a temporary cover, not part of the base weekly routine. */
  isAdjusted: boolean;
  /** Name of the displaced teacher, when resolvable. */
  originalTeacherName: string;
  /** Label such as "P3 · Wed" for the cover's tooltip. */
  coveringFor: string;
}

export interface TeacherRoutinePreview {
  cells: Map<string, TeacherRoutinePreviewCell>;
  daily: { count: number; continuous: number }[];
  total: number;
  longest: number;
}

export interface BuildTeacherRoutinePreviewOptions {
  routines: RoutinePreviewSourceRow[];
  teacherId: string;
  subjectLabel: (subjectId: string) => string;
  sectionLabel: (sectionId: string) => string;
  roomLabel: (roomId: string) => string;
  /** Names displaced teachers so a cover can be labelled "covering for X". */
  teacherLabel?: (teacherId: string) => string;
}

/**
 * Build the weekly (Sun–Thu × P1–P7) routine grid for one teacher, including
 * continuous-run detection (tiffin separates runs). Used by the admin "Adjust
 * Routine" and "Free Teachers" dialogs so both come from a single source.
 *
 * Rows are expected to be pre-overlaid (applyWeekAdjustmentsToRoutines) for the
 * substitute's covered class to appear at all; `is_adjusted` then distinguishes
 * a one-week cover from the teacher's own recurring class.
 */
export function buildTeacherRoutinePreview({
  routines,
  teacherId,
  subjectLabel,
  sectionLabel,
  roomLabel,
  teacherLabel,
}: BuildTeacherRoutinePreviewOptions): TeacherRoutinePreview {
  const cells = new Map<string, TeacherRoutinePreviewCell>();

  for (const day of DAY_ORDER) {
    const dayRows = routines.filter(
      (r) => r.teacher_id === teacherId && r.day === day,
    );
    const teacherPeriods = new Set(dayRows.map((r) => r.period_number));

    // Prefer the primary row, but fall back to the tag row. A plain `find()`
    // used to take whichever arrived first, so when a teacher held both roles
    // in the same cell the adjusted tag cover could be dropped entirely and the
    // dialog disagreed with the grid.
    const rowAt = (period: number) =>
      dayRows.find((r) => r.period_number === period && !r.is_tag) ??
      dayRows.find((r) => r.period_number === period);

    for (const period of PERIOD_ORDER) {
      const routine = rowAt(period);
      if (!routine) continue;

      let continuous = 1;
      for (
        let previous = period - 1;
        teacherPeriods.has(previous) && previous !== TIFFIN_AFTER_PERIOD;
        previous -= 1
      ) {
        continuous += 1;
      }
      for (
        let next = period + 1;
        teacherPeriods.has(next) && next !== TIFFIN_AFTER_PERIOD + 1;
        next += 1
      ) {
        continuous += 1;
      }

      const originalName =
        routine.original_teacher_id && teacherLabel
          ? teacherLabel(routine.original_teacher_id)
          : "";

      cells.set(`${day}:${period}`, {
        period,
        subject: routine.subject_id ? subjectLabel(routine.subject_id) : "—",
        classLabel: sectionLabel(routine.section_id),
        room: routine.room_id ? roomLabel(routine.room_id) : "—",
        isTag: routine.is_tag,
        continuous,
        isAdjusted: !!routine.is_adjusted,
        originalTeacherName: originalName,
        coveringFor: originalName
          ? `Temporary cover for ${originalName} — not part of their weekly routine.`
          : "Temporary adjustment — not part of the weekly routine.",
      });
    }
  }

  const daily = DAY_ORDER.map((day) => {
    const periods = PERIOD_ORDER.filter((period) =>
      cells.has(`${day}:${period}`),
    );
    return {
      count: periods.length,
      continuous: Math.max(
        0,
        ...periods.map(
          (period) => cells.get(`${day}:${period}`)?.continuous ?? 0,
        ),
      ),
    };
  });

  return {
    cells,
    daily,
    total: daily.reduce((sum, item) => sum + item.count, 0),
    longest: Math.max(0, ...daily.map((item) => item.continuous)),
  };
}
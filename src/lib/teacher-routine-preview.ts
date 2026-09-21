import { DAY_ORDER, PERIOD_ORDER, TIFFIN_AFTER_PERIOD } from "./constants";

export interface RoutinePreviewSourceRow {
  teacher_id: string | null;
  day: number;
  period_number: number;
  section_id: string;
  subject_id: string | null;
  room_id: string | null;
  is_tag: boolean;
}

export interface TeacherRoutinePreviewCell {
  period: number;
  subject: string;
  classLabel: string;
  room: string;
  isTag: boolean;
  continuous: number;
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
}

/**
 * Build the weekly (Sun–Thu × P1–P7) routine grid for one teacher, including
 * continuous-run detection (tiffin separates runs). Used by the admin "Adjust
 * Routine" and "Free Teachers" dialogs so both come from a single source.
 */
export function buildTeacherRoutinePreview({
  routines,
  teacherId,
  subjectLabel,
  sectionLabel,
  roomLabel,
}: BuildTeacherRoutinePreviewOptions): TeacherRoutinePreview {
  const cells = new Map<string, TeacherRoutinePreviewCell>();

  for (const day of DAY_ORDER) {
    const teacherPeriods = new Set(
      routines
        .filter((r) => r.teacher_id === teacherId && r.day === day)
        .map((r) => r.period_number),
    );

    for (const period of PERIOD_ORDER) {
      const routine = routines.find(
        (r) =>
          r.teacher_id === teacherId &&
          r.day === day &&
          r.period_number === period,
      );
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

      cells.set(`${day}:${period}`, {
        period,
        subject: routine.subject_id ? subjectLabel(routine.subject_id) : "—",
        classLabel: sectionLabel(routine.section_id),
        room: routine.room_id ? roomLabel(routine.room_id) : "—",
        isTag: routine.is_tag,
        continuous,
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
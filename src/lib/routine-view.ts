import "server-only";
import type {
  RoutineRow,
  TeacherRow,
  SubjectRow,
  RoomRow,
  SectionRow,
  ClassRow,
} from "./types";
import type { RoutineMatrix } from "@/components/routine/routine-grid";

export interface RoutineLookups {
  teachers: TeacherRow[];
  subjects: SubjectRow[];
  rooms: RoomRow[];
}

/** Build a Day(0-4) x Period(1-7) matrix for a given section. */
export function buildSectionMatrix(
  routines: RoutineRow[],
  sectionId: string,
  lookups: RoutineLookups
): RoutineMatrix {
  const matrix: RoutineMatrix = {};
  const teacherName = (id: string | null) =>
    id ? lookups.teachers.find((t) => t.id === id)?.short_name : undefined;
  const subjectName = (id: string | null) =>
    id ? lookups.subjects.find((s) => s.id === id)?.name : undefined;
  const subjectShort = (id: string | null) =>
    id ? lookups.subjects.find((s) => s.id === id)?.short_name : undefined;
  const roomName = (id: string | null) =>
    id ? lookups.rooms.find((r) => r.id === id)?.name : undefined;

  for (const r of routines) {
    if (r.section_id !== sectionId) continue;
    if (!matrix[r.day]) matrix[r.day] = {};
    matrix[r.day][r.period_number] = {
      subject: subjectName(r.subject_id),
      subjectShort: subjectShort(r.subject_id),
      teacher: teacherName(r.teacher_id),
      room: roomName(r.room_id),
    };
  }
  return matrix;
}

/** Build a matrix for a teacher: each cell = the class/section that teacher teaches in that period. */
export function buildTeacherMatrix(
  routines: RoutineRow[],
  teacherId: string,
  sections: SectionRow[],
  classes: ClassRow[]
): RoutineMatrix {
  const matrix: RoutineMatrix = {};
  const sectionLabel = (id: string) => {
    const s = sections.find((x) => x.id === id);
    if (!s) return "—";
    const c = classes.find((x) => x.id === s.class_id);
    return c ? `${c.name}-${s.name}` : s.name;
  };

  for (const r of routines) {
    if (r.teacher_id !== teacherId) continue;
    if (!matrix[r.day]) matrix[r.day] = {};
    matrix[r.day][r.period_number] = {
      subject: sectionLabel(r.section_id),
    };
  }
  return matrix;
}

/** Build a matrix for a teacher for a single day index (adjust view), showing class+section labels. */
export const buildDayTeacherMatrix = buildTeacherMatrix;

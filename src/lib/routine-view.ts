import "server-only";
import type {
  RoutineRow,
  TeacherRow,
  SubjectRow,
  RoomRow,
  SectionRow,
  ClassRow,
  AdjustmentRow,
} from "./types";
import type { RoutineMatrix } from "@/components/routine/routine-grid";

export interface RoutineLookups {
  teachers: TeacherRow[];
  subjects: SubjectRow[];
  rooms: RoomRow[];
}

interface AdjustOverride {
  newTeacherId: string | null;
  newSubjectId: string | null;
  newRoomId: string | null;
}

/**
 * Build a map of today's effective overrides per section+period.
 * Returns Map<"sectionId:period", AdjustOverride>.
 */
export function buildTodayOverrides(
  adjustments: AdjustmentRow[],
  today: string,
  isTag: boolean
): Map<string, AdjustOverride> {
  const map = new Map<string, AdjustOverride>();
  for (const a of adjustments) {
    if (a.adjust_date !== today || a.is_tag !== isTag) continue;
    map.set(`${a.section_id}:${a.period_number}`, {
      newTeacherId: a.new_teacher_id,
      newSubjectId: a.new_subject_id,
      newRoomId: a.new_room_id,
    });
  }
  return map;
}

/** Build a Day(0-4) x Period(1-7) matrix for a given section. */
export function buildSectionMatrix(
  routines: RoutineRow[],
  sectionId: string,
  lookups: RoutineLookups,
  todayOverrides?: Map<string, AdjustOverride>,
  tagOverrides?: Map<string, AdjustOverride>
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

  const byDayPeriod = new Map<string, { primary: RoutineRow; tag: RoutineRow | null }>();
  for (const r of routines) {
    if (r.section_id !== sectionId) continue;
    const key = `${r.day}:${r.period_number}`;
    if (r.is_tag) {
      const existing = byDayPeriod.get(key);
      if (existing) existing.tag = r;
    } else {
      if (!byDayPeriod.has(key)) byDayPeriod.set(key, { primary: r, tag: null });
      byDayPeriod.get(key)!.primary = r;
    }
  }

  for (const [key, { primary, tag }] of byDayPeriod) {
    const [dayStr, periodStr] = key.split(":");
    const day = Number(dayStr);
    const period = Number(periodStr);

    if (!matrix[day]) matrix[day] = {};

    let subjectId = primary.subject_id;
    let teacherId = primary.teacher_id;
    let roomId = primary.room_id;
    let isAdjusted = false;

    const pOverride = todayOverrides?.get(`${sectionId}:${period}`);
    if (pOverride) {
      if (pOverride.newTeacherId) teacherId = pOverride.newTeacherId;
      if (pOverride.newSubjectId) subjectId = pOverride.newSubjectId;
      if (pOverride.newRoomId) roomId = pOverride.newRoomId;
      isAdjusted = true;
    }

    let subject2 = tag?.subject_id ? subjectShort(tag.subject_id) : undefined;
    let teacher2 = tag?.teacher_id ? teacherName(tag.teacher_id) : undefined;
    let room2 = tag?.room_id ? roomName(tag.room_id) : undefined;
    const isTag = !!tag;
    let isTagAdjusted = false;

    const tOverride = tagOverrides?.get(`${sectionId}:${period}`);
    if (tag && tOverride) {
      if (tOverride.newTeacherId) teacher2 = teacherName(tOverride.newTeacherId);
      if (tOverride.newSubjectId) subject2 = subjectShort(tOverride.newSubjectId);
      if (tOverride.newRoomId) room2 = roomName(tOverride.newRoomId);
      isTagAdjusted = true;
    }

    matrix[day][period] = {
      subject: subjectName(subjectId),
      subjectShort: subjectShort(subjectId),
      teacher: teacherName(teacherId),
      room: roomName(roomId),
      subject2,
      teacher2,
      room2,
      isTag,
      isAdjusted,
      isTagAdjusted,
    };
  }
  return matrix;
}

/** Build a matrix for a teacher: each cell = the class/section that teacher teaches in that period. */
export function buildTeacherMatrix(
  routines: RoutineRow[],
  teacherId: string,
  sections: SectionRow[],
  classes: ClassRow[],
  todayOverrides?: Map<string, AdjustOverride>,
  tagOverrides?: Map<string, AdjustOverride>
): RoutineMatrix {
  const matrix: RoutineMatrix = {};
  const sectionLabel = (id: string) => {
    const s = sections.find((x) => x.id === id);
    if (!s) return "—";
    const c = classes.find((x) => x.id === s.class_id);
    return c ? `${c.name}-${s.name}` : s.name;
  };

  // Find all rows where this teacher appears (primary or tag)
  const teacherRows = routines.filter(
    (r) => r.teacher_id === teacherId
  );

  for (const r of teacherRows) {
    if (!matrix[r.day]) matrix[r.day] = {};

    const classLabel = sectionLabel(r.section_id);

    // Apply adjustments if today
    let effectiveClass = classLabel;
    if (!r.is_tag) {
      const pOverride = todayOverrides?.get(`${r.section_id}:${r.period_number}`);
      if (pOverride) effectiveClass = classLabel + " (adj)";
    }
    if (r.is_tag) {
      const tOverride = tagOverrides?.get(`${r.section_id}:${r.period_number}`);
      if (tOverride) effectiveClass = classLabel + " (tag adj)";
    }

    matrix[r.day][r.period_number] = {
      subject: effectiveClass,
    };
  }
  return matrix;
}

/** Build a matrix for a teacher for a single day index (adjust view), showing class+section labels. */
export const buildDayTeacherMatrix = buildTeacherMatrix;

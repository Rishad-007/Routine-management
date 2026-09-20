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
import { getSchoolDayIndex } from "./periods";

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

/** Parse "YYYY-MM-DD" into a LOCAL Date (avoids UTC-midnight ambiguity). */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Build a map of today's effective overrides per section+day+period.
 * Returns Map<"sectionId:day:period", AdjustOverride>.
 */
export function buildTodayOverrides(
  adjustments: AdjustmentRow[],
  today: string,
  isTag: boolean,
): Map<string, AdjustOverride> {
  const map = new Map<string, AdjustOverride>();
  for (const a of adjustments) {
    if (a.adjust_date !== today || a.is_tag !== isTag) continue;
    const dayIndex = getSchoolDayIndex(parseLocalDate(a.adjust_date));
    if (dayIndex === null) continue;
    map.set(`${a.section_id}:${dayIndex}:${a.period_number}`, {
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
  tagOverrides?: Map<string, AdjustOverride>,
): RoutineMatrix {
  const matrix: RoutineMatrix = {};
  const teacherName = (id: string | null) =>
    id ? lookups.teachers.find((t) => t.id === id)?.full_name : undefined;
  const subjectName = (id: string | null) =>
    id ? lookups.subjects.find((s) => s.id === id)?.name : undefined;
  const subjectShort = (id: string | null) =>
    id ? lookups.subjects.find((s) => s.id === id)?.short_name : undefined;
  const roomName = (id: string | null) =>
    id ? lookups.rooms.find((r) => r.id === id)?.name : undefined;

  // Bucket by day:period regardless of role. The `routines` view has no
  // guaranteed order, so keying a tag off an already-seen primary would drop
  // any tag row that happens to arrive first — which is most of them.
  const byDayPeriod = new Map<
    string,
    { primary: RoutineRow | null; tag: RoutineRow | null }
  >();
  for (const r of routines) {
    if (r.section_id !== sectionId) continue;
    const key = `${r.day}:${r.period_number}`;
    let cell = byDayPeriod.get(key);
    if (!cell) byDayPeriod.set(key, (cell = { primary: null, tag: null }));
    if (r.is_tag) cell.tag = r;
    else cell.primary = r;
  }

  for (const [key, { primary, tag }] of byDayPeriod) {
    const [dayStr, periodStr] = key.split(":");
    const day = Number(dayStr);
    const period = Number(periodStr);

    if (!matrix[day]) matrix[day] = {};

    // A slot normally has a primary. If only a tag survives (its primary was
    // removed), show the tag in the main position rather than an empty cell.
    const main = primary ?? tag;
    const second = primary ? tag : null;
    if (!main) continue;

    let subjectId = main.subject_id;
    let teacherId = main.teacher_id;
    let roomId = main.room_id;
    let isAdjusted = false;

    const mainOverrides = primary ? todayOverrides : tagOverrides;
    const pOverride = mainOverrides?.get(`${sectionId}:${day}:${period}`);
    if (pOverride) {
      if (pOverride.newTeacherId) teacherId = pOverride.newTeacherId;
      if (pOverride.newSubjectId) subjectId = pOverride.newSubjectId;
      if (pOverride.newRoomId) roomId = pOverride.newRoomId;
      isAdjusted = true;
    }

    let subject2 = second?.subject_id
      ? subjectShort(second.subject_id)
      : undefined;
    let teacher2 = second?.teacher_id
      ? teacherName(second.teacher_id)
      : undefined;
    let room2 = second?.room_id ? roomName(second.room_id) : undefined;
    const isTag = !!second;
    let isTagAdjusted = false;

    const tOverride = tagOverrides?.get(`${sectionId}:${day}:${period}`);
    if (second && tOverride) {
      if (tOverride.newTeacherId)
        teacher2 = teacherName(tOverride.newTeacherId);
      if (tOverride.newSubjectId)
        subject2 = subjectShort(tOverride.newSubjectId);
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
  subjects: SubjectRow[],
  rooms: RoomRow[],
  todayOverrides?: Map<string, AdjustOverride>,
  tagOverrides?: Map<string, AdjustOverride>,
): RoutineMatrix {
  const matrix: RoutineMatrix = {};
  const sectionLabel = (id: string) => {
    const s = sections.find((x) => x.id === id);
    if (!s) return "—";
    const c = classes.find((x) => x.id === s.class_id);
    return c ? `${c.name}-${s.name}` : s.name;
  };
  const subjectName = (id: string | null) =>
    id ? subjects.find((s) => s.id === id)?.name : undefined;
  const subjectShort = (id: string | null) =>
    id ? subjects.find((s) => s.id === id)?.short_name : undefined;
  const roomName = (id: string | null) =>
    id ? rooms.find((r) => r.id === id)?.name : undefined;

  for (const r of routines) {
    const override = r.is_tag
      ? tagOverrides?.get(`${r.section_id}:${r.day}:${r.period_number}`)
      : todayOverrides?.get(`${r.section_id}:${r.day}:${r.period_number}`);
    const effectiveTeacherId = override?.newTeacherId ?? r.teacher_id;
    if (effectiveTeacherId !== teacherId) continue;

    if (!matrix[r.day]) matrix[r.day] = {};

    const classLabel = sectionLabel(r.section_id);

    // Apply adjustments if today
    const effectiveSubjectId = override?.newSubjectId ?? r.subject_id;
    const effectiveRoomId = override?.newRoomId ?? r.room_id;

    let effectiveClass = classLabel;
    if (r.is_tag) {
      if (override) effectiveClass = classLabel + " (tag adj)";
    } else if (override) {
      effectiveClass = classLabel + " (adj)";
    }

    matrix[r.day][r.period_number] = {
      subject: subjectName(effectiveSubjectId),
      subjectShort: subjectShort(effectiveSubjectId),
      room: roomName(effectiveRoomId),
      classLabel: effectiveClass,
      isAdjusted: !!override,
    };
  }
  return matrix;
}

/** Build a matrix for a teacher for a single day index (adjust view), showing class+section labels. */
export const buildDayTeacherMatrix = buildTeacherMatrix;

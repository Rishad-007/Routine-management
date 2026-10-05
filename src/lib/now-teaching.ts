import type {
  AdjustmentRow,
  ClassRow,
  RoomRow,
  RoutineRow,
  SectionRow,
  SubjectRow,
  TeacherRow,
} from "./types";
import { suspendedSectionIdSet } from "./suspensions";

/**
 * "Who is teaching right now" derivation for the public dashboard.
 *
 * Pure and client-safe (no `server-only`), so the dashboard can re-derive the
 * board every time the clock crosses into a new period without a round trip to
 * the database. The caller supplies only the current day's routine rows plus
 * the adjustments from today onwards.
 *
 * A "busy" teacher is one that holds a routine row at this day+period. Because
 * there is no teacher->class assignment table, the routine IS the assignment,
 * so today's substitutions have to be folded in here or the board would show
 * the teacher who is supposed to be absent.
 */

export interface NowTeachingInput {
  /** Routine rows for ONE day (all periods). */
  rows: RoutineRow[];
  /** Adjustments from today onwards; only today's date is applied. */
  adjustments: AdjustmentRow[];
  /** The date being shown, as YYYY-MM-DD. */
  date: string;
  sections: SectionRow[];
  classes: ClassRow[];
  subjects: SubjectRow[];
  rooms: RoomRow[];
  teachers: TeacherRow[];
}

export interface NowAssignment {
  /** `${sectionId}:${period}:${role}` — stable across ticks, good for React keys. */
  key: string;
  classId: string;
  className: string;
  classSortOrder: number;
  sectionId: string;
  sectionName: string;
  /** "Class 9-Dhalia" */
  classLabel: string;
  roomName?: string;
  subjectName?: string;
  teacherId: string | null;
  teacherName?: string;
  teacherCode?: string;
  /** Second teacher on a co-taught (tag) slot. */
  isTag: boolean;
  /** True when a substitution is in force for this slot. */
  isAdjusted: boolean;
  /** Full name of the teacher a substitute displaced, for "covering for …". */
  coveringFor?: string;
  reason?: string;
}

export interface NowClassGroup {
  classId: string;
  className: string;
  sortOrder: number;
  items: NowAssignment[];
}

export interface NowTeacherGroup {
  teacherId: string;
  name: string;
  code: string;
  items: NowAssignment[];
}

export interface NowStats {
  /** Distinct class-sections with a teacher on this period. */
  sections: number;
  /** Distinct teachers on duty. */
  teachers: number;
  /** Assignments running on a substitution. */
  substitutes: number;
  /** Distinct rooms in use. */
  rooms: number;
  /** Teachers with no slot at all this period. */
  freeTeachers: number;
}

export interface NowTeaching {
  assignments: NowAssignment[];
  byClass: NowClassGroup[];
  byTeacher: NowTeacherGroup[];
  /** Teachers with nothing to teach this period, in directory order. */
  freeTeacherIds: string[];
  stats: NowStats;
}

export const EMPTY_NOW_TEACHING: NowTeaching = {
  assignments: [],
  byClass: [],
  byTeacher: [],
  freeTeacherIds: [],
  stats: {
    sections: 0,
    teachers: 0,
    substitutes: 0,
    rooms: 0,
    freeTeachers: 0,
  },
};

/**
 * Fold today's substitutions onto the period's rows.
 *
 * Keyed by section+period+role, matching how an adjustment is stored. A
 * substitution can carry a new subject or room on its own, so each field is
 * applied independently rather than all-or-nothing.
 */
function overlayAdjustments(
  adjustments: AdjustmentRow[],
  date: string,
): Map<string, AdjustmentRow> {
  const byCell = new Map<string, AdjustmentRow>();
  for (const a of adjustments) {
    if (a.adjust_date !== date) continue;
    byCell.set(`${a.section_id}:${a.period_number}:${a.is_tag}`, a);
  }
  return byCell;
}

export function buildNowTeaching(
  input: NowTeachingInput,
  period: number,
): NowTeaching {
  const { rows, adjustments, date, sections, classes, subjects, rooms, teachers } =
    input;

  const periodRows = rows.filter((r) => r.period_number === period);
  if (periodRows.length === 0) {
    const freeTeacherIds = teachers.map((t) => t.id);
    return {
      ...EMPTY_NOW_TEACHING,
      freeTeacherIds,
      stats: { ...EMPTY_NOW_TEACHING.stats, freeTeachers: freeTeacherIds.length },
    };
  }

  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const classById = new Map(classes.map((c) => [c.id, c]));
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const teacherById = new Map(teachers.map((t) => [t.id, t]));

  // A suspended class is not running, so its slots must not read as "busy".
  const suspendedSections = suspendedSectionIdSet(sections, classes);
  const overrides = overlayAdjustments(adjustments, date);

  const assignments: NowAssignment[] = [];

  for (const row of periodRows) {
    if (suspendedSections.has(row.section_id)) continue;

    const section = sectionById.get(row.section_id);
    if (!section) continue;
    const cls = classById.get(section.class_id);
    if (!cls) continue;

    const adjustment = overrides.get(
      `${row.section_id}:${row.period_number}:${row.is_tag}`,
    );

    const teacherId = adjustment?.new_teacher_id ?? row.teacher_id;
    const subjectId = adjustment?.new_subject_id ?? row.subject_id;
    const roomId = adjustment?.new_room_id ?? row.room_id;

    const teacher = teacherId ? teacherById.get(teacherId) : undefined;
    const coveringForId = adjustment?.original_teacher_id ?? null;
    const coveringFor = coveringForId
      ? teacherById.get(coveringForId)?.full_name
      : undefined;

    // A row with neither teacher nor subject nor room is litter, not a class.
    if (!teacherId && !subjectId && !roomId) continue;

    assignments.push({
      key: `${row.section_id}:${row.period_number}:${row.is_tag ? "tag" : "primary"}`,
      classId: cls.id,
      className: cls.name,
      classSortOrder: cls.sort_order,
      sectionId: section.id,
      sectionName: section.name,
      classLabel: `${cls.name}-${section.name}`,
      roomName: roomId ? roomById.get(roomId)?.name : undefined,
      subjectName: subjectId ? subjectById.get(subjectId)?.name : undefined,
      teacherId: teacherId ?? null,
      teacherName: teacher?.full_name,
      teacherCode: teacher?.teacher_code,
      isTag: row.is_tag,
      isAdjusted: !!adjustment && !!adjustment.new_teacher_id,
      coveringFor,
      reason: adjustment?.reason ?? undefined,
    });
  }

  // Primary before tag, then by class order then section, so a co-taught slot
  // reads as "the teacher, plus the second one".
  assignments.sort(
    (a, b) =>
      Number(a.isTag) - Number(b.isTag) ||
      a.classSortOrder - b.classSortOrder ||
      a.sectionName.localeCompare(b.sectionName) ||
      (a.teacherName ?? "").localeCompare(b.teacherName ?? ""),
  );

  const classGroups = new Map<string, NowClassGroup>();
  const teacherGroups = new Map<string, NowTeacherGroup>();
  const busyTeacherIds = new Set<string>();
  const roomNames = new Set<string>();

  for (const a of assignments) {
    if (a.teacherId) busyTeacherIds.add(a.teacherId);
    if (a.roomName) roomNames.add(a.roomName);

    const cg = classGroups.get(a.classId);
    if (cg) cg.items.push(a);
    else
      classGroups.set(a.classId, {
        classId: a.classId,
        className: a.className,
        sortOrder: a.classSortOrder,
        items: [a],
      });

    if (a.teacherId) {
      const tg = teacherGroups.get(a.teacherId);
      if (tg) tg.items.push(a);
      else
        teacherGroups.set(a.teacherId, {
          teacherId: a.teacherId,
          name: a.teacherName ?? "—",
          code: a.teacherCode ?? "",
          items: [a],
        });
    }
  }

  const byClass = [...classGroups.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.className.localeCompare(b.className),
  );
  const byTeacher = [...teacherGroups.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const freeTeacherIds = teachers
    .filter((t) => !busyTeacherIds.has(t.id))
    .map((t) => t.id);

  return {
    assignments,
    byClass,
    byTeacher,
    freeTeacherIds,
    stats: {
      sections: new Set(assignments.map((a) => a.sectionId)).size,
      teachers: busyTeacherIds.size,
      substitutes: assignments.filter((a) => a.isAdjusted).length,
      rooms: roomNames.size,
      freeTeachers: freeTeacherIds.length,
    },
  };
}
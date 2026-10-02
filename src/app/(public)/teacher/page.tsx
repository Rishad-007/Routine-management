import {
  getTeachers,
  getRoutines,
  getSections,
  getClasses,
  getSubjects,
  getRooms,
  getSetting,
  getAdjustmentsForWeek,
} from "@/lib/data";
import { buildTeacherMatrix, buildWeekOverrides } from "@/lib/routine-view";
import { filterSuspendedRoutines } from "@/lib/suspensions";
import { getSchoolWeekRange } from "@/lib/periods";
import type { Season } from "@/lib/constants";
import type { RoutineMatrix } from "@/components/routine/routine-grid";
import { TeacherRoutineViewer } from "@/components/public/teacher-routine-viewer";

export const revalidate = 60;

export default async function TeacherPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  // Only the current school week's substitutions are live.
  const week = getSchoolWeekRange();
  const [
    teachers,
    routines,
    sections,
    classes,
    subjects,
    rooms,
    season,
    adjustments,
  ] = await Promise.all([
    getTeachers(),
    getRoutines(),
    getSections(),
    getClasses(),
    getSubjects(),
    getRooms(),
    getSetting("season"),
    getAdjustmentsForWeek(week),
  ]);

  // Weekly (Sun–Sat) overlay. This is the page a substitute checks for their
  // own week, so scoping to today previously hid the very cover they were
  // assigned on any other day.
  const todayPrimaryOverrides = buildWeekOverrides(
    adjustments,
    week.start,
    false,
  );
  const todayTagOverrides = buildWeekOverrides(adjustments, week.start, true);

  // A suspended class does not run, so its teachers are genuinely free and the
  // suspended class must not appear on their weekly routine.
  const liveRoutines = filterSuspendedRoutines(routines, sections, classes);

  const matrices: Record<string, RoutineMatrix> = {};
  const teacherMeta: Record<string, { name: string; code: string }> = {};
  for (const t of teachers) {
    matrices[t.id] = buildTeacherMatrix(
      liveRoutines,
      t.id,
      sections,
      classes,
      subjects,
      rooms,
      todayPrimaryOverrides,
      todayTagOverrides,
      teachers,
    );
    teacherMeta[t.id] = { name: t.full_name, code: t.teacher_code };
  }

  return (
    <TeacherRoutineViewer
      teachers={teachers}
      matrices={matrices}
      teacherMeta={teacherMeta}
      season={(season as Season) ?? "summer"}
      initialQuery={params.q ?? ""}
    />
  );
}

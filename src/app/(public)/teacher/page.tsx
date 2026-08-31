import {
  getTeachers,
  getRoutines,
  getSections,
  getClasses,
  getSetting,
} from "@/lib/data";
import { buildTeacherMatrix } from "@/lib/routine-view";
import type { Season } from "@/lib/constants";
import type { RoutineMatrix } from "@/components/routine/routine-grid";
import { TeacherRoutineViewer } from "@/components/public/teacher-routine-viewer";

export const dynamic = "force-dynamic";

export default async function TeacherPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const [teachers, routines, sections, classes, season] = await Promise.all([
    getTeachers(),
    getRoutines(),
    getSections(),
    getClasses(),
    getSetting("season"),
  ]);

  const matrices: Record<string, RoutineMatrix> = {};
  const teacherMeta: Record<string, { name: string; code: string }> = {};
  for (const t of teachers) {
    matrices[t.id] = buildTeacherMatrix(routines, t.id, sections, classes);
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

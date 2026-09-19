import { requireAdmin } from "@/lib/auth";
import {
  getClassPeriodRules,
  getClasses,
  getRooms,
  getRoutines,
  getSections,
  getSubjects,
  getTeacherSubjects,
  getTeachers,
} from "@/lib/data";
import { AssignBuilder } from "@/components/admin/assign/assign-builder";

export const dynamic = "force-dynamic";

export default async function AssignPage({
  searchParams,
}: {
  searchParams: Promise<{ teacher?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const [
    teachers,
    sections,
    classes,
    subjects,
    rooms,
    teacherSubjects,
    routines,
    rules,
  ] = await Promise.all([
    getTeachers(),
    getSections(),
    getClasses(),
    getSubjects(),
    getRooms(),
    getTeacherSubjects(),
    getRoutines(),
    getClassPeriodRules(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Assign Classes</h1>
        <p className="text-sm text-slate-500">
          Pick a teacher and fill their week directly. Click any free period to
          give them a class; conflicts are checked before saving.
        </p>
      </div>
      <AssignBuilder
        teachers={teachers}
        sections={sections}
        classes={classes}
        subjects={subjects}
        rooms={rooms}
        teacherSubjects={teacherSubjects}
        routines={routines}
        rules={rules}
        initialTeacherId={params.teacher ?? null}
      />
    </div>
  );
}

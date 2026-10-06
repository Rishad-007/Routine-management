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
  getTeacherUnavailability,
} from "@/lib/data";
import { AssignBuilder } from "@/components/admin/assign/assign-builder";
import { Ban } from "lucide-react";

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
    unavailability,
  ] = await Promise.all([
    getTeachers(),
    getSections(),
    getClasses(),
    getSubjects(),
    getRooms(),
    getTeacherSubjects(),
    getRoutines(),
    getClassPeriodRules(),
    getTeacherUnavailability(),
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
      {classes.some((c) => c.is_suspended) && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">
              {classes
                .filter((c) => c.is_suspended)
                .map((c) => c.name)
                .join(", ")}
            </span>{" "}
            {classes.filter((c) => c.is_suspended).length === 1
              ? "is"
              : "are"}{" "}
            suspended. The weekly template is unchanged, so resuming restores
            it. To cover with their freed teachers, use Adjust Routine.
          </span>
        </div>
      )}
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
        unavailability={unavailability}
      />
    </div>
  );
}

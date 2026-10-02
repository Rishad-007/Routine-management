import {
  getClasses,
  getSections,
  getTeachers,
  getSubjects,
  getRooms,
  getTeacherSubjects,
  getRoutines,
  getClassPeriodRules,
} from "@/lib/data";
import { RoutineBuilder } from "@/components/admin/routine/routine-builder";
import { Ban } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminRoutinePage() {
  const [classes, sections, teachers, subjects, rooms, teacherSubjects, routines, classPeriodRules] =
    await Promise.all([
      getClasses(),
      getSections(),
      getTeachers(),
      getSubjects(),
      getRooms(),
      getTeacherSubjects(),
      getRoutines(),
      getClassPeriodRules(),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Update Routine</h1>
        <p className="text-sm text-slate-500">
          Edit a section&apos;s weekly routine. Click a cell to assign, drag to
          swap periods, then save. Conflicts are warned before saving.
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
            suspended. The weekly template below is kept as-is, so resuming
            restores it. Use Adjust Routine to cover classes with their freed
            teachers.
          </span>
        </div>
      )}
      <RoutineBuilder
        classes={classes}
        sections={sections}
        teachers={teachers}
        subjects={subjects}
        rooms={rooms}
        teacherSubjects={teacherSubjects}
        routines={routines}
        rules={classPeriodRules}
      />
    </div>
  );
}

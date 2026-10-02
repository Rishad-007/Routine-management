import {
  getClasses,
  getSections,
  getTeachers,
  getSubjects,
  getRooms,
  getRoutines,
  getTeacherSubjects,
  getAllAdjustments,
  getClassPeriodRules,
} from "@/lib/data";
import { getTodayLocal } from "@/lib/periods";
import { filterSuspendedRoutines } from "@/lib/suspensions";
import { Ban } from "lucide-react";
import { AdjustBuilder } from "@/components/admin/adjust/adjust-builder";

export const dynamic = "force-dynamic";

export default async function AdminAdjustPage() {
  const [classes, sections, teachers, subjects, rooms, routines, adjustments, teacherSubjects, classPeriodRules] =
    await Promise.all([
      getClasses(),
      getSections(),
      getTeachers(),
      getSubjects(),
      getRooms(),
      getRoutines(),
      getAllAdjustments(),
      getTeacherSubjects(),
      getClassPeriodRules(),
    ]);

  // Suspension is a live overlay. Filtering the routine here makes a suspended
  // class's teachers read as free throughout the builder (rail counts, free/busy
  // sheet, conflict simulation). Full adjustment history is kept so past records
  // stay browsable even after a class is suspended.
  const liveRoutines = filterSuspendedRoutines(routines, sections, classes);
  const suspendedClasses = classes.filter((c) => c.is_suspended);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Adjust Routine</h1>
        <p className="text-sm text-slate-500">
          Make temporary, date-scoped teacher substitutions. Select a teacher to
          view their day grid, then click a period to reassign. Toggle tag mode
          for 2-teacher sessions.
        </p>
      </div>
      {suspendedClasses.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">
              {suspendedClasses.map((c) => c.name).join(", ")}
            </span>{" "}
            {suspendedClasses.length === 1 ? "is" : "are"} suspended. Their
            teachers are free and can be assigned to other classes here.
          </span>
        </div>
      )}
      <AdjustBuilder
        classes={classes}
        sections={sections}
        teachers={teachers}
        subjects={subjects}
        rooms={rooms}
        routines={liveRoutines}
        adjustments={adjustments}
        teacherSubjects={teacherSubjects}
        initialDate={getTodayLocal()}
        rules={classPeriodRules}
      />
    </div>
  );
}

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
  getTeacherUnavailability,
} from "@/lib/data";
import { getSchoolToday } from "@/lib/periods";
import { filterSuspendedRoutines } from "@/lib/suspensions";
import { unavailabilityIndex, unavailableTeacherIds } from "@/lib/unavailability";
import { Ban, CalendarX2 } from "lucide-react";
import { AdjustBuilder } from "@/components/admin/adjust/adjust-builder";

export const dynamic = "force-dynamic";

export default async function AdminAdjustPage() {
  const [classes, sections, teachers, subjects, rooms, routines, adjustments, teacherSubjects, classPeriodRules, unavailability] =
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
      getTeacherUnavailability(),
    ]);

  // Suspension is a live overlay. Filtering the routine here makes a suspended
  // class's teachers read as free throughout the builder (rail counts, free/busy
  // sheet, conflict simulation). Full adjustment history is kept so past records
  // stay browsable even after a class is suspended.
  const liveRoutines = filterSuspendedRoutines(routines, sections, classes);
  const suspendedClasses = classes.filter((c) => c.is_suspended);
  const today = getSchoolToday();
  const todayUnavailable = unavailableTeacherIds(
    unavailabilityIndex(unavailability, today),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Adjust Routine</h1>
        <p className="text-sm text-slate-500">
          Make temporary, date-scoped substitutions for teachers marked
          unavailable. Those teachers are listed on the left; pick one, then
          click a period to assign a substitute. Toggle tag mode for 2-teacher
          sessions.
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
      {todayUnavailable.size > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800">
          <CalendarX2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">{todayUnavailable.size}</span>{" "}
            {todayUnavailable.size === 1 ? "teacher is" : "teachers are"} marked
            unavailable today. They are excluded from the substitute sheet and
            can&apos;t be picked to cover anyone — declaring someone on{" "}
            <a
              href="/admin/teacher-unavailability"
              className="font-medium underline"
            >
              Mark Unavailable
            </a>{" "}
            stops them being assigned for the day.
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
        initialDate={today}
        rules={classPeriodRules}
        unavailability={unavailability}
      />
    </div>
  );
}

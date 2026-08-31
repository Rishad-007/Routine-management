import {
  getClasses,
  getSections,
  getTeachers,
  getSubjects,
  getRooms,
  getTeacherSubjects,
  getRoutines,
} from "@/lib/data";
import { RoutineBuilder } from "@/components/admin/routine/routine-builder";

export const dynamic = "force-dynamic";

export default async function AdminRoutinePage() {
  const [classes, sections, teachers, subjects, rooms, teacherSubjects, routines] =
    await Promise.all([
      getClasses(),
      getSections(),
      getTeachers(),
      getSubjects(),
      getRooms(),
      getTeacherSubjects(),
      getRoutines(),
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
      <RoutineBuilder
        classes={classes}
        sections={sections}
        teachers={teachers}
        subjects={subjects}
        rooms={rooms}
        teacherSubjects={teacherSubjects}
        routines={routines}
      />
    </div>
  );
}

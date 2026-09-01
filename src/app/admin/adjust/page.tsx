import {
  getClasses,
  getSections,
  getTeachers,
  getSubjects,
  getRoutines,
  getAdjustments,
} from "@/lib/data";
import { AdjustBuilder } from "@/components/admin/adjust/adjust-builder";

export const dynamic = "force-dynamic";

export default async function AdminAdjustPage() {
  const [classes, sections, teachers, subjects, routines, adjustments] =
    await Promise.all([
      getClasses(),
      getSections(),
      getTeachers(),
      getSubjects(),
      getRoutines(),
      getAdjustments(),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Adjust Routine</h1>
        <p className="text-sm text-slate-500">
          Make temporary, date-scoped teacher substitutions. Select a teacher to
          view their day grid, then click a period to reassign.
        </p>
      </div>
      <AdjustBuilder
        classes={classes}
        sections={sections}
        teachers={teachers}
        subjects={subjects}
        routines={routines}
        adjustments={adjustments}
      />
    </div>
  );
}

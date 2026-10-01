import {
  getClasses,
  getSections,
  getRoutines,
  getTeachers,
  getSubjects,
  getRooms,
  getSetting,
  getAdjustmentsForWeek,
} from "@/lib/data";
import { buildSectionMatrix, buildWeekOverrides } from "@/lib/routine-view";
import { getSchoolWeekRange } from "@/lib/periods";
import type { Season } from "@/lib/constants";
import type { RoutineMatrix } from "@/components/routine/routine-grid";
import { RoutineViewer } from "@/components/public/routine-viewer";

export const revalidate = 60;

export default async function RoutinePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; class?: string }>;
}) {
  const params = await searchParams;
  // Substitutions are live only for the current school week, so fetch just that
  // window rather than every adjustment ever made.
  const week = getSchoolWeekRange();
  const [classes, sections, routines, teachers, subjects, rooms, season, adjustments] =
    await Promise.all([
      getClasses(),
      getSections(),
      getRoutines(),
      getTeachers(),
      getSubjects(),
      getRooms(),
      getSetting("season"),
      getAdjustmentsForWeek(week),
    ]);

  // Weekly (Sun–Sat) overlay: a Wednesday cover shows up in the Wednesday
  // column. Restricting this to today meant the class routine hid every other
  // substitution in the same week.
  const todayPrimaryOverrides = buildWeekOverrides(
    adjustments,
    week.start,
    false,
  );
  const todayTagOverrides = buildWeekOverrides(adjustments, week.start, true);

  const matrices: Record<string, RoutineMatrix> = {};
  for (const s of sections) {
    matrices[s.id] = buildSectionMatrix(
      routines,
      s.id,
      { teachers, subjects, rooms },
      todayPrimaryOverrides,
      todayTagOverrides
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Class Routine</h1>
        <p className="text-sm text-slate-500">
          Sunday to Thursday · Tiffin after period 4 · Watch the schedule live
        </p>
      </div>
      <RoutineViewer
        classes={classes}
        sections={sections}
        initialSectionId={params.section}
        initialClassId={params.class}
        matrices={matrices}
        season={(season as Season) ?? "summer"}
      />
    </div>
  );
}

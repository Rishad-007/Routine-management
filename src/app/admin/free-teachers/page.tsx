import { requireAdmin } from "@/lib/auth";
import {
  getAdjustmentsForWeek,
  getClassPeriodRules,
  getClasses,
  getRooms,
  getRoutines,
  getSections,
  getSubjects,
  getTeachers,
} from "@/lib/data";
import {
  applyWeekAdjustmentsToRoutines,
  buildRoutineIndex,
  dayCountIndexed,
  isBusyIndexed,
  isCoveringIndexed,
  stretchIndexed,
} from "@/lib/conflicts";
import { isPeriodAllowed } from "@/lib/class-period-rules";
import {
  filterSuspendedAdjustments,
  filterSuspendedRoutines,
  suspendedClassIdSet,
} from "@/lib/suspensions";
import { getSchoolDayIndexNow, getSchoolWeekRange } from "@/lib/periods";
import { DAY_ORDER, PERIOD_ORDER } from "@/lib/constants";
import { DAY_LABELS } from "@/lib/types";
import type { RoutinePreviewSourceRow } from "@/lib/teacher-routine-preview";
import {
  FreeTeachersView,
  type PeriodAvailability,
  type TeacherAvailability,
} from "@/components/admin/free-teachers/free-teachers-view";

export const dynamic = "force-dynamic";

export default async function FreeTeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const todayIndex = getSchoolDayIndexNow();
  const requested = Number(params.day);
  const day =
    DAY_ORDER.includes(requested) ? requested : (todayIndex ?? DAY_ORDER[0]);

  const [teachers, routines, adjustments, sections, classes, rules, subjects, rooms] =
    await Promise.all([
      getTeachers(),
      getRoutines(),
      // Explicit week range, not getAdjustments(): that helper only returns
      // today onward, so browsing back to Monday on a Wednesday would silently
      // drop Monday's cover — exactly the substitution the admin is checking.
      getAdjustmentsForWeek(getSchoolWeekRange()),
      getSections(),
      getClasses(),
      getClassPeriodRules(),
      getSubjects(),
      getRooms(),
    ]);

  // Suspension is a live overlay: a suspended class's slots do not count, so
  // its teachers read as free without touching the weekly routine. Filter
  // before both the adjustment overlay and the indexes.
  const suspendedClasses = suspendedClassIdSet(classes);
  const liveRoutines = filterSuspendedRoutines(routines, sections, classes);
  const liveAdjustments = filterSuspendedAdjustments(
    adjustments,
    sections,
    classes,
  );

  // Substitutions are date-scoped, not weekday-scoped, so a saved adjustment
  // for "this Wednesday" must be visible when the admin opens Wednesday — even
  // if they never open the page on Wednesday itself. That is the whole point of
  // live class showing. `applyWeekAdjustmentsToRoutines` files each override
  // under the weekday its date actually falls on, so the day filter below
  // picks out the right column and every other day stays on its base routine.
  // Substitutes appear as covered (is_adjusted) so the view can flag that they
  // hold the cell only temporarily.
  const dayRoutines = liveRoutines.filter((r) => r.day === day);
  const effective = applyWeekAdjustmentsToRoutines(
    dayRoutines,
    liveAdjustments,
  );

  const dayIndex = buildRoutineIndex(effective);
  // Weekly load stays on the unadjusted routine — a one-day cover is not a
  // permanent change to a teacher's workload. Suspended classes are excluded
  // so a freed teacher's weekly total reflects what they actually teach.
  const weekIndex = buildRoutineIndex(liveRoutines);

  // How many sections actually run each period. Classes 1-2 only run periods
  // 5-7 and classes 3-4 stop at 4, so without this the "free" count at P1/P7
  // looks enormous and means nothing. Suspended classes run nothing.
  const sectionsRunning = new Map<number, number>();
  for (const period of PERIOD_ORDER) {
    let count = 0;
    for (const section of sections) {
      if (suspendedClasses.has(section.class_id)) continue;
      if (isPeriodAllowed(rules, section.class_id, day, period)) count++;
    }
    sectionsRunning.set(period, count);
  }

  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  const sectionLabel = new Map(
    sections.map((s) => [
      s.id,
      `${classMap.get(s.class_id) ?? "—"} — ${s.name}`,
    ]),
  );

  // Lookups for the weekly-routine popup (matching the adjust section's cell
  // labels). Passed as plain records because Maps are not serializable across
  // the server→client boundary.
  const subjectLabels: Record<string, string> = {};
  for (const s of subjects) subjectLabels[s.id] = s.short_name ?? s.name;

  const roomLabels: Record<string, string> = {};
  for (const r of rooms) roomLabels[r.id] = r.name;

  const routineSectionLabels: Record<string, string> = {};
  for (const s of sections) {
    const cls = classMap.get(s.class_id) ?? "—";
    routineSectionLabels[s.id] = `${cls}-${s.name}`;
  }

  // So the weekly popup can say "covering for <name>" instead of a bare
  // "cover", which would not tell the admin whose class is at stake.
  const teacherLabels: Record<string, string> = {};
  for (const t of teachers) teacherLabels[t.id] = t.full_name;

  // Suspended classes are surfaced as a banner so the admin understands why
  // the free count jumped, instead of assuming the routine lost data.
  const suspendedClassList = classes
    .filter((c) => c.is_suspended)
    .map((c) => ({ name: c.name, reason: c.suspension_reason }));

  // Slim per-period routine rows so the client can render a teacher's weekly
  // routine popup without shipping the full RoutineRow type. The popup is
  // weekly, so it gets the whole-week overlay — otherwise a substitute looking
  // at their own routine in this dialog would not see the class they are
  // covering, which is precisely the thing they are being asked about.
  const routineRows: RoutinePreviewSourceRow[] =
    applyWeekAdjustmentsToRoutines(liveRoutines, liveAdjustments).map((r) => ({
      teacher_id: r.teacher_id,
      day: r.day,
      period_number: r.period_number,
      section_id: r.section_id,
      subject_id: r.subject_id,
      room_id: r.room_id,
      is_tag: r.is_tag,
      is_adjusted: r.is_adjusted,
      original_teacher_id: r.original_teacher_id,
    }));

  // Ship only the derived per-period lists plus the slim routine rows above,
  // never the 3000+ full routine rows.
  const periods: PeriodAvailability[] = PERIOD_ORDER.map((period) => {
    const free: TeacherAvailability[] = [];
    const busy: TeacherAvailability[] = [];
    for (const t of teachers) {
      const isBusy = isBusyIndexed(dayIndex, t.id, day, period);
      const entry = {
        id: t.id,
        fullName: t.full_name,
        code: t.teacher_code,
        isOpen: t.is_open_teacher,
        dayCount: dayCountIndexed(dayIndex, t.id, day),
        stretch: stretchIndexed(dayIndex, t.id, day),
        weekTotal: weekIndex.weeklyTotal.get(t.id) ?? 0,
        where: isBusy
          ? (effective.find(
              (r) =>
                r.teacher_id === t.id &&
                r.period_number === period &&
                r.day === day,
            )?.section_id ?? null)
          : null,
        // Busy purely because of a saved cover — a genuine slot once that
        // substitution is removed. `adjustedToday` replaced with an explicit
        // signal so the client does not have to recompute it.
        isCovering: isBusy && isCoveringIndexed(dayIndex, t.id, day, period),
      };
      if (isBusy) busy.push(entry);
      else free.push(entry);
    }

    // Open teachers first (the obvious pick for cover), then the lightest loads.
    const rank = (a: TeacherAvailability, b: TeacherAvailability) =>
      Number(b.isOpen) - Number(a.isOpen) ||
      a.dayCount - b.dayCount ||
      a.weekTotal - b.weekTotal ||
      a.fullName.localeCompare(b.fullName);

    return {
      period,
      sectionsRunning: sectionsRunning.get(period) ?? 0,
      free: free.sort(rank),
      busy: busy
        .sort(rank)
        .map((t) => ({
          ...t,
          where: t.where ? (sectionLabel.get(t.where) ?? null) : null,
        })),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Free Teachers</h1>
        <p className="text-sm text-slate-500">
          Who is unassigned in each period on {DAY_LABELS[day]}. Click a period
          to see the full list.
        </p>
      </div>
      <FreeTeachersView
        day={day}
        periods={periods}
        totalTeachers={teachers.length}
        adjustedToday={effective.some((r) => r.is_adjusted)}
        suspendedClasses={suspendedClassList}
        teacherLabels={teacherLabels}
        subjectLabels={subjectLabels}
        roomLabels={roomLabels}
        routineSectionLabels={routineSectionLabels}
        routineRows={routineRows}
      />
    </div>
  );
}

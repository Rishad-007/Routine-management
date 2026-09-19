import { requireAdmin } from "@/lib/auth";
import {
  getAdjustments,
  getClassPeriodRules,
  getClasses,
  getRoutines,
  getSections,
  getTeachers,
} from "@/lib/data";
import {
  applyAdjustmentsToRoutines,
  buildRoutineIndex,
  dayCountIndexed,
  isBusyIndexed,
  stretchIndexed,
} from "@/lib/conflicts";
import { isPeriodAllowed } from "@/lib/class-period-rules";
import { getSchoolDayIndex, getTodayLocal } from "@/lib/periods";
import { DAY_ORDER, PERIOD_ORDER } from "@/lib/constants";
import { DAY_LABELS } from "@/lib/types";
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

  const todayIndex = getSchoolDayIndex(new Date());
  const requested = Number(params.day);
  const day =
    DAY_ORDER.includes(requested) ? requested : (todayIndex ?? DAY_ORDER[0]);

  const [teachers, routines, adjustments, sections, classes, rules] =
    await Promise.all([
      getTeachers(),
      getRoutines(),
      getAdjustments(),
      getSections(),
      getClasses(),
      getClassPeriodRules(),
    ]);

  // Substitutions are date-scoped, so they only describe *today*. A weekday
  // index cannot tell "this Tuesday" from "next Tuesday", and getAdjustments()
  // returns everything from today onward — so only overlay when the selected
  // weekday is today.
  const today = getTodayLocal();
  const dayRoutines = routines.filter((r) => r.day === day);
  const adjustedToday = day === todayIndex;
  const effective = adjustedToday
    ? applyAdjustmentsToRoutines(dayRoutines, adjustments, today)
    : dayRoutines;

  const dayIndex = buildRoutineIndex(effective);
  // Weekly load stays on the unadjusted routine — a one-day cover is not a
  // permanent change to a teacher's workload.
  const weekIndex = buildRoutineIndex(routines);

  // How many sections actually run each period. Classes 1-2 only run periods
  // 5-7 and classes 3-4 stop at 4, so without this the "free" count at P1/P7
  // looks enormous and means nothing.
  const sectionsRunning = new Map<number, number>();
  for (const period of PERIOD_ORDER) {
    let count = 0;
    for (const section of sections) {
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

  // Ship only the derived per-period lists, never the 3000+ routine rows.
  const periods: PeriodAvailability[] = PERIOD_ORDER.map((period) => {
    const free: TeacherAvailability[] = [];
    const busy: TeacherAvailability[] = [];
    for (const t of teachers) {
      const isBusy = isBusyIndexed(dayIndex, t.id, day, period);
      const entry = {
        id: t.id,
        shortName: t.short_name,
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
      };
      if (isBusy) busy.push(entry);
      else free.push(entry);
    }

    // Open teachers first (the obvious pick for cover), then the lightest loads.
    const rank = (a: TeacherAvailability, b: TeacherAvailability) =>
      Number(b.isOpen) - Number(a.isOpen) ||
      a.dayCount - b.dayCount ||
      a.weekTotal - b.weekTotal ||
      a.shortName.localeCompare(b.shortName);

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
        adjustedToday={adjustedToday}
      />
    </div>
  );
}

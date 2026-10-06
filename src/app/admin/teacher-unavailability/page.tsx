import { requireAdmin } from "@/lib/auth";
import {
  getAdjustmentsForWeek,
  getClasses,
  getRoutines,
  getSections,
  getSubjects,
  getTeachers,
  getTeacherUnavailability,
} from "@/lib/data";
import { applyAdjustmentsToRoutines } from "@/lib/conflicts";
import { getSchoolDayIndex, getSchoolToday, getSchoolWeekRange } from "@/lib/periods";
import { filterSuspendedRoutines, filterSuspendedAdjustments } from "@/lib/suspensions";
import { UnavailabilityBuilder } from "./unavailability-builder";
import type { BusyLabels } from "@/lib/unavailability";

export const dynamic = "force-dynamic";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Build `teacherId -> period -> tooltip` for one calendar date.
 *
 * A period is absent from the map exactly when the teacher is free then, so the
 * client derives its busy set from the same object it reads labels out of and
 * there is no second, disagreeing structure to keep in sync.
 *
 * Returns an empty map on Friday/Saturday — there is no school day to describe.
 */
async function buildBusyLabels(
  date: string,
  dayIndex: number | null,
): Promise<BusyLabels> {
  if (dayIndex === null) return {};

  const [routines, sections, classes, subjects, adjustments] =
    await Promise.all([
      getRoutines(),
      getSections(),
      getClasses(),
      getSubjects(),
      // Bounded to the picked date's own school week rather than
      // getAllAdjustments(): this map is recomputed on every navigation and an
      // unbounded history would drag every past cover along with it.
      getAdjustmentsForWeek(getSchoolWeekRange(new Date(`${date}T00:00:00`))),
    ]);

  const live = filterSuspendedRoutines(routines, sections, classes);
  const liveAdjustments = filterSuspendedAdjustments(
    adjustments,
    sections,
    classes,
  );

  const dayRows = live.filter((r) => r.day === dayIndex);
  const restRows = live.filter((r) => r.day !== dayIndex);
  const scoped = [
    ...restRows,
    ...applyAdjustmentsToRoutines(dayRows, liveAdjustments, date),
  ];

  const sectionLabels = new Map(
    sections.map((s) => {
      const cls = classes.find((c) => c.id === s.class_id);
      return [s.id, cls ? `${cls.name}-${s.name}` : s.name] as const;
    }),
  );
  const subjectNames = new Map(subjects.map((s) => [s.id, s.name]));

  // Presence in `labels` is the busy signal, so every assignment row has to
  // land here — a period with no teacher on it is genuinely free and stays out.
  const labels: BusyLabels = {};

  // Keep both roles per cell the way adjust-builder's `teacherPeriodLabels`
  // does: the primary row wins the tooltip and the tag row only fills in when
  // there is no primary. Splitting on `is_tag` here rather than letting the last
  // row win would make the tooltip depend on table order.
  const picked = new Map<string, { primary?: string; tag?: string }>();

  for (const r of scoped) {
    if (r.day !== dayIndex || !r.teacher_id) continue;

    const subjectName = r.subject_id ? subjectNames.get(r.subject_id) : undefined;
    const text = `${sectionLabels.get(r.section_id) ?? "—"} · ${subjectName ?? "—"}`;

    const key = `${r.teacher_id}|${r.period_number}`;
    const slot = picked.get(key) ?? {};
    if (r.is_tag) slot.tag ??= text;
    else slot.primary = text;
    picked.set(key, slot);
  }

  for (const [key, slot] of picked) {
    const sep = key.indexOf("|");
    const teacherId = key.slice(0, sep);
    const period = Number(key.slice(sep + 1));
    // A cell occupied only as the second (tag) teacher is still a clash — the DB
    // trigger counts it — but the tooltip says so, since that class can be freed
    // by dropping the tag rather than the whole period.
    const text = slot.primary
      ? slot.primary
      : slot.tag
        ? `${slot.tag} · tag`
        : "";
    const bucket = (labels[teacherId] ??= {});
    bucket[period] = text;
  }

  return labels;
}

export default async function TeacherUnavailabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const rawDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const date = rawDate && YMD.test(rawDate) ? rawDate : getSchoolToday();

  // Rejects Fri/Sat, which is the same answer the save action will give — the
  // builder shows why nothing can be recorded rather than letting the admin
  // tick boxes that will be rejected on submit.
  const dayIndex = getSchoolDayIndex(new Date(`${date}T00:00:00`));

  const [teachers, rows, busyLabels] = await Promise.all([
    getTeachers(),
    getTeacherUnavailability(),
    buildBusyLabels(date, dayIndex),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Mark Unavailable</h1>
        <p className="text-sm text-slate-500">
          Record who is out on a date and why, before the day&apos;s substitutions
          are entered. Whole-day records are honored everywhere; period-only
          records restrict the substitute sheet in Adjust Routine.
        </p>
      </div>

      <UnavailabilityBuilder
        date={date}
        dayIndex={dayIndex}
        teachers={teachers}
        rows={rows}
        busyLabels={busyLabels}
      />
    </div>
  );
}

import { requireAdmin } from "@/lib/auth";
import {
  getAdjustmentsForWeek,
  getClasses,
  getRooms,
  getRoutines,
  getSections,
  getSubjects,
  getTeachers,
  getTeacherUnavailability,
} from "@/lib/data";
import {
  applyAdjustmentsToRoutines,
  applyWeekAdjustmentsToRoutines,
  buildRoutineIndex,
  busyPeriodsIndexed,
  dayCountIndexed,
  stretchIndexed,
  teacherDayLoadIndexed,
} from "@/lib/conflicts";
import {
  filterSuspendedAdjustments,
  filterSuspendedRoutines,
} from "@/lib/suspensions";
import {
  getSchoolDayIndex,
  getSchoolToday,
  getSchoolWeekRange,
} from "@/lib/periods";
import {
  reasonLabel,
  unavailableEntry,
  unavailabilityIndex,
  wholeDayTeacherIds,
  type BusyLabels,
} from "@/lib/unavailability";
import { DAY_LABEL_LIST, PERIOD_ORDER } from "@/lib/constants";
import type { RoutinePreviewSourceRow } from "@/lib/teacher-routine-preview";
import {
  TeacherLoadView,
  type TeacherLoadCard,
  type TeacherLoadSummary,
} from "@/components/admin/teacher-load/teacher-load-view";

export const dynamic = "force-dynamic";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export default async function TeacherLoadPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const rawDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const date = rawDate && YMD.test(rawDate) ? rawDate : getSchoolToday();
  const dayIndex = getSchoolDayIndex(new Date(`${date}T00:00:00`));

  const [
    teachers,
    routines,
    adjustments,
    sections,
    classes,
    subjects,
    rooms,
    unavailability,
  ] = await Promise.all([
    getTeachers(),
    getRoutines(),
    getAdjustmentsForWeek(getSchoolWeekRange(new Date(`${date}T00:00:00`))),
    getSections(),
    getClasses(),
    getSubjects(),
    getRooms(),
    getTeacherUnavailability(),
  ]);

  // Suspension is a live overlay: a suspended class's slots do not count, so its
  // teachers read as free without touching the weekly routine.
  const liveRoutines = filterSuspendedRoutines(routines, sections, classes);
  const liveAdjustments = filterSuspendedAdjustments(
    adjustments,
    sections,
    classes,
  );

  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  const subjectLabel = (id: string | null) =>
    id ? (subjects.find((s) => s.id === id)?.short_name ??
      subjects.find((s) => s.id === id)?.name ??
      "—") : "—";

  // Lookups for the weekly-routine dialog (plain records — Maps do not cross the
  // server→client boundary).
  const subjectLabels: Record<string, string> = {};
  for (const s of subjects) subjectLabels[s.id] = s.short_name ?? s.name;

  const roomLabels: Record<string, string> = {};
  for (const r of rooms) roomLabels[r.id] = r.name;

  const routineSectionLabels: Record<string, string> = {};
  for (const s of sections) {
    routineSectionLabels[s.id] = `${classMap.get(s.class_id) ?? "—"}-${s.name}`;
  }

  const teacherLabels: Record<string, string> = {};
  for (const t of teachers) teacherLabels[t.id] = t.full_name;

  const routineRows: RoutinePreviewSourceRow[] = applyWeekAdjustmentsToRoutines(
    liveRoutines,
    liveAdjustments,
  ).map((r) => ({
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

  const suspendedClassList = classes
    .filter((c) => c.is_suspended)
    .map((c) => ({ name: c.name, reason: c.suspension_reason }));

  // Declared absent for the whole day on the picked date.
  const unavailIndex = unavailabilityIndex(unavailability, date);
  const outIds = wholeDayTeacherIds(unavailIndex);
  const unavailLabels: Record<string, string> = {};
  for (const id of outIds) {
    const entry = unavailableEntry(unavailIndex, id);
    if (entry) {
      unavailLabels[id] = `${reasonLabel(entry.reason)}${
        entry.note ? ` — ${entry.note}` : ""
      }`;
    }
  }

  // Weekend: no school, so no load to describe.
  if (dayIndex === null) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a5f]">Teacher Load</h1>
          <p className="text-sm text-slate-500">
            Daily class load for every teacher at a glance.
          </p>
        </div>
        <TeacherLoadView
          date={date}
          dayIndex={null}
          cards={[]}
          summary={{
            totalTeachers: teachers.length,
            totalClasses: 0,
            totalCovers: 0,
            fullyFree: 0,
            unavailable: 0,
            withCovers: 0,
          }}
          adjustedToday={false}
          suspendedClasses={suspendedClassList}
          busyLabels={{}}
          routineRows={[]}
          subjectLabels={subjectLabels}
          roomLabels={roomLabels}
          routineSectionLabels={routineSectionLabels}
          teacherLabels={teacherLabels}
        />
      </div>
    );
  }

  // Base (unadjusted) rows for the weekday, then that date's substitutions
  // overlaid. fixedIndex answers "their own schedule"; effectiveIndex answers
  // "what they actually teach on this date".
  const dayRoutines = liveRoutines.filter((r) => r.day === dayIndex);
  const effectiveDay = applyAdjustmentsToRoutines(
    dayRoutines,
    liveAdjustments,
    date,
  );
  const fixedIndex = buildRoutineIndex(dayRoutines);
  const effectiveIndex = buildRoutineIndex(effectiveDay);

  // Distinct cells each teacher picked up as a substitute on this date. Keyed
  // by section:period:role so a duplicate row can never inflate the count.
  const coverCells = new Map<string, Set<string>>();
  for (const a of liveAdjustments) {
    if (a.adjust_date !== date || !a.new_teacher_id) continue;
    let cells = coverCells.get(a.new_teacher_id);
    if (!cells) coverCells.set(a.new_teacher_id, (cells = new Set()));
    cells.add(`${a.section_id}:${a.period_number}:${a.is_tag ? 1 : 0}`);
  }

  // Per-period tooltip labels for the busy/free strip, built from the effective
  // day so a tooltip matches exactly what a red cell means. Primary preferred,
  // tag only fills in when there is no primary (matching the adjust builder).
  const busyLabels: BusyLabels = {};
  const picked = new Map<string, { primary?: string; tag?: string }>();
  for (const r of effectiveDay) {
    if (!r.teacher_id) continue;
    const subjectName = r.subject_id ? subjectLabels[r.subject_id] : undefined;
    const text = `${routineSectionLabels[r.section_id] ?? "—"} · ${subjectName ?? "—"}`;
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
    const text = slot.primary
      ? slot.primary
      : slot.tag
        ? `${slot.tag} · tag`
        : "";
    (busyLabels[teacherId] ??= {})[period] = text;
  }

  const cards: TeacherLoadCard[] = teachers
    .map((t) => {
      const busyPeriods = [...busyPeriodsIndexed(effectiveIndex, t.id, dayIndex)];
      const busyCount = busyPeriods.length;
      const fixedCount = dayCountIndexed(fixedIndex, t.id, dayIndex);
      const stretch = stretchIndexed(effectiveIndex, t.id, dayIndex);
      return {
        id: t.id,
        fullName: t.full_name,
        code: t.teacher_code,
        designation: t.designation,
        primarySubject: subjectLabel(t.primary_subject_id),
        isOpen: t.is_open_teacher,
        fixedCount,
        coverCount: coverCells.get(t.id)?.size ?? 0,
        busyCount,
        freeCount: PERIOD_ORDER.length - busyCount,
        stretch,
        level: teacherDayLoadIndexed(effectiveIndex, t.id, dayIndex).level,
        busyPeriods,
        unavailable: outIds.has(t.id) ? (unavailLabels[t.id] ?? "Unavailable") : null,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const summary: TeacherLoadSummary = {
    totalTeachers: teachers.length,
    totalClasses: effectiveDay.filter((r) => !r.is_tag).length,
    totalCovers: cards.reduce((sum, c) => sum + c.coverCount, 0),
    fullyFree: cards.filter((c) => c.busyCount === 0 && !c.unavailable).length,
    unavailable: outIds.size,
    withCovers: cards.filter((c) => c.coverCount > 0).length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Teacher Load</h1>
        <p className="text-sm text-slate-500">
          Every teacher&apos;s class load for{" "}
          {DAY_LABEL_LIST[dayIndex]}, {date} — fixed classes, covers picked up
          and occupied periods. Red is busy, green is free.
        </p>
      </div>
      <TeacherLoadView
        date={date}
        dayIndex={dayIndex}
        cards={cards}
        summary={summary}
        adjustedToday={effectiveDay.some((r) => r.is_adjusted)}
        suspendedClasses={suspendedClassList}
        busyLabels={busyLabels}
        routineRows={routineRows}
        subjectLabels={subjectLabels}
        roomLabels={roomLabels}
        routineSectionLabels={routineSectionLabels}
        teacherLabels={teacherLabels}
      />
    </div>
  );
}

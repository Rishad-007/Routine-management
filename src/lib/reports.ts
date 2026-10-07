import { weeklyLoad } from "./conflicts";
import {
  addDays,
  countSchoolDays,
  getSchoolDayIndexYmd,
  shortLabel,
  type ReportRange,
} from "./report-range";
import { UNAVAILABLE_REASON_LABELS } from "./unavailability";
import { DAY_LABELS, type AdjustmentRow, type ClassRow, type RoutineRow, type SectionRow, type SubjectRow, type TeacherRow, type TeacherUnavailabilityRow, type UnavailableReason } from "./types";

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const EMPTY_WEEKDAY = [0, 0, 0, 0, 0];

export interface LabeledCount {
  id: string | null;
  label: string;
  count: number;
}

export interface SeriesPoint {
  label: string;
  count: number;
}

export interface TeacherAbsenceEntry {
  teacherId: string;
  name: string;
  code: string;
  isOpen: boolean;
  /**
   * Days absent as INFERRED from substitutions — distinct dates carrying a
   * class this teacher did not teach. Derivable from adjustments alone, so it
   * stays adjustment-derived: a day where nothing was ever covered is by
   * definition invisible to it. `declaredDays` is the authoritative count.
   */
  daysAbsent: number;
  skipped: number;
  avgPerDay: number;
  byDate: { date: string; count: number }[];
  weekdayCounts: number[];
  subjectImpact: LabeledCount[];
  sectionImpact: LabeledCount[];
  /**
   * Days the admin DECLARED this teacher out for the whole day. Whole-day
   * records only — a period-scoped note is about one day's covers, not an
   * absence, and would inflate a report about who was OUT.
   */
  declaredDays: number;
  /** Declared day counts per reason, e.g. "On leave — 3". */
  declaredReasons: LabeledCount[];
}

export interface UnavailabilityReport {
  range: ReportRange;
  totalAffected: number;
  totalTeacherDays: number;
  totalSkipped: number;
  totalVacant: number;
  /** Whole-day teacher-days declared across the range, including days where
   *  no substitution was ever filed. */
  totalDeclaredDays: number;
  averagePerDay: number;
  busiestDate: string | null;
  busiestCount: number;
  series: SeriesPoint[];
  weekdayCounts: number[];
  subjectImpact: LabeledCount[];
  teachers: TeacherAbsenceEntry[];
}

export interface TeacherCoverageEntry {
  teacherId: string;
  name: string;
  code: string;
  isOpen: boolean;
  covered: number;
  primaryCovered: number;
  tagCovered: number;
  daysCovered: number;
  fixedWeekly: number;
  /**
   * The golden weekly base scaled to the report's range: day = /5, week = as-is,
   * month = *4, year = *48. This is the "Fixed class" column.
   */
  fixedInRange: number;
  /** fixedInRange + extraClasses for the same range — the "Total class" column. */
  totalInRange: number;
  /**
   * Classes taken in a period the teacher was NOT already timetabled to teach —
   * the genuinely additional periods, which is what "extra work" means to a
   * class teacher. A substitution handed to someone who is already in that period
   * is not extra, so it is excluded here.
   */
  extraClasses: number;
  /** Days on which at least one genuinely additional class was taken. */
  daysWithExtra: number;
  byDate: { date: string; count: number }[];
  weekdayCounts: number[];
  subjects: LabeledCount[];
}

export interface AdjustmentStatsReport {
  range: ReportRange;
  totalAdjustments: number;
  totalCovered: number;
  /** Covered classes taken outside the coverer's own timetable — real extra work. */
  totalExtraClasses: number;
  distinctSubstitutes: number;
  openSubstitutes: number;
  /** Substitutes who took at least one genuinely additional class. */
  teachersWithExtra: number;
  averagePerSchoolDay: number;
  series: SeriesPoint[];
  weekdayCounts: number[];
  primaryCount: number;
  tagCount: number;
  subjectImpact: LabeledCount[];
  teachers: TeacherCoverageEntry[];
}

function inRange(date: string, range: ReportRange): boolean {
  return date >= range.start && date <= range.end;
}

/**
 * Scale the fixed weekly load (the golden base) to a report range:
 * day = /5 (one school day), week = as-is, month = *4, year = *48 (4 weeks * 12).
 */
function scaleFixedWeekly(
  fixedWeekly: number,
  granularity: ReportRange["granularity"],
): number {
  let scaled: number;
  if (granularity === "day") scaled = fixedWeekly / 5;
  else if (granularity === "month") scaled = fixedWeekly * 4;
  else if (granularity === "year") scaled = fixedWeekly * 48;
  else scaled = fixedWeekly;
  return Math.round(scaled * 10) / 10;
}

function bump(map: Map<string, number>, key: string, delta = 1): void {
  map.set(key, (map.get(key) ?? 0) + delta);
}

function bumpByDate(
  byDate: { date: string; count: number }[],
  date: string,
): void {
  const found = byDate.find((b) => b.date === date);
  if (found) found.count++;
  else byDate.push({ date, count: 1 });
}

/** Aggregate per-element counts into a sorted LabeledCount list. */
function toLabeled(
  map: Map<string, number>,
  labels: Map<string, string>,
  unlabeled = "—",
): LabeledCount[] {
  return Array.from(map.entries())
    .map(([id, count]) => ({
      id,
      label: labels.get(id) ?? unlabeled,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

function buildSeries(
  counts: Map<string, number>,
  range: ReportRange,
): SeriesPoint[] {
  if (range.granularity === "year") {
    const year = range.start.slice(0, 4);
    return Array.from({ length: 12 }, (_, i) => {
      const prefix = `${year}-${String(i + 1).padStart(2, "0")}`;
      let count = 0;
      for (const [d, c] of counts) if (d.startsWith(prefix)) count += c;
      return { label: MONTH_SHORT[i], count };
    });
  }
  if (range.granularity === "month") {
    const out: SeriesPoint[] = [];
    let cursor = range.start;
    while (cursor <= range.end) {
      const idx = getSchoolDayIndexYmd(cursor);
      if (idx !== null) out.push({ label: shortLabel(cursor), count: counts.get(cursor) ?? 0 });
      cursor = addDays(cursor, 1);
    }
    return out;
  }
  if (range.granularity === "week") {
    return Array.from({ length: 5 }, (_, i) => ({
      label: DAY_LABELS[i],
      count: counts.get(addDays(range.start, i)) ?? 0,
    }));
  }
  return [{ label: shortLabel(range.start), count: counts.get(range.start) ?? 0 }];
}

/**
 * `teacherId -> day -> set of "period:isTag"` slots that teacher already teaches.
 *
 * Built once per report so a coverage row can be tested against the timetable.
 */
function slotIndex(routines: RoutineRow[]): Map<string, Map<number, Set<string>>> {
  const index = new Map<string, Map<number, Set<string>>>();
  for (const r of routines) {
    if (!r.teacher_id) continue;
    let days = index.get(r.teacher_id);
    if (!days) index.set(r.teacher_id, (days = new Map()));
    let slots = days.get(r.day);
    if (!slots) days.set(r.day, (slots = new Set()));
    slots.add(`${r.period_number}:${r.is_tag ? 1 : 0}`);
  }
  return index;
}

function buildUnavailabilityReport(
  adjustments: AdjustmentRow[],
  teachers: TeacherRow[],
  sections: SectionRow[],
  classes: ClassRow[],
  subjects: SubjectRow[],
  range: ReportRange,
  unavailability: TeacherUnavailabilityRow[],
): UnavailabilityReport {
  const nameById = new Map(teachers.map((t) => [t.id, t.full_name]));
  const codeById = new Map(teachers.map((t) => [t.id, t.teacher_code]));
  const openById = new Map(teachers.map((t) => [t.id, t.is_open_teacher]));
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  const sectionLabel = new Map(
    sections.map((s) => [
      s.id,
      `${classMap.get(s.class_id) ?? "—"} — Section ${s.name}`,
    ]),
  );

  const teacherMap = new Map<string, TeacherAbsenceEntry>();
  const dateTotals = new Map<string, number>();
  const weekdayTotals = [...EMPTY_WEEKDAY];
  const subjectTotals = new Map<string, number>();
  let totalVacant = 0;

  for (const a of adjustments) {
    if (!inRange(a.adjust_date, range)) continue;

    if (!a.original_teacher_id) {
      totalVacant++;
      continue;
    }

    const weekday = getSchoolDayIndexYmd(a.adjust_date);
    if (weekday !== null) weekdayTotals[weekday]++;
    bump(dateTotals, a.adjust_date);
    if (a.original_subject_id) bump(subjectTotals, a.original_subject_id);

    const t = a.original_teacher_id;
    let entry = teacherMap.get(t);
    if (!entry) {
      entry = {
        teacherId: t,
        name: nameById.get(t) ?? "—",
        code: codeById.get(t) ?? "—",
        isOpen: openById.get(t) ?? false,
        daysAbsent: 0,
        skipped: 0,
        avgPerDay: 0,
        byDate: [],
        weekdayCounts: [...EMPTY_WEEKDAY],
        subjectImpact: [],
        sectionImpact: [],
        declaredDays: 0,
        declaredReasons: [],
      };
      teacherMap.set(t, entry);
    }
    entry.skipped++;
    bumpByDate(entry.byDate, a.adjust_date);
    if (weekday !== null) entry.weekdayCounts[weekday]++;
  }

  // Declared whole-day absences, merged after the adjustment pass so they can
  // ADD teachers the adjustment pass never saw. That gap is the reason this
  // feature exists: a teacher who was away but whose classes were never covered
  // is a row in no adjustment-derived list at all, and here they become one.
  //
  // Whole-day only, and counted once per (teacher, date): a whole-day record is
  // written as seven rows, so tallying rows would report seven absences for a
  // single day out.
  const declaredReasonLabels = new Map<string, string>(
    (Object.keys(UNAVAILABLE_REASON_LABELS) as UnavailableReason[]).map((r) => [
      r,
      UNAVAILABLE_REASON_LABELS[r],
    ]),
  );
  const declaredByTeacher = new Map<string, Map<string, string>>();
  let totalDeclaredDays = 0;
  for (const u of unavailability) {
    if (!u.is_whole_day) continue;
    if (!inRange(u.absent_date, range)) continue;
    let byDate = declaredByTeacher.get(u.teacher_id);
    if (!byDate) declaredByTeacher.set(u.teacher_id, (byDate = new Map()));
    if (byDate.has(u.absent_date)) continue;
    byDate.set(u.absent_date, u.reason);
    totalDeclaredDays++;
  }

  for (const [teacherId, byDate] of declaredByTeacher) {
    let entry = teacherMap.get(teacherId);
    if (!entry) {
      entry = {
        teacherId,
        name: nameById.get(teacherId) ?? "—",
        code: codeById.get(teacherId) ?? "—",
        isOpen: openById.get(teacherId) ?? false,
        daysAbsent: 0,
        skipped: 0,
        avgPerDay: 0,
        byDate: [],
        weekdayCounts: [...EMPTY_WEEKDAY],
        subjectImpact: [],
        sectionImpact: [],
        declaredDays: 0,
        declaredReasons: [],
      };
      teacherMap.set(teacherId, entry);
    }
    entry.declaredDays = byDate.size;
    const reasonCounts = new Map<string, number>();
    for (const reason of byDate.values()) bump(reasonCounts, reason);
    entry.declaredReasons = toLabeled(reasonCounts, declaredReasonLabels);
  }

  const teachersSorted = Array.from(teacherMap.values())
    .map((e) => ({
      ...e,
      byDate: e.byDate.sort((a, b) => a.date.localeCompare(b.date)),
    }))
    // Declared days lead: it is the authoritative "was this teacher out" signal,
    // and it is 0 for every row when nothing has been declared — so a
    // declaration-free install sorts exactly as it did before, by skipped.
    .sort(
      (a, b) =>
        b.declaredDays - a.declaredDays ||
        b.skipped - a.skipped ||
        a.name.localeCompare(b.name),
    );

  const totalSkipped = teachersSorted.reduce((sum, e) => sum + e.skipped, 0);
  const busiest = Array.from(dateTotals.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0];

  // Per-teacher subject/section impact requires a second pass or pre-aggregation.
  const subjectByTeacher = new Map<string, Map<string, number>>();
  const sectionByTeacher = new Map<string, Map<string, number>>();
  for (const a of adjustments) {
    if (!inRange(a.adjust_date, range)) continue;
    const t = a.original_teacher_id;
    if (!t) continue;
    if (a.original_subject_id) {
      let m = subjectByTeacher.get(t);
      if (!m) subjectByTeacher.set(t, (m = new Map()));
      bump(m, a.original_subject_id);
    }
    if (a.section_id) {
      let m = sectionByTeacher.get(t);
      if (!m) sectionByTeacher.set(t, (m = new Map()));
      bump(m, a.section_id);
    }
  }
  for (const e of teachersSorted) {
    e.subjectImpact = toLabeled(
      subjectByTeacher.get(e.teacherId) ?? new Map(),
      subjectName,
    );
    e.sectionImpact = toLabeled(
      sectionByTeacher.get(e.teacherId) ?? new Map(),
      sectionLabel,
    );
    e.daysAbsent = e.byDate.length;
    e.avgPerDay = e.daysAbsent > 0 ? Math.round((e.skipped / e.daysAbsent) * 10) / 10 : 0;
  }

  return {
    range,
    totalAffected: teachersSorted.length,
    totalTeacherDays: teachersSorted.reduce((sum, e) => sum + e.byDate.length, 0),
    totalSkipped,
    totalVacant,
    totalDeclaredDays,
    averagePerDay:
      countSchoolDays(range) > 0
        ? Math.round((totalSkipped / countSchoolDays(range)) * 10) / 10
        : 0,
    busiestDate: busiest?.[0] ?? null,
    busiestCount: busiest?.[1] ?? 0,
    series: buildSeries(dateTotals, range),
    weekdayCounts: weekdayTotals,
    subjectImpact: toLabeled(subjectTotals, subjectName),
    teachers: teachersSorted,
  };
}

function buildAdjustmentStatsReport(
  adjustments: AdjustmentRow[],
  routines: RoutineRow[],
  teachers: TeacherRow[],
  subjects: SubjectRow[],
  range: ReportRange,
): AdjustmentStatsReport {
  const nameById = new Map(teachers.map((t) => [t.id, t.full_name]));
  const codeById = new Map(teachers.map((t) => [t.id, t.teacher_code]));
  const openById = new Map(teachers.map((t) => [t.id, t.is_open_teacher]));
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));

  const slots = slotIndex(routines);
  const extraDays = new Map<string, Set<string>>();

  const teacherMap = new Map<string, TeacherCoverageEntry>();
  const dateTotals = new Map<string, number>();
  const weekdayTotals = [...EMPTY_WEEKDAY];
  const subjectTotals = new Map<string, number>();
  let primaryCount = 0;
  let tagCount = 0;
  let totalAdjustments = 0;
  let totalCovered = 0;
  let totalExtra = 0;

  for (const a of adjustments) {
    if (!inRange(a.adjust_date, range)) continue;
    totalAdjustments++;
    if (a.is_tag) tagCount++;
    else primaryCount++;

    bump(dateTotals, a.adjust_date);
    const weekday = getSchoolDayIndexYmd(a.adjust_date);
    if (weekday !== null) weekdayTotals[weekday]++;
    if (a.new_subject_id) bump(subjectTotals, a.new_subject_id);

    if (!a.new_teacher_id) continue;
    totalCovered++;

    const t = a.new_teacher_id;
    let entry = teacherMap.get(t);
    if (!entry) {
      entry = {
        teacherId: t,
        name: nameById.get(t) ?? "—",
        code: codeById.get(t) ?? "—",
        isOpen: openById.get(t) ?? false,
        covered: 0,
        primaryCovered: 0,
        tagCovered: 0,
        daysCovered: 0,
        fixedWeekly: 0,
        fixedInRange: 0,
        totalInRange: 0,
        extraClasses: 0,
        daysWithExtra: 0,
        byDate: [],
        weekdayCounts: [...EMPTY_WEEKDAY],
        subjects: [],
      };
      teacherMap.set(t, entry);
    }
    entry.covered++;
    if (a.is_tag) entry.tagCovered++;
    else entry.primaryCovered++;
    bumpByDate(entry.byDate, a.adjust_date);
    if (weekday !== null) entry.weekdayCounts[weekday]++;

    // Extra work = the period was NOT already on this teacher's timetable for
    // that weekday, so they were called in for a slot they did not have to teach.
    if (
      weekday !== null &&
      !slots.get(t)?.get(weekday)?.has(`${a.period_number}:${a.is_tag ? 1 : 0}`)
    ) {
      entry.extraClasses++;
      totalExtra++;
      let days = extraDays.get(t);
      if (!days) extraDays.set(t, (days = new Set()));
      days.add(a.adjust_date);
    }
  }

  const subjectByTeacher = new Map<string, Map<string, number>>();
  for (const a of adjustments) {
    if (!inRange(a.adjust_date, range)) continue;
    if (!a.new_teacher_id || !a.new_subject_id) continue;
    let m = subjectByTeacher.get(a.new_teacher_id);
    if (!m) subjectByTeacher.set(a.new_teacher_id, (m = new Map()));
    bump(m, a.new_subject_id);
  }

  const teachersSorted = Array.from(teacherMap.values())
    .map((e) => {
      const fixedWeekly = weeklyLoad(routines, e.teacherId).total;
      const fixedInRange = scaleFixedWeekly(fixedWeekly, range.granularity);
      return {
        ...e,
        byDate: e.byDate.sort((a, b) => a.date.localeCompare(b.date)),
        daysCovered: e.byDate.length,
        daysWithExtra: extraDays.get(e.teacherId)?.size ?? 0,
        fixedWeekly,
        fixedInRange,
        totalInRange: fixedInRange + e.extraClasses,
        subjects: toLabeled(subjectByTeacher.get(e.teacherId) ?? new Map(), subjectName),
      };
    })
    .sort(
      (a, b) =>
        b.extraClasses - a.extraClasses ||
        b.covered - a.covered ||
        a.name.localeCompare(b.name),
    );

  return {
    range,
    totalAdjustments,
    totalCovered,
    totalExtraClasses: totalExtra,
    distinctSubstitutes: teachersSorted.length,
    openSubstitutes: teachersSorted.filter((e) => e.isOpen).length,
    teachersWithExtra: teachersSorted.filter((e) => e.extraClasses > 0).length,
    averagePerSchoolDay:
      Math.round((totalAdjustments / countSchoolDays(range)) * 10) / 10,
    series: buildSeries(dateTotals, range),
    weekdayCounts: weekdayTotals,
    primaryCount,
    tagCount,
    subjectImpact: toLabeled(subjectTotals, subjectName),
    teachers: teachersSorted,
  };
}

export { buildUnavailabilityReport, buildAdjustmentStatsReport };
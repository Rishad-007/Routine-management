"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Save,
  Search,
  AlertTriangle,
  RotateCcw,
  Users,
  BookOpen,
  FileText,
  Loader2,
  Eye,
  ChevronDown,
  History,
} from "lucide-react";
import { cn, normalizeSearch } from "@/lib/utils";
import { PeriodStrip } from "@/components/admin/period-strip";
import {
  DAY_LABEL_LIST,
  PERIOD_ORDER,
  TIFFIN_AFTER_PERIOD,
} from "@/lib/constants";
import {
  getSchoolDayIndex,
  getSchoolToday,
  getSchoolWeekRange,
} from "@/lib/periods";
import { buildTeacherRoutinePreview } from "@/lib/teacher-routine-preview";
import {
  applyAdjustmentsToRoutines,
  applyWeekAdjustmentsToRoutines,
  buildRoutineIndex,
  busyPeriodsIndexed,
  isCoveringIndexed,
  dayCountIndexed,
  isBusyIndexed,
  simulateTeacherAssignment,
  stretchIndexed,
} from "@/lib/conflicts";
import {
  isPeriodAllowed,
  describePeriodRange,
  type ClassPeriodRule,
} from "@/lib/class-period-rules";
import {
  removeAdjustment,
  saveAllAdjustments,
  type PeriodAdjustment,
} from "@/app/admin/adjust/actions";
import type {
  ClassRow,
  SectionRow,
  TeacherRow,
  TeacherSubjectRow,
  SubjectRow,
  RoomRow,
  RoutineRow,
  AdjustmentRow,
  TeacherUnavailabilityRow,
} from "@/lib/types";
import {
  isUnavailableAt,
  reasonLabel,
  unavailableEntry,
  unavailablePeriods,
  unavailableTeacherIds,
  unavailabilityIndex,
} from "@/lib/unavailability";

interface Props {
  classes: ClassRow[];
  sections: SectionRow[];
  teachers: TeacherRow[];
  teacherSubjects: TeacherSubjectRow[];
  subjects: SubjectRow[];
  rooms: RoomRow[];
  routines: RoutineRow[];
  adjustments: AdjustmentRow[];
  initialDate?: string;
  rules: ClassPeriodRule[];
  /**
   * Every unavailability row, all dates. Indexed against the picked `date`
   * below rather than here, since the date is picked in this component.
   */
  unavailability: TeacherUnavailabilityRow[];
}

/** Tooltip text for a period a teacher is occupied at, per assignment role. */
interface PeriodLabels {
  /** Label from their primary row — preferred, since that is the real clash. */
  primary?: string;
  /** Label from their tag row, used only when they hold no primary role here. */
  tag?: string;
}

interface DayCell {
  period: number;
  sectionId: string;
  subjectId: string | null;
  subjectName: string;
  className: string;
  sectionName: string;
  /** Teacher from the BASE weekly routine, i.e. the genuine original. */
  baseTeacherId: string;
  /** Teacher actually teaching now (pending override, else saved adjustment). */
  effectiveTeacherId: string;
  isAdjusted: boolean;
  /** A saved adjustment exists for this primary slot (not just a local one). */
  hasSavedAdjustment: boolean;
  /**
   * This period was substituted away from the selected teacher, so it no longer
   * appears in their effective routine. The row is kept purely so the saved
   * adjustment stays visible and revertible from their own grid — without it
   * Revert is only reachable from the substitute's grid.
   */
  isDetached: boolean;
  isTag: boolean;
  tagSubjectId: string | null;
  /** Original tag teacher from the BASE routine. */
  tagTeacherId: string | null;
  tagRoomId: string | null;
  tagSubjectName: string;
  tagEffectiveTeacherId: string;
  isTagAdjusted: boolean;
  /** A saved adjustment exists for this tag slot. */
  hasSavedTagAdjustment: boolean;
  originalSubjectId: string | null;
  originalRoomId: string | null;
  tagOriginalSubjectId: string | null;
  tagOriginalRoomId: string | null;
}

interface TagOverride {
  newTeacherId: string | null;
  newSubjectId: string | null;
  newRoomId: string | null;
}

export function AdjustBuilder({
  classes,
  sections,
  teachers,
  teacherSubjects,
  subjects,
  rooms,
  routines,
  adjustments,
  initialDate,
  rules,
  unavailability,
}: Props) {
  const router = useRouter();

  const [date, setDate] = useState(
    () => initialDate ?? getSchoolToday(),
  );
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(
    null,
  );
  const [overrides, setOverrides] = useState<
    Record<
      number,
      { newTeacherId: string | null; sectionId: string; reason: string }
    >
  >({});
  const [tagOverrides, setTagOverrides] = useState<Record<number, TagOverride>>(
    {},
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetPeriod, setSheetPeriod] = useState<number | null>(null);
  const [sheetTab, setSheetTab] = useState<"primary" | "tag">("primary");
  const [expandedBusyId, setExpandedBusyId] = useState<string | null>(null);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [sheetSearch, setSheetSearch] = useState("");
  const [sheetSubjectFilter, setSheetSubjectFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingRed, setPendingRed] = useState<{
    adjustment: PeriodAdjustment;
    reasons: string[];
    // "assign": the change is NOT yet in overrides (a red pick), so confirmRed
    // must pass it to handleSave explicitly. "save": the change came from an
    // existing override list, so re-saving already includes it.
    source: "assign" | "save";
  } | null>(null);
  const [pendingYellow, setPendingYellow] = useState<{
    detail: string;
  } | null>(null);
  const [routineTeacherId, setRoutineTeacherId] = useState<string | null>(null);
  // Period awaiting a destructive clear, confirmed in the dialog below.
  const [pendingRevert, setPendingRevert] = useState<{
    period: number;
    isTag: boolean;
    label: string;
  } | null>(null);
  const [reverting, setReverting] = useState(false);

  const dayIndex = useMemo(
    () => getSchoolDayIndex(new Date(date + "T00:00:00")),
    [date],
  );
  const isNoSchool = dayIndex === null;

  // Declared unavailability for the picked date. Recomputed on `date` rather
  // than filtered once: this sheet is the only surface that honours PERIOD-only
  // records, and their whole meaning is "on that one date".
  const unavailIndex = useMemo(
    () => unavailabilityIndex(unavailability, date),
    [unavailability, date],
  );

  // The rail's scope: only teachers declared unavailable on the picked date.
  // This page's job is covering absences, so a teacher who is present and
  // teaching has nothing to adjust here.
  const unavailableOnDate = useMemo(
    () => unavailableTeacherIds(unavailIndex),
    [unavailIndex],
  );

  // Keep the selection inside the rail. On load and every date change, if the
  // selected teacher is no longer unavailable (or hasn't been picked yet),
  // surface the first unavailable teacher immediately so the day grid is
  // useful without an extra click.
  useEffect(() => {
    if (isNoSchool) return;
    if (!selectedTeacherId || !unavailableOnDate.has(selectedTeacherId)) {
      const first = teachers.find((t) => unavailableOnDate.has(t.id));
      setSelectedTeacherId(first?.id ?? null);
    }
  }, [unavailableOnDate, teachers, selectedTeacherId, isNoSchool]);

  // Past dates are permanently stored history — viewable & downloadable
  // but not editable. Future/today dates remain editable.
  const isPastDate = useMemo(
    () => (date ? date < getSchoolToday() : false),
    [date],
  );

  // Substitutions are date-scoped, so only this weekday's rows may be
  // overlaid. applyAdjustmentsToRoutines keys on section+period+is_tag without
  // a day, so handing it the whole week would rewrite the same section/period
  // on every other day as well.
  const effectiveRoutines = useMemo(() => {
    if (dayIndex === null) return routines;
    return [
      ...routines.filter((r) => r.day !== dayIndex),
      ...applyAdjustmentsToRoutines(
        routines.filter((r) => r.day === dayIndex),
        adjustments,
        date,
      ),
    ];
  }, [routines, adjustments, date, dayIndex]);

  // Free/busy and load lookups below read from `pendingIndex` (this day only)
  // instead of rescanning 3000+ rows per teacher.
  const subjectMap = useMemo(
    () => new Map(subjects.map((s) => [s.id, s])),
    [subjects],
  );

  const roomMap = useMemo(
    () => new Map(rooms.map((r) => [r.id, r])),
    [rooms],
  );

  const adjustmentHistory = useMemo(() => {
    const groups = new Map<string, AdjustmentRow[]>();
    for (const adjustment of adjustments) {
      const rows = groups.get(adjustment.adjust_date) ?? [];
      rows.push(adjustment);
      groups.set(adjustment.adjust_date, rows);
    }

    return Array.from(groups, ([adjustDate, rows]) => {
      const day = getSchoolDayIndex(new Date(`${adjustDate}T00:00:00`));
      return {
        adjustDate,
        dayLabel: day === null ? "Weekend" : DAY_LABEL_LIST[day],
        rows: rows.sort((a, b) => {
          if (a.period_number !== b.period_number) {
            return a.period_number - b.period_number;
          }
          return a.section_id.localeCompare(b.section_id);
        }),
      };
    }).sort((a, b) => b.adjustDate.localeCompare(a.adjustDate));
  }, [adjustments]);

  // Class period-range helpers (see class_period_rules). Adjustments write the
  // same period_number column as routines, so they obey the same rule. The day
  // used is the SELECTED date's day-of-week — Thursday ranges can be tighter.
  const classForSection = (sectionId: string) => {
    const s = sections.find((x) => x.id === sectionId);
    return s ? classes.find((c) => c.id === s.class_id) : undefined;
  };
  const sectionPeriodAllowed = (
    sectionId: string,
    day: number,
    period: number,
  ) => {
    const cls = classForSection(sectionId);
    return cls ? isPeriodAllowed(rules, cls.id, day, period) : true;
  };
  const sectionPeriodRangeLabel = (sectionId: string, day: number) => {
    const cls = classForSection(sectionId);
    return cls ? describePeriodRange(rules, cls.id, day) : null;
  };

  const selectedTeacher = useMemo(
    () => teachers.find((t) => t.id === selectedTeacherId) ?? null,
    [teachers, selectedTeacherId],
  );

  const routineTeacher = useMemo(
    () => teachers.find((teacher) => teacher.id === routineTeacherId) ?? null,
    [teachers, routineTeacherId],
  );

  // Live class showing: the candidate's weekly preview must include any cover
  // they picked up this week, otherwise the eye dialog disagrees with the
  // free/busy split sitting right next to it. Deliberately built from the raw
  // `routines` prop rather than `effectiveRoutines` (which is scoped to the
  // single picked date) so all five weekdays are covered.
  const previewRoutines = useMemo(
    () =>
      applyWeekAdjustmentsToRoutines(routines, adjustments, new Date()),
    [routines, adjustments],
  );

  const routinePreview = useMemo(() => {
    if (!routineTeacherId) return null;

    return buildTeacherRoutinePreview({
      routines: previewRoutines,
      teacherId: routineTeacherId,
      subjectLabel: (id) => {
        const subject = subjectMap.get(id);
        return subject?.short_name ?? subject?.name ?? "—";
      },
      sectionLabel: (id) => {
        const section = sections.find((item) => item.id === id);
        const classRow = section
          ? classes.find((item) => item.id === section.class_id)
          : undefined;
        return section && classRow ? `${classRow.name}-${section.name}` : "—";
      },
      roomLabel: (id) => rooms.find((item) => item.id === id)?.name ?? "—",
      teacherLabel: (id) =>
        teachers.find((item) => item.id === id)?.full_name ?? "",
    });
  }, [
    routineTeacherId,
    previewRoutines,
    sections,
    classes,
    subjectMap,
    rooms,
    teachers,
  ]);

  const dayRoutines = useMemo(() => {
    if (!selectedTeacherId || dayIndex === null) return [];
    return effectiveRoutines.filter(
      (r) => r.teacher_id === selectedTeacherId && r.day === dayIndex,
    );
  }, [effectiveRoutines, selectedTeacherId, dayIndex]);

  // The weekly BASE rows for the selected weekday, with no teacher filter and
  // no adjustment overlay.
  //
  // `dayRoutines` cannot be used to recover the original teacher: after a
  // substitution its `teacher_id` has already been overwritten with the
  // substitute, so reading `primary.teacher_id` back out returned the
  // substitute and `original_teacher_id` was rewritten on every subsequent
  // edit (A -> B, then B -> A recorded "original = B"). The base row is the
  // only trustworthy source for what the period was before any adjustment.
  const baseDayRoutines = useMemo(() => {
    if (dayIndex === null) return [];
    return routines.filter((r) => r.day === dayIndex);
  }, [routines, dayIndex]);

  const dayCells: DayCell[] = useMemo(() => {
    if (!selectedTeacherId || dayIndex === null) return [];
    const cells: DayCell[] = [];
    for (const p of PERIOD_ORDER) {
      const primary = dayRoutines.find(
        (x) => x.period_number === p && !x.is_tag,
      );
      const tag = dayRoutines.find((x) => x.period_number === p && x.is_tag);

      // A teacher can hold a TAG slot without owning the PRIMARY one (the slot
      // belongs to another teacher; this one assists). Requiring `primary` here
      // silently dropped those periods, so the rail badge — which counts
      // primary AND tag — disagreed with the grid and hid a real class.
      // Fall back to the tag row and blank out the primary-only fields.
      //
      // The above is only true while they *still* hold the period. If an
      // adjustment has substituted them away, `dayRoutines` (filtered by
      // current effective teacher) returns nothing, so we also look in the base
      // (unadjusted) routine: ownBasePrimary / ownBaseTag prove they were the
      // original holder and let us display a "substituted away" row, so Revert
      // remains reachable from the same teacher's grid.
      const ownBasePrimary = baseDayRoutines.find(
        (x) => x.period_number === p && !x.is_tag && x.teacher_id === selectedTeacherId,
      );
      const ownBaseTag = baseDayRoutines.find(
        (x) => x.period_number === p && x.is_tag && x.teacher_id === selectedTeacherId,
      );

      const anchor = primary ?? tag ?? ownBasePrimary ?? ownBaseTag;
      if (!anchor) continue;
      const isDetached = !primary && !tag;

      const subject = primary?.subject_id
        ? subjectMap.get(primary.subject_id)
        : undefined;
      const classRow = classes.find((c) => {
        const s = sections.find((x) => x.id === anchor.section_id);
        return s && c.id === s.class_id;
      });
      const sectionRow = sections.find((x) => x.id === anchor.section_id);

      // `ownBase*` is already filtered to this teacher's own base rows, so using
      // it as the fallback is safe for tag-only teachers too: they never owned
      // the primary, so `ownBasePrimary` is undefined and nothing leaks across.
      const existingPrimaryAdj = adjustments.find(
        (a) =>
          a.adjust_date === date &&
          a.section_id ===
            (primary?.section_id ?? ownBasePrimary?.section_id ?? "") &&
          a.period_number === p &&
          !a.is_tag,
      );
      const existingTagAdj = adjustments.find(
        (a) =>
          a.adjust_date === date &&
          a.section_id ===
            (tag?.section_id ?? ownBaseTag?.section_id ?? "") &&
          a.period_number === p &&
          a.is_tag,
      );

      const override = primary ? overrides[p] : undefined;
      const tagOv = tagOverrides[p];

      // Original (pre-adjustment) values come from the base weekly rows, keyed
      // by section+period+role rather than by teacher. After a substitution the
      // selected teacher may not own the slot at all, so `dayRoutines` can only
      // describe who is teaching NOW — never who taught before.
      const basePrimary =
        primary || ownBasePrimary
          ? baseDayRoutines.find(
              (x) =>
                x.section_id ===
                  (primary?.section_id ?? ownBasePrimary?.section_id) &&
                x.period_number === p &&
                !x.is_tag,
            )
          : undefined;
      const baseTag =
        tag || ownBaseTag
          ? baseDayRoutines.find(
              (x) =>
                x.section_id ===
                  (tag?.section_id ?? ownBaseTag?.section_id) &&
                x.period_number === p &&
                x.is_tag,
            )
          : undefined;

      const effectiveTeacherId = override
        ? (override.newTeacherId ?? "")
        : (existingPrimaryAdj?.new_teacher_id ?? "");
      const tagEffectiveTeacherId = tagOv
        ? (tagOv.newTeacherId ?? "")
        : (existingTagAdj?.new_teacher_id ?? "");
      // A substituted-away row has no `tag` to read a subject from, so fall
      // back to the base row's subject — otherwise the tag line renders as "—".
      const tagBaseSubjectId = tag?.subject_id ?? baseTag?.subject_id;
      const tagEffectiveSubjectName = tagOv?.newSubjectId
        ? subjectMap.get(tagOv.newSubjectId)?.name
        : existingTagAdj?.new_subject_id
          ? subjectMap.get(existingTagAdj.new_subject_id)?.name
          : tagBaseSubjectId
            ? subjectMap.get(tagBaseSubjectId)?.name
            : undefined;

      cells.push({
        period: p,
        sectionId: anchor.section_id,
        // A substituted-away row has no effective `primary`, and `subject` above
        // is derived from `primary` only, so read the subject from the base row
        // instead — otherwise the row renders "—" on exactly the rows that most
        // need to stay legible. `basePrimary` stays undefined for a teacher who
        // only ever holds a tag, which keeps the primary block hidden for them.
        subjectId: primary?.subject_id ?? basePrimary?.subject_id ?? null,
        subjectName:
          subject?.name ??
          (basePrimary?.subject_id
            ? (subjectMap.get(basePrimary.subject_id)?.name ?? "—")
            : "—"),
        className: classRow?.name ?? "—",
        sectionName: sectionRow?.name ?? "—",
        baseTeacherId: basePrimary?.teacher_id ?? "",
        effectiveTeacherId,
        isAdjusted: !!existingPrimaryAdj || !!override,
        // Set when a SAVED adjustment exists (as opposed to a pending local
        // override) — that is what the Revert / Remove actions act on.
        hasSavedAdjustment: !!existingPrimaryAdj,
        isDetached,
        // `baseTag` is defined only when this teacher owns or holds the tag
        // session, so a teacher with no tag involvement never gains a tag line
        // or a spurious "Revert tag".
        isTag: !!baseTag,
        tagSubjectId: tag?.subject_id ?? baseTag?.subject_id ?? null,
        tagTeacherId: baseTag?.teacher_id ?? null,
        tagRoomId: baseTag?.room_id ?? null,
        tagSubjectName: tagEffectiveSubjectName ?? "—",
        tagEffectiveTeacherId: tagEffectiveTeacherId || tag?.teacher_id || "",
        isTagAdjusted: !!existingTagAdj || !!tagOv,
        hasSavedTagAdjustment: !!existingTagAdj,
        originalSubjectId: basePrimary?.subject_id ?? null,
        originalRoomId: basePrimary?.room_id ?? null,
        tagOriginalSubjectId: baseTag?.subject_id ?? null,
        tagOriginalRoomId: baseTag?.room_id ?? null,
      });
    }
    return cells;
  }, [
    dayRoutines,
    baseDayRoutines,
    selectedTeacherId,
    dayIndex,
    subjectMap,
    classes,
    sections,
    adjustments,
    date,
    overrides,
    tagOverrides,
  ]);

  const railTeachers = useMemo(() => {
    const q = normalizeSearch(teacherSearch);
    const base = teachers.filter((t) => unavailableOnDate.has(t.id));
    if (!q) return base;
    return base.filter(
      (t) =>
        normalizeSearch(t.full_name).includes(q) ||
        normalizeSearch(t.short_name).includes(q) ||
        normalizeSearch(t.teacher_code).includes(q) ||
        normalizeSearch(t.id).includes(q),
    );
  }, [teachers, teacherSearch, unavailableOnDate]);

  // Fold the pending (unsaved) overrides into the active day's schedule so the
  // candidate lists, busy states and load counts stay truthful WHILE editing —
  // a teacher you just assigned turns busy/counts higher immediately, matching
  // what a save would produce. Keeps effectiveRoutines untouched for display.
  const pendingRoutines = useMemo(() => {
    if (dayIndex === null) return effectiveRoutines;
    const rows = effectiveRoutines.map((r) => ({ ...r }));
    for (const [p, o] of Object.entries(overrides)) {
      if (!o.newTeacherId) continue;
      const target = rows.find(
        (r) =>
          r.day === dayIndex &&
          r.period_number === Number(p) &&
          r.section_id === o.sectionId &&
          !r.is_tag,
      );
      if (target) target.teacher_id = o.newTeacherId;
    }
    for (const [p, to] of Object.entries(tagOverrides)) {
      const cell = dayCells.find((c) => c.period === Number(p));
      if (!cell || !to.newTeacherId) continue;
      const target = rows.find(
        (r) =>
          r.day === dayIndex &&
          r.period_number === Number(p) &&
          r.section_id === cell.sectionId &&
          r.is_tag,
      );
      if (target) {
        target.teacher_id = to.newTeacherId;
        if (to.newSubjectId !== undefined) target.subject_id = to.newSubjectId;
        if (to.newRoomId !== undefined) target.room_id = to.newRoomId;
      }
    }
    return rows;
  }, [effectiveRoutines, overrides, tagOverrides, dayCells, dayIndex]);

  const pendingIndex = useMemo(
    () => buildRoutineIndex(pendingRoutines),
    [pendingRoutines],
  );

  const teacherDayCounts = useMemo(() => {
    const map = new Map<string, number>();
    if (dayIndex === null) return map;
    for (const t of teachers) {
      map.set(t.id, dayCountIndexed(pendingIndex, t.id, dayIndex));
    }
    return map;
  }, [teachers, pendingIndex, dayIndex]);

  // Per-teacher stats for the active day: class count + longest continuous
  // stretch. Used by the teacher rail and the assignment sheet.
  const teacherDayStats = useMemo(() => {
    const map = new Map<string, { count: number; stretch: number }>();
    if (dayIndex === null) return map;
    for (const t of teachers) {
      map.set(t.id, {
        count: dayCountIndexed(pendingIndex, t.id, dayIndex),
        stretch: stretchIndexed(pendingIndex, t.id, dayIndex),
      });
    }
    return map;
  }, [teachers, pendingIndex, dayIndex]);

  // Authoritative busy set for the active period, built directly from the same
  // rows the grid renders (adjustments + pending overrides included). The sheet
  // shows busy teachers at the bottom, disabled — this set is the single source.
  const busyTeachersForPeriod = useMemo(() => {
    if (sheetPeriod === null || dayIndex === null) return new Set<string>();
    const set = new Set<string>();
    for (const r of pendingRoutines) {
      if (
        r.day === dayIndex &&
        r.period_number === sheetPeriod &&
        r.teacher_id
      ) {
        set.add(r.teacher_id);
      }
    }
    return set;
  }, [pendingRoutines, dayIndex, sheetPeriod]);

  // Teacher ids that cover the currently selected subject, precomputed once so
  // the per-teacher map below stays O(n). Open teachers always qualify, so a
  // subject selection never hides the people most likely to be free.
  const sheetSubjectTeacherIds = useMemo(() => {
    if (!sheetSubjectFilter) return null;
    const ids = new Set<string>();
    for (const ts of teacherSubjects) {
      if (ts.subject_id === sheetSubjectFilter) ids.add(ts.teacher_id);
    }
    return ids;
  }, [teacherSubjects, sheetSubjectFilter]);

  const currentSheetCell = sheetPeriod
    ? dayCells.find((c) => c.period === sheetPeriod)
    : null;

  // How many classes each teacher has TAKEN as a substitute this school week
  // (Sun–Thu of the picked date — it resets on Sunday by construction).
  //
  // Saved rows from `adjustments` cover the whole week; the picked date's rows
  // are re-keyed by cell so a staged `overrides`/`tagOverrides` pick replaces
  // the saved holder instead of double-counting. That makes the badge move the
  // instant a substitute is picked (before Save) and fall back on resetCell /
  // resetAll, while Revert and Save stay correct via the refreshed prop.
  const weekAdjCounts = useMemo(() => {
    const map = new Map<string, number>();
    if (!date) return map;
    const { start, end } = getSchoolWeekRange(new Date(`${date}T00:00:00`));
    const add = (teacherId: string | null | undefined) => {
      if (teacherId) map.set(teacherId, (map.get(teacherId) ?? 0) + 1);
    };

    // cellKey -> new_teacher_id for the picked date, so staged picks can
    // overwrite one cell without affecting the rest of the week.
    const pickedDateCells = new Map<string, string | null>();
    for (const a of adjustments) {
      if (a.adjust_date < start || a.adjust_date > end) continue;
      if (a.adjust_date === date) {
        pickedDateCells.set(
          `${a.section_id}:${a.period_number}:${a.is_tag ? 1 : 0}`,
          a.new_teacher_id,
        );
        continue;
      }
      add(a.new_teacher_id);
    }

    // Stage the unsaved picks on top of that date's saved cells.
    for (const [period, o] of Object.entries(overrides)) {
      pickedDateCells.set(`${o.sectionId}:${period}:0`, o.newTeacherId);
    }
    for (const [period, to] of Object.entries(tagOverrides)) {
      const cell = dayCells.find((c) => c.period === Number(period));
      if (!cell) continue;
      pickedDateCells.set(
        `${cell.sectionId}:${period}:1`,
        to.newTeacherId,
      );
    }

    for (const teacherId of pickedDateCells.values()) add(teacherId);
    return map;
  }, [adjustments, date, overrides, tagOverrides, dayCells]);

  const sheetTeacherRows = useMemo(() => {
    if (sheetPeriod === null || dayIndex === null) return [];
    return teachers
      .map((t) => ({
        ...t,
        dayCount: dayCountIndexed(pendingIndex, t.id, dayIndex),
        stretch: stretchIndexed(pendingIndex, t.id, dayIndex),
        weekTotal: pendingIndex.weeklyTotal.get(t.id) ?? 0,
        adjCount: weekAdjCounts.get(t.id) ?? 0,
        busy: busyTeachersForPeriod.has(t.id),
        // True when this teacher holds the cell only because of a saved
        // substitution, so the sheet can separate a genuine weekly class from
        // a one-week cover.
        isCovering: isCoveringIndexed(pendingIndex, t.id, dayIndex, sheetPeriod),
        // The substitute currently recorded for this slot, so an admin editing
        // an existing adjustment can see who it already is.
        isCurrentHolder: sheetTab === "primary"
          ? t.id === currentSheetCell?.effectiveTeacherId
          : t.id === currentSheetCell?.tagEffectiveTeacherId,
        // Declared out at THIS period. Deliberately `isUnavailableAt` and not
        // the whole-day test: this is the one surface where a period-scoped
        // record has any meaning, so it must not be filtered to whole-day only.
        unavailable:
          sheetPeriod !== null &&
          isUnavailableAt(unavailIndex, t.id, sheetPeriod),
        unavailEntry: unavailableEntry(unavailIndex, t.id),
        unavailPeriods: unavailablePeriods(unavailIndex, t.id),
        subjectMatch:
          !!sheetSubjectFilter &&
          (t.is_open_teacher ||
            t.primary_subject_id === sheetSubjectFilter ||
            !!sheetSubjectTeacherIds?.has(t.id)),
      }))
      .sort(
        (a, b) =>
          // Subject picks lead, then open teachers, then the lightest load.
          // Everyone else still appears, just after them — an admin who needs
          // a specific teacher must never be blocked by the subject filter.
          // Array.prototype.sort is stable, so the search below keeps this order.
          Number(b.subjectMatch) - Number(a.subjectMatch) ||
          Number(b.is_open_teacher) - Number(a.is_open_teacher) ||
          a.dayCount - b.dayCount ||
          a.weekTotal - b.weekTotal ||
          a.full_name.localeCompare(b.full_name),
      );
  }, [
    teachers,
    pendingIndex,
    dayIndex,
    sheetPeriod,
    sheetTab,
    currentSheetCell,
    busyTeachersForPeriod,
    sheetSubjectFilter,
    sheetSubjectTeacherIds,
    unavailIndex,
    weekAdjCounts,
  ]);

  const searchedSheetTeachers = useMemo(() => {
    const q = normalizeSearch(sheetSearch);
    if (!q) return sheetTeacherRows;
    // Searches the FULL list, not just subject matches, and matches on id as
    // well as name/code so any teacher is reachable by typing.
    return sheetTeacherRows.filter(
      (t) =>
        normalizeSearch(t.full_name).includes(q) ||
        normalizeSearch(t.teacher_code).includes(q) ||
        normalizeSearch(t.id).includes(q),
    );
  }, [sheetTeacherRows, sheetSearch]);

  // Unavailable teachers are EXCLUDED from the sheet entirely: they are not a
  // candidate at any role on the date, so listing them — even disabled — would
  // read as "there is a reason to pick them". Both bucket filters drop them.
  const freeSheetTeachers = useMemo(
    () => searchedSheetTeachers.filter((t) => !t.busy && !t.unavailable),
    [searchedSheetTeachers],
  );
  const busySheetTeachers = useMemo(
    () => searchedSheetTeachers.filter((t) => t.busy && !t.unavailable),
    [searchedSheetTeachers],
  );

  // How many teachers the period-scoped exclusion dropped from BOTH buckets.
  // Hiding them silently would leave "where did he go?" unanswerable, so the
  // sheet counts them out loud instead.
  const excludedSheetCount = useMemo(
    () => searchedSheetTeachers.filter((t) => t.unavailable).length,
    [searchedSheetTeachers],
  );

  // The busy (disabled) section can expand a teacher to see the classes THEY
  // teach on the selected day — i.e. why they are blocked at this period.
  const teacherDaySchedule = (teacherId: string) => {
    if (dayIndex === null) return [];
    return pendingRoutines
      .filter((r) => r.day === dayIndex && r.teacher_id === teacherId)
      .map((r) => {
        const s = sections.find((x) => x.id === r.section_id);
        const c = s ? classes.find((x) => x.id === s.class_id) : undefined;
        return {
          period: r.period_number,
          isTag: r.is_tag,
          subjectName: r.subject_id ? subjectMap.get(r.subject_id)?.name : "—",
          className: c?.name ?? "—",
          sectionName: s?.name ?? "—",
        };
      })
      .sort((a, b) => a.period - b.period);
  };

  // What each teacher is actually teaching at each occupied period on the active
  // day, as a tooltip label ("Class 8-Mashaeli · Mathematics"). Built in one pass
  // over the day's rows rather than per card, so the period strip below costs
  // O(1) per cell instead of rescanning every routine per teacher.
  const teacherPeriodLabels = useMemo(() => {
    const map = new Map<string, Map<number, PeriodLabels>>();
    if (dayIndex === null) return map;

    const sectionLabels = new Map(
      sections.map((s) => {
        const cls = classes.find((c) => c.id === s.class_id);
        return [s.id, cls ? `${cls.name}-${s.name}` : s.name] as const;
      }),
    );

    for (const r of pendingRoutines) {
      if (r.day !== dayIndex || !r.teacher_id) continue;

      let byPeriod = map.get(r.teacher_id);
      if (!byPeriod) map.set(r.teacher_id, (byPeriod = new Map()));

      const subjectName = r.subject_id
        ? subjectMap.get(r.subject_id)?.name
        : undefined;
      const label = `${sectionLabels.get(r.section_id) ?? "—"} · ${subjectName ?? "—"}`;

      const slot = byPeriod.get(r.period_number) ?? {};
      // Prefer the primary row when one teacher holds both roles in a cell,
      // matching how buildTeacherRoutinePreview resolves its rowAt.
      if (r.is_tag) slot.tag ??= label;
      else slot.primary = label;
      byPeriod.set(r.period_number, slot);
    }

    return map;
  }, [pendingRoutines, dayIndex, sections, classes, subjectMap]);

  // Per-period free/busy strip for a teacher card. Reads the same pending index
  // the load counts do, so it repaints the moment an assignment is made, before
  // anything is saved. The rendering itself lives in <PeriodStrip>.
  const teacherPeriodStrip = (teacherId: string) => {
    if (dayIndex === null) return null;

    const busy = busyPeriodsIndexed(pendingIndex, teacherId, dayIndex);
    const labels = teacherPeriodLabels.get(teacherId);

    return (
      <PeriodStrip
        busy={busy}
        className="mt-2"
        describe={(period) => {
          const detail = labels?.get(period);
          if (!detail) return null;
          // A cell occupied only as the second (tag) teacher is still a clash —
          // the DB trigger counts it — but the tooltip says so, since that class
          // can be freed by dropping the tag rather than the whole period.
          const tagOnly = !detail.primary && !!detail.tag;
          return `${detail.primary ?? detail.tag}${tagOnly ? " · tag" : ""}`;
        }}
      />
    );
  };

  const handleCellClick = (
    period: number,
    tab: "primary" | "tag" = "primary",
  ) => {
    if (isPastDate) return; // historical dates are read-only
    setSheetPeriod(period);
    setSheetTab(tab);
    setSheetSearch("");
    setSheetSubjectFilter(getSheetFilterSubject(period, tab));
    setExpandedBusyId(null);
    setSheetOpen(true);
  };

  /** Subject to filter substitutes on by default, matching the cell's session. */
  function getSheetFilterSubject(
    period: number,
    tab: "primary" | "tag",
  ): string {
    const cell = dayCells.find((c) => c.period === period);
    if (!cell) return "";
    if (tab === "tag") return cell.tagSubjectId ?? "";
    return cell.subjectId ?? "";
  }

  const handleAssignPrimary = (period: number, newTeacherId: string) => {
    const cell = dayCells.find((c) => c.period === period);
    if (!cell) return;

    // Class period-range rule: adjustment writes period_number like a routine,
    // so it must fall inside the class's allowed range for the selected date.
    if (!sectionPeriodAllowed(cell.sectionId, dayIndex!, period)) {
      toast.error(
        `${classForSection(cell.sectionId)?.name ?? "This class"} only has ${sectionPeriodRangeLabel(cell.sectionId, dayIndex!)} on ${DAY_LABEL_LIST[dayIndex!]} — period ${period} is not allowed for adjustments.`,
      );
      return;
    }

    // Re-picking the current holder (the original teacher, a saved substitute,
    // or someone already overridden this session) is a no-op: drop any pending
    // override and keep whatever is currently scheduled.
    if (
      newTeacherId === cell.baseTeacherId ||
      (cell.effectiveTeacherId && newTeacherId === cell.effectiveTeacherId)
    ) {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[period];
        return next;
      });
      setSheetOpen(false);
      return;
    }

    const sim = simulateTeacherAssignment(
      pendingRoutines,
      newTeacherId,
      dayIndex!,
      period,
      cell.sectionId,
      false,
    );

    // HARD BLOCK: the substitute has been declared unavailable on this date.
    // Unlike the busy check below there is nothing to "free first" — the record
    // is an explicit statement that they are not present, so it is neither a
    // conflict to force-approve nor a warning to override. The only way past it
    // is to clear the declaration on Mark Unavailable.
    if (isUnavailableAt(unavailIndex, newTeacherId, period)) {
      const entry = unavailableEntry(unavailIndex, newTeacherId);
      const name =
        teachers.find((t) => t.id === newTeacherId)?.full_name ?? "This teacher";
      toast.error(
        `${name} is marked unavailable on ${date}${
          entry ? ` — ${reasonLabel(entry.reason).toLowerCase()}` : ""
        }. Clear it on Mark Unavailable before assigning.`,
      );
      return;
    }

    // HARD BLOCK: the substitute is already teaching another class at this
    // day+period. This is a double-booking and cannot be force-approved.
    if (isBusyIndexed(pendingIndex, newTeacherId, dayIndex!, period)) {
      toast.error(
        "This teacher already has a class in another section at this period. Free them first before assigning.",
      );
      return;
    }

    if (sim.level === "red") {
      setPendingRed({
        adjustment: {
          period,
          sectionId: cell.sectionId,
          isTag: false,
          originalTeacherId: cell.baseTeacherId,
          newTeacherId,
          originalSubjectId: null,
          newSubjectId: null,
          originalRoomId: null,
          newRoomId: null,
          reason: "",
          level: "red",
          reasons: sim.reasons,
        },
        reasons: sim.reasons,
        source: "assign",
      });
      return;
    }

    if (sim.level === "yellow") {
      toast.warning(`Warning: ${sim.reasons.join("; ")}`, {
        duration: 6000,
      });
    }

    setOverrides((prev) => ({
      ...prev,
      [period]: { newTeacherId, sectionId: cell.sectionId, reason: "" },
    }));
    setSheetOpen(false);
  };

  const handleAssignTag = (period: number, newTeacherId: string) => {
    const cell = dayCells.find((c) => c.period === period);
    if (!cell || !cell.isTag) return;

    if (!sectionPeriodAllowed(cell.sectionId, dayIndex!, period)) {
      toast.error(
        `${classForSection(cell.sectionId)?.name ?? "This class"} only has ${sectionPeriodRangeLabel(cell.sectionId, dayIndex!)} on ${DAY_LABEL_LIST[dayIndex!]} — period ${period} is not allowed for adjustments.`,
      );
      return;
    }

    // Picking the current tag holder (original, saved substitute, or a pending
    // one) is a no-op: clear any pending override and keep the current state.
    if (
      cell.tagEffectiveTeacherId &&
      newTeacherId === cell.tagEffectiveTeacherId
    ) {
      setTagOverrides((prev) => {
        const next = { ...prev };
        delete next[period];
        return next;
      });
      setSheetOpen(false);
      return;
    }

    // HARD BLOCK: same rule as the primary role — an unavailable teacher is not
    // free at any role in the cell, tag included.
    if (isUnavailableAt(unavailIndex, newTeacherId, period)) {
      const entry = unavailableEntry(unavailIndex, newTeacherId);
      const name =
        teachers.find((t) => t.id === newTeacherId)?.full_name ?? "This teacher";
      toast.error(
        `${name} is marked unavailable on ${date}${
          entry ? ` — ${reasonLabel(entry.reason).toLowerCase()}` : ""
        }. Clear it on Mark Unavailable before assigning.`,
      );
      return;
    }

    // HARD BLOCK: the substitute is already teaching another class at this
    // day+period (or will be, once pending edits save). Double-booking can
    // never be force-approved.
    if (isBusyIndexed(pendingIndex, newTeacherId, dayIndex!, period)) {
      toast.error(
        "This teacher already has a class in another section at this period. Free them first before assigning.",
      );
      return;
    }

    const sim = simulateTeacherAssignment(
      pendingRoutines,
      newTeacherId,
      dayIndex!,
      period,
      cell.sectionId,
      true,
    );
    if (sim.level === "red") {
      setPendingRed({
        adjustment: {
          period,
          sectionId: cell.sectionId,
          isTag: true,
          originalTeacherId: cell.tagEffectiveTeacherId,
          newTeacherId,
          originalSubjectId: null,
          newSubjectId: null,
          originalRoomId: null,
          newRoomId: null,
          reason: "",
          level: "red",
          reasons: sim.reasons,
        },
        reasons: sim.reasons,
        source: "assign",
      });
      return;
    }
    if (sim.level === "yellow") {
      toast.warning(`Warning: ${sim.reasons.join("; ")}`, {
        duration: 6000,
      });
    }

    setTagOverrides((prev) => ({
      ...prev,
      [period]: {
        ...prev[period],
        newTeacherId,
      },
    }));
    setSheetOpen(false);
  };

  const confirmRed = () => {
    if (!pendingRed) return;
    // A red PICK was never staged in overrides, so hand it to handleSave
    // explicitly; a red warning from a previous save is already in overrides.
    const extra = pendingRed.source === "assign" ? [pendingRed.adjustment] : [];
    setPendingRed(null);
    setPendingYellow(null);
    setSheetOpen(false);
    handleSave(true, extra);
  };

  const resetCell = (period: number) => {
    setPendingYellow(null);
    if (sheetTab === "tag") {
      setTagOverrides((prev) => {
        const next = { ...prev };
        delete next[period];
        return next;
      });
    } else {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[period];
        return next;
      });
    }
  };

  const resetAll = () => {
    setPendingYellow(null);
    setOverrides({});
    setTagOverrides({});
  };

  /**
   * Clear a SAVED adjustment for one period.
   *
   * Previously the only way back was to re-pick the original teacher and save
   * again, and `resetCell` merely deleted local state — after a successful save
   * there was no control at all that reached the database. Revert and Remove
   * share this one path: deleting the adjustment row restores the base weekly
   * routine, which is what "revert" means.
   */
  const confirmRevert = async () => {
    if (!pendingRevert || !selectedTeacherId) return;
    const cell = dayCells.find((c) => c.period === pendingRevert.period);
    if (!cell) return;

    setReverting(true);
    const res = await removeAdjustment(date, cell.sectionId, [
      { period: pendingRevert.period, isTag: pendingRevert.isTag },
    ]);
    setReverting(false);

    if (res.error) {
      toast.error(res.error);
      return;
    }

    // Drop any stale local edit for this period so the grid cannot show a
    // pending override that the database no longer has.
    if (pendingRevert.isTag) {
      setTagOverrides((prev) => {
        const next = { ...prev };
        delete next[pendingRevert.period];
        return next;
      });
    } else {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[pendingRevert.period];
        return next;
      });
    }

    toast.success(
      (res.removed ?? 0) > 0
        ? `Adjustment cleared for period ${pendingRevert.period}.`
        : "Nothing to clear — that period had no saved adjustment.",
    );
    setPendingRevert(null);
    setSheetOpen(false);
    router.refresh();
  };

  const handleSave = async (
    force = false,
    extraChanges: PeriodAdjustment[] = [],
  ) => {
    if (!selectedTeacherId || dayIndex === null) {
      toast.error("Select a teacher and a school day first.");
      return;
    }
    setSaving(true);
    setPendingYellow(null);

    const changes: PeriodAdjustment[] = [];

    for (const [period, o] of Object.entries(overrides)) {
      const cell = dayCells.find((c) => c.period === Number(period));
      if (!cell) continue;
      changes.push({
        period: Number(period),
        sectionId: o.sectionId,
        isTag: false,
        originalTeacherId: cell.baseTeacherId || null,
        newTeacherId: o.newTeacherId,
        originalSubjectId: cell.originalSubjectId,
        newSubjectId: null,
        originalRoomId: cell.originalRoomId,
        newRoomId: null,
        reason: o.reason || null,
        level: "ok",
        reasons: [],
      });
    }

    for (const [period, to] of Object.entries(tagOverrides)) {
      const cell = dayCells.find((c) => c.period === Number(period));
      if (!cell || !cell.isTag) continue;
      changes.push({
        period: Number(period),
        sectionId: cell.sectionId,
        isTag: true,
        originalTeacherId: cell.tagTeacherId,
        newTeacherId: to.newTeacherId,
        originalSubjectId: cell.tagOriginalSubjectId,
        newSubjectId: to.newSubjectId,
        originalRoomId: cell.tagOriginalRoomId,
        newRoomId: to.newRoomId,
        reason: null,
        level: "ok",
        reasons: [],
      });
    }

    // A force-confirmed red PICK isn't in the override maps, so it arrives here.
    // Dedupe by (section, period, role) keeping the LAST writer, so re-picking
    // over an already-staged period never sends two rows for the same key (the
    // DB upsert would reject that as "cannot affect row a second time").
    changes.push(...extraChanges);
    const byKey = new Map<string, PeriodAdjustment>();
    for (const c of changes) {
      byKey.set(`${c.sectionId}:${c.period}:${c.isTag}`, c);
    }
    const deduped = [...byKey.values()];

    // No actual substitutions to persist — bail out early with clear feedback.
    if (deduped.length === 0) {
      setSaving(false);
      toast.error("No changes to save.");
      return;
    }

    const res = await saveAllAdjustments(date, deduped, force);
    setSaving(false);
    setPendingYellow(null);

    if (res.error) {
      toast.error(res.error);
      return;
    }

    if (res.warnings && res.warnings.length > 0 && !force) {
      const hasRed = res.warnings.some((w) => w.level === "red");
      if (hasRed) {
        setPendingRed({
          adjustment: deduped[0],
          reasons: res.warnings.flatMap((w) => w.reasons),
          source: "save",
        });
        return;
      }
      const detail = res.warnings
        .map((w) => `Period ${w.period}: ${w.reasons.join(", ")}`)
        .join(" ");
      // Keep a persistent banner (not just a dismissible toast) so the
      // "Save anyway" action is always available until the user decides.
      setPendingYellow({ detail });
      return;
    }

    toast.success(`Saved ${res.savedCount ?? 0} adjustment(s) for ${date}`);
    setOverrides({});
    setTagOverrides({});
    setPendingYellow(null);
    router.refresh();
  };

  const hasChanges =
    Object.keys(overrides).length > 0 || Object.keys(tagOverrides).length > 0;

  const downloadReport = (reportDate = date) => {
    const reportDay = reportDate
      ? getSchoolDayIndex(new Date(`${reportDate}T00:00:00`))
      : null;
    if (!reportDate || reportDay === null) return;
    setReportLoading(true);
    const a = document.createElement("a");
    a.href = `/api/adjust-report.pdf?date=${reportDate}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => setReportLoading(false), 2500);
  };

  const currentTagOverride = sheetPeriod
    ? tagOverrides[sheetPeriod]
    : undefined;
  const currentPrimaryOverride = sheetPeriod
    ? overrides[sheetPeriod]
    : undefined;

  return (
    <div className="space-y-5">
      {/* Date selector */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-white p-4 shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">Adjustment date</p>
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setPendingYellow(null);
            }}
            className="w-44"
          />
        </div>
        {dayIndex !== null && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <BookOpen className="h-4 w-4" />
            <span>
              <strong>{DAY_LABEL_LIST[dayIndex]}</strong> routine
            </span>
          </div>
        )}
        {isPastDate && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-600">
            <BookOpen className="h-4 w-4" />
            <span>
              Historical date — <strong>read only</strong>
            </span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-3 rounded-lg border border-[#0d9488]/20 bg-teal-50/50 px-3 py-2">
          <div className="pr-1">
            <p className="text-xs font-semibold text-[#0d9488]">
              Daily Adjustment Report
            </p>
            <p className="text-[11px] text-slate-500">
              Whole-school PDF for {date || "—"}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setHistoryOpen(true)}
            className="border-[#1e3a5f] text-[#1e3a5f] hover:bg-[#1e3a5f] hover:text-white"
          >
            <History className="mr-1.5 h-3.5 w-3.5" />
            Check history
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadReport()}
            disabled={reportLoading || dayIndex === null}
            className="border-[#0d9488] text-[#0d9488] hover:bg-[#0d9488] hover:text-white"
          >
            {reportLoading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="mr-1.5 h-3.5 w-3.5" />
            )}
            {reportLoading ? "Preparing…" : "Download PDF"}
          </Button>
        </div>
      </div>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="flex max-h-[85vh] w-[min(94vw,900px)] flex-col gap-4 overflow-hidden p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#1e3a5f]">
              <History className="h-5 w-5 text-[#0d9488]" />
              Adjustment history
            </DialogTitle>
            <DialogDescription>
              Previous adjustment days are sorted from newest to oldest. Select
              a day to inspect its read-only routine or download its report.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
            {adjustmentHistory.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-400">
                No adjustment history yet.
              </div>
            ) : (
              adjustmentHistory.map((group) => (
                <div
                  key={group.adjustDate}
                  className="rounded-lg border border-slate-200 bg-white"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
                    <div>
                      <p className="font-semibold text-[#1e3a5f]">
                        {group.adjustDate} · {group.dayLabel}
                      </p>
                      <p className="text-xs text-slate-500">
                        {group.rows.length} adjustment
                        {group.rows.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDate(group.adjustDate);
                          setHistoryOpen(false);
                        }}
                      >
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        View day
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadReport(group.adjustDate)}
                        disabled={reportLoading}
                        className="border-[#0d9488] text-[#0d9488] hover:bg-[#0d9488] hover:text-white"
                      >
                        <FileText className="mr-1.5 h-3.5 w-3.5" />
                        Download PDF
                      </Button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-155 text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase text-slate-500">
                          <th className="px-4 py-2">Period</th>
                          <th className="px-4 py-2">Class</th>
                          <th className="px-4 py-2">Previous teacher</th>
                          <th className="px-4 py-2">Assigned teacher</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row) => {
                          const section = sections.find(
                            (item) => item.id === row.section_id,
                          );
                          const classRow = section
                            ? classes.find(
                                (item) => item.id === section.class_id,
                              )
                            : undefined;
                          const originalTeacher = row.original_teacher_id
                            ? teachers.find(
                                (item) => item.id === row.original_teacher_id,
                              )
                            : undefined;
                          const newTeacher = row.new_teacher_id
                            ? teachers.find(
                                (item) => item.id === row.new_teacher_id,
                              )
                            : undefined;
                          return (
                            <tr
                              key={row.id}
                              className="border-t border-slate-100"
                            >
                              <td className="px-4 py-2 font-medium text-slate-600">
                                P{row.period_number}
                                {row.is_tag ? " · Tag" : ""}
                              </td>
                              <td className="px-4 py-2 text-[#1e3a5f]">
                                {classRow && section
                                  ? `${classRow.name}-${section.name}`
                                  : (section?.name ?? "—")}
                              </td>
                              <td className="px-4 py-2 text-slate-600">
                                {originalTeacher?.full_name ?? "—"}
                              </td>
                              <td className="px-4 py-2 font-medium text-[#0d9488]">
                                {newTeacher?.full_name ?? "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {isNoSchool ? (
        <div className="rounded-xl border border-dashed bg-white p-14 text-center text-sm text-slate-400">
          This is a weekend (Friday/Saturday) — no routine to adjust. Pick a
          Sunday–Thursday date.
        </div>
      ) : (
        <div className="flex gap-4">
          {/* Teacher rail */}
          <div className="flex w-64 shrink-0 flex-col rounded-xl border bg-white shadow-sm">
            <div className="border-b p-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search by name, code or ID..."
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <p className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  <strong className="text-violet-700">{railTeachers.length}</strong>{" "}
                  unavailable
                </span>
                <span className="text-slate-400">{date}</span>
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {railTeachers.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  No teachers marked unavailable on {date}. Declare someone on
                  Mark Unavailable first.
                </div>
              ) : (
                railTeachers.map((t) => {
                  const isSelected = t.id === selectedTeacherId;
                const dayCount = teacherDayCounts.get(t.id) ?? 0;
                const stretch = teacherDayStats.get(t.id)?.stretch ?? 0;
                const heavy = dayCount >= 4;
                const red = dayCount >= 5;
                // Badge only — never a filter. This is the rail an admin opens
                // to reassign AWAY from the absent teacher, so hiding them here
                // would hide exactly the person whose classes need covering.
                const unavail = unavailableEntry(unavailIndex, t.id);
                const outPeriods = unavail
                  ? unavailablePeriods(unavailIndex, t.id)
                  : [];
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTeacherId(t.id)}
                    className={cn(
                      "w-full px-3 py-2.5 text-left text-sm transition-colors border-b last:border-b-0",
                      isSelected
                        ? "bg-[#0d9488]/10 text-[#0b7a70]"
                        : "hover:bg-slate-50",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">
                        {t.full_name}
                      </span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[11px] font-medium",
                          red
                            ? "bg-red-100 text-red-700"
                            : heavy
                              ? "bg-amber-100 text-amber-700"
                              : dayCount >= 3
                                ? "bg-slate-100 text-slate-600"
                                : "bg-emerald-100 text-emerald-700",
                        )}
                        title={`${dayCount} classes today${
                          stretch >= 1 ? ` · ${stretch} continuous` : ""
                        }`}
                      >
                        {dayCount}P{stretch >= 3 ? ` ·${stretch}cont` : ""}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-xs text-slate-500">
                      <span>{t.teacher_code}</span>
                      <span className="flex items-center gap-1.5">
                        {unavail && (
                          <span
                            className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700"
                            title={`${reasonLabel(unavail.reason)}${
                              unavail.note ? ` — ${unavail.note}` : ""
                            } · ${
                              unavail.isWholeDay
                                ? "whole day"
                                : `P${outPeriods.join(", P")}`
                            }`}
                          >
                            {unavail.isWholeDay
                              ? "out"
                              : outPeriods.length === 1
                                ? `P${outPeriods[0]}`
                                : `P${outPeriods[0]}+${outPeriods.length - 1}`}
                          </span>
                        )}
                        {stretch >= 3 && (
                          <span className="text-amber-600">
                            {stretch} continuous
                          </span>
                        )}
                      </span>
                    </div>
                  </button>
                );
                })
              )}
            </div>
          </div>

          {/* Teacher day grid */}
          <div className="flex-1">
            {!selectedTeacher ? (
              <div className="flex h-full min-h-[300px] items-center justify-center rounded-xl border border-dashed bg-white text-sm text-slate-400">
                <Users className="mr-2 h-4 w-4" />
                Select a teacher to view their routine
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-[#1e3a5f]">
                      {selectedTeacher.full_name}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {selectedTeacher.teacher_code} —{" "}
                      {DAY_LABEL_LIST[dayIndex!]} routine for {date}
                    </p>
                  </div>
                  {hasChanges && !isPastDate && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={resetAll}>
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        Reset all
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSave(false)}
                        disabled={saving}
                        className="bg-[#0d9488] text-white hover:bg-[#0b7a70]"
                      >
                        {saving ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="mr-1 h-3.5 w-3.5" />
                        )}
                        {saving ? "Saving…" : "Save changes"}
                      </Button>
                    </div>
                  )}
                </div>

                {pendingYellow && (
                  <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
                    <div className="flex gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div className="text-sm text-amber-800">
                        <p className="font-semibold">Minor workload warnings</p>
                        <p>{pendingYellow.detail}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPendingYellow(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="bg-amber-600 text-white hover:bg-amber-700"
                        disabled={saving}
                        onClick={() => {
                          setPendingYellow(null);
                          handleSave(true);
                        }}
                      >
                        <Save className="mr-1 h-3.5 w-3.5" />
                        Save anyway
                      </Button>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
                  <table className="w-full border-collapse text-base">
                    <thead>
                      <tr>
                        <th className="w-16 border border-slate-200 bg-[#1e3a5f] px-2 py-2.5 text-center text-sm font-semibold uppercase text-white">
                          P
                        </th>
                        <th className="border border-slate-200 bg-[#f1f5f9] px-3 py-2.5 text-left text-sm font-semibold uppercase text-slate-600">
                          Class
                        </th>
                        <th className="border border-slate-200 bg-[#f1f5f9] px-3 py-2.5 text-left text-sm font-semibold uppercase text-slate-600">
                          Session
                        </th>
                        <th className="border border-slate-200 bg-[#f1f5f9] px-3 py-2.5 text-left text-sm font-semibold uppercase text-slate-600">
                          Status
                        </th>
                        <th className="w-24 border border-slate-200 bg-[#f1f5f9] px-3 py-2.5 text-center text-sm font-semibold uppercase text-slate-600">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayCells.map((cell) => {
                        const override = overrides[cell.period];
                        const hasOverride = !!override;
                        const outOfRange =
                          dayIndex !== null &&
                          !sectionPeriodAllowed(
                            cell.sectionId,
                            dayIndex,
                            cell.period,
                          );
                        const effectiveName = override
                          ? teachers.find((t) => t.id === override.newTeacherId)
                              ?.full_name
                          : cell.effectiveTeacherId
                            ? teachers.find(
                                (t) => t.id === cell.effectiveTeacherId,
                              )?.full_name
                            : null;

                        const tagOv = tagOverrides[cell.period];
                        const hasTagOverride = !!tagOv;
                        const tagEffectiveSubject = tagOv?.newSubjectId
                          ? subjectMap.get(tagOv.newSubjectId)?.name
                          : cell.tagSubjectName;

                        // Who each slot would return to if the saved
                        // adjustment is cleared. These come from the BASE
                        // routine, so they stay correct no matter how many
                        // times the period has been re-adjusted.
                        const originalTeacherName = cell.baseTeacherId
                          ? teachers.find((t) => t.id === cell.baseTeacherId)
                              ?.full_name
                          : null;
                        const originalTagTeacherName = cell.tagTeacherId
                          ? teachers.find((t) => t.id === cell.tagTeacherId)
                              ?.full_name
                          : null;
                        // Room of this session. Adjustments don't move primary
                        // rooms, so the base routine's room is current; tag-only
                        // periods fall back to the tag session's room.
                        const cellRoom = roomMap.get(
                          cell.originalRoomId ?? cell.tagRoomId ?? "",
                        )?.name;

                        return (
                          <tr
                            key={cell.period}
                            className={cn(
                              "transition-colors",
                              (hasOverride ||
                                hasTagOverride ||
                                cell.isDetached ||
                                cell.hasSavedAdjustment ||
                                cell.hasSavedTagAdjustment) &&
                                "bg-amber-50",
                            )}
                          >
                            <td className="border border-slate-200 px-2 py-2 text-center text-sm font-bold text-slate-600">
                              P{cell.period}
                              {cell.period === TIFFIN_AFTER_PERIOD && (
                                <span className="block text-xs font-normal text-amber-500">
                                  Tiffin↓
                                </span>
                              )}
                              {outOfRange && (
                                <Badge
                                  variant="secondary"
                                  className="mt-0.5 block bg-red-100 text-[9px] text-red-700"
                                  title={`${classForSection(cell.sectionId)?.name ?? "This class"} only has ${sectionPeriodRangeLabel(cell.sectionId, dayIndex!)} on ${DAY_LABEL_LIST[dayIndex!]}`}
                                >
                                  outside allowed
                                </Badge>
                              )}
                            </td>
                            <td className="border border-slate-200 px-3 py-2">
                              <span className="flex flex-wrap items-baseline gap-x-1">
                                <span className="text-base font-medium text-[#1e3a5f]">
                                  {cell.className}-{cell.sectionName}
                                </span>
                                {cellRoom && (
                                  <span className="text-sm text-slate-400">
                                    · {cellRoom}
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="border border-slate-200 px-3 py-2">
                              {/* Primary session — hidden for tag-only periods */}
                              {cell.baseTeacherId && (
                                <div>
                                  <span className="text-base font-medium text-slate-700">
                                    {cell.subjectName}
                                  </span>
                                  <span className="ml-1 text-sm text-slate-500">
                                    ·{" "}
                                    {effectiveName ?? selectedTeacher.full_name}
                                  </span>
                                  {(hasOverride || cell.isAdjusted) && (
                                    <Badge
                                      variant="secondary"
                                      className="ml-1 text-xs"
                                    >
                                      Adj
                                    </Badge>
                                  )}
                                </div>
                              )}
                              {/* Tag row */}
                              {cell.isTag && (
                                <div className="mt-1 border-t border-dashed border-teal-200 pt-1">
                                  <span className="text-base font-medium text-teal-700">
                                    {tagEffectiveSubject ?? "—"}
                                  </span>
                                  <span className="ml-1 text-sm text-teal-600">
                                    ·{" "}
                                    {teachers.find(
                                      (t) =>
                                        t.id === cell.tagEffectiveTeacherId,
                                    )?.full_name || "—"}
                                  </span>
                                  {cell.isTagAdjusted && (
                                    <Badge
                                      variant="secondary"
                                      className="ml-1 bg-teal-100 text-xs text-teal-700"
                                    >
                                      Tag Adj
                                    </Badge>
                                  )}
                                  <Badge
                                    variant="secondary"
                                    className="ml-1 bg-teal-100 text-xs text-teal-700"
                                  >
                                    Tag
                                  </Badge>
                                </div>
                              )}
                            </td>
                            <td className="border border-slate-200 px-3 py-2">
                              {hasOverride || cell.isAdjusted ? (
                                <div className="flex items-center gap-1.5">
                                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                                  <span className="text-base font-medium text-amber-700">
                                    {effectiveName ?? "—"}
                                  </span>
                                  <Badge
                                    variant="secondary"
                                    className="text-sm"
                                  >
                                    Adjusted
                                  </Badge>
                                </div>
                              ) : (
                                <span className="text-base text-slate-500">
                                  {selectedTeacher.full_name}
                                </span>
                              )}
                            </td>
                            <td className="border border-slate-200 px-2 py-2 text-center">
                              <div className="flex flex-col gap-1">
                                {/* Tag-only periods have no primary assignment
                                    to replace, so Change is hidden and Tag is
                                    the only action. */}
                                {cell.baseTeacherId && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      handleCellClick(cell.period, "primary")
                                    }
                                    disabled={isPastDate || outOfRange}
                                    className="h-8 text-sm"
                                  >
                                    Change
                                  </Button>
                                )}
                                {cell.isTag && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      handleCellClick(cell.period, "tag")
                                    }
                                    disabled={isPastDate || outOfRange}
                                    className="h-8 text-sm text-teal-600"
                                  >
                                    Tag
                                  </Button>
                                )}

                                {/* Saved adjustments need a way back. Shown
                                    only when the change is in the database and
                                    no pending local edit is masking it. */}
                                {!isPastDate && cell.hasSavedAdjustment && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      setPendingRevert({
                                        period: cell.period,
                                        isTag: false,
                                        label: cell.isDetached
                                          ? `Return period ${cell.period} to you`
                                          : originalTeacherName
                                            ? `Restore ${originalTeacherName} to period ${cell.period}`
                                            : `Remove the adjustment on period ${cell.period}`,
                                      })
                                    }
                                    disabled={outOfRange || reverting}
                                  className="h-8 border-amber-300 text-xs text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                                >
                                    {cell.isDetached ? "Revert to mine" : "Revert"}
                                  </Button>
                                )}
                                {/* Detached row: a saved adjustment moved this
                                    period off this teacher. They still need to
                                    see it and be able to undo it — before this,
                                    the row vanished from their grid entirely
                                    (dayRoutines filters by current effective
                                    teacher) and Revert was only reachable from
                                    the substitute's grid. */}
                                {!isPastDate && cell.isDetached && cell.hasSavedAdjustment && (
                                  <p className="px-1 text-[10px] leading-tight text-slate-500">
                                    Substituted away from you
                                    {effectiveName ? ` to ${effectiveName}` : ""}.
                                    Revert returns this period to you.
                                  </p>
                                )}
                                {!isPastDate && cell.hasSavedTagAdjustment && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      setPendingRevert({
                                        period: cell.period,
                                        isTag: true,
                                        label: originalTagTeacherName
                                          ? `Restore ${originalTagTeacherName} to the tag session in period ${cell.period}`
                                          : `Remove the tag adjustment on period ${cell.period}`,
                                      })
                                    }
                                    disabled={outOfRange || reverting}
                                    className="h-8 border-amber-300 text-xs text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                                  >
                                    Revert tag
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Weekly routine preview for a candidate teacher */}
      <Dialog
        open={!!routineTeacher}
        onOpenChange={(open) => !open && setRoutineTeacherId(null)}
      >
        <DialogContent className="flex h-[min(92vh,900px)] max-h-[92vh] w-[90vw] sm:max-w-[1200px] flex-col gap-3 overflow-hidden p-5">
          {routineTeacher && routinePreview && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#1e3a5f]">
                  {routineTeacher.full_name}&apos;s routine
                </DialogTitle>
                <DialogDescription>
                  {routineTeacher.teacher_code} · Weekly base routine.
                  Continuous classes are highlighted; tiffin separates the runs.
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
                <table className="h-full w-full min-w-[1050px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 border border-slate-200 bg-[#1e3a5f] px-3 py-3 text-left text-white">
                        Day
                      </th>
                      {PERIOD_ORDER.map((period) => (
                        <th
                          key={period}
                          className={cn(
                            "border border-slate-200 px-3 py-3 text-center text-slate-600",
                            period === TIFFIN_AFTER_PERIOD &&
                              "border-r-2 border-r-amber-300",
                          )}
                        >
                          P{period}
                          {period === TIFFIN_AFTER_PERIOD && (
                            <span className="block text-[10px] font-normal text-amber-600">
                              Tiffin
                            </span>
                          )}
                        </th>
                      ))}
                      <th className="border border-slate-200 bg-slate-50 px-3 py-3 text-center text-slate-600">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {DAY_LABEL_LIST.map((day, dayNumber) => {
                      const daily = routinePreview.daily[dayNumber];
                      return (
                        <tr key={day}>
                          <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-3 py-3 font-semibold text-slate-700">
                            {day}
                          </td>
                          {PERIOD_ORDER.map((period) => {
                            const cell = routinePreview.cells.get(
                              `${dayNumber}:${period}`,
                            );
                            const isContinuous = (cell?.continuous ?? 0) >= 2;
                            return (
                              <td
                                key={period}
                                className={cn(
                                  "border border-slate-200 px-2 py-3 text-center align-top",
                                  period === TIFFIN_AFTER_PERIOD &&
                                    "border-r-2 border-r-amber-300",
                                  isContinuous && "bg-amber-50",
                                  (cell?.continuous ?? 0) >= 3 &&
                                    "bg-orange-100",
                                  // Cover cells get a dashed teal edge so a
                                  // one-week stand-in never reads as part of
                                  // this teacher's permanent week.
                                  cell?.isAdjusted &&
                                    "border-2 border-dashed border-teal-400",
                                )}
                              >
                                {cell ? (
                                  <div className="space-y-0.5">
                                    <p className="font-semibold text-[#1e3a5f]">
                                      {cell.classLabel}
                                    </p>
                                    <p className="text-slate-600">
                                      {cell.subject}
                                      {cell.isTag && " · Tag"}
                                    </p>
                                    <p className="text-xs text-slate-400">
                                      {cell.room}
                                    </p>
                                    {cell.isAdjusted && (
                                      <Badge
                                        className="bg-teal-100 px-1 py-0 text-[9px] text-teal-800"
                                        title={cell.coveringFor}
                                      >
                                        Cover
                                        {cell.originalTeacherName
                                          ? ` for ${cell.originalTeacherName}`
                                          : ""}
                                      </Badge>
                                    )}
                                    {isContinuous && (
                                      <Badge className="bg-amber-200 px-1 py-0 text-[9px] text-amber-900">
                                        {cell.continuous} continuous
                                      </Badge>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-200">·</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="border border-slate-200 bg-slate-50 px-3 py-3 text-center font-semibold text-slate-700">
                            {daily.count}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-slate-50 px-3 py-2 text-sm">
                <span className="font-semibold text-[#1e3a5f]">
                  Weekly total: {routinePreview.total} classes
                </span>
                <span className="text-slate-600">
                  Selected day:{" "}
                  {routinePreview.daily[dayIndex ?? 0]?.count ?? 0} classes
                </span>
                <span className="font-medium text-amber-700">
                  Longest continuous: {routinePreview.longest} periods
                </span>
                <span className="text-teal-700">
                  Tiffin separates continuous runs
                </span>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Teacher assignment sheet */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="flex w-[70vw] max-w-[1200px] max-h-[85vh] flex-col gap-3 overflow-hidden p-5">
          <DialogHeader>
            <DialogTitle>
              {sheetTab === "tag"
                ? `Tag session — Period ${sheetPeriod}`
                : `Assign teacher — Period ${sheetPeriod}`}
              {/* Which class is being covered — same format the grid row
                  uses, so the sheet can't be mistaken for another cell. */}
              {currentSheetCell && (
                <>
                  {" · "}
                  {currentSheetCell.className}-{currentSheetCell.sectionName}
                </>
              )}
              {/* The date decides who is unavailability-blocked, so it belongs
                  in the title: a mark on another day silently does not apply
                  here, and with no date shown that reads as a bug. */}
              {dayIndex !== null && <> · {DAY_LABEL_LIST[dayIndex]}</>} · {date}
            </DialogTitle>
            <DialogDescription>
              {sheetTab === "tag"
                ? "Select a free teacher for the tag session. Overrides subject/room too."
                : 'Pick a free teacher for this period. Busy teachers are shown for reference; load, continuous stretch and "already 4/5 classes" help you choose.'}
            </DialogDescription>
          </DialogHeader>

          {/* Tag session overrides (subject/room/teacher) */}
          {sheetTab === "tag" && sheetPeriod && (
            <div className="space-y-3 px-4 pt-2">
              <div className="space-y-1">
                <p className="text-xs font-medium text-teal-600">Tag Subject</p>
                <Select
                  value={
                    currentTagOverride?.newSubjectId ??
                    currentSheetCell?.tagSubjectId ??
                    "none"
                  }
                  onValueChange={(v) => {
                    if (!sheetPeriod) return;
                    setTagOverrides((prev) => ({
                      ...prev,
                      [sheetPeriod]: {
                        ...prev[sheetPeriod],
                        newSubjectId: v === "none" ? null : v,
                      },
                    }));
                    setSheetSubjectFilter(v === "none" ? "" : v ?? "");
                  }}
                  items={[
                    { value: "none", label: "— Same —" },
                    ...subjects.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Same —</SelectItem>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-teal-600">Tag Room</p>
                <Select
                  value={
                    currentTagOverride?.newRoomId ??
                    currentSheetCell?.tagRoomId ??
                    "none"
                  }
                  onValueChange={(v) => {
                    if (!sheetPeriod) return;
                    setTagOverrides((prev) => ({
                      ...prev,
                      [sheetPeriod]: {
                        ...prev[sheetPeriod],
                        newRoomId: v === "none" ? null : v,
                      },
                    }));
                  }}
                  items={[
                    { value: "none", label: "— Same —" },
                    ...rooms.map((r) => ({ value: r.id, label: r.name })),
                  ]}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select room" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Same —</SelectItem>
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="border-t border-teal-200 pt-2">
                <p className="text-xs font-medium text-teal-600 mb-1">
                  Tag Teacher
                </p>
              </div>
            </div>
          )}

          <div className="px-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search by name, code or ID..."
                  value={sheetSearch}
                  onChange={(e) => setSheetSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select
                value={sheetSubjectFilter}
                onValueChange={(v) => setSheetSubjectFilter(v ?? "")}
                items={[
                  { value: "", label: "All subjects" },
                  ...subjects.map((s) => ({ value: s.id, label: s.name })),
                ]}
              >
                <SelectTrigger className="w-52 shrink-0">
                  <SelectValue placeholder="Filter by subject" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All subjects</SelectItem>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {sheetSubjectFilter && (
              <p className="mb-2 px-1 text-[11px] text-slate-400">
                Teachers who teach{" "}
                <strong className="text-slate-600">
                  {subjectMap.get(sheetSubjectFilter)?.name}
                </strong>{" "}
                are listed first — everyone else follows. Search by name, code
                or ID to find anyone.
              </p>
            )}

            <div className="mb-3 flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-600">
                <strong className="text-emerald-700">
                  {freeSheetTeachers.length}
                </strong>{" "}
                free ·{" "}
                <strong className="text-red-600">
                  {busySheetTeachers.length}
                </strong>{" "}
                busy in P{sheetPeriod}
                {excludedSheetCount > 0 && (
                  <>
                    {" "}
                    ·{" "}
                    <strong className="text-violet-700">
                      {excludedSheetCount}
                    </strong>{" "}
                    <span
                      className="text-violet-600"
                      title={`Marked unavailable in period ${sheetPeriod} — hidden from both lists`}
                    >
                      unavailable excluded
                    </span>
                  </>
                )}
              </span>
              <span className="text-[11px] text-slate-400">
                {teachers.length} teachers total
              </span>
            </div>

            <div className="max-h-[calc(100vh-24rem)] space-y-3 overflow-y-auto pr-1">
              {freeSheetTeachers.length === 0 &&
              busySheetTeachers.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  {sheetSearch.trim()
                    ? "No teachers match this search."
                    : "No teachers available"}
                </p>
              ) : (
                <>
                  {freeSheetTeachers.map((t, i) => {
                    const sim = simulateTeacherAssignment(
                      pendingRoutines,
                      t.id,
                      dayIndex!,
                      sheetPeriod!,
                      dayCells.find((c) => c.period === sheetPeriod)?.sectionId,
                      sheetTab === "tag",
                    );
                    const levelColor =
                      sim.level === "red"
                        ? "border-red-300 bg-red-50"
                        : sim.level === "yellow"
                          ? "border-amber-300 bg-amber-50"
                          : "border-slate-200 bg-white";

                    // Divider only at the subject -> non-subject boundary, so
                    // the two groups read as one sorted list.
                    const showOtherDivider =
                      !!sheetSubjectFilter &&
                      !t.subjectMatch &&
                      freeSheetTeachers[i - 1]?.subjectMatch === true;

                    return (
                      <div key={t.id} className="space-y-3">
                        {showOtherDivider && (
                          <div className="flex items-center gap-2 px-1 pt-1">
                            <span className="h-px flex-1 bg-slate-200" />
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Other teachers
                            </span>
                            <span className="h-px flex-1 bg-slate-200" />
                          </div>
                        )}
                        <div
                          className={cn(
                            "flex w-full items-start gap-2 rounded-lg border p-3 transition-colors hover:border-[#0d9488] hover:bg-[#0d9488]/5",
                            levelColor,
                          )}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              sheetTab === "tag"
                                ? handleAssignTag(sheetPeriod!, t.id)
                                : handleAssignPrimary(sheetPeriod!, t.id)
                            }
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 font-medium text-slate-800">
                                  {t.full_name}
                                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                                    free
                                  </span>
                                  {/* Marked out at SOME periods of this date,
                                      just not the one the sheet is open on —
                                      so he legitimately appears here. Saying
                                      which periods keeps "he's unavailable,
                                      why is he listed?" from reading as a bug. */}
                                  {t.unavailEntry && t.unavailPeriods.length > 0 && (
                                    <span
                                      className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700"
                                      title={`${reasonLabel(t.unavailEntry.reason)}${
                                        t.unavailEntry.note
                                          ? ` — ${t.unavailEntry.note}`
                                          : ""
                                      } · unavailable at P${t.unavailPeriods.join(", P")} on ${date}`}
                                    >
                                      Out P{t.unavailPeriods.join(",")}
                                    </span>
                                  )}
                                {/* Already the recorded substitute for this
                                    slot: selecting them is a no-op edit, so say
                                    so instead of letting it look like a change. */}
                                {t.isCurrentHolder && (
                                  <span className="rounded bg-[#1e3a5f] px-1.5 py-0.5 text-[10px] font-medium text-white">
                                    Current
                                  </span>
                                )}
                                {t.subjectMatch && (
                                  <span className="rounded bg-[#0d9488]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#0b7a70]">
                                    Subject
                                  </span>
                                )}
                              </span>
                              <div className="flex items-center gap-1.5 text-xs">
                                <span
                                  className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800 ring-1 ring-amber-300"
                                  title="Substitutes taken this week (Sun–Thu)"
                                >
                                  adj-{t.adjCount}
                                </span>
                                <span
                                  className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-700"
                                  title="Classes on this day"
                                >
                                  D-{t.dayCount}p
                                </span>
                                <span className="text-slate-400">
                                  {t.stretch >= 3 ? `${t.stretch} cont` : "—"}
                                </span>
                                <span
                                  className="rounded bg-[#1e3a5f]/10 px-1.5 py-0.5 font-medium text-[#1e3a5f]"
                                  title="Total classes this week"
                                >
                                  wk-{t.weekTotal}P
                                </span>
                              </div>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                              <span className="text-slate-400">
                                {t.teacher_code}
                              </span>
                              {t.dayCount >= 5 && (
                                <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700">
                                  already {t.dayCount} classes today
                                </span>
                              )}
                              {t.dayCount === 4 && (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
                                  already {t.dayCount} classes today
                                </span>
                              )}
                              {t.stretch >= 3 && (
                                <span className="rounded bg-orange-100 px-1.5 py-0.5 font-medium text-orange-700">
                                  {t.stretch} continuous
                                </span>
                              )}
                              {sim.level === "yellow" && (
                                <span className="text-amber-600">
                                  ⚠ {sim.reasons.join("; ")}
                                </span>
                              )}
                              {sim.level === "red" && (
                                <span className="text-red-600">
                                  ✖ {sim.reasons.join("; ")}
                                </span>
                              )}
                            </div>
                            {teacherPeriodStrip(t.id)}
                          </button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            title={`View ${t.full_name}'s routine`}
                            aria-label={`View ${t.full_name}'s routine`}
                            onClick={() => setRoutineTeacherId(t.id)}
                            className="shrink-0"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}

                  {busySheetTeachers.length > 0 && (
                    <div className="space-y-2">
                      <p className="px-1 pt-1 font-semibold uppercase tracking-wide text-[10px] text-red-500">
                        Busy in P{sheetPeriod} — tap to see their day
                      </p>
                      {busySheetTeachers.map((t, i) => {
                        const showOtherDivider =
                          !!sheetSubjectFilter &&
                          !t.subjectMatch &&
                          busySheetTeachers[i - 1]?.subjectMatch === true;

                        return (
                          <div key={t.id} className="space-y-2">
                            {showOtherDivider && (
                              <div className="flex items-center gap-2 px-1 pt-1">
                                <span className="h-px flex-1 bg-red-200" />
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                  Other teachers
                                </span>
                                <span className="h-px flex-1 bg-red-200" />
                              </div>
                            )}
                            <div className="rounded-lg border border-red-200 bg-red-50/50">
                              <div className="flex w-full items-start gap-2 p-3">
                                <button
                                  type="button"
                                  disabled
                                  className="min-w-0 flex-1 cursor-not-allowed text-left opacity-70"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-1.5 font-medium text-slate-800">
                                      {t.full_name}
                                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                                        busy
                                      </span>
                                      {/* Busy only because they are covering
                                          someone else this week — a real
                                          opportunity once that cover is
                                          removed, not a permanent clash. */}
                                      {t.isCovering && (
                                        <span
                                          className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-700"
                                          title="Holding this period only as a temporary cover"
                                        >
                                          covering
                                        </span>
                                      )}
                                      {t.isCurrentHolder && (
                                        <span className="rounded bg-[#1e3a5f] px-1.5 py-0.5 text-[10px] font-medium text-white">
                                          Current
                                        </span>
                                      )}
                                      {t.subjectMatch && (
                                        <span className="rounded bg-[#0d9488]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#0b7a70]">
                                          Subject
                                        </span>
                                      )}
                                    </span>
                                    <div className="flex items-center gap-1.5 text-xs">
                                      <span
                                        className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800 ring-1 ring-amber-300"
                                        title="Substitutes taken this week (Sun–Thu)"
                                      >
                                        adj-{t.adjCount}
                                      </span>
                                      <span
                                        className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-700"
                                        title="Classes on this day"
                                      >
                                        D-{t.dayCount}p
                                      </span>
                                      <span
                                        className="rounded bg-[#1e3a5f]/10 px-1.5 py-0.5 font-medium text-[#1e3a5f]"
                                        title="Total classes this week"
                                      >
                                        wk-{t.weekTotal}P
                                      </span>
                                    </div>
                                  </div>
                                  <div className="mt-1 text-xs text-red-600">
                                    {t.teacher_code}
                                  </div>
                                </button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  title="See this teacher's class routine"
                                  aria-label="See this teacher's class routine"
                                  onClick={() =>
                                    setExpandedBusyId(
                                      expandedBusyId === t.id ? null : t.id,
                                    )
                                  }
                                  className="shrink-0"
                                >
                                  <ChevronDown
                                    className={cn(
                                      "h-4 w-4 transition-transform",
                                      expandedBusyId === t.id && "rotate-180",
                                    )}
                                  />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  title={`View ${t.full_name}'s routine`}
                                  aria-label={`View ${t.full_name}'s routine`}
                                  onClick={() => setRoutineTeacherId(t.id)}
                                  className="shrink-0"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </div>
                              {expandedBusyId === t.id && (
                                <div className="border-t border-red-100 px-3 pb-3 pt-2">
                                  <div className="space-y-1">
                                    {teacherDaySchedule(t.id).map((sch) => (
                                      <div
                                        key={sch.period}
                                        className="flex items-center gap-2 text-xs text-slate-600"
                                      >
                                        <span className="w-6 font-semibold text-slate-700">
                                          P{sch.period}
                                        </span>
                                        <span>
                                          {sch.className}-{sch.sectionName}
                                        </span>
                                        {sch.isTag && (
                                          <span className="rounded bg-teal-100 px-1 py-px text-[10px] font-medium text-teal-700">
                                            tag
                                          </span>
                                        )}
                                        <span className="text-slate-300">
                                          ·
                                        </span>
                                        <span>{sch.subjectName}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {sheetPeriod !== null &&
            ((sheetTab === "primary" && overrides[sheetPeriod]?.newTeacherId) ||
              (sheetTab === "tag" &&
                currentSheetCell?.isTag &&
                currentTagOverride?.newTeacherId)) && (
              <div className="px-4 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resetCell(sheetPeriod!)}
                  className="w-full"
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Discard unsaved change
                </Button>
              </div>
            )}

          {/* A SAVED adjustment with no pending local edit: this is the only
              control inside the sheet that clears it from the database. */}
          {sheetPeriod !== null &&
            !isPastDate &&
            !currentPrimaryOverride &&
            !currentTagOverride &&
            ((sheetTab === "primary" && currentSheetCell?.hasSavedAdjustment) ||
              (sheetTab === "tag" &&
                currentSheetCell?.hasSavedTagAdjustment)) && (
              <div className="px-4 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const isTag = sheetTab === "tag";
                    const name = isTag
                      ? currentSheetCell?.tagTeacherId
                        ? teachers.find(
                            (t) => t.id === currentSheetCell.tagTeacherId,
                          )?.full_name
                        : null
                      : currentSheetCell?.baseTeacherId
                        ? teachers.find(
                            (t) => t.id === currentSheetCell.baseTeacherId,
                          )?.full_name
                        : null;
                    setPendingRevert({
                      period: sheetPeriod,
                      isTag,
                      label: name
                        ? `Restore ${name} to ${isTag ? "the tag session in " : ""}period ${sheetPeriod}`
                        : `Remove the ${isTag ? "tag " : ""}adjustment on period ${sheetPeriod}`,
                    });
                  }}
                  className="w-full border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Remove adjustment
                </Button>
              </div>
            )}
        </DialogContent>
      </Dialog>

      {/* Red warning confirmation dialog */}
      <AlertDialog
        open={!!pendingRed}
        onOpenChange={(open) => {
          if (!open) setPendingRed(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              Dangerous Assignment
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRed?.reasons.map((r) => `• ${r}`).join("\n") ||
                "This assignment is dangerous."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRed}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear a saved adjustment */}
      <AlertDialog
        open={!!pendingRevert}
        onOpenChange={(open) => {
          if (!open && !reverting) setPendingRevert(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-700">
              <RotateCcw className="h-5 w-5" />
              Clear this adjustment?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRevert?.label}. The period reverts to the teacher from the
              weekly base routine, and any substitute saved for it is removed.
              Other periods on this day are untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reverting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRevert}
              disabled={reverting}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {reverting ? "Clearing…" : "Clear adjustment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

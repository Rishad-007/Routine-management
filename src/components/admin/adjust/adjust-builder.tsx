"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DAY_LABEL_LIST,
  PERIOD_ORDER,
  TIFFIN_AFTER_PERIOD,
} from "@/lib/constants";
import { getSchoolDayIndex } from "@/lib/periods";
import {
  countDayPeriods,
  weeklyLoad,
  simulateTeacherAssignment,
  isTeacherBusy,
  longestConsecutiveStretch,
} from "@/lib/conflicts";
import {
  saveAllAdjustments,
  type PeriodAdjustment,
} from "@/app/admin/adjust/actions";
import type {
  ClassRow,
  SectionRow,
  TeacherRow,
  SubjectRow,
  RoomRow,
  RoutineRow,
  AdjustmentRow,
} from "@/lib/types";

interface Props {
  classes: ClassRow[];
  sections: SectionRow[];
  teachers: TeacherRow[];
  subjects: SubjectRow[];
  rooms: RoomRow[];
  routines: RoutineRow[];
  adjustments: AdjustmentRow[];
}

function toDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface DayCell {
  period: number;
  sectionId: string;
  subjectName: string;
  className: string;
  sectionName: string;
  baseTeacherId: string;
  effectiveTeacherId: string;
  isAdjusted: boolean;
  isTag: boolean;
  tagSubjectId: string | null;
  tagTeacherId: string | null;
  tagRoomId: string | null;
  tagSubjectName: string;
  tagEffectiveTeacherId: string;
  isTagAdjusted: boolean;
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
  subjects,
  rooms,
  routines,
  adjustments,
}: Props) {
  const router = useRouter();

  const [date, setDate] = useState(() => toDateInput(new Date()));
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(
    null
  );
  const [overrides, setOverrides] = useState<
    Record<number, { newTeacherId: string | null; sectionId: string; reason: string }>
  >({});
  const [tagOverrides, setTagOverrides] = useState<
    Record<number, TagOverride>
  >({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetPeriod, setSheetPeriod] = useState<number | null>(null);
  const [sheetTab, setSheetTab] = useState<"primary" | "tag">("primary");
  const [teacherSearch, setTeacherSearch] = useState("");
  const [sheetSearch, setSheetSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [pendingRed, setPendingRed] = useState<{
    adjustment: PeriodAdjustment;
    reasons: string[];
  } | null>(null);

  const dayIndex = useMemo(
    () => getSchoolDayIndex(new Date(date + "T00:00:00")),
    [date]
  );
  const isNoSchool = dayIndex === null;

  const subjectMap = useMemo(
    () => new Map(subjects.map((s) => [s.id, s])),
    [subjects]
  );

  const selectedTeacher = useMemo(
    () => teachers.find((t) => t.id === selectedTeacherId) ?? null,
    [teachers, selectedTeacherId]
  );

  const dayRoutines = useMemo(() => {
    if (!selectedTeacherId || dayIndex === null) return [];
    return routines.filter(
      (r) => r.teacher_id === selectedTeacherId && r.day === dayIndex
    );
  }, [routines, selectedTeacherId, dayIndex]);

  const dayCells: DayCell[] = useMemo(() => {
    if (!selectedTeacherId || dayIndex === null) return [];
    const cells: DayCell[] = [];
    for (const p of PERIOD_ORDER) {
      const primary = dayRoutines.find(
        (x) => x.period_number === p && !x.is_tag
      );
      if (!primary) continue;

      const tag = dayRoutines.find(
        (x) => x.period_number === p && x.is_tag
      );
      const subject = primary.subject_id
        ? subjectMap.get(primary.subject_id)
        : undefined;
      const classRow = classes.find((c) => {
        const s = sections.find((x) => x.id === primary.section_id);
        return s && c.id === s.class_id;
      });
      const sectionRow = sections.find(
        (x) => x.id === primary.section_id
      );

      const existingPrimaryAdj = adjustments.find(
        (a) =>
          a.adjust_date === date &&
          a.section_id === primary.section_id &&
          a.period_number === p &&
          !a.is_tag
      );

      const existingTagAdj = tag
        ? adjustments.find(
            (a) =>
              a.adjust_date === date &&
              a.section_id === tag.section_id &&
              a.period_number === p &&
              a.is_tag
          )
        : null;

      const override = overrides[p];
      const tagOv = tagOverrides[p];

      const effectiveTeacherId = override
        ? override.newTeacherId ?? ""
        : existingPrimaryAdj?.new_teacher_id ?? "";

      const tagEffectiveTeacherId = tagOv
        ? tagOv.newTeacherId ?? ""
        : existingTagAdj?.new_teacher_id ?? "";
      const tagEffectiveSubjectName = tagOv?.newSubjectId
        ? subjectMap.get(tagOv.newSubjectId)?.name
        : existingTagAdj?.new_subject_id
          ? subjectMap.get(existingTagAdj.new_subject_id)?.name
          : tag?.subject_id
            ? subjectMap.get(tag.subject_id)?.name
            : undefined;

      cells.push({
        period: p,
        sectionId: primary.section_id,
        subjectName: subject?.name ?? "—",
        className: classRow?.name ?? "—",
        sectionName: sectionRow?.name ?? "—",
        baseTeacherId: primary.teacher_id ?? "",
        effectiveTeacherId,
        isAdjusted: !!existingPrimaryAdj || !!override,
        isTag: !!tag,
        tagSubjectId: tag?.subject_id ?? null,
        tagTeacherId: tag?.teacher_id ?? null,
        tagRoomId: tag?.room_id ?? null,
        tagSubjectName: tagEffectiveSubjectName ?? "—",
        tagEffectiveTeacherId: tagEffectiveTeacherId || (tag?.teacher_id ?? ""),
        isTagAdjusted: !!existingTagAdj || !!tagOv,
      });
    }
    return cells;
  }, [
    dayRoutines,
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

  const filteredTeachers = useMemo(() => {
    if (!teacherSearch.trim()) return teachers;
    const q = teacherSearch.toLowerCase();
    return teachers.filter(
      (t) =>
        t.short_name.toLowerCase().includes(q) ||
        t.teacher_code.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
    );
  }, [teachers, teacherSearch]);

  const teacherDayCounts = useMemo(() => {
    const map = new Map<string, number>();
    if (dayIndex === null) return map;
    for (const t of teachers) {
      map.set(t.id, countDayPeriods(routines, t.id, dayIndex));
    }
    return map;
  }, [teachers, routines, dayIndex]);

  // Per-teacher stats for the active day: class count + longest continuous
  // stretch. Used by the teacher rail and the assignment sheet.
  const teacherDayStats = useMemo(() => {
    const map = new Map<
      string,
      { count: number; stretch: number }
    >();
    if (dayIndex === null) return map;
    for (const t of teachers) {
      map.set(t.id, {
        count: countDayPeriods(routines, t.id, dayIndex),
        stretch: longestConsecutiveStretch(routines, t.id, dayIndex),
      });
    }
    return map;
  }, [teachers, routines, dayIndex]);

  const freeTeachersForSheet = useMemo(() => {
    if (sheetPeriod === null || dayIndex === null) return [];
    return teachers
      .map((t) => {
        const dayCount = countDayPeriods(routines, t.id, dayIndex);
        const stretch = longestConsecutiveStretch(routines, t.id, dayIndex);
        const week = weeklyLoad(routines, t.id);
        const busy = isTeacherBusy(routines, t.id, dayIndex, sheetPeriod);
        return { ...t, dayCount, stretch, weekTotal: week.total, busy };
      })
      .sort((a, b) => Number(a.busy) - Number(b.busy) || a.short_name.localeCompare(b.short_name));
  }, [teachers, routines, dayIndex, sheetPeriod]);

  const filteredFreeTeachers = useMemo(() => {
    if (!sheetSearch.trim()) return freeTeachersForSheet;
    const q = sheetSearch.toLowerCase();
    return freeTeachersForSheet.filter(
      (t) =>
        t.short_name.toLowerCase().includes(q) ||
        t.teacher_code.toLowerCase().includes(q)
    );
  }, [freeTeachersForSheet, sheetSearch]);

  const handleCellClick = (period: number, tab: "primary" | "tag" = "primary") => {
    setSheetPeriod(period);
    setSheetTab(tab);
    setSheetSearch("");
    setSheetOpen(true);
  };

  const handleAssignPrimary = (period: number, newTeacherId: string) => {
    const cell = dayCells.find((c) => c.period === period);
    if (!cell) return;

    if (newTeacherId === cell.baseTeacherId) {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[period];
        return next;
      });
      setSheetOpen(false);
      return;
    }

    const sim = simulateTeacherAssignment(
      routines,
      newTeacherId,
      dayIndex!,
      period,
      cell.sectionId
    );

    // HARD BLOCK: the substitute is already teaching another class at this
    // day+period. This is a double-booking and cannot be force-approved.
    if (isTeacherBusy(routines, newTeacherId, dayIndex!, period)) {
      toast.error(
        "This teacher already has a class in another section at this period. Free them first before assigning."
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
    const { adjustment } = pendingRed;
    if (adjustment.isTag) {
      setTagOverrides((prev) => ({
        ...prev,
        [adjustment.period]: {
          ...prev[adjustment.period],
          newTeacherId: adjustment.newTeacherId,
        },
      }));
    } else {
      setOverrides((prev) => ({
        ...prev,
        [adjustment.period]: {
          newTeacherId: adjustment.newTeacherId,
          sectionId: adjustment.sectionId,
          reason: "",
        },
      }));
    }
    setPendingRed(null);
    setSheetOpen(false);
  };

  const resetCell = (period: number) => {
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
    setOverrides({});
    setTagOverrides({});
  };

  const handleSave = async (force = false) => {
    if (!selectedTeacherId || dayIndex === null) return;
    setSaving(true);

    const changes: PeriodAdjustment[] = [];

    for (const [period, o] of Object.entries(overrides)) {
      const cell = dayCells.find((c) => c.period === Number(period));
      if (!cell) continue;
      changes.push({
        period: Number(period),
        sectionId: o.sectionId,
        isTag: false,
        originalTeacherId: cell.baseTeacherId,
        newTeacherId: o.newTeacherId,
        originalSubjectId: null,
        newSubjectId: null,
        originalRoomId: null,
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
        originalSubjectId: cell.tagSubjectId,
        newSubjectId: to.newSubjectId,
        originalRoomId: cell.tagRoomId,
        newRoomId: to.newRoomId,
        reason: null,
        level: "ok",
        reasons: [],
      });
    }

    const res = await saveAllAdjustments(date, changes, force);
    setSaving(false);

    if (res.error) {
      toast.error(res.error);
      return;
    }

    if (res.warnings && res.warnings.length > 0 && !force) {
      const hasRed = res.warnings.some((w) => w.level === "red");
      if (hasRed) {
        setPendingRed({
          adjustment: changes[0],
          reasons: res.warnings.flatMap((w) => w.reasons),
        });
        return;
      }
      toast.warning(
        `${res.warnings.length} warning(s). Review before saving.`,
        {
          duration: 8000,
        }
      );
      return;
    }

    toast.success(`Saved ${res.savedCount ?? 0} adjustment(s) for ${date}`);
    setOverrides({});
    setTagOverrides({});
    router.refresh();
  };

  const hasChanges =
    Object.keys(overrides).length > 0 ||
    Object.keys(tagOverrides).length > 0;

  const downloadReport = () => {
    if (!date || dayIndex === null) return;
    setReportLoading(true);
    window.open(`/api/adjust-report.pdf?date=${date}`, "_blank", "noopener");
    setTimeout(() => setReportLoading(false), 2500);
  };

  const currentSheetCell = sheetPeriod
    ? dayCells.find((c) => c.period === sheetPeriod)
    : null;

  const currentTagOverride = sheetPeriod
    ? tagOverrides[sheetPeriod]
    : undefined;

  return (
    <div className="space-y-5">
      {/* Date selector */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-white p-4 shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">
            Adjustment date
          </p>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
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
            onClick={downloadReport}
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
                  placeholder="Search teachers..."
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredTeachers.map((t) => {
                const isSelected = t.id === selectedTeacherId;
                const dayCount = teacherDayCounts.get(t.id) ?? 0;
                const stretch = teacherDayStats.get(t.id)?.stretch ?? 0;
                const heavy = dayCount >= 5;
                const red = dayCount >= 6;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTeacherId(t.id)}
                    className={cn(
                      "w-full px-3 py-2.5 text-left text-sm transition-colors border-b last:border-b-0",
                      isSelected
                        ? "bg-[#0d9488]/10 text-[#0b7a70]"
                        : "hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">
                        {t.short_name}
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
                                : "bg-emerald-100 text-emerald-700"
                        )}
                        title={`${dayCount} classes today${
                          stretch >= 1 ? ` · ${stretch} continuous` : ""
                        }`}
                      >
                        {dayCount}P
                        {stretch >= 3 ? ` ·${stretch}cont` : ""}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-xs text-slate-500">
                      <span>{t.teacher_code}</span>
                      {stretch >= 3 && (
                        <span className="text-amber-600">
                          {stretch} continuous
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
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
                      {selectedTeacher.short_name}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {selectedTeacher.teacher_code} —{" "}
                      {DAY_LABEL_LIST[dayIndex!]} routine for {date}
                    </p>
                  </div>
                  {hasChanges && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={resetAll}
                      >
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
                        const effectiveName = override
                          ? teachers.find(
                              (t) => t.id === override.newTeacherId
                            )?.short_name
                          : cell.effectiveTeacherId
                            ? teachers.find(
                                (t) => t.id === cell.effectiveTeacherId
                              )?.short_name
                            : null;

                        const tagOv = tagOverrides[cell.period];
                        const hasTagOverride = !!tagOv;
                        const tagEffectiveSubject = tagOv?.newSubjectId
                          ? subjectMap.get(tagOv.newSubjectId)?.name
                          : cell.tagSubjectName;

                        return (
                          <tr
                            key={cell.period}
                            className={cn(
                              "transition-colors",
                              (hasOverride || hasTagOverride) &&
                                "bg-amber-50"
                            )}
                          >
                            <td className="border border-slate-200 px-2 py-2 text-center text-sm font-bold text-slate-600">
                              P{cell.period}
                              {cell.period === TIFFIN_AFTER_PERIOD && (
                                <span className="block text-xs font-normal text-amber-500">
                                  Tiffin↓
                                </span>
                              )}
                            </td>
                            <td className="border border-slate-200 px-3 py-2">
                              <span className="text-base font-medium text-[#1e3a5f]">
                                {cell.className}-{cell.sectionName}
                              </span>
                            </td>
                            <td className="border border-slate-200 px-3 py-2">
                              {/* Primary */}
                              <div>
                                <span className="text-base font-medium text-slate-700">
                                  {cell.subjectName}
                                </span>
                                <span className="ml-1 text-sm text-slate-500">
                                  ·{" "}
                                  {effectiveName ??
                                    selectedTeacher.short_name}
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
                              {/* Tag row */}
                              {cell.isTag && (
                                <div className="mt-1 border-t border-dashed border-teal-200 pt-1">
                                  <span className="text-base font-medium text-teal-700">
                                    {tagEffectiveSubject ?? "—"}
                                  </span>
                                  <span className="ml-1 text-sm text-teal-600">
                                    ·{" "}
                                    {teachers.find((t) => t.id === cell.tagEffectiveTeacherId)?.short_name || "—"}
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
                                  {selectedTeacher.short_name}
                                </span>
                              )}
                            </td>
                            <td className="border border-slate-200 px-2 py-2 text-center">
                              <div className="flex flex-col gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    handleCellClick(
                                      cell.period,
                                      "primary"
                                    )
                                  }
                                  className="h-8 text-sm"
                                >
                                  Change
                                </Button>
                                {cell.isTag && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      handleCellClick(
                                        cell.period,
                                        "tag"
                                      )
                                    }
                                    className="h-8 text-sm text-teal-600"
                                  >
                                    Tag
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

      {/* Teacher assignment sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>
              {sheetTab === "tag"
                ? `Tag session — Period ${sheetPeriod}`
                : `Assign teacher — Period ${sheetPeriod}`}
            </SheetTitle>
            <SheetDescription>
              {sheetTab === "tag"
                ? "Select a free teacher for the tag session. Overrides subject/room too."
                : "Pick a free teacher for this period. Busy teachers are shown for reference; load, continuous stretch and \"already 4/5 classes\" help you choose."}
            </SheetDescription>
          </SheetHeader>

          {/* Tag session overrides (subject/room/teacher) */}
          {sheetTab === "tag" && sheetPeriod && (
            <div className="space-y-3 px-4 pt-2">
              <div className="space-y-1">
                <p className="text-xs font-medium text-teal-600">
                  Tag Subject
                </p>
                <Select
                  value={currentTagOverride?.newSubjectId ?? currentSheetCell?.tagSubjectId ?? "none"}
                  onValueChange={(v) => {
                    if (!sheetPeriod) return;
                    setTagOverrides((prev) => ({
                      ...prev,
                      [sheetPeriod]: {
                        ...prev[sheetPeriod],
                        newSubjectId: v === "none" ? null : v,
                      },
                    }));
                  }}
                  items={[{ value: "none", label: "— Same —" }, ...subjects.map(s => ({ value: s.id, label: s.name }))]}
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
                <p className="text-xs font-medium text-teal-600">
                  Tag Room
                </p>
                <Select
                  value={currentTagOverride?.newRoomId ?? currentSheetCell?.tagRoomId ?? "none"}
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
                  items={[{ value: "none", label: "— Same —" }, ...rooms.map(r => ({ value: r.id, label: r.name }))]}
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
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search by name or code..."
                value={sheetSearch}
                onChange={(e) => setSheetSearch(e.target.value)}
                className="pl-8"
              />
            </div>

            <div className="mb-3 flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-600">
                <strong className="text-emerald-700">
                  {freeTeachersForSheet.filter((t) => !t.busy || t.id === selectedTeacherId).length}
                </strong>{" "}
                available /{" "}
                <strong className="text-slate-800">
                  {freeTeachersForSheet.filter((t) => t.busy && t.id !== selectedTeacherId).length}
                </strong>{" "}
                busy in P{sheetPeriod}
              </span>
              <span className="text-[11px] text-slate-400">
                {teachers.length} teachers total
              </span>
            </div>

            <div className="max-h-[calc(100vh-24rem)] space-y-2 overflow-y-auto pr-1">
              {filteredFreeTeachers.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  No free teachers available
                </p>
              ) : (
                filteredFreeTeachers.map((t) => {
                  const sim = simulateTeacherAssignment(
                    routines,
                    t.id,
                    dayIndex!,
                    sheetPeriod!,
                    dayCells.find((c) => c.period === sheetPeriod)
                      ?.sectionId
                  );
                  const levelColor =
                    sim.level === "red"
                      ? "border-red-300 bg-red-50"
                      : sim.level === "yellow"
                        ? "border-amber-300 bg-amber-50"
                        : "border-slate-200 bg-white";

                  return (
                    <button
                      key={t.id}
                      disabled={t.busy}
                      onClick={() =>
                        sheetTab === "tag"
                          ? handleAssignTag(sheetPeriod!, t.id)
                          : handleAssignPrimary(sheetPeriod!, t.id)
                      }
                      className={cn(
                        "w-full rounded-lg border p-3 text-left transition-colors",
                        t.busy
                          ? "cursor-not-allowed opacity-60"
                          : "hover:border-[#0d9488] hover:bg-[#0d9488]/5",
                        levelColor
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-medium text-slate-800">
                          {t.short_name}
                          {t.busy ? (
                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                              busy
                            </span>
                          ) : (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                              free
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span>{t.dayCount}P day</span>
                          <span>·</span>
                          <span>{t.stretch >= 3 ? `${t.stretch} cont` : "—"}</span>
                          <span>·</span>
                          <span>{t.weekTotal}P wk</span>
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                        <span className="text-slate-400">{t.teacher_code}</span>
                        {t.dayCount >= 5 && (
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
                          <span className="text-amber-600">⚠ {sim.reasons.join("; ")}</span>
                        )}
                        {sim.level === "red" && (
                          <span className="text-red-600">✖ {sim.reasons.join("; ")}</span>
                        )}
                      </div>
                    </button>
                  );
                })
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
                  Reset to original
                </Button>
              </div>
            )}
        </SheetContent>
      </Sheet>

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
              {pendingRed?.reasons.map((r, i) => (
                <p key={i} className="mb-1">
                  • {r}
                </p>
              ))}
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
    </div>
  );
}

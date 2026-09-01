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
import { Badge } from "@/components/ui/badge";
import {
  Save,
  Search,
  AlertTriangle,
  RotateCcw,
  Users,
  BookOpen,
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
  RoutineRow,
  AdjustmentRow,
} from "@/lib/types";

interface Props {
  classes: ClassRow[];
  sections: SectionRow[];
  teachers: TeacherRow[];
  subjects: SubjectRow[];
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
}

export function AdjustBuilder({
  classes,
  sections,
  teachers,
  subjects,
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetPeriod, setSheetPeriod] = useState<number | null>(null);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [sheetSearch, setSheetSearch] = useState("");
  const [saving, setSaving] = useState(false);
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
      const r = dayRoutines.find((x) => x.period_number === p);
      if (!r) continue;
      const subject = r.subject_id ? subjectMap.get(r.subject_id) : undefined;
      const classRow = classes.find((c) => {
        const s = sections.find((x) => x.id === r.section_id);
        return s && c.id === s.class_id;
      });
      const sectionRow = sections.find((x) => x.id === r.section_id);

      const existingAdj = adjustments.find(
        (a) =>
          a.adjust_date === date &&
          a.section_id === r.section_id &&
          a.period_number === p
      );

      const override = overrides[p];

      cells.push({
        period: p,
        sectionId: r.section_id,
        subjectName: subject?.name ?? "—",
        className: classRow?.name ?? "—",
        sectionName: sectionRow?.name ?? "—",
        baseTeacherId: r.teacher_id ?? "",
        effectiveTeacherId: override
          ? override.newTeacherId ?? ""
          : existingAdj?.new_teacher_id ?? "",
        isAdjusted: !!existingAdj || !!override,
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

  const freeTeachersForSheet = useMemo(() => {
    if (sheetPeriod === null || dayIndex === null) return [];
    return teachers
      .filter(
        (t) =>
          !isTeacherBusy(routines, t.id, dayIndex, sheetPeriod) ||
          t.id === selectedTeacherId
      )
      .map((t) => {
        const dayCount = countDayPeriods(routines, t.id, dayIndex);
        const week = weeklyLoad(routines, t.id);
        return { ...t, dayCount, weekTotal: week.total };
      })
      .sort((a, b) => a.short_name.localeCompare(b.short_name));
  }, [teachers, routines, dayIndex, sheetPeriod, selectedTeacherId]);

  const filteredFreeTeachers = useMemo(() => {
    if (!sheetSearch.trim()) return freeTeachersForSheet;
    const q = sheetSearch.toLowerCase();
    return freeTeachersForSheet.filter(
      (t) =>
        t.short_name.toLowerCase().includes(q) ||
        t.teacher_code.toLowerCase().includes(q)
    );
  }, [freeTeachersForSheet, sheetSearch]);

  const handleCellClick = (period: number) => {
    setSheetPeriod(period);
    setSheetSearch("");
    setSheetOpen(true);
  };

  const handleAssign = (period: number, newTeacherId: string) => {
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

    if (sim.level === "red") {
      setPendingRed({
        adjustment: {
          period,
          sectionId: cell.sectionId,
          originalTeacherId: cell.baseTeacherId,
          newTeacherId,
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

  const confirmRed = () => {
    if (!pendingRed) return;
    const { adjustment } = pendingRed;
    setOverrides((prev) => ({
      ...prev,
      [adjustment.period]: {
        newTeacherId: adjustment.newTeacherId,
        sectionId: adjustment.sectionId,
        reason: "",
      },
    }));
    setPendingRed(null);
    setSheetOpen(false);
  };

  const resetCell = (period: number) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[period];
      return next;
    });
  };

  const resetAll = () => {
    setOverrides({});
  };

  const handleSave = async (force = false) => {
    if (!selectedTeacherId || dayIndex === null) return;
    setSaving(true);

    const changes: PeriodAdjustment[] = Object.entries(overrides).map(
      ([period, o]) => ({
        period: Number(period),
        sectionId: o.sectionId,
        originalTeacherId:
          dayCells.find((c) => c.period === Number(period))
            ?.baseTeacherId ?? null,
        newTeacherId: o.newTeacherId,
        reason: o.reason || null,
        level: "ok" as const,
        reasons: [],
      })
    );

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
    router.refresh();
  };

  const hasChanges = Object.keys(overrides).length > 0;

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
                      <span className="text-xs text-slate-400">
                        {dayCount}P today
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {t.teacher_code}
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
                      {selectedTeacher.teacher_code} — {DAY_LABEL_LIST[dayIndex!]}{" "}
                      routine for {date}
                    </p>
                  </div>
                  {hasChanges && (
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
                        <Save className="mr-1 h-3.5 w-3.5" />
                        {saving ? "Saving…" : "Save changes"}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="w-16 border border-slate-200 bg-[#1e3a5f] px-2 py-2 text-center text-xs font-semibold uppercase text-white">
                          P
                        </th>
                        <th className="border border-slate-200 bg-[#f1f5f9] px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                          Class
                        </th>
                        <th className="border border-slate-200 bg-[#f1f5f9] px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                          Subject
                        </th>
                        <th className="border border-slate-200 bg-[#f1f5f9] px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                          Status
                        </th>
                        <th className="w-20 border border-slate-200 bg-[#f1f5f9] px-3 py-2 text-center text-xs font-semibold uppercase text-slate-600">
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

                        return (
                          <tr
                            key={cell.period}
                            className={cn(
                              "transition-colors",
                              hasOverride && "bg-amber-50"
                            )}
                          >
                            <td className="border border-slate-200 px-2 py-2 text-center text-xs font-bold text-slate-600">
                              P{cell.period}
                              {cell.period === TIFFIN_AFTER_PERIOD && (
                                <span className="block text-[10px] font-normal text-amber-500">
                                  Tiffin↓
                                </span>
                              )}
                            </td>
                            <td className="border border-slate-200 px-3 py-2">
                              <span className="font-medium text-[#1e3a5f]">
                                {cell.className}-{cell.sectionName}
                              </span>
                            </td>
                            <td className="border border-slate-200 px-3 py-2 text-slate-700">
                              {cell.subjectName}
                            </td>
                            <td className="border border-slate-200 px-3 py-2">
                              {hasOverride || cell.isAdjusted ? (
                                <div className="flex items-center gap-1.5">
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                  <span className="text-sm font-medium text-amber-700">
                                    {effectiveName ?? "—"}
                                  </span>
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px]"
                                  >
                                    Adjusted
                                  </Badge>
                                </div>
                              ) : (
                                <span className="text-sm text-slate-500">
                                  {selectedTeacher.short_name}
                                </span>
                              )}
                            </td>
                            <td className="border border-slate-200 px-2 py-2 text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCellClick(cell.period)}
                                className="h-7 text-xs"
                              >
                                Change
                              </Button>
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
              Assign teacher — Period {sheetPeriod}
            </SheetTitle>
            <SheetDescription>
              Select a free teacher for this period. Teachers already assigned
              elsewhere at this time are excluded.
            </SheetDescription>
          </SheetHeader>

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

            <div className="max-h-[calc(100vh-18rem)] space-y-2 overflow-y-auto pr-1">
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
                      onClick={() =>
                        handleAssign(sheetPeriod!, t.id)
                      }
                      className={cn(
                        "w-full rounded-lg border p-3 text-left transition-colors hover:border-[#0d9488] hover:bg-[#0d9488]/5",
                        levelColor
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-800">
                          {t.short_name}
                        </span>
                        <div className="flex gap-2 text-xs text-slate-500">
                          <span>{t.dayCount}P day</span>
                          <span>·</span>
                          <span>{t.weekTotal}P wk</span>
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {t.teacher_code}
                        {sim.level === "yellow" && (
                          <span className="ml-2 text-amber-600">
                            ⚠ {sim.reasons.join("; ")}
                          </span>
                        )}
                        {sim.level === "red" && (
                          <span className="ml-2 text-red-600">
                            ✖ {sim.reasons.join("; ")}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {sheetPeriod !== null &&
            overrides[sheetPeriod]?.newTeacherId && (
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

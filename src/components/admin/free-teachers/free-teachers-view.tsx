"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Users, Info, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DAY_LABEL_LIST,
  DAY_ORDER,
  PERIOD_ORDER,
  TIFFIN_AFTER_PERIOD,
} from "@/lib/constants";
import { DAY_LABELS } from "@/lib/types";
import {
  buildTeacherRoutinePreview,
  type RoutinePreviewSourceRow,
} from "@/lib/teacher-routine-preview";

export interface TeacherAvailability {
  id: string;
  fullName: string;
  code: string;
  isOpen: boolean;
  dayCount: number;
  stretch: number;
  weekTotal: number;
  /** For busy teachers, the "Class 6 — Jui" label of the section they are in. */
  where: string | null;
}

export interface PeriodAvailability {
  period: number;
  /** Sections whose class actually runs this period (class period rules). */
  sectionsRunning: number;
  free: TeacherAvailability[];
  busy: TeacherAvailability[];
}

interface Props {
  day: number;
  periods: PeriodAvailability[];
  totalTeachers: number;
  adjustedToday: boolean;
  subjectLabels: Record<string, string>;
  roomLabels: Record<string, string>;
  routineSectionLabels: Record<string, string>;
  routineRows: RoutinePreviewSourceRow[];
}

export function FreeTeachersView({
  day,
  periods,
  totalTeachers,
  adjustedToday,
  subjectLabels,
  roomLabels,
  routineSectionLabels,
  routineRows,
}: Props) {
  const router = useRouter();
  const [openPeriod, setOpenPeriod] = useState<number | null>(
    periods.find((p) => p.sectionsRunning > 0)?.period ?? PERIOD_ORDER[0],
  );
  const [query, setQuery] = useState("");
  const [routineTeacherId, setRoutineTeacherId] = useState<string | null>(null);

  const selected = useMemo(
    () => periods.find((p) => p.period === openPeriod) ?? null,
    [periods, openPeriod],
  );

  const filtered = useMemo(() => {
    if (!selected) return { free: [], busy: [] };
    const q = query.trim().toLowerCase();
    if (!q) return { free: selected.free, busy: selected.busy };
    const match = (t: TeacherAvailability) =>
      t.fullName.toLowerCase().includes(q) ||
      t.code.toLowerCase().includes(q);
    return { free: selected.free.filter(match), busy: selected.busy.filter(match) };
  }, [selected, query]);

  const routineTeacher = useMemo(() => {
    if (!routineTeacherId) return null;
    for (const p of periods) {
      const found =
        p.free.find((t) => t.id === routineTeacherId) ??
        p.busy.find((t) => t.id === routineTeacherId);
      if (found) return found;
    }
    return null;
  }, [periods, routineTeacherId]);

  const routinePreview = useMemo(() => {
    if (!routineTeacherId) return null;
    return buildTeacherRoutinePreview({
      routines: routineRows,
      teacherId: routineTeacherId,
      subjectLabel: (id) => subjectLabels[id] ?? "—",
      sectionLabel: (id) => routineSectionLabels[id] ?? "—",
      roomLabel: (id) => roomLabels[id] ?? "—",
    });
  }, [
    routineTeacherId,
    routineRows,
    subjectLabels,
    routineSectionLabels,
    roomLabels,
  ]);

  const openRoutine = (id: string) => setRoutineTeacherId(id);

  return (
    <div className="space-y-4">
      {/* Day picker */}
      <div className="flex flex-wrap items-center gap-2">
        {DAY_ORDER.map((d) => (
          <button
            key={d}
            onClick={() => router.push(`/admin/free-teachers?day=${d}`)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              d === day
                ? "bg-[#1e3a5f] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {DAY_LABELS[d]}
          </button>
        ))}
      </div>

      {adjustedToday && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Info className="h-4 w-4 shrink-0" />
          Today&apos;s substitutions are applied, so this reflects who is
          actually free right now.
        </p>
      )}

      {/* Period cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {periods.map((p) => {
          const active = p.period === openPeriod;
          const idle = p.sectionsRunning === 0;
          return (
            <button
              key={p.period}
              onClick={() => setOpenPeriod(p.period)}
              className={cn(
                "rounded-xl border p-3 text-left transition-all",
                active
                  ? "border-[#0d9488] bg-[#0d9488]/5 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300",
                idle && "opacity-60",
              )}
            >
              <p className="text-xs font-medium text-slate-500">
                Period {p.period}
              </p>
              <p className="mt-1 text-2xl font-bold text-[#0d9488]">
                {p.free.length}
              </p>
              <p className="text-xs text-slate-500">free</p>
              <p className="mt-1 text-xs text-slate-400">
                {p.busy.length} busy
              </p>
              <p className="mt-2 border-t pt-1.5 text-[11px] text-slate-400">
                {idle ? "No classes" : `${p.sectionsRunning} sections`}
              </p>
            </button>
          );
        })}
      </div>

      {/* Drill-down */}
      {selected && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-base text-[#1e3a5f]">
              <Users className="h-4 w-4" />
              Period {selected.period} · {selected.free.length} free of{" "}
              {totalTeachers}
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search by name or ID…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selected.sectionsRunning === 0 && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                No class runs in period {selected.period} on{" "}
                {DAY_LABELS[day]}, so every teacher is free by definition.
              </p>
            )}

            <Section
              title={`Free (${filtered.free.length})`}
              tone="free"
              teachers={filtered.free}
              emptyLabel="No free teachers in this period."
              onOpenRoutine={openRoutine}
            />
            <Section
              title={`Busy (${filtered.busy.length})`}
              tone="busy"
              teachers={filtered.busy}
              emptyLabel="Nobody is teaching in this period."
              onOpenRoutine={openRoutine}
            />
          </CardContent>
        </Card>
      )}

      {/* Weekly routine popup for a teacher */}
      <Dialog
        open={!!routineTeacher}
        onOpenChange={(open) => !open && setRoutineTeacherId(null)}
      >
        <DialogContent className="flex h-[min(92vh,900px)] max-h-[92vh] w-[90vw] sm:max-w-[1200px] flex-col gap-3 overflow-hidden p-5">
          {routineTeacher && routinePreview && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#1e3a5f]">
                  {routineTeacher.fullName}&apos;s routine
                </DialogTitle>
                <DialogDescription>
                  {routineTeacher.code} · Weekly base routine. Continuous
                  classes are highlighted; tiffin separates the runs.
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
                    {DAY_LABEL_LIST.map((label, dayNumber) => {
                      const daily = routinePreview.daily[dayNumber];
                      return (
                        <tr key={label}>
                          <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-3 py-3 font-semibold text-slate-700">
                            {label}
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
                  {DAY_LABELS[day]}:{" "}
                  {routinePreview.daily[day]?.count ?? 0} classes
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
    </div>
  );
}

function Section({
  title,
  tone,
  teachers,
  emptyLabel,
  onOpenRoutine,
}: {
  title: string;
  tone: "free" | "busy";
  teachers: TeacherAvailability[];
  emptyLabel: string;
  onOpenRoutine: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      {teachers.length === 0 ? (
        <p className="text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {teachers.map((t) => (
            <button
              key={t.id}
              onClick={() => onOpenRoutine(t.id)}
              title={`View ${t.fullName}'s weekly routine`}
              className={cn(
                "group flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors hover:border-[#0d9488] hover:bg-[#0d9488]/5",
                tone === "busy" && "opacity-60",
              )}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate font-medium text-[#1e3a5f]">
                  {t.fullName}
                  {t.isOpen && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      Open
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {t.code} · today {t.dayCount} · week {t.weekTotal}
                  {tone === "busy" && t.where ? ` · in ${t.where}` : ""}
                </p>
              </div>
              <Eye
                className={cn(
                  "h-4 w-4 shrink-0",
                  tone === "free"
                    ? "text-[#0d9488]"
                    : "text-slate-300 group-hover:text-[#0d9488]",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

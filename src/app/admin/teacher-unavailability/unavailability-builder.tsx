"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, CalendarX2, Loader2, Search, Trash2 } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PeriodStrip } from "@/components/admin/period-strip";
import { DAY_LABEL_LIST, PERIOD_ORDER } from "@/lib/constants";
import type {
  TeacherRow,
  TeacherUnavailabilityRow,
  UnavailableReason,
} from "@/lib/types";
import {
  UNAVAILABLE_REASON_LABELS,
  reasonLabel,
  unavailableEntry,
  unavailablePeriods,
  unavailabilityIndex,
  type BusyLabels,
} from "@/lib/unavailability";
import { cn, normalizeSearch } from "@/lib/utils";
import { clearTeacherUnavailability, saveTeacherUnavailability } from "./actions";

interface Props {
  date: string;
  /** 0=Sun .. 4=Thu; null when `date` fell on Friday/Saturday. */
  dayIndex: number | null;
  teachers: TeacherRow[];
  rows: TeacherUnavailabilityRow[];
  busyLabels: BusyLabels;
}

export function UnavailabilityBuilder({
  date,
  dayIndex,
  teachers,
  rows,
  busyLabels,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [reason, setReason] = useState<UnavailableReason>("on_leave");
  const [note, setNote] = useState("");
  const [periods, setPeriods] = useState<number[]>([...PERIOD_ORDER]);
  const [clearTarget, setClearTarget] = useState<TeacherRow | null>(null);

  const weekend = dayIndex === null;
  const index = useMemo(() => unavailabilityIndex(rows, date), [rows, date]);

  const filteredTeachers = useMemo(() => {
    const q = normalizeSearch(search);
    if (!q) return teachers;
    return teachers.filter(
      (t) =>
        normalizeSearch(t.full_name).includes(q) ||
        normalizeSearch(t.short_name).includes(q) ||
        normalizeSearch(t.teacher_code).includes(q) ||
        normalizeSearch(t.id).includes(q),
    );
  }, [teachers, search]);

  const teacher = teacherId
    ? (teachers.find((t) => t.id === teacherId) ?? null)
    : null;

  // Seed the form from what is already stored for the picked teacher on this
  // date, so opening a record to edit it starts from the saved answer rather
  // than from the defaults — otherwise a single stray Save would silently
  // rewrite every period back to "whole day".
  useEffect(() => {
    if (!teacherId) return;
    const saved = unavailableEntry(index, teacherId);
    if (!saved) {
      setReason("on_leave");
      setNote("");
      setPeriods([...PERIOD_ORDER]);
      return;
    }
    setReason(saved.reason);
    setNote(saved.note ?? "");
    setPeriods(unavailablePeriods(index, teacherId));
  }, [teacherId, index]);

  const recorded = useMemo(() => {
    const out: {
      teacher: TeacherRow;
      periods: number[];
      wholeDay: boolean;
      reason: string;
      note: string | null;
    }[] = [];
    for (const teacher of teachers) {
      const entry = unavailableEntry(index, teacher.id);
      if (!entry) continue;
      out.push({
        teacher,
        periods: unavailablePeriods(index, teacher.id),
        wholeDay: entry.isWholeDay,
        reason: reasonLabel(entry.reason),
        note: entry.note,
      });
    }
    return out.sort((a, b) => a.teacher.full_name.localeCompare(b.teacher.full_name));
  }, [index, teachers]);

  // Presence in `busyLabels` is the busy signal, so the set is just its keys.
  const busySet = useMemo(() => {
    const labels = teacherId ? busyLabels[teacherId] : undefined;
    if (!labels) return new Set<number>();
    return new Set(Object.keys(labels).map(Number));
  }, [busyLabels, teacherId]);

  const allSelected = periods.length === PERIOD_ORDER.length;

  const togglePeriod = (period: number) => {
    setPeriods((prev) =>
      prev.includes(period)
        ? prev.filter((p) => p !== period)
        : [...prev, period].sort((a, b) => a - b),
    );
  };

  const goToDate = (value: string) => {
    if (!value || value === date) return;
    startTransition(() => {
      router.push(`/admin/teacher-unavailability?date=${value}`);
    });
  };

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    if (weekend) {
      toast.error("No school on Friday or Saturday.");
      return;
    }
    if (!teacher) {
      toast.error("Pick a teacher first.");
      return;
    }
    if (periods.length === 0) {
      toast.error("Tick Whole day, or at least one period.");
      return;
    }
    if (reason === "other" && !note.trim()) {
      toast.error("Add a note explaining an “Other” reason.");
      return;
    }

    startTransition(async () => {
      const res = await saveTeacherUnavailability({
        date,
        teacherId: teacher.id,
        reason,
        note,
        wholeDay: allSelected,
        periods,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`${teacher.full_name} marked unavailable on ${date}.`);
      router.refresh();
    });
  };

  const handleClear = async () => {
    const target = clearTarget;
    if (!target) return;
    startTransition(async () => {
      const res = await clearTeacherUnavailability(date, target.id);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`${target.full_name} cleared for ${date}.`);
      setClearTarget(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-white p-4 shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">Date</p>
          <Input
            type="date"
            value={date}
            onChange={(e) => goToDate(e.target.value)}
            className="w-44"
          />
        </div>

        {dayIndex !== null ? (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <CalendarDays className="h-4 w-4" />
            <span>
              <strong>{DAY_LABEL_LIST[dayIndex]}</strong> — {date}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <CalendarX2 className="h-4 w-4" />
            <span>
              Friday or Saturday — <strong>no school</strong>, nothing can be
              recorded.
            </span>
          </div>
        )}

        <p className="ml-auto text-sm text-slate-500">
          {recorded.length === 0
            ? "Nobody marked on this date."
            : `${recorded.length} marked on this date.`}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <form
          onSubmit={handleSave}
          className="space-y-5 rounded-xl border bg-white p-5 shadow-sm"
        >
          {/* Teacher */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Teacher</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, short name or code"
                className="pl-8"
              />
            </div>

            <div className="max-h-64 divide-y overflow-y-auto rounded-lg border">
              {filteredTeachers.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-500">
                  No teacher matches “{search}”.
                </p>
              ) : (
                filteredTeachers.map((t) => {
                  const selected = t.id === teacherId;
                  const marked = index.has(t.id);
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => setTeacherId(t.id)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                        selected
                          ? "bg-[#1e3a5f] text-white"
                          : "hover:bg-slate-50",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {t.full_name}
                      </span>
                      <span
                        className={cn(
                          "font-mono text-xs",
                          selected ? "text-white/70" : "text-slate-400",
                        )}
                      >
                        {t.teacher_code}
                      </span>
                      {marked && (
                        <span
                          title="Already recorded on this date"
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            selected ? "bg-amber-300" : "bg-amber-500",
                          )}
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Coverage preview: shows which of their periods are real classes. */}
          {teacher && !weekend && (
            <div className="space-y-2 rounded-lg border bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500">
                  Their {DAY_LABEL_LIST[dayIndex!]} timetable
                </p>
                {recorded.find((r) => r.teacher.id === teacher.id) && (
                  <Badge variant="secondary">
                    {recorded.find((r) => r.teacher.id === teacher.id)!.wholeDay
                      ? "Already marked — whole day"
                      : `Already marked — ${recorded
                          .find((r) => r.teacher.id === teacher.id)!
                          .periods.join(", ")}`}
                  </Badge>
                )}
              </div>
              <PeriodStrip
                busy={busySet}
                describe={(period) => busyLabels[teacher.id]?.[period] ?? null}
              />
              <p className="text-xs text-slate-400">
                Green periods are free — leaving those uncovered needs no
                substitute.
              </p>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Reason</p>
            <div className="flex flex-wrap gap-2">
              {(
                Object.keys(
                  UNAVAILABLE_REASON_LABELS,
                ) as UnavailableReason[]
              ).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={reason === value}
                  onClick={() => setReason(value)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    reason === value
                      ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {UNAVAILABLE_REASON_LABELS[value]}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">
              Note{" "}
              {reason === "other" && (
                <span className="text-red-500">— required for “Other”</span>
              )}
            </p>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                reason === "other"
                  ? "e.g. Attending a district education meeting"
                  : "Optional detail"
              }
            />
          </div>

          {/* Periods */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-slate-500">Periods</p>
              <span className="text-xs text-slate-400">
                {periods.length} of {PERIOD_ORDER.length} selected
              </span>
            </div>

            <label
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                allSelected
                  ? "border-[#1e3a5f] bg-[#1e3a5f]/5 text-[#1e3a5f]"
                  : "border-slate-300 text-slate-700 hover:bg-slate-50",
              )}
            >
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) =>
                  setPeriods(e.target.checked ? [...PERIOD_ORDER] : [])
                }
                className="h-4 w-4"
              />
              Whole day
              <span className="ml-auto text-xs font-normal text-slate-400">
                Honored everywhere
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              {PERIOD_ORDER.map((period) => {
                const on = periods.includes(period);
                const busy = busySet.has(period);
                return (
                  <button
                    key={period}
                    type="button"
                    aria-pressed={on}
                    onClick={() => togglePeriod(period)}
                    title={
                      busy
                        ? `P${period} · ${busyLabels[teacherId ?? ""]?.[period] ?? "Busy"}`
                        : `P${period} · Free`
                    }
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg border text-xs font-semibold transition-colors",
                      on
                        ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                        : busy
                          ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                          : "border-slate-300 text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {period}
                  </button>
                );
              })}
            </div>

            <p className="text-xs leading-relaxed text-slate-400">
              All seven periods counts as a whole day — Adjust Routine, Assign
              Routine, Free Teachers, the Absence Report and the dashboard all
              honor it. Individual periods restrict only the substitute sheet in
              Adjust Routine.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-xs text-slate-400">
              {weekend
                ? "Pick a weekday to record anything."
                : `Saving replaces everything already recorded for this teacher on ${date}.`}
            </p>
            <Button
              type="submit"
              disabled={pending || weekend || !teacher || periods.length === 0}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Mark unavailable
            </Button>
          </div>
        </form>

        <aside className="space-y-4 self-start rounded-xl border bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-[#1e3a5f]">
              Recorded on {date}
            </h2>
            <p className="text-xs text-slate-500">
              Pick a row to edit it.
            </p>
          </div>

          {recorded.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-8 text-center">
              <CalendarX2 className="mx-auto h-5 w-5 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">
                Nobody is marked unavailable on this date.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {recorded.map((row) => (
                <li
                  key={row.teacher.id}
                  className={cn(
                    "rounded-lg border p-3 transition-colors",
                    row.teacher.id === teacherId
                      ? "border-[#1e3a5f] bg-slate-50"
                      : "border-slate-200",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setTeacherId(row.teacher.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-medium text-slate-800">
                        {row.teacher.full_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {row.wholeDay ? "Whole day" : row.periods.join(", ")}
                        {" · "}
                        {row.reason}
                      </p>
                      {row.note && (
                        <p className="mt-1 truncate text-xs text-slate-400">
                          {row.note}
                        </p>
                      )}
                    </button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      title="Remove this record"
                      disabled={pending}
                      onClick={() => setClearTarget(row.teacher)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <AlertDialog
        open={!!clearTarget}
        onOpenChange={(open) => {
          if (!open) setClearTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="h-5 w-5" />
              Remove unavailability record
            </AlertDialogTitle>
            <AlertDialogDescription>
              {clearTarget
                ? `Clear every period recorded for ${clearTarget.full_name} on ${date}? They will read as available again on every surface.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClear}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

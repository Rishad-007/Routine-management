"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Users,
  CalendarDays,
  Ban,
  CalendarX2,
  Info,
  Eye,
  ArrowUpDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, normalizeSearch } from "@/lib/utils";
import {
  DAY_LABEL_LIST,
  PERIOD_ORDER,
  TIFFIN_AFTER_PERIOD,
} from "@/lib/constants";
import { DAY_LABELS } from "@/lib/types";
import { PeriodStrip } from "@/components/admin/period-strip";
import {
  buildTeacherRoutinePreview,
  type RoutinePreviewSourceRow,
} from "@/lib/teacher-routine-preview";
import type { BusyLabels } from "@/lib/unavailability";

export interface TeacherLoadCard {
  id: string;
  fullName: string;
  code: string;
  designation: string;
  primarySubject: string;
  isOpen: boolean;
  /** Their own fixed classes (distinct periods) on this weekday. */
  fixedCount: number;
  /** Classes picked up as a substitute on this date. */
  coverCount: number;
  /** Distinct periods actually occupied on this date. */
  busyCount: number;
  /** Periods with no class. */
  freeCount: number;
  /** Longest continuous run, tiffin splitting runs. */
  stretch: number;
  level: "ok" | "yellow" | "red";
  /** Occupied periods, for the busy/free strip. */
  busyPeriods: number[];
  /** Reason label when declared out for the whole day, else null. */
  unavailable: string | null;
}

export interface TeacherLoadSummary {
  totalTeachers: number;
  totalClasses: number;
  totalCovers: number;
  fullyFree: number;
  unavailable: number;
  withCovers: number;
}

type FilterId = "all" | "covers" | "unavailable" | "free" | "busy";
type SortId = "name" | "load" | "free" | "covers";

interface Props {
  date: string;
  dayIndex: number | null;
  cards: TeacherLoadCard[];
  summary: TeacherLoadSummary;
  adjustedToday: boolean;
  suspendedClasses: { name: string; reason: string | null }[];
  busyLabels: BusyLabels;
  routineRows: RoutinePreviewSourceRow[];
  subjectLabels: Record<string, string>;
  roomLabels: Record<string, string>;
  routineSectionLabels: Record<string, string>;
  teacherLabels: Record<string, string>;
}

const LEVEL_META: Record<
  TeacherLoadCard["level"],
  { label: string; dot: string; chip: string }
> = {
  ok: {
    label: "Balanced",
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700",
  },
  yellow: {
    label: "Heavy",
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-700",
  },
  red: {
    label: "Overloaded",
    dot: "bg-red-500",
    chip: "bg-red-50 text-red-700",
  },
};

export function TeacherLoadView({
  date,
  dayIndex,
  cards,
  summary,
  adjustedToday,
  suspendedClasses,
  busyLabels,
  routineRows,
  subjectLabels,
  roomLabels,
  routineSectionLabels,
  teacherLabels,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<SortId>("name");
  const [routineTeacherId, setRoutineTeacherId] = useState<string | null>(null);

  const goToDate = (value: string) => {
    if (!value || value === date) return;
    startTransition(() => {
      router.push(`/admin/teacher-load?date=${value}`);
    });
  };

  const counts = useMemo(
    () => ({
      all: cards.length,
      covers: cards.filter((c) => c.coverCount > 0).length,
      unavailable: cards.filter((c) => c.unavailable).length,
      free: cards.filter((c) => c.busyCount === 0 && !c.unavailable).length,
      busy: cards.filter((c) => c.busyCount === PERIOD_ORDER.length).length,
    }),
    [cards],
  );

  const visible = useMemo(() => {
    const q = normalizeSearch(query);
    let list = cards;
    if (q) {
      list = list.filter(
        (c) =>
          normalizeSearch(c.fullName).includes(q) ||
          normalizeSearch(c.code).includes(q) ||
          normalizeSearch(c.designation).includes(q) ||
          normalizeSearch(c.primarySubject).includes(q) ||
          normalizeSearch(c.id).includes(q),
      );
    }
    if (filter === "covers") list = list.filter((c) => c.coverCount > 0);
    else if (filter === "unavailable")
      list = list.filter((c) => c.unavailable);
    else if (filter === "free")
      list = list.filter((c) => c.busyCount === 0 && !c.unavailable);
    else if (filter === "busy")
      list = list.filter((c) => c.busyCount === PERIOD_ORDER.length);

    const sorted = [...list];
    if (sort === "load")
      sorted.sort((a, b) => b.busyCount - a.busyCount || a.freeCount - b.freeCount);
    else if (sort === "free")
      sorted.sort((a, b) => b.freeCount - a.freeCount || a.busyCount - b.busyCount);
    else if (sort === "covers")
      sorted.sort((a, b) => b.coverCount - a.coverCount);
    else sorted.sort((a, b) => a.fullName.localeCompare(b.fullName));
    return sorted;
  }, [cards, query, filter, sort]);

  const routineTeacher = useMemo(
    () => cards.find((c) => c.id === routineTeacherId) ?? null,
    [cards, routineTeacherId],
  );

  const routinePreview = useMemo(() => {
    if (!routineTeacherId) return null;
    return buildTeacherRoutinePreview({
      routines: routineRows,
      teacherId: routineTeacherId,
      subjectLabel: (id) => subjectLabels[id] ?? "—",
      sectionLabel: (id) => routineSectionLabels[id] ?? "—",
      roomLabel: (id) => roomLabels[id] ?? "—",
      teacherLabel: (id) => teacherLabels[id] ?? "",
    });
  }, [
    routineTeacherId,
    routineRows,
    subjectLabels,
    routineSectionLabels,
    roomLabels,
    teacherLabels,
  ]);

  const filters: { id: FilterId; label: string }[] = [
    { id: "all", label: "All" },
    { id: "covers", label: "Has covers" },
    { id: "busy", label: "Busy all day" },
    { id: "free", label: "Fully free" },
    { id: "unavailable", label: "Unavailable" },
  ];

  const sortLabels: Record<SortId, string> = {
    name: "Name (A–Z)",
    load: "Highest load",
    free: "Most free",
    covers: "Most covers",
  };

  const stats = [
    { label: "Teachers", value: summary.totalTeachers, sub: "on staff" },
    { label: "Classes today", value: summary.totalClasses, sub: "periods running" },
    {
      label: "Covers",
      value: summary.totalCovers,
      sub: `${summary.withCovers} teachers`,
    },
    { label: "Fully free", value: summary.fullyFree, sub: "no class at all" },
    {
      label: "Unavailable",
      value: summary.unavailable,
      sub: "declared out",
    },
  ];

  if (dayIndex === null) {
    return (
      <Card className="bg-white/70">
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <CalendarX2 className="h-7 w-7 text-slate-300" />
          <p className="text-base font-semibold text-[#1e3a5f]">
            No school on {date}
          </p>
          <p className="max-w-md text-sm text-slate-500">
            Friday and Saturday are rest days. Pick a weekday from Sunday to
            Thursday to see the daily teacher load.
          </p>
          <Input
            type="date"
            value={date}
            onChange={(e) => goToDate(e.target.value)}
            className="mt-3 w-44"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Date + summary */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-white p-4 shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">Date</p>
          <Input
            type="date"
            value={date}
            onChange={(e) => goToDate(e.target.value)}
            disabled={pending}
            className="w-44"
          />
        </div>
        <div className="flex items-center gap-2 pb-1.5 text-sm text-slate-600">
          <CalendarDays className="h-4 w-4" />
          <span>
            <strong>{DAY_LABEL_LIST[dayIndex]}</strong> — {date}
          </span>
        </div>
        <p className="ml-auto pb-1.5 text-sm text-slate-500">
          {visible.length} of {cards.length} teachers shown
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} className="bg-white/70">
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-[#1e3a5f]">{s.value}</p>
              <p className="text-xs font-semibold text-slate-600">{s.label}</p>
              <p className="text-xs text-slate-400">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {suspendedClasses.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">
              {suspendedClasses.map((c) => c.name).join(", ")}
            </span>{" "}
            {suspendedClasses.length === 1 ? "is" : "are"} suspended, so their
            slots are excluded and their teachers count as free.
          </span>
        </div>
      )}

      {adjustedToday && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Info className="h-4 w-4 shrink-0" />
          Substitutions saved for {date} are applied, so this reflects who is
          actually teaching that day.
        </p>
      )}

      {/* Toolbar: search, filters, sort */}
      <div className="flex flex-col gap-3 rounded-xl border bg-white p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="relative w-full lg:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search name, ID, subject or designation…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f.id
                  ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "ml-1.5",
                  filter === f.id ? "text-white/70" : "text-slate-400",
                )}
              >
                {counts[f.id]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 lg:ml-auto">
          <ArrowUpDown className="h-4 w-4 text-slate-400" />
          <Select
            value={sort}
            onValueChange={(v) => setSort((v as SortId) ?? "name")}
            items={(Object.keys(sortLabels) as SortId[]).map((id) => ({
              value: id,
              label: sortLabels[id],
            }))}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(sortLabels) as SortId[]).map((id) => (
                <SelectItem key={id} value={id}>
                  {sortLabels[id]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Cards */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white px-4 py-14 text-center">
          <Users className="mx-auto h-6 w-6 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">
            No teacher matches the current search or filter.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((c) => (
            <TeacherCard
              key={c.id}
              card={c}
              labels={busyLabels[c.id]}
              onOpen={() => setRoutineTeacherId(c.id)}
            />
          ))}
        </div>
      )}

      {/* Weekly routine dialog */}
      <Dialog
        open={!!routineTeacher}
        onOpenChange={(open) => !open && setRoutineTeacherId(null)}
      >
        <DialogContent className="flex h-[min(92vh,900px)] max-h-[92vh] w-[90vw] flex-col gap-3 overflow-hidden p-5 sm:max-w-[1200px]">
          {routineTeacher && routinePreview && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#1e3a5f]">
                  {routineTeacher.fullName}&apos;s routine
                </DialogTitle>
                <DialogDescription>
                  {routineTeacher.code} · Weekly base routine with saved covers
                  applied. Continuous classes are highlighted; tiffin separates
                  the runs.
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
                            "border border-slate-200 px-3 py-3 text-center font-medium text-slate-600",
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
                      <th className="border border-slate-200 bg-slate-50 px-3 py-3 text-center font-medium text-slate-600">
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
                                    {isContinuous && (
                                      <Badge className="bg-amber-200 px-1 py-0 text-[9px] text-amber-900">
                                        {cell.continuous} continuous
                                      </Badge>
                                    )}
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
                  {DAY_LABELS[dayIndex]}:{" "}
                  {routinePreview.daily[dayIndex]?.count ?? 0} classes
                </span>
                <span className="font-medium text-amber-700">
                  Longest continuous: {routinePreview.longest} periods
                </span>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeacherCard({
  card,
  labels,
  onOpen,
}: {
  card: TeacherLoadCard;
  labels?: Record<number, string>;
  onOpen: () => void;
}) {
  const meta = LEVEL_META[card.level];
  const busySet = useMemo(() => new Set(card.busyPeriods), [card.busyPeriods]);
  const isUnavailable = !!card.unavailable;

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`View ${card.fullName}'s weekly routine`}
      className={cn(
        "group flex w-full flex-col rounded-xl border bg-white p-3 text-left shadow-sm transition-all hover:border-[#0d9488] hover:shadow-md",
        isUnavailable
          ? "border-violet-200 bg-violet-50/50"
          : card.coverCount > 0
            ? "border-teal-200"
            : "border-slate-200",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate font-semibold text-[#1e3a5f]">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />
            {card.fullName}
          </p>
          <p className="truncate text-xs text-slate-500">
            <span className="font-mono">{card.code}</span>
            {card.designation ? ` · ${card.designation}` : ""}
          </p>
        </div>
        <Eye className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-[#0d9488]" />
      </div>

      <div className="mt-1.5 flex min-h-5 flex-wrap items-center gap-1">
        {card.isOpen && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            Open
          </span>
        )}
        {card.coverCount > 0 && (
          <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
            +{card.coverCount} cover{card.coverCount > 1 ? "s" : ""}
          </span>
        )}
        {isUnavailable && (
          <span
            title={card.unavailable ?? "Unavailable"}
            className="max-w-full truncate rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700"
          >
            {card.unavailable}
          </span>
        )}
        {!isUnavailable && card.level !== "ok" && (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium",
              meta.chip,
            )}
          >
            {meta.label}
            {card.stretch >= 3 ? ` · ${card.stretch} in a row` : ""}
          </span>
        )}
      </div>

      <p className="mt-1 truncate text-xs text-slate-400">
        {card.primarySubject}
      </p>

      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
        <Stat label="Fixed" value={card.fixedCount} tone="slate" />
        <Stat
          label="Covers"
          value={card.coverCount}
          tone={card.coverCount > 0 ? "teal" : "slate"}
          prefix={card.coverCount > 0 ? "+" : ""}
        />
        <Stat
          label="Free"
          value={card.freeCount}
          tone={card.freeCount > 0 ? "emerald" : "slate"}
        />
      </div>

      <PeriodStrip
        busy={busySet}
        describe={(period) => labels?.[period] ?? null}
        className="mt-2"
      />
    </button>
  );
}

function Stat({
  label,
  value,
  tone,
  prefix = "",
}: {
  label: string;
  value: number;
  tone: "slate" | "teal" | "emerald";
  prefix?: string;
}) {
  const toneClass = {
    slate: "text-slate-700",
    teal: "text-teal-700",
    emerald: "text-emerald-700",
  }[tone];
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
      <p className={cn("text-sm font-bold", toneClass)}>
        {prefix}
        {value}
      </p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Coffee,
  DoorOpen,
  Moon,
  RefreshCw,
  Search,
  Sun,
  Users,
  UserCheck,
  UserX,
  Clapperboard,
  Repeat2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useCurrentPeriod } from "@/hooks/use-current-period";
import { buildSchedule } from "@/lib/periods";
import { TIFFIN_AFTER_PERIOD } from "@/lib/constants";
import {
  buildNowTeaching,
  EMPTY_NOW_TEACHING,
  type NowAssignment,
  type NowTeaching,
} from "@/lib/now-teaching";
import { cn } from "@/lib/utils";
import type { Season } from "@/lib/constants";
import type {
  AdjustmentRow,
  ClassRow,
  RoomRow,
  RoutineRow,
  SectionRow,
  SubjectRow,
  TeacherRow,
} from "@/lib/types";

interface Props {
  classes: ClassRow[];
  sections: SectionRow[];
  teachers: TeacherRow[];
  subjects: SubjectRow[];
  rooms: RoomRow[];
  /** Routine rows for today only, every period. */
  todayRows: RoutineRow[];
  adjustments: AdjustmentRow[];
  season: Season;
  today: string;
}

type Preview = number | "tiffin" | null;
type ViewState = "period" | "preview" | "tiffin" | "before" | "after" | "weekend";

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

function normalize(value: string | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function NowTeachingBoard({
  classes,
  sections,
  teachers,
  subjects,
  rooms,
  todayRows,
  adjustments,
  season,
  today,
}: Props) {
  const router = useRouter();
  const { result, dayIndex, now } = useCurrentPeriod(season);

  const [preview, setPreview] = useState<Preview>(null);
  const [groupBy, setGroupBy] = useState<"class" | "teacher">("class");
  const [query, setQuery] = useState("");
  const [onlySubstituted, setOnlySubstituted] = useState(false);
  const [showFree, setShowFree] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [clock, setClock] = useState(() => Date.now());

  const schedule = useMemo(() => buildSchedule(season, now), [season, now]);
  const isWeekend = dayIndex === null;
  const livePeriod = result.kind === "period" ? (result.periodNumber ?? null) : null;
  const activePeriod = preview === "tiffin" ? null : (preview ?? livePeriod);

  const board: NowTeaching = useMemo(() => {
    if (activePeriod === null) {
      // Tiffin, before school, after school: nobody holds a slot, so every
      // teacher is free. Still worth reporting, just with nothing to list.
      const freeTeacherIds = teachers.map((t) => t.id);
      return {
        ...EMPTY_NOW_TEACHING,
        freeTeacherIds,
        stats: { ...EMPTY_NOW_TEACHING.stats, freeTeachers: freeTeacherIds.length },
      };
    }
    return buildNowTeaching(
      {
        rows: todayRows,
        adjustments,
        date: today,
        sections,
        classes,
        subjects,
        rooms,
        teachers,
      },
      activePeriod,
    );
  }, [
    activePeriod,
    todayRows,
    adjustments,
    today,
    sections,
    classes,
    subjects,
    rooms,
    teachers,
  ]);

  // A 1s clock ONLY drives the countdown text. The roster itself is memoised on
  // the period, so ticking does not re-sort or re-filter anything.
  useEffect(() => {
    if (preview !== null) return;
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, [preview]);

  // Pick up substitutions made during the current period. Skipped while the
  // user is previewing another period, so it never yanks the view out from
  // under them.
  const lastLivePeriod = useRef(livePeriod);
  useEffect(() => {
    if (lastLivePeriod.current === livePeriod) return;
    lastLivePeriod.current = livePeriod;
    if (preview !== null) return;
    router.refresh();
  }, [livePeriod, preview, router]);

  const view: ViewState = isWeekend
    ? "weekend"
    : preview === "tiffin"
      ? "tiffin"
      : preview !== null
        ? "preview"
        : result.kind;

  const countdownMs =
    view === "period" && result.block
      ? Math.max(0, result.block.end.getTime() - clock)
      : null;

  const normQuery = normalize(query);
  const matches = (a: NowAssignment) => {
    if (onlySubstituted && !a.isAdjusted) return false;
    if (!normQuery) return true;
    return [
      a.className,
      a.sectionName,
      a.classLabel,
      a.subjectName,
      a.roomName,
      a.teacherName,
      a.teacherCode,
      a.coveringFor,
    ].some((v) => v && normalize(v).includes(normQuery));
  };

  const classGroups = useMemo(
    () =>
      board.byClass
        .map((g) => ({ ...g, items: g.items.filter(matches) }))
        .filter((g) => g.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board, normQuery, onlySubstituted],
  );
  const teacherGroups = useMemo(
    () =>
      board.byTeacher
        .map((g) => ({ ...g, items: g.items.filter(matches) }))
        .filter((g) => g.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board, normQuery, onlySubstituted],
  );

  const visibleCount =
    groupBy === "class"
      ? classGroups.reduce((n, g) => n + g.items.length, 0)
      : teacherGroups.reduce((n, g) => n + g.items.length, 0);
  const filtersActive = !!normQuery || onlySubstituted;

  const doRefresh = () => {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 700);
  };

  const activeBlock = schedule.find((b) => b.periodNumber === activePeriod);
  const freeTeachers = useMemo(
    () => board.freeTeacherIds,
    [board.freeTeacherIds],
  );

  const statusTitle =
    view === "period"
      ? `Period ${result.periodNumber}`
      : view === "preview"
        ? `Period ${preview} preview`
        : view === "tiffin"
          ? "Tiffin Break"
          : view === "before"
            ? "School not started"
            : view === "after"
              ? "School is over"
              : "Rest day";

  const statusTime =
    view === "period"
      ? result.timeLabel
      : view === "preview"
        ? activeBlock
          ? `${activeBlock.startLabel} - ${activeBlock.endLabel}`
          : undefined
        : view === "tiffin"
          ? result.timeLabel
          : view === "before"
            ? `First period starts ${result.nextPeriodLabel}`
            : undefined;

  return (
    <div
      className={cn(
        "rounded-2xl border shadow-sm transition-opacity",
        view === "tiffin"
          ? "border-amber-200 bg-gradient-to-br from-amber-50 to-white"
          : view === "period"
            ? "border-[#0d9488]/30 bg-gradient-to-br from-[#0d9488]/10 to-white"
            : "border-slate-200 bg-white",
        refreshing && "opacity-70",
      )}
    >
      {/* ---------- header ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            {season === "summer" ? (
              <Sun className="h-3.5 w-3.5 text-amber-500" />
            ) : (
              <Moon className="h-3.5 w-3.5 text-slate-400" />
            )}
            <span>{season === "summer" ? "Summer" : "Winter"} schedule</span>
            <span className="text-slate-300">·</span>
            <span aria-live="polite">
              {dayIndex !== null ? `Day ${dayIndex + 1}` : "Weekend"}
            </span>
            {view === "period" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0d9488] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                </span>
                Live
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-[#1e3a5f]">
              {view === "tiffin" ? (
                <span className="flex items-center gap-2 text-amber-700">
                  <Coffee className="h-6 w-6" /> {statusTitle}
                </span>
              ) : view === "before" || view === "after" || view === "weekend" ? (
                <span className="text-slate-400">{statusTitle}</span>
              ) : (
                <span className="flex items-center gap-2">
                  <Clapperboard className="h-6 w-6 text-[#0d9488]" />
                  {statusTitle}
                </span>
              )}
            </h2>
            {statusTime && (
              <span className="text-sm text-slate-500">{statusTime}</span>
            )}
            {countdownMs !== null && (
              <span className="rounded-md bg-white/70 px-2 py-0.5 font-mono text-xs text-slate-600 tabular-nums">
                ends in {formatCountdown(countdownMs)}
              </span>
            )}
          </div>

          {view === "preview" && (
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#0d9488]/30 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-[#0d9488] hover:bg-white"
            >
              <X className="h-3 w-3" /> Back to now
            </button>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={doRefresh}
          disabled={refreshing}
          className="shrink-0"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* ---------- stats ---------- */}
      {view === "period" || view === "preview" ? (
        <div className="mt-4 grid grid-cols-2 gap-2 px-5 sm:grid-cols-3 lg:grid-cols-5">
          <Stat
            icon={BookOpen}
            value={board.stats.sections}
            label="Classes running"
            tone="navy"
          />
          <Stat
            icon={Users}
            value={board.stats.teachers}
            label="Teachers on duty"
            tone="navy"
          />
          <Stat
            icon={Repeat2}
            value={board.stats.substitutes}
            label="Substitutes"
            tone="amber"
          />
          <Stat
            icon={DoorOpen}
            value={board.stats.rooms}
            label="Rooms in use"
            tone="teal"
          />
          <Stat
            icon={UserX}
            value={board.stats.freeTeachers}
            label="Teachers free"
            tone="teal"
            className="col-span-2 sm:col-span-3 lg:col-span-1"
          />
        </div>
      ) : null}

      {/* ---------- period rail ---------- */}
      {!isWeekend && (
        <div className="mt-4 flex items-center gap-1.5 overflow-x-auto px-5 pb-1">
          {schedule.map((b) => {
            const isActive =
              b.periodNumber === activePeriod ||
              (b.periodNumber === undefined && preview === "tiffin");
            return (
              <button
                key={b.label}
                type="button"
                onClick={() =>
                  setPreview(b.periodNumber === undefined ? "tiffin" : b.periodNumber)
                }
                className={cn(
                  "shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "border-[#0d9488] bg-[#0d9488] text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-[#0d9488]/40",
                )}
              >
                {b.periodNumber ? `P${b.periodNumber}` : "Tiffin"}
              </button>
            );
          })}
          {preview !== null && (
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="shrink-0 rounded-lg border border-[#0d9488]/30 bg-white px-2.5 py-1 text-xs font-medium text-[#0d9488] hover:bg-[#0d9488]/10"
            >
              Now
            </button>
          )}
        </div>
      )}

      {/* ---------- toolbar ---------- */}
      {(view === "period" || view === "preview") && !isWeekend && (
        <div className="mt-3 flex flex-wrap items-center gap-2 px-5">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teacher, class, section or room"
              className="h-8 pl-8 text-sm"
            />
          </div>
          <Tabs
            value={groupBy}
            onValueChange={(v) => setGroupBy((v as "class" | "teacher") ?? "class")}
          >
            <TabsList>
              <TabsTrigger value="class">By Class</TabsTrigger>
              <TabsTrigger value="teacher">By Teacher</TabsTrigger>
            </TabsList>
          </Tabs>
          <button
            type="button"
            onClick={() => setOnlySubstituted((v) => !v)}
            className={cn(
              "h-8 rounded-lg border px-2.5 text-xs font-medium transition-colors",
              onlySubstituted
                ? "border-amber-400 bg-amber-50 text-amber-800"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
            )}
          >
            Substituted only
          </button>
        </div>
      )}

      {/* ---------- body ---------- */}
      <div className="px-5 pb-5 pt-3">
        {view === "weekend" && (
          <StateMessage
            icon={Moon}
            title="Rest day"
            body="Friday and Saturday are weekly holidays. No classes are scheduled."
          />
        )}

        {view === "before" && (
          <StateMessage
            icon={Sun}
            title="School starts at {time}"
            body="The live roster appears here the moment the first period begins."
            time={result.nextPeriodLabel}
          />
        )}

        {view === "after" && (
          <StateMessage
            icon={Moon}
            title="School is over for today"
            body="Pick a period above to look back at who was teaching it."
          />
        )}

        {view === "tiffin" && (
          <StateMessage
            icon={Coffee}
            title="Tiffin break"
            body={`Classes resume after period ${TIFFIN_AFTER_PERIOD}. ${board.stats.freeTeachers} teachers are free right now.`}
          />
        )}

        {(view === "period" || view === "preview") && board.assignments.length === 0 && (
          <StateMessage
            icon={BookOpen}
            title="No classes in this period"
            body="Nothing is scheduled for this period. Try another one above."
          />
        )}

        {(view === "period" || view === "preview") &&
          board.assignments.length > 0 &&
          visibleCount === 0 && (
            <StateMessage
              icon={Search}
              title="Nothing matches your filters"
              body={
                filtersActive
                  ? "Try a different search term, or clear the substituted filter."
                  : undefined
              }
              action={
                filtersActive ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuery("");
                      setOnlySubstituted(false);
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          )}

        {(view === "period" || view === "preview") && visibleCount > 0 && (
          <div className="space-y-3">
            {groupBy === "class" ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {classGroups.map((g) => (
                  <div key={g.classId} className="rounded-xl border bg-white">
                    <div className="flex items-center justify-between border-b px-3 py-2">
                      <span className="text-sm font-semibold text-[#1e3a5f]">
                        {g.className}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {g.items.length} running
                      </span>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {g.items.map((a) => (
                        <ClassRow key={a.key} a={a} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {teacherGroups.map((g) => (
                  <div key={g.teacherId} className="rounded-xl border bg-white">
                    <div className="flex items-center gap-2.5 border-b px-3 py-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="bg-[#1e3a5f] text-[11px] text-white">
                          {initials(g.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 truncate text-sm font-semibold text-[#1e3a5f]">
                        {g.name}
                      </span>
                      {g.code && (
                        <span className="text-[11px] text-slate-400">{g.code}</span>
                      )}
                      {g.items.some((i) => i.isAdjusted) && (
                        <Badge className="ml-auto bg-amber-100 text-amber-800">
                          Substitute
                        </Badge>
                      )}
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {g.items.map((a) => (
                        <TeacherRow key={a.key} a={a} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---------- free teachers ---------- */}
        {view === "period" || view === "preview" ? (
          freeTeachers.length > 0 ? (
            <div className="mt-4 rounded-xl border border-dashed bg-white/60">
              <button
                type="button"
                onClick={() => setShowFree((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                <UserCheck className="h-4 w-4 text-[#0d9488]" />
                <span className="text-sm font-medium text-slate-700">
                  {freeTeachers.length} teacher{freeTeachers.length === 1 ? "" : "s"} free
                  this period
                </span>
                <span className="ml-auto text-[11px] text-slate-400">
                  {showFree ? "Hide" : "Show"}
                </span>
              </button>
              {showFree && (
                <div className="flex flex-wrap gap-1.5 border-t px-3 py-2.5">
                  {freeTeachers.map((id) => {
                    const t = teachers.find((x) => x.id === id);
                    if (!t) return null;
                    return (
                      <span
                        key={id}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600"
                      >
                        {t.full_name}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null
        ) : null}
      </div>
    </div>
  );
}

type Tone = "navy" | "amber" | "teal";

function Stat({
  icon: Icon,
  value,
  label,
  tone,
  className,
}: {
  icon: typeof Users;
  value: number;
  label: string;
  tone: Tone;
  className?: string;
}) {
  const tones: Record<Tone, string> = {
    navy: "text-[#1e3a5f]",
    amber: "text-amber-600",
    teal: "text-[#0d9488]",
  };
  return (
    <div className={cn("rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2", className)}>
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5", tones[tone])} />
        <span className="text-[11px] uppercase tracking-wide text-slate-400">
          {label}
        </span>
      </div>
      <p className={cn("mt-0.5 text-xl font-bold tabular-nums", tones[tone])}>
        {value}
      </p>
    </div>
  );
}

function StateMessage({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof Moon;
  title: string;
  body?: string;
  time?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <Icon className="h-7 w-7 text-slate-300" />
      <p className="text-sm font-medium text-slate-600">
        {title.replace("{time}", "")}
      </p>
      {body && <p className="max-w-sm text-xs text-slate-400">{body}</p>}
      {action}
    </div>
  );
}

function ClassRow({ a }: { a: NowAssignment }) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5",
        a.isAdjusted && "bg-amber-50/70",
      )}
    >
      <span className="w-24 shrink-0 truncate text-sm font-medium text-slate-700">
        {a.sectionName}
      </span>
      <span className="flex min-w-0 items-center gap-1 text-sm text-slate-600">
        <BookOpen className="h-3.5 w-3.5 shrink-0 text-[#0d9488]" />
        <span className="truncate">{a.subjectName ?? "—"}</span>
      </span>
      <span className="flex items-center gap-1 text-xs text-slate-400">
        <DoorOpen className="h-3.5 w-3.5 shrink-0" />
        {a.roomName ?? "—"}
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        {a.isTag && (
          <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
            Tag
          </Badge>
        )}
        {a.isAdjusted && (
          <AdjustedBadge coveringFor={a.coveringFor} />
        )}
        <span className="flex items-center gap-1.5">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="bg-[#1e3a5f] text-[10px] text-white">
              {initials(a.teacherName ?? "?")}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm text-slate-700">{a.teacherName ?? "—"}</span>
        </span>
      </span>
    </li>
  );
}

function TeacherRow({ a }: { a: NowAssignment }) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5",
        a.isAdjusted && "bg-amber-50/70",
      )}
    >
      <span className="text-sm font-medium text-slate-700">{a.classLabel}</span>
      <span className="flex min-w-0 items-center gap-1 text-sm text-slate-600">
        <BookOpen className="h-3.5 w-3.5 shrink-0 text-[#0d9488]" />
        <span className="truncate">{a.subjectName ?? "—"}</span>
      </span>
      <span className="flex items-center gap-1 text-xs text-slate-400">
        <DoorOpen className="h-3.5 w-3.5 shrink-0" />
        {a.roomName ?? "—"}
      </span>
      {a.isTag && (
        <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
          Tag
        </Badge>
      )}
      {a.isAdjusted && <AdjustedBadge coveringFor={a.coveringFor} />}
    </li>
  );
}

function AdjustedBadge({ coveringFor }: { coveringFor?: string }) {
  return (
    <Badge
      className="h-4 max-w-[180px] truncate bg-amber-100 px-1.5 text-[10px] text-amber-800"
      title={coveringFor ? `Covering for ${coveringFor}` : "Substitution"}
    >
      {coveringFor ? `covering for ${coveringFor}` : "adjusted"}
    </Badge>
  );
}
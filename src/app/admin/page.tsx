import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  ClipboardList,
  Database,
  DoorOpen,
  Eye,
  GraduationCap,
  Moon,
  PieChart as PieChartIcon,
  School,
  SlidersHorizontal,
  Sun,
  Target,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import {
  getAdjustments,
  getClasses,
  getRoutines,
  getRooms,
  getSections,
  getSetting,
  getSubjects,
  getTeachers,
} from "@/lib/data";
import { weeklyLoad } from "@/lib/conflicts";
import {
  getCurrentPeriod,
  getSchoolDayIndex,
  getTodayLocal,
} from "@/lib/periods";
import { DAY_LABEL_LIST, DAY_ORDER } from "@/lib/constants";
import type { Season } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { RoutineCoverageChart } from "@/components/admin/dashboard/routine-coverage-chart";
import { TeacherWorkloadChart } from "@/components/admin/dashboard/teacher-workload-chart";
import { ClassCoverageHeatmap } from "@/components/admin/dashboard/class-heatmap";
import { RoomUtilizationCard } from "@/components/admin/dashboard/room-utilization";

export const dynamic = "force-dynamic";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const JS_DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatLongDate(d: Date): string {
  return `${JS_DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function workloadLevel(weekly: number): "light" | "normal" | "heavy" {
  if (weekly >= 30) return "heavy";
  if (weekly >= 20) return "normal";
  return "light";
}

const WORKLOAD_META: Record<
  "light" | "normal" | "heavy",
  { label: string; className: string }
> = {
  light: { label: "Light (< 20)", className: "bg-emerald-500" },
  normal: { label: "Normal (20–29)", className: "bg-amber-500" },
  heavy: { label: "Heavy (30+)", className: "bg-red-500" },
};

const STAT_STYLES: { tile: string; text: string }[] = [
  { tile: "bg-[#1e3a5f]/10", text: "text-[#1e3a5f]" },
  { tile: "bg-teal-500/10", text: "text-teal-700" },
  { tile: "bg-indigo-500/10", text: "text-indigo-700" },
  { tile: "bg-rose-500/10", text: "text-rose-700" },
  { tile: "bg-violet-500/10", text: "text-violet-700" },
  { tile: "bg-amber-500/10", text: "text-amber-700" },
];

export default async function AdminDashboardPage() {
  await requireAdmin();

  const [
    classes,
    sections,
    subjects,
    teachers,
    rooms,
    routines,
    adjustments,
    season,
  ] = await Promise.all([
    getClasses(),
    getSections(),
    getSubjects(),
    getTeachers(),
    getRooms(),
    getRoutines(),
    getAdjustments(),
    getSetting("season"),
  ]);

  const selectedSeason = (season as Season) ?? "summer";
  const todayStr = getTodayLocal();
  const now = new Date();
  const dayIndex = getSchoolDayIndex(now);
  const todayAdjustments = adjustments.filter((a) => a.adjust_date === todayStr);

  const teacherName = new Map(teachers.map((t) => [t.id, t.short_name]));
  const sectionMap = new Map(sections.map((s) => [s.id, s]));
  const classMap = new Map(classes.map((c) => [c.id, c]));

  const totalCells = sections.length * DAY_ORDER.length * 7;
  const filledPrimary = new Set(
    routines
      .filter((r) => !r.is_tag)
      .map((r) => `${r.section_id}:${r.day}:${r.period_number}`)
  ).size;
  const coverage =
    totalCells > 0 ? Math.round((filledPrimary / totalCells) * 100) : 0;

  const heatmap = classes.map((c) => {
    const secIds = new Set(
      sections.filter((s) => s.class_id === c.id).map((s) => s.id)
    );
    const days = DAY_ORDER.map((d) => {
      const total = secIds.size * 7;
      const filled = new Set(
        routines
          .filter((r) => !r.is_tag && r.day === d && secIds.has(r.section_id))
          .map((r) => `${r.section_id}:${r.period_number}`)
      ).size;
      return total > 0 ? Math.round((filled / total) * 100) : 0;
    });
    return { className: c.name, sections: secIds.size, days };
  });

  const workloadData = teachers
    .map((t) => {
      const periods = weeklyLoad(routines, t.id).total;
      return { name: t.short_name, periods, level: workloadLevel(periods) };
    })
    .sort((a, b) => b.periods - a.periods);
  const workloadCounts = {
    light: workloadData.filter((d) => d.level === "light").length,
    normal: workloadData.filter((d) => d.level === "normal").length,
    heavy: workloadData.filter((d) => d.level === "heavy").length,
  };

  const todayRoomIds = new Set(
    routines
      .filter((r) => !r.is_tag && r.day === dayIndex && r.room_id)
      .map((r) => r.room_id as string)
  );
  const usedRooms = todayRoomIds.size;
  const usedRoomNames = rooms
    .filter((r) => todayRoomIds.has(r.id))
    .map((r) => r.name)
    .sort();

  const adjustmentRows = todayAdjustments
    .map((a) => {
      const sec = sectionMap.get(a.section_id);
      const cls = sec ? classMap.get(sec.class_id) : undefined;
      const original = a.original_teacher_id
        ? teacherName.get(a.original_teacher_id)
        : undefined;
      const substitute = a.new_teacher_id
        ? teacherName.get(a.new_teacher_id)
        : undefined;
      return {
        key: a.id,
        sectionLabel:
          cls && sec ? `${cls.name} — Section ${sec.name}` : "Unknown section",
        period: a.period_number,
        isTag: a.is_tag,
        original: original ?? "—",
        substitute: substitute ?? "—",
        reason: a.reason,
      };
    })
    .sort((a, b) => a.period - b.period);

  const stats = [
    {
      label: "Classes",
      value: classes.length,
      sub: `${sections.length} sections`,
      icon: School,
    },
    {
      label: "Teachers",
      value: teachers.length,
      sub: `${teachers.filter((t) => t.is_open_teacher).length} open`,
      icon: Users,
    },
    { label: "Subjects", value: subjects.length, sub: "in curriculum", icon: PieChartIcon },
    {
      label: "Rooms today",
      value: usedRooms,
      sub: `${rooms.length} available`,
      icon: DoorOpen,
    },
    {
      label: "Coverage",
      value: `${coverage}%`,
      sub: `${filledPrimary.toLocaleString()} periods`,
      icon: Target,
    },
    {
      label: "Adjustments",
      value: todayAdjustments.length,
      sub: "today",
      icon: SlidersHorizontal,
    },
  ];

  const seasonLabel =
    selectedSeason === "winter"
      ? "Winter schedule · starts 09:10"
      : "Summer schedule · starts 08:30";

  const periodNow = getCurrentPeriod(now, selectedSeason);

  const liveBadge =
    dayIndex === null
      ? { dot: false, label: "Weekend · no classes" }
      : periodNow.kind === "period"
        ? { dot: true, label: `Period ${periodNow.periodNumber} running now` }
        : periodNow.kind === "tiffin"
          ? { dot: true, label: "Tiffin break" }
          : periodNow.kind === "before"
            ? {
                dot: false,
                label: `School starts at ${periodNow.nextPeriodLabel}`,
              }
            : { dot: false, label: "School day complete" };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#1e3a5f] via-[#1e3a5f] to-teal-900 px-6 py-6 text-white shadow-sm sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
              <GraduationCap className="h-6 w-6 text-teal-300" />
            </div>
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">Dashboard</h1>
              <p className="text-sm text-slate-300">
                {formatLongDate(now)} · {seasonLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-200">
              {liveBadge.dot && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-300 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-300" />
                </span>
              )}
              {liveBadge.label}
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-200">
              {dayIndex === null ? (
                <Moon className="h-3.5 w-3.5" />
              ) : (
                <Sun className="h-3.5 w-3.5" />
              )}
              {dayIndex === null
                ? "Rest day"
                : DAY_LABEL_LIST[dayIndex]}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s, i) => (
          <Card key={s.label} className="bg-white/70">
            <CardContent className="p-4">
              <div
                className={cn(
                  "mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg",
                  STAT_STYLES[i].tile
                )}
              >
                <s.icon className={cn("h-4.5 w-4.5", STAT_STYLES[i].text)} />
              </div>
              <p className="text-2xl font-bold text-[#1e3a5f]">{s.value}</p>
              <p className="text-xs font-semibold text-slate-600">{s.label}</p>
              <p className="text-xs text-slate-400">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="bg-white/70 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-[#1e3a5f]">
              <Target className="h-4 w-4 text-teal-600" />
              Routine Coverage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RoutineCoverageChart
              percent={coverage}
              filled={filledPrimary}
              total={totalCells}
            />
          </CardContent>
        </Card>

        <Card className="bg-white/70 lg:col-span-3">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base text-[#1e3a5f]">
              <Users className="h-4 w-4 text-[#1e3a5f]" />
              Teacher Workload
            </CardTitle>
            {teachers.length > 0 && (
              <div className="hidden items-center gap-3 sm:flex">
                {(["light", "normal", "heavy"] as const).map((lvl) => (
                  <span
                    key={lvl}
                    className="flex items-center gap-1.5 text-xs text-slate-500"
                  >
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        WORKLOAD_META[lvl].className
                      )}
                    />
                    {WORKLOAD_META[lvl].label}
                  </span>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {workloadData.length > 0 ? (
              <TeacherWorkloadChart data={workloadData} />
            ) : (
              <p className="py-10 text-center text-sm text-slate-400">
                No teachers yet. Add teachers to see workload distribution.
              </p>
            )}
            <div className="mt-2 grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3 text-center sm:hidden">
              {(["light", "normal", "heavy"] as const).map((lvl) => (
                <div key={lvl}>
                  <p className="text-lg font-bold text-[#1e3a5f]">
                    {workloadCounts[lvl]}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {WORKLOAD_META[lvl].label.split(" (")[0]}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-[#1e3a5f]">
            <CalendarClock className="h-4 w-4 text-[#0d9488]" />
            Daily Coverage by Class
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ClassCoverageHeatmap data={heatmap} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="bg-white/70 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-[#1e3a5f]">
              <ClipboardList className="h-4 w-4 text-amber-600" />
              Today&apos;s Adjustments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dayIndex === null ? (
              <p className="py-6 text-center text-sm text-slate-400">
                No school today — the routine rests.
              </p>
            ) : adjustmentRows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <BellRing className="h-6 w-6 text-slate-300" />
                <p className="text-sm text-slate-400">
                  No adjustments today. The routine is running as scheduled.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {adjustmentRows.map((r) => (
                  <li
                    key={r.key}
                    className="rounded-lg border border-slate-100 bg-white p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-slate-200 bg-slate-50 text-[#1e3a5f]"
                      >
                        Period {r.period}
                      </Badge>
                      <span className="text-sm font-semibold text-slate-700">
                        {r.sectionLabel}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500">
                      {r.original}
                      <span className="mx-1 text-slate-300">→</span>
                      <span className="font-medium text-teal-700">
                        {r.substitute}
                      </span>
                      {r.isTag ? " (tag)" : ""}
                      {r.reason ? (
                        <span className="text-slate-400"> · {r.reason}</span>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/admin/adjust"
              className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
            >
              Open adjustment log
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>

        <Card className="bg-white/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-[#1e3a5f]">
              <DoorOpen className="h-4 w-4 text-rose-600" />
              Room Utilization
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dayIndex === null ? (
              <p className="py-6 text-center text-sm text-slate-400">
                No rooms in use today.
              </p>
            ) : (
              <RoomUtilizationCard
                used={usedRooms}
                total={rooms.length}
                usedNames={usedRoomNames}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            href: "/admin/master-data",
            icon: Database,
            title: "Update Database",
            desc: "Refresh master data, import or fix sections, rooms and teachers.",
          },
          {
            href: "/admin/routine",
            icon: CalendarClock,
            title: "Update Routine",
            desc: "Build and fix the weekly class routine per section.",
          },
          {
            href: "/admin/adjust",
            icon: SlidersHorizontal,
            title: "Adjust Routine",
            desc: "Apply substitutions or tag changes for a specific day.",
          },
        ].map((a) => (
          <Link key={a.href} href={a.href} className="group">
            <Card className="h-full bg-white/70 transition-all hover:border-[#0d9488]/40 hover:shadow-md">
              <CardContent className="p-4">
                <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg bg-[#0d9488]/10">
                  <a.icon className="h-4.5 w-4.5 text-teal-700" />
                </div>
                <p className="font-semibold text-[#1e3a5f]">{a.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {a.desc}
                </p>
                <span className="mt-3 flex items-center gap-1 text-xs font-semibold text-teal-700">
                  Open
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { href: "/routine", label: "Class Routine" },
          { href: "/teachers", label: "Teacher Routine" },
          { href: "/teachers", label: "Teacher Directory" },
        ].map((l) => (
          <Link
            key={l.label}
            href={l.href}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/50 px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:border-[#1e3a5f]/30 hover:text-[#1e3a5f]"
          >
            <span className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-slate-400" />
              {l.label}
            </span>
            <ArrowRight className="h-4 w-4 text-slate-300" />
          </Link>
        ))}
      </div>
    </div>
  );
}
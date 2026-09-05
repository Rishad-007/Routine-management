"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  Coffee,
  Moon,
  School,
  Sun,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CurrentPeriodCard } from "./current-period-card";
import { FadeIn } from "@/components/motion/fade-in";
import { useCurrentPeriod } from "@/hooks/use-current-period";
import { buildSchedule, getTodayLocal } from "@/lib/periods";
import { TIFFIN_AFTER_PERIOD } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Season } from "@/lib/constants";
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
  season: Season;
}

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

export function HomeContent({
  classes,
  sections,
  teachers,
  subjects,
  routines,
  adjustments,
  season,
}: Props) {
  const [classId, setClassId] = useState<string>("");
  const classSections = sections.filter((s) => s.class_id === classId);
  const [sectionId, setSectionId] = useState<string>("");

  const { result, dayIndex, now } = useCurrentPeriod(season);

  const schedule = useMemo(() => buildSchedule(season, now), [season, now]);

  const currentCell = useMemo(() => {
    if (!sectionId || result.kind !== "period" || dayIndex === null) return undefined;
    const r = routines.find(
      (x) =>
        x.section_id === sectionId &&
        x.day === dayIndex &&
        x.period_number === result.periodNumber &&
        !x.is_tag
    );
    if (!r) return undefined;

    const today = getTodayLocal();
    const adj = adjustments.find(
      (a) =>
        a.adjust_date === today &&
        a.section_id === r.section_id &&
        a.period_number === result.periodNumber &&
        !a.is_tag
    );

    const teacherId = adj?.new_teacher_id ?? r.teacher_id;
    const subjectId = adj?.new_subject_id ?? r.subject_id;

    const t = teachers.find((x) => x.id === teacherId);
    const s = subjects.find((x) => x.id === subjectId);
    return {
      subject: s?.name,
      teacher: t?.short_name,
      room: r.room_id ? "Room" : undefined,
      isAdjusted: !!adj,
    };
  }, [sectionId, routines, teachers, subjects, result, dayIndex, adjustments]);

  const isWeekend = dayIndex === null;
  const activePeriod = result.kind === "period" ? result.periodNumber : null;
  const isTiffinRunning = result.kind === "tiffin";

  return (
    <div className="space-y-8">
      <FadeIn>
      <section className="text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#1e3a5f]/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#1e3a5f]">
          <School className="h-3.5 w-3.5" />
          Cantonment Public School &amp; College
        </div>
        <h1 className="text-3xl font-bold text-[#1e3a5f] md:text-4xl">
          Weekly Class Routine
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-slate-500">
          The class-wise schedule for Sunday through Thursday, with a live panel
          that shows what is running right now.
        </p>
      </section>
      </FadeIn>

      {/* Live card + quick picker */}
      <FadeIn stagger={0.08}>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CurrentPeriodCard season={season} currentCell={currentCell} />
        </div>
        <Card className="bg-white/70">
          <CardHeader>
            <CardTitle className="text-base text-[#1e3a5f]">
              View a class routine
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={classId} onValueChange={(v) => { setClassId(v ?? ""); setSectionId(""); }} items={classes.map(c => ({ value: c.id, label: c.name }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sectionId} onValueChange={(v) => setSectionId(v ?? "")} disabled={!classId} items={classSections.map(s => ({ value: s.id, label: `Section ${s.name}` }))}>
              <SelectTrigger>
                <SelectValue placeholder={classId ? "Select section" : "Choose a class first"} />
              </SelectTrigger>
              <SelectContent>
                {classSections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>Section {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sectionId && (
              <Link
                href={`/routine?section=${sectionId}`}
                className="flex w-full items-center justify-center rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#162c44]"
              >
                Open full routine →
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
      </FadeIn>

      {/* Today's schedule + school hours */}
      <FadeIn stagger={0.14}>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="bg-white/70 lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base text-[#1e3a5f]">
              <Clock className="h-4 w-4 text-[#0d9488]" />
              Today&apos;s Schedule
            </CardTitle>
            {!isWeekend && (
              <span className="text-xs text-slate-400">
                {season === "summer" ? "Summer" : "Winter"} season
              </span>
            )}
          </CardHeader>
          <CardContent>
            {isWeekend ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Moon className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">
                  Rest day — no classes scheduled for today.
                </p>
                <p className="text-xs text-slate-400">
                  The routine resumes on Sunday.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {schedule.map((b) => {
                  const isTiffin = b.label === "Tiffin";
                  const isActive =
                    isTiffin
                      ? isTiffinRunning
                      : activePeriod === b.periodNumber;
                  return (
                    <div
                      key={b.label}
                      className={cn(
                        "rounded-xl border p-3 text-center transition-all",
                        isActive
                          ? "border-[#0d9488]/40 bg-teal-50 ring-2 ring-[#0d9488]/20"
                          : "border-slate-100 bg-white"
                      )}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        {isTiffin && <Coffee className="h-3.5 w-3.5 text-amber-500" />}
                        <p
                          className={cn(
                            "text-xs font-semibold",
                            isTiffin
                              ? "text-amber-700"
                              : "text-[#1e3a5f]"
                          )}
                        >
                          {isTiffin ? "Tiffin" : `Period ${b.periodNumber}`}
                        </p>
                        {isActive && (
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] tabular-nums text-slate-500">
                        {b.startLabel} – {b.endLabel}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-[#1e3a5f]">
              School Hours
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {season === "summer" ? (
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                  <Sun className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    Summer schedule
                  </p>
                  <p className="text-xs text-slate-500">
                    Starts {schedule[0]?.startLabel} · Ends{" "}
                    {schedule[schedule.length - 1]?.endLabel}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-500/10">
                  <Moon className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    Winter schedule
                  </p>
                  <p className="text-xs text-slate-500">
                    Starts {schedule[0]?.startLabel} · Ends{" "}
                    {schedule[schedule.length - 1]?.endLabel}
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0d9488]/10">
                <Coffee className="h-5 w-5 text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  Tiffin break
                </p>
                <p className="text-xs text-slate-500">
                  After period {TIFFIN_AFTER_PERIOD}, 20 minutes
                </p>
              </div>
            </div>
            <p className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
              School runs from Sunday to Thursday. Friday and Saturday are
              weekly holidays.
            </p>
          </CardContent>
        </Card>
      </div>
      </FadeIn>

      {/* Class quick links */}
      <FadeIn stagger={0.2}>
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-[#1e3a5f]">Classes</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {classes.map((c) => {
            const secCount = sections.filter((s) => s.class_id === c.id).length;
            return (
              <Link key={c.id} href={`/routine?class=${c.id}`} className="group">
                <Card className="h-full bg-white/70 transition-all hover:border-[#1e3a5f]/30 hover:shadow-md">
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-lg font-bold text-[#1e3a5f]">Class {c.name}</p>
                      <p className="text-xs text-slate-500">
                        {secCount} section{secCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#0d9488]" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
      </FadeIn>

      {/* Teachers grid */}
      <FadeIn stagger={0.26}>
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-[#1e3a5f]">Our Teachers</h2>
          <Link href="/teachers" className="text-sm font-medium text-[#0d9488] hover:underline">
            View directory →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {teachers.slice(0, 12).map((t) => {
            const primary = subjects.find((s) => s.id === t.primary_subject_id);
            return (
              <Link key={t.id} href={`/teacher?q=${t.teacher_code}`}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
                    <Avatar className="h-12 w-12 bg-[#1e3a5f]">
                      <AvatarFallback className="bg-[#1e3a5f] text-sm text-white">
                        {initials(t.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="line-clamp-1 text-sm font-semibold text-[#1e3a5f]">
                        {t.short_name}
                      </p>
                      <p className="text-xs text-slate-500">{t.teacher_code}</p>
                    </div>
                    <Badge
                      variant="secondary"
                      className="bg-[#1e3a5f]/5 text-[#1e3a5f]"
                    >
                      {primary?.name ?? "—"}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
      </FadeIn>
    </div>
  );
}
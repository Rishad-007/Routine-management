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
import { NowTeachingBoard } from "./now-teaching-board";
import { FadeIn } from "@/components/motion/fade-in";
import { useCurrentPeriod } from "@/hooks/use-current-period";
import { buildSchedule } from "@/lib/periods";
import { TIFFIN_AFTER_PERIOD } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Season } from "@/lib/constants";
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
  /** Routine rows for today only, every period. */
  todayRows: RoutineRow[];
  adjustments: AdjustmentRow[];
  season: Season;
  today: string;
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
  rooms,
  todayRows,
  adjustments,
  season,
  today,
}: Props) {
  const [classId, setClassId] = useState<string>("");
  const classSections = sections.filter((s) => s.class_id === classId);
  const [sectionId, setSectionId] = useState<string>("");

  const { result, dayIndex, now } = useCurrentPeriod(season);

  const schedule = useMemo(() => buildSchedule(season, now), [season, now]);

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
          The class-wise schedule for Sunday through Thursday, with a live board
          showing which teacher is teaching which class right now.
        </p>
      </section>
      </FadeIn>

      {/* Live board */}
      <FadeIn stagger={0.08}>
        <NowTeachingBoard
          classes={classes}
          sections={sections}
          teachers={teachers}
          subjects={subjects}
          rooms={rooms}
          todayRows={todayRows}
          adjustments={adjustments}
          season={season}
          today={today}
        />
      </FadeIn>

      {/* Today's schedule + school hours */}
      <FadeIn stagger={0.14}>
      <div className="grid gap-6 lg:grid-cols-3">
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
            {classId &&
              classes.find((c) => c.id === classId)?.is_suspended && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  This class is currently suspended
                  {classes.find((c) => c.id === classId)?.suspension_reason
                    ? ` — ${classes.find((c) => c.id === classId)?.suspension_reason}`
                    : ""}
                  .
                </p>
              )}
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
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="flex items-center gap-2 text-sm text-slate-600">
              {season === "summer" ? (
                <Sun className="h-4 w-4 text-amber-600" />
              ) : (
                <Moon className="h-4 w-4 text-slate-600" />
              )}
              <span>
                <span className="font-medium text-slate-700">
                  {schedule[0]?.startLabel}
                </span>
                {" – "}
                <span className="font-medium text-slate-700">
                  {schedule[schedule.length - 1]?.endLabel}
                </span>
                <span className="text-xs text-slate-500">
                  {" "}
                  · {season === "summer" ? "Summer" : "Winter"}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-2 text-sm text-slate-600">
              <Coffee className="h-4 w-4 text-teal-600" />
              Tiffin after P{TIFFIN_AFTER_PERIOD}
            </span>
            <span className="text-xs text-slate-500">
              Sunday – Thursday · Fri &amp; Sat are holidays
            </span>
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
                        {t.full_name}
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
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { Season } from "@/lib/constants";
import type {
  ClassRow,
  SectionRow,
  TeacherRow,
  SubjectRow,
  RoutineRow,
} from "@/lib/types";

interface Props {
  classes: ClassRow[];
  sections: SectionRow[];
  teachers: TeacherRow[];
  subjects: SubjectRow[];
  routines: RoutineRow[];
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
  season,
}: Props) {
  const [classId, setClassId] = useState<string>("");
  const classSections = sections.filter((s) => s.class_id === classId);
  const [sectionId, setSectionId] = useState<string>("");

  const { result, dayIndex } = useCurrentPeriod(season);

  const currentCell = useMemo(() => {
    if (!sectionId || result.kind !== "period" || dayIndex === null) return undefined;
    const r = routines.find(
      (x) =>
        x.section_id === sectionId &&
        x.day === dayIndex &&
        x.period_number === result.periodNumber
    );
    if (!r) return undefined;
    const t = teachers.find((x) => x.id === r.teacher_id);
    const s = subjects.find((x) => x.id === r.subject_id);
    return {
      subject: s?.name,
      teacher: t?.short_name,
      room: r.room_id ? "Room" : undefined,
    };
  }, [sectionId, routines, teachers, subjects, result, dayIndex]);

  return (
    <div className="space-y-8">
      <FadeIn>
      <section className="text-center">
        <h1 className="text-3xl font-bold text-[#1e3a5f] md:text-4xl">
          Weekly Class Routine
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-slate-500">
          View the class-wise schedule for Sunday to Thursday. The live panel
          shows what is running right now.
        </p>
      </section>
      </FadeIn>

      {/* Live card + quick picker */}
      <FadeIn stagger={0.08}>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CurrentPeriodCard season={season} currentCell={currentCell} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">View a class routine</CardTitle>
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

      {/* Teachers grid */}
      <FadeIn stagger={0.14}>
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-[#1e3a5f]">Our Teachers</h2>
          <Link href="/teachers" className="text-sm font-medium text-[#0d9488] hover:underline">
            View directory →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {teachers.slice(0, 10).map((t) => {
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
                      <p className="mt-0.5 text-xs text-slate-400">
                        {primary?.name ?? "—"}
                      </p>
                    </div>
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

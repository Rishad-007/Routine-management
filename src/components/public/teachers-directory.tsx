"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { TeacherRow, SubjectRow, TeacherSubjectRow } from "@/lib/types";

interface Props {
  teachers: TeacherRow[];
  subjects: SubjectRow[];
  teacherSubjects: TeacherSubjectRow[];
}

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

export function TeachersDirectory({
  teachers,
  subjects,
  teacherSubjects,
}: Props) {
  const [query, setQuery] = useState("");
  const subjectMap = Object.fromEntries(subjects.map((s) => [s.id, s]));
  const subjectsByTeacher = new Map<string, string[]>();
  for (const ts of teacherSubjects) {
    const arr = subjectsByTeacher.get(ts.teacher_id) ?? [];
    arr.push(ts.subject_id);
    subjectsByTeacher.set(ts.teacher_id, arr);
  }

  const filtered = teachers.filter(
    (t) =>
      t.full_name.toLowerCase().includes(query.toLowerCase()) ||
      t.short_name.toLowerCase().includes(query.toLowerCase()) ||
      t.teacher_code.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Teachers Directory</h1>
        <p className="text-sm text-slate-500">
          {teachers.length} teachers · Click a card for the full routine
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Search by name, short name or ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {filtered.map((t) => {
          const primary = t.primary_subject_id
            ? subjectMap[t.primary_subject_id]
            : undefined;
          const taught = (subjectsByTeacher.get(t.id) ?? [])
            .map((id) => subjectMap[id]?.short_name)
            .filter(Boolean);
          return (
            <Link key={t.id} href={`/teacher?q=${t.teacher_code}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="flex items-center gap-3 p-4">
                  <Avatar className="h-12 w-12 bg-[#1e3a5f]">
                    <AvatarFallback className="bg-[#1e3a5f] text-white">
                      {initials(t.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate font-semibold text-[#1e3a5f]">{t.full_name}</p>
                      {t.is_open_teacher && (
                        <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700">
                          Open
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{t.teacher_code}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">
                      {primary
                        ? primary.name
                        : taught.join(", ") || "No subject"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-400">No teachers found.</p>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { FadeIn } from "@/components/motion/fade-in";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoutineGrid, type RoutineMatrix } from "@/components/routine/routine-grid";
import type { Season } from "@/lib/constants";
import type { TeacherRow } from "@/lib/types";

interface Props {
  teachers: TeacherRow[];
  matrices: Record<string, RoutineMatrix>;
  teacherMeta: Record<string, { name: string; code: string }>;
  season: Season;
  initialQuery?: string;
}

export function TeacherRoutineViewer({
  teachers,
  matrices,
  teacherMeta,
  season,
  initialQuery = "",
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState<string>(() => {
    const matched = teachers.find(
      (t) => t.teacher_code.toLowerCase() === initialQuery.toLowerCase()
    );
    return matched?.id ?? "";
  });

  const filtered = teachers.filter(
    (t) =>
      t.full_name.toLowerCase().includes(query.toLowerCase()) ||
      t.short_name.toLowerCase().includes(query.toLowerCase()) ||
      t.teacher_code.toLowerCase().includes(query.toLowerCase())
  );

  const matrix = selected ? matrices[selected] : undefined;
  const meta = selected ? teacherMeta[selected] : undefined;

  return (
    <FadeIn>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Teacher Routine</h1>
        <p className="text-sm text-slate-500">
          Search by teacher ID, short name or full name.
        </p>
      </div>

      <Card className="bg-white/70">
        <CardContent className="space-y-3 pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search… eg. T001 or MRS"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected("");
              }}
            />
          </div>
          {query && filtered.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {filtered.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className="rounded-lg border bg-white px-3 py-1.5 text-sm transition-colors hover:bg-slate-50"
                >
                  <span className="font-medium text-[#1e3a5f]">{t.short_name}</span>
                  <span className="ml-1 text-xs text-slate-400">({t.teacher_code})</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {matrix && meta ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-[#1e3a5f]">
              {meta.name}
              <span className="ml-2 text-sm font-normal text-slate-400">{meta.code}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <RoutineGrid matrix={matrix} season={season} variant="compact" />
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-sm text-slate-400">
            {query ? "No matching teacher." : "Search for a teacher to view their routine."}
          </CardContent>
        </Card>
      )}
    </div>
    </FadeIn>
  );
}

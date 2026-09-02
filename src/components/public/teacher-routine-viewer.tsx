"use client";

import { useMemo, useState } from "react";
import { Search, Download, Loader2, CalendarDays, User } from "lucide-react";
import { FadeIn } from "@/components/motion/fade-in";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  const [pdfLoading, setPdfLoading] = useState(false);

  const filtered = useMemo(
    () =>
      teachers.filter(
        (t) =>
          t.full_name.toLowerCase().includes(query.toLowerCase()) ||
          t.short_name.toLowerCase().includes(query.toLowerCase()) ||
          t.teacher_code.toLowerCase().includes(query.toLowerCase())
      ),
    [teachers, query]
  );

  const matrix = selected ? matrices[selected] : undefined;
  const meta = selected ? teacherMeta[selected] : undefined;
  const selectedTeacher = selected
    ? teachers.find((t) => t.id === selected)
    : undefined;

  const initials = (name: string) =>
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();

  const downloadPdf = () => {
    if (!selected) return;
    setPdfLoading(true);
    window.open(
      `/api/teacher-routine.pdf?teacher=${selected}`,
      "_blank",
      "noopener"
    );
    setTimeout(() => setPdfLoading(false), 2500);
  };

  return (
    <FadeIn>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1e3a5f]">Teacher Routine</h1>
            <p className="text-sm text-slate-500">
              Search by teacher ID, short name or full name.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadPdf}
            disabled={!selected || pdfLoading}
            className="hidden border-[#0d9488] text-[#0d9488] hover:bg-[#0d9488] hover:text-white md:flex"
          >
            {pdfLoading ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-4 w-4" />
            )}
            {pdfLoading ? "Preparing PDF…" : "Download Routine PDF"}
          </Button>
        </div>

        {/* Search card */}
        <Card className="bg-white/70 shadow-sm">
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
                {filtered.map((t) => {
                  const isSel = t.id === selected;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelected(t.id)}
                      className={
                        "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors " +
                        (isSel
                          ? "border-[#0d9488] bg-[#0d9488] text-white"
                          : "border-slate-200 bg-white hover:border-[#0d9488]/40 hover:bg-teal-50")
                      }
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1e3a5f]/10 text-xs font-bold text-[#1e3a5f]">
                        {initials(t.full_name)}
                      </span>
                      <span className={isSel ? "font-medium text-white" : "font-medium text-[#1e3a5f]"}>
                        {t.short_name}
                      </span>
                      <span className={isSel ? "text-xs text-teal-100" : "text-xs text-slate-400"}>
                        ({t.teacher_code})
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {query && filtered.length === 0 && (
              <p className="text-sm text-slate-400">No matching teacher.</p>
            )}
          </CardContent>
        </Card>

        {/* Selected teacher routine */}
        {matrix && meta ? (
          <Card className="shadow-sm">
            <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12 bg-[#1e3a5f]">
                  <AvatarFallback className="bg-[#1e3a5f] text-white">
                    {initials(meta.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg text-[#1e3a5f]">
                    {meta.name}
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
                      {meta.code}
                    </span>
                  </CardTitle>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Weekly routine ·{" "}
                    {selectedTeacher?.primary_subject_id ? "Staff" : "Open teacher"}
                    {selectedTeacher?.is_open_teacher ? " (open)" : ""}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadPdf}
                disabled={pdfLoading}
                className="border-[#0d9488] text-[#0d9488] hover:bg-[#0d9488] hover:text-white"
              >
                {pdfLoading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-4 w-4" />
                )}
                {pdfLoading ? "Preparing PDF…" : "PDF"}
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              <RoutineGrid matrix={matrix} season={season} variant="compact" />
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed shadow-sm">
            <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-slate-400">
              <User className="h-8 w-8 text-slate-300" />
              {query
                ? "No matching teacher."
                : "Search for a teacher to view their routine."}
            </CardContent>
          </Card>
        )}
      </div>
    </FadeIn>
  );
}
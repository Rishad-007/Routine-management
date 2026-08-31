"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoutineGrid, type RoutineMatrix } from "@/components/routine/routine-grid";
import type { Season } from "@/lib/constants";
import type { ClassRow, SectionRow } from "@/lib/types";

interface Props {
  classes: ClassRow[];
  sections: SectionRow[];
  initialSectionId?: string;
  matrices: Record<string, RoutineMatrix>;
  season: Season;
}

export function RoutineViewer({
  classes,
  sections,
  initialSectionId,
  matrices,
  season,
}: Props) {
  const [classId, setClassId] = useState<string>(
    (initialSectionId &&
      sections.find((s) => s.id === initialSectionId)?.class_id) ||
      ""
  );
  const [sectionId, setSectionId] = useState<string>(initialSectionId ?? "");
  const classSections = sections.filter((s) => s.class_id === classId);
  const matrix = sectionId ? matrices[sectionId] : undefined;

  return (
    <div className="space-y-6">
      <Card className="bg-white/70">
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Class</p>
            <Select
              value={classId}
              onValueChange={(v) => {
                setClassId(v ?? "");
                setSectionId("");
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Section</p>
            <Select
              value={sectionId}
              onValueChange={(v) => setSectionId(v ?? "")}
              disabled={!classId}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder={classId ? "Select section" : "Choose class first"} />
              </SelectTrigger>
              <SelectContent>
                {classSections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>Section {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {matrix ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-lg text-[#1e3a5f]">
              {classes.find((c) => c.id === classId)?.name} — Section{" "}
              {sections.find((s) => s.id === sectionId)?.name}
            </CardTitle>
            <a
              href={`/api/routine.pdf?section=${sectionId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-[#0d9488] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0b7a70]"
            >
              <Download className="h-4 w-4" /> PDF
            </a>
          </CardHeader>
          <CardContent className="pt-0">
            <RoutineGrid matrix={matrix} season={season} />
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-sm text-slate-400">
            Select a class and section to view its routine.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

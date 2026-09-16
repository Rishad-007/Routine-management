"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud, CheckCircle2, Loader2, AlertTriangle, FileJson, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface FileSummary {
  teachers: number;
  classes: number;
  sections: number;
  rooms: number;
  subjects: number;
  slots: number;
  tagPairs: number;
  classTeachers: number;
  assignments: number;
}

interface ImportReport {
  imported_classes?: number;
  imported_sections?: number;
  imported_rooms?: number;
  imported_subjects?: number;
  imported_teachers?: number;
  routine_slots?: number;
  primary_assignments?: number;
  tag_assignments?: number;
  notice?: string;
  notes?: string[] | null;
  source_file?: string | null;
  [key: string]: unknown;
}

function isRoutinePayload(p: unknown): p is {
  meta: { school_week?: string[]; classes?: string[]; rooms?: string[]; subjects?: string[]; data_quality_notes?: string[] };
  teachers: unknown[];
} {
  if (!p || typeof p !== "object") return false;
  const obj = p as Record<string, unknown>;
  if (typeof obj.meta !== "object" || obj.meta === null) return false;
  return Array.isArray(obj.teachers);
}

function summarizePayload(payload: {
  meta: { school_week?: string[]; classes?: string[]; rooms?: string[]; subjects?: string[] };
  teachers: unknown[];
}): FileSummary | null {
  const dayIdx = Object.fromEntries((payload.meta.school_week ?? []).map((d, i) => [d, i]));
  const sections = new Set<string>();
  const slotKeys = new Set<string>();
  let recordCount = 0;
  let tagPairs = 0;
  for (const teacher of payload.teachers ?? []) {
    const t = teacher as { class_teacher_of?: unknown; schedule?: Record<string, Array<{ class?: string; section?: string; period?: number }>> } | null;
    if (!t) continue;
    for (const [day, slots] of Object.entries(t.schedule ?? {})) {
      for (const s of slots ?? []) {
        if (!s.class || !s.section || !(s.period !== undefined)) continue;
        sections.add(`${s.class}|${s.section}`);
        recordCount += 1;
        const key = `${s.class}|${s.section}|${dayIdx[day] ?? day}|${s.period}`;
        if (slotKeys.has(key)) tagPairs += 1;
        else slotKeys.add(key);
      }
    }
  }
  return {
    teachers: (payload.teachers ?? []).length,
    classes: (payload.meta.classes ?? []).length,
    sections: sections.size,
    rooms: (payload.meta.rooms ?? []).length,
    subjects: (payload.meta.subjects ?? []).length,
    slots: slotKeys.size,
    tagPairs,
    classTeachers: (payload.teachers ?? []).filter((t) => !!((t as { class_teacher_of?: unknown })?.class_teacher_of)).length,
    assignments: recordCount,
  };
}

export function ImportTab() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<FileSummary | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  function handleFile(file: File) {
    setError(null);
    setReport(null);
    setConfirm(false);
    setSummary(null);
    setNotes([]);
    if (!file.name.toLowerCase().endsWith(".json")) {
      setError("Please choose a .json file (e.g. teacher_routines.json).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!isRoutinePayload(parsed)) {
          setError('Invalid file structure: expected an object with a "meta" object and a "teachers" array.');
          return;
        }
        setFileName(file.name);
        const s = summarizePayload(parsed);
        if (!s) {
          setError("Could not summarise the file contents.");
          return;
        }
        setSummary(s);
        setNotes(Array.isArray(parsed.meta.data_quality_notes) ? parsed.meta.data_quality_notes : []);
      } catch {
        setError("The file is not valid JSON.");
      }
    };
    reader.readAsText(file);
  }

  function runImport() {
    if (!summary || !confirm) return;
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    startTransition(async () => {
      try {
        const text = await file.text();
        if (text.length > 5 * 1024 * 1024) {
          setError("File is too large (max 5 MB).");
          return;
        }
        const res = await fetch("/api/admin/import-routine", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: text,
        });
        const data = (await res.json()) as { report?: ImportReport; error?: string };
        if (!res.ok || data.error) {
          setError(data.error ?? `Import failed (HTTP ${res.status}).`);
          return;
        }
        setReport(data.report ?? {});
        toast.success("Routine data imported successfully");
        router.refresh();
      } catch {
        setError("Network error while importing. Please try again.");
      }
    });
  }

  function drop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) {
      if (fileInput.current) fileInput.current.files = e.dataTransfer.files;
      handleFile(f);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Routine (JSON)</CardTitle>
        <CardDescription>
          Upload the offline routine export (e.g. <code>teacher_routines.json</code>). The file is authoritate: classes,
          sections, rooms, subjects, teachers and the full weekly routine are rebuilt from it. Admins and adjustment
          history are kept.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={drop}
          onClick={() => fileInput.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors",
            summary ? "border-teal-300 bg-teal-50/50" : "border-slate-300 hover:border-[#0d9488] hover:bg-slate-50",
          )}
        >
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {fileName ? (
            <>
              <FileJson className="h-8 w-8 text-[#0d9488]" />
              <p className="text-sm font-medium text-[#1e3a5f]">{fileName}</p>
              <p className="text-xs text-slate-500">Click or drop a different file to replace it</p>
            </>
          ) : (
            <>
              <UploadCloud className="h-8 w-8 text-slate-400" />
              <p className="text-sm font-medium text-[#1e3a5f]">Drop the JSON file here or click to browse</p>
              <p className="text-xs text-slate-500">teacher_routines.json · max 5 MB</p>
            </>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Import failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {summary && !report && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Teachers", summary.teachers],
                ["Classes", summary.classes],
                ["Sections", summary.sections],
                ["Rooms", summary.rooms],
                ["Subjects", summary.subjects],
                ["Routine slots", summary.slots],
                ["Tag pairs", summary.tagPairs],
                ["Class teachers", summary.classTeachers],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border bg-slate-50 px-3 py-2">
                  <p className="text-lg font-semibold text-[#1e3a5f]">{value}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>

            {notes.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Source file notes</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc space-y-1 pl-4">
                    {notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
              <p className="text-sm font-medium text-red-700">This is destructive.</p>
              <p className="text-xs text-red-600">
                Importing will delete any routine/master data that is not present in the file and rebuild everything
                from the JSON. Rows not in the file (e.g. sample classes, demo teachers) will be removed.
              </p>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirm}
                  onChange={(e) => setConfirm(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                I understand — JSON data wins and replaces existing data.
              </label>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={runImport} disabled={!confirm || pending} className="bg-[#0d9488] hover:bg-[#0b7a70]">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                {pending ? "Importing…" : "Import routine data"}
              </Button>
              <Button variant="ghost" onClick={() => { setSummary(null); setReport(null); setError(null); setConfirm(false); setFileName(null); }}>
                <X className="h-4 w-4" /> Clear
              </Button>
            </div>
          </>
        )}

        {report && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Import complete</AlertTitle>
            <AlertDescription>
              <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Classes", report.imported_classes],
                  ["Sections", report.imported_sections],
                  ["Rooms", report.imported_rooms],
                  ["Subjects", report.imported_subjects],
                  ["Teachers", report.imported_teachers],
                  ["Routine slots", report.routine_slots],
                  ["Primary", report.primary_assignments],
                  ["Tag", report.tag_assignments],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-white px-3 py-2">
                    <p className="text-lg font-semibold text-[#1e3a5f]">{value ?? "—"}</p>
                    <p className="text-xs text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
              {typeof report.notice === "string" && (
                <p className="mt-2 text-xs text-slate-500">{report.notice}</p>
              )}
              {Array.isArray(report.notes) && report.notes.length > 0 && (
                <p className="mt-2 text-xs text-slate-400">
                  Note: verify short names and full subject names in the Teachers and Subjects tabs — they are
                  auto-generated from the source file and editable.
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
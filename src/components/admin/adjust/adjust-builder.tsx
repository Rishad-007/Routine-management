"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Info, RotateCcw } from "lucide-react";
import {
  DAY_LABEL_LIST,
  PERIOD_ORDER,
  TIFFIN_AFTER_PERIOD,
} from "@/lib/constants";
import { getSchoolDayIndex } from "@/lib/periods";
import { saveDayAdjustments, type PeriodAdjustment } from "@/app/admin/adjust/actions";
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
}

function toDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function AdjustBuilder({
  classes,
  sections,
  teachers,
  subjects,
  routines,
  adjustments,
}: Props) {
  const router = useRouter();
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(() => toDateInput(new Date()));
  const [overrides, setOverrides] = useState<
    Record<number, string | null | undefined>
  >({});
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const teacherNames = useMemo(
    () => new Map(teachers.map((t) => [t.id, t.short_name])),
    [teachers]
  );
  const subjectNames = useMemo(
    () => new Map(subjects.map((s) => [s.id, s])),
    [subjects]
  );
  const classSections = sections.filter((s) => s.class_id === classId);

  const dayIndex = useMemo(() => getSchoolDayIndex(new Date(date + "T00:00:00")), [date]);
  const isNoSchool = dayIndex === null;

  // Effective teacher per period for the selected day.
  const dayCells = useMemo(() => {
    const cells: { period: number; subjectId: string | null; baseTeacherId: string | null }[] = [];
    if (!sectionId || dayIndex === null) return cells;
    for (const p of PERIOD_ORDER) {
      const r = routines.find(
        (x) => x.section_id === sectionId && x.day === dayIndex && x.period_number === p
      );
      cells.push({
        period: p,
        subjectId: r?.subject_id ?? null,
        baseTeacherId: r?.teacher_id ?? null,
      });
    }
    return cells;
  }, [sectionId, dayIndex, routines]);

  // Existing adjustments for this date+section.
  const existingAdjustments = useMemo(
    () =>
      adjustments.filter((a) => a.section_id === sectionId && a.adjust_date === date),
    [adjustments, sectionId, date]
  );

  const resetOverrides = () => {
    const map: Record<number, string | null> = {};
    for (const a of existingAdjustments) map[a.period_number] = a.new_teacher_id;
    setOverrides(map);
  };

  const handleSave = async () => {
    if (!sectionId || dayIndex === null) return;
    setSaving(true);
    const changes: PeriodAdjustment[] = Object.entries(overrides)
      .map(([period, newId]) => {
        const cell = dayCells.find((c) => c.period === Number(period));
        return {
          period: Number(period),
          originalTeacherId: cell?.baseTeacherId ?? null,
          newTeacherId: newId ?? null,
          reason: reasons[Number(period)]?.trim() || null,
        };
      })
      .filter((c) => c.newTeacherId);
    const res = await saveDayAdjustments(date, sectionId, changes);
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`Saved ${res.savedCount ?? 0} adjustment(s) for ${date}`);
    router.refresh();
  };

  return (
    <div className="space-y-5">
      {/* Selectors */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-white p-4 shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">Class</p>
          <Select value={classId} onValueChange={(v) => setClassId(v ?? "")}>
            <SelectTrigger className="w-44">
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
            <SelectTrigger className="w-44">
              <SelectValue placeholder={classId ? "Select section" : "Class first"} />
            </SelectTrigger>
            <SelectContent>
              {classSections.map((s) => (
                <SelectItem key={s.id} value={s.id}>Section {s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">Adjustment date</p>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
      </div>

      {!sectionId || isNoSchool ? (
        <div className="rounded-xl border border-dashed bg-white p-14 text-center text-sm text-slate-400">
          {!sectionId
            ? "Select a class and section."
            : "This is a weekend (Friday/Saturday) — no routine to adjust. Pick a Sunday–Thursday date."}
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Adjusting <strong>{DAY_LABEL_LIST[dayIndex!]}</strong> routine for{" "}
              <strong>{date}</strong> only. Base routine stays unchanged for other days.
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-20 border border-slate-200 bg-[#1e3a5f] px-2 py-2 text-left text-xs font-semibold uppercase text-white">
                    Period
                  </th>
                  <th className="border border-slate-200 bg-[#f1f5f9] px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                    Subject (base)
                  </th>
                  <th className="border border-slate-200 bg-[#f1f5f9] px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                    Base teacher
                  </th>
                  <th className="border border-slate-200 bg-[#f1f5f9] px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                    Substitute teacher
                  </th>
                  <th className="w-56 border border-slate-200 bg-[#f1f5f9] px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                    Note (optional)
                  </th>
                </tr>
              </thead>
              <tbody>
                {dayCells.map((cell) => {
                  const effective =
                    overrides[cell.period] ?? cell.baseTeacherId;
                  const subj = cell.subjectId ? subjectNames.get(cell.subjectId) : undefined;
                  const overriding =
                    overrides[cell.period] !== undefined &&
                    overrides[cell.period] !== cell.baseTeacherId;
                  return (
                    <tr key={cell.period} className={overriding ? "bg-amber-50" : ""}>
                      <td className="border border-slate-200 px-2 py-2 text-center text-xs font-semibold text-slate-600">
                        P{cell.period}
                        {cell.period === TIFFIN_AFTER_PERIOD && (
                          <span className="block text-[10px] font-normal text-amber-500">Tiffin↓</span>
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-700">
                        {subj?.name ?? "—"}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-700">
                        {cell.baseTeacherId
                          ? teacherNames.get(cell.baseTeacherId) ?? "—"
                          : "—"}
                      </td>
                      <td className="border border-slate-200 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Select
                            value={effective ?? "none"}
                            onValueChange={(v) => {
                              const id = v === "none" ? null : (v ?? null);
                              setOverrides((prev) => ({
                                ...prev,
                                [cell.period]:
                                  id === cell.baseTeacherId
                                    ? undefined
                                    : id ?? null,
                              }));
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="No change" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— No change —</SelectItem>
                              {teachers.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.short_name} ({t.teacher_code})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {cell.baseTeacherId &&
                            overrides[cell.period] &&
                            overrides[cell.period] !== cell.baseTeacherId && (
                              <button
                                onClick={() =>
                                  setOverrides((prev) => ({
                                    ...prev,
                                    [cell.period]: undefined,
                                  }))
                                }
                                className="text-slate-400 hover:text-slate-600"
                                title="Reset to original"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            )}
                        </div>
                      </td>
                      <td className="border border-slate-200 px-3 py-2">
                        <Input
                          placeholder="e.g. sick leave"
                          value={reasons[cell.period] ?? ""}
                          onChange={(e) =>
                            setReasons((prev) => ({
                              ...prev,
                              [cell.period]: e.target.value,
                            }))
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving ? "Saving…" : "Save adjustments for " + date}
            </Button>
            <Button variant="outline" onClick={resetOverrides}>
              Reset
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

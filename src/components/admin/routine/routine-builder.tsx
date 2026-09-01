"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  Plus,
  Save,
  GripVertical,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DAY_LABEL_LIST,
  PERIOD_ORDER,
  TIFFIN_AFTER_PERIOD,
} from "@/lib/constants";
import { saveSectionRoutine, type MatrixEdit } from "@/app/admin/routine/actions";
import type {
  ClassRow,
  SectionRow,
  TeacherRow,
  SubjectRow,
  RoomRow,
  TeacherSubjectRow,
  RoutineRow,
} from "@/lib/types";

interface Props {
  classes: ClassRow[];
  sections: SectionRow[];
  teachers: TeacherRow[];
  subjects: SubjectRow[];
  rooms: RoomRow[];
  teacherSubjects: TeacherSubjectRow[];
  routines: RoutineRow[];
}

interface Cell {
  subjectId: string | null;
  teacherId: string | null;
  roomId: string | null;
  isAdjusted: boolean;
  isTag: boolean;
  subjectId2: string | null;
  teacherId2: string | null;
  roomId2: string | null;
}

type Matrix = Record<number, Record<number, Cell | undefined>>;

const emptyCell = (): Cell => ({
  subjectId: null,
  teacherId: null,
  roomId: null,
  isAdjusted: false,
  isTag: false,
  subjectId2: null,
  teacherId2: null,
  roomId2: null,
});

function SortableCell({
  id,
  cell,
  selected,
  hasContent,
  className,
  children,
  onSelect,
}: {
  id: string;
  cell?: Cell;
  selected: boolean;
  hasContent: boolean;
  className?: string;
  children: React.ReactNode;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: selected });
  return (
    <td
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      className={cn(
        "border border-slate-200 px-1 py-1 align-middle text-center",
        className,
        isDragging && "opacity-40",
        selected ? "bg-[#0d9488]/10 ring-2 ring-inset ring-[#0d9488]" : "bg-white",
        cell?.isAdjusted && "bg-amber-50"
      )}
    >
      <div className="flex min-h-[52px] flex-col items-center justify-center gap-0.5">
        {children}
        {hasContent && (
          <button
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 text-slate-300 hover:text-slate-500"
            title="Drag to move"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </td>
  );
}

export function RoutineBuilder({
  classes,
  sections,
  teachers,
  subjects,
  rooms,
  teacherSubjects,
  routines,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const teacherNames = useMemo(
    () => new Map(teachers.map((t) => [t.id, t.short_name])),
    [teachers]
  );
  const subjectNames = useMemo(
    () => new Map(subjects.map((s) => [s.id, s])),
    [subjects]
  );
  const roomNames = useMemo(
    () => new Map(rooms.map((r) => [r.id, r.name])),
    [rooms]
  );
  const subjectsByTeacher = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const ts of teacherSubjects) {
      if (!m.has(ts.teacher_id)) m.set(ts.teacher_id, new Set());
      m.get(ts.teacher_id)!.add(ts.subject_id);
    }
    return m;
  }, [teacherSubjects]);

  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [matrix, setMatrix] = useState<Matrix>({});
  const [selected, setSelected] = useState<{ day: number; period: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const classSections = sections.filter((s) => s.class_id === classId);

  // Load matrix when section changes.
  const loadSection = (id: string) => {
    setSectionId(id);
    const m: Matrix = {};
    for (const r of routines) {
      if (r.section_id !== id) continue;
      if (!m[r.day]) m[r.day] = {};

      if (r.is_tag) {
        const primary = m[r.day][r.period_number];
        if (primary) {
          primary.subjectId2 = r.subject_id;
          primary.teacherId2 = r.teacher_id;
          primary.roomId2 = r.room_id;
        } else {
          m[r.day][r.period_number] = {
            ...emptyCell(),
            subjectId2: r.subject_id,
            teacherId2: r.teacher_id,
            roomId2: r.room_id,
          };
        }
      } else {
        const existing = m[r.day][r.period_number];
        m[r.day][r.period_number] = {
          subjectId: r.subject_id,
          teacherId: r.teacher_id,
          roomId: r.room_id,
          isAdjusted: r.is_adjusted,
          isTag: existing?.teacherId2 !== null,
          subjectId2: existing?.subjectId2 ?? null,
          teacherId2: existing?.teacherId2 ?? null,
          roomId2: existing?.roomId2 ?? null,
        };
      }
    }
    setMatrix(m);
    setSelected(null);
    setDirty(false);
  };

  const selectedCell: Cell | undefined = selected
    ? matrix[selected.day]?.[selected.period]
    : undefined;

  const teachersForSubject = (subjectId: string | null) => {
    if (!subjectId) return teachers;
    return teachers.filter(
      (t) =>
        t.is_open_teacher ||
        t.primary_subject_id === subjectId ||
        subjectsByTeacher.get(t.id)?.has(subjectId)
    );
  };

  const handleSelectClass = (v: string | null) => {
    setClassId(v ?? "");
    setSectionId("");
    setMatrix({});
    setSelected(null);
    setDirty(false);
  };

  const updateCell = (day: number, period: number, patch: Partial<Cell>) => {
    setMatrix((prev) => {
      const next = structuredClone(prev);
      if (!next[day]) next[day] = {};
      next[day][period] = { ...(next[day][period] ?? emptyCell()), ...patch };
      return next;
    });
    setDirty(true);
  };

  const clearCell = (day: number, period: number) => {
    setMatrix((prev) => {
      const next = structuredClone(prev);
      if (next[day]) delete next[day][period];
      return next;
    });
    setSelected(null);
    setDirty(true);
  };

  // Drag & drop within a day: swap assignments between periods.
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const day = Number(String(active.id).split("-")[0]);
    const periods = PERIOD_ORDER.map((p) => `${day}-${p}`);
    const oldIndex = periods.indexOf(String(active.id));
    const newIndex = periods.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setMatrix((prev) => {
      const next = structuredClone(prev);
      const dayMap = next[day] ?? {};
      const assignments = periods.map((id) => dayMap[Number(id.split("-")[1])]);
      const reordered = arrayMove(assignments, oldIndex, newIndex);
      reordered.forEach((cell, idx) => {
        if (cell) dayMap[PERIOD_ORDER[idx]] = cell;
      });
      // clear any stale slots not covered by PERIOD_ORDER
      for (const p of Object.keys(dayMap)) {
        if (!PERIOD_ORDER.includes(Number(p))) delete dayMap[Number(p)];
      }
      next[day] = dayMap;
      return next;
    });
    setDirty(true);
  };

  const buildEdits = (): MatrixEdit[] => {
    const edits: MatrixEdit[] = [];
    for (const day of Object.keys(matrix)) {
      for (const period of Object.keys(matrix[Number(day)] ?? {})) {
        const c = matrix[Number(day)][Number(period)];
        if (!c) continue;
        // Primary session
        if (c.subjectId || c.teacherId || c.roomId) {
          edits.push({
            day: Number(day),
            period: Number(period),
            subjectId: c.subjectId,
            teacherId: c.teacherId,
            roomId: c.roomId,
            isTag: false,
          });
        }
        // Tag session (second row)
        if (c.isTag && (c.subjectId2 || c.teacherId2 || c.roomId2)) {
          edits.push({
            day: Number(day),
            period: Number(period),
            subjectId: c.subjectId2,
            teacherId: c.teacherId2,
            roomId: c.roomId2,
            isTag: true,
          });
        }
      }
    }
    return edits;
  };

  const handleSave = async (force = false) => {
    if (!sectionId) return;
    setSaving(true);
    const res = await saveSectionRoutine(sectionId, buildEdits(), force);
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.warnings && res.warnings.length > 0 && !force) {
      const level = res.warnings.some((w) => w.level === "red") ? "red" : "yellow";
      toast.warning(
        `${res.warnings.length} conflict(s) (${level}). Review before saving.`,
        {
          action: {
            label: "Save anyway",
            onClick: () => handleSave(true),
          },
          duration: 12000,
        }
      );
      return;
    }
    toast.success(`Saved ${res.savedCount ?? 0} assignment(s)`);
    setDirty(false);
    queryClient.invalidateQueries();
    router.refresh();
  };

  return (
    <div className="space-y-5">
      {/* Selectors */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-white p-4 shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">Class</p>
          <Select value={classId} onValueChange={handleSelectClass} items={classes.map(c => ({ value: c.id, label: c.name }))}>
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
            onValueChange={(v) => loadSection(v ?? "")}
            disabled={!classId}
            items={classSections.map(s => ({ value: s.id, label: `Section ${s.name}` }))}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder={classId ? "Select section" : "Class first"} />
            </SelectTrigger>
            <SelectContent>
              {classSections.map((s) => (
                <SelectItem key={s.id} value={s.id} label={`Section ${s.name}`}>Section {s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {sectionId && (
          <div className="ml-auto flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-amber-600">Unsaved changes</span>
            )}
            <Button onClick={() => handleSave()} disabled={saving || !dirty}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving ? "Saving…" : "Save routine"}
            </Button>
          </div>
        )}
      </div>

      {!sectionId ? (
        <div className="rounded-xl border border-dashed bg-white p-16 text-center text-sm text-slate-400">
          Select a class and section to start editing its weekly routine.
        </div>
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row">
          {/* Grid */}
          <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border bg-white shadow-sm">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-28 border border-slate-200 bg-[#1e3a5f] px-2 py-2 text-left text-xs font-semibold uppercase text-white">
                    Day / Drag
                  </th>
                  {PERIOD_ORDER.map((p) => (
                    <th
                      key={p}
                      className="border border-slate-200 bg-[#f1f5f9] px-2 py-2 text-center text-xs font-semibold uppercase text-slate-600"
                    >
                      P{p}
                      {p === TIFFIN_AFTER_PERIOD && (
                        <span className="block text-[10px] font-normal text-amber-500">
                          ↓ Tiffin
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAY_LABEL_LIST.map((day, di) => (
                  <SortableContext
                    key={day}
                    items={PERIOD_ORDER.map((p) => `${di}-${p}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    <tr>
                      <td className="border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-600">
                        {day}
                      </td>
                      {PERIOD_ORDER.map((p) => {
                        const cell = matrix[di]?.[p];
                        const isSel =
                          selected?.day === di && selected?.period === p;
                        const subj = cell?.subjectId ? subjectNames.get(cell.subjectId) : undefined;
                        const subj2 = cell?.subjectId2 ? subjectNames.get(cell.subjectId2) : undefined;
                        const hasContent = !!cell?.subjectId || !!cell?.teacherId;
                        return (
                          <SortableCell
                            key={`${di}-${p}`}
                            id={`${di}-${p}`}
                            cell={cell}
                            selected={!!isSel}
                            hasContent={hasContent}
                            onSelect={() => setSelected({ day: di, period: p })}
                          >
                            {hasContent ? (
                              <div className="flex flex-col items-center gap-0.5">
                                {/* Primary session */}
                                <span className="font-medium text-[#1e3a5f]">
                                  {subj?.name ?? "—"}
                                </span>
                                {cell?.teacherId && (
                                  <span className="text-[11px] text-slate-500">
                                    {teacherNames.get(cell.teacherId) ?? "—"}
                                  </span>
                                )}
                                {cell?.roomId && (
                                  <span className="text-[10px] text-slate-400">
                                    {roomNames.get(cell.roomId)}
                                  </span>
                                )}
                                {/* Tag session */}
                                {cell?.isTag && (
                                  <>
                                    <div className="my-0.5 w-full border-t border-dashed border-slate-300" />
                                    <span className="font-medium text-teal-700">
                                      {subj2?.name ?? "—"}
                                    </span>
                                    {cell?.teacherId2 && (
                                      <span className="text-[11px] text-teal-600">
                                        {teacherNames.get(cell.teacherId2) ?? "—"}
                                      </span>
                                    )}
                                    {cell?.roomId2 && (
                                      <span className="text-[10px] text-teal-500">
                                        {roomNames.get(cell.roomId2)}
                                      </span>
                                    )}
                                    <Badge
                                      variant="secondary"
                                      className="mt-0.5 bg-teal-100 text-[9px] text-teal-700"
                                    >
                                      Tag
                                    </Badge>
                                  </>
                                )}
                              </div>
                            ) : (
                              <span className="flex items-center justify-center text-slate-300">
                                <Plus className="h-4 w-4" />
                              </span>
                            )}
                          </SortableCell>
                        );
                      })}
                    </tr>
                  </SortableContext>
                ))}
              </tbody>
            </table>
            </DndContext>
          </div>

          {/* Cell editor sidebar */}
          <div className="w-full rounded-xl border bg-white p-4 shadow-sm lg:w-80">
            {selected && (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-[#1e3a5f]">
                    {DAY_LABEL_LIST[selected.day]} · Period {selected.period}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => clearCell(selected.day, selected.period)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Clear
                  </Button>
                </div>

                <div className="space-y-3">
                  {/* Tag toggle */}
                  <div className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-700">Tag (2 teachers)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateCell(selected.day, selected.period, {
                          isTag: !selectedCell?.isTag,
                          subjectId2: selectedCell?.isTag ? null : selectedCell?.subjectId2,
                          teacherId2: selectedCell?.isTag ? null : selectedCell?.teacherId2,
                          roomId2: selectedCell?.isTag ? null : selectedCell?.roomId2,
                        })
                      }
                      className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                        selectedCell?.isTag ? "bg-[#0d9488]" : "bg-slate-300"
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform",
                          selectedCell?.isTag ? "translate-x-4" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>

                  {/* Primary session */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-500">Subject</p>
                    <Select
                      value={selectedCell?.subjectId ?? "none"}
                      onValueChange={(v) =>
                        updateCell(selected.day, selected.period, {
                          subjectId: v === "none" ? null : (v ?? null),
                        })
                      }
                      items={[{ value: "none", label: "— None —" }, ...subjects.map(s => ({ value: s.id, label: s.name }))]}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select subject" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        {subjects.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-500">Teacher</p>
                    <Select
                      value={selectedCell?.teacherId ?? "none"}
                      onValueChange={(v) =>
                        updateCell(selected.day, selected.period, {
                          teacherId: v === "none" ? null : (v ?? null),
                        })
                      }
                      items={[{ value: "none", label: "— None —" }, ...teachersForSubject(selectedCell?.subjectId ?? null).map(t => ({ value: t.id, label: t.is_open_teacher ? `${t.short_name} (open)` : t.short_name }))]}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Assign teacher" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        {teachersForSubject(selectedCell?.subjectId ?? null).map((t) => (
                          <SelectItem
                            key={t.id}
                            value={t.id}
                            label={t.is_open_teacher ? `${t.short_name} (open)` : t.short_name}
                          >
                            {t.short_name}
                            {t.is_open_teacher ? " (open)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-500">Room</p>
                    <Select
                      value={selectedCell?.roomId ?? "none"}
                      onValueChange={(v) =>
                        updateCell(selected.day, selected.period, {
                          roomId: v === "none" ? null : (v ?? null),
                        })
                      }
                      items={[{ value: "none", label: "— None —" }, ...rooms.map(r => ({ value: r.id, label: r.name }))]}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Assign room" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        {rooms.map((r) => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Tag session fields */}
                  {selectedCell?.isTag && (
                    <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50/50 p-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-teal-700">
                        <Users className="h-3.5 w-3.5" />
                        Tag Session
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium text-teal-600">Subject</p>
                        <Select
                          value={selectedCell?.subjectId2 ?? "none"}
                          onValueChange={(v) =>
                            updateCell(selected.day, selected.period, {
                              subjectId2: v === "none" ? null : (v ?? null),
                            })
                          }
                          items={[{ value: "none", label: "— None —" }, ...subjects.map(s => ({ value: s.id, label: s.name }))]}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select subject" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— None —</SelectItem>
                            {subjects.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium text-teal-600">Teacher</p>
                        <Select
                          value={selectedCell?.teacherId2 ?? "none"}
                          onValueChange={(v) =>
                            updateCell(selected.day, selected.period, {
                              teacherId2: v === "none" ? null : (v ?? null),
                            })
                          }
                          items={[{ value: "none", label: "— None —" }, ...teachersForSubject(selectedCell?.subjectId2 ?? null).map(t => ({ value: t.id, label: t.short_name }))]}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Assign teacher" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— None —</SelectItem>
                            {teachersForSubject(selectedCell?.subjectId2 ?? null).map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.short_name}
                                {t.is_open_teacher ? " (open)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium text-teal-600">Room</p>
                        <Select
                          value={selectedCell?.roomId2 ?? "none"}
                          onValueChange={(v) =>
                            updateCell(selected.day, selected.period, {
                              roomId2: v === "none" ? null : (v ?? null),
                            })
                          }
                          items={[{ value: "none", label: "— None —" }, ...rooms.map(r => ({ value: r.id, label: r.name }))]}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Assign room" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— None —</SelectItem>
                            {rooms.map((r) => (
                              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
            {!selected && (
              <p className="py-8 text-center text-sm text-slate-400">
                Click a cell to assign subject, teacher &amp; room. Drag the grip
                to swap periods.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

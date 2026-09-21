"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Trash2, X, CalendarRange } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  assignTeacherPeriod,
  toggleTeacherOpen,
  unassignTeacherPeriod,
  type AssignmentRole,
} from "@/app/admin/assign/actions";
import { isPeriodAllowed, type ClassPeriodRule } from "@/lib/class-period-rules";
import { DAY_ORDER, PERIOD_ORDER, TIFFIN_AFTER_PERIOD } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  DAY_LABELS,
  type ClassRow,
  type RoomRow,
  type RoutineRow,
  type SectionRow,
  type SubjectRow,
  type TeacherRow,
  type TeacherSubjectRow,
} from "@/lib/types";

interface Props {
  teachers: TeacherRow[];
  sections: SectionRow[];
  classes: ClassRow[];
  subjects: SubjectRow[];
  rooms: RoomRow[];
  teacherSubjects: TeacherSubjectRow[];
  routines: RoutineRow[];
  rules: ClassPeriodRule[];
  initialTeacherId: string | null;
}

interface CellTarget {
  day: number;
  period: number;
}

const emptyForm = {
  classId: "",
  sectionId: "",
  subjectId: "",
  roomId: "",
};

export function AssignBuilder({
  teachers,
  sections,
  classes,
  subjects,
  rooms,
  teacherSubjects,
  routines,
  rules,
  initialTeacherId,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [teacherId, setTeacherId] = useState<string | null>(initialTeacherId);
  const [search, setSearch] = useState("");
  const [teachersState, setTeachersState] = useState<TeacherRow[]>(teachers);
  const [target, setTarget] = useState<CellTarget | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [roleChoice, setRoleChoice] = useState<{
    occupiedBy: string;
  } | null>(null);
  const [removing, setRemoving] = useState<{
    day: number;
    period: number;
    role: AssignmentRole;
    label: string;
  } | null>(null);

  const classMap = useMemo(
    () => new Map(classes.map((c) => [c.id, c.name])),
    [classes],
  );
  const subjectMap = useMemo(
    () => new Map(subjects.map((s) => [s.id, s])),
    [subjects],
  );
  const roomMap = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const sectionLabel = useMemo(
    () =>
      new Map(
        sections.map((s) => [
          s.id,
          `${classMap.get(s.class_id) ?? "—"} — ${s.name}`,
        ]),
      ),
    [sections, classMap],
  );

  const subjectsByTeacher = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const ts of teacherSubjects) {
      if (!map.has(ts.teacher_id)) map.set(ts.teacher_id, new Set());
      map.get(ts.teacher_id)!.add(ts.subject_id);
    }
    return map;
  }, [teacherSubjects]);

  const teacher = teachersState.find((t) => t.id === teacherId) ?? null;

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teachersState;
    return teachersState.filter(
      (t) =>
        t.full_name.toLowerCase().includes(q) ||
        t.teacher_code.toLowerCase().includes(q),
    );
  }, [teachersState, search]);

  /** This teacher's own cells, keyed "day:period". */
  const ownCells = useMemo(() => {
    const map = new Map<string, RoutineRow>();
    if (!teacherId) return map;
    for (const r of routines) {
      if (r.teacher_id !== teacherId) continue;
      map.set(`${r.day}:${r.period_number}`, r);
    }
    return map;
  }, [routines, teacherId]);

  /** Seat occupancy for every section cell, keyed "sectionId:day:period". */
  const occupancy = useMemo(() => {
    const map = new Map<string, { primary?: RoutineRow; tag?: RoutineRow }>();
    for (const r of routines) {
      const key = `${r.section_id}:${r.day}:${r.period_number}`;
      let cell = map.get(key);
      if (!cell) map.set(key, (cell = {}));
      if (r.is_tag) cell.tag = r;
      else cell.primary = r;
    }
    return map;
  }, [routines]);

  const weeklyCount = ownCells.size;

  // Sections whose class actually runs the targeted period, annotated with
  // whether a seat is still free there.
  const sectionOptions = useMemo(() => {
    if (!target) return [];
    return sections
      .filter((s) => isPeriodAllowed(rules, s.class_id, target.day, target.period))
      .map((s) => {
        const cell = occupancy.get(`${s.id}:${target.day}:${target.period}`);
        const taken = (cell?.primary ? 1 : 0) + (cell?.tag ? 1 : 0);
        return {
          section: s,
          label: sectionLabel.get(s.id) ?? s.name,
          taken,
          full: taken >= 2,
        };
      })
      .sort((a, b) => a.taken - b.taken || a.label.localeCompare(b.label));
  }, [sections, rules, target, occupancy, sectionLabel]);

  const sectionsForClass = useMemo(
    () => sectionOptions.filter((o) => o.section.class_id === form.classId),
    [sectionOptions, form.classId],
  );

  const classOptions = useMemo(() => {
    const ids = new Set(sectionOptions.map((o) => o.section.class_id));
    return classes.filter((c) => ids.has(c.id));
  }, [classes, sectionOptions]);

  // All subjects are assignable regardless of the teacher's specialty list —
  // the admin picks what the class period actually is. A teacher's own subjects
  // are surfaced first so specialties are easy to spot.
  const subjectOptions = useMemo(() => {
    if (!teacher) return subjects;
    const owned = subjectsByTeacher.get(teacher.id);
    if (!owned) return subjects;
    const own = subjects.filter(
      (s) => s.id === teacher.primary_subject_id || owned.has(s.id),
    );
    const rest = subjects.filter(
      (s) => s.id !== teacher.primary_subject_id && !owned.has(s.id),
    );
    return [...own, ...rest];
  }, [teacher, subjects, subjectsByTeacher]);

  function openCell(day: number, period: number) {
    const chosen = sections.find((s) => isPeriodAllowed(rules, s.class_id, day, period));
    setTarget({ day, period });
    setForm({
      ...emptyForm,
      classId: chosen?.class_id ?? "",
      subjectId: teacher?.primary_subject_id ?? "",
    });
  }

  function submit(role?: AssignmentRole, force = false) {
    if (!teacherId || !target) return;
    startTransition(async () => {
      const res = await assignTeacherPeriod({
        teacherId,
        sectionId: form.sectionId,
        day: target.day,
        period: target.period,
        subjectId: form.subjectId || null,
        roomId: form.roomId || null,
        role,
        force,
      });

      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if ("needsRoleChoice" in res) {
        setRoleChoice({ occupiedBy: res.occupiedBy });
        return;
      }
      if ("warnings" in res) {
        const detail = res.warnings.map((w) => w.detail).join(" · ");
        toast.warning(detail, {
          action: {
            label: "Assign anyway",
            onClick: () => submit(role, true),
          },
        });
        return;
      }
      toast.success("Class assigned");
      setRoleChoice(null);
      setTarget(null);
      setForm(emptyForm);
      router.refresh();
    });
  }

  function toggleOpen(t: TeacherRow) {
    startTransition(async () => {
      const res = await toggleTeacherOpen(t.id, !t.is_open_teacher);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setTeachersState((prev) =>
        prev.map((x) =>
          x.id === t.id ? { ...x, is_open_teacher: res.open } : x,
        ),
      );
      toast.success(
        res.open
          ? `${t.full_name} can now teach any subject`
          : `${t.full_name} is restricted to their own subjects again`,
      );
      router.refresh();
    });
  }

  function remove() {
    if (!removing) return;
    startTransition(async () => {
      const res = await unassignTeacherPeriod({
        sectionId:
          ownCells.get(`${removing.day}:${removing.period}`)?.section_id ?? "",
        day: removing.day,
        period: removing.period,
        role: removing.role,
      });
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Class removed");
        setRemoving(null);
        router.refresh();
      }
    });
  }

  const selectedSection = sections.find((s) => s.id === form.sectionId);

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* Teacher rail */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base text-[#1e3a5f]">Teachers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by name or ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="max-h-[520px] space-y-1 overflow-y-auto">
            {filteredTeachers.map((t) => (
              <div
                key={t.id}
                onClick={() => setTeacherId(t.id)}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  t.id === teacherId
                    ? "bg-[#1e3a5f] text-white"
                    : "hover:bg-slate-100",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setTeacherId(t.id)}
                    className="min-w-0 truncate text-left font-medium"
                  >
                    {t.full_name}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleOpen(t);
                    }}
                    title={
                      t.is_open_teacher
                        ? "Open teacher — teach any subject. Click to restrict."
                        : "Fixed teacher. Click to make open — can teach any subject."
                    }
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                      t.is_open_teacher
                        ? "border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200"
                        : t.id === teacherId
                          ? "border-white/40 text-white/80 hover:border-white hover:bg-white/10"
                          : "border-slate-200 text-slate-400 hover:bg-amber-50 hover:text-amber-600",
                    )}
                  >
                    {t.is_open_teacher ? "Open · off" : "Open"}
                  </button>
                </div>
                <p
                  className={cn(
                    "truncate text-xs",
                    t.id === teacherId ? "text-white/70" : "text-slate-500",
                  )}
                >
                  {t.teacher_code} · {t.full_name}
                </p>
              </div>
            ))}
            {filteredTeachers.length === 0 && (
              <p className="text-sm text-slate-400">No teachers match.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Week grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-[#1e3a5f]">
            <CalendarRange className="h-4 w-4" />
            {teacher
              ? `${teacher.full_name} · ${weeklyCount} periods/week`
              : "Pick a teacher"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!teacher ? (
            <p className="text-sm text-slate-400">
              Choose a teacher on the left to see and edit their week.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="w-20" />
                    {PERIOD_ORDER.map((p) => (
                      <th
                        key={p}
                        className="pb-1 text-xs font-medium text-slate-500"
                      >
                        P{p}
                        {p === TIFFIN_AFTER_PERIOD && (
                          <span className="ml-1 text-[10px] text-amber-600">
                            ↓ tiffin
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAY_ORDER.map((d) => (
                    <tr key={d}>
                      <td className="pr-2 text-right text-xs font-medium text-slate-500">
                        {DAY_LABELS[d].slice(0, 3)}
                      </td>
                      {PERIOD_ORDER.map((p) => {
                        const own = ownCells.get(`${d}:${p}`);
                        if (own) {
                          const subject = own.subject_id
                            ? subjectMap.get(own.subject_id)
                            : undefined;
                          const room = own.room_id
                            ? roomMap.get(own.room_id)
                            : undefined;
                          return (
                            <td key={p} className="align-top">
                              <div className="group relative h-full rounded-lg border border-[#0d9488]/40 bg-[#0d9488]/5 p-2">
                                <p className="text-xs font-semibold text-[#1e3a5f]">
                                  {sectionLabel.get(own.section_id) ?? "—"}
                                </p>
                                <p className="text-[11px] text-slate-600">
                                  {subject?.short_name ?? "—"}
                                  {room ? ` · ${room.name}` : ""}
                                </p>
                                {own.is_tag && (
                                  <span className="mt-1 inline-block rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
                                    Tag
                                  </span>
                                )}
                                <button
                                  onClick={() =>
                                    setRemoving({
                                      day: d,
                                      period: p,
                                      role: own.is_tag ? "tag" : "primary",
                                      label:
                                        sectionLabel.get(own.section_id) ?? "—",
                                    })
                                  }
                                  className="absolute right-1 top-1 rounded p-1 opacity-0 transition-opacity hover:bg-red-50 group-hover:opacity-100"
                                  aria-label="Remove this class"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                </button>
                              </div>
                            </td>
                          );
                        }
                        return (
                          <td key={p} className="align-top">
                            <button
                              onClick={() => openCell(d, p)}
                              className="flex h-full min-h-[64px] w-full items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 transition-colors hover:border-[#0d9488] hover:bg-[#0d9488]/5 hover:text-[#0d9488]"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign dialog */}
      <Dialog
        open={!!target}
        onOpenChange={(o) => {
          if (!o) {
            setTarget(null);
            setForm(emptyForm);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {target
                ? `Assign · ${DAY_LABELS[target.day]} period ${target.period}`
                : "Assign"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Class</Label>
              <Select
                value={form.classId}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, classId: v ?? "", sectionId: "", roomId: "" }))
                }
                items={classOptions.map((c) => ({ value: c.id, label: c.name }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {classOptions.length === 0 && (
                <p className="text-xs text-amber-600">
                  No class runs this period.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Section</Label>
              <Select
                value={form.sectionId}
                onValueChange={(v) => {
                  const sid = v ?? "";
                  const sec = sections.find((s) => s.id === sid);
                  setForm((f) => ({
                    ...f,
                    sectionId: sid,
                    roomId: sec?.room_id ?? "",
                  }));
                }}
                items={sectionsForClass.map((o) => ({
                  value: o.section.id,
                  label: o.label,
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  {sectionsForClass.map((o) => (
                    <SelectItem key={o.section.id} value={o.section.id}>
                      {o.section.name}
                      {o.full
                        ? " — full (2 teachers)"
                        : o.taken === 1
                          ? " — 1 teacher already"
                          : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Subject</Label>
              <Select
                value={form.subjectId}
                onValueChange={(v) => setForm((f) => ({ ...f, subjectId: v ?? "" }))}
                items={subjectOptions.map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjectOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Room</Label>
              <Select
                value={form.roomId}
                onValueChange={(v) => setForm((f) => ({ ...f, roomId: v ?? "" }))}
                items={rooms.map((r) => ({ value: r.id, label: r.name }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                      {selectedSection?.room_id === r.id ? " (section room)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setTarget(null);
                setForm(emptyForm);
              }}
            >
              <X className="h-4 w-4" /> Cancel
            </Button>
            <Button
              onClick={() => submit()}
              disabled={pending || !form.sectionId}
              className="bg-[#0d9488] hover:bg-[#0b7a70]"
            >
              {pending ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Occupied-cell choice */}
      <AlertDialog
        open={!!roleChoice}
        onOpenChange={(o) => !o && setRoleChoice(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>That period already has a teacher</AlertDialogTitle>
            <AlertDialogDescription>
              {roleChoice?.occupiedBy} already teaches this period. You can add{" "}
              {teacher?.full_name ?? "this teacher"} as a second, parallel class
              (like a religion group, with its own room), or replace{" "}
              {roleChoice?.occupiedBy}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => submit("primary")}
              disabled={pending}
            >
              Replace {roleChoice?.occupiedBy}
            </Button>
            <AlertDialogAction
              onClick={() => submit("tag")}
              className="bg-[#0d9488] hover:bg-[#0b7a70]"
            >
              Add as 2nd teacher
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove confirm */}
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this class?</AlertDialogTitle>
            <AlertDialogDescription>
              {teacher?.full_name} will no longer teach {removing?.label} in{" "}
              {removing ? DAY_LABELS[removing.day] : ""} period{" "}
              {removing?.period}. The period stays in the routine if another
              teacher still holds it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

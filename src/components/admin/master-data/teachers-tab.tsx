"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Check, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { createTeacher, updateTeacher, deleteTeacher } from "@/app/admin/master-data/actions";
import { cn } from "@/lib/utils";
import type { TeacherRow, SubjectRow, TeacherSubjectRow } from "@/lib/types";

interface Props {
  teachers: TeacherRow[];
  subjects: SubjectRow[];
  teacherSubjects: TeacherSubjectRow[];
}

interface FormState {
  teacherCode: string;
  fullName: string;
  shortName: string;
  isOpenTeacher: boolean;
  primarySubjectId: string;
  subjectIds: string[];
}

const emptyForm: FormState = {
  teacherCode: "",
  fullName: "",
  shortName: "",
  isOpenTeacher: false,
  primarySubjectId: "",
  subjectIds: [],
};

export function TeachersTab({ teachers, subjects, teacherSubjects }: Props) {
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleting, setDeleting] = useState<TeacherRow | null>(null);
  const [pending, startTransition] = useTransition();

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

  function toggleSubject(id: string) {
    setForm((f) => ({
      ...f,
      subjectIds: f.subjectIds.includes(id)
        ? f.subjectIds.filter((s) => s !== id)
        : [...f.subjectIds, id],
    }));
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(t: TeacherRow) {
    setEditingId(t.id);
    setForm({
      teacherCode: t.teacher_code,
      fullName: t.full_name,
      shortName: t.short_name,
      isOpenTeacher: t.is_open_teacher,
      primarySubjectId: t.primary_subject_id ?? "",
      subjectIds: subjectsByTeacher.get(t.id) ?? [],
    });
    setFormOpen(true);
  }

  function save() {
    startTransition(async () => {
      const payload = {
        teacherCode: form.teacherCode,
        fullName: form.fullName,
        shortName: form.shortName,
        isOpenTeacher: form.isOpenTeacher,
        primarySubjectId: form.primarySubjectId || null,
        subjectIds: form.subjectIds,
      };
      const res = editingId
        ? await updateTeacher(editingId, payload)
        : await createTeacher(payload);
      if (res.error) toast.error(res.error);
      else {
        toast.success(editingId ? "Teacher updated" : "Teacher added");
        setFormOpen(false);
      }
    });
  }

  function handleDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const res = await deleteTeacher(deleting.id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Teacher deleted");
        setDeleting(null);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Teachers</CardTitle>
        <Button onClick={openCreate} className="bg-[#0d9488] hover:bg-[#0b7a70]">
          <Plus className="h-4 w-4" /> Add Teacher
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by name, short name or ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="space-y-2">
          {filtered.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-[#1e3a5f]">{t.full_name}</p>
                  {t.is_open_teacher && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Open</span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {t.teacher_code} · {t.short_name}
                  {(subjectsByTeacher.get(t.id) ?? []).length > 0 &&
                    ` · ${(subjectsByTeacher.get(t.id) ?? []).map((id) => subjectMap[id]?.short_name).filter(Boolean).join(", ")}`}
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(t)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setDeleting(t)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-sm text-slate-400">No teachers found.</p>}
        </div>
      </CardContent>

      {/* Add / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit teacher" : "Add teacher"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Teacher ID *</Label>
                <Input
                  placeholder="T001"
                  value={form.teacherCode}
                  onChange={(e) => setForm({ ...form, teacherCode: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Short name *</Label>
                <Input
                  placeholder="e.g. MRS"
                  value={form.shortName}
                  onChange={(e) => setForm({ ...form, shortName: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Full name *</Label>
              <Input
                placeholder="Full name"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Primary subject</Label>
              <Select
                value={form.primarySubjectId}
                onValueChange={(v) => setForm({ ...form, primarySubjectId: v ?? "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Subjects taught</Label>
              {subjects.length === 0 ? (
                <p className="text-xs text-slate-400">Add subjects first.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {subjects.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSubject(s.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        form.subjectIds.includes(s.id)
                          ? "border-[#0d9488] bg-[#0d9488]/10 text-[#0b7a70]"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {s.short_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isOpenTeacher}
                onChange={(e) => setForm({ ...form, isOpenTeacher: e.target.checked })}
              />
              Open teacher (can teach any subject)
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              <X className="h-4 w-4" /> Cancel
            </Button>
            <Button onClick={save} disabled={pending} className="bg-[#0d9488] hover:bg-[#0b7a70]">
              {pending ? "Saving…" : <><Check className="h-4 w-4" /> Save</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete teacher?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

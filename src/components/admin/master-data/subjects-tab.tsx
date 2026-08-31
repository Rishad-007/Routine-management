"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { createSubject, updateSubject, deleteSubject } from "@/app/admin/master-data/actions";
import type { SubjectRow } from "@/lib/types";

export function SubjectsTab({ subjects }: { subjects: SubjectRow[] }) {
  const [name, setName] = useState("");
  const [short, setShort] = useState("");
  const [editing, setEditing] = useState<SubjectRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editShort, setEditShort] = useState("");
  const [deleting, setDeleting] = useState<SubjectRow | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCreate() {
    startTransition(async () => {
      const res = await createSubject(name, short);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Subject added");
        setName("");
        setShort("");
      }
    });
  }

  function handleUpdate() {
    if (!editing) return;
    startTransition(async () => {
      const res = await updateSubject(editing.id, editName, editShort);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Subject updated");
        setEditing(null);
      }
    });
  }

  function handleDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const res = await deleteSubject(deleting.id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Subject deleted");
        setDeleting(null);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subjects</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Name (e.g. Mathematics)" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
          <Input placeholder="Short (e.g. Math)" value={short} onChange={(e) => setShort(e.target.value)} className="w-28" />
          <Button onClick={handleCreate} disabled={pending} className="bg-[#0d9488] hover:bg-[#0b7a70]">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>

        <div className="space-y-2">
          {subjects.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
              {editing?.id === s.id ? (
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="max-w-xs" />
                  <Input value={editShort} onChange={(e) => setEditShort(e.target.value)} className="w-28" />
                  <Button size="sm" onClick={handleUpdate} disabled={pending}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-[#1e3a5f]">{s.name}</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{s.short_name}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditing(s);
                        setEditName(s.name);
                        setEditShort(s.short_name);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleting(s)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
          {subjects.length === 0 && <p className="text-sm text-slate-400">No subjects yet.</p>}
        </div>
      </CardContent>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete subject?</AlertDialogTitle>
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

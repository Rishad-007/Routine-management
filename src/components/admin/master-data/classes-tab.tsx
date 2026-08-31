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
import { createClass, updateClass, deleteClass } from "@/app/admin/master-data/actions";
import type { ClassRow } from "@/lib/types";

export function ClassesTab({ classes }: { classes: ClassRow[] }) {
  const [name, setName] = useState("");
  const [sort, setSort] = useState(0);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<ClassRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editSort, setEditSort] = useState(0);
  const [deleting, setDeleting] = useState<ClassRow | null>(null);

  function handleCreate() {
    startTransition(async () => {
      const res = await createClass(name, sort);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Class added");
        setName("");
      }
    });
  }

  function handleUpdate() {
    if (!editing) return;
    startTransition(async () => {
      const res = await updateClass(editing.id, editName, editSort);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Class updated");
        setEditing(null);
      }
    });
  }

  function handleDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const res = await deleteClass(deleting.id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Class deleted");
        setDeleting(null);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Classes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Class name (e.g. Class 6)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-xs"
          />
          <Input
            type="number"
            placeholder="Order"
            value={sort}
            onChange={(e) => setSort(Number(e.target.value))}
            className="w-24"
          />
          <Button onClick={handleCreate} disabled={pending} className="bg-[#0d9488] hover:bg-[#0b7a70]">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>

        <div className="space-y-2">
          {classes.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
              {editing?.id === c.id ? (
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="max-w-xs"
                  />
                  <Input
                    type="number"
                    value={editSort}
                    onChange={(e) => setEditSort(Number(e.target.value))}
                    className="w-24"
                  />
                  <Button size="sm" onClick={handleUpdate} disabled={pending}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div>
                    <p className="font-medium text-[#1e3a5f]">{c.name}</p>
                    <p className="text-xs text-slate-500">Order: {c.sort_order}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditing(c);
                        setEditName(c.name);
                        setEditSort(c.sort_order);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleting(c)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
          {classes.length === 0 && (
            <p className="text-sm text-slate-400">No classes yet. Add one above.</p>
          )}
        </div>
      </CardContent>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete class?</AlertDialogTitle>
            <AlertDialogDescription>
              This will also delete its sections. This action cannot be undone.
            </AlertDialogDescription>
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

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, X, Ban, RotateCcw } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createClass,
  updateClass,
  deleteClass,
  setClassSuspension,
} from "@/app/admin/master-data/actions";
import type { ClassRow } from "@/lib/types";

export function ClassesTab({ classes }: { classes: ClassRow[] }) {
  const [name, setName] = useState("");
  const [sort, setSort] = useState(0);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<ClassRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editSort, setEditSort] = useState(0);
  const [deleting, setDeleting] = useState<ClassRow | null>(null);
  const [suspending, setSuspending] = useState<ClassRow | null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  function openSuspend(c: ClassRow) {
    setSuspending(c);
    setSuspendReason(c.suspension_reason ?? "");
  }

  function handleSuspend() {
    if (!suspending) return;
    startTransition(async () => {
      const res = await setClassSuspension(
        suspending.id,
        true,
        suspendReason,
      );
      if (res?.error) toast.error(res.error);
      else {
        toast.success(`${suspending.name} suspended`);
        setSuspending(null);
      }
    });
  }

  function handleResume(c: ClassRow) {
    startTransition(async () => {
      const res = await setClassSuspension(c.id, false, "");
      if (res?.error) toast.error(res.error);
      else toast.success(`${c.name} resumed`);
    });
  }

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
            <div
              key={c.id}
              className={
                c.is_suspended
                  ? "flex items-center justify-between rounded-lg border border-red-200 bg-red-50/60 px-3 py-2"
                  : "flex items-center justify-between rounded-lg border px-3 py-2"
              }
            >
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
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-[#1e3a5f]">
                      {c.name}
                      {c.is_suspended && (
                        <span className="inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          <Ban className="h-3 w-3" /> Suspended
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      Order: {c.sort_order}
                      {c.is_suspended && c.suspension_reason
                        ? ` · ${c.suspension_reason}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {c.is_suspended ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => handleResume(c)}
                        className="text-teal-700 hover:bg-teal-50"
                        title={`Resume ${c.name}`}
                      >
                        <RotateCcw className="h-4 w-4" /> Resume
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => openSuspend(c)}
                        className="text-red-600 hover:bg-red-50"
                        title={`Suspend ${c.name}`}
                      >
                        <Ban className="h-4 w-4" /> Suspend
                      </Button>
                    )}
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

      <Dialog
        open={!!suspending}
        onOpenChange={(o) => !o && setSuspending(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend {suspending?.name}?</DialogTitle>
            <DialogDescription>
              Every section of this class stops running. Its teachers are freed
              and appear as available in Free Teachers and Adjust. The weekly
              routine is kept, so resuming restores it untouched.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-500" htmlFor="suspension-reason">
              Reason (optional)
            </label>
            <Input
              id="suspension-reason"
              placeholder="e.g. Course complete / exams done"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSuspending(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSuspend}
              disabled={pending}
              className="bg-red-600 hover:bg-red-700"
            >
              <Ban className="h-4 w-4" /> Suspend class
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
